import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const testMutation = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      const auditData = {
        enabled: true,
        retentionDays: 30,
        dayOfMonth: 1,
        hourOfDay: 2,
        nextRunTimestamp: 0,
      };
      
      const configRow = await ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", "AUDIT_PURGE_CONFIG")).first();
      let payload = auditData;
      
      if (configRow) {
         // simulate UI fetch
         payload = JSON.parse(configRow.value);
      }
      
      payload.enabled = !payload.enabled;
      
      // try to call updateConfig internally but we can't easily do auth from internal mutation to an authenticated one.
      // let's just observe the payload that the UI is sending
      console.log("PAYLOAD IS", payload);
      return payload;
      
    } catch(e) {
      console.error(e);
      return e;
    }
  }
});
