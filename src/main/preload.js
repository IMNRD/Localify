const { contextBridge, ipcRenderer } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
const on = (c, cb) => { const h = (_e, d) => cb(d); ipcRenderer.on(c, h); return () => ipcRenderer.removeListener(c, h); };

contextBridge.exposeInMainWorld('api', {
  getState: () => inv('getState'),
  addFolder: () => inv('addFolder'),
  removeFolder: (f) => inv('removeFolder', f),
  rescan: () => inv('rescan'),
  getFolderGroups: (root) => inv('getFolderGroups', root),
  createPlaylistsFromFolders: (keys) => inv('createPlaylistsFromFolders', keys),
  createPlaylist: (name) => inv('createPlaylist', name),
  updatePlaylist: (id, patch) => inv('updatePlaylist', id, patch),
  deletePlaylist: (id) => inv('deletePlaylist', id),
  addToPlaylist: (id, ids) => inv('addToPlaylist', id, ids),
  removeFromPlaylist: (id, i) => inv('removeFromPlaylist', id, i),
  reorderPlaylist: (id, from, to) => inv('reorderPlaylist', id, from, to),
  setPlaylistImage: (id) => inv('setPlaylistImage', id),
  clearPlaylistImage: (id) => inv('clearPlaylistImage', id),
  toggleLike: (t) => inv('toggleLike', t),
  recordPlay: (t) => inv('recordPlay', t),
  addVideoFolder: () => inv('addVideoFolder'),
  removeVideoFolder: (f) => inv('removeVideoFolder', f),
  saveVideoProgress: (id, pos, dur) => inv('saveVideoProgress', id, pos, dur),
  onState: (cb) => on('state', cb),
  onScanProgress: (cb) => on('scan-progress', cb),
  onMediaKey: (cb) => on('media-key', cb),
});
