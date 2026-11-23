// Works out which subfolders of the music folders could become playlists.
const path = require('path');
const crypto = require('crypto');

const norm = (p) => path.resolve(p).toLowerCase();
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// onlyRoot: limit to subfolders of one music folder (null = all). Folders that already
// have a playlist made from them (playlist.sourceKey) are left out.
function computeGroups(state, onlyRoot = null) {
  const allRoots = state.folders.map(norm);
  const roots = onlyRoot ? [onlyRoot] : state.folders;
  const done = new Set(state.playlists.map((p) => p.sourceKey).filter(Boolean));
  const groups = new Map();

  for (const t of Object.values(state.tracks)) {
    if (!t.available) continue;
    const dir = path.dirname(t.path);
    const nd = norm(dir);
    if (allRoots.includes(nd)) continue; // sits directly in a music folder, not a subfolder
    const root = roots.find((r) => nd.startsWith(norm(r) + path.sep));
    if (!root) continue;
    const key = crypto.createHash('sha1').update(nd).digest('hex').slice(0, 12);
    if (done.has(key)) continue;
    if (!groups.has(key)) groups.set(key, { key, dir, rel: path.relative(root, dir), tracks: [] });
    groups.get(key).tracks.push(t);
  }

  const list = [...groups.values()].sort((a, b) => natural(a.rel, b.rel));
  const base = (g) => path.basename(g.dir);
  const counts = {};
  for (const g of list) counts[norm(base(g))] = (counts[norm(base(g))] || 0) + 1;
  for (const g of list) {
    g.name = counts[norm(base(g))] > 1 ? `${path.basename(path.dirname(g.dir))} - ${base(g)}` : base(g);
    g.name = g.name.slice(0, 100);
    g.tracks.sort((a, b) => (a.discNo || 0) - (b.discNo || 0) || (a.trackNo || 0) - (b.trackNo || 0) || natural(a.path, b.path));
  }
  return list;
}

module.exports = { computeGroups };
