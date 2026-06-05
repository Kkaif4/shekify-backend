import bcrypt from "bcrypt";
import prisma from "./connection.js";
import { config } from "../config.js";
import { scan } from "../services/scanner.js";

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
    const hash = await bcrypt.hash("admin123", config.BCRYPT_SALT_ROUNDS);

    await prisma.user.create({
      data: { username: "admin", password_hash: hash, role: "admin" },
    });

    console.log("  ✔ Created admin user (admin / admin123)");
    console.log("  ⚠ Change these credentials before any real use!\n");
  }

  // ── Phase 2: Scan existing MP3s ────────────────────────────
  console.log("Phase 2: MP3 directory scan");
  console.log(`  Scanning: ${config.SONGS_DIR}\n`);

  const { indexed, skipped } = await scan();

  console.log(
    `\n  📊 Results: ${indexed} indexed, ${skipped} skipped (already in DB)`,
  );
  console.log("\n✅ Seed complete.");

  await prisma.$disconnect();
}

seed().catch(async (err) => {
  console.error("❌ Seed failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
