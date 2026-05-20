import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Strict Message Upload Gating (Option B)", () => {
  test("Message with no attachments succeeds", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "visitor@sonae.com",
        role: "USER"
      });
    });

    const threadId = await t.run(async (ctx) => {
      return await ctx.db.insert("threads", {
        userId,
        title: "Test Thread",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    const authedClient = t.withIdentity({ subject: userId });

    const success = await authedClient.mutation(api.chat.sendMessage, {
      threadId,
      content: "Hello standard text message!"
    });
    expect(success).toBe(true);

    const messages = await authedClient.query(api.chat.getMessages, { threadId });
    expect(messages?.length).toBe(1);
    expect(messages?.[0].content).toBe("Hello standard text message!");
  });

  test("Message with valid image attachment succeeds", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "visitor@sonae.com",
        role: "USER"
      });
    });

    const threadId = await t.run(async (ctx) => {
      return await ctx.db.insert("threads", {
        userId,
        title: "Test Thread",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    // Upload a valid image blob
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["mock-image-bytes"], { type: "image/png" }));
      await ctx.db.insert("mockStorageMetadata", {
        storageId: id,
        size: 100,
        contentType: "image/png",
      });
      return id;
    });

    const authedClient = t.withIdentity({ subject: userId });

    const success = await authedClient.mutation(api.chat.sendMessage, {
      threadId,
      content: "Here is a valid photo!",
      fileIds: [storageId]
    });
    expect(success).toBe(true);

    const messages = await authedClient.query(api.chat.getMessages, { threadId });
    expect(messages?.length).toBe(1);
    expect(messages?.[0].attachments).toEqual([storageId]);
  });

  test("Message with non-existent storage ID is strictly rejected", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "visitor@sonae.com",
        role: "USER"
      });
    });

    const threadId = await t.run(async (ctx) => {
      return await ctx.db.insert("threads", {
        userId,
        title: "Test Thread",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    const authedClient = t.withIdentity({ subject: userId });

    // Generate a valid-looking fake ID or pass a mocked storage ID format
    const fakeStorageId = "123" as any; 

    await expect(
      authedClient.mutation(api.chat.sendMessage, {
        threadId,
        content: "Attempting fake ID!",
        fileIds: [fakeStorageId]
      })
    ).rejects.toThrow();
  });

  test("Message with invalid file type (non-image) is rejected and deleted", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "visitor@sonae.com",
        role: "USER"
      });
    });

    const threadId = await t.run(async (ctx) => {
      return await ctx.db.insert("threads", {
        userId,
        title: "Test Thread",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    // Store a plain text blob instead of an image
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["import os; os.system('malicious')"], { type: "text/plain" }));
      await ctx.db.insert("mockStorageMetadata", {
        storageId: id,
        size: 50,
        contentType: "text/plain",
      });
      return id;
    });

    const authedClient = t.withIdentity({ subject: userId });

    await expect(
      authedClient.mutation(api.chat.sendMessage, {
        threadId,
        content: "Sending malicious text file!",
        fileIds: [storageId]
      })
    ).rejects.toThrow("Invalid file type: strictly images only are allowed");

  });

  test("Message with file exceeding 1MB limit is rejected and deleted", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "visitor@sonae.com",
        role: "USER"
      });
    });

    const threadId = await t.run(async (ctx) => {
      return await ctx.db.insert("threads", {
        userId,
        title: "Test Thread",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    // Create an oversized blob (larger than 1MB)
    const largeBlobContent = "x".repeat(1024 * 1024 + 10);
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([largeBlobContent], { type: "image/jpeg" }));
      await ctx.db.insert("mockStorageMetadata", {
        storageId: id,
        size: 1024 * 1024 + 10,
        contentType: "image/jpeg",
      });
      return id;
    });

    const authedClient = t.withIdentity({ subject: userId });

    await expect(
      authedClient.mutation(api.chat.sendMessage, {
        threadId,
        content: "Sending massive image!",
        fileIds: [storageId]
      })
    ).rejects.toThrow("File exceeds the maximum size limit of 1MB");

  });
});
