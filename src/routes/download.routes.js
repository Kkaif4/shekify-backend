import { Router } from 'express';
import { authGuard } from '../middleware/authGuard.js';
import { adminGuard } from '../middleware/adminGuard.js';
import { run as runDownloadJob, verifyExists } from '../services/downloadJob.js';

const router = Router();

/**
 * POST /api/download
 * Admin-only: triggers a fire-and-forget background download job.
 * Hybrid: Synchoronously verifies existence, asynchronously downloads.
 */
router.post('/', authGuard, adminGuard, async (req, res) => {
  const { songName, singer, year, album } = req.body;

  if (!songName || !singer || !year) {
    return res.status(400).json({ error: 'Song Name, Artist, and Year are required' });
  }

  const searchQuery = [songName, singer].filter(Boolean).join(' ');
  const exists = await verifyExists(searchQuery);

  if (!exists) {
    return res.status(404).json({ error: 'We could not find the song. Please try different keywords.' });
  }

  // Fire-and-forget — no await
  runDownloadJob({ songName, singer, year, album });

  return res.status(202).json({
    message: 'User request has been made, it will update soon.',
  });
});

export default router;
