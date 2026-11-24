// Walks the music folders, reads tags, extracts cover art, updates the store.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const EXTS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.wav', '.ogg', '.opus']);
// Only containers Chromium can play without bundling a decoder (no avi/wmv/flv).
const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv']);
const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');
const trackId = (p) => sha1(p.toLowerCase()).slice(0, 16);

async function walk(dir, out, exts = EXTS) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, exts);
    else if (e.isFile() && exts.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
}

let mmPromise;
const loadMm = () => (mmPromise ||= import('music-metadata'));

async function readTags(file, artDir) {
  const base = path.basename(file, path.extname(file));
  const t = { title: base, artist: 'Unknown Artist', albumArtist: '', album: 'Unknown Album', trackNo: 0, discNo: 0, year: 0, durationSec: 0, artHash: null };
  try {
    const mm = await loadMm();
    const { common, format } = await mm.parseFile(file, { duration: true, skipPostHeaders: true });
    t.title = (common.title || '').trim() || base;
    t.artist = (common.artist || '').trim() || 'Unknown Artist';
    t.albumArtist = (common.albumartist || '').trim();
    t.album = (common.album || '').trim() || 'Unknown Album';
    t.trackNo = common.track?.no || 0;
    t.discNo = common.disk?.no || 0;
    t.year = common.year || 0;
    t.durationSec = Math.round(format.duration || 0);
    const pic = common.picture?.[0];
    if (pic?.data?.length) {
      const hash = sha1(pic.data);
      const ext = /png/i.test(pic.format) ? 'png' : 'jpg';
      const out = path.join(artDir, `${hash}.${ext}`);
      if (!fs.existsSync(out)) await fsp.writeFile(out, pic.data);
      t.artHash = hash;
    }
  } catch (err) {
    console.warn('Tag read failed:', file, err.message);
  }
  return t;
}

// onProgress({done,total}); onChunk() called every ~1000 files so the UI can refresh.
async function scan(store, artDir, onProgress = () => {}, onChunk = () => {}) {
  fs.mkdirSync(artDir, { recursive: true });
  const files = [];
  for (const folder of store.state.folders) await walk(folder, files);
  const unique = [...new Map(files.map((f) => [trackId(f), f])).entries()];
  const seen = new Set();
  let done = 0;
  let next = 0;
  const now = Date.now();

  async function worker() {
    while (next < unique.length) {
      const [id, file] = unique[next++];
      seen.add(id);
      try {
        const st = await fsp.stat(file);
        const old = store.state.tracks[id];
        if (old && old.mtimeMs === st.mtimeMs && old.size === st.size) {
          old.available = true;
        } else {
          const tags = await readTags(file, artDir);
          store.state.tracks[id] = {
            id, path: file, ...tags,
            addedAt: old?.addedAt || now, mtimeMs: st.mtimeMs, size: st.size,
            available: true, plays: old?.plays || 0,
          };
        }
      } catch (err) {
        console.warn('Skipping', file, err.message);
      }
      done++;
      if (done % 25 === 0) onProgress({ done, total: unique.length });
      if (done % 1000 === 0) onChunk();
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  for (const t of Object.values(store.state.tracks)) if (!seen.has(t.id)) t.available = false;
  store.state.lastScanAt = Date.now();
  store.save();
  onProgress({ done: unique.length, total: unique.length });
  return unique.length;
}

// Videos are indexed by file only; duration and resume position come from the player.
async function scanVideos(store) {
  const files = [];
  for (const folder of store.state.videoFolders) await walk(folder, files, VIDEO_EXTS);
  const seen = new Set();
  const now = Date.now();
  for (const file of files) {
    const id = trackId(file);
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const st = await fsp.stat(file);
      const old = store.state.videos[id];
      store.state.videos[id] = {
        id, path: file, name: path.basename(file, path.extname(file)), ext: path.extname(file).slice(1).toLowerCase(),
        size: st.size, addedAt: old?.addedAt || now, available: true,
        dur: old?.dur || 0, pos: old?.pos || 0, watchedAt: old?.watchedAt || 0,
      };
    } catch (err) {
      console.warn('Skipping', file, err.message);
    }
  }
  for (const v of Object.values(store.state.videos)) if (!seen.has(v.id)) v.available = false;
  store.save();
  return seen.size;
}

module.exports = { scan, scanVideos, trackId, EXTS, VIDEO_EXTS };
