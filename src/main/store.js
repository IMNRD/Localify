// JSON-file store. Atomic debounced writes. Tracks are kept in a map by id.
const fs = require('fs');
const path = require('path');

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'library.json');
  const empty = () => ({ folders: [], tracks: {}, playlists: [], liked: [], recent: [], lastScanAt: 0, videoFolders: [], videos: {} });
  let state = empty();
  let recovered = false;
  let timer = null;

  if (fs.existsSync(file)) {
    try {
      state = Object.assign(empty(), JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      fs.renameSync(file, path.join(dir, `library.corrupt-${Date.now()}.json`));
      state = empty();
      recovered = true;
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  }
  function save() {
    if (!timer) timer = setTimeout(flush, 400);
  }

  return {
    dir,
    get state() { return state; },
    get recovered() { return recovered; },
    save,
    flush,
    snapshot() {
      return { ...state, tracks: Object.values(state.tracks), videos: Object.values(state.videos) };
    },
    lite() {
      return { playlists: state.playlists, liked: state.liked, recent: state.recent };
    },
  };
}

module.exports = { createStore };
