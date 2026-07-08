import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

interface DistributedLock {
  acquired: boolean;
  key: string;
  token: string;
  release: () => Promise<void>;
}

const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

let redisClient: Redis | null = null;

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

async function getRedisClient(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }

  const config = getRedisConnectionConfig();
  if ('url' in config) {
    redisClient = new Redis(config.url);
  } else {
    redisClient = new Redis(config.port, config.host);
  }
  redisClient.on('error', (error) => {
    console.error(`[Redis] ${error.message}`);
  });
  await redisClient.ping();
  return redisClient;
}

/**
 * Attempt one Redis NX/PX lock acquisition round.
 * @param key business lock key.
 * @param token unique owner token used for safe release.
 * @param ttlMs lock expiration in milliseconds.
 * @returns true when the caller won the lock.
 */
async function tryAcquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
  const client = await getRedisClient();
  // NX + PX guarantees only one winner and avoids dead locks by ttl expiration.
  const result = await client.set(key, token, 'PX', ttlMs, 'NX');
  return result === 'OK';
}

/**
 * Acquire distributed lock with bounded wait and safe release.
 * @param key lock key, usually composed by business dimension (e.g. shipper + vehicle).
 * @param options ttl/wait/retry controls for contention handling.
 * @returns lock handle with acquired flag and release function.
 */
export async function acquireDistributedLock(
  key: string,
  options?: { ttlMs?: number; waitTimeoutMs?: number; retryIntervalMs?: number },
): Promise<DistributedLock> {
  const ttlMs = options?.ttlMs ?? 10_000;
  const waitTimeoutMs = options?.waitTimeoutMs ?? 2_000;
  const retryIntervalMs = options?.retryIntervalMs ?? 100;
  const token = randomUUID();
  const deadline = Date.now() + waitTimeoutMs;

  while (Date.now() <= deadline) {
    if (await tryAcquireLock(key, token, ttlMs)) {
      return {
        acquired: true,
        key,
        token,
        release: async () => {
          try {
            const client = await getRedisClient();
            // Compare-and-delete by token ensures one request cannot release another request's lock by mistake.
            await client.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
          } catch (error) {
            if (error instanceof Error) {
              console.error(`[Redis] release lock failed: ${error.message}`);
            }
          }
        },
      };
    }

    // Bounded retry avoids one waiting request spinning forever when another request holds the same vehicle lock.
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }

  return {
    acquired: false,
    key,
    token,
    release: async () => {},
  };
}
