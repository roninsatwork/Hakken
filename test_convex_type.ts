import { defineSchema, defineTable } from "convex/server";
const schema = defineSchema({
  knowledgeChunks: defineTable({
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 768,
    filterFields: ["companyId", "agentId"],
  })
});
