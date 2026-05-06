import fs from 'fs';
import { ApifyClient } from 'apify-client';

async function main() {
  let env = "";
  if (fs.existsSync('.env')) env += fs.readFileSync('.env', 'utf8') + "\n";
  if (fs.existsSync('.env.local')) env += fs.readFileSync('.env.local', 'utf8') + "\n";
  const tokenMatch = env.match(/APIFY_API_TOKEN=(.*)/);
  const token = tokenMatch ? tokenMatch[1].replace(/['"]/g, '').trim() : null;

  if (!token) throw new Error("No token");

  const client = new ApifyClient({ token });
  const run = await client.run('QX89dAkaaCRf0U1xI').get();
  console.log("Status:", run.status);
  if (run.stats) {
    console.log("Items:", run.stats.itemCount);
  }
}
main().catch(console.error);
