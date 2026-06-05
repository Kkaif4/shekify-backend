# Frontend Functional Requirements Document (FRD) & UI Design Spec

**Framework Target:** Next.js (App Router / React)

**Architecture Style:** Stateless Client Player with Pure HTTP / REST Data Pipelines

**Design System Theme:** Modern Dark Mode Accent Aesthetic

---

## 1. Global UI/UX Design System (The "Pleasing UI")

To deliver a highly responsive, user-friendly interface that prevents eye strain and isolates media elements, the interface implements a **Sleek Dark Mode Accent** aesthetic with clean, geometric typography and unified spacing tokens.

### 1.1 Color Palette & Typography Tokens

- **Background Primary:** `#0F0F12` (Deep Obsidian Black — Application background canvas)
- **Background Secondary:** `#16161E` (Dark Charcoal — Cards, sidebars, context panels, and bottom player bar)
- **Accent / Active State:** `#6366F1` (Indigo Blue — Focus rings, active routing, sliders, and primary buttons)
- **Success Indicator:** `#10B981` (Emerald Green — Valid status elements, successful execution toasts)
- **Error / Danger State:** `#EF4444` (Rose Red — Destructive actions, 401/403 alerts, failed process toasts)
- **Text Primary:** `#FFFFFF` (Pure White — Accessible titles, table headers, and active text fields)
- **Text Secondary:** `#94A3B8` (Muted Slate Grey — Subtitles, artist names, durations, and timestamps)
- **Typography Font Family:** System Sans-Serif Stack or `Inter` (Set at root layout level)

---

## 2. Global Frontend Architecture & Technical Foundation

### 2.1 Tech Stack & Routing Architecture

The client application is built entirely on the **Next.js App Router** framework using Client Components (`'use client'`) for live interactive view panels and native React hooks for global playback state configuration.

```
src/app/
├── (auth)/
│   └── login/
│       └── page.tsx        <-- Unprotected Layer
└── (dashboard)/
    ├── page.tsx            <-- Protected Core Dashboard View
    ├── playlists/
    │   └── [id]/
    │       └── page.tsx    <-- User-Isolated Playlist View
    └── layout.tsx          <-- Injectable Protected Client Guard Layout

```

### 2.2 Global `localStorage` Namespace Keys

To prevent key collision across local web applications running on the host laptop, all browser persistent key tags must strictly adhere to the following naming conventions:

- `mystream_jwt_token` - Stores the raw cryptographic user access token string.
- `mystream_user_profile` - Caches a JSON string object containing `{ username, role }`.
- `mystream_player_volume` - Floating-point numerical string (`0.0` to `1.0`) preserving user volume levels.
- `mystream_shuffle_enabled` - Boolean flag string preserving active queue randomization preferences.

### 2.3 Shared UI Components

#### Toast Notification System Specification

- **Constraints:** Maximum of **one (1)** active toast visible on the viewport at any single instant.
- **Lifecycle:** Automatically dismisses and clears from the layout state tree exactly **3 seconds** post-instantiation.
- **Positioning:** Fixed anchor positioned at the **Bottom-Right** quadrant of the user viewport.
- **Variants:**

1. `Success`: Styled with `#10B981` borders and a confirmation icon.
2. `Error`: Styled with `#EF4444` background/text hues, highlighting execution block details.
3. `Info`: Styled with a `#6366F1` indigo highlight accent for general tracking status changes.

#### Data-Dependent Loading & Skeleton States

Every view dependent on async API queries (the primary library grid, the dynamic sidebar list, the player details container) must replace empty elements with structural **Skeleton Component Shimmer Layers** while the network promise lifecycle settles.

- **Visual Target:** Uses stacked row containers mapping identical dimensions to target cards or tables, shifting backgrounds continuously using an infinite opacity shimmer keyframe loop.

---

## 3. Core Functional Requirements (FR)

### Module 1: Authentication, Gateways, & Route Security

#### FR-1.1: Unprotected Login Gateway View

- **Description:** Form-based validation entry point blocking application utilization until verified.
- **UI Components:** Centralized login module containing input string validation for `Username` and `Password`, an absolute `Login` primary button, and a dynamic local React status panel showing explicit error messages.
- **API Pipeline:** Submits a raw payload directly to `POST /api/auth/login`. On standard `200 OK` fulfillment, catches the token string object, persists it to `mystream_jwt_token`, extracts user keys, records role identifiers to `mystream_user_profile`, and executes a client-side Next.js route transition to the `/` root dashboard.

#### FR-1.2: Protected Core Route Client Guard Layout

- **Description:** Intercepts path transitions to secure parts of the App Router layer, preventing unauthenticated file discovery.
- **Implementation Logic:** The layout file enclosing the dashboard routes handles token analysis during initial mount phases.
- _Step 1:_ Reads the local value string stored inside `mystream_jwt_token`.
- _Step 2:_ If the key reads empty, null, or undefined, the verification thread throws an immediate abort exception, purges local session namespaces, and forcefully shifts routing focus using `router.replace('/login')`.

#### FR-1.3: Global Axios / Fetch API Client & Response Interceptor

All asynchronous network tracking queries running across components pass through a unified HTTP client utility.

- **Header Injection:** Automatically extracts values from `mystream_jwt_token` on every outbound transaction request, mapping it directly inside the standard header profile: `Authorization: Bearer <token>`.
- **Global 401 Authorization Expiry Handler:** The client injects a global response interceptor function.
- _Condition:_ If any backend HTTP request execution fails and responds with an explicit status of **`401 Unauthorized`**, the interceptor instantly overrides component context scopes.
- _Resolution Thread:_ It deletes `mystream_jwt_token`, purges caching files inside `mystream_user_profile`, triggers a global UI media player context teardown (invoking `.pause()` and clearing current tracking objects), initializes an `Error` Toast message declaring _"Session expired. Please log in again."_, and pushes the active route pointer straight back to the `/login` view window.

#### FR-1.4: Global Logout Mechanism Action

- **Description:** Explicit structural button anchor nested neatly at the lower base profile of the left navigation menu layout panel.
- **Interaction Chain:** When clicked, the execution flow bypasses backend coordination entirely:

1. Halts active streaming byte pools via native audio engine pause methods.
2. Completely wipes `mystream_jwt_token` and `mystream_user_profile` variables from storage.
3. Dispatches an `Info` toast notification declaring _"Logged out successfully."_
4. Flashes screen elements back to an initial layout state and triggers `router.push('/login')`.

---

### Module 2: The Dashboard Workspace Layout Architecture

The core Next.js application workspace is constructed around an asymmetric three-panel fluid dashboard system designed to organize all navigation features natively without nesting windows:

```
┌─────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
│                                 │  🔍 Search library titles, artists, or albums...                           │
│  🎵 MyStream                    ├─────────────────────────────────────────────────────────────────────────────┤
│                                 │                                                                             │
│  🏠 Home / Dashboard            │  ✨ Automated Ingestion Pane                                                │
│  🔍 Search Catalogue            │  [ Track Name ] [ Artist ] [ Year ] [ Album ]  [ 📥 Request Track ]         │
│  ⚙️ Admin Console (Conditional)  │                                                                             │
│                                 ├─────────────────────────────────────────────────────────────────────────────┤
│  ➕ Create Playlist             │                                                                             │
│                                 │  🎶 Global Music Library / Selected View                                    │
│  🗂️ PLAYLISTS TRACKS            │  #   Title         Artist        Album         Date Added    Action           │
│  • Electronic Vibe              │  1   Kesariya      Arijit Singh  Brahmastra    02/06/2026    [ ┇ Dropdown ]   │
│  • Local Lo-Fi                  │  2   Mera Safar    Iqlipse Nova  Single Track  04/06/2026    [ ┇ Dropdown ]   │
│                                 │                                                                             │
│  👤 User Profile                │  * Empty Library State Placeholder Container *                              │
│  🚪 Sign Out                    │  "No tracks have been indexed yet. Enter details above to populate library" │
└─────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘
│ ▶  [Img] Kesariya - Arijit S.       ⏮   ⏪   [ ▶ Play / ⏸ Pause ]   ⏩   ⏭   🔀   🔊 ─────────── [02:14/04:30]│
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

```

#### FR-2.1: Navigation Sidebar Panel Framework (Left Column Component)

- **Branding & Core Routing Hooks:** Holds functional buttons routing users to the global catalog view index.
- **Dynamic Managed Playlist Links:** Mounts an effect hook that queries `GET /api/playlists`. Renders a scrollable structural list tracking user-bounded collections.
- **FR-2.1.A: Empty Playlist Sidebar State:** If the response array from the backend is completely empty, the sidebar layout dynamically renders a muted text label: _"No playlists created yet."_
- **FR-2.1.B: Conditional Admin Console Entry Link:** The sidebar reads configuration keys inside `mystream_user_profile`. If the state parameters read **`role !== 'admin'`**, the sidebar hides the settings option completely. If the user object possesses an explicit `admin` identifier, the system injects a navigation menu option pointing directly to the `/admin/create-user` view panel.

#### FR-2.2: Automated Media Ingestion Card View (Top Main Row Pane)

- **Description:** Interactive form panel mapping direct automation parameters down to backend system shell scripts.
- **Download Route Permission Alignment:** The backend sets `POST /api/download` as a protected, unrestricted operation accessible by all logged-in accounts. The ingestion card component renders uniformly for all roles across the platform.
- **Form Interaction Controls:** Provides 4 validated input string fields: `Track Name`, `Artist/Singer`, `Release Year`, and `Movie/Album`.
- **Execution Behavior:** Clicking the accent action button `Request Track` invokes an HTTP request targeting `POST /api/download`.
- _Instant UI Feedback Loop:_ The client catches the immediate HTTP `202 Accepted` code returned by the fire-and-forget download architecture. It clears out all input fields, resets form focus, and creates an `Info` toast notification matching our structural logic: **"Request has been made, you can search for the song in few minutes."** The user remains completely free to interact with playlists or library rows while `yt-dlp` executes silently in the backend.

#### FR-2.3: Central Library Display & Directory Search Component (Main View Panel)

- **FR-2.3.A: Unified Global Search Execution Engine:** The upper zone provides a dedicated textual lookup bar. To optimize laptop performance and prevent excessive database lookups, the interface implements **Debounced Server-Side Searching**.
- _Processing:_ As the user types, characters are captured in a local state buffer. The application delays execution for exactly **300 milliseconds** since the last keystroke before dispatching a single request to `GET /api/songs?search=<query_string>`.

- **FR-2.3.B: Standard Catalog Grid & Dynamic Track Rows:** Maps response array nodes into a clean tabular layout showing indexing IDs, metadata properties, and an operations drop-down element.
- **FR-2.3.C: Library Empty State View Configuration:** If the network request returns an array length of `0` (e.g., during the initial initialization on your laptop), the interface hides the tabular framework completely and renders a centralized empty state panel: **"No tracks found in library. Enter specific song parameters in the ingestion form above to download audio."**

---

### Module 3: Advanced Media Component Actions & Playlist Layout

#### FR-3.1: "Add to Playlist" Action Menu Specification

- **Description:** Interacting with the dropdown action icon (`┇`) nested on any catalog row instantiates a local hover list.
- **Execution Chain:**

1. When clicked, the client fires a quick fetch call to `GET /api/playlists` to gather the user's active collections.
2. Renders the names inside a context list container overlaying the track table.
3. Clicking a target playlist element triggers an immediate network call to `POST /api/playlists/:id/songs` with a payload of `{ songId }`.
4. On receipt of a successful response, the client closes the dropdown pane and dispatches a `Success` toast message: **"Added to [Playlist Name]."**

#### FR-3.2: User-Bounded Playlist Dynamic View Window

- **Description:** Dedicated display panel rendered when a user clicks an explicit playlist link inside the navigation panel sidebar.
- **UI Properties:** Header tracking custom names, metadata counters, an accessible option to delete the complete instance (`DELETE /api/playlists/:id`), and an ordered track table list layout.
- **FR-3.2.A: User Playlist Empty State View:** If the playlist structure loads successfully but contains an active track length of `0`, the data view renders a muted fallback layout block: _"This playlist has no tracks yet. Browse the global catalogue to append music."_
- **FR-3.2.B: Item Removals Interaction Engine:** Every song tracking row displayed within this specific layout shows a contextual destructive action icon (styled as an explicit Trash Icon on mouse hover states). Clicking it fires an execution request directly down to `DELETE /api/playlists/:id/songs/:songId`. The frontend updates by filtering out that tracking ID from its local React list state and creates an immediate `Info` toast stating: **"Track removed from playlist."**

---

### Module 4: Persistent Audio Player State Bar Framework (Bottom Strip Component)

This component mounts at the lowest layout boundary of the user screen as a unified global layout footer. It wraps a single native React Context hook tracking an HTML5 `new Audio()` element instantiation. The server remains stateless; the frontend orchestrates all playback behaviors locally.

#### FR-4.1: Track Details & Cover Art Fallback Layout (Left Element Sector)

- **Rendering Pipeline:** Mounts title strings, artist credits, and structural images tied to the current playing track node.
- **FR-4.1.A: Missing Cover Art Asset Fallback Protocol:** The backend parses ID3 elements and serves artwork via `GET /api/songs/:id/cover`. If a target audio track contains no embedded binary tag, the backend image route returns an explicit `404 Not Found` exception. The frontend must bind an `onError` event hook handler directly onto the HTML `<img />` layout frame:

```javascript
// Fallback trigger loop executed client-side
const handleArtworkError = (e) => {
  e.target.src = "/placeholders/missing-music-cover.svg";
  // Replaces broken frames with a minimalist slate gradient music note graphic tile.
};
```

````

#### FR-4.2: Media Control State Routing Engine (Center Controls Element Layout)
*   **Play/Pause Context Controls:** Clicking the button alters states seamlessly: `audio.play()` or `audio.pause()`.
*   **Manual Jump Actions (+/- 5 Seconds):** Clicking the skipping elements applies immediate math adjustments: `audio.currentTime += 5` or `audio.currentTime -= 5`. The underlying browser layer automatically computes the time-to-byte ranges and sends an HTTP 206 request to stream the matching audio chunks.
*   **FR-4.2.A: Next Track Command Control Handling (`⏭`):** Interacting with the forward skipping button invokes our global client track advancement framework loop:
    1.  Pushes the active tracking `songId` onto a client history array list: `state.history.push(currentSongId)`.
    2.  Increments the active collection query pointer cursor: `state.cursor++`.
    3.  Fetches the target ID node from the queue configuration and assigns the source string element directly to trigger an range request stream transfer: `audio.src = \`/api/stream/\${nextSongId}\``.
*   **FR-4.2.B: Previous Track Back-Tracking Engine (`⏮`):** Clicking the backtrack element reverses playback positions securely using our frontend state trace array.
    *   *Logic:* It checks if `state.history.length > 0`. If valid, it pulls the final array item out of memory using `.pop()`, establishes that value as the active track cursor index, re-assigns the source path parameter (`audio.src`), and forces playback initialization instantly.
*   **FR-4.2.C: Natural Media Lifecycle Termination (`audio.onended`):** To ensure uninterrupted music delivery, the global player context assigns an explicit event listener hook to capture the audio completion frame:
    ```javascript
audio.onended = () => {
    // Automatically triggers the identical logic block mapped to the Next Track (⏭) action loop, advancing the queue smoothly.
};

````

- **FR-4.2.D: Shuffled Queue Array State & Persistence Constraints:** Clicking the shuffle option toggles a boolean property cached inside `mystream_shuffle_enabled`.
- _Implementation Blueprint:_ The application preserves two local list arrays in memory: `originalQueue` and `activePlaybackQueue`. When shuffle is enabled, the system runs a deep clone copy of the active songs through a client-side **Fisher-Yates randomization calculation block** and overwrites `activePlaybackQueue`. The track tracking pointer (`cursor`) re-aligns to position `0`.
- _Persistence Condition:_ This shuffled structure remains fully preserved across all continuous automated playback loops. As long as `mystream_shuffle_enabled` reads true, every automated `onended` trigger picks the next element sequentially from the randomized array, rather than reverting back to standard catalog table sorting rules.

#### FR-4.3: Real-Time Timeline Slider & Metadata Duration Loader (Center Timeline Strip)

- **Dynamic Data Synchronization:** The timeline displays current track progress and remaining track duration.
- **FR-4.3.A: Metadata Audio Load Resolution Thread:** The application pulls track lengths dynamically directly out of the browser's audio execution thread using client event hooks.
- _Implementation:_ The player registers a listener tracking the native `loadedmetadata` execution lifecycle event. Once fired, it updates the layout state tracker: `state.duration = audio.duration`.
- _Handling Loading States:_ Before this explicit event triggers, or while network buffers are initializing, `audio.duration` resolves to `NaN`. The UI layout must detect this condition and cleanly render a placeholder string (`--:--`) to prevent layout flickering.

#### FR-4.4: Local Audio Volume Controller Specification (Right Element Sector)

- **Interface Structure:** Provides an interactive volume layout icon coupled to a horizontal slider element track.
- **Operational Scope:** Maps inputs on a scale from `0` to `100`. Dragging shifts value ranges directly down to the browser audio engine layer using a standard floating-point translation: `audio.volume = sliderValue / 100`.
- **Cross-Session Persistence Rule:** Every volume change event updates the local variable cached inside `mystream_player_volume`. During the initial application load sequence, the global playback initialization script checks this variable, defaulting to a standard value of `0.70` (70% Volume) only if the string reads empty. This ensures the user's volume preference is fully preserved across browser reloads.

#### FR-4.5: System Scope Statement: Repeat Mode Parameters

- **Product Constraint Scope Exclusion:** Implementing recursive single track repeat functions or full list loop tracking overrides is explicitly classified as **Out of Scope** for this current development build version. The system operates entirely on a single-pass termination approach: once the final file node tracking inside `activePlaybackQueue` executes its `onended` loop, the player context tears down active tracking states and halts streaming entirely until a fresh user tracking interaction occurs.

---

## 4. Frontend Non-Functional Requirements (NFR)

### NFR-1: Performance, Responsiveness & Execution Speed

- **NFR-1.1:** All client state array operations, including queue randomizations and history tracking stack executions, must compute within a maximum boundary of **16 milliseconds**. This ensures that updating DOM lists won't trigger UI stuttering or block browser frame rendering.
- **NFR-1.2:** Interface components must implement dynamic view structures that adapt cleanly across layout widths, ensuring the server runs smoothly on your laptop screen while remaining easy to use on local mobile viewports over Wi-Fi.

### NFR-2: Network Management & Resource Footprint

- **NFR-2.1:** The audio player context layer must enforce strict manual resource management. Every time a user changes tracks or triggers a historical jump action, the application must immediately clear the active media element's source attribute and trigger `.load()`. This breaks any lingering range connection buffers and frees up local system resources to keep your laptop running smoothly.

### NFR-3: Error Resilience & User Feedback Insulation

- **NFR-3.1:** The global API client layer must trap network errors cleanly. If any background data call or media packet fetch operation encounters an exception (such as a local database lock up or network drop), the interface must display an `Error` toast notification with a helpful description, while shifting the media player's buttons back to a safe "Paused" state to prevent interface errors.
