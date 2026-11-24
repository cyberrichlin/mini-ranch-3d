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
    { key: 'bag',      name: '背包', icon: '🎒' }
  ];

  let root = null;
  let view = 'pasture';
  let selectedPlot = null;
  let seedPick = null;
  let pastureDetail = false;
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
  /* 比赛条件不足时的引导入口：钓鱼比赛需钓竿（商店），其余需对应动物（马厩） */
  function needLink(id) {
    if (id === 'fishcontest') return ' <button class="btn mini" data-act="nav:shop">去商店买钓竿</button>';
    if (id === 'racehorse' || id === 'falcon' || id === 'cormorant') return ' <button class="btn mini" data-act="nav:stable">去马厩</button>';
    return '';
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
  /** 升级配方里的矿石需求文案，如 ' + 🟤铜矿石×3'；无矿石返回空串 */
  function oreNeedText(rule) {
    if (!rule || !rule.ores || !rule.ores.length) return '';
    return rule.ores.map(o => {
      const info = D.ores[o.ore] || {};
      return ' + ' + (info.icon || '') + (info.name || o.ore) + '×' + o.count;
    }).join('');
  }

  function toast(msg, type) {
    const host = el('toast-host');
    if (!host) return;
    const div = document.createElement('div');
    div.className = 'toast ' + (type || 'info');
    // 提示文案可能内嵌 3D 图标（<img class="ic3d">）等标签：含标签时按 HTML 渲染，
    // 纯文本仍走 textContent 保持安全，避免提示条把 HTML 源码原样显示出来
    const text = msg === null || msg === undefined ? '' : String(msg);
    if (/<(img|b|i|span|br|em|strong)\b[^>]*>/i.test(text)) div.innerHTML = text;
    else div.textContent = text;
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

  /* 灾难天气：损失明细弹窗（打开时暂停时间，关闭后恢复） */
  function showDisasterPanel(loss) {
    const old = document.getElementById('disaster-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    const rows = loss.crops && loss.crops.length
      ? loss.crops.map(c => '<div class="dp-crop"><span class="dp-ci">' + c.icon + '</span><span class="dp-cn">' + c.name + '</span><span class="dp-cc">×' + c.count + '</span></div>').join('')
      : '<div class="dp-empty">田里没有在种的作物，本次未造成损失</div>';

    const modal = document.createElement('div');
    modal.id = 'disaster-modal';
    modal.innerHTML = [
      '<div class="dp-box">',
      '  <div class="dp-head">',
      '    <span class="dp-icon">' + loss.icon + '</span>',
      '    <div class="dp-head-text">',
      '      <div class="dp-title">' + loss.weather + '来袭</div>',
      '      <div class="dp-sub">第 ' + loss.day + ' 天 · ' + D.seasons[loss.season] + loss.dayOfSeason + ' 日' + (loss.forced ? ' · 本季保底灾难' : '') + '</div>',
      '    </div>',
      '  </div>',
      '  <div class="dp-stat">',
      '    <div class="dp-stat-item"><b>' + loss.planted + '</b><span>在种作物（块）</span></div>',
      '    <div class="dp-stat-item dp-dmg"><b>' + loss.damaged + '</b><span>受损作物（块）</span></div>',
      '    <div class="dp-stat-item dp-rate"><b>' + loss.pct + '%</b><span>损失比例</span></div>',
      '  </div>',
      '  <div class="dp-list-title">损失明细</div>',
      '  <div class="dp-list">' + rows + '</div>',
      '  <button class="btn dp-ok">知道了</button>',
      '</div>'
    ].join('\n');
    document.body.appendChild(modal);

    Game.state.paused = true;                       // 查看明细时暂停游戏时间
    const close = () => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      Game.state.paused = false;
    };
    const okBtn = modal.querySelector('.dp-ok');
    okBtn.addEventListener('click', close);
    // 移动端兜底：部分内置浏览器对按钮 click 派发不稳定，补 touchend 确保弹窗一定关得掉
    // （弹窗不关会残留 paused 标志，表现为游戏时间永久停止、只能靠睡觉跳天）
    okBtn.addEventListener('touchend', e => { e.preventDefault(); close(); }, { passive: false });
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.addEventListener('touchend', e => { if (e.target === modal) { e.preventDefault(); close(); } }, { passive: false });
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
      '  <div id="scene-wrap"><canvas id="scene"></canvas><div class="vignette"></div><canvas id="weather-fx"></canvas></div>',
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
      if (id === 'dog' || id === 'horse') {
        const r = GameExt.patAnimal(id);
        if (r.ok === false) { toast(r.msg || '它现在不想理你', 'warn'); return; }
        toast('你摸了摸 ' + r.name + '，它蹦跳着撒起娇来（' + r.tierName + '，爱心 +' + r.gain + '）', 'ok');
        render();
        return;
      }
      const a = Game.state.animals.find(x => x.id === id);
      if (!a) return;
      if (a.produceReady) {
        a.charm = 2.6;                 // 收产物时也撒娇回应
        result(Game.collectAnimal(id), r => a.name + ' 产出 ' + r.icon + r.product + '（' + r.grade + ' 级）');
      } else if (a.sick) {
        const st = medStock(a.type);
        toast(a.name + ' 生病了，用「' + medLabel(a.type) + '」治疗吧' + (st.total > 0 ? '（已有 ' + st.total + ' 支，点 💊 按钮用药）' : '（先到商店购买）'), 'warn');
      } else {
        const r = GameExt.patAnimal(id);
        if (r.ok === false) { toast(r.msg || '它现在不想撒娇', 'warn'); return; }
        toast('你摸了摸 ' + a.name + '，它朝你撒起娇来（' + r.tierName + '，爱心 +' + r.gain + '）', 'ok');
        render();
      }
    });
    window.Scene.onClickMine(() => { view = 'mine'; render(); toast('来到矿洞入口', 'info'); });
    if (window.Scene.onClickCrate) window.Scene.onClickCrate(() => { toast('出货箱：仓库卖货页稍后开放，点这里先记下来', 'info'); });
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
      '      <button class="kv-inline kv-btn" data-act="nav:bag" title="打开背包：查看收来的物品与工具，并可直接出售">背包 <b>' + Game.storageTotal() + ' 件</b></button>',
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

  /* ---------------------- 背包页（统合仓库 / 出货箱 / 海产图鉴） ---------------------- */

  function bagItemRow(it) {
    const act = (it.sellable && it.value > 0)
      ? '<span class="sl-p">' + fmt(it.value) + 'G</span><button class="btn mini" data-act="sellkey:' + it.key + '">出售</button>'
      : '<span class="bag-nosell">不可出售</span>';
    return [
      '<div class="shop-line bag-line">',
      '  <span class="sl-i">' + iconSrc(it.iconKey, it.icon) + '</span>',
      '  <div class="sl-m"><b>' + esc(it.name) + ' ×' + it.qty + '</b><span class="muted">' + esc(it.meta || '') + '</span></div>',
      '  <div class="bag-act">' + act + '</div>',
      '</div>'
    ].join('\n');
  }

  function bagCatCard(cat) {
    const canSell = cat.sellable && cat.value > 0;
    return [
      '  <div class="card bag-card">',
      '    <div class="card-h"><b>' + cat.icon + ' ' + cat.name + '</b><span class="muted">' + cat.kinds + ' 种 · ' + cat.qty + ' 件' + (cat.sellable ? ' · 市值 ' + fmt(cat.value) + 'G' : ' · 不可出售') + '</span></div>',
      '    <div class="card-b">',
      cat.items.map(bagItemRow).join('\n'),
      '    </div>',
      canSell ? '    <div class="btn-row wide"><button class="btn primary mini" data-act="sellcat:' + cat.key + '">💰 出售本类「' + cat.name + '」共 ' + fmt(cat.value) + 'G</button></div>' : '',
      '  </div>'
    ].join('\n');
  }

  function viewBag() {
    const bag = (window.GameExt && GameExt.bagView) ? GameExt.bagView() : null;
    if (!bag) {
      return [
        '  <div class="card">',
        '    <div class="card-h"><b>🎒 背包</b></div>',
        '    <div class="card-b"><div class="muted">背包数据读取失败，请刷新页面重试。</div></div>',
        '  </div>'
      ].join('\n');
    }

    const buttons = bag.cats.filter(c => c.sellable).map(c =>
      '      <button class="btn mini" data-act="sellcat:' + c.key + '"' + (c.value > 0 ? '' : ' disabled') + '>' + c.icon + ' 出售' + c.name + '（' + (c.value > 0 ? fmt(c.value) + 'G' : '无货') + '）</button>'
    ).join('\n');

    const cards = bag.cats.filter(c => c.items.length).map(bagCatCard).join('\n');
    const empty = bag.cats.filter(c => !c.items.length).map(c => c.icon + c.name).join(' / ');

    return [
      '  <div class="card">',
      '    <div class="card-h"><b>🎒 背包</b><span class="muted">合计 ' + bag.totalQty + ' 件 · 可售市值 ' + fmt(bag.totalValue) + 'G</span></div>',
      '    <div class="card-b">',
      '      <p class="bag-cat-hint">作物、动物产品、加工品、海产、矿石都收在这里，可直接出售；种子、工具设施、采集物等不可出售的物品也会一直保留在背包里。</p>',
      '      <div class="btn-row wide">',
      '        <button class="btn primary" data-act="sellall">💰 全部出售（一键全卖）</button>',
      '      </div>',
      '      <p class="bag-cat-hint">按类目出售（原有出货箱功能已迁移到这里）：</p>',
      '      <div class="btn-row wide">',
      buttons,
      '      </div>',
      '    </div>',
      '  </div>',
      cards,
      empty ? '  <p class="bag-cat-hint">暂无物品的类目：' + empty + '</p>' : ''
    ].join('\n');
  }

  /* ======================= 视图：农田 ======================= */

  /* 作物生长阶段（与 3D 场景保持一致）：幼苗 / 生长 / 开花 / 结果 */
  function stageOf(p) {
    if (!p.cropType) return { idx: -1, name: '', icon: '' };
    if (p.harvestable) return { idx: 3, name: '结果（可收获）', icon: '🧺' };
    const ratio = p.maxGrowth ? p.growthStage / p.maxGrowth : 1;
    if (ratio < 0.25) return { idx: 0, name: '幼苗', icon: '🌱' };
    if (ratio < 0.6) return { idx: 1, name: '生长', icon: '🌿' };
    return { idx: 2, name: '开花', icon: '🌼' };
  }

  /* 土里的图标：优先使用场景按「作物品种 × 生长阶段」绘制的专属造型（幼苗 / 生长 / 开花各不相同，
     不同作物也不一样）；场景未就绪时回退到 emoji */
  function stageIcon(cropType, stageIdx, fallback) {
    try {
      if (window.Scene && typeof window.Scene.cropStageIcon === 'function') {
        const url = window.Scene.cropStageIcon(cropType, stageIdx);
        if (url) return '<img class="ic3d" src="' + url + '" alt="">';
      }
    } catch (err) { /* 回退 emoji，保证不因贴图异常影响农田渲染 */ }
    return fallback;
  }

  function plotFace(p) {
    const fert = !!(p.plowed && p.fertilizerLevel > 0);
    if (!p.plowed) return { icon: '🌿', label: '荒地', fert: false, stage: '' };
    if (!p.cropType) return { icon: '🟩', label: fert ? '已施肥' : '已耕地', fert: fert, stage: '' };
    const crop = D.getCropInfo(p.cropType);
    // 结果期同样使用「品种 × 结果阶段」的造型贴图，保证幼苗 / 生长 / 开花 / 结果四态在土里各不相同
    if (p.harvestable) return { icon: stageIcon(p.cropType, 3, crop.icon), label: '可收获', fert: fert, stage: '结果' };
    const ratio = p.maxGrowth ? Math.round((p.growthStage / p.maxGrowth) * 100) : 0;
    const st = stageOf(p);
    return { icon: stageIcon(p.cropType, st.idx, st.icon), label: st.name + ' ' + ratio + '%', fert: fert, stage: st.name };
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
      if (!plot.plowed) { cls.push('waste'); cls.push('w' + (i % 4)); }   // 第五轮：荒地 4 种杂草/石头排布轮换，不再 24 格一模一样
      if (plot.plowed && !plot.cropType && plot.waterLevel === 0) cls.push('dry');   // 干裂：已耕、无作物、水分 0（只改外观，不改玩法）
      if (selectedPlot === i) cls.push('sel');
      if (plot.waterLevel > 0 && plot.cropType) cls.push('wet');
      if (plot.fertilizerLevel > 0) cls.push('fert');
      if (plot.pest) cls.push('pest');
      grid += '<button class="' + cls.join(' ') + '" data-act="plot:' + i + '">'
        + '<span class="pi">' + face.icon + '</span>'
        + '<span class="pl">' + face.label + '</span>'
        + (face.fert ? '<span class="fert-dot" title="已施肥（黑色小点）">•••</span>' : '')
        + (plot.waterLevel > 0 && plot.cropType ? '<span class="wet-dot" title="已浇水">💧</span>' : '')
        + (plot.pest ? '<span class="pest-dot" title="闹田鼠害虫：作物停止生长，可点开田地手动捉虫，养了老鹰它会在清早替你叼走">🐭</span>' : '')
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
        '    <div class="kv"><span>状态</span><b>' + (crop ? crop.icon + ' ' + crop.name + (p.harvestable ? '（' + stageOf(p).name + '）' : '（' + stageOf(p).name + ' ' + p.growthStage + '/' + p.maxGrowth + '）') : (p.plowed ? (p.fertilizerLevel > 0 ? '已施肥' : '已耕地') : '荒地')) + '</b></div>',
        crop ? '    <div class="kv"><span>水分 / 肥料</span><b>' + '💧'.repeat(Math.max(0, p.waterLevel)) + ' ' + '🧪'.repeat(Math.max(0, p.fertilizerLevel)) + (p.fertilizerLevel > 0 ? ' 已施肥（土地上显示黑色芝麻状小点）' : '') + '</b></div>' : '',
        p.pest ? '    <div class="kv"><span>虫害</span><b>🐭 有田鼠害虫在啃苗，作物停止生长（养了老鹰会在清早自动叼走，雨雪台风天老鹰不外出）</b></div>' : '',
        '    <div class="btn-row">',
        p.pest ? '      <button class="btn primary" data-act="pest:' + selectedPlot + '">🐭 捉虫（1 体力）</button>' : '',
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

    // 鱼塘：挂在本季可种下方，纯文字展示（不显示塘内鱼的数量）
    const pond = GameExt.pondInfo();
    const corm = pond.cormorant;
    const pondCard = [
      '  <div class="card">',
      '    <div class="card-h"><b>' + pond.icon + ' ' + pond.name + '</b><span class="muted">本季可种下方 · 只养淡水鱼</span></div>',
      '    <div class="card-b">',
      '      <p class="note">' + pond.desc + '</p>',
      '      <p class="note">塘中鱼种：' + pond.fish.map(f => iconSrc('fish_' + f.key, f.icon) + f.name + '（' + f.rarityStars + '，参考售价 ' + f.price + 'G）').join('、') + '</p>',
      '      <p class="note">塘里养着多少鱼不对外展示，派鸬鹚下水才知道今天能叼回什么。</p>',
      '      <p class="note">' + (pond.pests > 0
        ? '🐭 目前有 ' + pond.pests + ' 块田地闹田鼠害虫（' + (pond.eagle.owned ? (pond.eagle.rainy ? '雨天「' + pond.eagle.name + '」不外出，需手动捉虫' : '「' + pond.eagle.name + '」会在清早替你叼走') : '领养老鹰可自动清理') + '）'
        : '🌱 田间暂时没有田鼠害虫。') + '</p>',
      '      <p class="note">' + (pond.eagle.owned
        ? iconSrc('pet_eagle', '🦅') + ' 「' + pond.eagle.name + '」今日巡视：' + (pond.eagle.rainy ? '🌧 ' + pond.eagle.weatherName + '，天气恶劣不外出' : '已叼走田鼠害虫 ' + pond.eagle.todayPests + ' 只')
        : iconSrc('pet_eagle', '🦅') + ' 还没领养老鹰，田间害虫只能手动捉或等它自己散去。') + '</p>',
      '      <p class="note">' + (corm.owned
        ? iconSrc('pet_cormorant', '🐦') + ' 「' + corm.name + '」今日体力 ' + corm.stamina + ' / ' + corm.staminaMax + '，已抓鱼 ' + corm.todayFish + ' 条（体力每日回满，马厩界面也可查看）'
        : iconSrc('pet_cormorant', '🐦') + ' 还没领养鸬鹚，先到「马厩 → 飞禽伙伴」领养，才能派它下水抓鱼。') + '</p>',
      corm.owned ? '      <button class="btn ' + (corm.stamina > 0 ? 'primary' : '') + '" data-act="cormorantfish"' + (corm.stamina > 0 ? '' : ' disabled') + '>' + iconSrc('pet_cormorant', '🐦') + ' 派鸬鹚去鱼塘抓鱼（鸬鹚体力 ' + corm.stamina + '/' + corm.staminaMax + ' · 牧场体力 ' + corm.staminaCost + '）</button>' : '',
      '      <p class="note">抓到的鱼会进背包，可直接在背包页售卖，并计入海产图鉴。</p>',
      '    </div>',
      '  </div>'
    ].join('\n');

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
      '    <div class="card-b">' + crops.map(c => '<div class="crop-line"><span class="cl-i">' + c.icon + '</span><div class="cl-m"><b>' + c.name + (c.kind === 'flower' ? ' <span class="badge info">花卉</span>' : '') + '</b><span class="muted">' + c.desc + ' · ' + (c.kind === 'flower' ? '幼苗→生长→开花→结果 4 个生长阶段图案' : '每阶段有专属图案') + ' · ' + c.growthDays + ' 天成熟' + (c.regrow ? ' · ' + c.regrow + ' 天复收' : '') + '</span></div><span class="cl-p">种子 ' + c.seedPrice + 'G / 售 ' + c.price + 'G</span></div>').join('') + '</div>',
      '  </div>',
      pondCard,
      '</div>'
    ].join('\n');
  }

  /* ======================= 视图：动物 ======================= */

  /** 药品库存（每种动物专属药 + 旧存档遗留的通用药） */
  function medStock(type) {
    const s = Game.state;
    const own = (s.medicines && s.medicines[type]) || 0;
    const generic = (s.tools && s.tools.medicine) || 0;
    return { own: own, generic: generic, total: own + generic };
  }

  /** 该动物对应的专属药名 */
  function medLabel(type) {
    const m = D.medicineFor ? D.medicineFor(type) : null;
    return m ? m.name : '动物的药';
  }

  /** 生病动物的用药按钮：无药时直接引导去商店 */
  function medBtnHTML(a) {
    const m = D.medicineFor ? D.medicineFor(a.type) : null;
    const st = medStock(a.type);
    if (st.total <= 0) return '💊 缺' + medLabel(a.type) + '（去商店 ' + (m ? m.price + 'G' : '') + '）';
    return '💊 用' + medLabel(a.type) + ' ×' + st.total;
  }

  function animalCard(a) {
    const t = D.animalTypes[a.type] || { name: a.name || a.type, icon: '🐾', productIcon: '🐾' };
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
      a.sick ? '  <div class="muted ac-med">💊 ' + t.name + '需用「' + medLabel(a.type) + '」治疗 · 库存 ' + medStock(a.type).total + (medStock(a.type).total > 0 ? ' 支，点下方按钮即可痊愈' : ' 支，请到商店购买') + '</div>' : '',
      '  <div class="ac-acts">',
      '    <button class="btn mini" data-act="pat:' + a.id + '">💗 撒娇</button>',
      '    <button class="btn mini" data-act="feed:' + a.id + '">🍽 喂食</button>',
      '    <button class="btn mini" data-act="brush:' + a.id + '">🧽 刷毛</button>',
      '    <button class="btn mini" data-act="talk:' + a.id + '">💬 说话</button>',
      a.produceReady ? '    <button class="btn mini primary" data-act="collect:' + a.id + '">🧺 收取</button>' : '',
      a.sick ? '    <button class="btn mini danger" data-act="medicine:' + a.id + '">' + medBtnHTML(a) + '</button>' : '',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function viewAnimals() {
    const s = Game.state;
    const need = Game.animalCareNeeds();
    const list = Game.animalList();
    const cap = s.build.barnLevel === 1 ? 4 : 8;
    const grazeCount = list.filter(a => a.grazing).length;

    return [
      '<div class="view-body">',
      '  <div class="btn-row wide">',
      '    <button class="btn primary" data-act="quick:feedAll">🍽 全部喂食</button>',
      '    <button class="btn" data-act="quick:collectAll">🧺 全部收取</button>',
      '    <button class="btn" data-act="quick:graze">🐾 放牧</button>',
      '    <button class="btn" data-act="quick:grazeIn">🏚️ 收回</button>',
      '  </div>',
      grazeCount > 0 ? '  <p class="note">🐾 有 ' + grazeCount + ' 只动物在外面放牧：放牧每天增加爱心；天黑（睡觉）前请点「收回」，过夜未收回有概率被狼叼走 1 只，否则也会爱心下降。</p>' : '',
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

    // 飞禽伙伴（参加飞鹰 / 鸬鹚抓鱼比赛的前置条件）；鸬鹚体力 / 老鹰除害成果在马厩界面单独显示
    const pond = GameExt.pondInfo();
    const petCards = GameExt.petList().map(p => {
      const rows = [
        '    <div class="sea-card' + (p.owned ? '' : ' off') + '">',
        '      <div class="sc-h"><span class="sc-ic">' + iconSrc(p.model, p.icon) + '</span><b>' + p.name + '「' + esc(p.artName) + '」</b>' + (p.owned ? '<span class="badge ok">已领养</span>' : '<span class="badge">未领养</span>') + '</div>',
        '      <p class="muted">' + p.desc + '</p>',
        p.owned
          ? '      <p class="muted">亲密度 ' + p.points + ' / 250 · 可参加' + p.contestIcon + p.contestName + '</p>'
          : '      <p class="muted">售价 ' + p.price + 'G · 领养后可参加' + p.contestIcon + p.contestName + '</p>'
      ];
      if (p.owned && p.key === 'cormorant') {
        const c = pond.cormorant;
        rows.push('      <div class="kv"><span>今日体力</span><b>' + c.stamina + ' / ' + c.staminaMax + (c.stamina <= 0 ? '（已用尽，明天回满）' : '') + '</b></div>');
        rows.push('      <div class="pk-bar"><i style="width:' + Math.round(c.stamina / Math.max(1, c.staminaMax) * 100) + '%"></i></div>');
        rows.push('      <p class="muted">今日已抓鱼 ' + c.todayFish + ' 条 · 每次下水消耗鸬鹚体力 1 点、牧场体力 ' + c.staminaCost + ' 点；在「农田」栏目下方的鱼塘派它下水</p>');
      }
      if (p.owned && p.key === 'eagle') {
        const e = pond.eagle;
        rows.push('      <div class="kv"><span>今日巡视</span><b>' + (e.rainy ? '🌧 ' + e.weatherName + '，不外出' : '叼走田鼠害虫 ' + e.todayPests + ' 只') + '</b></div>');
        rows.push('      <p class="muted">每天清早替你清理田间的田鼠害虫，闹虫的田地会停止生长；雨雪台风等恶劣天气它不外出</p>');
      }
      rows.push(p.owned ? '' : '      <button class="btn mini primary" data-act="buypet:' + p.key + '">' + iconSrc(p.model, p.icon) + ' 领养（' + p.price + 'G）</button>');
      rows.push('    </div>');
      return rows.join('\n');
    }).join('\n');

    const petCard = [
      '  <div class="card">',
      '    <div class="card-h"><b>飞禽伙伴 · 老鹰与鸬鹚</b><span class="muted">领养后可参加比赛，也能替牧场干活</span></div>',
      '    <div class="sea-grid">',
      petCards,
      '    </div>',
      '    <p class="note">住马厩的动物（马、小狗、老鹰、鸬鹚）不会生病，不必买药。</p>',
      '  </div>'
    ].join('\n');

    /* 围栏与加工机：5 级升级体系 */
    const fenceLv = Game.fenceLevel ? Game.fenceLevel() : 1;
    const fenceCount = s.tools.fence || 0;
    const fenceRule = D.getStructureUpgrade('fence', fenceLv + 1);
    const fenceText = fenceCount > 0
      ? '已修 ' + fenceCount + ' / ' + D.FENCE_MAX + ' 段 · Lv' + fenceLv + ' ' + D.structureLevelName(fenceLv)
      : '未修建（野狗袭击概率高）';
    const fenceUpBtn = fenceCount > 0
      ? (fenceRule
          ? '<button class="btn mini primary" data-act="upfence">⬆ 升级围栏到 Lv' + (fenceLv + 1) + '（' + fmt(fenceRule.cost) + 'G' + oreNeedText(fenceRule) + '）</button>'
          : '<span class="badge ok">围栏已满级 Lv5</span>')
      : '';
    const fenceBuyBtn = fenceCount < D.FENCE_MAX
      ? '<button class="btn mini" data-act="buy:fence">' + iconSrc('fence', '🚧') + ' 加固围栏 500G</button>'
      : '<span class="badge ok">围栏已达上限 ' + D.FENCE_MAX + ' 段</span>';
    const machineRows = D.shopItems.filter(x => x.category === 'machine').map(m => {
      const lv = Game.machineLevel ? Game.machineLevel(m.id) : 0;
      const rule = lv ? D.getStructureUpgrade('machine', lv + 1) : null;
      const btn = !lv
        ? '<span class="badge">未拥有 · 商店购买 ' + fmt(m.price) + 'G</span>'
        : (rule
            ? '<button class="btn mini primary" data-act="upmachine:' + m.id + '">⬆ 升级到 Lv' + (lv + 1) + '（' + fmt(rule.cost) + 'G' + oreNeedText(rule) + '）</button>'
            : '<span class="badge ok">已满级 Lv5</span>');
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + iconSrc(m.id, m.icon) + '</span>',
        '  <div class="sl-m"><b>' + m.name + '</b><span class="muted">' + (lv ? '当前 Lv' + lv + ' ' + D.structureLevelName(lv) + ' · 牧场中已摆出对应造型' : '牛奶 / 鸡蛋 / 羊毛 → 高价加工品') + '</span></div>',
        '  ' + btn,
        '</div>'
      ].join('');
    }).join('');

    return [
      '<div class="view-body">',
      horseCard,
      petCard,
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
      '      <div class="kv"><span>牧场围栏</span><b>' + fenceText + '</b></div>',
      '      <div class="btn-row">',
      fenceBuyBtn,
      fenceUpBtn,
      '        <button class="btn mini" data-act="buy:barn">' + iconSrc('barn', '🏚️') + ' 扩建小屋 8000G</button>',
      '        <button class="btn mini" data-act="buy:bed">' + iconSrc('bed', '🛏️') + ' 换大床 10000G</button>',
      '      </div>',
      '      <p class="note">围栏最多 ' + D.FENCE_MAX + ' 段：1~2 级只需金币，3~5 级需要矿石（数量逐级增多、种类越来越稀有），每级造型配色都会变化。</p>',
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>🏭 加工机</b><span class="muted">最高 Lv5 · 牧场页可见对应造型</span></div>',
      '    <div class="card-b">',
      machineRows,
      '      <p class="note">机器在商店购买后出现在牧场；升级到 Lv3 起需要铜矿 → 金矿 → 秘银与贤者之石，等级越高配色越华丽。</p>',
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
      '  <div class="sl-m"><b>' + c.name + '种子' + (c.kind === 'flower' ? ' <span class="badge info">花卉</span>' : '') + '</b><span class="muted">' + c.growthDays + ' 天成熟 · 售价 ' + c.price + 'G' + (c.regrow ? ' · 可复收' : '') + (c.kind === 'flower' ? ' · 观赏花卉' : '') + '</span></div>',
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
      const mLevel = (i.category === 'machine' && Game.machineLevel) ? Game.machineLevel(i.id) : 0;
      const mUp = (i.category === 'machine' && mLevel) ? D.getStructureUpgrade('machine', mLevel + 1) : null;
      const medInfo = D.medicineById ? D.medicineById[i.id] : null;
      const medHave = medInfo ? ((s.medicines && s.medicines[medInfo.type]) || 0) : 0;
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + iconSrc(i.id, i.icon) + '</span>',
        '  <div class="sl-m"><b>' + i.name + (medInfo ? ' <span class="badge info">' + D.animalTypes[medInfo.type].name + '专用</span>' : '') + '</b><span class="muted">' + i.desc
        + (medInfo ? ' · 已备 ' + medHave + ' 支' : '') + '</span></div>',
        '  <span class="sl-p">' + fmt(i.price) + 'G</span>',
        owned
          ? '  <span class="badge ok">' + (mLevel ? 'Lv' + mLevel + ' ' + D.structureLevelName(mLevel) : '已拥有') + '</span>'
            + (mUp
                ? '  <button class="btn mini primary" data-act="upmachine:' + i.id + '">⬆ 升级到 Lv' + (mLevel + 1) + '（' + fmt(mUp.cost) + 'G' + oreNeedText(mUp) + '）</button>'
                : (mLevel ? '  <span class="badge ok">已满级 Lv5</span>' : ''))
          : '  <button class="btn mini primary" data-act="buy:' + i.id + '">购买</button>',
        '</div>'
      ].join('');
    }).join('');

        const processMap = { milk: s.machines.cheesemaker, egg: s.machines.mayomaker, wool: s.machines.yarnmaker };
    const processRows = Object.keys(processMap).map(k => {
      const info = D.getStorageInfo(k);
      const total = D.GRADE_IDS.reduce((n, g) => n + (s.storage[k] ? s.storage[k][g] : 0), 0);
      const target = { milk: '奶酪', egg: '蛋黄酱', wool: '毛线球' }[k];
      const mLv = processMap[k] ? Math.max(1, Math.min(5, Math.round(Number(processMap[k]) || 1))) : 0;
      const bonusTxt = mLv >= 5 ? '额外产出 60%' : (mLv >= 4 ? '额外产出 40%' : (mLv >= 3 ? '额外产出 20%' : ''));
      return [
        '<div class="shop-line">',
        '  <span class="sl-i">' + iconSrc(k, info.icon) + '</span>',
        '  <div class="sl-m"><b>' + info.name + ' → ' + target + '</b><span class="muted">库存 ' + total + ' 件' + (mLv ? ' · 加工机 Lv' + mLv + (bonusTxt ? '（' + bonusTxt + '）' : '') : ' · 缺少加工机') + '</span></div>',
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
      '    <div class="card-h"><b>🎒 出货与背包</b><span class="muted">出货箱功能已迁移到「背包」页</span></div>',
      '    <div class="card-b">',
      '      <p class="note">收来的作物、畜产、海产、矿石都在背包里分类收纳；可在背包页按类目出售，或一键全部出售。</p>',
      '      <div class="btn-row wide">',
      '        <button class="btn primary" data-act="nav:bag">🎒 打开背包（' + Game.storageTotal() + ' 件）</button>',
      '      </div>',
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
        '  <div class="mc-bar" title="已深入 ' + Math.round(deepest / cfg.maxFloor * 100) + '%"><i style="width:' + Math.round(deepest / cfg.maxFloor * 100) + '%"></i></div>',
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
      '<div class=\"view-body\">',
      // 矿山全景：整座灰岩山、绿苔、金矿脉、蓝水晶、山脚洞口、灯笼、轨道矿车、松树花草（第五轮按确认稿重做）
      '<div class=\"mine-hero\" role=\"img\" aria-label=\"矿山全景\">',
      '  <svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMax slice">',
      '    <rect width="640" height="300" fill="#bfe3f7"/>',
      '    <circle cx="540" cy="52" r="26" fill="#ffe98a"/><circle cx="540" cy="52" r="34" fill="#ffe98a" opacity="0.35"/>',
      '    <g fill="#ffffff" opacity="0.92"><ellipse cx="120" cy="48" rx="52" ry="16"/><ellipse cx="160" cy="40" rx="38" ry="13"/><ellipse cx="330" cy="36" rx="46" ry="13"/></g>',
      '    <!-- 山体：灰岩三层（第五轮：灰岩 + 绿苔 + 蓝水晶 + 金矿脉，不用大面积平棕） -->',
      '    <path d="M0 300 L0 190 Q120 60 260 110 Q340 140 420 90 Q540 20 640 120 L640 300 Z" fill="#a39e94"/>',
      '    <path d="M0 300 L0 230 Q140 130 280 170 Q420 200 640 150 L640 300 Z" fill="#8d8880"/>',
      '    <path d="M0 300 L0 260 Q180 210 320 240 Q480 265 640 235 L640 300 Z" fill="#78746c"/>',
      '    <g stroke="#6f6b62" stroke-width="2" fill="none" opacity="0.7" stroke-linecap="round"><path d="M120 180 L150 220 L135 255"/><path d="M420 130 L450 175 L435 210"/><path d="M520 160 L545 200"/></g>',
      '    <g fill="#6fae5e" opacity="0.9"><ellipse cx="150" cy="195" rx="34" ry="12"/><ellipse cx="420" cy="130" rx="30" ry="10"/><ellipse cx="540" cy="170" rx="28" ry="11"/><ellipse cx="90" cy="250" rx="30" ry="10"/><ellipse cx="250" cy="250" rx="26" ry="9"/></g>',
      '    <g stroke="#d9a441" stroke-width="3" fill="none" stroke-linecap="round"><path d="M210 150 L240 185 L225 220"/><path d="M470 110 L500 150"/><path d="M80 230 L110 255"/></g>',
      '    <g><circle cx="180" cy="170" r="10" fill="#d8a75e"/><circle cx="180" cy="170" r="4" fill="#f2c14e"/><circle cx="430" cy="130" r="9" fill="#c2d0dd"/><circle cx="430" cy="130" r="4" fill="#ffffff"/><circle cx="500" cy="190" r="10" fill="#f2c14e"/><circle cx="500" cy="190" r="4" fill="#ffe98a"/><circle cx="300" cy="210" r="14" fill="#6db7e8" opacity="0.4"/><circle cx="300" cy="210" r="9" fill="#6db7e8"/><circle cx="300" cy="210" r="4" fill="#bfe3f7"/><circle cx="560" cy="120" r="12" fill="#6db7e8" opacity="0.4"/><circle cx="560" cy="120" r="8" fill="#6db7e8"/><circle cx="560" cy="120" r="3.5" fill="#dff1ff"/></g>',
      '    <g><path d="M150 300 L210 300 L210 290 L150 290 Z" fill="#8a6242"/><path d="M170 290 L190 290 L190 300 L170 300 Z" fill="#6b4a30"/></g>',
      '    <path d="M262 300 L284 216 Q320 182 356 216 L378 300 Z" fill="#3a2f2a"/>',
      '    <ellipse cx="320" cy="238" rx="36" ry="44" fill="#241d18"/><path d="M292 238 Q320 200 348 238 Q320 226 292 238Z" fill="#3a2f2a"/>',
      '    <g><rect x="296" y="252" width="10" height="14" rx="3" fill="#e8a33c"/><rect x="334" y="252" width="10" height="14" rx="3" fill="#e8a33c"/><circle cx="301" cy="259" r="4" fill="#ffe98a"/><circle cx="339" cy="259" r="4" fill="#ffe98a"/></g>',
      '    <g stroke="#5e4630" stroke-width="5" stroke-linecap="round"><line x1="330" y1="300" x2="470" y2="300"/><line x1="350" y1="300" x2="490" y2="300"/></g>',
      '    <g stroke="#8a6242" stroke-width="4"><line x1="360" y1="296" x2="360" y2="304"/><line x1="400" y1="296" x2="400" y2="304"/><line x1="440" y1="296" x2="440" y2="304"/></g>',
      '    <g><rect x="392" y="272" width="44" height="24" rx="4" fill="#8a6242"/><rect x="392" y="272" width="44" height="10" rx="4" fill="#a9743f"/><circle cx="404" cy="284" r="5" fill="#3a2f2a"/><circle cx="424" cy="284" r="5" fill="#3a2f2a"/></g>',
      '    <g><path d="M40 300 L40 272 L28 288 L52 288 Z" fill="#4f9e3a"/><path d="M40 282 L40 258 L30 276 L50 276 Z" fill="#5cb84a"/><rect x="37" y="288" width="6" height="12" fill="#8a6242"/><path d="M600 300 L600 274 L590 288 L610 288 Z" fill="#4f9e3a"/><path d="M600 284 L600 262 L591 278 L609 278 Z" fill="#5cb84a"/><rect x="597" y="288" width="6" height="12" fill="#8a6242"/><ellipse cx="90" cy="288" rx="26" ry="10" fill="#7ec85a"/><ellipse cx="560" cy="290" rx="30" ry="10" fill="#7ec85a"/><circle cx="90" cy="278" r="6" fill="#ff8fb0"/><circle cx="104" cy="282" r="5" fill="#ffd76a"/><circle cx="560" cy="280" r="6" fill="#ff8fb0"/></g>',
      '  </svg>',
      '  <div class="mine-hero-cap">⛏️ 整座矿山 · 山脚洞口 · 越深矿石越稀有</div>',
      '</div>',
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
      const cs = D.findContests(s.season, d);
      const cls = ['cal-day'];
      if (d === today) cls.push('today');
      if (f) cls.push('fest');
      if (cs.length) cls.push('contest');
      if (joined[s.season + '-' + d]) cls.push('done');
      const marks = (f ? f.icon : '') + cs.map(c => c.icon).join('');
      grid += '<div class="' + cls.join(' ') + '" title="' + (f ? f.name : '') + (cs.length ? (f ? ' · ' : '') + cs.map(c => c.name).join('、') : '') + '"><b>' + d + '</b><span>' + marks + '</span></div>';
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

    // 今日比赛（大型赛事，仅当天可参加）
    const board = GameExt.contestBoard();
    const contestCardHTML = (c, statusHTML) => [
      '<div class="fest-card today stack">',
      '  <div class="fc-h"><span>' + c.icon + '</span><b>' + c.name + '</b><span class="muted">' + D.seasons[s.season] + board.today + '日当天比赛</span></div>',
      '  <p class="note">' + c.desc + '</p>',
      '  <p class="note">当天奖励：' + c.reward + '</p>',
      statusHTML,
      '</div>'
    ].join('');

    const todayContestHTML = board.todayEntries.map(e => {
      const c = e.cfg;
      const status = e.done ? '<span class="badge ok">今天已参加</span>'
        : e.can ? '<button class="btn primary" data-act="contest:' + c.id + '">' + c.icon + ' 参加' + c.name + '</button>'
          : '<span class="badge warn">' + e.reason + '</span>' + needLink(c.id);
      return contestCardHTML(c, status);
    }).join('');

    const todayFestHTML = todayFest ? [
      '<div class="fest-card today stack">',
      '  <div class="fc-h"><span>' + todayFest.icon + '</span><b>' + todayFest.name + '</b><span class="muted">' + D.seasons[s.season] + todayFest.day + '日当天活动</span></div>',
      '  <p class="note">' + todayFest.desc + '</p>',
      '  <p class="note">当天奖励：' + festRewardText(todayFest) + '</p>',
      joined[s.season + '-' + today] ? '<span class="badge ok">今天已参加</span>' : '<button class="btn primary" data-act="joinfest">🎉 参加' + todayFest.name + '</button>',
      '</div>'
    ].join('') : '';

    const todayCards = todayFestHTML + todayContestHTML;

    // 本季比赛日程（每月 2~3 天，日期不连续）
    const contestRowsHTML = board.rows.map(row => {
      const status = row.isToday ? '<span class="tag-new">今天</span>'
        : row.passed ? '<span class="badge">已结束</span>'
          : '<span class="badge info">' + row.away + ' 天后</span>';
      const lines = row.entries.map(e => {
        const c = e.cfg;
        const btn = e.done ? '<span class="badge ok">已参加</span>'
          : row.isToday ? (e.can ? '<button class="btn mini primary" data-act="contest:' + c.id + '">参加</button>' : '<span class="badge warn">' + e.reason + '</span>' + needLink(c.id))
            : '<span class="muted">' + esc(e.next) + '</span>';
        return [
          '<div class="ct-line">',
          '  <span class="ct-i">' + c.icon + '</span>',
          '  <div class="ct-m"><b>' + c.name + '</b><span class="muted">体力 ' + c.stamina + ' · ' + c.reward + '</span></div>',
          btn,
          '</div>'
        ].join('');
      }).join('');
      return [
        '<div class="fest-card stack ' + (row.isToday ? 'today' : '') + '">',
        '  <div class="fc-h"><span>' + D.seasons[s.season] + row.day + '日</span><b>' + row.names + '</b>' + status + '</div>',
        lines,
        '</div>'
      ].join('');
    }).join('');

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

    const forecast = (s.forecast || []).map(f => {
      const fc = D.findContests(f.season, f.dayOfSeason);
      const csText = fc.length ? ' · ' + fc.map(c => c.icon + c.name).join('、') : '';
      return [
        '<div class="fc-item">',
        '  <b>' + D.seasons[f.season] + f.dayOfSeason + '日</b>',
        '  <span class="fci">' + f.icon + '</span>',
        '  <span class="muted">' + esc(f.name) + (f.festival ? ' · ' + f.festival.icon + f.festival.name : '') + csText + '</span>',
        '</div>'
      ].join('');
    }).join('');

    return [
      '<div class="view-body">',
      '  <div class="card">',
      '    <div class="card-h"><b>' + D.seasonIcons[s.season] + ' ' + Game.seasonFullName() + ' · 第 ' + today + ' 天</b><span class="muted">' + Game.yearOf() + ' 年目</span></div>',
      '    <div class="card-b">' + grid + '<p class="note">' + esc(Game.seasonDesc()) + '</p></div>',
      '  </div>',
      todayCards ? [
        '  <div class="card">',
        '    <div class="card-h"><b>🎪 今日活动</b><span class="muted">' + D.seasons[s.season] + today + ' 日</span></div>',
        '    <div class="card-b">',
        todayCards,
        '    </div>',
        '  </div>'
      ].join('\n') : '',
      '  <div class="card">',
      '    <div class="card-h"><b>本季比赛日程</b><span class="muted">大型赛事仅在下列日期举行（每月 2~3 天）</span></div>',
      '    <div class="card-b">' + contestRowsHTML + '</div>',
      '  </div>',
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
    // 每日开放的沙滩篝火
    const dailyFire = (D.beach.contests || []).find(c => c.id === 'bonfire');
    const fireDone = !!(s.dayEvents && s.dayEvents['contest_bonfire']);
    const dailyCard = dailyFire ? [
      '    <div class="sea-card' + (fireDone ? ' off' : '') + '">',
      '      <div class="sc-h"><span class="sc-ic">' + dailyFire.icon + '</span><b>' + dailyFire.name + '</b>' + (fireDone ? '<span class="tag-new">今日已参加</span>' : '<span class="badge ok">每日开放</span>') + '</div>',
      '      <p class="muted">' + dailyFire.desc + '</p>',
      '      <p class="muted">体力 ' + dailyFire.stamina + ' · 耗时 ' + dailyFire.time + ' 分钟 · 全体爱心 +' + dailyFire.hearts + '</p>',
      '      <button class="btn mini primary" data-act="seaContest:' + dailyFire.id + '"' + (fireDone ? ' disabled' : '') + '>' + dailyFire.icon + ' 参加沙滩篝火</button>',
      '    </div>'
    ].join('\n') : '';

    // 大型赛事日程（每月固定 2~3 天，仅当天可参加）
    const board = GameExt.contestBoard();
    const contestRows = board.rows.map(row => {
      const status = row.isToday ? '<span class="tag-new">今天</span>'
        : row.passed ? '<span class="badge">已结束</span>'
          : '<span class="badge info">' + row.away + ' 天后</span>';
      const lines = row.entries.map(e => {
        const c = e.cfg;
        const btn = e.done ? '<span class="badge ok">已参加</span>'
          : row.isToday ? (e.can ? '<button class="btn mini primary" data-act="contest:' + c.id + '">参加</button>' : '<span class="badge warn">' + e.reason + '</span>' + needLink(c.id))
            : '<span class="muted">' + esc(e.next) + '</span>';
        return [
          '<div class="ct-line">',
          '  <span class="ct-i">' + c.icon + '</span>',
          '  <div class="ct-m"><b>' + c.name + '</b><span class="muted">体力 ' + c.stamina + ' · ' + c.reward + '</span></div>',
          btn,
          '</div>'
        ].join('');
      }).join('');
      return [
        '<div class="fest-card stack ' + (row.isToday ? 'today' : '') + '">',
        '  <div class="fc-h"><span>' + D.seasons[s.season] + row.day + '日</span><b>' + row.names + '</b>' + status + '</div>',
        lines,
        '</div>'
      ].join('');
    }).join('');
    const book = GameExt.seaList();
    return [
      '  <div class="card">',
      '    <div class="card-h"><b>' + D.beach.name + '</b><span class="muted">' + D.beach.desc + '</span></div>',
      '    <div class="quick-row">',
      '      <button class="btn primary" data-act="fishcast">🎣 甩竿钓鱼</button>',
      '      <button class="btn" data-act="nav:bag">🎒 背包（' + Game.storageTotal() + ' 件 · 海产 ' + book.got + '/' + book.total + '）</button>',
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>沙滩活动 · 每日开放</b><span class="muted">捡贝壳 / 抓螃蟹 / 找海星 / 沙滩篝火，每天都能参加</span></div>',
      '    <div class="sea-grid">',
      gather,
      dailyCard,
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-h"><b>' + D.seasonIcons[s.season] + ' 海滩比赛日程</b><span class="muted">大型赛事仅在下列日期举行（每月 2~3 天）</span></div>',
      '    <div class="card-b">' + contestRows + '</div>',
      '  </div>',
      seaBookHTML()
    ].join('\n');
  }

  /* ------------------------------ 海产图鉴本（已并入海滩页） ------------------------------ */
  function seaBookHTML() {
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
    else if (view === 'bag') html = viewBag();
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
    if (!btn) {
      // 牧场页点击动物卡片本体：和 3D 场景一样撒娇互动
      const card = e.target.closest('.animal-card');
      if (card && card.dataset.id) {
        const r = GameExt.patAnimal(card.dataset.id);
        if (r.ok === false) { toast(r.msg || '它现在不想撒娇', 'warn'); render(); return; }
        toast(r.name + ' 朝你撒起娇来（' + r.tierName + '，爱心 +' + r.gain + '）', 'ok');
        render();
      }
      return;
    }
    const act = btn.dataset.act;
    const parts = act.split(':');
    const s = Game.state;

    try {
      switch (parts[0]) {
        case 'nav':
          view = parts[1];
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
            const an = (r && r.animal) || {};
            const extra = [];
            if (an.recalled) extra.push(an.recalled + ' 只被暴雨召回');
            if (an.sick) extra.push(an.sick + ' 只生病');
            if (an.wolfLost) extra.push('狼叼走了 ' + an.wolfLostName);
            else if (an.wolfScare) extra.push('狼在牧场外徘徊，' + an.wolfScare + ' 只放牧动物受惊、爱心 -' + an.wolfHeartsLost);
            return '第 ' + Game.state.day + ' 天开始 · ' + (r && r.weather ? r.weather.icon + r.weather.name : '') + (extra.length ? '（' + extra.join('，') + '）' : '');
          });
          return;
        }
        case 'feed': result(Game.feedAnimal(parts[1]), r => r.name + ' 吃饱了');
          return;
        case 'brush': result(Game.brushAnimal(parts[1]), r => r.name + ' 舒服地蹭了蹭你（' + r.hearts + ' 心）');
          return;
        case 'talk': result(Game.talkAnimal(parts[1]), r => '你和 ' + r.name + ' 说了说话（' + r.hearts + ' 心）');
          return;
        case 'medicine': result(Game.useMedicine(parts[1]), r => r.name + ' 服用了' + r.med + '，恢复了健康（' + r.hearts + ' 心）');
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
        case 'upfence': result(Game.upgradeFence(), r => '牧场围栏升级为 Lv' + r.level + ' ' + r.levelName + '（野狗袭击概率下降）');
          return;
        case 'upmachine': result(Game.upgradeMachine(parts[1]), r => r.machine + ' 升级为 Lv' + r.level + ' ' + r.levelName);
          return;
        case 'process': result(Game.process(parts[1]), r => '加工出 ' + r.label + '（' + r.grade + ' 级）' + (r.extra ? '，机器 Lv' + r.level + ' 加成额外多产 1 件！' : ''));
          return;
        case 'sellkey': result(Game.sellAllKey(parts[1]), r => '卖出 ' + r.name + ' ×' + r.qty + '，得 ' + fmt(r.gain) + 'G');
          return;
        case 'sellcat': result(GameExt.bagSell(parts[1]), r => '卖掉' + (r.name || '') + ' ' + r.qty + ' 件，得 ' + fmt(r.gain) + 'G');
          return;
        case 'sellall': {
          const r = GameExt.bagSellAll();
          if (r.ok === false) { toast(r.msg || '背包里没有可出售的物品', 'warn'); return; }
          toast('全部出售完成：' + r.qty + ' 件 → + ' + fmt(r.gain) + 'G', 'ok');
          render();
          return;
        }
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
        case 'cormorantfish': {
          const r = GameExt.cormorantFish();
          if (r.ok === false) { toast(r.msg || '现在不能抓鱼', 'warn'); render(); return; }
          toast('「' + r.name + '」下水抓鱼：' + r.items.map(i => iconSrc('fish_' + i.key, i.icon) + i.name + '（' + i.size + 'cm' + (i.isNew ? ' · 图鉴新条目' : '') + (i.isBest ? ' · 刷新最大尺寸' : '') + '）').join('、')
            + '（鸬鹚今日体力 ' + r.stamina + '/' + r.staminaMax + '）', 'ok');
          render();
          return;
        }
        case 'pest': {
          const r = GameExt.catchPest(parseInt(parts[1], 10));
          if (r.ok === false) { toast(r.msg || '捉不到虫', 'warn'); render(); return; }
          toast('捉走了田鼠害虫，作物恢复生长' + (r.left > 0 ? '（还有 ' + r.left + ' 块田闹虫）' : '（田间已无虫害）'), 'ok');
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
          toast('钓到 ' + iconSrc('fish_' + r.key, r.icon) + r.name + '（' + r.size + 'cm · ' + r.rarityStars + (r.isNew ? ' · 图鉴新条目' : '') + (r.isBest ? ' · 刷新最大尺寸' : '') + '）', 'ok');
          render();
          return;
        }
        case 'contest': {
          const r = GameExt.joinContest(parts[1]);
          if (r.ok === false) { toast(r.msg || '现在不能参加比赛', 'warn'); render(); return; }
          const extra = (r.items && r.items.length)
            ? '，抓到 ' + r.items.map(i => iconSrc('fish_' + i.key, i.icon) + i.name + '（' + i.size + 'cm）').join('、')
            : '';
          toast(r.name + '：' + r.rank + '（表现 +' + r.rankBonus + '%）'
            + (r.gold ? '，奖金 ' + fmt(r.gold) + 'G' : '')
            + (r.hearts ? '，全体爱心 +' + r.hearts : '') + extra, 'ok');
          render();
          return;
        }
        case 'buypet': {
          const r = GameExt.buyPet(parts[1]);
          if (r.ok === false) { toast(r.msg || '领养失败', 'warn'); render(); return; }
          toast('领养了 ' + r.icon + r.name + '「' + r.artName + '」（-' + fmt(r.price) + 'G），可以参加' + r.contestName + '了', 'ok');
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
            // 重置后的存档需要重新补全扩展玩法字段（设施等级 / 宠物 / 图鉴等），否则商店与牧场页读不到
            if (window.GameExt && typeof window.GameExt.ensure === 'function') {
              try { window.GameExt.ensure(); } catch (err) { console.warn('重置后扩展玩法初始化失败：' + err.message); }
            }
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
    // 兼容旧链接：?view=fishbook 已并入背包页
    const v = params.get('view') === 'fishbook' ? 'bag' : params.get('view');
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
        if (payload.animal && payload.animal.wolfScare) lines.push('放牧没收回，' + payload.animal.wolfScare + ' 只动物被狼吓得掉了爱心');
        if (payload.fromFaint) lines.push('你因为过度劳累晕倒了');
        toast(lines.join(' · '), payload.fromFaint ? 'warn' : 'info');
        if (view !== 'pasture') render();
        // 灾难损失提示延后一帧：等游戏扩展（温室护苗等）修正明细后再展示，保证提示与实际一致
        if (payload.loss) {
          const loss = payload.loss;
          setTimeout(function () {
            if (loss.damaged > 0) {
              toast(loss.icon + loss.weather + '摧毁了 ' + loss.damaged + ' 块作物（损失 ' + loss.pct + '%）', 'warn');
              showDisasterPanel(loss);
            }
          }, 0);
        }
        // 狼袭结果单独醒目提示：被叼走 1 只不可逆，必须让玩家看清
        if (payload.animal && payload.animal.wolfLost) {
          setTimeout(function () {
            toast('🐺 夜里狼闯进牧场，叼走了 ' + payload.animal.wolfLostName + '！放牧的动物请在天黑前收回', 'warn');
          }, 0);
        } else if (payload.animal && payload.animal.wolfScare) {
          setTimeout(function () {
            toast('🐺 夜里狼在牧场外徘徊，' + payload.animal.wolfScare + ' 只没收回的放牧动物受惊，爱心 -' + payload.animal.wolfHeartsLost, 'warn');
          }, 0);
        }
      } else if (evt === 'faint') {
        toast('体力透支倒下，医药费 ' + payload.fee + 'G', 'warn');
        render();
      }
    });
  }

  return { init: init, render: render, tickClock: tickClock, toast: toast };
})();
