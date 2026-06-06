import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err) => {
  console.error("Redis connection error:", err);
});

let isConnected = false;

async function connectRedis() {
  try {
    await redisClient.connect();
    isConnected = true;
    console.log("Successfully connected to Redis");
  } catch (err) {
    console.error("Could not connect to Redis, caching will be disabled:", err);
    isConnected = false;
  }
}

// Connect asynchronously
connectRedis();

export async function getOrCompute(key, computeFn, ttlSeconds = 300) {
  if (!isConnected) {
    return await computeFn();
  }

  try {
    const cachedValue = await redisClient.get(key);
    if (cachedValue !== null) {
      return JSON.parse(cachedValue);
    }

    const value = await computeFn();

    // Store in cache
    if (value !== undefined && value !== null) {
      await redisClient.set(key, JSON.stringify(value), {
        EX: ttlSeconds,
      });
    }

    return value;
  } catch (err) {
    console.error(
      `Cache error for key ${key}, falling back to compute function:`,
      err,
    );
    return await computeFn();
  }
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidateCache(key) {
  if (!isConnected) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error(`Failed to delete key ${key} from Redis:`, err);
  }
}

/**
 * Invalidate keys matching a pattern.
 */
export async function invalidateCachePattern(pattern) {
  if (!isConnected) return;
  try {
    // Note: KEYS can be slow on huge datasets, but for this app it's perfectly fine
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (err) {
    console.error(`Failed to delete pattern ${pattern} from Redis:`, err);
  }
}

export { redisClient };
