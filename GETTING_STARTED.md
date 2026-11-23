# Getting started with Localify

## What this is
Localify is a music player that runs on your Windows 10 computer. It looks and works like Spotify, but it plays the music files **already on your PC** (MP3, FLAC, M4A, WAV, OGG). It needs no internet, no account and no subscription. You can make playlists and give each one a cover picture.

## What's inside (the tech stack)
| Piece | What it is | Why it's here |
|---|---|---|
| **Node.js** | Lets JavaScript run on your computer, outside a web browser | Needed to install and start the app |
| **npm** | Node's installer for add-on code ("packages"); comes with Node.js | Downloads the packages Localify uses |
| **Electron** | Turns a web page into a real desktop app window | It's what makes Localify open like a normal program |
| **music-metadata** | A small package that reads song info (title, artist, cover art) from music files | Fills your library without you typing anything |

Everything else (the screens, player and playlists) is plain HTML, CSS and JavaScript inside the `src` folder.

## Before you start
- Windows 10 (64-bit).
- **Node.js 20 LTS or newer.** Download the "LTS" installer from <https://nodejs.org> and accept the defaults.
  Check it worked: open **Command Prompt** (press the Windows key, type `cmd`, press Enter) and run `node -v`. You should see something like `v22.11.0`.
- About 400 MB of free disk space (Electron is large).

## Setup (easy way)
1. Install Node.js (see above) and put the Localify folder somewhere permanent.
2. Double-click **`Install Localify.bat`**. It checks Node.js, downloads the components, and adds a **Localify icon to your Desktop and Start menu**. It then offers to start the app.
3. From then on, start Localify from that icon (or `Start Localify.bat`).

To remove it, close Localify and double-click **`Uninstall Localify.bat`**. It removes the icons and the downloaded components, and asks before deleting your library and playlists (kept by default). Your music files are never touched. Afterwards you can delete the folder yourself.

## Setup (manual way)
1. Unzip the `localify` folder somewhere permanent, for example `C:\Users\YourName\localify`.
2. Open Command Prompt and go to the folder:
   ```
   cd C:\Users\YourName\localify
   ```
   *Expected:* the prompt now ends with `localify>`.
3. Install the packages (needs internet, once):
   ```
   npm install
   ```
   *Expected:* a minute or two of progress, ending with a line like `added 300 packages` (a few "deprecated" or "audit" warnings are normal).
4. Start Localify:
   ```
   npm start
   ```
   *Expected:* a window titled **Localify** opens showing a smiley logo and "Welcome to Localify".

**Next time:** double-click **`Start Localify.bat`** in the folder. (A small minimized Command Prompt window stays in your taskbar while the app runs. Closing Localify closes it.)

## Desktop icon (only if you set up manually)
1. Right-click `Start Localify.bat` → **Send to** → **Desktop (create shortcut)**, and rename the shortcut "Localify".
2. Right-click the new shortcut → **Properties** → **Change Icon…** → **Browse…**, pick `assets\icon.ico` in the Localify folder, then **OK** → **OK**.
3. Optional: right-click the shortcut → **Pin to taskbar** (or **Pin to Start**).

## Your first minute
1. Click **Add music folder** and pick the folder that holds your music (subfolders are included).
2. Wait a few seconds. A thin green line under the search bar shows the scan. Your songs, albums and artists appear.
3. Click the **+** next to "Your Library" to create a playlist. Click its cover (or the pencil) → **Choose image…** to give it a picture. Right-click any song → **Add to playlist**.
4. Added or moved files? Open **Settings** (gear icon) → **Rescan**. Localify also rescans every time it starts.

## Settings, shortcuts, data
- **Keys:** Space = play/pause, Ctrl+→ / Ctrl+← = next / previous, Ctrl+↑ / Ctrl+↓ = volume, Ctrl+F = search. Keyboard media keys (play/pause, next, previous) work too.
- **Where your data lives:** `%APPDATA%\Localify` (paste that into the File Explorer address bar). It holds your library index, playlists, extracted album art and playlist covers. Your music files are never changed or copied.
- **Start fresh:** close Localify and delete that folder.

## Configuration, keys and security
Localify has **no API keys, passwords or accounts**, so there is nothing secret to set up and nothing to hide from Git. It never connects to the internet while running. It only plays files from the folders you add; the app can't read any other file on your PC. Your listening history stays in the folder above.

## Verify it worked
Add a folder, double-click a song: you should hear it, the bar at the bottom should show the title and a moving progress line, and dragging that line should jump within the song.

## Optional: make a single .exe
```
npm run dist
```
This builds a portable `Localify.exe` into the `dist` folder (takes a few minutes and downloads extra tools). Windows may show a "Windows protected your PC" warning because the file isn't code-signed; choose **More info → Run anyway** (only for a file you built yourself). *This step has not been tested by the author.*

## If something goes wrong
1. **`'npm' is not recognized as an internal or external command`**: Node.js isn't installed, or Command Prompt was open during install. Install Node.js (see above), then close and reopen Command Prompt and try again.
2. **`npm install` fails or hangs** (red `npm ERR!` lines, `ETIMEDOUT`, or antivirus messages): check your internet connection, pause any antivirus that blocks downloads for a minute, or try another network. Then delete the `node_modules` folder and run `npm install` again.
3. **`Electron failed to install correctly` or a window that never opens**: delete the `node_modules` folder, run `npm install` again, then `npm start`. If the window opens but is blank, run `npm start` and look at the Command Prompt for a red error message to search for.
