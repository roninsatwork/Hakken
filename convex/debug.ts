import { internalMutation } from "./_generated/server";

export const enableAllModels = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allModels = await ctx.db.query("aiModels").take(10000);
    for (const model of allModels) {
      await ctx.db.patch(model._id, { isEnabled: true });
    }
    // Set a default
    const geminiPro = allModels.find(m => m.modelId === "gemini-3.1-pro-preview");
    if (geminiPro) {
      await ctx.db.patch(geminiPro._id, { isDefault: true });
    }
    return true;
  },
});
