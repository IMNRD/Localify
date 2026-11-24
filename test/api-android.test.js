// Run: npm test. Checks the Android window.api stand-in against a fake MediaLibrary plugin.
const assert = require('assert');
const { createApi } = require('../src/android/api-android');

const audio = [
  { id: '000000000000002a', path: '/storage/emulated/0/Music/Beyoncé/01 Hold Up.mp3', title: 'Hold Up', artist: 'Beyoncé', album: 'Lemonade', track: '2001', year: '2016', duration: '221000', size: '5000000', dateAdded: '1700000000' },
  { id: '000000000000002b', path: '/storage/emulated/0/Music/voice memo.m4a', title: '', artist: '<unknown>', album: null, track: null, year: null, duration: '3000', size: '100', dateAdded: '1700000001' },
  { id: '', path: '/no/id.mp3' },
];
const video = [
  { id: '0000000000000010', path: '/storage/emulated/0/Movies/Holiday Day 2.MP4', duration: '30500', size: '9000000', dateAdded: '1700000002' },
  { id: '0000000000000011', path: '/storage/emulated/0/Movies/old.avi', duration: '1000', size: '1', dateAdded: '1' },
];
let granted = true, calls = 0;
const fake = { list: async () => { calls++; return granted ? { granted: true, audio, video } : { granted: false, audio: [], video: [] }; } };

(async () => {
  const api = createApi(fake);
  const st = await api.getState();
  assert.strictEqual(st.tracks.length, 2, 'entries without an id are skipped');
  const [a, b] = st.tracks;
  assert.deepStrictEqual([a.title, a.artist, a.album, a.discNo, a.trackNo, a.year, a.durationSec, a.addedAt],
    ['Hold Up', 'Beyoncé', 'Lemonade', 2, 1, 2016, 221, 1700000000000]);
  assert.deepStrictEqual([b.title, b.artist, b.album, b.trackNo], ['voice memo', 'Unknown Artist', 'Unknown Album', 0], 'missing tags fall back like desktop');
  assert.ok(st.tracks.every((t) => t.available && t.plays === 0 && t.artHash === null));
  assert.deepStrictEqual(st.videos.map((v) => [v.name, v.ext, v.dur]), [['Holiday Day 2', 'mp4', 30.5]], 'only playable video types');
  assert.deepStrictEqual([st.playlists, st.liked, st.recent], [[], [], []]);

  assert.strictEqual(api.url('media', a.id), '/_localify/media/000000000000002a');
  assert.strictEqual(api.url('video', '0000000000000010'), '/_localify/video/0000000000000010');
  assert.strictEqual(api.url('art', 'x'), '');

  // rescan pushes fresh state and scan progress to listeners; unsubscribing works
  const seen = [], scans = [];
  const off = api.onState((s) => seen.push(s.tracks.length));
  api.onScanProgress((p) => scans.push(p.scanning));
  assert.strictEqual(await api.rescan(), true);
  assert.deepStrictEqual(seen, [2]); assert.deepStrictEqual(scans, [true, false]);
  off(); await api.rescan(); assert.deepStrictEqual(seen, [2]);

  // permission refused -> empty library, "add folder" counts as cancelled
  granted = false;
  assert.deepStrictEqual(await api.addFolder(), { canceled: true });
  assert.deepStrictEqual((await api.getState()).folders, []);
  granted = true;
  assert.deepStrictEqual(await api.addFolder(), { folders: ['All music on this phone'], added: null });

  // not-yet-supported edits reject instead of pretending to work; playback helpers never break playback
  for (const m of ['createPlaylist', 'toggleLike', 'removeFolder', 'setPlaylistImage']) {
    assert.strictEqual(await api[m]('x').then(() => 'ok', () => 'rejected'), 'rejected', m);
  }
  assert.strictEqual(await api.recordPlay(a.id), null);
  assert.strictEqual(await api.saveVideoProgress('0000000000000010', 1, 2), true);
  assert.deepStrictEqual(await api.getFolderGroups(null), []);
  // every desktop preload method exists on Android
  const preload = require('fs').readFileSync(require('path').join(__dirname, '../src/main/preload.js'), 'utf8');
  for (const [, m] of preload.matchAll(/^\s{2}(\w+):/gm)) assert.strictEqual(typeof api[m], 'function', 'missing ' + m);
  assert.ok(calls > 0);
  console.log('android api tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
