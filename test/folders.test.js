// Pure logic test for "playlists from subfolders" (no ffmpeg/electron needed).
const assert = require('assert');
const path = require('path');
const { computeGroups } = require('../src/main/folders');

const root = path.resolve('/music');
const t = (rel, o = {}) => { const p = path.join(root, rel); return { id: rel.replace(/\W/g, '_').slice(0, 16), path: p, available: true, trackNo: 0, discNo: 0, ...o }; };
const tracks = [
  t('loose.mp3'),
  t('Rock/Album A/02 b.mp3', { trackNo: 2 }), t('Rock/Album A/01 a.mp3', { trackNo: 1 }),
  t('Jazz/j10.mp3'), t('Jazz/j2.mp3'),
  t('Mix/CD1/x.mp3'), t('Other/CD1/y.mp3'),
  t('Gone/g.mp3', { available: false }),
];
const state = { folders: [root], playlists: [], tracks: Object.fromEntries(tracks.map((x) => [x.id, x])) };

const g = computeGroups(state);
const names = g.map((x) => x.name);
assert.deepStrictEqual(names, ['Jazz', 'Mix - CD1', 'Other - CD1', 'Album A'], names.join('|')); // sorted by relative path
assert.ok(!g.some((x) => x.tracks.some((y) => y.path === path.join(root, 'loose.mp3'))), 'loose root files are not a group');
assert.ok(!g.some((x) => x.name === 'Gone'), 'unavailable-only folders are ignored');
assert.deepStrictEqual(g[3].tracks.map((x) => path.basename(x.path)), ['01 a.mp3', '02 b.mp3'], 'ordered by track number');
assert.deepStrictEqual(g[0].tracks.map((x) => path.basename(x.path)), ['j2.mp3', 'j10.mp3'], 'natural filename order');
assert.strictEqual(g[3].rel, path.join('Rock', 'Album A'));

// already converted folders are skipped
state.playlists.push({ sourceKey: g[0].key });
assert.ok(!computeGroups(state).some((x) => x.name === 'Jazz'), 'folder with an existing playlist is not offered again');

// onlyRoot limits to that folder; a folder nested in another root still counts the inner one as root-level
const other = path.resolve('/other');
state.folders = [root, other];
state.tracks.z = { id: 'z', path: path.join(other, 'Sub', 'z.mp3'), available: true };
assert.deepStrictEqual(computeGroups(state, other).map((x) => x.name), ['Sub']);
assert.ok(!computeGroups(state, root).some((x) => x.name === 'Sub'));
console.log('folder grouping tests passed');
