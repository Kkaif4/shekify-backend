import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";

// Route imports
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import songsRoutes from "./routes/songs.routes.js";
import streamRoutes from "./routes/stream.routes.js";
import downloadRoutes from "./routes/download.routes.js";
import playlistsRoutes from "./routes/playlists.routes.js";

const app = express();

// ── Global middleware ────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(morgan("dev"));

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Range",
      "ngrok-skip-browser-warning",
      "X-Pinggy-No-Screen",
      "Idempotency-Key",
    ],
    exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
  }),
);
app.use(express.json());

import playbackRoutes from "./routes/playback.routes.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";

app.use(idempotencyMiddleware);

// ── Route mounting ───────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/songs", songsRoutes);
app.use("/api/stream", streamRoutes);
app.use("/api/download", downloadRoutes);
app.use("/api/playlists", playlistsRoutes);
app.use("/api/playback", playbackRoutes);

// ── Health check ─────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start server ─────────────────────────────────────────────
app.listen(config.PORT, () => {
  console.log(`Shekify streaming on http://localhost:${config.PORT}`);
});
