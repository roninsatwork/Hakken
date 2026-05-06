import { ApifyClient } from 'apify-client';
import fs from 'fs';

async function main() {
  let env = "";
  if (fs.existsSync('.env')) env += fs.readFileSync('.env', 'utf8') + "\n";
  if (fs.existsSync('.env.local')) env += fs.readFileSync('.env.local', 'utf8') + "\n";
  const tokenMatch = env.match(/APIFY_API_TOKEN=(.*)/);
  const token = tokenMatch ? tokenMatch[1].replace(/['"]/g, '').trim() : null;

  if (!token) throw new Error("No token");

  const client = new ApifyClient({ token });
  const run = await client.run('QX89dAkaaCRf0U1xI').get();
  const dataset = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
  
  console.log(JSON.stringify(dataset.items[0], null, 2));
}
main().catch(console.error);
