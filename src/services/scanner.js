import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import NodeID3 from "node-id3";
import prisma from "../db/connection.js";
import { config } from "../config.js";

function getDuration(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8", timeout: 10000 },
    );
    const seconds = Math.round(parseFloat(output.trim()));
    return isNaN(seconds) ? null : seconds;
  } catch {
    return null;
  }
}

export async function scan() {
  const songsDir = config.SONGS_DIR;

  if (!fs.existsSync(songsDir)) {
    console.warn(`⚠ Songs directory not found: ${songsDir}`);
    return { indexed: 0, skipped: 0 };
  }

  const files = fs
    .readdirSync(songsDir)
    .filter((f) => f.toLowerCase().endsWith(".mp3"));
  let indexed = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(songsDir, file);

    const existing = await prisma.song.findUnique({
      where: { file_path: filePath },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const tags = NodeID3.read(filePath) || {};
    const title = tags.title || path.basename(file, path.extname(file));
    const artist = tags.artist || null;
    const album = tags.album || null;
    const year = tags.year ? parseInt(tags.year, 10) : null;
    const durationS = getDuration(filePath);

    await prisma.song.create({
      data: {
        filename: file,
        title,
        artist,
        album,
        year,
        duration_s: durationS,
        file_path: filePath,
      },
    });

    console.log(`  ✔ Indexed: ${title}${artist ? ` — ${artist}` : ""}`);
    indexed++;
  }

  return { indexed, skipped };
}
