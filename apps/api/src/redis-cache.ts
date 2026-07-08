import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisDisabled = false;
const NULL_SENTINEL = { __cacheNull__: true };

function getRedisConnectionConfig(): { url: string } | { host: string; port: number } {
  const url = process.env.REDIS_URL;
  if (url) {
    return { url };
  }

  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

export async function getRedisClient(): Promise<Redis | null> {
  if (redisDisabled) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  const config = getRedisConnectionConfig();
  redisClient = 'url' in config ? new Redis(config.url) : new Redis(config.port, config.host);
  redisClient.on('error', (error) => {
    console.error(`[Redis] ${error.message}`);
  });

  try {
    await redisClient.ping();
    return redisClient;
  } catch {
    redisDisabled = true;
    redisClient.disconnect();
    redisClient = null;
    return null;
  }
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  const raw = await client.get(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }
  await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDelete(key: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }
  await client.del(key);
}

export async function cacheHasKey(key: string): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) {
    return false;
  }
  return (await client.exists(key)) > 0;
}

export async function rememberJson<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T> | T,
): Promise<{ value: T; hit: boolean }> {
  const hitValue = await cacheGetJson<T>(key);
  if (hitValue !== null) {
    return { value: hitValue, hit: true };
  }

  const value = await loader();
  await cacheSetJson(key, value, ttlSeconds);
  return { value, hit: false };
}

export async function rememberJsonNullable<T>(
  key: string,
  ttlSeconds: number,
  nullTtlSeconds: number,
  loader: () => Promise<T | null> | T | null,
): Promise<{ value: T | null; hit: boolean }> {
  const client = await getRedisClient();
  if (!client) {
    return { value: await loader(), hit: false };
  }

  const raw = await client.get(key);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as T | typeof NULL_SENTINEL;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        '__cacheNull__' in (parsed as Record<string, unknown>)
      ) {
        return { value: null, hit: true };
      }
      return { value: parsed as T, hit: true };
    } catch {
      // Bad cache payload is treated as miss and rewritten by loader.
    }
  }

  const value = await loader();
  if (value === null) {
    await client.set(key, JSON.stringify(NULL_SENTINEL), 'EX', nullTtlSeconds);
    return { value: null, hit: false };
  }

  await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  return { value, hit: false };
}

export async function cacheScanKeys(pattern: string, limit = 100): Promise<string[]> {
  const client = await getRedisClient();
  if (!client) {
    return [];
  }

  let cursor = '0';
  const keys: string[] = [];
  do {
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    for (const key of batch) {
      keys.push(key);
      if (keys.length >= limit) {
        return keys;
      }
    }
  } while (cursor !== '0');

  return keys;
}

export async function cacheCountByPattern(pattern: string): Promise<number> {
  const client = await getRedisClient();
  if (!client) {
    return 0;
  }

  let cursor = '0';
  let count = 0;
  do {
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;
    count += batch.length;
  } while (cursor !== '0');

  return count;
}

export async function getIdempotencySnapshot<T>(idempotencyKey: string): Promise<T | null> {
  return cacheGetJson<T>(`idem:${idempotencyKey}`);
}

export async function setIdempotencySnapshot(idempotencyKey: string, payload: unknown): Promise<void> {
  await cacheSetJson(`idem:${idempotencyKey}`, payload, 24 * 60 * 60);
}
