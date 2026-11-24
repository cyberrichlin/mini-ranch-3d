/**
 * assetgen.page.js —— 在真实浏览器里用 Three.js 离屏渲染生成 PNG 图标资源。
 * 结果挂在 window.__ASSETS（[{path, dataURL}]），由 tools/render-assets.js 通过 CDP 取回写盘。
 */
(function () {
  'use strict';

  var logEl = document.getElementById('log');
  var sheet = document.getElementById('sheet');
  var lines = [];
  function log(t) {
    lines.push(t);
    if (logEl) logEl.textContent = lines.join('\n');
    try { console.log('[assetgen] ' + t); } catch (e) { /* ignore */ }
  }

  function finish(list, error) {
    window.__ASSETS = list || [];
    window.__ASSET_ERROR = error || null;
    window.__DONE = true;
  }

  function preview(path, png) {
    if (!sheet) return;
    var fig = document.createElement('figure');
    var img = document.createElement('img');
    img.src = png;
    var cap = document.createElement('figcaption');
    cap.textContent = path.replace('assets/', '');
    fig.appendChild(img);
    fig.appendChild(cap);
    sheet.appendChild(fig);
  }

  async function run() {
    if (!window.THREE) throw new Error('three.min.js 未加载');
    if (!window.Models) throw new Error('models.js 未加载');
    if (window.Models.preloadGLB) {
      log('正在预加载 GLB 模型…');
      await Promise.race([window.Models.preloadGLB(), new Promise(function (r) { setTimeout(r, 20000); })]);
      if (window.Models.glbStatus) {
        var st = window.Models.glbStatus();
        Object.keys(st).forEach(function (t) { log('  GLB ' + t + ': ' + (st[t].ok ? 'OK' : '回退代码模型 (' + st[t].error + ')')); });
      }
    }
    var list = window.Models.assetList();
    log('待生成资源: ' + list.length + ' 项');
    var out = [];
    var composites = [];
    var t0 = Date.now();
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.kind === 'viewsheet') { composites.push(it); continue; }
      var png = window.Models.renderToPNG(it);
      if (!png || png.indexOf('data:image/png') !== 0) throw new Error('渲染失败: ' + it.path);
      out.push({ path: it.path, dataURL: png });
      preview(it.path, png);
      if ((i + 1) % 20 === 0) log('  进度 ' + (i + 1) + '/' + list.length);
    }
    // 三视图总览：依赖上面已渲染完成的 54 张三视图
    for (var j = 0; j < composites.length; j++) {
      var ci = composites[j];
      var cpn = await window.Models.composeViewSheet(out, ci);
      if (!cpn || cpn.indexOf('data:image/png') !== 0) throw new Error('拼图失败: ' + ci.path);
      out.push({ path: ci.path, dataURL: cpn });
      preview(ci.path, cpn);
    }
    log('完成: ' + out.length + ' 项，用时 ' + (Date.now() - t0) + ' ms');
    log('示例字节数(head/chicken): ' + out[0].dataURL.length);
    finish(out, null);
  }

  run().catch(function (e) {
    log('ERROR ' + (e && e.message ? e.message : e));
    finish([], (e && e.message) ? e.message : String(e));
  });
})();
