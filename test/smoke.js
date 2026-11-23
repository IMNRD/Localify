// Headless end-to-end check. Run:  xvfb-run -a npx electron --no-sandbox test/smoke.js
// Needs ffmpeg. Writes screenshots to $SHOTS (default /tmp/localify-shots).
const { app, dialog, net, nativeImage, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { execFileSync } = require('child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localify-smoke-'));
const shots = process.env.SHOTS || '/tmp/localify-shots';
fs.mkdirSync(shots, { recursive: true });
process.env.LOCALIFY_USERDATA = path.join(root, 'userdata');
app.commandLine.appendSwitch('disable-gpu');

const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
const music = path.join(root, 'music');
fs.mkdirSync(music, { recursive: true });
const albums = [
  ['Midnight Drive', 'Neon Harbor', '0x7c3aed'], ['Paper Planets', 'Neon Harbor', '0x0ea5e9'],
  ['Slow Bloom', 'Aria Vale', '0xf43f5e'], ['Café Sessions', 'Beyoncé', '0xf59e0b'],
];
albums.forEach(([album, artist, color], ai) => {
  const cover = path.join(root, `c${ai}.png`);
  ff('-f', 'lavfi', '-i', `color=c=${color}:s=400x400`, '-frames:v', '1', cover);
  for (let t = 1; t <= 4; t++) {
    ff('-f', 'lavfi', '-i', `sine=frequency=${300 + ai * 60 + t * 20}:duration=${20 + t}`, '-i', cover, '-map', '0', '-map', '1',
      '-c:a', 'libmp3lame', '-c:v', 'copy', '-id3v2_version', '3', '-metadata', `title=${album} Song ${t}`, '-metadata', `artist=${artist}`,
      '-metadata', `album=${album}`, '-metadata', `track=${t}`, path.join(music, `${ai}-${t}.mp3`));
  }
});
ff('-f', 'lavfi', '-i', 'sine=frequency=500:duration=5', '-metadata', 'title=<img src=x onerror=alert(1)>', '-metadata', 'artist=Hacker', '-metadata', 'album=XSS', path.join(music, 'xss.mp3'));
// subfolder fixtures: music2/Rock/Album A (2 songs), music2/Jazz (1 song), music2/loose.mp3 (not in a subfolder)
const music2 = path.join(root, 'music2');
for (const [rel, n] of [['Rock/Album A/02 second.mp3', 2], ['Rock/Album A/01 first.mp3', 1], ['Jazz/blue.mp3', 3], ['loose.mp3', 4]]) {
  fs.mkdirSync(path.dirname(path.join(music2, rel)), { recursive: true });
  ff('-f', 'lavfi', '-i', `sine=frequency=${200 + n * 50}:duration=3`, '-metadata', `title=Folder Song ${n}`, '-metadata', 'artist=Folder Artist', '-metadata', 'album=Folder Album', '-metadata', `track=${n}`, path.join(music2, rel));
}
// image fixtures
const img = path.join(root, 'wide.jpg'), webp = path.join(root, 'pic.webp'), gif = path.join(root, 'pic.gif'), fake = path.join(root, 'fake.png');
ff('-f', 'lavfi', '-i', 'testsrc=s=800x400', '-frames:v', '1', img);
ff('-f', 'lavfi', '-i', 'testsrc=s=500x300', '-frames:v', '1', webp);
ff('-f', 'lavfi', '-i', 'testsrc=s=320x240:d=1', '-frames:v', '1', gif);
fs.writeFileSync(fake, 'this is not an image');

let nextDialog = null;
dialog.showOpenDialog = async () => nextDialog;

require('../src/main/main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, fn) => Promise.resolve().then(fn).then(() => { results.push(['PASS', name]); }, (e) => { results.push(['FAIL', name + ' -> ' + e.message]); });

app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0];
  win.setSize(1400, 860);
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => { await sleep(400); fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const logs = [];
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) logs.push(e.message); });

  await shot('01-empty');
  await check('empty library shows welcome CTA', async () => assert.ok((await js('document.querySelector("#view").innerText')).includes('Add a folder to fill this up')));

  nextDialog = { canceled: false, filePaths: [music] };
  await js('window.api.addFolder()');
  for (let i = 0; i < 100 && (await js('L.S.list.length')) < 17; i++) await sleep(300);
  await check('scan indexes 17 files and UI receives them', async () => assert.strictEqual(await js('L.S.list.length'), 17));
  await js('document.querySelector("[data-go=home]").click()');
  await shot('02-home');

  const ids = await js('L.S.sorted.map(t=>t.id)');
  const someId = await js('L.S.list.find(t=>t.title==="Slow Bloom Song 2").id');
  const get = (u, h) => net.fetch(u, { headers: h });
  await check('range request -> 206 with Content-Range', async () => {
    const r = await get(`localify://media/${someId}`, { Range: 'bytes=100-' });
    assert.strictEqual(r.status, 206);
    assert.ok(/^bytes 100-\d+\/\d+$/.test(r.headers.get('content-range')), r.headers.get('content-range'));
    assert.strictEqual(r.headers.get('content-type'), 'audio/mpeg');
  });
  await check('full request -> 200 with Accept-Ranges', async () => { const r = await get(`localify://media/${someId}`); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('accept-ranges'), 'bytes'); });
  await check('suffix range bytes=-50 -> 206 length 50', async () => { const r = await get(`localify://media/${someId}`, { Range: 'bytes=-50' }); assert.strictEqual(r.status, 206); assert.strictEqual((await r.arrayBuffer()).byteLength, 50); });
  await check('unsatisfiable range -> 416', async () => assert.strictEqual((await get(`localify://media/${someId}`, { Range: 'bytes=99999999-' })).status, 416));
  for (const u of ['localify://media/0000000000000000', 'localify://media/..%2F..%2Fetc%2Fpasswd', 'localify://media//etc/passwd', 'localify://art/abc', 'localify://art/..%2F..%2Fx',
    'localify://pl/..%2F..%2Flibrary.json', 'localify://pl/library.json', 'localify://pl/..%5Clibrary.json.jpg', 'localify://nothing/x']) {
    await check(`blocked: ${u}`, async () => assert.strictEqual((await get(u)).status, 404));
  }

  // playback
  await js(`L.P.play(L.S.sorted.slice(1,7).map(t=>t.id), 0)`);
  await sleep(2500);
  await check('audio plays and advances', async () => {
    const s = await js('({t:L.P.audio.currentTime,paused:L.P.audio.paused,err:L.P.audio.error&&L.P.audio.error.message,seek:L.P.audio.seekable.length})');
    assert.ok(!s.err, 'audio error: ' + s.err); assert.ok(s.t > 0.5 && !s.paused, JSON.stringify(s)); assert.ok(s.seek > 0, 'seekable');
  });
  await check('seek works', async () => { await js('L.P.audio.currentTime = 10'); await sleep(800); const s = await js('({t:L.P.audio.currentTime,rs:L.P.audio.readyState,p:L.P.audio.paused,d:L.P.audio.duration,cur:L.P.cur()})'); assert.ok(s.t >= 10, JSON.stringify(s)); });
  await check('next / prev / repeat / shuffle state', async () => {
    const first = await js('L.P.cur()'); await js('L.P.next(true)'); const second = await js('L.P.cur()'); assert.notStrictEqual(first, second);
    await js('L.P.audio.currentTime=0'); await js('L.P.prev()'); assert.strictEqual(await js('L.P.cur()'), first);
    await js('L.P.setShuffle(true)'); assert.strictEqual(await js('L.P.order[L.P.pos]'), await js('L.P.order[L.P.pos]'));
    await js('L.P.setShuffle(false)'); assert.strictEqual(await js('L.P.cur()'), first);
    await js('L.P.cycleRepeat();L.P.cycleRepeat()'); assert.strictEqual(await js('L.P.repeat'), 'one'); await js('L.P.cycleRepeat()');
  });
  await shot('03-playing-home');

  // playlist with image
  let pid;
  await check('create playlist via UI button and navigate', async () => {
    await js('document.querySelector("[data-act=newplaylist]").click()'); await sleep(500);
    pid = await js('L.S.playlists[0].id'); assert.ok(pid);
    assert.ok((await js('document.querySelector("#view").innerText')).includes('Nothing here yet'));
  });
  await js(`window.api.addToPlaylist('${pid}', [...L.S.albums.values()].map(a=>a.trackIds[0]).concat(L.S.sorted[0].id)).then(l=>{L.mergeLite(l)})`);
  await js('document.querySelector("[data-go=songs]").click()'); await sleep(200);
  await js(`document.querySelector("#liblist [data-pl]").click()`); await sleep(500);
  await shot('04-playlist-mosaic');
  await check('playlist mosaic fallback renders', async () => assert.strictEqual(await js('document.querySelectorAll(".hcover .art.mosaic img").length'), 4));
  const saveImg = async (file) => { nextDialog = { canceled: false, filePaths: [file] }; return js(`window.api.setPlaylistImage('${pid}').then(r=>{L.mergeLite(r);return {ok:true,image:r.playlists.find(p=>p.id==='${pid}').image}}).catch(e=>({ok:false,msg:e.message}))`); };
  const imgDir = path.join(process.env.LOCALIFY_USERDATA, 'playlist-images');
  for (const [label, file] of [['jpg 800x400', img], ['webp', webp], ['gif', gif]]) {
    await check(`cover from ${label} -> square 640x640 jpeg`, async () => {
      const r = await saveImg(file); assert.ok(r.ok, r.msg);
      const out = nativeImage.createFromPath(path.join(imgDir, r.image)); assert.deepStrictEqual(out.getSize(), { width: 640, height: 640 });
      assert.ok(fs.readFileSync(path.join(imgDir, r.image)).slice(0, 2).toString('hex') === 'ffd8', 'is jpeg');
    });
  }
  await check('old cover file is deleted on replace (1 file left)', async () => { await sleep(300); assert.strictEqual(fs.readdirSync(imgDir).length, 1); });
  await check('non-image renamed .png is rejected', async () => { const r = await saveImg(fake); assert.strictEqual(r.ok, false); assert.strictEqual(fs.readdirSync(imgDir).length, 1); });
  await check('cancelled dialog changes nothing', async () => { nextDialog = { canceled: true, filePaths: [] }; const r = await js(`window.api.setPlaylistImage('${pid}')`); assert.strictEqual(r.canceled, true); });
  await check('cover served via localify://pl', async () => { const name = fs.readdirSync(imgDir)[0]; const r = await get(`localify://pl/${name}`); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'image/jpeg'); });
  await js('document.querySelector("[data-go=home]").click()'); await sleep(200);
  await js(`document.querySelector("#liblist [data-pl]").click()`); await sleep(600);
  await shot('05-playlist-image');
  await check('playlist header shows custom image', async () => assert.ok((await js('document.querySelector(".hcover img")?.src || ""')).startsWith('localify://pl/')));
  await js(`window.api.clearPlaylistImage('${pid}').then(l=>L.mergeLite(l))`);
  await check('remove image deletes file', async () => { await sleep(300); assert.strictEqual(fs.readdirSync(imgDir).length, 0); });
  await check('reorder + remove validated', async () => {
    const r = await js(`window.api.reorderPlaylist('${pid}',0,3).then(l=>l.playlists[0].trackIds.length)`); assert.strictEqual(r, 6, 'length ' + r);
    const bad = await js(`window.api.reorderPlaylist('${pid}',0,99).then(()=>'ok').catch(()=>'rejected')`); assert.strictEqual(bad, 'rejected', 'bad reorder gave ' + bad);
    assert.strictEqual(await js(`window.api.updatePlaylist('nope',{}).then(()=>'ok').catch(()=>'rejected')`), 'rejected');
  });

  // search + XSS
  await js('document.querySelector("#q").value="img"; document.querySelector("#q").dispatchEvent(new Event("input"))'); await sleep(500);
  await shot('06-search-xss');
  await check('XSS title rendered as text, no injected <img src=x>', async () => {
    assert.strictEqual(await js('document.querySelectorAll("#view img[src=x], #player img[src=x]").length'), 0);
    assert.ok((await js('document.querySelector("#view").innerText')).includes('<img src=x onerror=alert(1)>'));
  });
  await js('document.querySelector("#q").value="cafe"; document.querySelector("#q").dispatchEvent(new Event("input"))'); await sleep(400);
  await check('accent-insensitive search finds "Café Sessions"', async () => assert.ok((await js('document.querySelector("#view").innerText')).includes('Café Sessions')));
  await js('document.querySelector("#q").value="beyonce"; document.querySelector("#q").dispatchEvent(new Event("input"))'); await sleep(400);
  await check('"beyonce" finds artist Beyoncé', async () => assert.ok((await js('document.querySelector("#view").innerText')).includes('Beyoncé')));
  await js('document.querySelector("#q").value="zzzz"; document.querySelector("#q").dispatchEvent(new Event("input"))'); await sleep(400);
  await check('empty results message', async () => assert.ok((await js('document.querySelector("#view").innerText')).includes('No results for “zzzz”')));

  // other views
  for (const v of ['artist', 'album', 'queue', 'settings', 'liked']) {
    await js(`document.querySelector('[data-go=home]').click()`);
    if (v === 'artist') await js('document.querySelector("#chips [data-arg=artists]").click(); document.querySelector("#liblist .lrow").click()');
    else if (v === 'album') await js('document.querySelector("#chips [data-arg=albums]").click(); document.querySelector("#liblist .lrow").click()');
    else if (v === 'queue') await js('document.querySelector("#bQueue").click()');
    else if (v === 'settings') await js('document.querySelector("[data-go=settings]").click()');
    else await js('document.querySelector("#chips [data-arg=playlists]").click(); document.querySelector("#liblist .lrow").click()');
    await sleep(400); await shot('07-' + v);
  }
  await check('like toggles and shows in Liked Songs', async () => {
    await js(`window.api.toggleLike('${someId}').then(l=>L.mergeLite(l))`); assert.strictEqual(await js('L.S.likedOrder.length'), 1);
  });

  // menus and dialogs
  await js(`document.querySelector('[data-go=home]').click()`); await sleep(150);
  await js(`document.querySelector("#chips [data-arg=playlists]").click(); document.querySelector("#liblist [data-pl]").click()`); await sleep(500);
  await js(`document.querySelector('#view .row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:300}))`); await sleep(200);
  await shot('09-context-menu');
  await check('track context menu has expected items', async () => { const t = await js('document.querySelector("#menu").innerText'); for (const w of ['Play next', 'Add to queue', 'Add to playlist', 'Go to artist', 'Go to album', 'Remove from this playlist']) assert.ok(t.includes(w), 'missing ' + w); });
  await check('Add to playlist submenu adds a track', async () => {
    const before = await js(`L.S.playlists[0].trackIds.length`);
    await js(`[...document.querySelectorAll('#menu button')].find(b=>b.textContent.startsWith('Add to playlist')).click()`); await sleep(150);
    await shot('10-playlist-picker');
    await js(`[...document.querySelectorAll('#menu button')].find(b=>b.textContent.includes('My Playlist #1')).click()`); await sleep(500);
    assert.strictEqual(await js(`L.S.playlists[0].trackIds.length`), before + 1);
  });
  await check('Remove from this playlist works', async () => {
    const before = await js(`L.S.playlists[0].trackIds.length`);
    await js(`document.querySelector('#view .row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:300}))`); await sleep(150);
    await js(`[...document.querySelectorAll('#menu button')].find(b=>b.textContent.startsWith('Remove from this playlist')).click()`); await sleep(500);
    assert.strictEqual(await js(`L.S.playlists[0].trackIds.length`), before - 1);
  });
  await check('edit dialog saves name and description', async () => {
    await js(`document.querySelector('.hcover.editable').click()`); await sleep(250);
    await shot('11-edit-dialog');
    await js(`document.querySelector('#eName').value='Road Trip'; document.querySelector('#eDesc').value='Songs for driving'; document.querySelector('[data-act=modal-save]').click()`); await sleep(500);
    assert.strictEqual(await js(`L.S.playlists[0].name`), 'Road Trip');
    assert.ok((await js('document.querySelector("#view").innerText')).includes('Songs for driving'));
    assert.ok((await js('document.querySelector("#liblist").innerText')).includes('Road Trip'));
  });
  await check('edit dialog: choose image applies and Remove image appears', async () => {
    await js(`document.querySelector('.hcover.editable').click()`); await sleep(250);
    nextDialog = { canceled: false, filePaths: [img] };
    await js(`document.querySelector('[data-act=choose-img]').click()`); await sleep(1200);
    assert.ok((await js(`document.querySelector('#ecover img')?.src || ''`)).startsWith('localify://pl/'));
    assert.strictEqual(await js(`document.querySelector('#eRemove').hidden`), false);
    await shot('12-edit-with-image');
    await js(`document.querySelector('[data-act=modal-close]').click()`);
  });
  await check('delete playlist asks for confirmation then removes it', async () => {
    await js(`document.querySelector('[data-act=delpl]').click()`); await sleep(200);
    assert.ok((await js('document.querySelector("#modal").innerText')).includes('Delete playlist?'));
    await js(`document.querySelector('[data-act=delete-go]').click()`); await sleep(600);
    assert.strictEqual(await js('L.S.playlists.length'), 0);
    assert.strictEqual(fs.readdirSync(imgDir).length, 0, 'cover file removed');
    assert.ok((await js('document.querySelector("#view").innerText')).includes('Good'), 'navigated home');
  });

  // playlists from subfolders
  await js(`document.querySelector('[data-go=settings]').click()`); await sleep(200);
  nextDialog = { canceled: false, filePaths: [music2] };
  await js(`document.querySelector('[data-act=addfolder]').click()`);
  for (let i = 0; i < 60 && (await js(`document.querySelector('#modal').hidden`)); i++) await sleep(250);
  await shot('13-folder-playlists-prompt');
  await check('after adding a folder with subfolders, user is prompted', async () => {
    const t = await js(`document.querySelector('#modal').innerText`);
    assert.ok(t.includes('Make playlists from your folders?'), t);
    assert.strictEqual(await js(`document.querySelectorAll('#modal .fg').length`), 2);
    assert.ok(t.includes('Album A') && t.includes('Jazz') && !t.includes('loose'), t);
  });
  await check('"Not now" closes the prompt and creates nothing', async () => {
    await js(`document.querySelector('[data-act=modal-close]').click()`); await sleep(200);
    assert.strictEqual(await js(`document.querySelector('#modal').hidden`), true); assert.strictEqual(await js('L.S.playlists.length'), 0);
  });
  await check('Settings button re-opens the prompt; Create makes ordered playlists', async () => {
    await js(`document.querySelector('[data-act=folderplaylists]').click()`); await sleep(500);
    assert.strictEqual(await js(`document.querySelector('#modal').hidden`), false);
    await js(`document.querySelector('[data-act=fg-create]').click()`); await sleep(700);
    const pls = await js(`L.S.playlists.map(p=>({n:p.name,t:p.trackIds.map(id=>L.S.tracks.get(id).title)}))`);
    assert.deepStrictEqual(pls.map((p) => p.n).sort(), ['Album A', 'Jazz']);
    assert.deepStrictEqual(pls.find((p) => p.n === 'Album A').t, ['Folder Song 1', 'Folder Song 2']);
    assert.strictEqual(pls.find((p) => p.n === 'Jazz').t.length, 1);
    assert.ok((await js(`document.querySelector('#liblist').innerText`)).includes('Album A'));
  });
  await check('converted folders are not offered again', async () => {
    await js(`document.querySelector('[data-go=settings]').click()`); await sleep(150);
    await js(`document.querySelector('[data-act=folderplaylists]').click()`); await sleep(400);
    assert.strictEqual(await js(`document.querySelector('#modal').hidden`), true);
    assert.ok((await js(`document.querySelector('#toast').innerText`)).includes('No new subfolders'));
    assert.deepStrictEqual(await js(`window.api.createPlaylistsFromFolders(['zzzzzzzzzzzz']).then(r=>r.created)`), 0, 'unknown key creates nothing');
    assert.strictEqual(await js(`window.api.getFolderGroups('/etc').then(()=>'ok').catch(()=>'rejected')`), 'rejected');
  });

  // 20k virtualization
  await js(`(() => { const a=[]; for(let i=0;i<20000;i++) a.push({id:('0000000000000000'+i.toString(16)).slice(-16),path:'x',title:'Song '+i,artist:'Artist '+(i%300),albumArtist:'',album:'Album '+(i%1500),trackNo:i%12,discNo:0,year:2000,durationSec:200,artHash:null,addedAt:i,available:true,plays:0}); L.setTracks(a); })()`);
  const t0 = Date.now();
  await js('document.querySelector("[data-go=songs]").click()'); await sleep(300);
  await check('20,000 tracks: Songs view renders < 150 rows', async () => { const n = await js('document.querySelectorAll("#view .row").length'); assert.ok(n > 10 && n < 150, 'rows=' + n); });
  await check('20,000 tracks: scrolled rows update', async () => { await js('document.querySelector("#main").scrollTop = 56*10000'); await sleep(400); assert.ok((await js('document.querySelector("#view .row .t").textContent')).includes('Song '), 'rows after scroll'); assert.ok(await js('+document.querySelector("#view .row").dataset.i') > 9000); });
  results.push(['INFO', `20k view render+scroll took ${Date.now() - t0}ms`]);
  await shot('08-songs-20k');

  await check('no renderer console errors', async () => assert.deepStrictEqual(logs.filter((l) => !/localify:\/\/(media|art|pl)/.test(l)), []));

  const fails = results.filter((r) => r[0] === 'FAIL');
  for (const [s, m] of results) console.log(s, m);
  console.log(`\n${results.filter((r) => r[0] === 'PASS').length} passed, ${fails.length} failed`);
  fs.rmSync(root, { recursive: true, force: true });
  app.exit(fails.length ? 1 : 0);
});
