# Localify for Android: port plan

Status: **Phase 0 built** (test APK; see below). Branch: `LocalifyAndroidPort`.

### Phase 0 result
- **Built:**
  - `android/`: the Capacitor 8 project.
  - `MediaLibraryPlugin.java`: lists the phone's audio and video through MediaStore.
  - `MediaServer.java`: serves `/_localify/media|video/<id>` with real Range support, and only files the plugin listed.
  - `src/android/api-android.js`: the read-only `window.api`.
  - `scripts/android-web.js`: builds `build/android-web` with the Android CSP and a stopgap phone layout (`src/android/android.css`).
  - `.github/workflows/android.yml`: a signed APK published at `releases/latest`.
- **Seeking:** Capacitor's own file server answers Range requests with a correct header but always streams from byte 0, which breaks seeking. That's why `MediaServer` replaces it for media.
- **Verified here:**
  - `npm test`, including `test/api-android.test.js`.
  - The desktop smoke test.
  - The signed release APK builds with Gradle. Its signature, permissions and bundled files were checked with `apksigner` and `aapt`.
  - The Android web build runs in Chromium with stand-ins for the plugin and MediaServer: a song plays and seeks, and an MP4 plays and seeks, with no console errors.
- **Not verified:** a real phone or emulator. No emulator could run in the build machine (no hardware virtualization). The first test on a phone is the real Phase 0 check. Each phase ends with a check you can see working before the next one starts.

## Goal
The same Localify on an Android phone: music library, playlists with covers, liked songs, queue, shuffle/repeat, search, Videos with sorting and resume, and the same look, adapted to a touch screen. Installed by tapping a downloaded `.apk` file. No Play Store, no account, no internet.

## Approach: wrap the existing app with Capacitor
[Capacitor](https://capacitorjs.com) puts a web app inside a real Android app. Localify's interface is already plain HTML/CSS/JavaScript (`src/renderer/`), and it talks to the rest of the app only through one object, `window.api`. So the plan is:

- **Keep** the renderer (`core.js`, `player.js`, `app.js`, `styles.css`, `index.html`) as the single interface for both desktop and phone.
- **Replace** what sits behind `window.api`. Today that is Electron's main process, written for Node.js. On Android it becomes `api-android.js` (JavaScript in the app) plus one small native plugin for the jobs JavaScript can't do on a phone.
- **Keep** the Windows app working and tested throughout. Nothing desktop-only is removed.

Rejected options:
- **React Native or Flutter:** the whole interface would be rewritten, and the two apps would drift apart.
- **A plain web page (PWA):** it can't list the music folders on a phone or play in the background reliably.

## What maps to what

| Desktop today (Electron) | Android (Capacitor) |
|---|---|
| `main.js` window, hardening, single instance | Capacitor's Android activity (`android/` project) |
| `store.js` writes `library.json` with Node `fs` | Same JSON shape, saved with `@capacitor/filesystem` in the app's private storage |
| `scanner.js` walks folders, reads tags with `music-metadata` | Native plugin asks Android's **MediaStore** (the phone's own media index) for audio and video files in the chosen folders. Title, artist, album, track number, year and duration come with it, so no tag parsing is needed. |
| Album art extracted to `art/<sha1>.jpg` | Plugin saves Android's album thumbnail once per album to the app cache |
| Folder dialog ("Add music folder") | A list of the phone's folders that hold music (or video); tick the ones to add |
| `localify://media`, `art`, `pl`, `video` protocol | `Capacitor.convertFileSrc(path)` (served from `http://localhost/_capacitor_file_/…`). All URLs go through one new helper, `api.url(kind, id)`, so the renderer stops hard-coding `localify://`. |
| `toSquareJpeg` (hidden window crops the cover) | The phone's image picker (`<input type="file" accept="image/*">`), then the same centre-square crop on a canvas in the page |
| Playlist, like, play count and video progress logic inside `ipc.js` | Moved to a shared `src/shared/library.js` used by both `ipc.js` and `api-android.js`, so it's written and tested once |
| `folders.js` subfolder → playlist | Same file, made browser-safe (no Node `path`/`crypto`) and shared |
| Media keys (`globalShortcut`) | Android media session: lock-screen and notification controls, headphone buttons, Bluetooth |
| Music keeps playing when the window is minimised | A native foreground media service keeps playback alive with the screen off (Android stops a backgrounded web view otherwise) |
| `GETTING_STARTED.md` `.bat` scripts | `npm run android:sync` / `android:open` / `android:apk`, plus a GitHub Actions build that publishes a ready-to-install APK |

## Interface changes for a phone
The desktop layout stays as it is. Below 700 px wide the same page switches to:

- **Bottom tab bar:** Home, Search, Music, Videos, Library. The sidebar's "Your Library" (playlists, albums, artists chips and filter) becomes the Library tab.
- **Mini player** above the tab bar (cover, title, play/pause). Tapping it opens a **full-screen Now Playing** sheet with the seek bar, shuffle, repeat, like and queue.
- **Settings gear** stays top right.
- **Touch instead of mouse:**
  - A single tap plays a row (desktop needs a double-click).
  - Long-press or the ⋯ button opens the track menu (desktop uses right-click).
  - Buttons that only appear on hover (play on cards, like and ⋯ on rows) are always visible.
  - Playlist reordering uses a drag handle on each row; desktop drag-and-drop doesn't work with fingers.
- **Videos:**
  - Tapping a video opens it full screen in landscape, using `@capacitor/screen-orientation`.
  - The phone's back gesture leaves the video, saving its position like on desktop.
- **Sizing:** tap targets are at least 44 px, safe-area padding keeps controls clear of the notch and gesture bar, and the existing 56 px rows and list virtualisation stay unchanged.

## Phases

### Phase 0: prove the risky parts (spike)
1. Add Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, v8) and generate the `android/` project. The web folder is `src/renderer`.
2. Add a stub `api-android.js` so the app opens on the phone with an empty library.
3. Build a minimal native plugin method that lists audio files from MediaStore.
4. Play one file with `convertFileSrc`, and confirm **seeking works**. Capacitor's docs don't say whether its local file server supports range requests. If it doesn't, the plugin serves files to the web view itself.
5. Play an MP4 and an MKV in `<video>`.

**Check:** on a real phone or the emulator, a song plays and seeks, and a video plays. Report what failed before building more.

### Phase 1: same features, desktop layout
1. Move the pure library logic into `src/shared/library.js` and `src/shared/folders.js`. Desktop `npm test` and `test/smoke.js` must still pass unchanged.
2. Implement every `window.api` method in `api-android.js`. All 19 methods and the 3 events (state, scan progress, media keys) are listed in `src/main/preload.js`.
3. Add the `api.url()` helper on both platforms. Update the Content-Security-Policy in `index.html` to allow `http://localhost` on Android while keeping it strict on desktop.
4. Ask for media permissions (`READ_MEDIA_AUDIO` and `READ_MEDIA_VIDEO` on Android 13+, `READ_EXTERNAL_STORAGE` on 12 and older) with a clear explanation screen.

**Check:**
- A Node test runs `api-android.js` against a fake plugin and covers every method and validation rule.
- On the phone, add a folder, play music, make a playlist with a cover, and like a song.
- Close the app, reopen it, and everything is still there.

### Phase 2: phone interface
1. Add the responsive CSS and touch handling described above, behind one `body.touch` class.
2. Add a full-screen video page with landscape mode and back-gesture handling.

**Check:** the desktop smoke test still passes. A new emulator run, `test/android-smoke.md` (a written checklist, plus screenshots at 412×915), covers every tab, the Now Playing sheet, long-press menus, reordering and video resume.

### Phase 3: background playback and controls
1. Add a native foreground media service with a media session. The music keeps going with the screen off, the lock screen and notification show controls, and headphone and Bluetooth buttons work. The service calls the existing `P.toggle`, `P.next` and `P.prev`.
2. Restore volume, shuffle, repeat and the last track as on desktop.

**Check:** play a playlist, lock the phone, and it advances through tracks. The controls work from the lock screen and from a Bluetooth headset.

### Phase 4: packaging so it's easy to install
1. Add the app name, the smiley icon (adaptive icon from `assets/logo.svg`) and a splash colour.
2. Add npm scripts: `android:sync`, `android:open`, `android:apk`.
3. Create one signing key, kept out of Git. A GitHub Actions workflow builds a **signed release APK** and attaches it to a GitHub Release. You then open the Release page on your phone and tap the APK to install it.
4. Write the Android section of `GETTING_STARTED.md` for real, and add the Android parts to `HANDOFF.md`.

**Check:** a fresh install from the downloaded APK on a phone that never had Localify works. Installing the next build over it keeps your library, which only works when both builds are signed with the same key.

## Risks and open questions
- **Signing key:** every update must be signed with the same key, or Android refuses to install it over the old one. Losing the key means uninstalling, which loses the library. Back the key up somewhere safe.
- **Seeking:** whether Capacitor's file server supports seeking is unknown until Phase 0. The fallback is serving files from the plugin.
- **Video formats:** the phone's Android version and hardware decide what plays. MP4 (H.264) and WebM are safe. Some MKV and MOV files, and HEVC/H.265 on older phones, may not play.
- **Missing tags:** MediaStore tags are usually good. For files Android hasn't tagged, Localify shows the filename and "Unknown Artist", the same as desktop.
- **Background limits:** some phone makers (Samsung, Xiaomi) stop background apps aggressively. Localify may need to ask to be excluded from battery optimisation.
- **Data:** library data is separate per device. Phone and PC are **not** synced; syncing is out of scope, as on desktop.
- **Play Store:** not planned. Publishing would add a developer account, a privacy policy and review.

## What stays the same
- No network use, no accounts, no tracking.
- The same id formats and validation rules (`HANDOFF.md` §6). The renderer still escapes everything.
- The desktop app, its scripts and its tests.
