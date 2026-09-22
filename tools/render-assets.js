/**
 * render-assets.js —— 调用真实 Chrome（headless + CDP），加载 tools/assetgen.html，
 * 用 Three.js 离屏渲染出全部 3D 图标 / 动物头部图，写入 assets/ 并生成 assets/manifest.js
 *
 * 用法：node tools/render-assets.js
 * 依赖：Node 18+（内置 fetch / WebSocket），本机 Chrome。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');
const PAGE = 'file:///' + path.join(PROJ, 'tools', 'assetgen.html').replace(/\\/g, '/');
const ASSETS = path.join(PROJ, 'assets');
const PROFILE = path.join(process.env.TEMP || os.tmpdir(), 'mf-assetgen-profile-' + Date.now());
const PORT = 9361;
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH || ''
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('未找到 Chrome，可设置环境变量 CHROME_PATH 指定路径');
}

async function main() {
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.mkdirSync(ASSETS, { recursive: true });

  const chrome = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--window-size=520,900',
    '--enable-unsafe-swiftshader', '--allow-file-access-from-files', 'about:blank'
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) { /* 等待就绪 */ }
  }
  if (!target) { chrome.kill(); throw new Error('无法连接 Chrome 调试端口 ' + PORT); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push((msg.params.args || []).map((a) => a.value || a.description || a.type).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleErrors.push((d.exception && d.exception.description) || d.text);
    }
  });

  const send = (method, params) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });

  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Runtime.enable');

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  await send('Page.navigate', { url: PAGE });
  let done = false;
  for (let i = 0; i < 600; i++) {
    await sleep(500);
    try { done = await evalJs('window.__DONE === true'); } catch (e) { done = false; }
    if (done) break;
  }
  if (!done) { ws.close(); chrome.kill(); throw new Error('页面渲染超时'); }

  const err = await evalJs('window.__ASSET_ERROR || null');
  if (err) { ws.close(); chrome.kill(); throw new Error('页内渲染错误: ' + err); }

  const count = await evalJs('window.__ASSETS.length');
  console.log('页内生成资源数: ' + count);
  console.log(await evalJs('document.getElementById("log").textContent'));

  const manifest = {
    generatedAt: new Date().toISOString(),
    heads: {}, preview: {}, icons: {},
    views: { adult: {}, baby: {} },
    viewsSheet: ''
  };
  let totalBytes = 0;
  for (let i = 0; i < count; i++) {
    const p = await evalJs('window.__ASSETS[' + i + '].path');
    const dataURL = await evalJs('window.__ASSETS[' + i + '].dataURL');
    const b64 = String(dataURL).split(',')[1] || '';
    const buf = Buffer.from(b64, 'base64');
    const abs = path.join(PROJ, p.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
    totalBytes += buf.length;
    const name = path.basename(p, '.png');
    if (p.indexOf('assets/animals/') === 0) manifest.heads[name] = p;
    else if (p.indexOf('assets/preview/') === 0) manifest.preview[name] = p;
    else if (p.indexOf('assets/views/adult/') === 0) manifest.views.adult[name] = p;
    else if (p.indexOf('assets/views/baby/') === 0) manifest.views.baby[name] = p;
    else if (p.indexOf('assets/icons/') === 0) manifest.icons[name] = p;
    else if (p === 'assets/overview/views_sheet.png') manifest.viewsSheet = p;
    else if (p.indexOf('assets/overview/') === 0) manifest.overview = p;
    console.log('  write ' + p + '  ' + buf.length + ' B');
  }

  const manifestJs = '/* 自动生成：node tools/render-assets.js */\nwindow.MF_ASSETS = ' +
    JSON.stringify(manifest, null, 1) + ';\n';
  fs.writeFileSync(path.join(ASSETS, 'manifest.js'), manifestJs, 'utf8');
  console.log('manifest: assets/manifest.js  合计 ' + totalBytes + ' B');
  if (consoleErrors.length) console.log('控制台错误: ' + JSON.stringify(consoleErrors.slice(0, 5)));

  ws.close();
  chrome.kill();
  await sleep(600);
  console.log('DONE');
  try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* Chrome 句柄未释放，忽略 */ }
}

main().catch((e) => {
  console.error('FATAL ' + e.message);
  process.exitCode = 2;
});
