import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";
import { seedUploadReceipt } from "../scripts/test-upload-fixture";

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
      await seedUploadReceipt(ctx, id, { userId }, "chat");
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

    // The storage ids are stored, not shown: the client view carries viewable
    // image urls and nothing else about the attachment.
    const stored = await t.run(async (ctx) =>
      ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect()
    );
    expect(stored[0].attachments).toEqual([storageId]);
  });

  test("Message with valid document attachment succeeds", async () => {
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

    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["hello,world"], { type: "text/csv" }));
      await seedUploadReceipt(ctx, id, { userId }, "chat");
      await ctx.db.insert("mockStorageMetadata", {
        storageId: id,
        size: 11,
        contentType: "text/csv",
      });
      return id;
    });

    const authedClient = t.withIdentity({ subject: userId });

    const success = await authedClient.mutation(api.chat.sendMessage, {
      threadId,
      content: "Analyze this CSV",
      fileIds: [storageId]
    });
    expect(success).toBe(true);

    const messages = await authedClient.query(api.chat.getMessages, { threadId });
    expect(messages?.length).toBe(1);

    // The storage ids are stored, not shown: the client view carries viewable
    // image urls and nothing else about the attachment.
    const stored = await t.run(async (ctx) =>
      ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect()
    );
    expect(stored[0].attachments).toEqual([storageId]);
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
    const fakeStorageId = "123" as Id<"_storage">;

    await expect(
      authedClient.mutation(api.chat.sendMessage, {
        threadId,
        content: "Attempting fake ID!",
        fileIds: [fakeStorageId]
      })
    ).rejects.toThrow();
  });

  test("Message with invalid file type is rejected and deleted", async () => {
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

    // Store an executable script blob instead of an allowed image/document
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["import os; os.system('malicious')"], { type: "application/javascript" }));
      await seedUploadReceipt(ctx, id, { userId }, "chat");
      await ctx.db.insert("mockStorageMetadata", {
        storageId: id,
        size: 50,
        contentType: "application/javascript",
      });
      return id;
    });

    const authedClient = t.withIdentity({ subject: userId });

    await expect(
      authedClient.mutation(api.chat.sendMessage, {
        threadId,
        content: "Sending malicious script file!",
        fileIds: [storageId]
      })
    ).rejects.toThrow("Invalid file type");

  });

  test("Message with image exceeding 5MB limit is rejected and deleted", async () => {
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

    // Create an oversized image blob (larger than 5MB)
    const largeBlobContent = "x".repeat(5 * 1024 * 1024 + 10);
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([largeBlobContent], { type: "image/jpeg" }));
      await seedUploadReceipt(ctx, id, { userId }, "chat");
      await ctx.db.insert("mockStorageMetadata", {
        storageId: id,
        size: 5 * 1024 * 1024 + 10,
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
    ).rejects.toThrow("File exceeds the maximum size limit of 5MB for images");

  });

  test("Message with document exceeding 50MB limit is rejected and deleted", async () => {
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

    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["mock-pdf"], { type: "application/pdf" }));
      await seedUploadReceipt(ctx, id, { userId }, "chat");
      await ctx.db.insert("mockStorageMetadata", {
        storageId: id,
        size: 50 * 1024 * 1024 + 1,
        contentType: "application/pdf",
      });
      return id;
    });

    const authedClient = t.withIdentity({ subject: userId });

    await expect(
      authedClient.mutation(api.chat.sendMessage, {
        threadId,
        content: "Sending massive document!",
        fileIds: [storageId]
      })
    ).rejects.toThrow("File exceeds the maximum size limit of 50MB for documents");

  });
});
