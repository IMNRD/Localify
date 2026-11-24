// Android stand-in for the Electron preload API (window.api).
// Lists and plays the songs and videos inside the folders the user picked. Editing (playlists,
// likes, play counts, video resume) arrives in Phase 1; until then those calls explain that.
(function (root) {
  'use strict';
  const VIDEO_EXTS = ['mp4', 'm4v', 'webm', 'mov', 'mkv']; // same list as the desktop scanner
  // shortcut: chosen folders live in WebView localStorage (survives restarts, lost if app data is cleared); Phase 1 moves them into library.json.
  const KEY = 'lf.android.folders';
  function loadFolders(store) {
    try {
      const f = JSON.parse(store.getItem(KEY));
      if (f && Array.isArray(f.music) && Array.isArray(f.video)) return f;
    } catch {}
    return { music: [], video: [] };
  }
  function saveFolders(store, f) { try { store.setItem(KEY, JSON.stringify(f)); } catch {} }

  const base = (p) => String(p || '').split('/').pop();
  const stem = (p) => base(p).replace(/\.[^.]*$/, '');
  const ext = (p) => (/\.([^./]+)$/.exec(base(p)) || [])[1]?.toLowerCase() || '';
  // MediaStore reports missing tags as "<unknown>".
  const tag = (s, fallback) => (s && s !== '<unknown>' ? String(s).trim() || fallback : fallback);

  function toTrack(a) {
    const n = Number(a.track) || 0; // MediaStore stores disc * 1000 + track
    return {
      id: a.id, path: a.path, title: tag(a.title, stem(a.path)), artist: tag(a.artist, 'Unknown Artist'), albumArtist: '',
      album: tag(a.album, 'Unknown Album'), trackNo: n % 1000, discNo: Math.floor(n / 1000), year: Number(a.year) || 0,
      durationSec: Math.round((Number(a.duration) || 0) / 1000), artHash: null, addedAt: (Number(a.dateAdded) || 0) * 1000,
      mtimeMs: 0, size: Number(a.size) || 0, available: true, plays: 0,
    };
  }
  function toVideo(v) {
    return {
      id: v.id, path: v.path, name: stem(v.path), ext: ext(v.path), size: Number(v.size) || 0,
      addedAt: (Number(v.dateAdded) || 0) * 1000, available: true, dur: (Number(v.duration) || 0) / 1000, pos: 0, watchedAt: 0,
    };
  }
  function toState(r, folders) {
    const ok = r && r.granted;
    const tracks = ok ? (r.audio || []).filter((a) => a.id && a.path).map(toTrack) : [];
    const videos = ok ? (r.video || []).filter((v) => v.id && VIDEO_EXTS.includes(ext(v.path))).map(toVideo) : [];
    return {
      folders: folders.music.slice(), videoFolders: folders.video.slice(), tracks, videos,
      playlists: [], liked: [], recent: [], lastScanAt: Date.now(), recovered: false,
    };
  }

  function createApi(Media, store) {
    const on = (set) => (cb) => { set.add(cb); return () => set.delete(cb); };
    const stateCbs = new Set(), scanCbs = new Set(), keyCbs = new Set();
    const toast = (msg) => root.L && root.L.toast && root.L.toast(msg);
    const folders = loadFolders(store);
    async function load() {
      scanCbs.forEach((cb) => cb({ scanning: true, done: 0, total: 0 }));
      try {
        const r = await Media.list({ music: folders.music, video: folders.video });
        if ((folders.music.length || folders.video.length) && !(r && r.granted)) toast('Allow Localify to read your music and videos: phone Settings → Apps → Localify → Permissions');
        return toState(r, folders);
      } finally { scanCbs.forEach((cb) => cb({ scanning: false })); }
    }
    async function rescan() { const st = await load(); stateCbs.forEach((cb) => cb(st)); return st; }
    // Adds a folder from Android's picker to `kind` ('music' | 'video'); returns its path, or null when cancelled.
    async function pick(kind) {
      const r = await Media.pickFolder();
      if (r && r.unsupported) toast("That folder can't be used. Pick one inside Internal storage or the SD card.");
      if (!r || !r.path) return null;
      const list = folders[kind];
      if (!list.includes(r.path)) { list.push(r.path); saveFolders(store, folders); }
      await rescan();
      return r.path;
    }
    function remove(kind, folder) {
      folders[kind] = folders[kind].filter((f) => f !== folder);
      saveFolders(store, folders);
      rescan().catch(() => {});
      return folders[kind].slice();
    }
    const later = () => {
      toast('Editing comes in the next Android update');
      return Promise.reject(new Error('Not available on Android yet'));
    };
    const api = {
      getState: load,
      addFolder: async () => { const p = await pick('music'); return p ? { folders: folders.music.slice(), added: p } : { canceled: true }; },
      addVideoFolder: async () => { const p = await pick('video'); return p ? { videoFolders: folders.video.slice() } : { canceled: true }; },
      removeFolder: async (f) => ({ folders: remove('music', f) }),
      removeVideoFolder: async (f) => ({ videoFolders: remove('video', f) }),
      rescan: () => rescan().then(() => true),
      getFolderGroups: async () => [],
      recordPlay: async () => null,
      saveVideoProgress: async () => true,
      url: (kind, id) => (kind === 'media' || kind === 'video' ? `/_localify/${kind}/${encodeURIComponent(id)}` : ''),
      onState: on(stateCbs), onScanProgress: on(scanCbs), onMediaKey: on(keyCbs),
    };
    for (const m of ['createPlaylistsFromFolders', 'createPlaylist', 'updatePlaylist', 'deletePlaylist',
      'addToPlaylist', 'removeFromPlaylist', 'reorderPlaylist', 'setPlaylistImage', 'clearPlaylistImage', 'toggleLike']) api[m] = later;
    return api;
  }

  if (typeof module === 'object' && module.exports) module.exports = { createApi, toState };
  const C = root.Capacitor;
  if (!root.api && C && C.isNativePlatform && C.isNativePlatform()) root.api = createApi(C.registerPlugin('MediaLibrary'), root.localStorage);
})(typeof window !== 'undefined' ? window : globalThis);
