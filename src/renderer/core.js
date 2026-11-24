// Shared helpers, icons, app state and derived library data.
(function () {
  'use strict';
  const L = (window.L = {});
  L.$ = (s, r = document) => r.querySelector(s);
  L.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  L.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  L.norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  L.fmt = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };
  L.fmtLong = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
  };
  L.hash = (str) => { // cyrb53
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };

  const P = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    library: '<path d="M4 4v16M9 4v16"/><path d="M14 5l6 14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
    prev: '<path d="M19 5v14L8 12z" fill="currentColor"/><path d="M5 5v14"/>',
    next: '<path d="M5 5v14l11-7z" fill="currentColor"/><path d="M19 5v14"/>',
    shuffle: '<path d="M3 6h3a5 5 0 0 1 4 2l5 8a5 5 0 0 0 4 2h3"/><path d="M3 18h3a5 5 0 0 0 4-2M15 8a5 5 0 0 1 4-2h2"/><path d="M19 3l3 3-3 3M19 15l3 3-3 3"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    repeat1: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/><path d="M11 10.5l1.6-1v6"/>',
    heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z"/>',
    heartfill: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" fill="currentColor"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    queue: '<path d="M3 6h14M3 12h14M3 18h8"/><path d="M17 15l5 3-5 3z" fill="currentColor"/>',
    more: '<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    forward: '<path d="M9 5l7 7-7 7"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  L.icon = (name, size = 24) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

  const S = (L.S = {
    tracks: new Map(), list: [], sorted: [], albums: new Map(), artists: new Map(), albumList: [], artistList: [],
    playlists: [], liked: new Set(), likedOrder: [], recent: [], folders: [], lastScanAt: 0, scan: { scanning: false }, videos: [], videoFolders: [],
  });

  L.setTracks = (arr) => {
    S.list = arr;
    S.tracks = new Map(arr.map((t) => [t.id, t]));
    const albums = new Map(), artists = new Map();
    for (const t of arr) {
      t._h = L.norm(`${t.title} ${t.artist} ${t.album}`);
      const aa = t.albumArtist || t.artist;
      const ak = L.norm(aa) + '\u0001' + L.norm(t.album);
      let al = albums.get(ak);
      if (!al) { al = { id: L.hash(ak), name: t.album, artist: aa, year: 0, artHash: null, trackIds: [], addedAt: 0 }; albums.set(ak, al); }
      al.trackIds.push(t.id);
      al.artHash ||= t.artHash;
      al.year ||= t.year;
      al.addedAt = Math.max(al.addedAt, t.addedAt || 0);
      const rk = L.norm(t.artist);
      let ar = artists.get(rk);
      if (!ar) { ar = { id: L.hash('ar' + rk), name: t.artist, trackIds: [], albumIds: new Set(), artHash: null }; artists.set(rk, ar); }
      ar.trackIds.push(t.id);
      ar.albumIds.add(al.id);
      ar.artHash ||= t.artHash;
      t._album = al.id;
      t._artist = ar.id;
    }
    const byTrack = (a, b) => (a.discNo || 0) - (b.discNo || 0) || (a.trackNo || 0) - (b.trackNo || 0) || a.title.localeCompare(b.title);
    S.albums = new Map();
    for (const al of albums.values()) {
      al.trackIds.sort((x, y) => byTrack(S.tracks.get(x), S.tracks.get(y)));
      al._n = L.norm(`${al.name} ${al.artist}`);
      S.albums.set(al.id, al);
    }
    S.artists = new Map();
    for (const ar of artists.values()) {
      ar.trackIds.sort((x, y) => {
        const a = S.tracks.get(x), b = S.tracks.get(y);
        return a.album.localeCompare(b.album) || byTrack(a, b);
      });
      ar._n = L.norm(ar.name);
      S.artists.set(ar.id, ar);
    }
    S.albumList = [...S.albums.values()].sort((a, b) => a.name.localeCompare(b.name));
    S.artistList = [...S.artists.values()].sort((a, b) => a.name.localeCompare(b.name));
    S.sorted = [...arr].sort((a, b) => a.title.localeCompare(b.title));
  };

  L.mergeLite = (lite) => {
    if (!lite) return;
    S.playlists = lite.playlists;
    S.likedOrder = lite.liked;
    S.liked = new Set(lite.liked);
    S.recent = lite.recent;
  };

  let toastTimer;
  L.toast = (msg) => {
    const el = L.$('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  };

  // Cover helpers
  L.art = (hash, cls = '') =>
    hash ? `<div class="art ${cls}"><img loading="lazy" alt="" src="localify://art/${hash}"></div>`
         : `<div class="art ph ${cls}">${L.icon('note', 24)}</div>`;
  L.likedCover = (cls = '') => `<div class="art liked ${cls}">${L.icon('heartfill', 24)}</div>`;
  L.plCover = (p, cls = '') => {
    if (p.image) return `<div class="art ${cls}"><img alt="" src="localify://pl/${encodeURIComponent(p.image)}"></div>`;
    const hashes = [];
    for (const id of p.trackIds) {
      const h = S.tracks.get(id)?.artHash;
      if (h && !hashes.includes(h)) hashes.push(h);
      if (hashes.length === 4) break;
    }
    if (!hashes.length) return L.art(null, cls);
    if (hashes.length === 1) return L.art(hashes[0], cls);
    const cells = [0, 1, 2, 3].map((i) => (hashes[i] ? `<img alt="" src="localify://art/${hashes[i]}">` : '<span></span>')).join('');
    return `<div class="art mosaic ${cls}">${cells}</div>`;
  };
})();
