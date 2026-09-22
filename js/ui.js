/**
 * ui.js —— 界面渲染与交互层（v2 · 矿石镇化）
 * 负责把 Game.state 渲染成 HUD / 卡片 / 网格，并把用户操作翻译为 Game API 调用。
 * 3D 场景挂在 #scene-wrap 中常驻，切换视图时不会被重建。
 */
window.UI = (function () {
  'use strict';

  const D = window.GAME_DATA;

  const VIEWS = [
    { key: 'pasture',  name: '牧场', icon: '🏡' },
    { key: 'farm',     name: '农田', icon: '🌾' },
    { key: 'animals',  name: '动物', icon: '🐄' },
    { key: 'stable',   name: '马厩', icon: '🐴' },
    { key: 'shop',     name: '商店', icon: '🛒' },
    { key: 'mine',     name: '矿洞', icon: '⛏️' },
    { key: 'calendar', name: '日历', icon: '📅' },
    { key: 'beach',    name: '海滩', icon: '🏖️' },
    { key: 'fishbook', name: '海产图鉴', icon: '📖' }
  ];

  let root = null;
  let view = 'pasture';
  let selectedPlot = null;
  let seedPick = null;
  let pastureDetail = false;
  let bagOpen = false;
  let sceneInited = false;
  let lastClockText = '';

  /* 提示条：3 秒自动消失（每条独立计时），同屏最多 4 条 */
  const TOAST_LIFE = 3000;
  const TOAST_MAX = 4;

  /* ======================= 工具 ======================= */

  /* ---------- 3D 素材（萌版动物头 / 图标）与爱心等级 ---------- */
  const MF = window.MF_ASSETS || {};
  function headSrc(type) { return (MF.heads && MF.heads[type]) || ''; }
  function iconSrc(key, fallbackIcon) {
    const ic = MF.icons || {};
    const p = ic[key] || ic['tool_' + key] || ic['fish_' + key] || ic['goods_' + key] ||
              ic['seed_' + key] || ic['ex_' + key] || ic['dev_' + key] || ic['ore_' + key];
    if (!p) return '<span class="ic-fb">' + (fallbackIcon || '') + '</span>';
    return '<img class="ic3d" src="' + p + '" alt="">';
  }
  /* 动物 3D 萌版头部缩略图（无素材时回退成 emoji） */
  function animalIconSrc(type, fallbackIcon) {
    const p = MF.heads && MF.heads[type];
    if (!p) return '<span class="ic-fb">' + (fallbackIcon || '') + '</span>';
    return '<img class="ic3d" src="' + p + '" alt="">';
  }
  function navIconSrc(key, fallbackIcon) {
    const p = MF.icons && MF.icons['nav_' + key];
    if (!p) return '<span>' + (fallbackIcon || '') + '</span>';
    return '<img class="nav3d" src="' + p + '" alt=""><i>' + fallbackIcon + '</i>';
  }
  function heartTier(points) {
    const lv = Math.floor((points || 0) / 25);
    if (lv >= 8) return 'red';
    if (lv >= 4) return 'yellow';
    return 'gray';
  }
  function tierHeartIcon(points) {
    const t = heartTier(points);
    const p = MF.icons && MF.icons['heart_' + t];
    const fb = t === 'red' ? '❤️' : (t === 'yellow' ? '💛' : '🩶');
    if (!p) return '<span class="heart-fb">' + fb + '</span>';
    return '<img class="heart3d" src="' + p + '" alt="" title="' + tierName(points) + '">';
  }
  function tierName(points) { return { gray: '还很生疏', yellow: '喜欢你了', red: '挚友撒娇中' }[heartTier(points)]; }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function el(id) { return root.querySelector('#' + id); }
  function gradeChip(g) {
    const info = D.produceGrades.find(x => x.id === g) || { color: '#888' };
    return '<span class="grade" style="background:' + info.color + '">' + g + '</span>';
  }
  function hearts(n, max) {
    max = max || 10;
    let out = '<span class="hearts">';
    for (let i = 0; i < max; i++) out += i < n ? '❤' : '🤍';
    return out + '</span>';
  }
  function bar(cur, max, cls) {
    const pct = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
    return '<span class="bar ' + (cls || '') + '"><i style="width:' + pct + '%"></i></span>';
  }
  function fmt(n) { return (n || 0).toLocaleString('en-US'); }

  function toast(msg, type) {
    const host = el('toast-host');
    if (!host) return;
    const div = document.createElement('div');
    div.className = 'toast ' + (type || 'info');
    div.textContent = msg;
    host.appendChild(div);
    // 每条提示独立计时，3 秒后各自消失（避免旧提示互相顶掉定时器而永久残留）
    const timer = setTimeout(() => {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, TOAST_LIFE);
    div.__toastTimer = timer;
    // 极端情况下（连续大量操作）最多同时保留 4 条，防止遮挡界面
    while (host.children.length > TOAST_MAX) {
      const old = host.firstChild;
      if (old) {
        if (old.__toastTimer) clearTimeout(old.__toastTimer);
        host.removeChild(old);
      }
    }
  }

  function result(r, okMsg) {
    if (!r) return;
    if (r.ok === false) { toast(r.msg || '操作无法进行', 'warn'); return; }
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok');
    render();
  }

  /* ======================= 骨架 ======================= */

  function skeleton() {
    root.innerHTML = [
      '<div id="hud"></div>',
      '<div id="stage">',
      '  <div id="scene-wrap"><canvas id="scene"></canvas><div class="vignette"></div><div class="scene-badge" id="scene-badge"></div></div>',
      '  <div id="view-host"></div>',
      '</div>',
      '<nav id="tabs">' + VIEWS.map(v => '<button class="tab" data-act="nav:' + v.key + '" data-view="' + v.key + '">' + navIconSrc(v.key, v.icon) + v.name + '</button>').join('') + '</nav>',
      '<div id="toast-host"></div>'
    ].join('\n');
    el('view-host').addEventListener('click', onAction);
    el('tabs').addEventListener('click', onAction);
  }

  function mountScene() {
    if (sceneInited) return;
    const canvas = el('scene');
    const wrap = el('scene-wrap');
    const mode = window.Scene.init(canvas, wrap, Game.state);
    sceneInited = true;
    window.Scene.onClickPlot(index => {
      selectedPlot = index;
      if (view !== 'farm') { view = 'farm'; }
      render();
      toast('已选中第 ' + (Math.floor(index / 6) + 1) + ' 行第 ' + (index % 6 + 1) + ' 列田地', 'info');
    });
    window.Scene.onClickAnimal(id => {
      const a = Game.state.animals.find(x => x.id === id);
      if (!a) return;
      if (a.produceReady) result(Game.collectAnimal(id), r => a.name + ' 产出 ' + r.icon + r.product + '（' + r.grade + ' 级）');
      else { Game.talkAnimal(id); toast('你摸了摸 ' + a.name + '，爱心 +1', 'ok'); render(); }
    });
    window.Scene.onClickMine(() => { view = 'mine'; render(); toast('来到矿洞入口', 'info'); });
    const badge = el('scene-badge');
    if (badge) badge.textContent = mode === '3d' ? '萌版 3D · 固定俯视角' : '等距伪 3D 降级模式';
    window.Scene.refresh(Game.state);
  }

  /* ======================= HUD ======================= */

  function hudHTML() {
    const s = Game.state;
    const w = Game.weatherInfo();
    const st = s.stamina;
    const need = Game.animalCareNeeds();
    const fest = Game.todayFestival();
    const alertBits = [];
    if (need.hungry) alertBits.push('🍽 ' + need.hungry + ' 只待喂');
    if (need.sick) alertBits.push('💊 ' + need.sick + ' 只生病');
    if (fest) alertBits.push('🎉 ' + fest.icon + fest.name);

    return [
      '<div class="hud-row">',
      '  <div class="hud-chip gold"><span class="ci">💰</span><b>' + fmt(s.gold) + '</b><i>G</i></div>',
      '  <div class="hud-chip" data-season="' + s.season + '"><span class="ci">' + D.seasonIcons[s.season] + '</span>第 ' + s.day + ' 天 · ' + D.seasons[s.season] + Game.dayOfSeason() + '</div>',
      '  <div class="hud-chip"><span class="ci">' + w.icon + '</span>' + esc(w.name) + '</div>',
      '  <div class="hud-chip clock" id="hud-clock"><span class="ci">🕒</span>' + Game.timeText() + '</div>',
      '</div>',
      '<div class="hud-row hutwo">',
      '  <div class="hud-guage"><span class="g-label">体力</span>' + bar(st.cur, st.max, st.cur / st.max < 0.25 ? 'low' : 'sta') + '<span class="g-val">' + Math.floor(st.cur) + '/' + st.max + '</span></div>',
      '  <div class="hud-guage"><span class="g-label">疲劳</span>' + bar(st.fatigue, D.FAINT_FATIGUE, st.fatigue > 60 ? 'low' : 'fatigue') + '<span class="g-val">' + Math.floor(st.fatigue) + '/' + D.FAINT_FATIGUE + '</span></div>',
      '</div>',
      '<div class="hud-row hud-tags">',
      '  <span class="tag">👨‍🌾 ' + Game.yearOf() + ' 年目</span>',
      '  <span class="tag">🚿 小矮人 ' + (s.helpers.days > 0 ? '帮忙中（剩 ' + s.helpers.days + ' 天）' : '未雇佣') + '</span>',
      (alertBits.length ? '  <span class="tag warn">' + alertBits.join(' · ') + '</span>' : '  <span class="tag ok">牧场一切顺利</span>'),
      '</div>'
    ].join('\n');
  }

  function tabsHTML() {
    root.querySelectorAll('.tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    document.body.dataset.view = view;
    document.body.dataset.season = String(Game.state.season);
    document.body.dataset.weather = String(Game.state.weather);
  }

  /* ======================= 视图：牧场 ======================= */

  function viewPasture() {
    const s = Game.state;
    const w = Game.weatherInfo();
    const need = Game.animalCareNeeds();
    const fest = Game.todayFestival();
    const m = window.Scene.mode();
    const st = s.stamina;
    const fs = Game.farmSummary();
    const hint = st.cur <= 0 ? '<span class="warn-text">体力见底，干活会开始累积疲劳，建议睡觉或吃点东西。</span>'
      : st.fatigue > 60 ? '<span class="warn-text">疲劳偏高，再硬撑会晕倒。</span>'
      : '状态良好，适合下地干活。';

    const detail = pastureDetail ? [
      '    <div class="card-b">',
      '      <p class="note">' + esc(w.desc) + '</p>',
      '      <p class="note">' + hint + '</p>',
      '    </div>',
      '    <div class="card-b log">' + (s.log.length ? s.log.slice(0, 4).map(l => '<div>· ' + esc(l) + '</div>').join('') : '<div class="muted">还没有记录，先推进一天试试。</div>') + '</div>'
    ].join('\n') : '';

    return [
      '<div class="pasture-overlay">',
      '  <div class="scene-caption">' + D.seasonIcons[s.season] + ' ' + Game.seasonFullName() + ' · ' + esc(w.icon + ' ' + w.name) + ' · ' + (m === '3d' ? '点击田地或动物可直接操作' : '降级模式：点击屏幕中央田地操作') + '</div>',
      '  <div class="quick-row">',
      '    <button class="btn primary" data-act="quick:graze">🐾 放牧</button>',
      '    <button class="btn" data-act="quick:grazeIn">🏚️ 收回</button>',
      '    <button class="btn" data-act="quick:waterAll">🚿 一键浇水</button>',
      '    <button class="btn" data-act="quick:harvestAll">🌾 一键收获</button>',
      '    <button class="btn" data-act="quick:collectAll">🧺 收取产物</button>',
      '    <button class="btn" data-act="quick:feedAll">🍽 全部喂食</button>',
      '    <button class="btn" data-act="quick:eat">🍱 吃饭（100G）</button>',
      '    <button class="btn primary" data-act="quick:sleep">😴 睡觉收工</button>',
      '  </div>',
      '  <div class="card today-card' + (pastureDetail ? ' open' : '') + '">',
      '    <div class="card-h"><b>' + Game.timeText() + ' · 今日安排</b><span class="muted">' + (fest ? '节日：' + fest.icon + ' ' + fest.name : '今日无节日') + '</span>',
      '      <button class="btn tiny" data-act="toggle:detail">' + (pastureDetail ? '收起详情' : '展开详情') + '</button></div>',
      '    <div class="strip">',
      '      <span class="kv-inline">天气 <b>' + esc(w.icon + ' ' + w.name) + '</b></span>',
      '      <span class="kv-inline">田地 <b>待收 ' + fs.ready + ' · 生长 ' + fs.planted + ' · 荒地 ' + fs.empty + '</b></span>',
      '      <span class="kv-inline">动物 <b>' + need.total + ' 只 · 待喂 ' + need.hungry + ' · 生病 ' + need.sick + '</b></span>',
      '      <button class="kv-inline kv-btn" data-act="bag" title="点击查看仓库 / 背包明细">仓库 <b>' + Game.storageTotal() + ' 件</b></button>',
      '    </div>',
      detail,
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ---------------------- 仓库 / 背包浮层（点击信息条打开） ---------------------- */

  function bagLine(iconHTML, name, meta) {
    return [
      '<div class="shop-line bag-line">',
      '  <span class="sl-i">' + iconHTML + '</span>',
      '  <div class="sl-m"><b>' + name + '</b><span class="muted">' + meta + '</span></div>',
      '</div>'
    ].join('');
  }

  function bagSection(title, countText, rows) {
    if (!rows.length) return '';
    return [
      '<div class="bag-sec">',
      '  <div class="bag-sec-h"><b>' + title + '</b><span class="muted">' + countText + '</span></div>',
      rows.join(''),
      '</div>'
    ].join('\n');
  }

  function bagPanelHTML() {
    const s = Game.state;
    const storage = Game.storageList();
    const ores = Game.oreList();
    const shopMap = {};
    D.shopItems.forEach(i => { shopMap[i.id] = i; });

    const storageRows = storage.map(it => bagLine(
      iconSrc(it.key, it.icon),
      esc(it.name) + ' ×' + it.total,
      D.GRADE_IDS.filter(g => it.grades[g] > 0).map(g => gradeChip(g) + '×' + it.grades[g]).join(' ') + ' · 市值 ' + fmt(it.value) + 'G'
    ));

    const oreRows = ores.map(o => bagLine(iconSrc(o.key, o.icon), esc(o.name) + ' ×' + o.count, '单价 ' + fmt(o.value) + 'G'));

    const seedRows = Object.keys(s.seeds || {}).filter(k => s.seeds[k] > 0).map(k => {
      const c = D.getCropInfo(k) || { name: k, icon: '🌱' };
      return bagLine(iconSrc('seed_' + k, c.icon), esc(c.name) + '种子 ×' + s.seeds[k], '播种用');
    });

    const sea = (window.GameExt && GameExt.seaList) ? GameExt.seaList() : null;
    const seaRows = sea ? sea.list.filter(it => it.owned).map(it => bagLine(
      iconSrc(it.key, it.icon), esc(it.name) + ' ×' + it.count, '最大 ' + it.maxSize + 'cm · 单价 ' + fmt(it.price) + 'G'
    )) : [];

    const machineKeys = ['cheesemaker', 'mayomaker', 'yarnmaker'];
    const toolRows = Object.keys(D.tools)
      .filter(k => machineKeys.indexOf(k) < 0 && (s.tools[k] || 0) > 0)
      .map(k => bagLine(iconSrc(k, D.tools[k].icon), esc(D.tools[k].name), D.toolLevels[s.tools[k]] || ('Lv' + s.tools[k])))
      .concat(machineKeys.filter(k => s.machines[k]).map(k => {
        const m = shopMap[k] || { name: k, icon: '🏭' };
        return bagLine(iconSrc(k, m.icon), esc(m.name), '加工设施 · 已建造');
      }));

    const berryRows = (s.berries || 0) > 0
      ? [bagLine('<span class="ic-fb">🫐</span>', '野莓 ×' + s.berries, '矿洞采集 · 食用回体力')]
      : [];

    const sections = [
      bagSection('🌾 农产品与加工品', storage.length + ' 类', storageRows),
      bagSection('⛏️ 矿石', ores.length + ' 种', oreRows),
      bagSection('🌱 种子袋', seedRows.length + ' 种', seedRows),
      bagSection('🐟 海产', seaRows.length + ' 种', seaRows),
      bagSection('🧰 道具与设施', toolRows.length + ' 件', toolRows),
      bagSection('🫐 采集物', berryRows.length + ' 种', berryRows)
    ].join('');

    const totalValue = storage.reduce((n, i) => n + i.value, 0);

    return [
      '<div class="bag-mask" data-act="bagclose"></div>',
      '<div class="bag-panel card">',
      '  <div class="card-h"><b>🎒 仓库 / 背包</b><span class="muted">合计 ' + Game.storageTotal() + ' 件 · 农产品市值 ' + fmt(totalValue) + 'G</span><button class="btn tiny" data-act="bagclose">关闭</button></div>',
      '  <div class="card-b bag-body">' + (sections || '<div class="muted">仓库空空如也，先去田里收点东西吧。</div>') + '</div>',
      '</div>'
    ].join('\n');
  }

  /* ======================= 视图：农田 ======================= */

  function plotFace(p) {
    if (!p.plowed) return { icon: '🟫', label: '荒地' };
    if (!p.cropType) return { icon: '🟩', label: '已耕地' };
    const crop = D.getCropInfo(p.cropType);
    if (p.harvestable) return { icon: crop.icon, label: '可收获' };
    const ratio = p.maxGrowth ? Math.round((p.growthStage / p.maxGrowth) * 100) : 0;
    return { icon: '🌱', label: ratio + '%' };
  }

  function viewFarm() {
    const s = Game.state;
    const crops = D.getCurrentCrops(s.season);
    const f = Game.farmSummary();
    const p = selectedPlot !== null ? s.plots[selectedPlot] : null;

    let grid = '<div class="plot-grid">';
    s.plots.forEach((plot, i) => {
      const face = plotFace(plot);
      const cls = ['plot'];
      if (plot.harvestable) cls.push('ready');
      if (plot.plowed && !plot.cropType) cls.push('plowed');
      if (selectedPlot === i) cls.push('sel');
      if (plot.waterLevel > 0 && plot.cropType) cls.push('wet');
      grid += '<button class="' + cls.join(' ') + '" data-act="plot:' + i + '">'
        + '<span class="pi">' + face.icon + '</span>'
        + '<span class="pl">' + face.label + '</span>'
        + '<span class="pidx">' + (Math.floor(i / 6) + 1) + '-' + (i % 6 + 1) + '</span>'
        + '</button>';
    });
    grid += '</div>';

    let panel = '';
    if (p) {
      const crop = p.cropType ? D.getCropInfo(p.cropType) : null;
      panel = [
        '<div class="card panel">',
        '  <div class="card-h"><b>第 ' + (Math.floor(selectedPlot / 6) + 1) + ' 行第 ' + (selectedPlot % 6 + 1) + ' 列</b><button class="mini" data-act="plotclose">关闭</button></div>',
        '  <div class="card-b">',
        '    <div class="kv"><span>状态</span><b>' + (crop ? crop.icon + ' ' + crop.name + (p.harvestable ? '（可收获）' : '（生长 ' + p.growthStage + '/' + p.maxGrowth + '）') : (p.plowed ? '已耕地' : '荒地')) + '</b></div>',
        crop ? '    <div class="kv"><span>水分 / 肥料</span><b>' + '💧'.repeat(Math.max(0, p.waterLevel)) + ' ' + '🧪'.repeat(Math.max(0, p.fertilizerLevel)) + '</b></div>' : '',
        '    <div class="btn-row">',
        p.plowed ? '' : '      <button class="btn primary" data-act="do:plow">🪓 耕地（2）</button>',
        p.cropType ? (p.harvestable
          ? '      <button class="btn primary" data-act="do:harvest">🧺 收获</button>'
          : '      <button class="btn" data-act="do:water">🚿 浇水（2）</button><button class="btn" data-act="do:fertilize">🧪 施肥（1）</button>')
          : '      <span class="muted">选择下方种子播种</span>',
        '    </div>',
        (p.plowed && !p.cropType) ? ('    <div class="seed-row">' + crops.map(c =>
          '      <button class="seed" data-act="plant:' + c.id + '"><span>' + c.icon + '</span>' + c.name + '<i>' + c.seedPrice + 'G</i></button>').join('') + '    </div>') : '',
        '  </div>',
        '</div>'
      ].join('\n');
    }

    const seeds = Object.keys(s.seeds).filter(k => s.seeds[k] > 0);

    return [
      '<div class="view-body">',
      '  <div class="card">',
      '    <div class="card-h"><b>农田 · ' + D.seasons[s.season] + '季作物</b><span class="muted">待收 ' + f.ready + ' · 生长 ' + f.planted + ' · 荒地 ' + f.empty + '</span></div>',
      '    <div class="card-b">' + grid + '</div>',
      '  </div>',
      '  <div class="btn-row wide">',
      '    <button class="btn" data-act="quick:plowAll">🪓 全部开垦</button>',
      '    <button class="btn" data-act="quick:waterAll">🚿 全部浇水</button>',
      '    <button class="btn" data-act="quick:harvestAll">🌾 全部收获</button>',
      '  </div>',
      panel,
      '  <div class="card">',
      '    <div class="card-h"><b>种子袋</b><span class="muted">' + (seeds.length ? seeds.length + ' 种' : '空') + '</span></div>',
      '    <div class="card-b seed-bag">' + (seeds.length ? seeds.map(k => { const c = D.getCropInfo(k); return '<span class="pill">' + c.icon + ' ' + c.name + ' ×' + s.seeds[k] + '</span>'; }).join('') : '<span class="muted">去商店买点种子吧</span>') + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>本季可种</b><span class="muted">点击田地后可播种</span></div>',
      '    <div class="card-b">' + crops.map(c => '<div class="crop-line"><span class="cl-i">' + c.icon + '</span><div class="cl-m"><b>' + c.name + '</b><span class="muted">' + c.desc + ' · ' + c.growthDays + ' 天成熟' + (c.regrow ? ' · ' + c.regrow + ' 天复收' : '') + '</span></div><span class="cl-p">种子 ' + c.seedPrice + 'G / 售 ' + c.price + 'G</span></div>').join('') + '</div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ======================= 视图：动物 ======================= */

  function animalCard(a) {
    const t = D.animalTypes[a.type];
    const h = Math.floor(a.points / 25);
    const badges = [];
    if (a.fed) badges.push('<span class="badge ok">已喂食</span>'); else badges.push('<span class="badge warn">饿着</span>');
    if (a.grazing) badges.push('<span class="badge info">放牧中</span>');
    if (a.produceReady) badges.push('<span class="badge gold">产物可收</span>');
    if (a.sick) badges.push('<span class="badge bad">生病 ' + a.daysSick + ' 天</span>');
    const nextGrade = Game.computeGrade(a.points);
    const points = a.points - h * 25;
    const head = headSrc(a.type);
    return [
      '<div class="animal-card" data-id="' + a.id + '">',
      '  <div class="ac-h">',
      (head ? '    <span class="ac-icon ac-head"><img class="ac-3d" src="' + head + '" alt=""></span>' : '    <span class="ac-icon">' + t.icon + '</span>'),
      '    <div class="ac-t"><b>' + esc(a.name) + '</b><span class="muted">' + t.name + ' · ' + t.product + ' 基础价 ' + t.basePrice + 'G</span></div>',
      '    <span class="ac-grade">当前 ' + gradeChip(nextGrade) + '</span>',
      '  </div>',
      '  <div class="ac-hearts">' + tierHeartIcon(a.points) + hearts(h) + '<span class="muted"> ' + h + ' 心（' + points + '/25）· ' + tierName(a.points) + '</span></div>',
      '  <div class="ac-badges">' + badges.join('') + '</div>',
      '  <div class="ac-acts">',
      '    <button class="btn mini" data-act="pat:' + a.id + '">💗 撒娇</button>',
      '    <button class="btn mini" data-act="feed:' + a.id + '">🍽 喂食</button>',
      '    <button class="btn mini" data-act="brush:' + a.id + '">🧽 刷毛</button>',
      '    <button class="btn mini" data-act="talk:' + a.id + '">💬 说话</button>',
      a.produceReady ? '    <button class="btn mini primary" data-act="collect:' + a.id + '">🧺 收取</button>' : '',
      a.sick ? '    <button class="btn mini danger" data-act="medicine:' + a.id + '">💊 用药 200G</button>' : '',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function viewAnimals() {
    const s = Game.state;
    const need = Game.animalCareNeeds();
    const list = Game.animalList();
    const cap = s.build.barnLevel === 1 ? 4 : 8;

    return [
      '<div class="view-body">',
      '  <div class="btn-row wide">',
      '    <button class="btn primary" data-act="quick:feedAll">🍽 全部喂食</button>',
      '    <button class="btn" data-act="quick:collectAll">🧺 全部收取</button>',
      '    <button class="btn" data-act="quick:graze">🐾 放牧</button>',
      '    <button class="btn" data-act="quick:grazeIn">🏚️ 收回</button>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>动物小屋</b><span class="muted">' + list.length + '/' + cap + ' 只 · 待喂 ' + need.hungry + ' · 生病 ' + need.sick + '</span></div>',
      '    <div class="card-b animals">' + (list.length ? list.map(animalCard).join('') : '<div class="muted">还没有动物，去商店买一只吧</div>') + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>产物分级（S / M / L / G / P / X）</b><span class="muted">爱心越高，等级越高</span></div>',
      '    <div class="card-b">',
      D.produceGrades.map(g => '<div class="grade-line">' + gradeChip(g.id) + '<div class="gl-m"><b>' + g.cond + '</b><span class="muted">售出倍率 ×' + g.mult + '</span></div></div>').join(''),
      '      <p class="note">' + Game.gradeHint().map(esc).join('<br>') + '</p>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ======================= 视图：马厩 ======================= */

  function viewStable() {
    const s = Game.state;
    const h = s.horse, d = s.dog, hp = Game.heartsOf(h.points), dp = Game.heartsOf(d.points);

    const horseCard = h.owned ? [
      '<div class="card">',
      '  <div class="card-h"><b>🐎 ' + esc(h.name) + '</b><span class="muted">' + (h.riding ? '骑乘中' : '在厩里休息') + '</span></div>',
      '  <div class="card-b">',
      '    <div class="ac-hearts">' + hearts(hp) + '<span class="muted"> ' + hp + ' 心</span></div>',
      '    <div class="btn-row">',
      '      <button class="btn mini primary" data-act="ride">' + (h.riding ? '🏇 下马' : '🏇 骑马奔跑') + '</button>',
      '      <button class="btn mini" data-act="feedhorse">🌾 喂马</button>',
      '      <button class="btn mini" data-act="brushhorse">🧽 刷毛</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n') : [
      '<div class="card">',
      '  <div class="card-h"><b>🐎 马厩空着</b><span class="muted">5000G</span></div>',
      '  <div class="card-b"><p class="note">矿石镇的牧场主都会骑马巡视牧场，快去商店买一匹吧。</p>',
      '    <button class="btn primary" data-act="buy:buy_horse">🐎 购买小棕（5000G）</button>',
      '  </div>',
      '</div>'
    ].join('\n');

    return [
      '<div class="view-body">',
      horseCard,
      '  <div class="card">',
      '    <div class="card-h"><b>🐕 ' + esc(d.name) + '</b><span class="muted">' + (d.guarding ? '守夜中' : '休息中') + '</span></div>',
      '    <div class="card-b">',
      '      <div class="ac-hearts">' + hearts(dp) + '<span class="muted"> ' + dp + ' 心</span></div>',
      '      <div class="kv"><span>围栏</span><b>' + (s.tools.fence > 0 ? '已加固 ' + s.tools.fence + ' 段' : '未加固（野狗袭击概率高）') + '</b></div>',
      '      <div class="btn-row">',
      '        <button class="btn mini" data-act="feeddog">🍖 喂狗</button>',
      '        <button class="btn mini" data-act="guard">' + (d.guarding ? '😴 让它休息' : '🐕 让它守夜') + '</button>',
      '      </div>',
      '      <p class="note">看门狗吃饱并守夜时，野狗不会袭击动物。</p>',
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>' + D.dwarfConfig.icons[Math.min(s.helpers.count, 6)] + ' 小矮人</b><span class="muted">' + (s.helpers.days > 0 ? '帮忙中，剩 ' + s.helpers.days + ' 天' : '可雇佣') + '</span></div>',
      '    <div class="card-b">',
      '      <div class="kv"><span>已雇佣</span><b>' + s.helpers.count + ' 位</b></div>',
      '      <p class="note">花 ' + D.dwarfConfig.hireCost + 'G 请小矮人帮忙浇水 3 天，省下大量体力。</p>',
      '      <button class="btn primary" data-act="hire">🧙 雇佣小矮人（' + D.dwarfConfig.hireCost + 'G）</button>',
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>围栏与设施</b></div>',
      '    <div class="card-b">',
      '      <div class="kv"><span>动物小屋</span><b>' + (s.build.barnLevel === 1 ? 'Lv1（上限 4 只）' : 'Lv2（上限 8 只）') + '</b></div>',
      '      <div class="kv"><span>卧室</span><b>' + (s.build.beds ? '大床（睡眠恢复更充分）' : '单人床') + '</b></div>',
      '      <div class="btn-row">',
      '        <button class="btn mini" data-act="buy:fence">' + iconSrc('fence', '🚧') + ' 加固围栏 500G</button>',
      '        <button class="btn mini" data-act="buy:barn">' + iconSrc('barn', '🏚️') + ' 扩建小屋 8000G</button>',
      '        <button class="btn mini" data-act="buy:bed">' + iconSrc('bed', '🛏️') + ' 换大床 10000G</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ======================= 视图：商店 ======================= */

  function viewShop() {
    const s = Game.state;
    const seasonCrops = D.getCurrentCrops(s.season);
    const storage = Game.storageList();
    const ores = Game.oreList();

    const seedRows = seasonCrops.map(c => [
      '<div class="shop-line">',
      '  <span class="sl-i">' + iconSrc(c.id, c.icon) + '</span>',
      '  <div class="sl-m"><b>' + c.name + '种子</b><span class="muted">' + c.growthDays + ' 天成熟 · 售价 ' + c.price + 'G' + (c.regrow ? ' · 可复收' : '') + '</span></div>',
      '  <span class="sl-p">' + c.seedPrice + 'G</span>',
      '  <button class="btn mini" data-act="buyseed:' + c.id + ':1">×1</button>',
      '  <button class="btn mini primary" data-act="buyseed:' + c.id + ':5">×5</button>',
      '</div>'
    ].join('')).join('');

    const animalRows = ['chicken', 'cow', 'sheep', 'anjela'].map(k => {
      const t = D.animalTypes[k];
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + animalIconSrc(k, t.icon) + '</span>',
        '  <div class="sl-m"><b>' + t.name + '</b><span class="muted">产物 ' + t.product + '（基础 ' + t.basePrice + 'G）· 每 ' + t.feedDays + ' 天产一次</span></div>',
        '  <span class="sl-p">' + fmt(t.buyPrice) + 'G</span>',
        '  <button class="btn mini primary" data-act="buy:buy_' + k + '">购买</button>',
        '</div>'
      ].join('');
    }).join('');

    const toolRows = Object.keys(D.tools).map(k => {
      const t = D.tools[k];
      const lv = s.tools[k] || 0;
      const next = lv < 5 ? D.getUpgradeRecipe(lv + 1) : null;
      const can = next ? (s.ores[next.ore] || 0) >= next.count && s.gold >= next.cost : false;
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + iconSrc(k, t.icon) + '</span>',
        '  <div class="sl-m"><b>' + t.name + ' · ' + D.toolLevels[lv] + '</b><span class="muted">' + t.desc + '</span></div>',
        next ? '  <span class="sl-p">' + D.ores[next.ore].icon + ' ×' + next.count + '<br>' + fmt(next.cost) + 'G</span>' : '  <span class="sl-p">满级</span>',
        next ? '  <button class="btn mini ' + (can ? 'primary' : '') + '" data-act="upgrade:' + k + '">升级 ' + next.label + '</button>' : '',
        '</div>'
      ].join('');
    }).join('');

    const itemRows = D.shopItems.map(i => {
      const owned = (i.category === 'machine' && s.machines[i.id]) || (i.id === 'barn' && s.build.barnLevel === 2) || (i.id === 'bed' && s.build.beds);
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + iconSrc(i.id, i.icon) + '</span>',
        '  <div class="sl-m"><b>' + i.name + '</b><span class="muted">' + i.desc + '</span></div>',
        '  <span class="sl-p">' + fmt(i.price) + 'G</span>',
        owned ? '  <span class="badge ok">已拥有</span>' : '  <button class="btn mini primary" data-act="buy:' + i.id + '">购买</button>',
        '</div>'
      ].join('');
    }).join('');

    const sellRows = storage.length ? storage.map(item => [
      '<div class="shop-line">',
      '  <span class="sl-i">' + iconSrc(item.key, item.icon) + '</span>',
      '  <div class="sl-m"><b>' + item.name + ' ×' + item.total + '</b><span class="muted">' + D.GRADE_IDS.filter(g => item.grades[g] > 0).map(g => gradeChip(g) + '×' + item.grades[g]).join(' ') + '</span></div>',
      '  <span class="sl-p">' + fmt(item.value) + 'G</span>',
      '  <button class="btn mini" data-act="sellkey:' + item.key + '">出货</button>',
      '</div>'
    ].join('')).join('') : '<div class="muted">仓库空空如也</div>';

    const processMap = { milk: s.machines.cheesemaker, egg: s.machines.mayomaker, wool: s.machines.yarnmaker };
    const processRows = Object.keys(processMap).map(k => {
      const info = D.getStorageInfo(k);
      const total = D.GRADE_IDS.reduce((n, g) => n + (s.storage[k] ? s.storage[k][g] : 0), 0);
      const target = { milk: '奶酪', egg: '蛋黄酱', wool: '毛线球' }[k];
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + iconSrc(k, info.icon) + '</span>',
        '  <div class="sl-m"><b>' + info.name + ' → ' + target + '</b><span class="muted">库存 ' + total + ' 件' + (processMap[k] ? '' : ' · 缺少加工机') + '</span></div>',
        '  <button class="btn mini ' + (processMap[k] && total > 0 ? 'primary' : '') + '" data-act="process:' + k + '">加工</button>',
        '</div>'
      ].join('');
    }).join('');

    const exRows = (D.exchangeItems || []).map(it => {
      const got = GameExt.exchangeCount(it.id);
      const maxed = got >= it.limit;
      const need = it.need || {};
      const o = D.ores[need.ore] || D.getStorageInfo(need.quality) || {};
      const have = need.ore
        ? (s.ores[need.ore] || 0)
        : (s.storage[need.quality] ? D.GRADE_IDS.reduce((n, g) => n + s.storage[need.quality][g], 0) : 0);
      const can = !maxed && have >= need.count && s.gold >= it.gold;
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + iconSrc(it.id, it.icon) + '</span>',
        '  <div class="sl-m"><b>' + it.name + '</b><span class="muted">' + it.desc + ' · 已兑换 ' + got + '/' + it.limit + '</span></div>',
        '  <span class="sl-p">' + (o.icon || '📦') + '×' + need.count + '<br>' + fmt(it.gold) + 'G</span>',
        maxed ? '  <span class="badge ok">已达上限</span>' : '  <button class="btn mini ' + (can ? 'primary' : '') + '" data-act="exchange:' + it.id + '">兑换</button>',
        '</div>'
      ].join('');
    }).join('');

    const devRows = ['weather', 'greenhouse'].map(k => {
      const d = GameExt.deviceInfo(k);
      const nx = d.next;
      const oreTxt = nx ? Object.keys(nx.ores || {}).map(o => (D.ores[o] ? D.ores[o].icon : '⛏️') + '×' + nx.ores[o]).join(' ') : '';
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + iconSrc(d.key, d.icon) + '</span>',
        '  <div class="sl-m"><b>' + d.name + ' · Lv' + d.level + '</b><span class="muted">' + (nx ? nx.desc : '已满级，效果全开') + '</span></div>',
        '  <span class="sl-p">' + (nx ? fmt(nx.cost) + 'G<br>' + oreTxt : '满级') + '</span>',
        nx ? '  <button class="btn mini primary" data-act="device:' + d.key + '">升到 Lv' + (d.level + 1) + '</button>' : '  <span class="badge ok">已满级</span>',
        '</div>'
      ].join('');
    }).join('');

    const prayRow = s.devices.weather > 0 ? [
      '    <div class="btn-row wide">',
      s.devices.weather >= 1 ? '      <button class="btn mini" data-act="pray:sunny">⛩️ 祈祷晴天</button>' : '',
      s.devices.weather >= 2 ? '      <button class="btn mini" data-act="pray:rain">⛩️ 祈祷雨天</button>' : '',
      s.devices.weather >= 3 ? '      <button class="btn mini" data-act="pray:any">⛩️ 祈祷任意天气</button>' : '',
      '    </div>',
      '    <p class="note">祈祷后次日天气可控；温室大棚让室内作物免受灾害与换季影响。</p>'
    ].join('') : '';

    return [
      '<div class="view-body">',
      '  <div class="card">',
      '    <div class="card-h"><b>🌱 ' + D.seasons[s.season] + '季种子</b><span class="muted">金币 ' + fmt(s.gold) + 'G</span></div>',
      '    <div class="card-b">' + seedRows + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>🐄 动物</b><span class="muted">上限 ' + (s.build.barnLevel === 1 ? 4 : 8) + ' 只</span></div>',
      '    <div class="card-b">' + animalRows + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>🪓 工具升级（铜 → 银 → 金 → 秘银 → 贤者）</b><span class="muted">去矿洞挖矿石</span></div>',
      '    <div class="card-b">' + toolRows + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>🧰 道具与设施</b></div>',
      '    <div class="card-b">' + itemRows + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>🏭 加工链</b><span class="muted">产物价值翻倍</span></div>',
      '    <div class="card-b">' + processRows + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>📦 出货箱</b><span class="muted">' + storage.length + ' 类 · 合计 ' + fmt(storage.reduce((n, i) => n + i.value, 0)) + 'G</span></div>',
      '    <div class="card-b">' + sellRows + '</div>',
      '    <div class="btn-row wide">',
      '      <button class="btn primary" data-act="selleverything">💰 全部出货</button>',
      '      <button class="btn" data-act="sellores">⛏️ 出售矿石' + (ores.length ? '（' + fmt(ores.reduce((n, o) => n + o.value * o.count, 0)) + 'G）' : '') + '</button>',
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>🧧 奇特商品（矿产兑换）</b><span class="muted">用矿石与加工品兑换，部分可提升体力上限</span></div>',
      '    <div class="card-b">' + exRows + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>🌦️ 工具与建筑升级</b><span class="muted">提升可控天气与产量</span></div>',
      '    <div class="card-b">' + devRows + prayRow + '</div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ======================= 视图：矿洞 ======================= */

  function viewMine() {
    const s = Game.state;
    const inMine = s.mine.inMine;
    const ores = Game.oreList();
    const mine = s.mine.current ? D.mines[s.mine.current] : null;

    const mineCards = Object.keys(D.mines).map(k => {
      const cfg = D.mines[k];
      const open = Game.mineOpen(k);
      const deepest = s.mine[k] || 0;
      return [
        '<div class="mine-card ' + (open ? '' : 'locked') + ' ' + (s.mine.current === k ? 'here' : '') + '">',
        '  <div class="mc-h"><span>' + cfg.icon + '</span><b>' + cfg.name + '</b>' + (open ? '' : '<span class="badge warn">冬季开放</span>') + '</div>',
        '  <p class="note">' + cfg.desc + '</p>',
        '  <div class="kv"><span>最深记录</span><b>第 ' + deepest + ' 层 / 共 ' + cfg.maxFloor + ' 层</b></div>',
        open ? '<button class="btn primary" data-act="enter:' + k + '">' + (s.mine.current === k ? '继续深入' : '⛏️ 进入矿洞') + '</button>' : '<button class="btn" disabled>未开放</button>',
        '</div>'
      ].join('');
    }).join('');

    const pk = GameExt.pickaxeInfo();
    const pkUsed = (s.mine.hits && s.mine.hits[s.mine.floor]) || 0;
    const pkLeft = Math.max(0, pk.hits - pkUsed);

    const digging = inMine ? [
      '<div class="card">',
      '  <div class="card-h"><b>' + (mine ? mine.icon + ' ' + mine.name : '矿洞') + '</b><span class="muted">当前第 ' + s.mine.floor + ' 层</span></div>',
      '  <div class="card-b">',
      '    <div class="kv"><span>铁镐</span><b>Lv' + pk.level + ' · ' + pk.name + '（每层可挖 ' + pk.hits + ' 次）</b></div>',
      '    <div class="kv"><span>本层已挖</span><b>' + pkUsed + ' / ' + pk.hits + ' 次' + (pk.next ? ' · 升级下一级需 ' + fmt(pk.next.cost) + 'G + ' + (D.ores[pk.next.ore] ? D.ores[pk.next.ore].name : '矿石') + '×' + pk.next.count : '') + '</b></div>',
      '    <div class="btn-row wide">',
      '      <button class="btn primary" data-act="dighit"' + (pkLeft > 0 ? '' : ' disabled') + '>⛏️ 同层再挖一次（剩余 ' + pkLeft + ' 次）</button>',
      pk.next ? '      <button class="btn" data-act="pickaxe">🔨 升级铁镐到 Lv' + (pk.level + 1) + '</button>' : '',
      '    </div>',
      '    <div class="btn-row wide">',
      '      <button class="btn" data-act="dig:1">⛏️ 下 1 层（8 体力）</button>',
      '      <button class="btn" data-act="dig:5">⛏️ 下 5 层（40）</button>',
      '      <button class="btn" data-act="dig:10">⛏️ 下 10 层（80）</button>',
      '    </div>',
      '    <p class="note">同一层可反复挖多次（次数由铁镐等级决定），越深越容易出稀有矿石；矿石可出售、升级工具，也能在商店兑换奇特商品。</p>',
      '    <button class="btn" data-act="leave">🚪 离开矿洞</button>',
      '  </div>',
      '</div>'
    ].join('') : '';

    const oreGrid = ores.length ? '<div class="ore-grid">' + ores.map(o => {
      const need = ['copper', 'silver', 'gold', 'mithril', 'sage'].indexOf(o.key) >= 0;
      return '<div class="ore"><span class="oi">' + o.icon + '</span><b>' + o.name + '</b><span class="muted">×' + o.count + (need ? ' · 可用于升级工具' : ' · 售价 ' + o.value + 'G') + '</span></div>';
    }).join('') + '</div>' : '<div class="muted">矿石背包是空的，去挖点矿石吧</div>';

    return [
      '<div class="view-body">',
      digging,
      '  <div class="card">',
      '    <div class="card-h"><b>矿场</b><span class="muted">建议体力充足时前往</span></div>',
      '    <div class="card-b">' + mineCards + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>矿石背包</b><button class="mini" data-act="sellores">全部出售</button></div>',
      '    <div class="card-b">' + oreGrid + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>矿石图鉴</b></div>',
      '    <div class="card-b"><div class="ore-grid">' + Object.keys(D.ores).map(k => {
        const o = D.ores[k];
        return '<div class="ore"><span class="oi">' + o.icon + '</span><b>' + o.name + '</b><span class="muted">' + o.minFloor + ' 层以下 · 参考价 ' + o.value + 'G</span></div>';
      }).join('') + '</div></div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ======================= 视图：日历 ======================= */

  function viewCalendar() {
    const s = Game.state;
    const festivalList = D.getFestivals(s.season);
    const today = Game.dayOfSeason();
    const joined = s.festivals.joined;

    let grid = '<div class="cal-grid">';
    for (let d = 1; d <= D.DAYS_PER_SEASON; d++) {
      const f = festivalList.find(x => x.day === d);
      const cls = ['cal-day'];
      if (d === today) cls.push('today');
      if (f) cls.push('fest');
      if (joined[s.season + '-' + d]) cls.push('done');
      grid += '<div class="' + cls.join(' ') + '"><b>' + d + '</b><span>' + (f ? f.icon : '') + '</span></div>';
    }
    grid += '</div>';

    function festRewardText(f) {
      const r = f.reward || {};
      const parts = [];
      if (r.gold) parts.push(r.gold + 'G');
      if (r.hearts) parts.push('全体动物爱心 +' + r.hearts);
      if (r.seed) parts.push((D.crops[r.seed] ? D.crops[r.seed].name : '当季') + '种子 ×' + (r.count || 1));
      if (r.contest) parts.push('解锁 G 级产物');
      return parts.length ? parts.join('、') : '纪念与心情';
    }
    const todayFest = festivalList.find(x => x.day === today);

    const festCards = festivalList.map(f => {
      const isToday = f.day === today;
      const done = joined[s.season + '-' + f.day];
      return [
        '<div class="fest-card ' + (isToday ? 'today' : '') + '">',
        '  <div class="fc-h"><span>' + f.icon + '</span><b>' + f.name + '</b><span class="muted">' + D.seasons[s.season] + f.day + '日</span></div>',
        '  <p class="note">' + f.desc + '</p>',
        '  <p class="note">当天奖励：' + festRewardText(f) + '</p>',
        done ? '<span class="badge ok">已参加</span>' : isToday ? '<button class="btn primary" data-act="joinfest">🎉 参加' + f.name + '</button>' : '<span class="badge">未到日期</span>',
        '</div>'
      ].join('');
    }).join('');

    const forecast = (s.forecast || []).map(f => [
      '<div class="fc-item">',
      '  <b>' + D.seasons[f.season] + f.dayOfSeason + '日</b>',
      '  <span class="fci">' + f.icon + '</span>',
      '  <span class="muted">' + esc(f.name) + (f.festival ? ' · ' + f.festival.icon + f.festival.name : '') + '</span>',
      '</div>'
    ].join('')).join('');

    return [
      '<div class="view-body">',
      '  <div class="card">',
      '    <div class="card-h"><b>' + D.seasonIcons[s.season] + ' ' + Game.seasonFullName() + ' · 第 ' + today + ' 天</b><span class="muted">' + Game.yearOf() + ' 年目</span></div>',
      '    <div class="card-b">' + grid + '<p class="note">' + esc(Game.seasonDesc()) + '</p></div>',
      '  </div>',
      todayFest ? [
        '  <div class="card">',
        '    <div class="card-h"><b>' + todayFest.icon + ' 今日节日：' + todayFest.name + '</b><span class="muted">' + D.seasons[s.season] + todayFest.day + '日当天活动</span></div>',
        '    <div class="card-b">',
        '      <p class="note">' + todayFest.desc + '</p>',
        '      <div class="kv"><span>当天奖励</span><b>' + festRewardText(todayFest) + '</b></div>',
        joined[s.season + '-' + today] ? '      <span class="badge ok">今天已参加</span>' : '      <button class="btn primary" data-act="joinfest">🎉 参加' + todayFest.name + '</button>',
        '    </div>',
        '  </div>'
      ].join('') : '',
      '  <div class="card">',
      '    <div class="card-h"><b>未来 5 日预报</b></div>',
      '    <div class="card-b forecast">' + forecast + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>本季节日</b><span class="muted">参加有奖励</span></div>',
      '    <div class="card-b">' + festCards + '</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>牧场统计</b></div>',
      '    <div class="card-b">',
      '      <div class="kv"><span>累计收获</span><b>' + s.stats.harvested + ' 次</b></div>',
      '      <div class="kv"><span>累计产出</span><b>' + s.stats.products + ' 件</b></div>',
      '      <div class="kv"><span>累计收入 / 支出</span><b>' + fmt(s.stats.earned) + 'G / ' + fmt(s.stats.spent) + 'G</b></div>',
      '      <div class="kv"><span>挖矿层数</span><b>' + s.stats.mined + ' 层</b></div>',
      '      <div class="kv"><span>放牧累计</span><b>' + s.grazeHours + ' 小时</b></div>',
      '      <div class="kv"><span>力之果实</span><b>' + s.berries + ' / ' + D.BERRY_MAX + '（体力上限 ' + s.stamina.max + '）</b></div>',
      '      <button class="btn danger" data-act="reset">♻️ 重置存档</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ======================= 渲染 ======================= */

  /* ------------------------------ 海滩 ------------------------------ */
  function viewBeach() {
    const s = Game.state;
    const rod = !!(s.tools && 'fishingrod' in s.tools);
    const gather = (D.beach.gather || []).map(g => {
      const e = (s.fishbook && s.fishbook[g.key]) || null;
      const info = D.seafood[g.key] || {};
      return [
        '    <div class="sea-card">',
        '      <div class="sc-h"><span class="sc-ic">' + iconSrc(g.key, g.icon) + '</span><b>' + g.name + '</b></div>',
        '      <p class="muted">' + g.desc + '</p>',
        '      <p class="muted">每次 ' + g.min + '~' + g.max + ' 个 · 体力 ' + g.stamina + ' · 售价 ' + (info.base || 0) + 'G</p>',
        '      <p class="muted">图鉴：' + (e ? '已记录，最大 ' + e.maxSize + 'cm' : '尚未记录') + '</p>',
        '      <button class="btn mini primary" data-act="seaGather:' + g.id + '">' + g.icon + ' ' + g.name + '</button>',
        '    </div>'
      ].join('\n');
    }).join('\n');
    const contests = (D.beach.contests || []).map(c => {
      const done = !!(s.dayEvents && s.dayEvents['contest_' + c.id]);
      const locked = c.needRod && !rod;
      return [
        '    <div class="sea-card' + (done ? ' off' : '') + '">',
        '      <div class="sc-h"><span class="sc-ic">' + iconSrc(c.icon, c.icon) + '</span><b>' + c.name + '</b>' + (done ? '<span class="tag-new">今日已参加</span>' : '') + '</div>',
        '      <p class="muted">' + c.desc + '</p>',
        '      <p class="muted">体力 ' + c.stamina + ' · 耗时 ' + c.time + ' 分钟' + (c.baseGold ? ' · 奖金基准 ' + c.baseGold + 'G' : '') + (c.hearts ? ' · 全体爱心 +' + c.hearts : '') + '</p>',
        locked ? '      <p class="muted">需要钓竿才能参加</p>' : '',
        '      <button class="btn mini primary" data-act="seaContest:' + c.id + '"' + ((done || locked) ? ' disabled' : '') + '>参加' + c.name + '</button>',
        '    </div>'
      ].join('\n');
    }).join('\n');
    const book = GameExt.seaList();
    return [
      '  <div class="card">',
      '    <div class="card-h"><b>' + D.beach.name + '</b><span class="muted">' + D.beach.desc + '</span></div>',
      '    <div class="quick-row">',
      '      <button class="btn primary" data-act="fishcast">🎣 甩竿钓鱼</button>',
      '      <button class="btn" data-act="nav:fishbook">📖 海产图鉴（' + book.got + '/' + book.total + '）</button>',
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>沙滩活动</b><span class="muted">捡贝壳 / 抓螃蟹 / 找海星，收获会记入海产图鉴</span></div>',
      '    <div class="sea-grid">',
      gather,
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>海滩比赛与篝火</b><span class="muted">每项每天可参加一次</span></div>',
      '    <div class="sea-grid">',
      contests,
      '    </div>',
      '  </div>'
    ].join('\n');
  }

  /* ------------------------------ 海产图鉴 ------------------------------ */
  function viewFishBook() {
    const book = GameExt.seaList();
    const cells = book.list.map(it => [
      '    <div class="fish-cell ' + (it.owned ? 'got' : 'locked') + '">',
      '      <span class="sc-ic">' + iconSrc(it.key, it.icon) + '</span>',
      '      <div>',
      '        <div class="fish-name">' + (it.owned ? esc(it.name) : '？？？') + (it.owned ? '' : '<span class="tag-new">未获得</span>') + '</div>',
      '        <div class="fish-meta">稀有度 ' + it.rarityStars + ' · 售价 ' + it.price + 'G · ' + (it.field === 'fishing' ? '钓鱼获得' : '沙滩获得') + '</div>',
      '        <div class="fish-meta">' + (it.owned ? '已获得 ' + it.count + ' 次 · 最大 ' + it.maxSize + 'cm（' + it.sizeRange[0] + '~' + it.sizeRange[1] + 'cm）' : '尚未获得，影子条目') + '</div>',
      '      </div>',
      '    </div>'
    ].join('\n')).join('\n');
    return [
      '  <div class="card">',
      '    <div class="card-h"><b>海产图鉴本</b><span class="muted">已收录 ' + book.got + ' / ' + book.total + ' 种</span></div>',
      '    <p class="muted">已获得的海产显示彩色图标并记录最大尺寸；未获得的显示影子与名称。稀有度越高越难钓到，售价也越高。</p>',
      '    <div class="pk-bar"><i style="width:' + Math.round(book.got / Math.max(1, book.total) * 100) + '%"></i></div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="fish-grid">',
      cells,
      '    </div>',
      '  </div>'
    ].join('\n');
  }

  function render() {
    if (!root) return;
    el('hud').innerHTML = hudHTML();
    const host = el('view-host');
    let html = '';
    if (view === 'pasture') html = viewPasture();
    else if (view === 'farm') html = viewFarm();
    else if (view === 'animals') html = viewAnimals();
    else if (view === 'stable') html = viewStable();
    else if (view === 'shop') html = viewShop();
    else if (view === 'mine') html = viewMine();
    else if (view === 'calendar') html = viewCalendar();
    else if (view === 'beach') html = viewBeach();
    else if (view === 'fishbook') html = viewFishBook();
    if (bagOpen) html += bagPanelHTML();
    host.innerHTML = html;
    tabsHTML();
    window.Scene.refresh(Game.state);
  }

  function tickClock(slept) {
    if (view !== 'pasture') { /* HUD 仍需更新 */ }
    const clockEl = el('hud-clock');
    const t = Game.timeText();
    if (clockEl && t !== lastClockText) {
      lastClockText = t;
      clockEl.innerHTML = '<span class="ci">🕒</span>' + t;
    }
    const s = Game.state;
    if (s.day !== render._day) {
      render._day = s.day;
      render();
    }
    if (slept) render();
  }

  /* ======================= 交互 ======================= */

  function onAction(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const parts = act.split(':');
    const s = Game.state;

    try {
      switch (parts[0]) {
        case 'nav':
          view = parts[1];
          bagOpen = false;
          if (view !== 'farm') selectedPlot = null;
          render();
          return;
        case 'plot':
          selectedPlot = parseInt(parts[1], 10);
          seedPick = null;
          render();
          return;
        case 'plotclose':
          selectedPlot = null;
          render();
          return;
        case 'bag':
          bagOpen = true;
          render();
          return;
        case 'bagclose':
          bagOpen = false;
          render();
          return;
        case 'plant':
          seedPick = parts[1];
          if (selectedPlot === null) { toast('请先选择一块田地', 'warn'); return; }
          result(Game.plant(selectedPlot, seedPick), r => '种下了 ' + r.crop.icon + r.crop.name + (r.fromBag ? '（用掉 1 包种子）' : ''));
          return;
        case 'do': {
          const op = parts[1];
          if (selectedPlot === null) return;
          if (op === 'plow') result(Game.plow(selectedPlot), r => r.extra ? '开垦完成，顺带开了 ' + r.extra + ' 块（' + r.range + ' 格范围）' : '开垦完成');
          else if (op === 'water') result(Game.water(selectedPlot), r => r.extra ? '浇水完成，顺带浇了 ' + r.extra + ' 块' : '浇水完成');
          else if (op === 'fertilize') result(Game.fertilize(selectedPlot), '施肥完成');
          else if (op === 'harvest') result(Game.harvest(selectedPlot), r => r.crop ? '收获 ' + r.crop.icon + r.crop.name + '（' + r.grade + ' 级）' : '收获完成');
          return;
        }
        case 'toggle': {
          const flag = parts[1];
          if (flag === 'detail') { pastureDetail = !pastureDetail; render(); }
          return;
        }
        case 'quick': {
          const op = parts[1];
          if (op === 'plowAll') result(Game.plowAll(), r => '开垦了 ' + r.count + ' 块荒地');
          else if (op === 'waterAll') result(Game.waterAll(), r => '浇了 ' + r.count + ' 块地');
          else if (op === 'harvestAll') result(Game.harvestAll(), r => '收获 ' + r.count + ' 份作物');
          else if (op === 'graze') result(Game.grazeOut(), r => r.count + ' 只动物到牧场吃草了');
          else if (op === 'grazeIn') result(Game.grazeIn(), r => '收回了 ' + r.count + ' 只动物');
          else if (op === 'feedAll') result(Game.feedAllAnimals(), r => r.count + ' 只动物吃饱了');
          else if (op === 'collectAll') result(Game.collectAllAnimals(), r => '收取了 ' + r.items.length + ' 件产物');
          else if (op === 'eat') result(Game.eat(100, 50, 10), '吃了一顿热乎饭，体力 +50、疲劳 -10');
          else if (op === 'sleep') result(Game.sleep(false), r => {
            const extra = r && r.animal && r.animal.sick ? '（' + r.animal.sick + ' 只动物生病了）' : '';
            return '第 ' + Game.state.day + ' 天开始 · ' + (r && r.weather ? r.weather.icon + r.weather.name : '') + extra;
          });
          return;
        }
        case 'feed': result(Game.feedAnimal(parts[1]), r => r.name + ' 吃饱了');
          return;
        case 'brush': result(Game.brushAnimal(parts[1]), r => r.name + ' 舒服地蹭了蹭你（' + r.hearts + ' 心）');
          return;
        case 'talk': result(Game.talkAnimal(parts[1]), r => '你和 ' + r.name + ' 说了说话（' + r.hearts + ' 心）');
          return;
        case 'medicine': result(Game.useMedicine(parts[1]), r => r.name + ' 痊愈了');
          return;
        case 'collect': result(Game.collectAnimal(parts[1]), r => r.name + ' 产出 ' + r.icon + r.product + '（' + r.grade + ' 级）');
          return;
        case 'ride': result(Game.toggleRide(), r => r.riding ? '骑马出发！小棕跑得飞快' : '小棕停下脚步');
          return;
        case 'feedhorse': result(Game.feedHorse(), '小棕吃饱了');
          return;
        case 'brushhorse': result(Game.brushHorse(), r => '小棕很开心（' + r.hearts + ' 心）');
          return;
        case 'feeddog': result(Game.feedDog(), '小旺吃饱了');
          return;
        case 'guard': result(Game.toggleGuarding(), r => r.guarding ? '小旺开始守夜' : '小旺去休息了');
          return;
        case 'hire': result(Game.hireDwarf(), r => '雇佣了 ' + r.count + ' 位小矮人，将帮忙浇水 ' + r.days + ' 天');
          return;
        case 'buy': result(Game.buy(parts[1]), r => '买下了 ' + r.label);
          return;
        case 'buyseed': {
          const qty = parseInt(parts[2], 10) || 1;
          result(Game.buySeed(parts[1], qty), r => '买入 ' + r.crop.name + '种子 ×' + r.qty + '（' + r.cost + 'G）');
          return;
        }
        case 'upgrade': result(Game.upgradeTool(parts[1]), r => r.tool + ' 升级为' + r.level + '级');
          return;
        case 'process': result(Game.process(parts[1]), r => '加工出 ' + r.label + '（' + r.grade + ' 级）');
          return;
        case 'sellkey': result(Game.sellAllKey(parts[1]), r => '卖出 ' + r.name + ' ×' + r.qty + '，得 ' + fmt(r.gain) + 'G');
          return;
        case 'selleverything': result(Game.sellEverything(), r => '全部出货 ' + r.qty + ' 件，收入 ' + fmt(r.gain) + 'G');
          return;
        case 'sellores': result(Game.sellOres(), r => '卖出矿石 ' + r.qty + ' 块，收入 ' + fmt(r.gain) + 'G');
          return;
        case 'enter': result(Game.enterMine(parts[1]), r => '进入 ' + r.name + '，从第 ' + r.floor + ' 层开始');
          return;
        case 'dig': {
          const r = Game.digMine(parseInt(parts[1], 10));
          if (r.ok === false) { toast(r.msg || '无法继续挖掘', 'warn'); render(); return; }
          const found = (r.found || []).map(f => f.icon + f.name).join('、');
          toast('下到第 ' + r.floor + ' 层' + (found ? '，挖到 ' + found : '，这层什么也没有'), found ? 'ok' : 'info');
          render();
          return;
        }
        case 'pat': {
          const r = GameExt.patAnimal(parts[1]);
          if (r.ok === false) { toast(r.msg || '现在不想撒娇', 'warn'); render(); return; }
          toast(r.name + ' 朝你撒娇了（' + r.tierName + '，爱心 +' + r.gain + '，共 ' + r.hearts + ' 心）', 'ok');
          render();
          return;
        }
        case 'dighit': {
          const r = GameExt.digFloor();
          if (r.ok === false) { toast(r.msg || '这一层挖不动了', 'warn'); render(); return; }
          const f = (r.found || []).map(x => x.icon + x.name).join('、');
          toast('第 ' + r.floor + ' 层第 ' + r.hits + '/' + r.maxHits + ' 次挖掘' + (f ? '，挖到 ' + f : '，一无所获'), f ? 'ok' : 'info');
          render();
          return;
        }
        case 'pickaxe': {
          const r = GameExt.upgradePickaxe();
          if (r.ok === false) { toast(r.msg || '升级失败', 'warn'); render(); return; }
          toast('铁镐升级为 ' + r.name + '，每层可挖 ' + r.hits + ' 次', 'ok');
          render();
          return;
        }
        case 'seaGather': {
          const r = GameExt.seaGather(parts[1]);
          if (r.ok === false) { toast(r.msg || '现在不能采集', 'warn'); render(); return; }
          toast('在海边' + r.name + '：' + r.icon + r.item + ' ×' + r.count + '（' + r.size + 'cm，图鉴最大 ' + r.best + 'cm' + (r.isNew ? ' · 新条目' : '') + (r.isBest ? ' · 刷新纪录' : '') + '）', 'ok');
          render();
          return;
        }
        case 'fishcast': {
          const r = GameExt.castRod();
          if (r.ok === false) { toast(r.msg || '现在不能钓鱼', 'warn'); render(); return; }
          toast('钓到 ' + r.icon + r.name + '（' + r.size + 'cm · ' + r.rarityStars + (r.isNew ? ' · 图鉴新条目' : '') + (r.isBest ? ' · 刷新最大尺寸' : '') + '）', 'ok');
          render();
          return;
        }
        case 'seaContest': {
          const r = GameExt.seaContest(parts[1]);
          if (r.ok === false) { toast(r.msg || '现在不能参加', 'warn'); render(); return; }
          toast('参加了' + r.name + (r.gold ? '，赢得 ' + fmt(r.gold) + 'G' : '') + '，全体爱心 +' + r.hearts, 'ok');
          render();
          return;
        }
        case 'exchange': {
          const r = GameExt.exchange(parts[1]);
          if (r.ok === false) { toast(r.msg || '兑换失败', 'warn'); render(); return; }
          toast('兑换了 ' + r.name + (r.effect ? '：' + r.effect : '') + '（' + r.used + '/' + r.limit + '）', 'ok');
          render();
          return;
        }
        case 'device': {
          const r = GameExt.upgradeDevice(parts[1]);
          if (r.ok === false) { toast(r.msg || '升级失败', 'warn'); render(); return; }
          toast(r.name + ' 升级到 Lv' + r.level + '：' + r.desc, 'ok');
          render();
          return;
        }
        case 'pray': {
          const r = GameExt.prayWeather(parts[1]);
          if (r.ok === false) { toast(r.msg || '祈祷失败', 'warn'); render(); return; }
          toast('祈祷成功，明天将是' + r.name, 'ok');
          render();
          return;
        }
        case 'leave': result(Game.leaveMine(), '离开了矿洞');
          return;
        case 'joinfest': result(Game.joinFestival(), r => '参加了 ' + r.name + '：' + r.parts.join('、'));
          return;
        case 'reset':
          if (window.confirm('确定要重置存档吗？当前进度将全部清空。')) {
            Game.reset();
            selectedPlot = null;
            window.Scene.refresh(Game.state);
            render();
            toast('存档已重置', 'ok');
          }
          return;
        default:
          return;
      }
    } catch (err) {
      console.error(err);
      toast('操作出错：' + err.message, 'warn');
    }
  }

  /* ======================= 对外接口 ======================= */

  function init(rootEl) {
    root = rootEl;
    skeleton();
    mountScene();
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v && VIEWS.some(x => x.key === v)) view = v;
    render._day = Game.state.day;
    render();
    Game.subscribe((evt, payload) => {
      if (evt === 'day-advanced') {
        const lines = ['第 ' + Game.state.day + ' 天 · ' + Game.weatherInfo().icon + Game.weatherInfo().name];
        if (payload.seasonChanged) lines.push('换季：' + D.seasonFullNames[payload.newSeason] + '到了');
        if (payload.event) lines.push(payload.event.icon + payload.event.name + '来袭！');
        if (payload.animal && payload.animal.sick) lines.push(payload.animal.sick + ' 只动物感冒了');
        if (payload.animal && payload.animal.wildDog) lines.push('野狗夜里闯进了牧场');
        if (payload.fromFaint) lines.push('你因为过度劳累晕倒了');
        toast(lines.join(' · '), payload.fromFaint ? 'warn' : 'info');
        if (view !== 'pasture') render();
      } else if (evt === 'faint') {
        toast('体力透支倒下，医药费 ' + payload.fee + 'G', 'warn');
        render();
      }
    });
  }

  return { init: init, render: render, tickClock: tickClock, toast: toast };
})();
