import { Router } from 'express';
import fs from 'fs';
import prisma from '../db/connection.js';
import { config } from '../config.js';
import { authGuard } from '../middleware/authGuard.js';

const router = Router();

/**
 * GET /api/stream/:songId
 * HTTP 206 range-based audio streaming with 1MB chunk size.
 * The browser's <audio> element handles Range header mechanics natively.
 */
router.get('/:songId', authGuard, async (req, res) => {
  try {
    console.log(`[STREAM] Incoming request for songId: ${req.params.songId}, Range: ${req.headers.range || 'none'}`);
    const song = await prisma.song.findUnique({
      where: { id: req.params.songId },
      select: { file_path: true },
    });

    if (!song) {
      console.warn(`[STREAM] Error: Song ${req.params.songId} not found in database.`);
      return res.status(404).json({ error: 'Song not found' });
    }

    if (!fs.existsSync(song.file_path)) {
      console.error(`[STREAM] Error: File does not exist on disk: ${song.file_path}`);
      return res.status(404).json({ error: 'Audio file not found on disk' });
    }

    const totalSize = fs.statSync(song.file_path).size;
    const rangeHeader = req.headers.range;

    if (!rangeHeader) {
      // No Range header — serve the entire file (rare, but handle gracefully)
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': 'audio/mpeg',
      });
      return fs.createReadStream(song.file_path).pipe(res);
    }

    // Parse Range: bytes=start-end
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1]
      ? parseInt(parts[1], 10)
      : Math.min(start + config.CHUNK_SIZE - 1, totalSize - 1);

    // Validate range bounds
    if (start >= totalSize || end >= totalSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
      });
      return res.end();
    }

    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'audio/mpeg',
    });

    const fileStream = fs.createReadStream(song.file_path, { start, end });
    fileStream.pipe(res);
  } catch (err) {
    console.error('Stream error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
