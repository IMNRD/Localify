// Audio playback, queue, and the bottom player bar.
(function () {
  'use strict';
  const { S, $, esc, fmt, icon, toast } = L;
  const audio = new Audio();
  audio.preload = 'auto';
  const P = (L.P = { audio, queue: [], order: [], pos: -1, shuffle: false, repeat: 'off', counted: false, errs: 0 });
  const ls = {
    get: (k, d) => { try { const v = localStorage.getItem('lf.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('lf.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const emit = () => window.dispatchEvent(new Event('player-change'));
  const range = (n) => [...Array(n).keys()];
  const shuffled = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const playable = (id) => !!S.tracks.get(id)?.available;
  P.cur = () => (P.pos >= 0 && P.order.length ? P.queue[P.order[P.pos]] : null);
  P.track = () => S.tracks.get(P.cur());

  // First playable position starting at `from` moving in `dir`; -1 if none (wraps only with repeat-all).
  function seek(from, dir) {
    const n = P.order.length;
    for (let k = 0; k < n; k++) {
      let p = from + dir * k;
      if (p < 0 || p >= n) { if (P.repeat === 'all') p = ((p % n) + n) % n; else return -1; }
      if (playable(P.queue[P.order[p]])) return p;
    }
    return -1;
  }
  function setCurrent(autoplay) {
    const id = P.cur();
    if (!id) return;
    audio.src = `localify://media/${id}`;
    P.counted = false;
    ls.set('last', id);
    if (autoplay) audio.play().catch(() => {});
    renderBar();
    emit();
  }
  function load(dir = 1) {
    const p = seek(P.pos, dir);
    if (p < 0) return endOfQueue();
    P.pos = p;
    setCurrent(true);
  }
  function endOfQueue() {
    audio.pause();
    const p = seek(0, 1);
    if (p >= 0) { P.pos = p; setCurrent(false); }
    renderBar();
    emit();
  }

  P.play = (ids, start = 0) => {
    if (!ids.length) return;
    P.queue = ids.slice();
    if (P.shuffle) {
      P.order = [start, ...shuffled(range(ids.length).filter((i) => i !== start))];
      P.pos = 0;
    } else { P.order = range(ids.length); P.pos = start; }
    P.errs = 0;
    load(1);
  };
  P.toggle = () => {
    if (P.pos < 0) { if (S.sorted.length) P.play(S.sorted.map((t) => t.id), 0); return; }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  };
  P.next = (manual = true) => {
    if (!P.order.length) return;
    if (P.repeat === 'one' && !manual) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    let np = P.pos + 1;
    if (np >= P.order.length) {
      if (P.repeat !== 'all') return endOfQueue();
      np = 0;
      if (P.shuffle) P.order = shuffled(range(P.queue.length));
    }
    P.pos = np;
    load(1);
  };
  P.prev = () => {
    if (!P.order.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    P.pos = P.pos - 1 < 0 ? (P.repeat === 'all' ? P.order.length - 1 : 0) : P.pos - 1;
    load(-1);
  };
  P.jump = (orderPos) => { P.pos = orderPos; load(1); };
  P.setShuffle = (on) => {
    P.shuffle = on;
    ls.set('shuffle', on);
    if (P.order.length) {
      if (on) P.order = [...P.order.slice(0, P.pos + 1), ...shuffled(P.order.slice(P.pos + 1))];
      else { const cur = P.order[P.pos]; P.order = range(P.queue.length); P.pos = cur; }
    }
    renderBar();
    emit();
  };
  P.cycleRepeat = () => {
    P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat];
    ls.set('repeat', P.repeat);
    renderBar();
  };
  P.enqueue = (ids, next) => {
    if (P.pos < 0) return P.play(ids, 0);
    ids.forEach((id, k) => {
      P.queue.push(id);
      const idx = P.queue.length - 1;
      if (next) P.order.splice(P.pos + 1 + k, 0, idx); else P.order.push(idx);
    });
    emit();
  };
  P.removeUpcoming = (orderPos) => {
    if (orderPos <= P.pos || orderPos >= P.order.length) return;
    const qi = P.order[orderPos];
    P.queue.splice(qi, 1);
    P.order.splice(orderPos, 1);
    P.order = P.order.map((x) => (x > qi ? x - 1 : x));
    emit();
  };
  L.restoreLast = () => {
    const id = ls.get('last', null);
    if (id && playable(id)) { P.queue = [id]; P.order = [0]; P.pos = 0; setCurrent(false); }
  };

  function count() {
    const id = P.cur();
    if (!id || P.counted) return;
    P.counted = true;
    window.api.recordPlay(id).then((r) => {
      if (!r) return;
      const t = S.tracks.get(r.trackId);
      if (t) t.plays = r.plays;
      S.recent = r.recent;
    }).catch(() => {});
  }

  // ---- bar ----
  let seeking = false;
  L.initBar = () => {
    $('#player').innerHTML = `
      <div class="p-info" id="pInfo"></div>
      <div class="p-mid">
        <div class="p-btns">
          <button class="ib" id="bShuffle" title="Shuffle">${icon('shuffle', 20)}</button>
          <button class="ib" id="bPrev" title="Previous">${icon('prev', 22)}</button>
          <button class="playbtn" id="bPlay" title="Play">${icon('play', 20)}</button>
          <button class="ib" id="bNext" title="Next">${icon('next', 22)}</button>
          <button class="ib" id="bRepeat" title="Repeat">${icon('repeat', 20)}</button>
        </div>
        <div class="p-seek"><span id="tCur">0:00</span><input type="range" id="seek" min="0" max="1000" value="0" aria-label="Seek"><span id="tTot">0:00</span></div>
      </div>
      <div class="p-right">
        <button class="ib" id="bQueue" title="Queue" data-go="queue">${icon('queue', 20)}</button>
        <button class="ib" id="bMute" title="Mute">${icon('volume', 20)}</button>
        <input type="range" id="vol" min="0" max="100" value="80" aria-label="Volume">
      </div>`;
    $('#bShuffle').onclick = () => P.setShuffle(!P.shuffle);
    $('#bPrev').onclick = P.prev;
    $('#bPlay').onclick = P.toggle;
    $('#bNext').onclick = () => P.next(true);
    $('#bRepeat').onclick = P.cycleRepeat;
    $('#bMute').onclick = () => { audio.muted = !audio.muted; renderVol(); };
    const seekEl = $('#seek'), vol = $('#vol');
    seekEl.addEventListener('input', () => { seeking = true; fill(seekEl); $('#tCur').textContent = fmt((seekEl.value / 1000) * dur()); });
    seekEl.addEventListener('change', () => { audio.currentTime = (seekEl.value / 1000) * dur(); seeking = false; });
    vol.addEventListener('input', () => { audio.volume = vol.value / 100; audio.muted = false; ls.set('vol', audio.volume); renderVol(); });
    audio.volume = ls.get('vol', 0.8);
    P.shuffle = ls.get('shuffle', false);
    P.repeat = ls.get('repeat', 'off');
    renderBar();
    renderVol();
  };
  const dur = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : P.track()?.durationSec || 0);
  const fill = (el) => el.style.setProperty('--p', (el.value / el.max) * 100 + '%');
  function renderVol() {
    const v = $('#vol');
    v.value = audio.muted ? 0 : Math.round(audio.volume * 100);
    fill(v);
    $('#bMute').innerHTML = icon(audio.muted || audio.volume === 0 ? 'mute' : 'volume', 20);
  }
  function renderBar() {
    if (!$('#pInfo')) return;
    const t = P.track();
    $('#pInfo').innerHTML = t
      ? `${L.art(t.artHash, 'p-art')}<div class="p-meta"><a class="p-title" data-go="album:${t._album}">${esc(t.title)}</a><a class="p-artist" data-go="artist:${t._artist}">${esc(t.artist)}</a></div>
         <button class="ib heart ${S.liked.has(t.id) ? 'on' : ''}" data-like title="Like">${icon(S.liked.has(t.id) ? 'heartfill' : 'heart', 20)}</button>`
      : '';
    $('#tTot').textContent = fmt(dur());
    $('#bShuffle').classList.toggle('on', P.shuffle);
    $('#bRepeat').classList.toggle('on', P.repeat !== 'off');
    $('#bRepeat').innerHTML = icon(P.repeat === 'one' ? 'repeat1' : 'repeat', 20);
    $('#bPlay').innerHTML = icon(audio.paused ? 'play' : 'pause', 20);
    document.title = t && !audio.paused ? `${t.artist} – ${t.title}` : 'Localify';
  }
  L.renderBar = renderBar;

  audio.addEventListener('play', renderBar);
  audio.addEventListener('pause', renderBar);
  audio.addEventListener('playing', () => { P.errs = 0; });
  audio.addEventListener('loadedmetadata', () => { $('#tTot').textContent = fmt(dur()); });
  audio.addEventListener('timeupdate', () => {
    if (!seeking) {
      const d = dur();
      const s = $('#seek');
      s.value = d ? Math.round((audio.currentTime / d) * 1000) : 0;
      fill(s);
      $('#tCur').textContent = fmt(audio.currentTime);
    }
    if (audio.currentTime >= 30) count();
  });
  audio.addEventListener('ended', () => { count(); P.next(false); });
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    toast('Skipped: file not found');
    if (++P.errs <= P.queue.length) P.next(true); else endOfQueue();
  });
})();
