import { Router } from "express";
import prisma from "../db/connection.js";
import { authGuard } from "../middleware/authGuard.js";
import {
  getOrCompute,
  invalidateCache,
  invalidateCachePattern,
} from "../db/redis.js";

const router = Router();

// ── Helper: verify playlist belongs to authenticated user ────
async function getUserPlaylist(playlistId, userId) {
  return prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
  });
}

router.post("/batch-sync", authGuard, async (req, res) => {
  const { operations } = req.body;
  if (!operations || !Array.isArray(operations)) {
    return res.status(400).json({ error: "operations array is required" });
  }

  const userId = req.user.id;
  const results = [];

  try {
    // Process all operations in a transaction
    await prisma.$transaction(async (tx) => {
      // Map to keep track of temp ID -> actual DB ID conversions
      const playlistIdMap = {};

      for (const op of operations) {
        const { type, playlistId, payload } = op;
        const resolvedPlaylistId = playlistIdMap[playlistId] || playlistId;

        try {
          if (type === "create_playlist") {
            const { name } = payload;
            if (!name || !name.trim()) {
              results.push({
                status: "failed",
                playlistId,
                type,
                error: "Playlist name is required",
              });
              continue;
            }

            const newPlaylist = await tx.playlist.create({
              data: {
                user_id: userId,
                name: name.trim(),
              },
            });

            // Map the temporary client ID to the actual DB UUID
            playlistIdMap[playlistId] = newPlaylist.id;

            results.push({
              status: "success",
              playlistId,
              type,
              newId: newPlaylist.id,
              name: newPlaylist.name,
            });
          } else if (type === "add_track") {
            const { trackId, position } = payload;

            const playlist = await tx.playlist.findFirst({
              where: { id: resolvedPlaylistId, user_id: userId },
            });
            if (!playlist) {
              results.push({
                status: "failed",
                playlistId,
                type,
                error: "Playlist not found or forbidden",
              });
              continue;
            }

            const song = await tx.song.findUnique({ where: { id: trackId } });
            if (!song) {
              results.push({
                status: "failed",
                playlistId,
                type,
                error: "Song not found",
              });
              continue;
            }

            let pos = position;
            if (pos === undefined || pos === null) {
              const maxPos = await tx.playlistSong.aggregate({
                where: { playlist_id: resolvedPlaylistId },
                _max: { position: true },
              });
              pos = (maxPos._max.position || 0) + 1;
            }

            await tx.playlistSong.upsert({
              where: {
                playlist_id_song_id: {
                  playlist_id: resolvedPlaylistId,
                  song_id: trackId,
                },
              },
              update: { position: pos },
              create: {
                playlist_id: resolvedPlaylistId,
                song_id: trackId,
                position: pos,
              },
            });

            results.push({ status: "success", playlistId, type });
          } else if (type === "remove_track") {
            const { trackId } = payload;

            const playlist = await tx.playlist.findFirst({
              where: { id: resolvedPlaylistId, user_id: userId },
            });
            if (!playlist) {
              results.push({
                status: "failed",
                playlistId,
                type,
                error: "Playlist not found or forbidden",
              });
              continue;
            }

            await tx.playlistSong.delete({
              where: {
                playlist_id_song_id: {
                  playlist_id: resolvedPlaylistId,
                  song_id: trackId,
                },
              },
            });

            results.push({ status: "success", playlistId, type });
          }
        } catch (err) {
          console.error(
            `Batch operation error (${type}) for playlist ${playlistId}:`,
            err,
          );
          results.push({
            status: "failed",
            playlistId,
            type,
            error: err.message || "Operation failed",
          });
        }
      }
    });

    // Invalidate user playlists and specific playlist cache entries
    await invalidateCache(`user:${userId}:playlists`);
    await invalidateCachePattern(`user:${userId}:playlist:*`);

    return res.status(200).json({ results });
  } catch (err) {
    console.error("Batch sync exception:", err);
    return res
      .status(500)
      .json({ error: "Batch processing transaction failed" });
  }
});

/**
 * POST /api/playlists
 * Create a new playlist for the authenticated user.
 */
router.post("/", authGuard, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Playlist name is required" });
    }

    const playlist = await prisma.playlist.create({
      data: {
        user_id: req.user.id,
        name: name.trim(),
      },
    });

    // Invalidate playlist cache
    await invalidateCache(`user:${req.user.id}:playlists`);

    return res.status(201).json({ id: playlist.id, name: playlist.name });
  } catch (err) {
    console.error("Create playlist error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/playlists
 * List all playlists belonging to the authenticated user.
 */
router.get("/", authGuard, async (req, res) => {
  try {
    const cacheKey = `user:${req.user.id}:playlists`;

    const playlists = await getOrCompute(
      cacheKey,
      async () => {
        return prisma.playlist.findMany({
          where: { user_id: req.user.id },
          select: {
            id: true,
            name: true,
            created_at: true,
            songs: {
              select: { song_id: true },
            },
          },
          orderBy: { created_at: "desc" },
        });
      },
      300,
    ); // Cache for 5 minutes

    return res.status(200).json(playlists);
  } catch (err) {
    console.error("List playlists error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/playlists/:id
 * Get a single playlist with its songs. User-bound.
 */
router.get("/:id", authGuard, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const userId = req.user.id;

    const playlist = await getUserPlaylist(playlistId, userId);

    if (!playlist) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const cacheKey = `user:${userId}:playlist:${playlistId}:${page}:${limit}`;

    const data = await getOrCompute(
      cacheKey,
      async () => {
        const total = await prisma.playlistSong.count({
          where: { playlist_id: playlistId },
        });

        const playlistWithSongs = await prisma.playlist.findUnique({
          where: { id: playlistId },
          include: {
            songs: {
              include: {
                song: {
                  select: {
                    id: true,
                    title: true,
                    artist: true,
                    album: true,
                    year: true,
                    duration_s: true,
                  },
                },
              },
              orderBy: { position: "asc" },
              skip,
              take: limit,
            },
          },
        });

        return {
          id: playlistWithSongs.id,
          name: playlistWithSongs.name,
          created_at: playlistWithSongs.created_at,
          songs: playlistWithSongs.songs.map((ps) => ({
            ...ps.song,
            position: ps.position,
          })),
          total,
        };
      },
      300,
    ); // Cache for 5 minutes

    return res.status(200).json({
      id: data.id,
      name: data.name,
      created_at: data.created_at,
      songs: data.songs,
      page,
      totalPages: Math.ceil(data.total / limit),
      total: data.total,
    });
  } catch (err) {
    console.error("Get playlist error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/playlists/:id
 * Delete a playlist. User-bound. Cascade deletes playlist_songs rows.
 */
router.delete("/:id", authGuard, async (req, res) => {
  try {
    const playlist = await getUserPlaylist(req.params.id, req.user.id);

    if (!playlist) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.playlist.delete({ where: { id: playlist.id } });

    // Invalidate caches
    await invalidateCache(`user:${req.user.id}:playlists`);
    await invalidateCachePattern(
      `user:${req.user.id}:playlist:${playlist.id}:*`,
    );

    return res.status(200).json({ message: "Playlist deleted" });
  } catch (err) {
    console.error("Delete playlist error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/playlists/:id/songs
 * Add a song to a playlist. User-bound.
 */
router.post("/:id/songs", authGuard, async (req, res) => {
  try {
    const playlist = await getUserPlaylist(req.params.id, req.user.id);

    if (!playlist) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { songId, position } = req.body;

    if (!songId) {
      return res.status(400).json({ error: "songId is required" });
    }

    // Verify the song exists
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) {
      return res.status(404).json({ error: "Song not found" });
    }

    // Auto-assign position if not provided
    let pos = position;
    if (pos === undefined || pos === null) {
      const maxPos = await prisma.playlistSong.aggregate({
        where: { playlist_id: playlist.id },
        _max: { position: true },
      });
      pos = (maxPos._max.position || 0) + 1;
    }

    await prisma.playlistSong.upsert({
      where: {
        playlist_id_song_id: { playlist_id: playlist.id, song_id: songId },
      },
      update: { position: pos },
      create: {
        playlist_id: playlist.id,
        song_id: songId,
        position: pos,
      },
    });

    // Invalidate caches
    await invalidateCache(`user:${req.user.id}:playlists`);
    await invalidateCachePattern(
      `user:${req.user.id}:playlist:${playlist.id}:*`,
    );

    return res
      .status(201)
      .json({ playlistId: playlist.id, songId, position: pos });
  } catch (err) {
    console.error("Add song to playlist error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/playlists/:id/songs/:songId
 * Remove a song from a playlist. User-bound.
 */
router.delete("/:id/songs/:songId", authGuard, async (req, res) => {
  try {
    const playlist = await getUserPlaylist(req.params.id, req.user.id);

    if (!playlist) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      await prisma.playlistSong.delete({
        where: {
          playlist_id_song_id: {
            playlist_id: playlist.id,
            song_id: req.params.songId,
          },
        },
      });
    } catch (deleteErr) {
      if (deleteErr.code === "P2025") {
        return res.status(404).json({ error: "Song not found in playlist" });
      }
      throw deleteErr;
    }

    // Invalidate caches
    await invalidateCache(`user:${req.user.id}:playlists`);
    await invalidateCachePattern(
      `user:${req.user.id}:playlist:${playlist.id}:*`,
    );

    return res.status(200).json({ message: "Song removed from playlist" });
  } catch (err) {
    console.error("Remove song from playlist error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
