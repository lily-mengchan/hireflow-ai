/** Ephemeral client results only; not a second recruitment data store. */
export function createParseCache<T>(clock = () => performance.now()) {
  const cache = new Map<string, { value: T; expires: number }>();
  return {
    get(key: string) {
      const saved = cache.get(key);
      if (!saved || saved.expires <= clock()) { cache.delete(key); return undefined; }
      return structuredClone(saved.value);
    },
    set(key: string, value: T, ttl: number) {
      if (ttl <= 0) return;
      cache.delete(key); cache.set(key, { value: structuredClone(value), expires: clock() + ttl });
      while (cache.size > 20) cache.delete(cache.keys().next().value!);
    },
  };
}
