import { Router } from "express";
import prisma from "../db/connection.js";
import { authGuard } from "../middleware/authGuard.js";

const router = Router();

/**
 * POST /api/play
 *
 * Idempotency middleware ensures:
 * - First request: Plays song, caches response
 * - Duplicate request (same Idempotency-Key): Returns cached response
 * - No double playback, even with network retries
 */
router.post("/play", authGuard, async (req, res) => {
  const { trackId } = req.body;
  const userId = req.user.id;

  try {
    // Verify track exists
    const track = await prisma.song.findUnique({
      where: { id: trackId },
      select: { id: true, title: true, artist: true },
    });

    if (!track) {
      return res.status(404).json({ error: "Track not found" });
    }

    // Log playback (for analytics)
    await prisma.playbackHistory.create({
      data: {
        user_id: userId,
        song_id: trackId,
      },
    });

    // Get audio stream URL
    // This will be constructed properly on the client side using API_BASE,
    // but we return the relative path.
    const streamUrlPath = `/stream/${trackId}`;

    // Send to audio service
    // If this endpoint is called twice with same Idempotency-Key,
    // the second call returns this response from cache (doesn't execute again)
    return res.json({
      success: true,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      streamUrlPath,
      message: "Playback logged",
    });
  } catch (error) {
    console.error("Play error:", error);
    res.status(500).json({ error: "Failed to play track" });
  }
});

export default router;
