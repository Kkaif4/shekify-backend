import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ".env",
  ),
});

export const config = {
  PORT: parseInt(process.env.PORT, 10) || 3030,
  JWT_SECRET: process.env.JWT_SECRET || "shekify_fallback_secret",
  JWT_ACCESS_EXPIRY: "15m",
  JWT_REFRESH_EXPIRY: "7d",
  SONGS_DIR: process.env.SONGS_DIR || "/home/kaif/storage/ShekifySongs",
  CHUNK_SIZE: 1024 * 1024, // 1 MB streaming buffer
  BCRYPT_SALT_ROUNDS: 12,
};
