import { createApp } from './app';
import { env } from './config/env';
import { connectDb } from './db';
import { seedDatabase, DEMO } from './seed';
import { ensureCities } from './services/cityService';
import { startCronJobs } from './services/cron';

const app = createApp();

let readyPromise: Promise<void> | null = null;
async function init() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const { memory } = await connectDb();
      if (memory || process.env.SEED === 'true') {
        const r = await seedDatabase({ repair: memory || process.env.SEED === 'true' });
        if (!r.skipped) console.log('[seed] demo data created. Logins:', JSON.stringify(DEMO));
      }
      await ensureCities();
      if (process.env.VERCEL !== '1') {
        startCronJobs();
      }
    })();
  }
  return readyPromise;
}

if (process.env.VERCEL !== '1') {
  init()
    .then(() => {
      const startServer = (retries = 1) => {
        const server = app.listen(env.PORT, () => console.log(`API on :${env.PORT}`));
        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE' && retries > 0) {
            console.warn(`[server] Port ${env.PORT} in use, retrying in 2s…`);
            setTimeout(() => startServer(retries - 1), 2000);
          } else {
            console.error(err);
            process.exit(1);
          }
        });
      };
      startServer();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export default async function handler(req: any, res: any) {
  await init();
  return app(req, res);
}
