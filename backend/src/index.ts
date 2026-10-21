import { createApp } from './app';
import { env } from './config/env';
import { connectDb } from './db';
import { seedDatabase, DEMO } from './seed';
import { ensureCities } from './services/cityService';
import { startCronJobs } from './services/cron';

async function main() {
  const { memory } = await connectDb();
  if (memory || process.env.SEED === 'true') {
    const r = await seedDatabase({ repair: memory || process.env.SEED === 'true' });
    if (!r.skipped) console.log('[seed] demo data created. Logins:', JSON.stringify(DEMO));
  }
  await ensureCities();
  createApp().listen(env.PORT, () => console.log(`API on :${env.PORT}`));
  startCronJobs();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
