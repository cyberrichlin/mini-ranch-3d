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
    // 飞禽伙伴（老鹰 / 鸬鹚）：参加对应比赛的前置条件，同时承载日常玩法状态
    s.pets = s.pets || {};
    Object.keys(D.pets || {}).forEach(k => {
      const cfg = D.pets[k];
      const st = s.pets[k] || {};
      const daily = cfg.daily || {};
      const max = daily.staminaMax || 0;
      s.pets[k] = {
        owned: !!st.owned,
        points: typeof st.points === 'number' ? st.points : 40,
        name: st.name || cfg.artName || cfg.name,
        stamina: max ? (typeof st.stamina === 'number' ? Math.max(0, Math.min(max, st.stamina)) : max) : 0,
        staminaMax: max,
        today: st.today || { pests: 0, fish: 0, out: false, rainy: false }
      };
    });
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
    // 马 / 小狗也支持撒娇：走 state.horse / state.dog 的爱心值
    const pet = (id === 'dog' || id === 'horse') ? s[id] : null;
    const a = pet ? null : s.animals.find(x => x.id === id);
    const target = pet || a;
    if (!target) return { ok: false, msg: '找不到这只动物' };
    if (pet && !pet.owned) return { ok: false, msg: '还没有养' + (id === 'dog' ? '小狗' : '马') };
    if (a && a.sick) return { ok: false, msg: a.name + ' 生病了，先给它用药吧' };
    const add = Math.random() < 0.18 ? 2 : 1;
    target.points = Math.min(250, (target.points || 0) + add);
    target.charm = 2.6;                  // 场景里撒娇 2.6 秒
    s.stamina.fatigue = Math.max(0, s.stamina.fatigue - 0.5);
    G.save && G.save();
    const tier = tierOf(target.points);
    return {
      ok: true,
      name: target.name || (id === 'dog' ? '小狗' : '马'),
      points: target.points, gain: add, tier: tier, tierName: TIER_NAME[tier],
      hearts: Math.floor(target.points / 25)
    };
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

  /* ======================= 比赛活动系统 ======================= */

  /** 每日开放的沙滩活动（沙滩篝火），每天可直接参加一次 */
  const DAILY_BEACH_IDS = ['bonfire'];

  /** 每日沙滩活动结算（沿用旧海滩活动逻辑，不校验日期） */
  function beachDaily(id) {
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

  /* ------------------------- 鱼塘与飞禽日常（老鹰 / 鸬鹚） ------------------------- */

  const POND = D.pond || {
    name: '鱼塘', icon: '🌊',
    freshFish: ['carp', 'crucian', 'grasscarp', 'silvercarp', 'snakehead', 'catfish', 'yellowcat', 'mandarin'],
    cormorant: { staminaCost: 3, time: 30, catchMin: 1, catchMax: 2 },
    pest: { chance: 0.1, naturalFade: 0.5 }
  };
  /** 雨天判定：降雨 / 暴风雨 / 台风 / 暴雪 都算老鹰不宜出门的天气 */
  function isRainyWeather(w) {
    return !!(w && (w.effect === 'water' || w.effect === 'damage' || w.effect === 'damage-big'));
  }
  function petState(key) {
    const s = G.state;
    return (s.pets && s.pets[key]) || null;
  }
  /** 鱼塘里的淡水鱼种（只出淡水鱼，不含任何海鱼 / 海滩采集物） */
  function pondFishList() {
    return (POND.freshFish || []).filter(k => D.seafood[k]).map(k => {
      const info = D.seafood[k];
      return {
        key: k, name: info.name, icon: info.icon, rarity: info.rarity,
        rarityStars: rarityStars(info.rarity), price: info.base, sizeRange: info.size
      };
    });
  }
  /** 当前有田鼠害虫的田地序号 */
  function pestSpots() {
    const s = G.state;
    const out = [];
    (s.plots || []).forEach((p, i) => { if (p.pest && p.cropType && !p.harvestable) out.push(i); });
    return out;
  }

  /** 鱼塘信息：农田栏目用纯文字展示（塘内鱼的数量按设计不显示） */
  function pondInfo() {
    const s = G.state;
    const c = petState('cormorant') || { owned: false, stamina: 0, staminaMax: 0, today: {} };
    const e = petState('eagle') || { owned: false, today: {} };
    const w = D.getWeather(s.weather);
    const cfg = POND.cormorant || {};
    return {
      name: POND.name, icon: POND.icon, desc: POND.desc,
      fish: pondFishList(),
      hideCount: true,                       // 塘内鱼数量不展示
      cormorant: {
        owned: !!c.owned, name: c.name || '小黑',
        stamina: typeof c.stamina === 'number' ? c.stamina : 0,
        staminaMax: c.staminaMax || ((D.pets.cormorant.daily || {}).staminaMax) || 3,
        staminaCost: cfg.staminaCost || 3,
        todayFish: (c.today && c.today.fish) || 0
      },
      eagle: {
        owned: !!e.owned, name: e.name || '小旋',
        rainy: isRainyWeather(w), weatherName: D.getWeatherName(s.weather, s.season),
        todayPests: (e.today && e.today.pests) || 0
      },
      pests: pestSpots().length
    };
  }

  /** 派鸬鹚去鱼塘抓鱼：消耗牧场主体力 + 鸬鹚每日 1 点体力，抓到的鱼入背包并计入海产图鉴 */
  function cormorantFish() {
    const s = G.state;
    const pcfg = (D.pets && D.pets.cormorant) || {};
    const daily = pcfg.daily || {};
    const st = petState('cormorant');
    if (!st || !st.owned) return { ok: false, msg: '还没有领养鸬鹚，先到马厩领养一只（' + (pcfg.price || 0) + 'G）' };
    const max = st.staminaMax || daily.staminaMax || 3;
    const cur = typeof st.stamina === 'number' ? st.stamina : max;
    if (cur <= 0) return { ok: false, msg: '「' + (st.name || '小黑') + '」今天的体力用完了（0/' + max + '），明早再派它下水吧' };
    const cfg = POND.cormorant || {};
    const c = spend(G, cfg.staminaCost || 3);
    if (!c.ok) return c;
    st.stamina = Math.max(0, cur - (daily.staminaPerTrip || 1));
    const keys = (POND.freshFish || []).filter(k => D.seafood[k]);
    const weights = keys.map(k => Math.pow(1.3, 6 - (D.seafood[k].rarity || 1)));   // 常见淡水鱼更容易上钩
    const n = randInt(cfg.catchMin || 1, cfg.catchMax || 2);
    const items = [];
    for (let i = 0; i < n; i++) {
      let total = weights.reduce((a, b) => a + b, 0), r = Math.random() * total, pick = keys[0];
      for (let j = 0; j < keys.length; j++) { r -= weights[j]; if (r <= 0) { pick = keys[j]; break; } }
      const info = D.seafood[pick];
      const size = randSize(info.size);
      addItem(G, pick, 'S', 1);
      const rb = recordSea(pick, size);
      items.push({
        key: pick, name: info.name, icon: info.icon, size: size, best: rb.best,
        isNew: rb.isNew, isBest: rb.isBest, rarity: info.rarity,
        rarityStars: rarityStars(info.rarity), price: info.base
      });
    }
    spendTime(G, cfg.time || 30);
    s.stats.sea = (s.stats.sea || 0) + items.length;
    st.today = st.today || {};
    st.today.fish = (st.today.fish || 0) + items.length;
    st.points = Math.min(250, (st.points || 0) + 3);
    pushLog(G, '派「' + (st.name || '小黑') + '」去鱼塘抓鱼，叼回 ' + items.map(i => i.icon + i.name + '（' + i.size + 'cm）').join('、'));
    G.save && G.save();
    return {
      ok: true, name: st.name || '小黑', items: items, count: items.length,
      stamina: st.stamina, staminaMax: max, todayFish: st.today.fish
    };
  }

  /** 手动捉虫：未养鹰或雨天时的兜底手段，消耗 1 点体力 */
  function catchPest(index) {
    const s = G.state;
    const p = (s.plots || [])[index];
    if (!p) return { ok: false, msg: '这块田地不存在' };
    if (!p.pest) return { ok: false, msg: '这块田地里没有田鼠害虫' };
    const c = spend(G, 1);
    if (!c.ok) return c;
    p.pest = false;
    spendTime(G, 10);
    pushLog(G, '在 ' + (Math.floor(index / 6) + 1) + ' 行第 ' + (index % 6 + 1) + ' 列捉走了田鼠害虫，作物恢复生长');
    G.save && G.save();
    return { ok: true, index: index, left: pestSpots().length };
  }

  /** 每日飞禽结算：田地生虫 → 老鹰清早叼虫（雨天不外出）→ 鸬鹚体力回满 → 马厩动物免疫疾病 */
  function settlePets(s) {
    const pest = POND.pest || {};
    const cfgE = (D.pets && D.pets.eagle && D.pets.eagle.daily) || {};
    const eagle = (s.pets && s.pets.eagle) || null;
    const corm = (s.pets && s.pets.cormorant) || null;
    const w = D.getWeather(s.weather);
    const rainy = isRainyWeather(w);

    // 已成熟的作物不再受虫害
    (s.plots || []).forEach(p => { if (p.harvestable) p.pest = false; });
    // 1) 成长中的田地有概率钻出田鼠 / 害虫
    let born = 0;
    (s.plots || []).forEach(p => {
      if (!p.cropType || p.harvestable || p.pest) return;
      if (Math.random() < (pest.chance || 0.1)) { p.pest = true; born++; }
    });
    // 2) 老鹰清早巡视：非雨天出门叼虫；雨天不外出，田里害虫只能自然消散
    let caught = 0;
    const out = !!(eagle && eagle.owned) && !rainy;
    if (out) {
      const cap = cfgE.maxPerDay || 4;
      (s.plots || []).forEach(p => {
        if (p.pest && caught < cap) { p.pest = false; caught++; }
      });
    } else {
      (s.plots || []).forEach(p => { if (p.pest && Math.random() < (pest.naturalFade || 0.5)) p.pest = false; });
    }
    // 3) 仍带虫的地块当天停止生长（回退当日已推进的 1 天）
    let stopped = 0;
    (s.plots || []).forEach(p => {
      if (p.pest && p.cropType && !p.harvestable) {
        p.growthStage = Math.max(0, (p.growthStage || 0) - 1);
        stopped++;
      }
    });
    if (eagle) {
      eagle.today = { pests: caught, born: born, out: out, rainy: rainy };
      eagle.sick = false;
      if (caught > 0) {
        eagle.points = Math.min(250, (eagle.points || 0) + 1);
        pushLog(G, '「' + (eagle.name || '小旋') + '」清早巡视农田，叼走了 ' + caught + ' 只田鼠害虫');
      } else if (!out && born > 0) {
        pushLog(G, '下雨天「' + (eagle.name || '小旋') + '」不外出，田里钻出了 ' + born + ' 只田鼠害虫');
      }
    }
    // 4) 鸬鹚：每天体力回满
    if (corm) {
      const max = corm.staminaMax || ((D.pets.cormorant.daily || {}).staminaMax) || 3;
      const before = typeof corm.stamina === 'number' ? corm.stamina : max;
      corm.stamina = max;
      corm.staminaMax = max;
      corm.today = { fish: 0, rested: before < max };
      corm.sick = false;
    }
    // 5) 马厩动物（马 / 小狗 / 飞禽伙伴）不会生病
    const immune = ['horse', 'dog', 'eagle', 'cormorant'];
    (s.animals || []).forEach(a => {
      if (immune.indexOf(a.type) >= 0 && a.sick) { a.sick = false; a.daysSick = 0; }
    });
    return { born: born, stopped: stopped, caught: caught, out: out, rainy: rainy };
  }

  /* ------------------------- 飞禽伙伴 ------------------------- */

  function petList() {
    const s = G.state;
    return Object.keys(D.pets || {}).map(k => {
      const cfg = D.pets[k];
      const st = (s.pets && s.pets[k]) || {};
      const points = typeof st.points === 'number' ? st.points : 40;
      const contest = D.getContest(cfg.contest);
      return {
        key: k, name: cfg.name, artName: st.name || cfg.artName, icon: cfg.icon,
        model: cfg.model || ('pet_' + k),
        price: cfg.price, desc: cfg.desc, owned: !!st.owned, points: points,
        contestId: cfg.contest, contestName: contest ? contest.name : '',
        contestIcon: contest ? contest.icon : ''
      };
    });
  }

  function buyPet(key) {
    const s = G.state;
    const cfg = D.pets[key];
    if (!cfg) return { ok: false, msg: '没有这种伙伴' };
    if (!s.pets) s.pets = {};
    const st = s.pets[key] || (s.pets[key] = { owned: false, points: 40, name: cfg.artName });
    if (st.owned) return { ok: false, msg: '已经领养了' + cfg.name + '「' + (st.name || cfg.artName) + '」' };
    if (s.gold < cfg.price) return { ok: false, msg: '金币不足，还差 ' + (cfg.price - s.gold) + 'G 才能领养' + cfg.name };
    s.gold -= cfg.price;
    s.stats.spent = (s.stats.spent || 0) + cfg.price;
    st.owned = true;
    if (typeof st.points !== 'number') st.points = 40;
    const contest = D.getContest(cfg.contest);
    pushLog(G, '领养了' + cfg.name + '「' + cfg.artName + '」，可以参加' + (contest ? contest.name : '比赛') + '了');
    G.save && G.save();
    return { ok: true, key: key, name: cfg.name, artName: cfg.artName, icon: cfg.icon, price: cfg.price, contestName: contest ? contest.name : '' };
  }

  /* ------------------------- 比赛参与 ------------------------- */

  /** 校验某场比赛的参与前置条件 */
  function contestCheck(cfg) {
    const s = G.state;
    const need = cfg.need || {};
    if (need.rod && !(s.tools && 'fishingrod' in s.tools)) {
      return { ok: false, msg: '需要先在商店购买钓竿，才能参加' + cfg.name };
    }
    if (need.animal === 'horse' && !(s.horse && s.horse.owned)) {
      return { ok: false, msg: '需要先在马厩购买一匹马（小棕 5000G），才能参加' + cfg.name };
    }
    if (need.pet) {
      const pcfg = D.pets[need.pet] || {};
      const st = (s.pets && s.pets[need.pet]) || null;
      if (!st || !st.owned) {
        return { ok: false, msg: '需要先在马厩领养' + (pcfg.name || '伙伴') + '（' + (pcfg.price || 0) + 'G），才能参加' + cfg.name };
      }
    }
    return { ok: true, msg: '' };
  }

  /** 今天是否有这场比赛 */
  function contestIsToday(id) {
    const s = G.state;
    return D.findContests(s.season, G.dayOfSeason()).some(c => c.id === id);
  }

  /** 下一场比赛的文案 */
  function nextContestText(id) {
    const s = G.state;
    const info = D.nextContestInfo(id, s.season, G.dayOfSeason());
    if (!info) return '';
    if (info.away === 0) return '今天';
    const dayLabel = D.seasons[info.season] + '第 ' + info.day + ' 天';
    return dayLabel + '（' + (info.away > 0 ? info.away + ' 天后' : '已过') + '）';
  }

  /** 比赛日程板：本季全部比赛日 + 今天的参赛状态 */
  function contestBoard() {
    const s = G.state;
    const today = G.dayOfSeason();
    const rows = D.getContests(s.season).map(row => {
      const list = row.ids.map(id => D.getContest(id)).filter(Boolean);
      const isToday = row.day === today;
      return {
        day: row.day,
        isToday: isToday,
        passed: row.day < today,
        away: row.day - today,
        names: list.map(c => c.name).join('、'),
        icons: list.map(c => c.icon).join(''),
        entries: list.map(cfg => {
          const ck = contestCheck(cfg);
          const done = !!(s.dayEvents && s.dayEvents['contest_' + cfg.id]);
          return {
            cfg: cfg, done: done, blocked: !ck.ok, reason: ck.msg,
            can: isToday && ck.ok && !done,
            next: nextContestText(cfg.id)
          };
        })
      };
    });
    const todayEntries = [];
    rows.forEach(r => { if (r.isToday) r.entries.forEach(e => todayEntries.push(e)); });
    return { season: s.season, today: today, rows: rows, todayEntries: todayEntries };
  }

  /** 参加比赛（大型赛事：仅当天开放，且需满足前置条件） */
  function joinContest(id) {
    const s = G.state;
    const cfg = D.getContest(id);
    if (!cfg) return { ok: false, msg: '没有这个比赛' };
    if (!contestIsToday(id)) {
      const when = nextContestText(id);
      return { ok: false, msg: cfg.name + '只在特定日期举行，下一场：' + (when || '待公布') };
    }
    const ck = contestCheck(cfg);
    if (!ck.ok) return ck;
    s.dayEvents = s.dayEvents || {};
    if (s.dayEvents['contest_' + id]) return { ok: false, msg: '今天已经参加过' + cfg.name + '了' };

    const c = spend(G, cfg.stamina);
    if (!c.ok) return c;
    spendTime(G, cfg.time);
    s.dayEvents['contest_' + id] = true;

    // 名次系数：钓竿 / 高级鱼网 / 马心情 / 伙伴亲密度
    let bonus = 1 + Math.random() * 0.3;
    if (id === 'fishcontest') {
      const lv = (s.tools && s.tools.fishingrod) || 0;
      bonus += lv * 0.25 + (s.fishNet || 0) * 0.6;
    }
    if (id === 'racehorse' && s.horse) bonus += Math.floor((s.horse.points || 0) / 60) * 0.08;
    if (cfg.need && cfg.need.pet && s.pets && s.pets[cfg.need.pet]) {
      bonus += Math.floor((s.pets[cfg.need.pet].points || 0) / 60) * 0.08;
    }

    let gold = 0;
    if (cfg.baseGold) {
      gold = Math.round(cfg.baseGold * bonus);
      s.gold += gold;
      s.stats.earned = (s.stats.earned || 0) + gold;
    }

    let hearts = 0;
    if (cfg.hearts) {
      hearts = cfg.hearts;
      s.animals.forEach(a => { a.points = Math.min(250, (a.points || 0) + hearts); });
      s.stamina.fatigue = Math.max(0, s.stamina.fatigue - 15);
    }

    // 参赛后马 / 伙伴亲密度提升
    if (id === 'racehorse' && s.horse && s.horse.owned) s.horse.points = Math.min(250, (s.horse.points || 0) + 6);
    if (cfg.need && cfg.need.pet && s.pets && s.pets[cfg.need.pet]) {
      s.pets[cfg.need.pet].points = Math.min(250, (s.pets[cfg.need.pet].points || 0) + 8);
    }

    // 鸬鹚抓鱼比赛：额外海产进背包与图鉴
    const items = [];
    if (cfg.seaGain) {
      for (let i = 0; i < cfg.seaGain; i++) {
        const pool = D.FISHING_ORDER || [];
        if (!pool.length) break;
        const key = pool[randInt(0, pool.length - 1)];
        const info = D.seafood[key];
        if (!info) continue;
        const size = randSize(info.size);
        const rb = recordSea(key, size);
        addItem(G, key, 'S', 1);
        items.push({ key: key, name: info.name, icon: info.icon, size: size, isNew: rb.isNew, isBest: rb.isBest, best: rb.best });
        s.stats.sea = (s.stats.sea || 0) + 1;
      }
    }

    const rank = bonus >= 1.35 ? '冠军' : (bonus >= 1.15 ? '亚军' : '参与奖');
    let logMsg = '参加' + cfg.name + '获得' + rank + (gold ? '，奖金 ' + gold + 'G' : '');
    if (items.length) logMsg += '，鸬鹚抓到海产 ' + items.length + ' 件';
    pushLog(G, logMsg);
    G.save && G.save();
    return {
      ok: true, id: id, name: cfg.name, icon: cfg.icon, rank: rank,
      gold: gold, hearts: hearts, items: items, rankBonus: Math.round((bonus - 1) * 100)
    };
  }

  /** 兼容旧接口：每日沙滩活动走 beachDaily，大型赛事走 joinContest 日期校验 */
  function seaContest(id) {
    if (DAILY_BEACH_IDS.indexOf(id) >= 0) return beachDaily(id);
    return joinContest(id);
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
      s.prayedToday = true;              // 标记：本日天气由祈祷决定，灾难保底让位（季末除外）
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
    const restored = [];
    if (before && Array.isArray(s.plots)) {
      s.plots.forEach((p, i) => {
        const b = before[i];
        if (!b || !b.cropType || b.harvestable) return;
        const damaged = !p.cropType || (p.growthStage || 0) < (b.growthStage || 0) || (p.maxGrowth || 0) !== (b.maxGrowth || 0);
        if (damaged) { s.plots[i] = b; restored.push(i); }   // 温室 Lv1：免疫灾害与换季枯萎
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
    // 被温室护苗救回的作物已复原，需同步灾难损失明细，保证界面提示与实际一致
    if (r && r.loss && restored.length && Array.isArray(r.loss.entries)) {
      r.loss.entries = r.loss.entries.filter(e => restored.indexOf(e.index) < 0);
      r.loss.rescued = restored.length;
      if (this.recalcLoss) this.recalcLoss(r.loss);
    }
    if (s.charmBell > 0) {
      s.animals.forEach(a => { a.points = Math.min(250, (a.points || 0) + 4 * s.charmBell); });
    }
    // 飞禽伙伴与田间害虫的每日结算：老鹰清早叼虫（雨天不外出）/ 鸬鹚体力回满 / 马厩动物免疫疾病
    const petSettle = settlePets(s);
    if (r) r.pets = petSettle;
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

  /* ======================= 统一背包：收纳归类 + 分类 / 一键出售 ======================= */

  const SEAFOOD_KEYS = Object.keys(D.seafood || {});
  const PROCESS_KEYS = ['cheese', 'mayonnaise', 'yarn'];
  const MACHINE_KEYS = ['cheesemaker', 'mayomaker', 'yarnmaker'];

  /** 背包类目（数组顺序即界面展示顺序；sellable 表示该类目可在背包里整体出售） */
  const BAG_CATS = [
    { key: 'crop',    name: '农作物',           icon: '🌾', sellable: true,  desc: '田里收获的作物' },
    { key: 'product', name: '动物产品与收获物', icon: '🐄', sellable: true,  desc: '鸡蛋 / 牛奶 / 毛等日常产出' },
    { key: 'process', name: '加工品',           icon: '🏭', sellable: true,  desc: '加工机制成的成品' },
    { key: 'sea',     name: '海产',             icon: '🐟', sellable: true,  desc: '钓鱼与沙滩收获，同时记入海产图鉴' },
    { key: 'seed',    name: '种子',             icon: '🌱', sellable: false, desc: '播种用，不可出售' },
    { key: 'tool',    name: '工具与设施',       icon: '🧰', sellable: false, desc: '农具与已建造的加工设施，不可出售' },
    { key: 'ore',     name: '矿石',             icon: '⛏️', sellable: true,  desc: '矿洞挖掘所得（力之果实不可出售）' },
    { key: 'gather',  name: '采集物',           icon: '🫐', sellable: false, desc: '野莓等采集物，食用可回体力' }
  ];

  /** 仓库里的物品 key 归属哪个背包类目 */
  function catOfBagKey(key) {
    if (SEAFOOD_KEYS.indexOf(key) >= 0) return 'sea';
    if (PROCESS_KEYS.indexOf(key) >= 0) return 'process';
    const info = D.getStorageInfo(key) || {};
    return info.kind === 'crop' ? 'crop' : 'product';
  }

  /** 背包全量视图数据：按类目分组的条目（含不可出售的种子 / 工具 / 采集物） */
  function bagView() {
    const s = G.state;
    const cats = BAG_CATS.map(c => ({
      key: c.key, name: c.name, icon: c.icon, desc: c.desc, sellable: c.sellable,
      items: [], kinds: 0, qty: 0, value: 0
    }));
    const map = {};
    cats.forEach(c => { map[c.key] = c; });

    function push(catKey, item) {
      const c = map[catKey];
      if (!c) return;
      c.items.push(item);
      c.kinds += 1;
      c.qty += item.qty || 0;
      c.value += item.value || 0;
    }

    // 1) 仓库：作物 / 畜产 / 加工品 / 海产 都收在这里
    (G.storageList() || []).forEach(it => push(catOfBagKey(it.key), {
      key: it.key, iconKey: it.key, icon: it.icon,
      name: it.name, qty: it.total, value: it.value || 0,
      meta: (D.GRADE_IDS.filter(g => it.grades && it.grades[g] > 0).map(g => g + '×' + it.grades[g]).join(' ') || '—') +
            ' · 均价 ' + (it.total ? Math.round((it.value || 0) / it.total) : 0) + 'G',
      sellable: true
    }));

    // 2) 矿石
    (G.oreList() || []).forEach(o => push('ore', {
      key: o.key, iconKey: o.key, icon: o.icon,
      name: o.name, qty: o.count, value: o.key === 'powerberry' ? 0 : o.value * o.count,
      meta: o.key === 'powerberry' ? '提升体力上限用，不可出售' : '单价 ' + o.value + 'G',
      sellable: o.key !== 'powerberry'
    }));

    // 3) 种子袋
    Object.keys(s.seeds || {}).filter(k => s.seeds[k] > 0).forEach(k => {
      const c = D.getCropInfo(k);
      push('seed', {
        key: 'seed:' + k, iconKey: 'seed_' + k, icon: c ? c.icon : '🌱',
        name: (c ? c.name : k) + '种子', qty: s.seeds[k], value: 0,
        meta: c ? '播种用 · ' + c.growthDays + ' 天成熟' : '播种用',
        sellable: false
      });
    });

    // 4) 工具与已建设施
    Object.keys(D.tools || {}).forEach(k => {
      if (MACHINE_KEYS.indexOf(k) >= 0) return;
      if (!(s.tools && s.tools[k] > 0)) return;
      push('tool', {
        key: k, iconKey: k, icon: D.tools[k].icon,
        name: D.tools[k].name, qty: 1, value: 0,
        meta: D.toolLevels[s.tools[k]] || ('Lv' + s.tools[k]),
        sellable: false
      });
    });
    MACHINE_KEYS.forEach(k => {
      if (!(s.machines && s.machines[k])) return;
      const info = (D.shopItems || []).filter(i => i.id === k)[0] || { name: k, icon: '🏭' };
      push('tool', {
        key: k, iconKey: k, icon: info.icon,
        name: info.name, qty: 1, value: 0, meta: '加工设施 · 已建造（不可出售）',
        sellable: false
      });
    });

    // 5) 采集物
    if ((s.berries || 0) > 0) {
      push('gather', {
        key: 'berries', iconKey: 'berries', icon: '🫐',
        name: '野莓', qty: s.berries, value: 0,
        meta: '矿洞采集 · 食用回体力', sellable: false
      });
    }

    return {
      cats: cats,
      totalQty: cats.reduce((n, c) => n + c.qty, 0),
      totalValue: cats.reduce((n, c) => n + c.value, 0)
    };
  }

  /** 按类目出售：crop / product / process / sea 走仓库，ore 走矿石堆 */
  function bagSell(catKey) {
    const cat = BAG_CATS.filter(c => c.key === catKey)[0];
    if (!cat) return { ok: false, msg: '没有这个类目' };
    if (!cat.sellable) return { ok: false, msg: cat.name + '不可出售' };
    if (catKey === 'ore') return G.sellOres();

    let qty = 0, gain = 0;
    Object.keys(G.state.storage || {}).forEach(key => {
      if (catOfBagKey(key) !== catKey) return;
      const r = G.sellAllKey(key);
      if (r && r.ok !== false) { qty += r.qty; gain += r.gain; }
    });
    if (!qty) return { ok: false, msg: cat.name + '暂时没有可出售的物品' };
    return { ok: true, name: cat.name, qty: qty, gain: gain };
  }

  /** 一键全部出售：仓库所有物品 + 矿石（力之果实保留） */
  function bagSellAll() {
    let qty = 0, gain = 0;
    const a = G.sellEverything();
    if (a && a.ok !== false) { qty += a.qty; gain += a.gain; }
    const b = G.sellOres();
    if (b && b.ok !== false) { qty += b.qty; gain += b.gain; }
    if (!qty) return { ok: false, msg: '背包里没有可出售的物品' };
    return { ok: true, qty: qty, gain: gain };
  }

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
    prayWeather: prayWeather,
    bagView: bagView,
    bagSell: bagSell,
    bagSellAll: bagSellAll,
    bagCats: BAG_CATS,
    petList: petList,
    buyPet: buyPet,
    contestCheck: contestCheck,
    contestIsToday: contestIsToday,
    nextContestText: nextContestText,
    contestBoard: contestBoard,
    joinContest: joinContest,
    beachDaily: beachDaily,
    pondInfo: pondInfo,
    pondFishList: pondFishList,
    cormorantFish: cormorantFish,
    catchPest: catchPest,
    pestSpots: pestSpots
  };
})();
