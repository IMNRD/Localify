// IPC handlers. Every argument is validated here; the renderer never sends file paths.
const { ipcMain, dialog, nativeImage, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { scan } = require('./scanner');
const { computeGroups } = require('./folders');
// Decodes any image Chromium can read (png/jpg/webp/gif, honours EXIF rotation) in a throw-away,
// script-isolated window, crops the centre square and returns a 640x640 JPEG buffer.
async function toSquareJpeg(file) {
  const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const timer = setTimeout(() => win.destroy(), 15000);
  try {
    await win.loadURL(pathToFileURL(file).href);
    const dataUrl = await win.webContents.executeJavaScript(`(async () => {
      const img = document.images[0];
      if (!img) throw new Error('not an image');
      await img.decode();
      const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
      if (!s) throw new Error('empty image');
      const c = document.createElement('canvas');
      c.width = c.height = 640;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 640, 640);
      return c.toDataURL('image/jpeg', 0.88);
    })()`);
    const jpg = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
    const size = nativeImage.createFromBuffer(jpg).getSize();
    if (size.width !== 640 || size.height !== 640) throw new Error('Could not read that image');
    return jpg;
  } catch {
    throw new Error('Could not read that image');
  } finally {
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
  }
}


const isStr = (s, max = 200) => typeof s === 'string' && s.length <= max;
const PL_ID = /^p[a-f0-9]{12}$/;
const norm = (p) => path.resolve(p).toLowerCase();
const isUnder = (p, folder) => { const n = norm(p), f = norm(folder); return n === f || n.startsWith(f + path.sep); };

function register({ store, getWin }) {
  const send = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  const artDir = path.join(store.dir, 'art');
  const imgDir = path.join(store.dir, 'playlist-images');
  fs.mkdirSync(imgDir, { recursive: true });
  let scanning = false, again = false;

  async function runScan() {
    if (scanning) { again = true; return; }
    scanning = true;
    send('scan-progress', { scanning: true, done: 0, total: 0 });
    try {
      await scan(store, artDir, (p) => send('scan-progress', { scanning: true, ...p }), () => send('state', store.snapshot()));
    } finally {
      scanning = false;
      send('scan-progress', { scanning: false });
      send('state', store.snapshot());
    }
    if (again) { again = false; runScan(); }
  }

  const playlist = (id) => {
    const p = PL_ID.test(id) && store.state.playlists.find((x) => x.id === id);
    if (!p) throw new Error('Playlist not found');
    return p;
  };
  const rmImage = (p) => {
    if (p.image) fs.rm(path.join(imgDir, p.image), { force: true }, () => {});
    p.image = null;
  };
  const touch = (p) => { p.updatedAt = Date.now(); store.save(); };
  const h = (name, fn) => ipcMain.handle(name, (_e, ...args) => fn(...args));

  h('getState', () => ({ ...store.snapshot(), recovered: store.recovered }));

  h('addFolder', async () => {
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openDirectory'], title: 'Choose a music folder' });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const dir = path.resolve(r.filePaths[0]);
    if (!store.state.folders.some((f) => norm(f) === norm(dir))) store.state.folders.push(dir);
    store.save();
    runScan();
    return { folders: store.state.folders, added: dir };
  });
  h('removeFolder', (folder) => {
    if (!isStr(folder, 1024)) throw new Error('Bad folder');
    store.state.folders = store.state.folders.filter((f) => norm(f) !== norm(folder));
    for (const t of Object.values(store.state.tracks)) {
      if (!store.state.folders.some((f) => isUnder(t.path, f))) delete store.state.tracks[t.id];
    }
    store.save();
    send('state', store.snapshot());
    return { folders: store.state.folders };
  });
  h('rescan', () => { runScan(); return true; });

  const rootArg = (root) => {
    if (root === null || root === undefined) return null;
    const known = isStr(root, 1024) && store.state.folders.find((f) => norm(f) === norm(root));
    if (!known) throw new Error('Unknown folder');
    return known;
  };
  h('getFolderGroups', (root) =>
    computeGroups(store.state, rootArg(root)).map((g) => ({ key: g.key, name: g.name, rel: g.rel, count: g.tracks.length })));
  h('createPlaylistsFromFolders', (keys) => {
    if (!Array.isArray(keys) || keys.length > 2000 || !keys.every((k) => isStr(k, 12))) throw new Error('Bad folders');
    const wanted = new Set(keys);
    const groups = computeGroups(store.state).filter((g) => wanted.has(g.key));
    const now = Date.now();
    for (const g of groups) {
      store.state.playlists.push({ id: 'p' + crypto.randomBytes(6).toString('hex'), name: g.name, description: '', image: null,
        trackIds: g.tracks.map((t) => t.id), createdAt: now, updatedAt: now, sourceKey: g.key });
    }
    store.save();
    return { created: groups.length, ...store.lite() };
  });

  h('createPlaylist', (name) => {
    const n = store.state.playlists.length + 1;
    const clean = isStr(name, 100) && name.trim() ? name.trim() : `My Playlist #${n}`;
    const p = { id: 'p' + crypto.randomBytes(6).toString('hex'), name: clean, description: '', image: null, trackIds: [], createdAt: Date.now(), updatedAt: Date.now() };
    store.state.playlists.push(p);
    store.save();
    return { id: p.id, ...store.lite() };
  });
  h('updatePlaylist', (id, patch) => {
    const p = playlist(id);
    if (patch && isStr(patch.name, 100) && patch.name.trim()) p.name = patch.name.trim();
    if (patch && isStr(patch.description, 300)) p.description = patch.description;
    touch(p);
    return store.lite();
  });
  h('deletePlaylist', (id) => {
    const p = playlist(id);
    rmImage(p);
    store.state.playlists = store.state.playlists.filter((x) => x !== p);
    store.save();
    return store.lite();
  });
  h('addToPlaylist', (id, ids) => {
    const p = playlist(id);
    if (!Array.isArray(ids) || ids.length > 5000) throw new Error('Bad tracks');
    for (const t of ids) if (isStr(t, 16) && store.state.tracks[t]) p.trackIds.push(t);
    touch(p);
    return store.lite();
  });
  h('removeFromPlaylist', (id, index) => {
    const p = playlist(id);
    if (!Number.isInteger(index) || index < 0 || index >= p.trackIds.length) throw new Error('Bad index');
    p.trackIds.splice(index, 1);
    touch(p);
    return store.lite();
  });
  h('reorderPlaylist', (id, from, to) => {
    const p = playlist(id);
    const ok = (i) => Number.isInteger(i) && i >= 0 && i < p.trackIds.length;
    if (!ok(from) || !ok(to)) throw new Error('Bad index');
    p.trackIds.splice(to, 0, p.trackIds.splice(from, 1)[0]);
    touch(p);
    return store.lite();
  });

  h('setPlaylistImage', async (id) => {
    const p = playlist(id);
    const r = await dialog.showOpenDialog(getWin(), {
      title: 'Choose a playlist cover', properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const file = r.filePaths[0];
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('Image is larger than 20 MB');
    const jpg = await toSquareJpeg(file);
    const name = `${p.id}-${Date.now()}.jpg`;
    fs.writeFileSync(path.join(imgDir, name), jpg);
    rmImage(p);
    p.image = name;
    touch(p);
    return { canceled: false, ...store.lite() };
  });
  h('clearPlaylistImage', (id) => { const p = playlist(id); rmImage(p); touch(p); return store.lite(); });

  h('toggleLike', (trackId) => {
    if (!isStr(trackId, 16) || !store.state.tracks[trackId]) throw new Error('Unknown track');
    const l = store.state.liked;
    const i = l.indexOf(trackId);
    if (i >= 0) l.splice(i, 1); else l.unshift(trackId);
    store.save();
    return store.lite();
  });
  h('recordPlay', (trackId) => {
    const t = isStr(trackId, 16) && store.state.tracks[trackId];
    if (!t) return null;
    t.plays = (t.plays || 0) + 1;
    store.state.recent = [trackId, ...store.state.recent.filter((x) => x !== trackId)].slice(0, 50);
    store.save();
    return { trackId, plays: t.plays, recent: store.state.recent };
  });

  return { runScan, send };
}

module.exports = { register };
