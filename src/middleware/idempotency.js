import prisma from '../db/connection.js';

/**
 * Idempotency middleware using Prisma
 *
 * How it works:
 * 1. Client sends request with Idempotency-Key header
 * 2. Server checks if key was seen before
 * 3. If yes: Return cached response (don't process again)
 * 4. If no: Process normally, cache response
 */

export const idempotencyMiddleware = async (req, res, next) => {
  // Only apply to POST, PUT, DELETE
  if (!["POST", "PUT", "DELETE"].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.headers["idempotency-key"];

  // If no key provided, proceed normally
  if (!idempotencyKey) {
    return next();
  }

  // Validate key format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(idempotencyKey)) {
    return res.status(400).json({
      error: "Invalid Idempotency-Key format (must be UUID)",
    });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Check if we've seen this key before
    const existing = await prisma.idempotencyKey.findFirst({
      where: {
        idempotency_key: idempotencyKey,
        user_id: userId,
      },
    });

    if (existing) {
      // Duplicate request - return cached response
      console.log(`[Idempotency] Cache hit for key: ${idempotencyKey}`);
      return res.status(existing.response_status || 200).json(existing.response_body);
    }

    // New request - intercept response to cache it
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      // Cache the response asynchronously
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiration

      prisma.idempotencyKey.create({
        data: {
          idempotency_key: idempotencyKey,
          user_id: userId,
          endpoint: req.originalUrl || req.path,
          method: req.method,
          response_status: res.statusCode,
          response_body: data,
          expires_at: expiresAt,
        },
      }).then(() => {
        console.log(`[Idempotency] Cached response for key: ${idempotencyKey}`);
      }).catch((err) => {
        // Ignore duplicate key errors if a race condition happened
        if (err.code !== 'P2002') {
          console.error("Failed to cache response:", err);
        }
      });

      return originalJson(data);
    };

    next();
  } catch (error) {
    console.error("Idempotency check failed:", error);
    // Continue anyway (don't block on cache failure)
    next();
  }
};
