import { Router } from "express";
import NodeID3 from "node-id3";
import prisma from "../db/connection.js";
import { authGuard } from "../middleware/authGuard.js";
import { getOrCompute } from "../db/redis.js";

const router = Router();

router.get("/", authGuard, async (req, res) => {
  try {
    const { search } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const cacheKey = `search:songs:${search ? encodeURIComponent(search.trim()) : "all"}:${page}:${limit}`;

    const cachedData = await getOrCompute(cacheKey, async () => {
      let whereClause = {};

      if (search && search.trim()) {
        const term = search.trim();
        whereClause = {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { artist: { contains: term, mode: "insensitive" } },
            { album: { contains: term, mode: "insensitive" } },
          ],
        };
      }

      const [songs, total] = await Promise.all([
        prisma.song.findMany({
          where: whereClause,
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            artist: true,
            album: true,
            year: true,
            duration_s: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
        }),
        prisma.song.count({ where: whereClause })
      ]);

      return { songs, total };
    }, 3600 * 24); // Cache songs list for 24 hours

    return res.status(200).json({
      data: cachedData.songs,
      total: cachedData.total,
      page,
      totalPages: Math.ceil(cachedData.total / limit)
    });
  } catch (err) {
    console.error("Song search error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/songs/:id/cover
 * Returns embedded cover art image from the MP3's ID3 APIC tag.
 * Cached with Cache-Control and ETag since cover art never changes.
 */
router.get("/:id/cover", authGuard, async (req, res) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params.id },
      select: { file_path: true },
    });

    if (!song) {
      return res.status(404).json({ error: "Song not found" });
    }

    const tags = NodeID3.read(song.file_path) || {};
    const image = tags.image;

    if (!image || !image.imageBuffer) {
      return res.status(404).json({ error: "No cover art available" });
    }

    const etag = `"cover-${req.params.id}"`;

    // Check If-None-Match for 304 response
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    res.set({
      "Content-Type": image.mime || "image/jpeg",
      "Content-Length": image.imageBuffer.length,
      "Cache-Control": "public, max-age=86400",
      ETag: etag,
    });

    return res.send(image.imageBuffer);
  } catch (err) {
    console.error("Cover art error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
