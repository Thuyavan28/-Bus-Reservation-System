/**
 * Tiny in-process TTL cache for data that rarely changes (cities, buses, operators, cached route distances).
 * Every database round trip to a remote Atlas cluster costs ~100 ms, so a search that used to make ~8 of
 * them now makes ~2. Concurrent callers for the same key share one in-flight load.
 */
interface Entry<T> { value?: T; at: number; pending?: Promise<T> }

export function createMemo<T>(ttlMs: number, max = 500) {
  const store = new Map<string, Entry<T>>();
  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const e = store.get(key);
      const now = Date.now();
      if (e?.value !== undefined && now - e.at < ttlMs) return e.value;
      if (e?.pending) return e.pending;
      const pending = load().then((v) => {
        if (store.size >= max) store.delete(store.keys().next().value as string);
        store.set(key, { value: v, at: Date.now() });
        return v;
      }).catch((err) => { store.delete(key); throw err; });
      store.set(key, { ...(e ?? { at: 0 }), pending });
      return pending;
    },
    delete(key: string) { store.delete(key); },
    clear() { store.clear(); },
  };
}
