import { spawn, execSync } from "child_process";
import path from "path";
import axios from "axios";
import NodeID3 from "node-id3";
import prisma from "../db/connection.js";
import { config } from "../config.js";

export async function verifyExists(searchQuery) {
  console.time(`verifyExists: ${searchQuery}`);
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", [
      "--simulate",
      "--get-id",
      `ytsearch1:${searchQuery} audio`,
    ]);
    let stdout = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.on("close", (code) => {
      console.timeEnd(`verifyExists: ${searchQuery}`);
      resolve(code === 0 && stdout.trim().length > 0);
    });
    proc.on("error", (err) => {
      console.error(`[DEBUG] verifyExists error:`, err);
      console.timeEnd(`verifyExists: ${searchQuery}`);
      resolve(false);
    });
  });
}

export async function run({ songName, singer, year, album }) {
  const searchQuery = [songName, singer, "audio"].filter(Boolean).join(" ");
  console.log(`🎵 [DownloadJob] Starting: "${searchQuery}"`);
  console.time(`downloadJobTotal: ${searchQuery}`);

  try {
    console.log(`  [DEBUG] Resolving output template path...`);
    const outputTemplate = path.join(config.SONGS_DIR, "%(id)s.%(ext)s");

    console.log(`  [DEBUG] Spawning yt-dlp for search query...`);
    console.time(`ytdlpDownload: ${searchQuery}`);
    const downloadedFile = await new Promise((resolve, reject) => {
      const args = [
        `ytsearch1:${searchQuery}`,
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--no-playlist",
        "--print",
        "id",
        "-o",
        outputTemplate,
      ];
      console.log(`  [DEBUG] yt-dlp args:`, args.join(" "));
      const proc = spawn("yt-dlp", args);
      let stdout = "",
        stderr = "";
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("close", (code) => {
        console.timeEnd(`ytdlpDownload: ${searchQuery}`);
        console.log(`  [DEBUG] yt-dlp exited with code ${code}`);
        
        // FORCE LOG EVERYTHING RIGHT NOW FOR DEBUGGING:
        console.log(`  [CRITICAL DEBUG] Raw stdout:`, stdout);
        console.log(`  [CRITICAL DEBUG] Raw stderr:`, stderr);

        if (code !== 0) {
          return reject(new Error(`yt-dlp exit ${code}: ${stderr}`));
        }
        
        const lines = stdout.trim().split("\n").filter(Boolean);
        const videoId = lines[lines.length - 1];
        
        console.log(`  [DEBUG] yt-dlp output ID: ${videoId}`);
        if (videoId && videoId !== "NA") {
           const fp = path.join(config.SONGS_DIR, `${videoId}.mp3`);
           resolve(fp);
        } else {
           reject(new Error("yt-dlp no valid id returned"));
        }
      });
      proc.on("error", (e) => {
        console.timeEnd(`ytdlpDownload: ${searchQuery}`);
        reject(new Error(`spawn failed: ${e.message}`));
      });
    });
    console.log(`  ✔ Downloaded: ${downloadedFile}`);

    let title = songName,
      artist = singer || null,
      albumName = album || null;
    let songYear = year ? parseInt(year, 10) : null,
      coverBuffer = null;

    console.log(`  [DEBUG] Fetching metadata from Deezer API...`);
    console.time(`deezerFetch: ${searchQuery}`);
    try {
      const { data } = await axios.get(
        `https://api.deezer.com/search?q=${encodeURIComponent(searchQuery)}&limit=1`,
        { timeout: 10000 },
      );
      if (data.data?.length > 0) {
        const t = data.data[0];
        title = t.title_short || t.title;
        artist = t.artist?.name || artist;
        albumName = t.album?.title || albumName;
        const coverUrl = t.album?.cover_big || t.album?.cover_medium;
        if (coverUrl) {
          console.log(`  [DEBUG] Fetching cover image from: ${coverUrl}`);
          const cr = await axios.get(coverUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
          });
          coverBuffer = Buffer.from(cr.data);
        }
        console.log(`  ✔ Deezer: "${title}" by ${artist}`);
      } else {
        console.log(`  [DEBUG] No matches found on Deezer.`);
      }
    } catch (e) {
      console.error("  ⚠ Deezer failed (non-fatal):", e.message);
    }
    console.timeEnd(`deezerFetch: ${searchQuery}`);

    const tags = { title, artist: artist || "", album: albumName || "" };
    if (songYear) tags.year = String(songYear);
    if (coverBuffer)
      tags.image = {
        imageBuffer: coverBuffer,
        type: { id: 3 },
        mime: "image/jpeg",
      };

    console.time(`id3Write: ${searchQuery}`);
    console.log(`  [DEBUG] Writing ID3 tags to file...`);
    NodeID3.write(tags, downloadedFile);
    console.log("  ✔ ID3 tags written");
    console.timeEnd(`id3Write: ${searchQuery}`);

    let durationS = null;
    console.time(`ffprobeDuration: ${searchQuery}`);
    console.log(`  [DEBUG] Extracting duration with ffprobe...`);
    try {
      const out = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${downloadedFile}"`,
        { encoding: "utf-8", timeout: 10000 },
      );
      durationS = Math.round(parseFloat(out.trim()));
      if (isNaN(durationS)) durationS = null;
    } catch {
      console.warn("  ⚠ ffprobe failed (non-fatal)");
    }
    console.timeEnd(`ffprobeDuration: ${searchQuery}`);

    const filename = path.basename(downloadedFile);

    console.log("  [DEBUG] Final Downloaded Song Metadata:", JSON.stringify({
      filename,
      title,
      artist,
      album: albumName,
      year: songYear,
      durationS,
      hasCoverImage: !!coverBuffer,
      file_path: downloadedFile
    }, null, 2));

    console.time(`dbUpsert: ${searchQuery}`);
    await prisma.song.upsert({
      where: { file_path: downloadedFile },
      update: {
        title,
        artist,
        album: albumName,
        year: songYear,
        duration_s: durationS,
        filename,
      },
      create: {
        filename,
        title,
        artist,
        album: albumName,
        year: songYear,
        duration_s: durationS,
        file_path: downloadedFile,
      },
    });
    console.timeEnd(`dbUpsert: ${searchQuery}`);

    console.log(
      `  ✔ DB saved: "${title}" (${durationS ? durationS + "s" : "?"})`,
    );
    console.timeEnd(`downloadJobTotal: ${searchQuery}`);
    console.log(`🎵 [DownloadJob] Complete\n`);
  } catch (err) {
    console.error(`❌ [DownloadJob] Failed for "${searchQuery}":`, err.message);
    console.timeEnd(`downloadJobTotal: ${searchQuery}`);
  }
}
