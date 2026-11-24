// Views, navigation, menus, dialogs, events.
(function () {
  'use strict';
  const { S, P, $, $$, esc, norm, fmt, fmtLong, icon, toast, art, plCover, likedCover } = L;
  const api = window.api;
  const RH = 56;
  let hist = [{ view: 'music' }], hi = 0, chip = 'playlists', lists = [], cleanups = [], painters = new Set(), editingId = null, pendingGroups = null;
  const route = () => hist[hi];

  // ---------- navigation ----------
  function navigate(r, replace = false) {
    if (replace) hist[hi] = r; else { hist = hist.slice(0, hi + 1).concat([r]); hi = hist.length - 1; }
    renderView(false);
  }
  const go = (str) => {
    const [view, id] = str.split(':');
    navigate({ view, id });
  };
  function step(d) { const n = hi + d; if (n >= 0 && n < hist.length) { hi = n; renderView(false); } }

  // ---------- helpers ----------
  const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;
  const totalSec = (ids) => ids.reduce((a, id) => a + (S.tracks.get(id)?.durationSec || 0), 0);
  function ctxIds(ctx) {
    const [kind, id] = ctx.split(':');
    if (kind === 'songs') return S.sorted.map((t) => t.id);
    if (kind === 'liked') return S.likedOrder.slice();
    if (kind === 'track') return [id];
    if (kind === 'playlist') return S.playlists.find((p) => p.id === id)?.trackIds.slice() || [];
    if (kind === 'album') return S.albums.get(id)?.trackIds.slice() || [];
    if (kind === 'artist') return S.artists.get(id)?.trackIds.slice() || [];
    return [];
  }
  function playCtx(ctx) {
    const ids = ctxIds(ctx);
    if (!ids.length) return toast('Nothing to play yet');
    const [kind, id] = ctx.split(':');
    const key = ctx;
    // clicking play on the context that is already playing toggles pause
    if (P.ctx === key && P.cur()) return P.toggle();
    P.ctx = key;
    P.play(ids, 0);
  }
  const merge = (lite) => { L.mergeLite(lite); renderSide(); renderView(true); L.renderBar(); };

  // ---------- html builders ----------
  const section = (title, inner) => `<section><div class="sh"><h2>${title}</h2></div>${inner}</section>`;
  const card = ({ go, play, cover, title, sub, round }) =>
    `<div class="card ${round ? 'round' : ''}" ${go ? `data-go="${esc(go)}"` : ''}><div class="cover">${cover}<button class="cardplay" data-play="${esc(play)}" title="Play">${icon('play', 22)}</button></div><div class="ct">${esc(title)}</div><div class="cs">${esc(sub)}</div></div>`;
  const albumCard = (a) => card({ go: `album:${a.id}`, play: `album:${a.id}`, cover: art(a.artHash), title: a.name, sub: `${a.year ? a.year + ' · ' : ''}${a.artist}` });
  const artistCard = (a) => card({ go: `artist:${a.id}`, play: `artist:${a.id}`, cover: art(a.artHash), title: a.name, sub: 'Artist', round: true });
  const playlistCard = (p) => card({ go: `playlist:${p.id}`, play: `playlist:${p.id}`, cover: plCover(p), title: p.name, sub: plural(p.trackIds.length, 'song') });
  const trackCard = (t) => card({ play: `track:${t.id}`, cover: art(t.artHash), title: t.title, sub: t.artist });
  const fmtSize = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
  const finished = (v) => v.dur > 0 && v.pos >= v.dur * 0.95;
  const inProgress = (v) => v.available && v.pos > 0 && !finished(v);
  const byWatched = (a, b) => b.watchedAt - a.watchedAt;
  function videoCard(v) {
    const pct = v.dur ? Math.min(100, (v.pos / v.dur) * 100) : 0;
    const badge = inProgress(v) && v.dur ? `${fmt(v.dur - v.pos)} left` : v.dur ? fmt(v.dur) : '';
    const hue = parseInt(v.id.slice(0, 4), 16) % 360;
    return `<div class="vcard ${v.available ? '' : 'gone'}" data-go="video:${v.id}" title="${esc(v.name)}"><div class="thumb" style="background:linear-gradient(135deg,hsl(${hue} 45% 32%),hsl(${(hue + 40) % 360} 35% 12%))">${icon('play', 36)}${badge ? `<span class="vdur">${badge}</span>` : ''}${pct ? `<div class="vprog"><b style="width:${pct}%"></b></div>` : ''}</div>
      <div class="ct">${esc(v.name)}</div><div class="cs">${finished(v) ? 'Watched' : `${esc(v.ext.toUpperCase())} · ${fmtSize(v.size)}`}</div></div>`;
  }
  const VSORTS = { name: 'Name', added: 'Date added', length: 'Length', size: 'Size', type: 'Type' };
  const VCMP = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
    added: (a, b) => b.addedAt - a.addedAt,
    length: (a, b) => (b.dur || -1) - (a.dur || -1),
    size: (a, b) => b.size - a.size,
    type: (a, b) => a.ext.localeCompare(b.ext),
  };
  let vsort = 'name';
  try { if (VSORTS[localStorage.getItem('lf.vsort')]) vsort = localStorage.getItem('lf.vsort'); } catch {}
  const noVideos = () => `<div class="empty"><img src="logo.svg" width="96" height="96" alt=""><h2>No videos yet</h2><p>Add a folder with your videos (MP4, M4V, WebM, MOV or MKV).</p><button class="primary" data-act="addvideofolder">Add video folder</button></div>`;

  function empty(title, sub, cta) {
    return `<div class="empty"><img src="logo.svg" width="96" height="96" alt=""><h2>${esc(title)}</h2><p>${esc(sub)}</p>${cta ? `<button class="primary" data-act="addfolder">Add music folder</button>` : ''}</div>`;
  }
  function libraryEmpty() {
    if (S.scan.scanning) return empty('Scanning your music…', 'Songs will appear here in a moment.', false);
    if (S.folders.length) return empty('No songs found', 'Your folders have no supported audio files. Try adding another folder.', true);
    return empty('Welcome to Localify', 'Add a folder to fill this up', true);
  }

  function hero({ type, title, desc, sub, cover, round, editId }) {
    return `<div class="hero"><div class="hcover ${round ? 'round' : ''} ${editId ? 'editable' : ''}" ${editId ? `data-act="editpl" data-arg="${editId}" title="Edit details"` : ''}>${cover}</div>
      <div class="hinfo"><div class="htype">${type}</div><h1 class="htitle">${esc(title)}</h1>${desc ? `<div class="hdesc">${esc(desc)}</div>` : ''}<div class="hsub">${sub}</div></div></div>`;
  }
  const actions = (ctx, extra = '') => `<div class="actions"><button class="bigplay" data-play="${ctx}" title="Play">${icon('play', 28)}</button>${extra}</div>`;

  function table(ids, opts = {}) {
    const n = lists.push({ ids, opts }) - 1;
    const na = opts.noAlbum ? 'no-album' : '';
    return `<div class="thead ${na}"><div>#</div><div>Title</div>${opts.noAlbum ? '' : '<div>Album</div>'}<div></div><div class="r">${icon('clock', 16)}</div></div><div class="vlist ${na}" data-n="${n}"></div>`;
  }
  function rowHTML(id, i, opts, cur) {
    const t = S.tracks.get(id);
    const alb = opts.noAlbum ? '' : '<div class="c-album"></div>';
    if (!t) {
      return `<div class="row gone" data-i="${i}"><div class="c-num"><span class="n">${i + 1}</span></div><div class="c-title">${art(null, 'rowart')}<div class="tt"><div class="t">Unavailable track</div><div class="a">No longer in your library</div></div></div>${alb}<div></div><div class="c-dur">${opts.playlistId ? `<button class="ib more" data-more title="More">${icon('more', 20)}</button>` : ''}</div></div>`;
    }
    const playing = cur === id, liked = S.liked.has(id);
    return `<div class="row ${playing ? 'playing' : ''} ${t.available ? '' : 'gone'}" data-i="${i}" data-id="${id}" ${t.available ? '' : 'title="File missing"'} ${opts.playlistId ? 'draggable="true"' : ''}>
      <div class="c-num"><span class="n">${i + 1}</span><button class="rowplay" title="Play">${icon(playing && !P.audio.paused ? 'pause' : 'play', 18)}</button></div>
      <div class="c-title">${art(t.artHash, 'rowart')}<div class="tt"><div class="t">${esc(t.title)}</div><div class="a"><a data-go="artist:${t._artist}">${esc(t.artist)}</a></div></div></div>
      ${opts.noAlbum ? '' : `<div class="c-album"><a data-go="album:${t._album}">${esc(t.album)}</a></div>`}
      <button class="ib heart c-like ${liked ? 'on' : ''}" data-like title="Like">${icon(liked ? 'heartfill' : 'heart', 18)}</button>
      <div class="c-dur"><span>${fmt(t.durationSec)}</span><button class="ib more" data-more title="More">${icon('more', 20)}</button></div></div>`;
  }
  function mountList(host, { ids, opts }) {
    const sc = $('#main');
    const inner = document.createElement('div');
    inner.className = 'vl-inner';
    host.appendChild(inner);
    host.style.height = ids.length * RH + 'px';
    host._ids = ids; host._opts = opts;
    let a = -1, b = -1;
    function paint(force) {
      if (!ids.length) return;
      const y = sc.getBoundingClientRect().top - host.getBoundingClientRect().top;
      const first = Math.max(0, Math.floor(y / RH) - 8);
      const last = Math.min(ids.length - 1, first + Math.ceil(sc.clientHeight / RH) + 16);
      if (!force && first === a && last === b) return;
      a = first; b = last;
      const cur = P.cur();
      let h = '';
      for (let i = first; i <= last; i++) h += rowHTML(ids[i], i, opts, cur);
      inner.style.transform = `translateY(${first * RH}px)`;
      inner.innerHTML = h;
    }
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => paint(false)); };
    sc.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    cleanups.push(() => { sc.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); });
    painters.add(paint);
    paint(true);
  }

  // Resumes from the saved spot, saves every 5 s / on pause / on leave, and never plays over music.
  function mountVideo(vid) {
    const id = vid.dataset.id;
    const find = () => S.videos.find((x) => x.id === id); // S.videos is replaced on every library refresh
    let last = 0;
    const save = () => {
      const d = vid.duration, v = find();
      if (!v || !d || !isFinite(d)) return;
      v.pos = vid.ended || vid.currentTime >= d * 0.95 ? d : vid.currentTime;
      v.dur = d; v.watchedAt = Date.now();
      api.saveVideoProgress(v.id, v.pos, v.dur).catch(() => {});
    };
    const onAudio = () => vid.pause();
    P.audio.pause();
    vid.addEventListener('loadedmetadata', () => { const v = find(); if (v && v.pos > 5 && v.pos < vid.duration * 0.95) vid.currentTime = v.pos; });
    vid.addEventListener('play', () => P.audio.pause());
    vid.addEventListener('timeupdate', () => { if (Date.now() - last > 5000) { last = Date.now(); save(); } });
    vid.addEventListener('pause', save);
    vid.addEventListener('error', () => toast("This video can't be played. Its format may not be supported."));
    P.audio.addEventListener('play', onAudio);
    window.addEventListener('beforeunload', save);
    cleanups.push(() => {
      save();
      P.audio.removeEventListener('play', onAudio);
      window.removeEventListener('beforeunload', save);
      vid.pause(); vid.removeAttribute('src'); vid.load();
    });
  }

  // ---------- views ----------
  const VIEWS = {
    home() {
      const recent = S.videos.filter((v) => v.watchedAt).sort(byWatched).slice(0, 8);
      if (!S.playlists.length && !recent.length) {
        return `<h1 class="page">Home</h1>` + empty('Nothing here yet', 'Your top playlists and recently watched videos will show up here.', false);
      }
      const plays = (p) => p.trackIds.reduce((a, id) => a + (S.tracks.get(id)?.plays || 0), 0);
      const top = S.playlists.map((p) => [p, plays(p)]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p]) => p);
      let out = `<h1 class="page">Home</h1>`;
      if (top.length) out += section('Your top playlists', `<div class="cards">${top.map(playlistCard).join('')}</div>`);
      if (recent.length) out += section('Recently watched', `<div class="vcards">${recent.map(videoCard).join('')}</div>`);
      return out;
    },
    music() {
      if (!S.list.length) return libraryEmpty();
      const h = new Date().getHours();
      let out = `<h1 class="page">${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}</h1>`;
      const tile = (go, cover, name) => `<div class="tile" data-go="${go}"><div class="tcover">${cover}</div><div class="tname">${esc(name)}</div><button class="cardplay" data-play="${go}" title="Play">${icon('play', 22)}</button></div>`;
      out += `<div class="tiles">${tile('liked', likedCover(), 'Liked Songs')}${S.playlists.slice(0, 5).map((p) => tile('playlist:' + p.id, plCover(p), p.name)).join('')}</div>`;
      const recent = S.recent.map((id) => S.tracks.get(id)).filter(Boolean).slice(0, 12);
      if (recent.length) out += section('Recently played', `<div class="cards">${recent.map(trackCard).join('')}</div>`);
      const added = [...S.albums.values()].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
      out += section('Recently added', `<div class="cards">${added.map(albumCard).join('')}</div>`);
      out += section(`All songs · ${S.list.length.toLocaleString()}`, actions('songs') + table(S.sorted.map((t) => t.id)));
      return out;
    },
    videos() {
      if (!S.videos.length) return `<h1 class="page">Videos</h1>` + noVideos();
      const cont = S.videos.filter(inProgress).sort(byWatched).slice(0, 12);
      const all = S.videos.slice().sort(VCMP[vsort]);
      const sorts = `<div class="sorts">Sort by ${Object.entries(VSORTS).map(([k, n]) => `<button class="${k === vsort ? 'on' : ''}" data-act="vsort" data-arg="${k}">${n}</button>`).join('')}</div>`;
      return `<h1 class="page">Videos</h1>` +
        (cont.length ? section('Continue watching', `<div class="vcards">${cont.map(videoCard).join('')}</div>`) : '') +
        `<section><div class="sh"><h2>All videos · ${all.length.toLocaleString()}</h2>${sorts}</div><div class="vcards">${all.map(videoCard).join('')}</div></section>`;
    },
    video(r) {
      const v = S.videos.find((x) => x.id === r.id);
      if (!v) return empty('Video not found', 'It may have been removed from your library.', false);
      if (!v.available) return empty('File missing', `“${v.name}” is no longer in your video folders.`, false);
      return `<div class="vplayer"><video id="vid" controls autoplay data-id="${v.id}" src="localify://video/${v.id}"></video></div>
        <h1 class="page">${esc(v.name)}</h1><p class="muted">${esc(v.ext.toUpperCase())} · ${fmtSize(v.size)}</p>`;
    },
    search(r) {
      const q = norm(r.q).trim();
      if (!S.list.length) return libraryEmpty();
      if (!q) {
        return `<h1 class="page">Search</h1><p class="muted">Find songs, artists, albums and playlists in your library.</p>` +
          section('Artists', `<div class="cards">${S.artistList.slice(0, 12).map(artistCard).join('')}</div>`) +
          section('Albums', `<div class="cards">${S.albumList.slice(0, 12).map(albumCard).join('')}</div>`);
      }
      const tokens = q.split(/\s+/);
      const all = (h) => tokens.every((k) => h.includes(k));
      const songs = S.sorted.filter((t) => all(t._h)).slice(0, 20).map((t) => t.id);
      const artists = S.artistList.filter((a) => all(a._n)).slice(0, 12);
      const albums = S.albumList.filter((a) => all(a._n)).slice(0, 12);
      const pls = S.playlists.filter((p) => all(norm(p.name))).slice(0, 12);
      if (!songs.length && !artists.length && !albums.length && !pls.length) return `<div class="empty"><h2>No results for “${esc(r.q)}”</h2><p>Check the spelling or try a shorter search.</p></div>`;
      let out = '';
      if (songs.length) out += section('Songs', table(songs));
      if (artists.length) out += section('Artists', `<div class="cards">${artists.map(artistCard).join('')}</div>`);
      if (albums.length) out += section('Albums', `<div class="cards">${albums.map(albumCard).join('')}</div>`);
      if (pls.length) out += section('Playlists', `<div class="cards">${pls.map(playlistCard).join('')}</div>`);
      return out;
    },
    liked() {
      const ids = S.likedOrder;
      return hero({ type: 'Playlist', title: 'Liked Songs', sub: plural(ids.length, 'song'), cover: likedCover() }) +
        (ids.length ? actions('liked') + table(ids) : empty('No liked songs yet', 'Tap the heart on a song to save it here.', false));
    },
    playlist(r) {
      const p = S.playlists.find((x) => x.id === r.id);
      if (!p) return empty('Playlist not found', 'It may have been deleted.', false);
      const ids = p.trackIds;
      const extra = `<button class="ib lg" data-act="editpl" data-arg="${p.id}" title="Edit details">${icon('edit', 24)}</button><button class="ib lg" data-act="delpl" data-arg="${p.id}" title="Delete playlist">${icon('trash', 24)}</button>`;
      return hero({ type: 'Playlist', title: p.name, desc: p.description, sub: `${plural(ids.length, 'song')}${ids.length ? ', ' + fmtLong(totalSec(ids)) : ''}`, cover: plCover(p), editId: p.id }) +
        actions(`playlist:${p.id}`, extra) +
        (ids.length ? table(ids, { playlistId: p.id }) : `<div class="empty small"><h2>Nothing here yet</h2><p>Add songs from Music or Search</p></div>`);
    },
    album(r) {
      const a = S.albums.get(r.id);
      if (!a) return empty('Album not found', '', false);
      return hero({ type: 'Album', title: a.name, sub: `<a data-go="artist:${[...S.artists.values()].find((x) => x.name === a.artist)?.id || ''}">${esc(a.artist)}</a>${a.year ? ' · ' + a.year : ''} · ${plural(a.trackIds.length, 'song')}, ${fmtLong(totalSec(a.trackIds))}`, cover: art(a.artHash) }) +
        actions(`album:${a.id}`) + table(a.trackIds, { noAlbum: true });
    },
    artist(r) {
      const a = S.artists.get(r.id);
      if (!a) return empty('Artist not found', '', false);
      const popular = a.trackIds.slice().sort((x, y) => (S.tracks.get(y).plays || 0) - (S.tracks.get(x).plays || 0) || S.tracks.get(x).title.localeCompare(S.tracks.get(y).title)).slice(0, 5);
      const albums = [...a.albumIds].map((id) => S.albums.get(id)).sort((x, y) => (y.year || 0) - (x.year || 0));
      return hero({ type: 'Artist', title: a.name, sub: plural(a.trackIds.length, 'song'), cover: art(a.artHash), round: true }) +
        actions(`artist:${a.id}`) + section('Popular', table(popular)) + section('Albums', `<div class="cards">${albums.map(albumCard).join('')}</div>`);
    },
    queue() {
      if (P.pos < 0) return `<h1 class="page">Queue</h1>` + empty('Queue is empty', 'Play something to see it here.', false);
      const q = (orderPos) => {
        const t = S.tracks.get(P.queue[P.order[orderPos]]);
        if (!t) return '';
        return `<div class="qrow" data-act="queue-go" data-arg="${orderPos}">${art(t.artHash, 'rowart')}<div class="tt"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}</div></div><span class="muted">${fmt(t.durationSec)}</span><button class="ib" data-act="queue-rm" data-arg="${orderPos}" title="Remove">${icon('x', 18)}</button></div>`;
      };
      const upcoming = [];
      for (let k = P.pos + 1; k < Math.min(P.order.length, P.pos + 201); k++) upcoming.push(q(k));
      const more = P.order.length - (P.pos + 201);
      const t = P.track();
      return `<h1 class="page">Queue</h1>${section('Now playing', t ? `<div class="qrow now">${art(t.artHash, 'rowart')}<div class="tt"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}</div></div></div>` : '')}` +
        section('Next up', upcoming.length ? upcoming.join('') + (more > 0 ? `<p class="muted">+ ${more} more</p>` : '') : '<p class="muted">Nothing queued after this song.</p>');
    },
    settings() {
      const gone = S.list.filter((t) => !t.available).length;
      return `<h1 class="page">Settings</h1>
        <section><div class="sh"><h2>Music folders</h2></div>
          ${S.folders.map((f) => `<div class="frow">${icon('folder', 20)}<span class="fpath">${esc(f)}</span><button class="ghost" data-act="removefolder" data-arg="${esc(f)}">Remove</button></div>`).join('') || '<p class="muted">No folders yet.</p>'}
          <div class="actions"><button class="primary" data-act="addfolder">Add music folder</button><button class="ghost" data-act="rescan">Rescan</button><button class="ghost" data-act="folderplaylists">Playlists from folders…</button></div>
          <p class="muted" id="scanTxt">${scanText()}</p></section>
        <section><div class="sh"><h2>Video folders</h2></div>
          ${S.videoFolders.map((f) => `<div class="frow">${icon('folder', 20)}<span class="fpath">${esc(f)}</span><button class="ghost" data-act="removevideofolder" data-arg="${esc(f)}">Remove</button></div>`).join('') || '<p class="muted">No folders yet.</p>'}
          <div class="actions"><button class="primary" data-act="addvideofolder">Add video folder</button></div>
          <p class="muted">${plural(S.videos.length, 'video')}. Plays MP4, M4V, WebM, MOV and most MKV files.</p></section>
        <section><div class="sh"><h2>Library</h2></div>
          <p class="muted">${plural(S.list.length, 'song')} · ${plural(S.albums.size, 'album')} · ${plural(S.artists.size, 'artist')}${gone ? ` · ${gone} missing` : ''}</p>
          <p class="muted">Last scanned: ${S.lastScanAt ? esc(new Date(S.lastScanAt).toLocaleString()) : 'never'}</p></section>
        <section><div class="sh"><h2>About</h2></div><p class="muted">Localify works fully offline. Your library, playlists and cover images are stored on this computer only.</p></section>`;
    },
  };
  const scanText = () => (S.scan.scanning ? `Scanning… ${(S.scan.total || S.scan.done || 0).toLocaleString()} files` : '');

  function renderView(keep) {
    const sc = $('#main'), y = sc.scrollTop;
    cleanups.forEach((f) => f()); cleanups = []; painters.clear(); lists = [];
    const r = route();
    $('#view').innerHTML = (VIEWS[r.view] || VIEWS.home)(r);
    $$('#view .vlist').forEach((h) => mountList(h, lists[+h.dataset.n]));
    if ($('#vid')) mountVideo($('#vid'));
    sc.scrollTop = keep ? y : 0;
    syncChrome();
  }
  function syncChrome() {
    const r = route();
    $('#bBack').disabled = hi === 0;
    $('#bFwd').disabled = hi >= hist.length - 1;
    const nav = r.view === 'video' ? 'videos' : r.view;
    $$('.nav [data-go]').forEach((el) => el.classList.toggle('active', el.dataset.go === nav));
    const s = $('#q');
    if (r.view !== 'search' && s.value) s.value = '';
    $$('#liblist .lrow').forEach((el) => el.classList.toggle('active', el.dataset.go === `${r.view}:${r.id}` || (r.view === 'liked' && el.dataset.go === 'liked')));
  }

  // ---------- sidebar ----------
  function renderSide() {
    $$('#chips [data-arg]').forEach((c) => c.classList.toggle('on', c.dataset.arg === chip));
    const f = norm($('#libfilter').value).trim();
    const row = (go, cover, name, sub, extra = '') => `<div class="lrow" data-go="${go}" ${extra}>${cover}<div class="lt"><div class="ln">${esc(name)}</div><div class="ls">${esc(sub)}</div></div></div>`;
    let items = [];
    if (chip === 'playlists') {
      if (!f || 'liked songs'.includes(f)) items.push(row('liked', likedCover('lart'), 'Liked Songs', `Playlist · ${plural(S.likedOrder.length, 'song')}`));
      for (const p of S.playlists) if (!f || norm(p.name).includes(f)) items.push(row('playlist:' + p.id, plCover(p, 'lart'), p.name, `Playlist · ${plural(p.trackIds.length, 'song')}`, `data-pl="${p.id}"`));
    } else if (chip === 'albums') {
      for (const a of S.albumList) if (!f || a._n.includes(f)) items.push(row('album:' + a.id, art(a.artHash, 'lart'), a.name, `Album · ${a.artist}`));
    } else {
      for (const a of S.artistList) if (!f || a._n.includes(f)) items.push(row('artist:' + a.id, art(a.artHash, 'lart round'), a.name, 'Artist'));
    }
    const total = items.length;
    $('#liblist').innerHTML = items.slice(0, 300).join('') + (total > 300 ? '<p class="muted pad">Use the filter to find more.</p>' : '') || '<p class="muted pad">Nothing here yet.</p>';
    syncChrome();
  }

  // ---------- menu & modal ----------
  let menuPos = [0, 0], menuItems = [];
  function openMenu(items, x, y) {
    menuPos = [x, y]; menuItems = items;
    const m = $('#menu');
    m.innerHTML = items.map((it, i) => it.sep ? '<div class="msep"></div>' : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}${it.sub ? '<span>▸</span>' : ''}</button>`).join('');
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  }
  const closeMenu = () => { $('#menu').hidden = true; };
  function openTrackMenu(rowEl, x, y) {
    const i = +rowEl.dataset.i, id = rowEl.dataset.id, pid = rowEl.closest('.vlist')?._opts?.playlistId;
    const t = S.tracks.get(id);
    const items = [];
    if (t) {
      items.push({ label: 'Play next', fn: () => { P.enqueue([id], true); toast('Playing next'); } });
      items.push({ label: 'Add to queue', fn: () => { P.enqueue([id], false); toast('Added to queue'); } });
      items.push({ label: 'Add to playlist', sub: () => playlistPicker([id]) });
      items.push({ label: S.liked.has(id) ? 'Remove from Liked Songs' : 'Save to Liked Songs', fn: () => likeTrack(id) });
      items.push({ sep: true });
      items.push({ label: 'Go to artist', fn: () => go('artist:' + t._artist) });
      items.push({ label: 'Go to album', fn: () => go('album:' + t._album) });
    }
    if (pid) { if (t) items.push({ sep: true }); items.push({ label: 'Remove from this playlist', danger: true, fn: () => api.removeFromPlaylist(pid, i).then(merge) }); }
    openMenu(items, x, y);
  }
  function playlistPicker(ids) {
    return [{ label: '＋ New playlist', fn: async () => { const r = await api.createPlaylist(); merge(await api.addToPlaylist(r.id, ids)); toast('Added to a new playlist'); } },
      ...S.playlists.map((p) => ({ label: p.name, fn: async () => { merge(await api.addToPlaylist(p.id, ids)); toast(`Added to ${p.name}`); } }))];
  }
  const likeTrack = (id) => api.toggleLike(id).then((lite) => {
    L.mergeLite(lite);
    renderSide(); L.renderBar();
    if (route().view === 'liked') renderView(true); else painters.forEach((p) => p(true));
  });

  function showModal(html) { const m = $('#modal'); m.innerHTML = `<div class="dlg" role="dialog">${html}</div>`; m.hidden = false; }
  const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; editingId = null; };
  function editPlaylist(id) {
    const p = S.playlists.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    showModal(`<h2>Edit details</h2><div class="editgrid"><div class="ecover" id="ecover"></div>
      <div class="efields"><label>Name<input id="eName" maxlength="100" value="${esc(p.name)}"></label>
      <label>Description<textarea id="eDesc" maxlength="300" rows="4" placeholder="Add an optional description">${esc(p.description)}</textarea></label></div></div>
      <p class="muted small">Cover changes are saved straight away.</p>
      <div class="dactions"><button class="ghost" data-act="choose-img">Choose image…</button><button class="ghost" data-act="remove-img" id="eRemove">Remove image</button><span class="grow"></span><button class="ghost" data-act="modal-close">Cancel</button><button class="primary" data-act="modal-save">Save</button></div>`);
    refreshEditCover();
  }
  function refreshEditCover() {
    const p = S.playlists.find((x) => x.id === editingId);
    if (!p || !$('#ecover')) return;
    $('#ecover').innerHTML = plCover(p);
    $('#eRemove').hidden = !p.image;
  }
  function confirmDelete(id) {
    const p = S.playlists.find((x) => x.id === id);
    if (!p) return;
    showModal(`<h2>Delete playlist?</h2><p>“${esc(p.name)}” will be removed. This can't be undone.</p><div class="dactions"><span class="grow"></span><button class="ghost" data-act="modal-close">Cancel</button><button class="danger-btn" data-act="delete-go" data-arg="${id}">Delete</button></div>`);
  }

  function offerGroups(root, manual) {
    api.getFolderGroups(root).then((groups) => {
      if (!groups.length) return manual ? toast('No new subfolders to turn into playlists') : undefined;
      showModal(`<h2>Make playlists from your folders?</h2>
        <p class="muted">Found ${plural(groups.length, 'subfolder')} with music. Localify can create one playlist for each.</p>
        <div class="fgl">${groups.map((g) => `<label class="fg"><input type="checkbox" value="${esc(g.key)}" checked><span class="fn">${esc(g.name)}</span><span class="muted fc">${plural(g.count, 'song')}</span></label>`).join('')}</div>
        <div class="dactions"><button class="ghost" data-act="fg-toggle">Select all / none</button><span class="grow"></span><button class="ghost" data-act="modal-close">Not now</button><button class="primary" data-act="fg-create">Create playlists</button></div>`);
    }).catch(() => {});
  }

  // ---------- actions ----------
  const actions_ = {
    addfolder: () => api.addFolder().then((r) => { if (!r.canceled) { S.folders = r.folders; pendingGroups = r.added; if (route().view === 'settings') renderView(true); } }),
    folderplaylists: () => offerGroups(null, true),
    'fg-toggle': () => { const boxes = $$('#modal .fg input'); const on = boxes.some((b) => !b.checked); boxes.forEach((b) => { b.checked = on; }); },
    'fg-create': () => { const keys = $$('#modal .fg input:checked').map((b) => b.value); if (!keys.length) return closeModal(); api.createPlaylistsFromFolders(keys).then((r) => { closeModal(); chip = 'playlists'; merge(r); toast(`Created ${r.created} playlist${r.created === 1 ? '' : 's'}`); }); },
    rescan: () => api.rescan(),
    addvideofolder: () => api.addVideoFolder().then((r) => { if (!r.canceled) { S.videoFolders = r.videoFolders; toast('Looking for videos…'); if (route().view === 'settings') renderView(true); } }),
    removevideofolder: (arg) => api.removeVideoFolder(arg).then((r) => { S.videoFolders = r.videoFolders; }),
    vsort: (arg) => { vsort = arg; try { localStorage.setItem('lf.vsort', arg); } catch {} renderView(true); },
    removefolder: (arg) => api.removeFolder(arg).then((r) => { S.folders = r.folders; }),
    newplaylist: () => api.createPlaylist().then((r) => { merge(r); navigate({ view: 'playlist', id: r.id }); }),
    editpl: (arg) => editPlaylist(arg),
    delpl: (arg) => confirmDelete(arg),
    'delete-go': (arg) => api.deletePlaylist(arg).then((lite) => { closeModal(); L.mergeLite(lite); renderSide(); if (route().view === 'playlist' && route().id === arg) navigate({ view: 'home' }, true); else renderView(true); }),
    'modal-close': closeModal,
    'modal-save': () => { const id = editingId; api.updatePlaylist(id, { name: $('#eName').value, description: $('#eDesc').value }).then((lite) => { closeModal(); merge(lite); }); },
    'choose-img': () => api.setPlaylistImage(editingId).then((r) => { if (!r.canceled) { merge(r); refreshEditCover(); } }).catch(() => toast("That image couldn't be used.")),
    'remove-img': () => api.clearPlaylistImage(editingId).then((lite) => { merge(lite); refreshEditCover(); }),
    chip: (arg) => { chip = arg; renderSide(); },
    'queue-go': (arg) => P.jump(+arg),
    'queue-rm': (arg) => P.removeUpcoming(+arg),
  };

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest('#menu')) closeMenu();
    if (t.id === 'modal') return closeModal();
    let el;
    if ((el = t.closest('#menu button'))) {
      const it = menuItems[+el.dataset.i];
      if (it?.sub) openMenu(it.sub(), ...menuPos); else { closeMenu(); it?.fn(); }
      return;
    }
    if ((el = t.closest('[data-play]'))) { e.stopPropagation(); return playCtx(el.dataset.play); }
    if ((el = t.closest('.rowplay'))) {
      const row = el.closest('.row'), host = row.closest('.vlist');
      if (row.dataset.id === P.cur()) return P.toggle();
      P.ctx = null; return P.play(host._ids, +row.dataset.i);
    }
    if ((el = t.closest('[data-like]'))) { const id = el.closest('.row')?.dataset.id || P.cur(); return id && likeTrack(id); }
    if ((el = t.closest('[data-more]'))) { const r = el.getBoundingClientRect(); return openTrackMenu(el.closest('.row'), r.left - 180, r.bottom); }
    if ((el = t.closest('[data-act]'))) { const f = actions_[el.dataset.act]; return f && f(el.dataset.arg); }
    if ((el = t.closest('[data-go]'))) {
      const g = el.dataset.go;
      if (g === 'search') { navigate({ view: 'search', q: '' }); return $('#q').focus(); }
      if (g.endsWith(':') || !g) return;
      return go(g);
    }
  });
  document.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.row');
    if (!row || row.classList.contains('gone') || e.target.closest('a,button')) return;
    P.ctx = null; P.play(row.closest('.vlist')._ids, +row.dataset.i);
  });
  document.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.row');
    const pl = e.target.closest('[data-pl]');
    if (row) { e.preventDefault(); return openTrackMenu(row, e.clientX, e.clientY); }
    if (pl) {
      e.preventDefault();
      openMenu([{ label: 'Edit details', fn: () => editPlaylist(pl.dataset.pl) }, { label: 'Delete', danger: true, fn: () => confirmDelete(pl.dataset.pl) }], e.clientX, e.clientY);
    }
  });
  // drag to reorder inside playlists
  let dragFrom = null;
  document.addEventListener('dragstart', (e) => { const row = e.target.closest?.('.row[draggable]'); if (row) { dragFrom = +row.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom)); } });
  document.addEventListener('dragover', (e) => { const row = e.target.closest?.('.row'); if (row && dragFrom !== null) { e.preventDefault(); $$('.row.over').forEach((r) => r.classList.remove('over')); row.classList.add('over'); } });
  document.addEventListener('drop', (e) => {
    const row = e.target.closest?.('.row');
    if (!row || dragFrom === null) return;
    e.preventDefault();
    const pid = row.closest('.vlist')._opts.playlistId, to = +row.dataset.i, from = dragFrom;
    dragFrom = null;
    if (pid && from !== to) api.reorderPlaylist(pid, from, to).then(merge);
  });
  document.addEventListener('dragend', () => { dragFrom = null; $$('.row.over').forEach((r) => r.classList.remove('over')); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); if (!$('#modal').hidden) closeModal(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
    if (e.ctrlKey && e.key === 'ArrowRight') return P.next(true);
    if (e.ctrlKey && e.key === 'ArrowLeft') return P.prev();
    if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      P.audio.muted = false;
      P.audio.volume = Math.min(1, Math.max(0, P.audio.volume + (e.key === 'ArrowUp' ? 0.05 : -0.05)));
      const v = $('#vol'); v.value = Math.round(P.audio.volume * 100); v.dispatchEvent(new Event('input'));
      return;
    }
    if (e.key === ' ' && !e.target.closest('input,textarea,select,button,video')) {
      e.preventDefault();
      const vid = $('#vid');
      if (vid) { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); } else P.toggle();
    }
  });
  $('#main').addEventListener('scroll', closeMenu, { passive: true });

  // search box
  let qTimer;
  $('#q').addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => navigate({ view: 'search', q: $('#q').value }, route().view === 'search'), 120);
  });
  $('#libfilter').addEventListener('input', renderSide);
  $('#bBack').onclick = () => step(-1);
  $('#bFwd').onclick = () => step(1);
  window.addEventListener('player-change', () => {
    painters.forEach((p) => p(true));
    if (route().view === 'queue') renderView(true);
  });

  // ---------- boot ----------
  function applyState(st) {
    S.folders = st.folders; S.lastScanAt = st.lastScanAt;
    S.videoFolders = st.videoFolders; S.videos = st.videos;
    L.mergeLite(st);
    L.setTracks(st.tracks);
    renderSide(); L.renderBar();
    // re-rendering would restart a playing video
    if (route().view !== 'video') renderView(true);
  }
  (async () => {
    L.initBar();
    const st = await api.getState();
    applyState(st);
    if (st.recovered) toast('Your library file was damaged, so Localify started fresh.');
    L.restoreLast();
    api.onState(applyState);
    api.onScanProgress((p) => {
      const was = S.scan.scanning;
      S.scan = p;
      const bar = $('#scanbar');
      bar.hidden = !p.scanning;
      bar.firstElementChild.style.width = p.total ? (p.done / p.total) * 100 + '%' : '8%';
      $('#scanFoot').textContent = scanText();
      const t = $('#scanTxt'); if (t) t.textContent = scanText();
      if (was && !p.scanning && route().view === 'music' && !S.list.length) renderView(true);
      if (was && !p.scanning && pendingGroups) { const root = pendingGroups; pendingGroups = null; offerGroups(root, false); }
    });
    api.onMediaKey((k) => (k === 'playpause' ? P.toggle() : k === 'next' ? P.next(true) : P.prev()));
  })();
})();
