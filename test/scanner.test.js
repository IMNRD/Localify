// Run: npm test   (needs ffmpeg on PATH to generate sample files; skipped otherwise)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { scan, trackId } = require('../src/main/scanner');

try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.log('ffmpeg not found - skipping scanner test'); process.exit(0); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localify-'));
const music = path.join(root, 'music'), nested = path.join(music, 'sub', 'deeper');
fs.mkdirSync(nested, { recursive: true });
const cover = path.join(root, 'cover.png');
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
ff('-f', 'lavfi', '-i', 'color=c=0x34e07a:s=300x300', '-frames:v', '1', cover);
function mp3(file, tags, withArt = true) {
  const meta = Object.entries(tags).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]);
  const args = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2'];
  if (withArt) args.push('-i', cover, '-map', '0', '-map', '1', '-c:a', 'libmp3lame', '-c:v', 'copy', '-id3v2_version', '3');
  ff(...args, ...meta, file);
}
const A = path.join(music, 'a.mp3'), B = path.join(music, 'b.mp3'), X = path.join(music, 'xss.mp3');
mp3(A, { title: 'Hold Up', artist: 'Beyoncé', album: 'Lemonade', track: '1' });
mp3(B, { title: 'Daddy Lessons', artist: 'Beyoncé', album: 'Lemonade', track: '2' });
mp3(X, { title: '<img src=x onerror=alert(1)>', artist: 'Test', album: 'XSS' }, false);
fs.writeFileSync(path.join(music, 'broken.mp3'), crypto_bytes(2000));
ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', path.join(nested, 'No Tags Song.flac'));
function crypto_bytes(n) { return require('crypto').randomBytes(n); }

const store = { state: { folders: [music], tracks: {}, playlists: [], liked: [], recent: [], lastScanAt: 0 }, save() {} };
const artDir = path.join(root, 'art');

(async () => {
  const n = await scan(store, artDir);
  const T = store.state.tracks;
  assert.strictEqual(n, 5, 'indexes 5 files');
  const a = T[trackId(A)];
  assert.strictEqual(a.title, 'Hold Up'); assert.strictEqual(a.artist, 'Beyoncé'); assert.strictEqual(a.album, 'Lemonade');
  assert.strictEqual(a.trackNo, 1); assert.ok(a.durationSec >= 1, 'duration read'); assert.ok(a.artHash, 'art extracted');
  assert.strictEqual(T[trackId(B)].artHash, a.artHash, 'identical art is deduplicated');
  assert.strictEqual(fs.readdirSync(artDir).length, 1, 'one art file on disk');
  assert.strictEqual(T[trackId(X)].title, '<img src=x onerror=alert(1)>', 'tag kept as plain text');
  assert.strictEqual(T[trackId(X)].artHash, null);
  const broken = T[trackId(path.join(music, 'broken.mp3'))];
  assert.strictEqual(broken.title, 'broken'); assert.strictEqual(broken.artist, 'Unknown Artist'); assert.strictEqual(broken.album, 'Unknown Album');
  const flac = Object.values(T).find((t) => t.path.endsWith('.flac'));
  assert.strictEqual(flac.title, 'No Tags Song'); assert.ok(flac.available);

  // rescan: unchanged files are not re-read
  const before = { ...T[trackId(A)] };
  const mark = T[trackId(A)]; mark.title = 'SENTINEL';
  await scan(store, artDir);
  assert.strictEqual(T[trackId(A)].title, 'SENTINEL', 'unchanged file skipped on rescan');
  mark.title = before.title;

  // deleted file -> unavailable, kept; reappears -> available
  fs.renameSync(B, B + '.bak');
  await scan(store, artDir);
  assert.strictEqual(T[trackId(B)].available, false, 'missing file marked unavailable');
  assert.ok(T[trackId(B)], 'missing file kept in store');
  fs.renameSync(B + '.bak', B);
  await scan(store, artDir);
  assert.strictEqual(T[trackId(B)].available, true, 'file that comes back is available again');

  // changed file is re-read and keeps addedAt/plays
  T[trackId(A)].plays = 7;
  const added = T[trackId(A)].addedAt;
  mp3(A, { title: 'Hold Up (Edited)', artist: 'Beyoncé', album: 'Lemonade', track: '1' });
  await scan(store, artDir);
  assert.strictEqual(T[trackId(A)].title, 'Hold Up (Edited)');
  assert.strictEqual(T[trackId(A)].plays, 7); assert.strictEqual(T[trackId(A)].addedAt, added);

  // overlapping folders dedupe by id
  store.state.folders = [music, nested];
  assert.strictEqual(await scan(store, artDir), 5, 'overlapping folders do not double count');

  console.log('scanner tests passed');
  fs.rmSync(root, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
