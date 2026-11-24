// localify:// protocol. Only ids / hashes / generated filenames are accepted — never raw paths.
const { protocol } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Readable } = require('stream');

const MIME = {
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  // Chromium sniffs the real container; mov is ISO-BMFF like mp4, mkv is the WebM superset.
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/webm',
};
const notFound = () => new Response('Not found', { status: 404 });

async function serveFile(file, mime, rangeHeader) {
  let size;
  try { size = (await fsp.stat(file)).size; } catch { return notFound(); }
  if (size === 0) return notFound();
  let start = 0, end = size - 1, status = 200;
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!m || (m[1] === '' && m[2] === '')) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    if (m[1] === '') start = Math.max(0, size - Number(m[2]));
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(end, Number(m[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    status = 206;
  }
  const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status, headers });
}

async function handle(store, req) {
  let url;
  try { url = new URL(req.url); } catch { return notFound(); }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const range = req.headers.get('range');

  if (url.hostname === 'media') {
    const t = /^[a-f0-9]{16}$/.test(name) && store.state.tracks[name];
    if (!t || !t.available) return notFound();
    return serveFile(t.path, MIME[path.extname(t.path).toLowerCase()] || 'application/octet-stream', range);
  }
  if (url.hostname === 'video') {
    const v = /^[a-f0-9]{16}$/.test(name) && store.state.videos[name];
    if (!v || !v.available) return notFound();
    return serveFile(v.path, MIME[path.extname(v.path).toLowerCase()] || 'application/octet-stream', range);
  }
  if (url.hostname === 'art') {
    if (!/^[a-f0-9]{40}$/.test(name)) return notFound();
    for (const ext of ['jpg', 'png']) {
      const f = path.join(store.dir, 'art', `${name}.${ext}`);
      if (fs.existsSync(f)) return serveFile(f, ext === 'png' ? 'image/png' : 'image/jpeg', null);
    }
    return notFound();
  }
  if (url.hostname === 'pl') {
    if (!/^[\w.-]+\.jpg$/.test(name) || name.includes('..')) return notFound();
    const root = path.join(store.dir, 'playlist-images');
    const f = path.join(root, name);
    if (path.dirname(f) !== root) return notFound();
    return serveFile(f, 'image/jpeg', null);
  }
  return notFound();
}

function register(store) {
  protocol.handle('localify', (req) => handle(store, req));
}

module.exports = { register, handle };
