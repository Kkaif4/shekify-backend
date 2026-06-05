import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import NodeID3 from "node-id3";
import { PrismaClient, Role } from "../src/generated/prisma/index.js";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SONGS_DIR = process.env.SONGS_DIR || "/home/kaif/storage/ShekifySongs";
const BCRYPT_SALT_ROUNDS = 12;

function getDuration(filePath: string): number | null {
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

async function seed() {
  console.log("🌱 Shekify — Seed Script\n");

  // ── Phase 1: Bootstrap admin user ──────────────────────────
  console.log("Phase 1: Admin bootstrap");

  const existingAdmin = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (existingAdmin) {
    console.log("  ⏭  Admin user already exists, skipping.\n");
  } else {
    const hash = await bcrypt.hash("admin123", BCRYPT_SALT_ROUNDS);

    await prisma.user.create({
      data: { username: "admin", password: hash, role: Role.ADMIN },
    });

    console.log("  ✔ Created admin user (admin / admin123)");
    console.log("  ⚠ Change these credentials before any real use!\n");
  }

  // ── Phase 2: Scan existing MP3s ────────────────────────────
  console.log("Phase 2: MP3 directory scan");
  console.log(`  Scanning: ${SONGS_DIR}\n`);

  if (!fs.existsSync(SONGS_DIR)) {
    console.warn(`  ⚠ Songs directory not found: ${SONGS_DIR}`);
  } else {
    const files = fs
      .readdirSync(SONGS_DIR)
      .filter((f) => f.toLowerCase().endsWith(".mp3"));
    let indexed = 0;
    let skipped = 0;

    for (const file of files) {
      const filePath = path.join(SONGS_DIR, file);

      const existing = await prisma.song.findUnique({
        where: { file_path: filePath },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const tags = NodeID3.read(filePath) || {};
      const title =
        (tags as any).title || path.basename(file, path.extname(file));
      const artist = (tags as any).artist || null;
      const album = (tags as any).album || null;
      const year = (tags as any).year ? parseInt((tags as any).year, 10) : null;
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

    console.log(
      `\n  📊 Results: ${indexed} indexed, ${skipped} skipped (already in DB)`,
    );
  }

  console.log("\n✅ Seed complete.");
}

seed()
  .catch(async (err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
