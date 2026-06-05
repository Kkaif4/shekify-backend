## 1. File Scan & Key Extracted Value

The provided HTML reference is excellent because it aligns perfectly with your "no-socket" decision. Here are the best practices extracted from it that we will use:

- **Fire-and-Forget Downloader:** The `POST /api/download` route doesn't use `await` on the main download logic. It responds immediately with a `202 Accepted` status, letting the server run `yt-dlp` in the background.
- **Deezer API for Metadata:** It correctly leverages the public Deezer search endpoint (`https://api.deezer.com/search?q=...`), which requires **zero API authentication tokens**, making it incredibly easy to use.
- **Stateless Streaming Engine:** The server stores absolutely zero session or playback state. The frontend controls everything (history, shuffle arrays, time skips), and the backend simply serves raw bytes when requested.

---

## 2. Detailed Technical Approach by Feature

Since your server will manage a database, handle system processes, and stream binary data from local storage, here is the detailed breakdown of how to build each component.

### Feature 1: User Authentication & Admin Controls (Auth)

- **Database Schema (SQLite/PostgreSQL):**

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'user')) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

```

- **Security & Implementation Details:**
- When an admin registers a user via `POST /api/admin/create-user`, the password must be pre-hashed using `bcrypt` with a salt cost of `12`.
- On a successful `POST /api/auth/login`, generate a JSON Web Token (JWT) using `jsonwebtoken` with a payload of `{ id, role }` and an expiration of `7d`.
- **Middleware Pipeline:** Use an `authGuard` middleware to verify the incoming `Authorization: Bearer <token>` header and attach the decoded user data to `req.user`. For administrative routes, chain a secondary `adminGuard` right after to verify if `req.user.role === 'admin'`.

### Feature 2 & 3: Media Ingestion & Metadata Mapping (Ingest)

- **Database Schema:**

```sql
CREATE TABLE songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    year INTEGER,
    file_path TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

```

- **Asynchronous Execution Flow:**
- When `POST /api/download` is hit, your route handler triggers a background execution function (`DownloadJob.run(query)`) **without** using the `await` keyword.
- The server immediately returns a `202 Accepted` status code with your confirmation message.

- **The System Process Pipeline:**
- Inside `DownloadJob.run()`, use Node's `child_process.spawn()` to run `yt-dlp`.
- Pass the flags: `--extract-audio --audio-format mp3 --audio-quality 0 --no-playlist -o "/media/%(id)s.%(ext)s"`.

- **The Tagging Engine:**
- Wrap the process exit event in a Promise. Once `yt-dlp` finishes writing the file, hit `https://api.deezer.com/search?q=YOUR_QUERY`.
- Extract the official title, artist, album, and `cover_url`.
- Download the raw cover image using `axios` with `{ responseType: 'arraybuffer' }`.
- Use the **`node-id3`** library to inject everything into the file:

```javascript
const tags = {
  title,
  artist,
  album,
  year,
  image: { imageBuffer, type: { id: 3 } },
};
nodeID3.write(tags, filePath);
```

- Finally, save the song details and the local `filePath` into your `songs` table database.

### Feature 4: Chunk-Based Audio Streaming (Stream)

- **The Range Protocol Execution:**
- When the browser's `<audio>` tag hits `GET /api/stream/:songId`, look up the matching file record from the database.
- Use `fs.statSync(filePath).size` to get the total size of the file in bytes.
- Parse the `req.headers.range` string (which looks like `bytes=0-`).
- Calculate the chunk bounds. If the browser does not specify an end byte, clamp it to a standard **1 Megabyte chunk size**:

```javascript
const start = parseInt(parts[0], 10);
const end = parts[1]
  ? parseInt(parts[1], 10)
  : Math.min(start + 1024 * 1024 - 1, totalSize - 1);
```

- Open a direct pipeline from your hard drive using `fs.createReadStream(filePath, { start, end })`.
- Set a `206 Partial Content` status code along with these precise headers before piping:

```javascript
res.writeHead(206, {
  "Content-Range": `bytes ${start}-${end}/${totalSize}`,
  "Accept-Ranges": "bytes",
  "Content-Length": end - start + 1,
  "Content-Type": "audio/mpeg",
});
fileStream.pipe(res);
```

### Feature 5 & 6: Data Discovery & Playlists (Discover)

- **Database Schema:**

```sql
CREATE TABLE playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE playlist_songs (
    playlist_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY(playlist_id, song_id),
    FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY(song_id) REFERENCES songs(id)
);

```

- **Discovery Logic:**
- **Search:** Use a parameterized `LIKE` query (e.g., `WHERE title LIKE ? OR artist LIKE ?`) to query the `songs` table safely without risking SQL injection.
- **Enforcing Security Bound:** To ensure absolute privacy isolation between accounts, every playlist query must hard-include the authenticated user's ID:

```sql
SELECT * FROM playlists WHERE id = ? AND user_id = ?;

```

If the row count is zero, the server immediately rejects the query with a `403 Forbidden` response, completely preventing User A from accessing User B's playlists.

### Feature 7: Media Client Engine (Player)

- **Frontend Execution Strategy:**
- Instantiated via a single, global browser `new Audio()` object instance.
- When a song changes, set the source element: `audio.src = \`/api/stream/${songId}``. The web browser's underlying network architecture will natively handle the outbound HTTP Range request mechanics automatically.
- **Time Manipulation:** Native skipping and rewinding are handled by manipulating the runtime context directly:

```javascript
// Skip 5s / Rewind 5s
audio.currentTime += 5;
audio.currentTime -= 5;
```

- **Shuffle and Tracking State:** Maintain tracking arrays directly inside your frontend JavaScript state. To shuffle, execute a standard **Fisher-Yates shuffle algorithm** on the current song ID array. Keep a dedicated `history` array stack. Every time a track moves forward, push the current ID onto the stack so that hitting the "Previous" button can seamlessly pop the last ID and play it back immediately.
