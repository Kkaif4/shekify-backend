import { Router } from 'express';
import prisma from '../db/connection.js';
import { authGuard } from '../middleware/authGuard.js';

const router = Router();

// ── Helper: verify playlist belongs to authenticated user ────
async function getUserPlaylist(playlistId, userId) {
  return prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
  });
}

/**
 * POST /api/playlists
 * Create a new playlist for the authenticated user.
 */
router.post('/', authGuard, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    const playlist = await prisma.playlist.create({
      data: {
        user_id: req.user.id,
        name: name.trim(),
      },
    });

    return res.status(201).json({ id: playlist.id, name: playlist.name });
  } catch (err) {
    console.error('Create playlist error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/playlists
 * List all playlists belonging to the authenticated user.
 */
router.get('/', authGuard, async (req, res) => {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { user_id: req.user.id },
      select: {
        id: true,
        name: true,
        created_at: true,
        songs: {
          select: { song_id: true }
        }
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json(playlists);
  } catch (err) {
    console.error('List playlists error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/playlists/:id
 * Get a single playlist with its songs. User-bound.
 */
router.get('/:id', authGuard, async (req, res) => {
  try {
    const playlist = await getUserPlaylist(req.params.id, req.user.id);

    if (!playlist) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const total = await prisma.playlistSong.count({
      where: { playlist_id: playlist.id },
    });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const playlistWithSongs = await prisma.playlist.findUnique({
      where: { id: playlist.id },
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
          orderBy: { position: 'asc' },
          skip,
          take: limit,
        },
      },
    });

    return res.status(200).json({
      id: playlistWithSongs.id,
      name: playlistWithSongs.name,
      created_at: playlistWithSongs.created_at,
      songs: playlistWithSongs.songs.map((ps) => ({
        ...ps.song,
        position: ps.position,
      })),
      page,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (err) {
    console.error('Get playlist error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/playlists/:id
 * Delete a playlist. User-bound. Cascade deletes playlist_songs rows.
 */
router.delete('/:id', authGuard, async (req, res) => {
  try {
    const playlist = await getUserPlaylist(req.params.id, req.user.id);

    if (!playlist) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.playlist.delete({ where: { id: playlist.id } });

    return res.status(200).json({ message: 'Playlist deleted' });
  } catch (err) {
    console.error('Delete playlist error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/playlists/:id/songs
 * Add a song to a playlist. User-bound.
 */
router.post('/:id/songs', authGuard, async (req, res) => {
  try {
    const playlist = await getUserPlaylist(req.params.id, req.user.id);

    if (!playlist) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { songId, position } = req.body;

    if (!songId) {
      return res.status(400).json({ error: 'songId is required' });
    }

    // Verify the song exists
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
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

    return res.status(201).json({ playlistId: playlist.id, songId, position: pos });
  } catch (err) {
    console.error('Add song to playlist error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/playlists/:id/songs/:songId
 * Remove a song from a playlist. User-bound.
 */
router.delete('/:id/songs/:songId', authGuard, async (req, res) => {
  try {
    const playlist = await getUserPlaylist(req.params.id, req.user.id);

    if (!playlist) {
      return res.status(403).json({ error: 'Forbidden' });
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
      // Prisma throws if record not found
      if (deleteErr.code === 'P2025') {
        return res.status(404).json({ error: 'Song not found in playlist' });
      }
      throw deleteErr;
    }

    return res.status(200).json({ message: 'Song removed from playlist' });
  } catch (err) {
    console.error('Remove song from playlist error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
