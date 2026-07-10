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
 * 执行一次 Redis 分布式锁抢占。
 * 功能：基于 SET NX PX 原子语义尝试成为锁持有者。
 * @param key 业务锁键。
 * @param token 锁持有者唯一标识（用于安全释放）。
 * @param ttlMs 锁过期时间（毫秒）。
 * @returns true 表示本次抢锁成功。
 */
async function tryAcquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
  const client = await getRedisClient();
  // NX 保证同一时刻只有一个请求成功，PX 防止异常中断导致死锁长期占用。
  const result = await client.set(key, token, 'PX', ttlMs, 'NX');
  return result === 'OK';
}

/**
 * 获取分布式锁（带等待上限与安全释放）。
 * 功能：在限定时间内重试抢锁，成功后返回可安全释放的锁句柄。
 * @param key 锁键（通常按业务维度组合，例如 shipper + vehicle）。
 * @param options 锁超时、等待窗口、重试间隔配置。
 * @returns 含 acquired 标记与 release 方法的锁对象。
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
            // 仅允许“持锁 token”删除锁，防止误删其他请求持有的锁。
            await client.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
          } catch (error) {
            if (error instanceof Error) {
              console.error(`[Redis] release lock failed: ${error.message}`);
            }
          }
        },
      };
    }

    // 有界重试避免请求无限自旋，降低并发争抢时的 CPU 空转。
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }

  return {
    acquired: false,
    key,
    token,
    release: async () => {},
  };
}
