import path from 'path';
import os from 'os';
import mongoose from 'mongoose';
import { env } from './config/env';

let memoryServer: { stop: () => Promise<boolean> } | null = null;

/** True when no real Atlas host is configured; the app then runs with a persistent local MongoDB. */
export function wantsMemoryDb() {
  return env.USE_MEMORY_DB === 'true' || !env.MONGODB_URI || env.MONGODB_URI.includes('<cluster-host>');
}

export async function connectDb(): Promise<{ memory: boolean }> {
  let uri = env.MONGODB_URI;
  let memory = wantsMemoryDb();
  if (!memory) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
      return { memory: false };
    } catch (err: any) {
      console.warn(`[db] Atlas connection failed (${err?.message || err}) -> falling back to local persistent database.`);
      memory = true;
    }
  }

  // Fallback to local persistent MongoDB
  const dbPath = path.join(os.homedir(), '.busgo-db');
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const rs = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ dbPath, storageEngine: 'wiredTiger' }],
  });
  memoryServer = rs;
  uri = rs.getUri('busgo');
  console.warn(`[db] Using persistent local MongoDB at ${dbPath}. Data is preserved across restarts.`);
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  return { memory: true };
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
