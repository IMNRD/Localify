// Android stand-in for the Electron preload API (window.api).
// Phase 0: lists the phone's songs and videos and plays them. Editing (playlists, likes,
// play counts, video resume) arrives in Phase 1; until then those calls explain that.
(function (root) {
  'use strict';
  const VIDEO_EXTS = ['mp4', 'm4v', 'webm', 'mov', 'mkv']; // same list as the desktop scanner
  const ALL_MUSIC = 'All music on this phone', ALL_VIDEOS = 'All videos on this phone';

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
  function toState(r) {
    const ok = r && r.granted;
    const tracks = ok ? (r.audio || []).filter((a) => a.id && a.path).map(toTrack) : [];
    const videos = ok ? (r.video || []).filter((v) => v.id && VIDEO_EXTS.includes(ext(v.path))).map(toVideo) : [];
    return {
      folders: ok ? [ALL_MUSIC] : [], videoFolders: ok ? [ALL_VIDEOS] : [], tracks, videos,
      playlists: [], liked: [], recent: [], lastScanAt: Date.now(), recovered: false,
    };
  }

  function createApi(Media) {
    const on = (set) => (cb) => { set.add(cb); return () => set.delete(cb); };
    const stateCbs = new Set(), scanCbs = new Set(), keyCbs = new Set();
    let last = null;
    async function load() {
      scanCbs.forEach((cb) => cb({ scanning: true, done: 0, total: 0 }));
      try { last = toState(await Media.list()); } finally { scanCbs.forEach((cb) => cb({ scanning: false })); }
      return last;
    }
    async function rescan() { const st = await load(); stateCbs.forEach((cb) => cb(st)); return st; }
    const later = () => {
      if (root.L && root.L.toast) root.L.toast('Editing comes in the next Android update');
      return Promise.reject(new Error('Not available on Android yet'));
    };
    const api = {
      getState: load,
      addFolder: async () => { const st = await rescan(); return st.folders.length ? { folders: st.folders, added: null } : { canceled: true }; },
      addVideoFolder: async () => { const st = await rescan(); return st.videoFolders.length ? { videoFolders: st.videoFolders } : { canceled: true }; },
      rescan: () => rescan().then(() => true),
      getFolderGroups: async () => [],
      recordPlay: async () => null,
      saveVideoProgress: async () => true,
      url: (kind, id) => (kind === 'media' || kind === 'video' ? `/_localify/${kind}/${encodeURIComponent(id)}` : ''),
      onState: on(stateCbs), onScanProgress: on(scanCbs), onMediaKey: on(keyCbs),
    };
    for (const m of ['removeFolder', 'removeVideoFolder', 'createPlaylistsFromFolders', 'createPlaylist', 'updatePlaylist', 'deletePlaylist',
      'addToPlaylist', 'removeFromPlaylist', 'reorderPlaylist', 'setPlaylistImage', 'clearPlaylistImage', 'toggleLike']) api[m] = later;
    return api;
  }

  if (typeof module === 'object' && module.exports) module.exports = { createApi, toState };
  const C = root.Capacitor;
  if (!root.api && C && C.isNativePlatform && C.isNativePlatform()) root.api = createApi(C.registerPlugin('MediaLibrary'));
})(typeof window !== 'undefined' ? window : globalThis);
