/**
 * main.js —— 入口与主循环（v2 · 矿石镇化）
 * 负责：初始化 Game / Scene / UI，驱动游戏时间，处理窗口尺寸与存档，兜底捕获运行错误。
 */
(function () {
  'use strict';

  /* ==================== 运行诊断（错误兜底展示 + 记录） ==================== */

  const diag = { errors: [] };

  function logHost() {
    let host = document.getElementById('console-log');
    if (!host) {
      host = document.createElement('div');
      host.id = 'console-log';
      host.hidden = true;
      document.body.appendChild(host);
    }
    return host;
  }

  function record(text) {
    diag.errors.push(text);
    try { logHost().textContent += text + '\n'; } catch (e) { /* ignore */ }
  }

  function showError(msg) {
    record('[error] ' + msg);
    let ov = document.getElementById('error-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'error-overlay';
      document.body.appendChild(ov);
    }
    ov.innerHTML = '<div class="err-box"><b>牧场出了点小状况</b><pre></pre><button type="button">知道了</button></div>';
    ov.querySelector('pre').textContent = String(msg);
    ov.querySelector('button').addEventListener('click', function () { ov.remove(); });
  }

  window.addEventListener('error', function (e) {
    // 资源加载失败（无 message）不计入运行错误，仅记录
    if (!e.message) { record('[resource] ' + ((e.target && (e.target.src || e.target.href)) || 'unknown')); return; }
    showError(e.message + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function (e) {
    showError('Promise: ' + ((e.reason && e.reason.message) || e.reason));
  });

  const nativeError = console.error.bind(console);
  console.error = function () {
    nativeError.apply(null, arguments);
    try {
      record('[console.error] ' + Array.prototype.map.call(arguments, function (a) {
        return (a && a.stack) ? a.stack : String(a);
      }).join(' '));
    } catch (e) { /* ignore */ }
  };

  const nativeWarn = console.warn.bind(console);
  console.warn = function () {
    nativeWarn.apply(null, arguments);
    try {
      record('[console.warn] ' + Array.prototype.map.call(arguments, function (a) { return String(a); }).join(' '));
    } catch (e) { /* ignore */ }
  };

  /* ==================== 演示状态（?demo=1，仅用于截图/预览，不写入存档） ==================== */

  function setupDemo() {
    const D = window.GAME_DATA, G = window.Game, s = G.state;
    s.gold = 28600;
    s.stamina.max = s.stamina.max + 40;
    s.stamina.cur = s.stamina.max - 18;
    s.stamina.fatigue = 14;
    s.tools = { hoe: 2, wateringcan: 1, axe: 1, hammer: 2, sickle: 1, fishingrod: 1, fertilizer: 2, medicine: 1, fence: 1 };
    Object.keys(D.ores).forEach(function (k) { s.ores[k] = 2; });
    Object.keys(D.ores).forEach(function (k, i) { s.ores[k] = [14, 9, 6, 4, 3, 2, 1][i % 7]; });
    s.mine.spring = 6;
    s.mine.lake = 3;
    s.build.barnLevel = 2;
    s.build.beds = true;
    s.helpers = { count: 1, days: 7 };
    s.machines = { cheesemaker: true, mayomaker: true, yarnmaker: false };
    s.seeds = {};
    s.seeds[D.getCurrentCrops(s.season)[0].id] = 6;
    s.seeds[D.getCurrentCrops(s.season)[1].id] = 4;

    // 农田：不同生长阶段，含少量可收获
    const list = D.getCurrentCrops(s.season);
    const stages = [1, 2, 3, 4, 2, 3];
    for (let i = 0; i < 8; i++) {
      const crop = list[i % list.length];
      const p = s.plots[i * 2];
      const ripe = i % 3 === 0;
      p.plowed = true;
      p.cropType = crop.id;
      p.maxGrowth = crop.growthDays;
      p.growthStage = ripe ? crop.growthDays : Math.min(stages[i % stages.length], crop.growthDays - 1);
      p.waterLevel = i % 2 === 0 ? 2 : 0;
      p.fertilizerLevel = i % 3 === 0 ? 2 : 0;
      p.harvestable = ripe;
    }
    for (let i = 18; i < 22; i++) s.plots[i].plowed = true;

    s.log = [
      '第 43 天 · 出售牛奶 ×6，收入 1,240G',
      '第 44 天 · 兔子节参赛，获得优胜',
      '第 45 天 · 在春季矿洞第 6 层挖到银矿石 ×2',
      '第 45 天 · 小矮人开始帮忙浇水（剩余 7 天）'
    ];

    // 动物：不同爱心值与待收产物
    s.animals = [
      { id: 'chicken_demo_1', type: 'chicken', name: '小豆', points: 168, fed: false, grazing: true, produceReady: true, produceDays: 1, sick: false, daysSick: 0, grazedHours: 0 },
      { id: 'chicken_demo_2', type: 'chicken', name: '云朵', points: 62, fed: false, grazing: true, produceReady: false, produceDays: 0, sick: false, daysSick: 0, grazedHours: 0 },
      { id: 'cow_demo_1', type: 'cow', name: '奶昔', points: 214, fed: false, grazing: true, produceReady: true, produceDays: 1, sick: false, daysSick: 0, grazedHours: 0 },
      { id: 'cow_demo_2', type: 'cow', name: '布丁', points: 96, fed: false, grazing: false, produceReady: true, produceDays: 1, sick: false, daysSick: 0, grazedHours: 0 }
    ];
    s.horse.owned = true;
    s.horse.points = 132;
    s.dog.points = 118;
    s.dog.guarding = true;

    // 仓库：多等级产物
    s.storage.milk = { S: 2, M: 5, L: 3, G: 2, P: 1, X: 0 };
    s.storage.egg = { S: 4, M: 3, L: 2, G: 1, P: 0, X: 0 };
    s.storage.cheese = { S: 0, M: 2, L: 0, G: 1, P: 0, X: 0 };

    s.stats.harvested = 128;
    s.stats.products = 76;
    s.stats.mined = 93;
    s.stats.earned = 48210;
    s.stats.spent = 31540;
    s.stats.daysPlayed = 42;
    s.day = 46;
    s.season = D.getSeasonForDay(46);
    s.weather = 0;
    s.time = 9 * 60 + 20;
    G.generateForecast();
    return s;
  }

  let lastTick = 0;
  let booted = false;

  function boot() {
    if (booted) return;
    booted = true;

    const root = document.getElementById('app');
    if (!window.GAME_DATA || !window.Game || !window.UI || !window.Scene) {
      showError('游戏脚本未能加载完整，请确认 js 目录下的文件是否齐全。');
      return;
    }

    try {
      window.Game.init();
      if (window.GameExt && typeof window.GameExt.ensure === 'function') {
        try { window.GameExt.ensure(); } catch (err) { console.warn('扩展玩法初始化失败：' + err.message); }
      }
      if (new URLSearchParams(window.location.search).get('demo')) {
        try {
          setupDemo();
          window.Game.save = function () { return false; };   // 演示状态不落盘，避免污染玩家存档
        } catch (err) { console.warn('演示状态构建失败：' + err.message); }
      }
      window.Game.subscribe(function (evt) {
        if (evt === 'day-advanced' || evt === 'faint') window.UI.render();
      });
      window.UI.init(root);
    } catch (err) {
      console.error(err);
      showError('初始化失败：' + err.message);
      return;
    }

    window.addEventListener('resize', function () { window.Scene.resize(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) window.Game.save();
    });
    window.addEventListener('beforeunload', function () { window.Game.save(); });
    setInterval(function () { window.Game.save(); }, 20000);

    lastTick = performance.now();
    function loop(now) {
      const dt = Math.min(0.1, (now - lastTick) / 1000);
      lastTick = now;
      try {
        window.Game.update(dt);
        window.UI.tickClock();
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // 调试入口：window.__farm 可在控制台快速查看状态、跳天
    window.__farm = {
      state: function () { return window.Game.state; },
      errors: function () { return diag.errors; },
      addDays: function (n) { for (let i = 0; i < (n || 1); i++) window.Game.sleep(); window.UI.render(); }
    };
  }

  /* 第五轮：启动前先等 GLB 全部加载完成（堵 9 秒竞态）。
   *  旧版 9 秒超时抢跑 + 失败回退代码模型，导致慢网下动物悄悄变成旧模型、整个会话不变回来。
   *  新版：preloadGLB 全部 settled（失败文件重试一次）后再 boot；启动页显示加载进度；
   *  若仍有失败，启动后在画面顶部显示可见横幅（列出失败的动物），缺席的动物不出现、也不回退旧模型。 */
  var GLB_NAMES = { cow: '牛', sheep: '羊', chicken: '鸡', horse: '马', dog: '狗', duck: '鸭子', llama: '羊驼', squirrel: '松鼠' };
  function showGLBFailBanner(failed) {
    if (!failed || !failed.length) return;
    var names = failed.map(function (t) { return GLB_NAMES[t] || t; }).join('、');
    var bar = document.createElement('div');
    bar.id = 'glb-fail-banner';
    bar.innerHTML = '<span>⚠️ 模型加载失败（' + names + '），请检查网络后刷新页面</span><button type="button">知道了</button>';
    bar.querySelector('button').addEventListener('click', function () { bar.remove(); });
    document.body.appendChild(bar);
    window.__glbFailed = failed.slice();
  }
  function bootWithGLB() {
    var sub = document.querySelector('.boot-sub');
    function setProgress(done, total) {
      if (sub) sub.textContent = '正在加载 3D 模型 ' + done + '/' + total + '，请稍候…';
    }
    var p = (window.Models && typeof window.Models.preloadGLB === 'function')
      ? window.Models.preloadGLB(setProgress) : Promise.resolve();
    p.then(function () {
      boot();
      if (window.Models && typeof window.Models.glbFailed === 'function') {
        showGLBFailBanner(window.Models.glbFailed());
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWithGLB);
  } else {
    bootWithGLB();
  }
})();
