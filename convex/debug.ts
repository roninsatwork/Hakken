import { query } from "./_generated/server";
export const checkFrontendQuery = query({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query("companies").collect();
    if (companies.length === 0) return "No companies";
    const acme = companies[0]._id;
    
    // Simulate what getCompanyMetrics does
    const records = await ctx.db
       .query("companyMetrics")
       .withIndex("by_company_date", (q) => q.eq("companyId", acme))
       .collect();
       
    records.sort((a,b) => b.date.localeCompare(a.date)); 
    const recent = records.slice(0, 30).reverse(); 
    
    let totalMessages = 0;
    let totalTokens = 0;
    let totalCostGBP = 0;
    
    recent.forEach(r => {
       totalMessages += r.totalMessages;
       totalTokens += r.totalTokens;
       totalCostGBP += r.costGBP;
    });
    
    return {
       timeline: recent.map(r => ({
          date: r.date.split('-').slice(1).join('/'),
          messages: r.totalMessages,
          cost: Number(r.costGBP.toFixed(4))
       })),
       aggregates: {
          totalMessages,
          totalTokens,
          totalCostGBP: Number(totalCostGBP.toFixed(2)),
          totalCostGBPRaw: totalCostGBP
       }
    };
  }
});
