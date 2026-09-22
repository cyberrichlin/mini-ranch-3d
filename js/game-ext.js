/**
 * game-ext.js —— 玩法扩展层（矿石镇化 v3）
 * 不修改 game.js 主体，统一用「包装 + 追加状态字段」的方式接入新增玩法：
 *   1) 睡觉收工：跳到次日 6:00 并补满体力（大床额外降低疲劳）
 *   2) 商店兑换：用矿石 / 加工品兑换奇特商品（含提升体力上限）
 *   3) 天气祭坛 + 温室大棚：可控天气与产量，均可升级
 *   4) 矿洞：每层可挖多次（铁镐等级决定次数），可用金币 + 矿石升级铁镐
 *   5) 海滩：捡贝壳 / 抓螃蟹 / 找海星、钓鱼比赛 / 沙雕比赛 / 沙滩篝火
 *   6) 海产图鉴：记录最大尺寸、稀有度、售价（未获得显示影子）
 *   7) 点击动物撒娇：按爱心值显示灰 / 黄 / 红爱心
 * 所有入口都通过 window.GameExt 暴露给 ui.js。
 */
window.GameExt = (function () {
  'use strict';

  const D = window.GAME_DATA;
  const G = window.Game;

  /* ======================= 基础工具 ======================= */

  function tierOf(points) {
    const lv = Math.floor((points || 0) / 25);
    if (lv >= 8) return 'red';
    if (lv >= 4) return 'yellow';
    return 'gray';
  }
  const TIER_NAME = { gray: '还很生疏', yellow: '喜欢你了', red: '挚友撒娇中' };

  function spend(api, cost) {
    if (typeof api.spend === 'function') return api.spend(cost);
    const s = api.state;
    if (s.stamina.cur < cost) return { ok: false, msg: '体力不足，先休息一下' };
    s.stamina.cur -= cost;
    return { ok: true };
  }
  function spendTime(api, min) {
    if (api && typeof api.spendTime === 'function') { try { api.spendTime(min); } catch (e) { } }
  }
  function bagOf(s, key) {
    if (!s.storage[key]) {
      const b = {};
      D.GRADE_IDS.forEach(g => { b[g] = 0; });
      s.storage[key] = b;
    }
    return s.storage[key];
  }
  function addItem(api, key, grade, n) {
    const s = api.state;
    bagOf(s, key);
    if (typeof api.stAdd === 'function') return api.stAdd(key, grade || 'S', n || 1);
    s.storage[key][grade || 'S'] = (s.storage[key][grade || 'S'] || 0) + (n || 1);
    return n || 1;
  }
  function pushLog(api, msg) {
    if (api && typeof api.pushLog === 'function') { try { api.pushLog(msg); return; } catch (e) { } }
    const s = api.state;
    s.log = s.log || [];
    s.log.unshift(msg);
    if (s.log.length > 40) s.log.pop();
  }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function randSize(range) {
    const [lo, hi] = range || [10, 30];
    const r = Math.pow(Math.random(), 0.65);      // 偏小尺寸更多
    return Math.round((lo + (hi - lo) * r) * 10) / 10;
  }
  function rarityStars(r) { return '★'.repeat(r) + '☆'.repeat(5 - r); }

  /* ======================= 状态补全 ======================= */

  function makeAnimal(type) {
    const t = D.animalTypes[type];
    return {
      id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      type: type, name: t.name, points: 50, fed: true, grazing: false,
      produceReady: false, sick: false, daysSick: 0, age: 1, charm: 0
    };
  }

  function ensure() {
    const s = G.state;
    if (!s) return;
    s.devices = Object.assign({ weather: 0, greenhouse: 0 }, s.devices || {});
    s.pickaxe = s.pickaxe || 0;
    s.exchange = s.exchange || {};
    s.fishbook = s.fishbook || {};
    s.dayEvents = s.dayEvents || {};
    s.gear = s.gear || 0;          // 矿工头灯：挖掘省体力
    s.fishNet = s.fishNet || 0;    // 高级鱼网：比赛奖金加成
    s.charmBell = s.charmBell || 0;// 牧场风铃：每日爱心加成
    s.forcedWeather = (s.forcedWeather === undefined ? null : s.forcedWeather);
    s.stats = s.stats || {};
    s.stats.dug = s.stats.dug || 0;
    s.stats.sea = s.stats.sea || 0;

    // 新动物（猫 / 羊驼）若尚未入住，则让牧场迎来新伙伴，便于直接看到新造型
    const cap = (s.build && s.build.barnLevel === 2) ? 8 : 4;
    ['cat', 'llama'].forEach(t => {
      if (D.animalTypes[t] && !s.animals.some(a => a.type === t) && s.animals.length < cap) {
        s.animals.push(makeAnimal(t));
        s.log = s.log || [];
        s.log.unshift('牧场迎来了新伙伴：' + D.animalTypes[t].name);
      }
    });
  }

  /* ======================= 撒娇互动 ======================= */

  function patAnimal(id) {
    const s = G.state;
    const a = s.animals.find(x => x.id === id);
    if (!a) return { ok: false, msg: '找不到这只动物' };
    if (a.sick) return { ok: false, msg: a.name + ' 生病了，先给它用药吧' };
    const add = Math.random() < 0.18 ? 2 : 1;
    a.points = Math.min(250, (a.points || 0) + add);
    a.charm = 2.6;                       // 场景里撒娇 2.6 秒
    s.stamina.fatigue = Math.max(0, s.stamina.fatigue - 0.5);
    G.save && G.save();
    return { ok: true, name: a.name, points: a.points, gain: add, tier: tierOf(a.points), tierName: TIER_NAME[tierOf(a.points)], hearts: Math.floor(a.points / 25) };
  }

  /* ======================= 海产图鉴 ======================= */

  function recordSea(key, size) {
    const s = G.state;
    const info = D.seafood[key];
    if (!info) return { isNew: false, best: size };
    const e = s.fishbook[key] || { count: 0, maxSize: 0 };
    const isNew = e.count === 0;
    const isBest = size > (e.maxSize || 0);
    e.count += 1;
    e.maxSize = Math.max(e.maxSize || 0, size);
    s.fishbook[key] = e;
    return { isNew: isNew, isBest: isBest, best: e.maxSize, rarity: info.rarity };
  }

  function seaList() {
    const s = G.state;
    const keys = Object.keys(D.seafood);
    const got = keys.filter(k => s.fishbook[k] && s.fishbook[k].count > 0).length;
    return {
      total: keys.length, got: got,
      list: keys.map(k => {
        const info = D.seafood[k];
        const e = s.fishbook[k] || null;
        return {
          key: k, name: info.name, icon: info.icon, rarity: info.rarity,
          rarityStars: rarityStars(info.rarity), price: info.base,
          sizeRange: info.size, field: info.field,
          owned: !!(e && e.count > 0), count: e ? e.count : 0,
          maxSize: e ? e.maxSize : 0, isNew: !(e && e.count > 0)
        };
      })
    };
  }

  /* ======================= 海滩玩法 ======================= */

  function seaGather(id) {
    const s = G.state;
    const cfg = (D.beach.gather || []).find(x => x.id === id);
    if (!cfg) return { ok: false, msg: '没有这个活动' };
    const c = spend(G, cfg.stamina);
    if (!c.ok) return c;
    const n = randInt(cfg.min, cfg.max);
    addItem(G, cfg.key, 'S', n);
    const info = D.seafood[cfg.key] || { name: cfg.name, size: [5, 10], rarity: 1, base: 0 };
    const size = randSize(info.size);
    const rb = recordSea(cfg.key, size);
    s.stats.sea += 1;
    pushLog(G, '在海滩' + cfg.name + '，得到 ' + info.name + ' ×' + n + '（最大 ' + rb.best + 'cm）');
    G.save && G.save();
    return {
      ok: true, name: cfg.name, item: info.name, icon: info.icon, count: n,
      size: size, best: rb.best, isNew: rb.isNew, isBest: rb.isBest, rarity: info.rarity
    };
  }

  function castRod() {
    const s = G.state;
    if (!(s.tools && 'fishingrod' in s.tools)) return { ok: false, msg: '还没有钓竿，先去商店买一根' };
    const c = spend(G, D.staminaCosts.fish || 3);
    if (!c.ok) return c;
    const lv = s.tools.fishingrod || 0;
    const keys = D.FISHING_ORDER.filter(k => D.seafood[k]);
    const weights = keys.map(k => Math.pow(1.32, 6 - D.seafood[k].rarity) * (1 + lv * 0.12 * D.seafood[k].rarity));
    let total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total, pick = keys[0];
    for (let i = 0; i < keys.length; i++) { r -= weights[i]; if (r <= 0) { pick = keys[i]; break; } }
    const info = D.seafood[pick];
    const size = randSize(info.size);
    addItem(G, pick, 'S', 1);
    const rb = recordSea(pick, size);
    spendTime(G, 20);
    s.stats.sea += 1;
    pushLog(G, '钓到了 ' + info.name + '（' + size + 'cm，' + rarityStars(info.rarity) + '）');
    G.save && G.save();
    return { ok: true, key: pick, name: info.name, icon: info.icon, size: size, best: rb.best, isNew: rb.isNew, isBest: rb.isBest, rarity: info.rarity, rarityStars: rarityStars(info.rarity), price: info.base };
  }

  function seaContest(id) {
    const s = G.state;
    const cfg = (D.beach.contests || []).find(x => x.id === id);
    if (!cfg) return { ok: false, msg: '没有这个活动' };
    if (cfg.needRod && !(s.tools && 'fishingrod' in s.tools)) return { ok: false, msg: '需要先拥有钓竿才能参加' };
    s.dayEvents = s.dayEvents || {};
    if (s.dayEvents['contest_' + id]) return { ok: false, msg: '今天已经参加过' + cfg.name + '了' };
    const c = spend(G, cfg.stamina);
    if (!c.ok) return c;
    spendTime(G, cfg.time);
    s.dayEvents['contest_' + id] = true;
    const lv = (s.tools && s.tools.fishingrod) || 0;
    let gain = 0, hearts = 0;
    if (cfg.baseGold) {
      const bonus = 1 + lv * 0.25 + (s.fishNet || 0) * 0.6 + Math.random() * 0.35;
      gain = Math.round(cfg.baseGold * bonus);
      s.gold += gain;
      s.stats.earned = (s.stats.earned || 0) + gain;
    }
    if (cfg.hearts) {
      hearts = cfg.hearts;
      s.animals.forEach(a => { a.points = Math.min(250, (a.points || 0) + hearts); });
      s.stamina.fatigue = Math.max(0, s.stamina.fatigue - 15);
    }
    pushLog(G, '参加了' + cfg.name + (gain ? '，赢得奖金 ' + gain + 'G' : '，大家都很开心'));
    G.save && G.save();
    return { ok: true, name: cfg.name, icon: cfg.icon, gold: gain, hearts: hearts };
  }

  /* ======================= 矿洞：多次挖掘 + 铁镐 ======================= */

  function pickaxeInfo() {
    const lv = G.state.pickaxe || 0;
    const cur = D.pickaxeLevels[lv];
    const next = D.pickaxeLevels[lv + 1] || null;
    return { level: lv, name: cur.name, hits: cur.hits, next: next };
  }
  function staminaSave() { return (G.state.gear || 0) * 1; }

  function digFloor() {
    const s = G.state;
    if (!s.mine || !s.mine.inMine) return { ok: false, msg: '还没有进入矿洞' };
    const px = pickaxeInfo();
    s.mine.hits = s.mine.hits || {};
    const floor = s.mine.floor;
    const used = s.mine.hits[floor] || 0;
    if (used >= px.hits) return { ok: false, msg: '本层已经挖满 ' + px.hits + ' 次（' + px.name + '），要继续就得往下一层了' };
    const cost = Math.max(1, (D.staminaCosts.mine || 8) - stadiumSave_());
    const c = spend(G, cost);
    if (!c.ok) return c;
    s.mine.hits[floor] = used + 1;
    s.stats.dug = (s.stats.dug || 0) + 1;
    const found = [];
    const loot = (typeof G.rollLoot === 'function') ? G.rollLoot(floor) : null;
    if (loot === 'powerberry') {
      if (s.berries < D.BERRY_MAX) {
        s.berries++;
        s.stamina.max += D.STAMINA_PER_BERRY;
        s.stamina.cur += D.STAMINA_PER_BERRY;
        found.push({ key: 'powerberry', name: '力之果实（体力上限 +10）', icon: D.ores.powerberry.icon, count: 1 });
      }
    } else if (loot && D.ores[loot]) {
      s.ores[loot] = (s.ores[loot] || 0) + 1;
      found.push({ key: loot, name: D.ores[loot].name, icon: D.ores[loot].icon, count: 1 });
    }
    if (loot && s.mine.loot && !s.mine.loot.includes(loot)) s.mine.loot.push(loot);
    spendTime(G, 25);
    pushLog(G, '第 ' + floor + ' 层第 ' + (used + 1) + ' 次挖掘' + (found.length ? '，挖到 ' + found.map(f => f.icon + f.name).join('、') : '，一无所获'));
    G.save && G.save();
    return { ok: true, floor: floor, hits: used + 1, maxHits: px.hits, pickaxe: px.name, found: found, msg: found.length ? '' : '这层暂时挖不到什么了' };
  }
  function stadiumSave_() { return staminaSave(); }

  function upgradePickaxe() {
    const s = G.state;
    const px = pickaxeInfo();
    if (!px.next) return { ok: false, msg: '铁镐已经是最高等级' };
    const nx = px.next;
    const have = s.ores[nx.ore] || 0;
    if (have < nx.count) return { ok: false, msg: D.ores[nx.ore].name + '不足（需要 ' + nx.count + '，现有 ' + have + '）' };
    if (s.gold < nx.cost) return { ok: false, msg: '金币不足（需要 ' + nx.cost + 'G）' };
    s.ores[nx.ore] = have - nx.count;
    s.gold -= nx.cost;
    s.stats.spent = (s.stats.spent || 0) + nx.cost;
    s.pickaxe = nx.level;
    pushLog(G, '铁镐升级为' + nx.name + '，每层可挖 ' + nx.hits + ' 次');
    G.save && G.save();
    return { ok: true, name: nx.name, hits: nx.hits, level: nx.level };
  }

  /* ======================= 商店兑换 ======================= */

  function exchangeCount(id) { return (G.state.exchange && G.state.exchange[id]) || 0; }

  function exchange(id) {
    const s = G.state;
    const it = (D.exchangeItems || []).find(x => x.id === id);
    if (!it) return { ok: false, msg: '没有这件商品' };
    const used = exchangeCount(id);
    if (used >= it.limit) return { ok: false, msg: it.name + ' 已达兑换上限' };
    const need = it.need || {};
    if (need.ore) {
      const have = s.ores[need.ore] || 0;
      if (have < need.count) return { ok: false, msg: D.ores[need.ore].name + '不足（需要 ' + need.count + '，现有 ' + have + '）' };
    }
    if (need.quality) {
      const bag = s.storage[need.quality];
      const total = bag ? D.GRADE_IDS.reduce((n, g) => n + (bag[g] || 0), 0) : 0;
      if (total < need.count) return { ok: false, msg: D.getStorageInfo(need.quality).name + '不足（需要 ' + need.count + ' 件）' };
    }
    if (s.gold < it.gold) return { ok: false, msg: '金币不足（需要 ' + it.gold + 'G）' };

    if (need.ore) s.ores[need.ore] -= need.count;
    if (need.quality) {
      let left = need.count;
      D.GRADE_IDS.forEach(g => {
        if (left <= 0) return;
        const bag = s.storage[need.quality];
        const take = Math.min(left, bag[g] || 0);
        bag[g] -= take; left -= take;
      });
    }
    s.gold -= it.gold;
    s.stats.spent = (s.stats.spent || 0) + it.gold;
    s.exchange[id] = used + 1;

    let effect = '';
    if (id === 'stamina_up') {
      s.stamina.max += 10; s.stamina.cur += 10;
      effect = '体力上限提升到 ' + s.stamina.max;
    } else if (id === 'heart_up') {
      s.animals.forEach(a => { a.points = Math.min(250, (a.points || 0) + 15); });
      effect = '全体动物爱心 +15';
    } else if (id === 'mystic_seed') {
      const crops = D.getCurrentCrops(s.season);
      const picks = [];
      for (let i = 0; i < 3; i++) {
        const c = crops[Math.floor(Math.random() * crops.length)];
        s.seeds[c.id] = (s.seeds[c.id] || 0) + 1;
        picks.push(c.name);
      }
      effect = '获得种子：' + picks.join('、');
    } else if (id === 'mystic_gear') {
      s.gear += 1; effect = '矿洞挖掘体力消耗 -' + s.gear;
    } else if (id === 'charm_bell') {
      s.charmBell += 1; effect = '每天早上动物爱心 +' + (4 * s.charmBell);
    } else if (id === 'dried_net') {
      s.fishNet += 1; effect = '钓鱼比赛奖金 +' + (60 * s.fishNet) + '%';
    }
    pushLog(G, '商店兑换了' + it.name + (effect ? '：' + effect : ''));
    G.save && G.save();
    return { ok: true, name: it.name, icon: it.icon, effect: effect, used: used + 1, limit: it.limit };
  }

  /* ======================= 天气祭坛 / 温室大棚 ======================= */

  function deviceInfo(key) {
    const s = G.state;
    const cfg = D.devices[key];
    const lv = s.devices[key] || 0;
    return { key: key, name: cfg.name, icon: cfg.icon, level: lv, maxLevel: cfg.maxLevel, next: lv < cfg.maxLevel ? cfg.levels[lv] : null, levels: cfg.levels };
  }

  function upgradeDevice(key) {
    const s = G.state;
    const info = deviceInfo(key);
    if (!info.next) return { ok: false, msg: info.name + ' 已经是最高等级' };
    const nx = info.next;
    if (s.gold < nx.cost) return { ok: false, msg: '金币不足（需要 ' + nx.cost + 'G）' };
    const ores = nx.ores || {};
    const lack = Object.keys(ores).filter(k => (s.ores[k] || 0) < ores[k]);
    if (lack.length) return { ok: false, msg: '矿石不足：' + lack.map(k => D.ores[k].name + '×' + ores[k]).join('、') };
    s.gold -= nx.cost;
    s.stats.spent = (s.stats.spent || 0) + nx.cost;
    Object.keys(ores).forEach(k => { s.ores[k] -= ores[k]; });
    s.devices[key] = info.level + 1;
    pushLog(G, info.name + '升级到 Lv' + (info.level + 1) + '：' + nx.desc);
    G.save && G.save();
    return { ok: true, name: info.name, level: info.level + 1, desc: nx.desc };
  }

  // 祈祷选项 → 天气 id（D.weatherTypes 的 id 为数字：0 晴 / 1 降雨 / 2 暴风雨 / 3 干旱 / 4 台风 / 5 暴雪）
  const PRAY = {
    sunny: { id: 0, needLv: 1, label: '晴天' },
    rain: { id: 1, needLv: 2, label: '雨天' },
    any: { id: -1, needLv: 3, label: '任意天气' }
  };

  function prayWeather(kind) {
    const s = G.state;
    const info = deviceInfo('weather');
    if (info.level < 1) return { ok: false, msg: '还没有建造天气祭坛' };
    const cfg = PRAY[kind] || PRAY.sunny;
    if (info.level < cfg.needLv) return { ok: false, msg: '天气祭坛需要 Lv' + cfg.needLv + ' 才能祈祷' + cfg.label + '（当前 Lv' + info.level + '）' };
    const ids = D.weatherTypes.map(w => w.id);
    let id = cfg.id;
    if (id < 0) {                                   // Lv3：祭坛自选次日天气（非灾害）
      const pool = [0, 1, 3, 5].filter(x => ids.indexOf(x) >= 0);
      id = pool[Math.floor(Math.random() * pool.length)];
    }
    const w = D.getWeather(id) || D.weatherTypes[id];
    if (!w) return { ok: false, msg: '无法祈祷这种天气' };
    const c = spend(G, 6);
    if (!c.ok) return c;
    s.forcedWeather = id;
    spendTime(G, 30);
    pushLog(G, '在天气祭坛祈祷，明天将是' + w.name + (cfg.id < 0 ? '（祭坛护佑，不会出现灾害天气）' : ''));
    G.save && G.save();
    return { ok: true, name: w.name, icon: w.icon, desc: w.desc };
  }

  /* ======================= 包装 game.js 既有流程 ======================= */

  function wrap(name, fn) {
    const orig = G[name];
    if (typeof orig !== 'function') return false;
    G[name] = function () {
      return fn.call(this, orig, arguments);
    };
    return true;
  }

  // 睡觉收工：次日 6:00 起床，体力补满（大床额外清疲劳）
  wrap('sleep', function (orig, args) {
    const s = this.state;
    const r = orig.apply(this, args);
    if (r && r.ok === false) return r;
    s.stamina.cur = s.stamina.max;
    s.stamina.fatigue = (s.build && s.build.beds) ? 0 : Math.max(0, s.stamina.fatigue - 60);
    if (typeof s.hour === 'number') s.hour = 6;
    if (typeof s.minute === 'number') s.minute = 0;
    if (typeof s.time === 'number') s.time = 6 * 60;
    if (typeof s.clock === 'number') s.clock = 6 * 60;
    if (s.timeOfDay !== undefined) { try { s.timeOfDay = 6; } catch (e) { } }
    s.sleptAt6 = true;
    pushLog(this, '睡到第二天清晨 6:00，体力完全恢复（' + s.stamina.cur + '/' + s.stamina.max + '）');
    this.save && this.save();
    return r;
  });

  // 天气祭坛：次日的天气由玩家决定（需同步写入 state.weather，否则当天仍按原天气结算）
  wrap('rollWeather', function (orig, args) {
    const s = this.state;
    if (s && s.forcedWeather !== null && s.forcedWeather !== undefined) {
      const w = s.forcedWeather;
      s.forcedWeather = null;
      s.weather = w;
      s.weatherEvent = null;             // 祈祷得到的天气不带灾害
      pushLog(this, '天气祭坛生效：今天 ' + (D.weatherTypes[w] ? D.weatherTypes[w].name : w));
      return w;
    }
    return orig.apply(this, args);
  });

  // 换日：温室护苗 + 每日爱心加成 + 每日活动重置
  wrap('advanceDay', function (orig, args) {
    const s = this.state;
    const gh = (s.devices && s.devices.greenhouse) || 0;
    const before = gh > 0 ? s.plots.map(p => JSON.parse(JSON.stringify(p))) : null;
    const r = orig.apply(this, args);
    if (before && Array.isArray(s.plots)) {
      s.plots.forEach((p, i) => {
        const b = before[i];
        if (!b || !b.cropType || b.harvestable) return;
        const damaged = !p.cropType || (p.growthStage || 0) < (b.growthStage || 0) || (p.maxGrowth || 0) !== (b.maxGrowth || 0);
        if (damaged) { s.plots[i] = b; }           // 温室 Lv1：免疫灾害与换季枯萎
      });
      if (gh >= 3) {                               // 温室 Lv3：生长速度 +1 天
        s.plots.forEach(p => {
          if (p.cropType && !p.harvestable) {
            p.growthStage = Math.min(p.maxGrowth || 999, (p.growthStage || 0) + 1);
            if (p.maxGrowth && p.growthStage >= p.maxGrowth) p.harvestable = true;
          }
        });
      }
    }
    if (s.charmBell > 0) {
      s.animals.forEach(a => { a.points = Math.min(250, (a.points || 0) + 4 * s.charmBell); });
    }
    s.dayEvents = {};
    if (s.mine) s.mine.hits = {};
    this.save && this.save();
    return r;
  });

  // 温室 Lv2：收获时额外产出 1 件
  wrap('harvest', function (orig, args) {
    const s = this.state;
    const gh = (s.devices && s.devices.greenhouse) || 0;
    const r = orig.apply(this, args);
    if (gh >= 2 && r && r.ok !== false && r.crop && r.crop.id) {
      addItem(this, r.crop.id, r.grade || 'S', 1);
      r.bonusNote = '温室加成 +1';
    }
    return r;
  });

  // 进入 / 离开矿洞：重置本层挖掘次数
  wrap('enterMine', function (orig, args) {
    const r = orig.apply(this, args);
    if (this.state.mine) this.state.mine.hits = {};
    return r;
  });
  wrap('leaveMine', function (orig, args) {
    if (this.state.mine) this.state.mine.hits = {};
    return orig.apply(this, args);
  });

  /* ======================= 对外接口 ======================= */

  ensure();

  return {
    ensure: ensure,
    tierOf: tierOf,
    tierName: function (p) { return TIER_NAME[tierOf(p)]; },
    rarityStars: rarityStars,
    patAnimal: patAnimal,
    castRod: castRod,
    seaGather: seaGather,
    seaContest: seaContest,
    seaList: seaList,
    recordSea: recordSea,
    digFloor: digFloor,
    staminaSave: staminaSave,
    pickaxeInfo: pickaxeInfo,
    upgradePickaxe: upgradePickaxe,
    exchange: exchange,
    exchangeCount: exchangeCount,
    deviceInfo: deviceInfo,
    upgradeDevice: upgradeDevice,
    prayWeather: prayWeather
  };
})();
