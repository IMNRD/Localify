// Builds build/android-web: the desktop screens plus the Android bridge, with an Android CSP.
// The desktop files in src/renderer are never changed. Run: npm run android:web
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'build', 'android-web');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'src', 'renderer'), out, { recursive: true });
fs.copyFileSync(require.resolve('@capacitor/core/dist/capacitor.js'), path.join(out, 'capacitor.js'));
fs.copyFileSync(path.join(root, 'src', 'android', 'api-android.js'), path.join(out, 'api-android.js'));
fs.appendFileSync(path.join(out, 'styles.css'), '\n' + fs.readFileSync(path.join(root, 'src', 'android', 'android.css'), 'utf8'));

const file = path.join(out, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const csp = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
const scripts = '<script src="core.js"></script>';
if (!csp.test(html) || !html.includes(scripts)) throw new Error('index.html changed: update scripts/android-web.js');
// Media is served by the app itself under /_localify/ (same origin). 'unsafe-inline' scripts only
// because older Android WebViews receive Capacitor's bridge as an inline script.
html = html.replace(csp, `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'">`);
html = html.replace(scripts, `<script src="capacitor.js"></script>\n  <script src="api-android.js"></script>\n  ${scripts}`);
fs.writeFileSync(file, html);
console.log('Android web files ready in', path.relative(root, out));
