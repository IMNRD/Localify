# Spec: Localify — a Spotify-style player for local music files (Windows 10)

## Goal
Build **Localify**, an offline Windows 10 desktop app that plays the user's own music files (MP3 primary; also FLAC, M4A/AAC, WAV, OGG) with a Spotify-like look and Spotify-like navigation, and lets the user customize playlists with their own cover images.

## Audience & voice
One non-expert Windows user on their own PC. UI copy is short, friendly, plain English. Setup docs assume no programming knowledge.

## Deliverable
A project folder `localify/` that runs with `npm install` then `npm start` (also a `Start Localify.bat` double-click launcher), plus an optional `npm run dist` that builds a portable `.exe` with electron-builder. Contains: `package.json`, `src/main/*.js`, `src/renderer/{index.html,styles.css,app.js}`, `assets/logo.svg`, `GETTING_STARTED.md`, `HANDOFF.md` (offered at end), `.gitignore`.

## Requirements (must-haves)
**Platform & stack**
- Electron (current stable), vanilla HTML/CSS/JS renderer (classic `<script>`, no bundler, no framework), one runtime dep `music-metadata` (ESM — load with dynamic `import()` from CommonJS main). Library stored as JSON in `app.getPath('userData')`.
- Windows 10 target; must not rely on any native module that needs a compiler.
- Fully offline: no network requests, no telemetry, no account.

**Library**
- User adds one or more music folders (native folder picker). Recursive scan for `.mp3 .flac .m4a .aac .wav .ogg .opus`.
- Read tags: title, artist, albumArtist, album, track no, disc no, year, duration, embedded cover art. Fallbacks: title = filename without extension; artist = "Unknown Artist"; album = "Unknown Album".
- Extract embedded art once per unique picture (sha1 of bytes) to `userData/art/<hash>.<jpg|png>`; tracks store `artHash`. Tracks with no art show a generated placeholder tile (accent-tinted, note glyph).
- Incremental rescan: skip files whose `mtimeMs` and `size` are unchanged; add new; mark files that disappeared `available:false` (never delete them, so playlists keep their slots). Re-appearing files become available again. Scan runs on launch (background) and on "Rescan". Progress shown in Settings and as a small status text in the sidebar footer.
- Track id = first 16 hex chars of sha1 of the lowercased absolute path.
- Removing a folder removes its tracks from the library (playlists keep ids, shown as unavailable).

**Navigation (Spotify-like)**
- Layout: left sidebar, main content, bottom now-playing bar. Top bar in main with back/forward buttons (history stack) and a search box.
- Sidebar: Home, Search, Songs (all tracks — a Localify addition so local libraries can browse everything); "Your Library" with chips Playlists / Albums / Artists, a filter box, a "+" button to create a playlist, and a "Liked Songs" row pinned first under Playlists.
- Views: Home (greeting by time of day; Liked Songs + up to 5 playlists quick tiles; Recently played; Recently added albums; empty-library call to action), Search (live, debounced 120 ms, case- and accent-insensitive; sections Songs, Artists, Albums, Playlists), Songs, Liked Songs, Playlist, Album, Artist (hero with art, Popular = tracks ordered by play count then title, Albums grid), Queue, Settings (folders, add/remove, rescan, counts, last scan time).
- Track table columns: # (play icon on hover), Title (art + title + artist), Album, Liked heart, Duration. Row double-click plays from that row. Currently playing row is accent-coloured. Unavailable tracks are dimmed with a "File missing" tooltip and are skipped by playback.
- Track lists are virtualized (fixed 56 px rows) so a 20,000-track library scrolls without lag.
- Right-click or "⋯" on any track: Play next, Add to queue, Add to playlist ▸ (list + New playlist), Like/Unlike, Go to artist, Go to album, Remove from this playlist (only inside a playlist). Right-click a playlist in the sidebar: Edit details, Delete (in-app confirm dialog).

**Playback**
- HTML audio element. Play/pause, previous (restarts track if >3 s in, else previous), next, seek bar with elapsed/remaining times, volume slider with mute, shuffle, repeat (off → all → one). Queue view shows Now playing and Next up with remove and click-to-jump.
- Play contexts: clicking play on an album/playlist/artist/songs/liked builds the queue from that list. Shuffle reorders only upcoming tracks; turning it off restores context order from the current track.
- Keyboard: Space play/pause (not when typing in an input), Ctrl+Right/Left next/prev, Ctrl+Up/Down volume, Ctrl+F focuses search. Windows media keys (play/pause, next, previous) via `globalShortcut`; disable Chromium's own handling (`disable-features=HardwareMediaKeyHandling,MediaSessionService`) so keys never fire twice.
- Persist volume, shuffle, repeat, and last-played track (not position) in `localStorage`. Window title shows "Artist – Title" while playing.
- Play count per track increments when a track plays ≥ 30 s or to its end; Recently played = last 50 distinct tracks. Both saved in the store.

**Playlists with images (core request)**
- Create (default name "My Playlist #N"), rename, description (max 300 chars), delete, add/remove tracks, drag-to-reorder rows, duplicates allowed.
- **Cover image:** "Choose image…" opens a native file dialog (png/jpg/jpeg/webp/gif, ≤ 20 MB). Main process decodes the file in a throw-away script-isolated hidden window (so png/jpg/webp/gif and EXIF rotation all work; `nativeImage` cannot read webp/gif), crops to a centered square, resizes to 640×640, saves JPEG q88 to `userData/playlist-images/<playlistId>-<timestamp>.jpg`, and stores the filename on the playlist. Old image file is deleted on replace/remove. "Remove image" reverts to the fallback.
- Fallback cover when no image is set: 2×2 mosaic of the first four distinct album arts in the playlist; 1 art → single; 0 → placeholder tile.
- Edit dialog (click cover or name in playlist header, or "Edit details"): name, description, current cover preview, Choose image, Remove image, Save/Cancel.
- Playlist cover appears in the sidebar list, Home tiles, Library, Search results and the playlist header.

**Branding & visual**
- App name **Localify**. Logo: modern minimalist cute smiley — see Visual templates for exact SVG. No Spotify name, logo, or trademarked assets anywhere.

## Non-goals / out of scope
Streaming, any Spotify/online API, recommendations, podcasts, lyrics, equalizer, crossfade/gapless, visualizer, smart playlists, scrobbling, tag editing, multi-user, cloud sync, macOS/Linux packaging, auto-update, installer signing, Windows system media overlay (SMTC).

## Inputs available to the executor
Only this prompt. Has code execution, file tools and npm access. No real user music is available; generate small test MP3s with ffmpeg if present (with tags and embedded art) to test the scanner.

## Mechanization map
| Mechanic | Class | How to do it |
|---|---|---|
| Directory walk, extension filter, mtime/size diff | deterministic | Node code in `scanner.js`; unit-test with generated files |
| Tag parsing, art hash/dedupe | deterministic | `music-metadata` + `crypto.sha1`; never hand-parse |
| Track id, album key, search normalization | deterministic | `sha1(lower(path)).slice(0,16)`; album key `lower(albumArtist‖artist) + "\u0001" + lower(album)`; normalize search with `toLowerCase().normalize('NFD').replace(/\p{M}/gu,'')` |
| Shuffle | deterministic | Fisher–Yates on upcoming items only |
| Range-request file streaming (seek) | deterministic | Explicit `Range` parsing → 206 + `Content-Range`; test with a real range request |
| Image crop/resize | deterministic | Electron `nativeImage` in main; renderer never touches raw paths |
| Virtualized list windowing | deterministic | first = floor(scrollTop/56) − 8, last = first + ceil(viewport/56) + 16 |
| Screens, components, spacing | structural/template | Tokens and component rules below, verbatim |
| Greeting copy, empty-state wording | judgment | Short, warm, ≤ 8 words. e.g. "Good evening", "Add a folder to fill this up" |

### Visual / graphic templates
**Tokens (CSS variables):** `--bg:#0b0b0c; --panel:#121214; --panel-2:#1a1a1d; --hover:#242428; --line:#2a2a2f; --text:#f4f4f5; --sub:#a1a1aa; --accent:#34e07a; --accent-ink:#04210f; --danger:#ff6b6b; --radius:10px; --radius-sm:6px;` Font: `"Segoe UI", system-ui, sans-serif`. Type scale px: 12 caption, 14 body, 16 row title, 20 section, 32 page title, 56 hero (weight 800). Spacing unit 8 px; panel gap 8 px; main padding 24 px.
**Layout grid:** `grid-template-columns: 300px 1fr; grid-template-rows: 1fr 88px;` Sidebar = two stacked panels (nav 120 px; library flex) with `--panel` bg and `--radius`; main = one scrolling panel with a sticky 64 px top bar (blurred `--panel`); player bar spans full width, `--bg`, 3 columns `1fr 2fr 1fr` (track info | controls+seek | volume+queue).
**Cards:** 180 px min grid (`repeat(auto-fill,minmax(180px,1fr))`), 12 px padding, `--panel-2` bg, square art with `--radius-sm`; hover → `--hover` and a 44 px accent circular Play button slides up bottom-right of the art. Artist cards use fully round art.
**Buttons:** primary Play = 56 px accent circle with `--accent-ink` glyph; icon buttons 32 px, `--sub` → `--text` on hover; active toggles (shuffle/repeat) accent with a dot underneath.
**Seek/volume sliders:** 4 px track `--line`, fill `--text` (accent on hover), 12 px thumb visible on hover only.
**Track row:** 56 px, grid `48px 6fr 4fr 40px 64px`, hover `--hover`, art 40 px.
**Icons:** inline SVG, 24 px grid, 2 px stroke, rounded caps; no icon font, no CDN.
**Logo (`assets/logo.svg`, 64×64 viewBox):** `<circle cx="32" cy="32" r="30" fill="#34e07a"/>`, eyes `<circle cx="23" cy="26" r="3.6" fill="#04210f"/>` and `<circle cx="41" cy="26" r="3.6" fill="#04210f"/>`, smile `<path d="M20 38 Q32 49 44 38" stroke="#04210f" stroke-width="4" stroke-linecap="round" fill="none"/>`, cheeks `<circle cx="16" cy="36" r="3" fill="#04210f" opacity=".12"/>` and `<circle cx="48" cy="36" r="3" fill="#04210f" opacity=".12"/>`. Sidebar header shows logo 28 px + wordmark "Localify" (weight 800, 20 px). Same SVG is the window icon source and favicon.
**Empty / loading / error states:** empty library → centered logo 96 px, "Welcome to Localify", "Add a folder to fill this up", primary button "Add music folder". Empty playlist → "Nothing here yet" + "Add songs from Songs or Search". No search results → "No results for “q”". Scanning → thin 2 px accent progress bar under the top bar plus "Scanning… N files". Missing file during playback → toast "Skipped: file not found" (3 s, bottom center above player) and auto-next.

## Security & sensitivity flags
| Surface | Why sensitive | Safe default | Executor should… |
|---|---|---|---|
| ⚠️ Custom file-serving protocols (`localify://media`, `art`, `pl`) | Renderer could request arbitrary disk files | Resolve only by **id/hash/filename looked up in the store**; reject anything else with 404; never accept raw paths; `pl` filenames must match `^[\w.-]+\.jpg$` and be resolved inside `playlist-images/` | Implement exactly; human reviews `protocols.js` |
| ⚠️ Electron renderer hardening | Remote/injected content would get Node access | `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, preload exposes a fixed API only, CSP meta (`default-src 'self'; img-src 'self' localify: data:; media-src localify:; style-src 'self' 'unsafe-inline'`), block `will-navigate` and `setWindowOpenHandler` (deny) | Implement exactly; human reviews |
| ⚠️ Image upload | Malformed/huge files | Size ≤ 20 MB, decode in an isolated hidden window and validate the result is 640×640 via `nativeImage`, always re-encode to JPEG (never copy original), generated filenames only | Implement; test a non-image renamed `.png` |
| ⚠️ Tags/filenames rendered in UI | HTML injection via a crafted tag | Escape every interpolated string with `esc()`; never use `innerHTML` with unescaped data | Implement; test a tag containing `<img onerror>` |
| Personal data | Listening history stored locally | Stays in `userData`; no network | None; mention in GETTING_STARTED |
| Secrets/auth/payments | — | None exist | None found |
| Seam main↔renderer (IPC) | Trust boundary | Main validates every argument type/length; ids must exist; renderer never sends paths except via dialogs run in main | Implement; human reviews `ipc.js` |

## Setup & onboarding
Requires `GETTING_STARTED.md` (beginner level) covering: what Localify is; stack (Node.js = runs JavaScript outside a browser, npm = installs packages, Electron = turns web pages into desktop apps, music-metadata = reads song tags); prerequisites (Windows 10, Node.js 20+ LTS from nodejs.org, check `node -v`); numbered setup (`cd` to folder, `npm install`, `npm start`) with expected output; first-run walkthrough (add folder); optional `npm run dist` for a portable `.exe` (mark as untested on the build machine if not verified); where data lives (`%APPDATA%\Localify`, set via `productName` in package.json) and how to reset; verify check; three likely errors (npm not recognized → reinstall Node/restart terminal; `npm install` fails/blocked by antivirus or proxy; blank window/"Electron failed to install correctly" → delete `node_modules`, rerun). No secrets or API keys exist; state that. Cross-reference the security flags (app is offline, serves only indexed files).

## Success criteria
- [ ] `npm install && npm start` opens Localify with no console errors on a clean Windows 10 machine (verified here: scanner tests + headless Electron launch/screenshot).
- [ ] Scanner indexes generated MP3s with correct tags and art, skips unchanged files on rescan, and marks deleted files unavailable.
- [ ] A range request to `localify://media/<id>` with `Range: bytes=100-` returns 206 with correct `Content-Range`; a fabricated id returns 404.
- [ ] Playing, pausing, seeking, next/prev, shuffle, repeat all/one, queue editing work.
- [ ] Create playlist → choose image → cover crops square and persists across restart; remove image → mosaic fallback.
- [ ] Search returns songs/artists/albums/playlists for accent-insensitive queries.
- [ ] A track titled `<img src=x onerror=alert(1)>` renders as text.
- [ ] 20,000 synthetic tracks: Songs view scrolls with < 150 DOM rows.
- [ ] No Spotify name/logo anywhere; logo matches the SVG above.
- [ ] `GETTING_STARTED.md` and (after offer) `HANDOFF.md` exist.

## Edge cases & failure handling
- Unreadable/corrupt file or tag parse error → index with filename fallbacks, `durationSec:0`, log once, never abort the scan.
- File vanishes during playback → toast + skip.
- Unicode / very long / network-drive paths → handled as plain strings; no path assumptions beyond `path` module.
- Two folders overlapping → dedupe by track id.
- Same album name by different artists → separate albums (album key includes albumArtist/artist). Compilation with varying artists but same `albumArtist` → one album.
- Playlist references a track id no longer in library → keep slot, render "Unavailable track".
- Store file corrupt/unparseable → rename to `library.corrupt-<ts>.json`, start empty, show toast.
- Rapid next-clicks → latest request wins; no stacked audio.
- Empty queue at end with repeat off → stop, reset to the first track paused.
- Image dialog cancelled → no change.

---

## EXECUTABLE PROMPT (copy-paste to a fresh instance)

```
You are a senior engineer with code execution, file tools and npm access. Build **Localify**: an offline Windows 10 desktop music player (Electron) that looks and navigates like Spotify but plays only the user's local audio files, and lets them customize playlists with images. Deliver a project folder that runs with `npm install && npm start`. Work in a new empty directory. Test what you can in your Linux sandbox (unit-test the scanner with ffmpeg-generated tagged MP3s; try launching Electron under xvfb and capture a screenshot); say plainly what you could not test (Windows-specific: media keys, `npm run dist`).

STACK: Electron (current stable), vanilla HTML/CSS/JS renderer with classic <script> tags (no bundler/framework), dependency `music-metadata` (ESM; use dynamic import() from CommonJS main). Library persisted as JSON in app.getPath('userData'). No native modules. No network use.

DATA SHAPES
Track {id, path, title, artist, albumArtist, album, trackNo, discNo, year, durationSec, artHash|null, addedAt(ms), mtimeMs, size, available(bool), plays(int)}
Playlist {id, name, description(≤300), image(filename|null), trackIds[], createdAt, updatedAt}
State {folders:[abs paths], tracks:[Track], playlists:[Playlist], liked:[trackId], recent:[trackId ≤50], lastScanAt}
Track id = sha1(lowercase absolute path).slice(0,16). Album key = lower(albumArtist||artist)+"\u0001"+lower(album).

LIBRARY: user adds folders via native picker. Recursive scan for .mp3 .flac .m4a .aac .wav .ogg .opus. Read title/artist/albumArtist/album/track/disc/year/duration/embedded art. Fallbacks: title=filename sans ext, artist "Unknown Artist", album "Unknown Album". Save each unique cover once to userData/art/<sha1 of bytes>.<jpg|png>. Incremental rescan: skip when mtimeMs+size unchanged; new files added; vanished files -> available:false (never deleted); reappearing -> available:true. Scan on launch (background) and on Rescan; emit progress events. Removing a folder removes its tracks (playlists keep ids and show "Unavailable track"). Corrupt file -> index with fallbacks, never abort. Corrupt store -> rename to library.corrupt-<ts>.json, start empty, toast. Dedupe overlapping folders by id.

PROTOCOLS (main): register privileged scheme `localify` (standard, secure, supportFetchAPI, stream). `localify://media/<trackId>` streams the indexed file with full Range support (parse Range, return 206 + Content-Range/Accept-Ranges/Content-Length, correct MIME by extension; 404 for unknown id/unavailable). `localify://art/<hash>` serves userData/art file for a known hash only. `localify://pl/<filename>` serves playlist-images only if filename matches ^[\w.-]+\.jpg$ and resolves inside that folder. Never accept raw paths.

IPC (contextBridge, fixed API; main validates every arg's type/length and that ids exist): getState, addFolder (dialog in main), removeFolder, rescan, onScanProgress, onState (library changed), createPlaylist, updatePlaylist(id,{name,description}), deletePlaylist, setPlaylistImage(id) (dialog in main: png/jpg/jpeg/webp/gif ≤20MB; decode in a hidden sandboxed BrowserWindow loading the file URL and drawing to a canvas (nativeImage cannot read webp/gif) - reject if not decodable; centered square crop; resize 640x640; JPEG q88; verify result is 640x640 with nativeImage; save userData/playlist-images/<id>-<ts>.jpg; delete previous; return updated playlist), clearPlaylistImage(id), addToPlaylist(id,trackIds), removeFromPlaylist(id,index), reorderPlaylist(id,from,to), toggleLike(trackId), recordPlay(trackId), onMediaKey(cb). Mutations return {playlists,liked,recent,tracksPlays?} and the renderer merges. Debounced atomic JSON writes (write temp + rename).

HARDENING: BrowserWindow with contextIsolation:true, nodeIntegration:false, sandbox:true; CSP meta in index.html: default-src 'self'; img-src 'self' localify: data:; media-src localify:; style-src 'self' 'unsafe-inline'. Block will-navigate; deny window.open. app.commandLine.appendSwitch('disable-features','HardwareMediaKeyHandling,MediaSessionService'); register globalShortcut MediaPlayPause/MediaNextTrack/MediaPreviousTrack -> renderer. Escape every interpolated string in the renderer with esc().

UI LAYOUT: CSS grid 300px sidebar | 1fr main; bottom player 88px spanning both. Sidebar: panel 1 = logo+wordmark "Localify", Home, Search, Songs; panel 2 = "Your Library" header with + (new playlist), chips Playlists/Albums/Artists, filter input, list (Liked Songs pinned first under Playlists; each row 48px art + name + subtitle). Main: sticky 64px top bar with back/forward + search box; views: Home (time-of-day greeting; Liked + up to 5 playlist quick tiles; Recently played; Recently added albums; empty-library CTA), Search (live, debounced 120ms, case/accent-insensitive via toLowerCase().normalize('NFD').replace(/\p{M}/gu,''); sections Songs/Artists/Albums/Playlists), Songs, Liked Songs, Playlist, Album, Artist (hero, Popular by plays then title, Albums grid), Queue, Settings (folders add/remove, rescan, counts, last scan time). Track table columns # | Title(art+title+artist) | Album | heart | duration; dblclick plays from row; playing row accent; unavailable rows dimmed, tooltip "File missing", skipped by playback. Track lists virtualized: 56px rows, render window first=floor(scrollTop/56)-8 to first+ceil(viewport/56)+16. Context menu (right-click or ⋯): Play next, Add to queue, Add to playlist ▸ (+ New playlist), Like/Unlike, Go to artist, Go to album, Remove from this playlist (inside playlists only). Sidebar playlist right-click: Edit details, Delete (in-app confirm modal). Playlist rows drag-to-reorder. Cards: auto-fill minmax(180px,1fr), 12px padding, hover shows 44px accent Play button bottom-right of art; artist art round.

PLAYBACK: HTML audio. Play/pause, prev (restart if >3s in else previous), next, seek with elapsed/remaining, volume + mute, shuffle (Fisher–Yates on upcoming only; turning off restores context order from current), repeat off->all->one. Queue view: Now playing + Next up, remove, click to jump. Play contexts build the queue from the list clicked. Keys: Space play/pause (not in inputs), Ctrl+Right/Left next/prev, Ctrl+Up/Down volume, Ctrl+F focus search. Persist volume/shuffle/repeat/last track in localStorage. Window title "Artist – Title". Count a play at ≥30s or on end; recent = last 50 distinct. Audio error / missing file -> toast "Skipped: file not found" (3s) and next. Queue end with repeat off -> stop and reset to first track paused. Rapid next clicks: latest wins.

PLAYLISTS WITH IMAGES: create (default "My Playlist #N"), rename, description, delete, add/remove tracks, reorder, duplicates allowed. Edit dialog (click cover/name in header or "Edit details"): name, description, cover preview, Choose image…, Remove image, Save/Cancel. Fallback cover when no image: 2x2 mosaic of first four distinct album arts (1 art -> single; 0 -> placeholder tile with note glyph). Cover appears in sidebar, Home tiles, Library, Search results, playlist header.

VISUAL TEMPLATE (use verbatim): CSS vars --bg:#0b0b0c; --panel:#121214; --panel-2:#1a1a1d; --hover:#242428; --line:#2a2a2f; --text:#f4f4f5; --sub:#a1a1aa; --accent:#34e07a; --accent-ink:#04210f; --danger:#ff6b6b; --radius:10px; --radius-sm:6px. Font "Segoe UI", system-ui. Type px: 12/14/16/20/32/56(hero, 800). Spacing 8px, panel gap 8px, main padding 24px. Panels --panel bg with --radius; player bar --bg, 3 cols 1fr 2fr 1fr (info | controls+seek | volume+queue). Primary Play = 56px accent circle, accent-ink glyph. Icon buttons 32px --sub->--text; active toggles accent + dot. Sliders: 4px track --line, fill --text (accent on hover), 12px thumb on hover only. Track row grid 48px 6fr 4fr 40px 64px, art 40px. Inline SVG icons 24px grid, 2px stroke, round caps; no icon font/CDN. LOGO (assets/logo.svg, viewBox 0 0 64 64): circle cx32 cy32 r30 fill #34e07a; eyes circles at (23,26) and (41,26) r3.6 fill #04210f; smile path "M20 38 Q32 49 44 38" stroke #04210f width 4 round caps no fill; cheeks circles (16,36) and (48,36) r3 fill #04210f opacity .12. Sidebar header = logo 28px + wordmark "Localify" (800, 20px); also favicon. Empty library: logo 96px, "Welcome to Localify", "Add a folder to fill this up", primary button "Add music folder". Empty playlist: "Nothing here yet" + "Add songs from Songs or Search". No results: No results for “q”. Scanning: 2px accent bar under top bar + "Scanning… N files". Do NOT use the name, logo or assets of Spotify anywhere.

NON-GOALS: streaming/online APIs, recommendations, podcasts, lyrics, EQ, crossfade/gapless, visualizer, smart playlists, scrobbling, tag editing, multi-user, sync, non-Windows packaging, auto-update, signing, system media overlay.

ALSO DELIVER: Start Localify.bat (starts the app without leaving a console open), .gitignore (node_modules, dist), `npm run dist` using electron-builder (--win portable), and GETTING_STARTED.md for a total beginner: what Localify is; the stack explained (Node.js, npm, Electron, music-metadata and why each is there); prerequisites with versions (Windows 10, Node.js 20+ LTS from nodejs.org, check `node -v`); numbered setup commands with expected output; first-run walkthrough; where data lives (%APPDATA%\Localify) and how to reset; a verify step; the three most likely errors with fixes (npm not recognized; npm install blocked/fails; Electron failed to install / blank window). State that no API keys or secrets exist and that the app is offline and only serves indexed files.

TESTS TO RUN: (1) ffmpeg-generate MP3s with tags + embedded art incl. accents (e.g. "Beyoncé"), one with title `<img src=x onerror=alert(1)>`, one corrupt; scan -> correct tags, art dedupe, rescan skips unchanged, deleting a file -> available:false. (2) Range request to localify://media/<id> -> 206 correct Content-Range; unknown id -> 404; art/pl path traversal attempts -> 404. (3) 20,000 synthetic tracks -> Songs view renders <150 rows. (4) Playlist image: crop/resize output is 640x640 JPEG; a non-image renamed .png is rejected. (5) Launch under xvfb and screenshot Home, a playlist, and the player bar.

HARD CONSTRAINTS (unmissable): offline only; renderer never receives raw file paths to open; every interpolated string escaped; no Spotify branding; do not store or ask for any credentials; do not claim anything works that you did not run — list untested items explicitly. Keep code minimal and readable; no features beyond this list.

When the build is complete, ask the user whether they want to run the Handoff skill to document this project for the next agent. If that skill isn't available, offer to write an equivalent HANDOFF.md covering architecture, key decisions and their rationale, integration contracts, and known gaps.
```

---

## Verification (rubric, single spec — dimension 8 N/A: not split, one stack/builder/success bar)
| Dimension | Score | Evidence |
|---|---|---|
| 1 Intent alignment | 5 | Local Spotify-style player, name Localify, smiley logo, playlist images, confirmed assumptions all present |
| 2 Specificity | 4 | Pixel/colour/size tokens, row heights, windowing formula; a few UI copy lines left to judgment with examples |
| 3 Completeness | 4 | Data shapes, IPC list, edge cases and non-goals explicit; delivery form decided (Electron) |
| 4 Unambiguity | 4 | Queue/shuffle/repeat semantics and id/album-key rules stated |
| 5 Executability | 5 | Prompt block inlines data shapes, protocols, IPC, visual tokens, logo SVG, tests, handoff offer |
| 6 Mechanization routing | 5 | Deterministic items routed to code/tests; templates supplied as tokens + SVG; judgment given criteria |
| 7 Sensitivity flagging | 5 | Protocol file serving, Electron hardening, image upload, HTML injection, IPC seam flagged ⚠️ |
| 8 Modular decomposition | N/A | Single spec by decision |
| 9 Onboarding & continuity | 5 | GETTING_STARTED.md required and scoped; handoff offer + HANDOFF.md fallback in prompt |

## Acceptance tests
Test 1 — Input: folder of 17 tagged MP3s (one with title `<img src=x onerror=alert(1)>`, one album sharing identical art). Good: all indexed; art stored once; title shown as literal text; rescan skips unchanged files.
Test 2 — Input: create a playlist, add songs from 4 albums, choose a wide JPG/WebP/GIF as cover, restart the app. Good: cover is a centered 640×640 square, persists; removing it falls back to a 2×2 mosaic; a text file renamed `.png` is rejected with a toast.
Test 3 — Input: 20,000 synthetic tracks, open Songs, jump scroll to the middle, press Space and Windows media keys. Good: < 150 DOM rows, rows update on scroll, playback toggles once per key press (not twice).
