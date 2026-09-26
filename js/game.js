/**
 * game.js —— 游戏核心逻辑（v2 · 矿石镇化）
 * 状态机 / 存档 / 时间与体力 / 天气 / 生长 / 爱心 / 产物分级 / 工具升级 / 矿洞 / 节日。
 * 只负责数据与规则，不接触任何 DOM。
 */
window.Game = (function () {
  'use strict';

  const D = window.GAME_DATA;
  const SAVE_KEY = 'mini-farm-web::save::v2';
  const PLOT_COUNT = 24;                    // 6 × 4
  const SELL_RATE = 1.0;                    // 出货价系数
  const CHAR_NAME = '牧场主';

  // 每项农活消耗的游戏时间（分钟）
  const TIME_COST = {
    plow: 5, plant: 2, water: 3, fertilize: 2, harvest: 3,
    brush: 5, talk: 1, feed: 2, collect: 1, mine: 30, graze: 10, process: 30, fish: 20
  };

  const ANIMAL_NAMES = ['小豆', '奶昔', '云朵', '布丁', '芝麻', '团子', '咪咪', '雪球', '可可', '花生', '糯糯', '芽芽'];

  /* ==================== 构造工具 ==================== */

  function emptyGrades() {
    const o = {};
    for (let i = 0; i < D.GRADE_IDS.length; i++) o[D.GRADE_IDS[i]] = 0;
    return o;
  }

  function createPlot(id) {
    return {
      id: id,
      plowed: false,
      cropType: null,
      growthStage: 0,
      maxGrowth: 0,
      waterLevel: 0,
      fertilizerLevel: 0,
      harvestable: false,
      regrow: 0,
      regrowTimer: 0
    };
  }

  function createAnimal(type, name) {
    const t = D.animalTypes[type];
    return {
      id: type + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
      type: type,
      name: name || t.name,
      points: 25,          // 好感点，25 点 = 1 心，上限 250（10 心）
      fed: false,
      grazing: false,
      produceReady: false,
      produceDays: 0,
      sick: false,
      daysSick: 0,
      grazedHours: 0
    };
  }

  /** 专属药库存：按动物类型计数（每种动物一种药） */
  function emptyMedicines() {
    const m = {};
    (D.animalMedicines || []).forEach(x => { m[x.type] = 0; });
    return m;
  }

  function createInitialState() {
    const plots = [];
    for (let i = 0; i < PLOT_COUNT; i++) plots.push(createPlot(i));

    const storage = {};
    ['turnip', 'potato', 'cucumber', 'strawberry', 'tomato', 'corn', 'watermelon',
     'eggplant', 'carrot', 'pumpkin', 'sweetpotato', 'cabbage', 'radish',
     'egg', 'milk', 'wool', 'rabbitwool', 'cheese', 'mayonnaise', 'yarn'].forEach(k => { storage[k] = emptyGrades(); });

    const ores = {};
    Object.keys(D.ores).forEach(k => { ores[k] = 0; });

    return {
      version: 2,
      gold: 3000,
      day: 1,
      season: 0,
      weather: 0,
      weatherEvent: null,
      disaster: { season: 0, count: 0, lastDay: 0, last: null, log: [] },
      paused: false,
      time: D.DAY_START,
      stamina: { max: D.STAMINA_BASE, cur: D.STAMINA_BASE, fatigue: 0 },
      berries: 0,
      plots: plots,
      animals: [createAnimal('chicken', '小豆'), createAnimal('cow', '奶昔')],
      horse: { owned: false, name: '小棕', riding: false, fed: false, points: 25 },
      dog: { owned: true, name: '小旺', fed: false, guarding: true, points: 25 },
      storage: storage,
      ores: ores,
      tools: { hoe: 0, wateringcan: 0, axe: 0, hammer: 0, sickle: 0, fishingrod: 0, fertilizer: 0, medicine: 0, fence: 0 },
      medicines: emptyMedicines(),
      machines: { cheesemaker: 0, mayomaker: 0, yarnmaker: 0 },   // 0 = 未拥有；1~5 = 机器等级
      build: { barnLevel: 1, beds: false, fenceLevel: 1 },
      seeds: {},
      mine: { spring: 0, lake: 0, current: null, floor: 0, inMine: false, loot: [] },
      helpers: { count: 0, days: 0 },
      grazeHours: 0,
      contestWin: false,
      festivals: { joined: {} },
      forecast: [],
      log: [],
      stats: { harvested: 0, earned: 0, spent: 0, daysPlayed: 1, mined: 0, products: 0, itemsSold: 0 }
    };
  }

  /* ==================== 主对象 ==================== */

  const Game = {
    state: null,
    _subs: [],

    /* ---------- 生命周期 ---------- */

    init() {
      this.state = this.load() || createInitialState();
      if (!this.state.forecast || !this.state.forecast.length) this.generateForecast();
      return this.state;
    },

    subscribe(fn) { this._subs.push(fn); },
    emit(evt, payload) { this._subs.forEach(fn => fn(evt, payload, this.state)); },

    save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); return true; }
      catch (e) { console.warn('保存失败', e); return false; }
    },

    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.version !== 2 || !Array.isArray(data.plots)) return null;
        // 向前兼容补齐
        data.seeds = data.seeds || {};
        data.ores = data.ores || {};
        Object.keys(D.ores).forEach(k => { if (data.ores[k] === undefined) data.ores[k] = 0; });
        data.log = data.log || [];
        data.stats = data.stats || { harvested: 0, earned: 0, spent: 0, daysPlayed: 1, mined: 0, products: 0, itemsSold: 0 };
        data.tools = data.tools || { hoe: 0, wateringcan: 0, axe: 0, hammer: 0, sickle: 0, fishingrod: 0, fertilizer: 0, medicine: 0, fence: 0 };
        data.medicines = data.medicines || {};
        (D.animalMedicines || []).forEach(m => { if (typeof data.medicines[m.type] !== 'number') data.medicines[m.type] = 0; });
        data.machines = data.machines || { cheesemaker: 0, mayomaker: 0, yarnmaker: 0 };
        // 旧存档兼容：布尔 → 等级（true 视为已购 Lv1，false 视为未拥有）
        ['cheesemaker', 'mayomaker', 'yarnmaker'].forEach(k => {
          const v = data.machines[k];
          data.machines[k] = v === true ? 1 : (typeof v === 'number' && v > 0 ? Math.max(1, Math.min(5, Math.round(v))) : 0);
        });
        data.build = data.build || { barnLevel: 1, beds: false };
        data.build.fenceLevel = Math.max(1, Math.min(5, Math.round(Number(data.build.fenceLevel) || 1)));
        data.tools.fence = Math.max(0, Math.min(D.FENCE_MAX, Math.round(Number(data.tools.fence) || 0)));
        data.helpers = data.helpers || { count: 0, days: 0 };
        data.festivals = data.festivals || { joined: {} };
        data.mine = data.mine || { spring: 0, lake: 0, current: null, floor: 0, inMine: false, loot: [] };
        data.disaster = data.disaster || { season: data.season || 0, count: 0, lastDay: 0, last: null, log: [] };
        if (!Array.isArray(data.disaster.log)) data.disaster.log = [];
        data.paused = false;   // 暂停仅用于当代会话（灾难明细弹窗），读档后恢复计时
        return data;
      } catch (e) { console.warn('读档失败', e); return null; }
    },

    reset() { this.state = createInitialState(); this.generateForecast(); this.save(); },
    hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },

    /* ---------- 基础查询 ---------- */

    seasonName() { return D.seasons[this.state.season]; },
    seasonFullName() { return D.seasonFullNames[this.state.season]; },
    seasonIcon() { return D.seasonIcons[this.state.season]; },
    seasonDesc() { return D.seasonDescs[this.state.season]; },
    seasonTheme() { return D.seasonTheme[this.state.season]; },
    yearOf() { return D.getYearForDay(this.state.day); },
    dayOfSeason() { return D.getDayOfSeason(this.state.day); },
    weatherInfo() {
      const w = D.getWeather(this.state.weather);
      return Object.assign({}, w, { name: D.getWeatherName(this.state.weather, this.state.season) });
    },

    timeText() {
      const t = Math.min(Math.floor(this.state.time), D.DAY_END);
      const h = Math.floor(t / 60), m = t % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },

    timePercent() {
      const span = D.DAY_END - D.DAY_START;
      return Math.max(0, Math.min(1, (this.state.time - D.DAY_START) / span));
    },

    /** 推进游戏时间；返回是否触发自动就寝 */
    update(deltaSeconds) {
      const s = this.state;
      if (!s || s.mine.inMine || s.paused) return false;
      s.time += deltaSeconds * D.MINUTES_PER_SECOND;
      if (s.time >= D.DAY_END) { s.time = D.DAY_END; this.sleep(true); return true; }
      return false;
    },

    farmSummary() {
      const plots = this.state.plots;
      return {
        planted: plots.filter(p => p.cropType).length,
        ready: plots.filter(p => p.harvestable).length,
        plowed: plots.filter(p => p.plowed && !p.cropType).length,
        empty: plots.filter(p => !p.plowed).length,
        total: PLOT_COUNT
      };
    },

    animalList() {
      return this.state.animals.map(a => {
        const t = D.animalTypes[a.type];
        return Object.assign({}, a, {
          typeName: t.name, icon: t.icon, product: t.product, productIcon: t.productIcon,
          productPrice: t.basePrice, feedDays: t.feedDays,
          hearts: Math.floor(a.points / 25)
        });
      });
    },

    storageList() {
      const list = [];
      const st = this.state.storage;
      Object.keys(st).forEach(key => {
        const g = st[key];
        const total = D.GRADE_IDS.reduce((n, id) => n + (g[id] || 0), 0);
        if (total <= 0) return;
        const info = D.getStorageInfo(key);
        let value = 0;
        D.GRADE_IDS.forEach(id => { value += Math.floor(info.base * SELL_RATE * D.gradeMultiplier(id)) * (g[id] || 0); });
        list.push({ key: key, name: info.name, icon: info.icon, kind: info.kind, grades: g, total: total, value: value });
      });
      return list;
    },

    storageTotal() { return this.storageList().reduce((n, i) => n + i.total, 0); },

    oreList() {
      return Object.keys(this.state.ores)
        .filter(k => this.state.ores[k] > 0)
        .map(k => ({ key: k, name: D.ores[k].name, icon: D.ores[k].icon, count: this.state.ores[k], value: D.ores[k].value }));
    },

    heartsOf(points) { return Math.floor((points || 0) / 25); },

    animalCareNeeds() {
      const s = this.state;
      const list = s.animals.filter(a => !a.fed || a.sick || !a.grazing);
      return { hungry: s.animals.filter(a => !a.fed).length, sick: s.animals.filter(a => a.sick).length, out: s.animals.filter(a => a.grazing).length, total: s.animals.length };
    },

    todayFestival() { return D.findFestival(this.state.season, this.dayOfSeason()); },

    /* ---------- 体力与时间消耗 ---------- */

    /** 检查能否开始一项劳作 */
    canWork(cost) {
      const st = this.state.stamina;
      if (st.fatigue >= D.FAINT_FATIGUE) return { ok: false, msg: '太累了，先去睡觉吧' };
      return { ok: true };
    },

    /** 扣体力（含透支→疲劳→晕倒判定） */
    spend(cost, timeKey) {
      const s = this.state;
      const st = s.stamina;
      if (st.fatigue >= D.FAINT_FATIGUE) return { ok: false, faint: false, msg: '已经精疲力尽，必须休息了' };

      if (st.cur >= cost) {
        st.cur -= cost;
      } else {
        const over = cost - st.cur;
        st.cur = 0;
        st.fatigue += over * 3;   // 体力透支，疲劳三倍累积
        if (st.fatigue >= D.FAINT_FATIGUE) {
          st.fatigue = D.FAINT_FATIGUE;
          this.faint();
          return { ok: false, faint: true, msg: '体力透支，晕倒了……被送回了床上' };
        }
      }
      if (timeKey && TIME_COST[timeKey]) this.spendTime(TIME_COST[timeKey]);
      return { ok: true, tired: st.cur === 0 };
    },

    spendTime(minutes) {
      const s = this.state;
      if (s.mine.inMine) return;
      s.time = Math.min(D.DAY_END, s.time + minutes);
      if (s.time >= D.DAY_END) this.sleep(true);
    },

    restore(cost, fatigueCut) {
      const st = this.state.stamina;
      st.cur = Math.min(st.max, st.cur + cost);
      if (fatigueCut) st.fatigue = Math.max(0, st.fatigue - fatigueCut);
    },

    /** 晕倒：送医，损失一天与部分金币 */
    faint() {
      const s = this.state;
      const fee = Math.min(s.gold, 200);
      s.gold -= fee;
      s.stamina.fatigue = 0;
      this.pushLog(`第 ${s.day} 天 · 体力透支晕倒，医药费 ${fee}G`);
      this.advanceDay({ fromFaint: true });
      s.stamina.cur = Math.floor(s.stamina.max * 0.6);
      this.save();
      this.emit('faint', { fee: fee });
      return { fee: fee };
    },

    /** 吃东西 / 泡温泉 */
    eat(cost, stamina, fatigueCut) {
      const s = this.state;
      if (s.gold < cost) return { ok: false, msg: '金币不足（需 ' + cost + 'G）' };
      s.gold -= cost;
      s.stats.spent += cost;
      this.restore(stamina, fatigueCut || 0);
      this.spendTime(30);
      this.save();
      return { ok: true, stamina: stamina };
    },

    /* ---------- 每日推进 ---------- */

    advanceDay(opt) {
      const s = this.state;
      const oldSeason = s.season;
      s.day++;
      s.stats.daysPlayed = s.day;

      const newSeason = D.getSeasonForDay(s.day);
      const seasonChanged = newSeason !== s.season;
      if (seasonChanged) {
        s.season = newSeason;
        this.killOutOfSeasonCrops(newSeason);
      }

      this.rollWeather();
      this.ensureSeasonDisaster();          // 每个季节至少 1 次灾难天气（季末保底）
      const effect = this.applyWeatherToFarm();
      this.growCrops();
      const animalResult = this.settleAnimals();
      this.runHelpers();
      this.generateForecast();

      s.time = D.DAY_START;
      const st = s.stamina;
      st.cur = s.build.beds ? st.max : Math.floor(st.max * 0.9);
      st.fatigue = Math.max(0, st.fatigue - (s.build.beds ? 100 : 70));

      const seasonLabel = seasonChanged ? `换季进入${D.seasonFullNames[newSeason]}！` : '';
      this.pushLog(`第 ${s.day} 天 · ${D.seasons[s.season]}${this.dayOfSeason()}日 · ${this.weatherInfo().name} ${seasonLabel}`);
      this.save();
      // 事件载荷必须与返回值一致，否则界面拿不到灾难损失 / 天气事件 / 动物结算结果
      const result = {
        seasonChanged: seasonChanged, oldSeason: oldSeason, newSeason: newSeason,
        weather: this.weatherInfo(), event: s.weatherEvent,
        loss: (s.weatherEvent && s.weatherEvent.loss) || null,
        watered: effect.watered, damaged: effect.damaged,
        animal: animalResult, fromFaint: !!(opt && opt.fromFaint)
      };
      this.emit('day-advanced', result);

      return result;
    },

    /** 睡觉：结算一天 */
    sleep(auto) {
      const s = this.state;
      if (s.mine.inMine) { s.mine.inMine = false; s.mine.current = null; s.mine.floor = 0; }
      s.plots.forEach(p => { if (p.cropType && !p.harvestable) p.waterLevel = Math.max(0, p.waterLevel); });
      const result = this.advanceDay({ autoSleep: !!auto });
      return result;
    },

    killOutOfSeasonCrops(newSeason) {
      const allowed = {};
      D.getCurrentCrops(newSeason).forEach(c => { allowed[c.id] = true; });
      this.state.plots.forEach(p => {
        if (p.cropType && !allowed[p.cropType]) {
          p.cropType = null; p.growthStage = 0; p.maxGrowth = 0;
          p.waterLevel = 0; p.fertilizerLevel = 0; p.harvestable = false; p.regrow = 0;
        }
      });
    },

    /* ---------- 天气 ---------- */

    /** 各季节可能出现的灾难天气：春 暴风雨 / 夏 台风·暴风雨 / 秋 暴风雨 / 冬 暴雪 */
    disasterPool(season) {
      return [[2], [4, 2], [2], [5]][season] || [2];
    },

    /** 依据天气类型生成当日事件：破坏性天气 → 灾难事件（损失比例在结算时抽取） */
    makeWeatherEvent(weather) {
      const wInfo = D.getWeather(weather);
      if (wInfo.effect === 'damage' || wInfo.effect === 'damage-big') {
        return { type: weather, name: wInfo.name, icon: wInfo.icon, disaster: true, level: wInfo.effect === 'damage-big' ? 2 : 1, loss: null };
      }
      if (wInfo.effect === 'drought') return { type: weather, name: wInfo.name, icon: wInfo.icon, level: 0, loss: null };
      return null;
    },

    rollWeather() {
      const s = this.state;
      const season = s.season;
      const r = Math.random();
      let weather = 0;

      if (r < 0.66) weather = 0;
      else if (r < 0.92) weather = 1;
      else {
        const pool = this.disasterPool(season);
        weather = pool[Math.floor(Math.random() * pool.length)];
      }
      s.weather = weather;
      s.weatherEvent = this.makeWeatherEvent(weather);
    },

    /** 灾难保底：每个季节至少出现 1 次灾难天气（季末仍未出现则强制安排） */
    ensureSeasonDisaster() {
      const s = this.state;
      const d = s.disaster || (s.disaster = { season: s.season, count: 0, lastDay: 0, last: null, log: [] });
      if (d.season !== s.season) { d.season = s.season; d.count = 0; }

      if (s.weatherEvent && s.weatherEvent.disaster) { d.count++; d.lastDay = s.day; return s.weatherEvent; }
      if (d.count >= 1) return null;                       // 本季已发生过灾难，不再额外插入

      const dayOfSeason = D.getDayOfSeason(s.day);
      const remain = D.DAYS_PER_SEASON - dayOfSeason;      // 本季剩余天数（不含今天）
      const prayed = !!s.prayedToday; s.prayedToday = false;
      if (prayed && remain > 2) return null;               // 玩家当日祈祷生效，不抢天气（季末保底除外）
      const p = remain <= 2 ? 1 : 0.1 + dayOfSeason * 0.006;
      if (Math.random() >= p) return null;

      const pool = this.disasterPool(s.season);
      const w = pool[Math.floor(Math.random() * pool.length)];
      s.weather = w;
      s.weatherEvent = this.makeWeatherEvent(w);
      if (s.weatherEvent) {
        s.weatherEvent.forced = true;                      // 保底安排
        d.count++; d.lastDay = s.day;
      }
      return s.weatherEvent;
    },

    /** 按受损失地块重算损失明细（温室护苗后调用，保持提示与实际一致） */
    recalcLoss(loss) {
      if (!loss || !Array.isArray(loss.entries)) return loss;
      const detail = {};
      loss.entries.forEach(e => {
        if (!detail[e.id]) detail[e.id] = { id: e.id, name: e.name, icon: e.icon, count: 0 };
        detail[e.id].count++;
      });
      loss.crops = Object.keys(detail).map(k => detail[k]).sort((a, b) => b.count - a.count);
      loss.damaged = loss.entries.length;
      return loss;
    },

    /** 灾难损失摘要文本 */
    lossText(loss) {
      const head = `第 ${loss.day} 天 · ${D.seasons[loss.season]}${loss.dayOfSeason}日 · ${loss.icon}${loss.weather}来袭`;
      if (!loss.damaged) return `${head}：田里没有在种作物，未造成损失`;
      const detail = loss.crops.map(c => `${c.name} ×${c.count}`).join('、');
      return `${head}：在种作物 ${loss.planted} 块，损失 ${loss.damaged} 块（${loss.pct}%）→ ${detail}`;
    },

    applyWeatherToFarm() {
      const s = this.state;
      const w = D.getWeather(s.weather);
      let watered = 0, damaged = 0;

      if (w.effect === 'water') {
        s.plots.forEach(p => { if (p.cropType && !p.harvestable) { p.waterLevel = Math.max(p.waterLevel, 2); watered++; } });
      }

      const ev = s.weatherEvent;
      if (ev && ev.disaster) {
        const growing = [];
        s.plots.forEach((p, i) => { if (p.cropType && !p.harvestable) growing.push({ p: p, i: i }); });
        for (let i = growing.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = growing[i]; growing[i] = growing[j]; growing[j] = tmp;
        }
        // 损失比例 10%~50% 随机；有作物时至少损失 1 块
        const ratio = 0.1 + Math.random() * 0.4;
        const target = growing.length ? Math.max(1, Math.round(growing.length * ratio)) : 0;
        const entries = [];
        growing.slice(0, target).forEach(item => {
          const p = item.p;
          const info = D.getCropInfo(p.cropType) || {};
          entries.push({ index: item.i, id: p.cropType, name: info.name || p.cropType, icon: info.icon || '🌱' });
          p.cropType = null; p.growthStage = 0; p.maxGrowth = 0;
          p.waterLevel = 0; p.fertilizerLevel = 0; p.harvestable = false; p.regrow = 0;
          damaged++;
        });

        const loss = {
          weather: ev.name, icon: ev.icon, weatherId: ev.type, forced: !!ev.forced,
          day: s.day, season: s.season, dayOfSeason: D.getDayOfSeason(s.day),
          ratio: ratio, pct: Math.round(ratio * 100),
          planted: growing.length, damaged: entries.length,
          entries: entries, crops: []
        };
        this.recalcLoss(loss);
        ev.loss = loss;
        if (s.disaster) {
          s.disaster.last = loss;
          s.disaster.log.unshift(loss);
          if (s.disaster.log.length > 12) s.disaster.log.length = 12;
        }
        this.pushLog(this.lossText(loss));
      } else if (ev && ev.level > 0) {
        // 兜底：非灾难渠道产生的破坏性天气（极小概率，兼容旧逻辑）
        const growing = s.plots.filter(p => p.cropType && !p.harvestable);
        growing.slice(0, Math.min(ev.level * 2, growing.length)).forEach(p => {
          p.cropType = null; p.growthStage = 0; p.maxGrowth = 0;
          p.waterLevel = 0; p.fertilizerLevel = 0; p.harvestable = false; p.regrow = 0;
          damaged++;
        });
      }
      return { watered: watered, damaged: damaged };
    },

    /* ---------- 作物生长 ---------- */

    growCrops() {
      const s = this.state;
      const isDrought = D.getWeather(s.weather).effect === 'drought';
      s.plots.forEach(p => {
        if (!p.cropType) return;
        if (p.harvestable) {
          if (p.regrow > 0) {
            p.regrowTimer++;
            if (p.regrowTimer >= p.regrow) { p.regrowTimer = 0; p.harvestable = false; p.growthStage = Math.max(1, p.maxGrowth - 2); }
          }
          return;
        }
        if (isDrought) return;
        if (p.waterLevel > 0) {
          p.waterLevel--;
          const bonus = p.fertilizerLevel > 0 ? 1 : 0;
          if (p.fertilizerLevel > 0) p.fertilizerLevel--;
          p.growthStage += 1 + bonus;
          if (p.growthStage >= p.maxGrowth) { p.growthStage = p.maxGrowth; p.harvestable = true; }
        }
      });
    },

    /* ---------- 动物结算 ---------- */

    settleAnimals() {
      const s = this.state;
      const weather = D.getWeather(s.weather);
      const stormy = weather.effect !== 'none' && weather.effect !== 'drought';
      // 住马厩的动物（马 / 小狗 / 老鹰 / 鸬鹚）不会生病
      const STABLE_IMMUNE = ['horse', 'dog', 'eagle', 'cormorant'];
      let sick = 0, wildDog = 0, produced = 0, recalled = 0;
      // 昨夜仍在外放牧（没有收回）的动物 —— 狼袭结算的目标，先取快照（下面会改 grazing 状态）
      const leftOut = s.animals.filter(a => a.grazing);
      let wolfLost = 0, wolfLostName = '', wolfScare = 0, wolfHeartsLost = 0;

      s.animals.forEach(a => {
        // 放牧结算
        if (a.grazing) {
          a.grazedHours += 5;
          s.grazeHours += 5;
          if (!a.fed) a.fed = true;                 // 放牧满 5 小时当餐免喂
          a.points = Math.min(250, a.points + 5);   // 放牧增加爱心：每次 +5 好感点
          if (stormy) {
            recalled++;
            a.grazing = false;
            if (STABLE_IMMUNE.indexOf(a.type) < 0 && Math.random() < 0.4) { a.sick = true; a.points = Math.max(0, a.points - 5); sick++; }
          }
        }
        // 未喂食扣好感
        if (!a.fed) a.points = Math.max(0, a.points - 1);
        // 产出推进（马厩里的马 / 小狗 / 飞禽不在 animalTypes 中，无产出配置，直接跳过）
        if (a.fed && !a.sick) {
          const t = D.animalTypes[a.type];
          if (!t) return;
          a.produceDays++;
          if (a.produceDays >= t.feedDays) { a.produceReady = true; a.produceDays = 0; produced++; }
        }
        // 生病加重
        if (a.sick) {
          a.daysSick++;
          if (a.daysSick >= 3) { a.points = Math.max(0, a.points - 10); }
        }
        a.fed = false;
      });

      // 过夜未收回：狼袭风险（暴风雨夜动物已被强制召回，不算在外过夜）
      // 狼只觊觎普通放牧动物；住马厩的马 / 小狗 / 飞禽不在猎物范围内，避免读空产出配置
      const lootable = leftOut.filter(a => STABLE_IMMUNE.indexOf(a.type) < 0 && D.animalTypes[a.type]);
      if (lootable.length && !stormy) {
        const guarded = s.dog.owned && s.dog.guarding && s.dog.fed;   // 看门狗吃饱守夜可大幅降低风险
        const risk = guarded ? 0.08 : 0.25;
        if (Math.random() < risk) {
          const victim = lootable[Math.floor(Math.random() * lootable.length)];
          s.animals = s.animals.filter(x => x.id !== victim.id);
          wolfLost = 1;
          wolfLostName = victim.name + '（' + D.animalTypes[victim.type].name + '）';
          this.pushLog('夜里狼闯进牧场，叼走了' + wolfLostName + '——放牧的动物记得天黑前收回');
        } else {
          wolfHeartsLost = 6;
          lootable.forEach(a => { a.points = Math.max(0, a.points - wolfHeartsLost); });
          wolfScare = lootable.length;
          this.pushLog('夜里狼在牧场外徘徊，放牧未收回的 ' + wolfScare + ' 只动物受了惊吓，爱心 -' + wolfHeartsLost);
        }
      }
      if (!s.dog.guarding || !s.dog.fed) {
        // 围栏等级越高越坚固：Lv1~2 为 0.08，Lv3~4 降到 0.06，Lv5 降到 0.04
        const fenceLv = Math.max(1, Math.min(5, Math.round(Number(s.build.fenceLevel) || 1)));
        const risk = s.tools.fence > 0 ? (fenceLv >= 5 ? 0.04 : (fenceLv >= 3 ? 0.06 : 0.08)) : 0.22;
        if (Math.random() < risk && s.animals.length) {
          const target = s.animals[Math.floor(Math.random() * s.animals.length)];
          target.points = Math.max(0, target.points - 5);
          wildDog = 1;
        }
      }
      if (s.horse.owned && s.horse.fed) s.horse.fed = false;
      if (s.dog.owned && s.dog.fed) s.dog.fed = false;

      return {
        sick: sick, wildDog: wildDog, produced: produced, recalled: recalled,
        grazed: s.animals.filter(a => a.grazing).length,
        leftOut: leftOut.length,          // 过夜未收回的动物数
        wolfLost: wolfLost,               // 1 = 被狼叼走 1 只
        wolfLostName: wolfLostName,
        wolfScare: wolfScare,             // 未损失但受惊降爱心的动物数
        wolfHeartsLost: wolfHeartsLost    // 每只降低的爱心点数
      };
    },

    runHelpers() {
      const s = this.state;
      if (!s.helpers || s.helpers.days <= 0) return;
      let n = 0;
      s.plots.forEach(p => { if (p.cropType && !p.harvestable) { p.waterLevel = Math.min(p.waterLevel + 1, 3); n++; } });
      s.helpers.days--;
      if (n) this.pushLog(`${D.dwarfConfig.name}帮忙浇了 ${n} 块地`);
    },

    /* ---------- 精准产出分级 ---------- */

    computeGrade(points) {
      const s = this.state;
      const hearts = Math.floor(points / 25);
      const hours = s.grazeHours;
      if (hearts >= 8 && s.contestWin && hours >= 547 && Math.random() < 1 / 255) return 'X';
      if (hearts >= 8 && s.contestWin && hours >= 547) return 'P';
      if (hearts >= 8 && s.contestWin) return 'G';
      if (hearts >= 8) return 'L';
      if (hearts >= 4) return 'M';
      return 'S';
    },

    gradeHint() {
      const s = this.state;
      const hours = s.grazeHours;
      const lines = [];
      lines.push(`爱心 1~3 → S；4~7 → M；8 以上 → L`);
      lines.push(s.contestWin ? '已夺得祭典冠军，G 级解锁' : '祭典夺冠后解锁 G 级');
      lines.push(`放牧累计 ${hours} / 547 小时${hours >= 547 ? '（P 级条件达成）' : ''}`);
      lines.push('P 条件达成后，每次收取有 1/255 概率产出 X 级');
      return lines;
    },

    /* ---------- 农田操作 ---------- */

    plow(index) {
      const s = this.state;
      const p = s.plots[index];
      if (!p || p.cropType || p.plowed) return { ok: false, msg: '这块地不用开垦' };
      const chk = this.spend(D.staminaCosts.plow, 'plow');
      if (!chk.ok) return chk;
      p.plowed = true;

      // 高等级锄头连带开垦
      const range = D.tools.hoe.range[s.tools.hoe] || 1;
      let extra = 0;
      if (range > 1) {
        const r = Math.floor(Math.sqrt(range) / 2);
        const row = Math.floor(index / 6), col = index % 6;
        for (let dr = -r; dr <= r; dr++) {
          for (let dc = -r; dc <= r; dc++) {
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr > 3 || nc < 0 || nc > 5) continue;
            const np = s.plots[nr * 6 + nc];
            if (np && !np.plowed && !np.cropType) { np.plowed = true; extra++; }
          }
        }
      }
      this.save();
      return { ok: true, extra: extra, range: range };
    },

    plowAll() {
      const s = this.state;
      let n = 0;
      s.plots.forEach(p => { if (!p.plowed && !p.cropType) { p.plowed = true; n++; } });
      if (!n) return { ok: false, msg: '已经没有荒地了' };
      const chk = this.spend(Math.min(n * 2, 20), 'plow');
      if (!chk.ok) return chk;
      this.save();
      return { ok: true, count: n };
    },

    plant(index, cropId) {
      const s = this.state;
      const p = s.plots[index];
      const crop = D.getCropInfo(cropId);
      if (!p || !crop || p.cropType || !p.plowed) return { ok: false, msg: '需要先耕地' };
      if (crop.id !== undefined && D.getCurrentCrops(s.season).indexOf(crop) < 0) return { ok: false, msg: '这个季节不能种' };

      let fromBag = false;
      if (s.seeds[crop.id] > 0) { s.seeds[crop.id]--; fromBag = true; }
      else if (s.gold < crop.seedPrice) return { ok: false, msg: '金币不足（种子 ' + crop.seedPrice + 'G）' };
      else { s.gold -= crop.seedPrice; s.stats.spent += crop.seedPrice; }

      const chk = this.spend(D.staminaCosts.plant, 'plant');
      if (!chk.ok) return chk;

      p.cropType = crop.id;
      p.growthStage = 0;
      p.maxGrowth = crop.growthDays;
      p.waterLevel = 1;
      p.fertilizerLevel = 0;
      p.harvestable = false;
      p.regrow = crop.regrow || 0;
      p.regrowTimer = 0;
      this.save();
      return { ok: true, crop: crop, fromBag: fromBag };
    },

    buySeed(cropId, qty) {
      const s = this.state;
      const crop = D.getCropInfo(cropId);
      if (!crop) return { ok: false, msg: '没有这种种子' };
      const n = Math.max(1, qty || 1);
      const cost = crop.seedPrice * n;
      if (s.gold < cost) return { ok: false, msg: '金币不足（需 ' + cost + 'G）' };
      s.gold -= cost; s.stats.spent += cost;
      s.seeds[cropId] = (s.seeds[cropId] || 0) + n;
      this.save();
      return { ok: true, crop: crop, qty: n, cost: cost };
    },

    water(index) {
      const s = this.state;
      const p = s.plots[index];
      if (!p || !p.cropType || p.harvestable) return { ok: false, msg: '这里不需要浇水' };
      if (p.waterLevel >= 3) return { ok: false, msg: '水分已经很足了' };
      const chk = this.spend(D.staminaCosts.water, 'water');
      if (!chk.ok) return chk;
      p.waterLevel = Math.min(p.waterLevel + 1, 3);

      const range = D.tools.wateringcan.range[s.tools.wateringcan] || 1;
      let extra = 0;
      if (range > 1) {
        const r = Math.floor(Math.sqrt(range) / 2);
        const row = Math.floor(index / 6), col = index % 6;
        for (let dr = -r; dr <= r; dr++) {
          for (let dc = -r; dc <= r; dc++) {
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr > 3 || nc < 0 || nc > 5) continue;
            const np = s.plots[nr * 6 + nc];
            if (np && np.cropType && !np.harvestable && np.waterLevel < 3) { np.waterLevel = Math.min(np.waterLevel + 1, 3); extra++; }
          }
        }
      }
      this.save();
      return { ok: true, extra: extra, range: range };
    },

    fertilize(index) {
      const s = this.state;
      const p = s.plots[index];
      if (!p || !p.cropType || p.harvestable) return { ok: false, msg: '没有可施肥的作物' };
      const useItem = s.tools.fertilizer > 0;
      const cost = 30;
      if (!useItem && s.gold < cost) return { ok: false, msg: '金币不足（需 ' + cost + 'G）' };
      if (useItem) s.tools.fertilizer--;
      else { s.gold -= cost; s.stats.spent += cost; }
      const chk = this.spend(D.staminaCosts.fertilize, 'fertilize');
      if (!chk.ok) return chk;
      p.fertilizerLevel = Math.min(p.fertilizerLevel + 1, 3);
      this.save();
      return { ok: true };
    },

    harvest(index) {
      const s = this.state;
      const p = s.plots[index];
      if (!p || !p.harvestable) return { ok: false };

      const crop = D.getCropInfo(p.cropType);
      const grade = this.computeGrade(120);   // 作物按爱心 5 心 → M 上下浮动
      const chk = this.spend(D.staminaCosts.harvest, 'harvest');
      if (!chk.ok) return chk;

      if (crop) {
        this.stAdd(crop.id, grade, 1);
        s.stats.harvested++;
      }
      if (p.regrow > 0) {
        p.harvestable = false;
        p.regrowTimer = 0;
        p.growthStage = Math.max(1, p.maxGrowth - 2);
      } else {
        const plowed = p.plowed;
        s.plots[index] = createPlot(index);
        s.plots[index].plowed = plowed;
      }
      this.save();
      return { ok: true, crop: crop, grade: grade };
    },

    harvestAll() {
      const s = this.state;
      let count = 0, stamina = 0;
      const grades = {};
      s.plots.slice().forEach((p, i) => {
        if (!p.harvestable) return;
        const crop = D.getCropInfo(p.cropType);
        const grade = this.computeGrade(120);
        if (crop) { this.stAdd(crop.id, grade, 1); s.stats.harvested++; grades[grade] = (grades[grade] || 0) + 1; }
        if (p.regrow > 0) { p.harvestable = false; p.regrowTimer = 0; p.growthStage = Math.max(1, p.maxGrowth - 2); }
        else { const plowed = p.plowed; s.plots[i] = createPlot(i); s.plots[i].plowed = plowed; }
        count++; stamina += D.staminaCosts.harvest;
      });
      if (!count) return { ok: false, msg: '还没有成熟的作物' };
      const chk = this.spend(stamina, 'harvest');
      if (!chk.ok) return chk;
      this.save();
      return { ok: true, count: count, grades: grades };
    },

    waterAll() {
      const s = this.state;
      const targets = s.plots.filter(p => p.cropType && !p.harvestable && p.waterLevel < 3);
      if (!targets.length) return { ok: false, msg: '没有需要浇水的作物' };
      const chk = this.spend(targets.length * D.staminaCosts.water, 'water');
      if (!chk.ok) return chk;
      targets.forEach(p => { p.waterLevel = Math.min(p.waterLevel + 1, 3); });
      this.save();
      return { ok: true, count: targets.length };
    },

    /* ---------- 动物操作 ---------- */

    feedAnimal(id) {
      const a = this.state.animals.find(x => x.id === id);
      if (!a || a.fed) return { ok: false, msg: '它刚刚吃过' };
      a.fed = true;
      a.points = Math.min(250, a.points + 1);
      this.save();
      return { ok: true, name: a.name };
    },

    feedAllAnimals() {
      const s = this.state;
      let n = 0;
      s.animals.forEach(a => { if (!a.fed) { a.fed = true; a.points = Math.min(250, a.points + 1); n++; } });
      if (!n) return { ok: false, msg: '所有动物都吃饱了' };
      const chk = this.spend(n, 'feed');
      if (!chk.ok) return chk;
      this.save();
      return { ok: true, count: n };
    },

    brushAnimal(id) {
      const s = this.state;
      const a = s.animals.find(x => x.id === id);
      if (!a) return { ok: false };
      const chk = this.spend(D.staminaCosts.brush, 'brush');
      if (!chk.ok) return chk;
      a.points = Math.min(250, a.points + 1);
      this.save();
      return { ok: true, name: a.name, hearts: this.heartsOf(a.points) };
    },

    talkAnimal(id) {
      const s = this.state;
      const a = s.animals.find(x => x.id === id);
      if (!a) return { ok: false };
      a.points = Math.min(250, a.points + 1);
      this.spendTime(1);
      this.save();
      return { ok: true, name: a.name, hearts: this.heartsOf(a.points) };
    },

    /** 用药：优先消耗该动物的专属药（旧存档遗留的通用药作为万能药兜底） */
    useMedicine(id) {
      const s = this.state;
      const a = s.animals.find(x => x.id === id);
      if (!a) return { ok: false, msg: '没有这只动物' };
      if (!a.sick) return { ok: false, msg: a.name + ' 没有生病' };
      const med = D.medicineFor(a.type);
      s.medicines = s.medicines || {};
      let used = '';
      if ((s.tools.medicine || 0) > 0) {
        s.tools.medicine--;
        used = '通用药';
      } else if (med && (s.medicines[med.type] || 0) > 0) {
        s.medicines[med.type]--;
        used = med.name;
      } else {
        return { ok: false, msg: '没有' + (med ? med.name : '对应药品') + '，请先到商店购买' + (med ? '（' + med.price + 'G）' : '') };
      }
      a.sick = false; a.daysSick = 0;
      a.points = Math.min(250, a.points + 2);   // 康复后心情好转
      this.pushLog(`${a.name} 服用了${used}，恢复了健康`);
      this.save();
      return { ok: true, name: a.name, med: used, hearts: this.heartsOf(a.points) };
    },

    collectAnimal(id) {
      const s = this.state;
      const a = s.animals.find(x => x.id === id);
      if (!a || !a.produceReady) return { ok: false, msg: '暂时没有产物' };
      const t = D.animalTypes[a.type];
      const grade = this.computeGrade(a.points);
      this.stAdd(t.productKey, grade, 1);
      a.produceReady = false;
      a.produceDays = 0;
      s.stats.products++;
      this.save();
      return { ok: true, name: a.name, product: t.product, icon: t.productIcon, grade: grade, hearts: this.heartsOf(a.points) };
    },

    collectAllAnimals() {
      const s = this.state;
      const got = [];
      s.animals.forEach(a => {
        if (!a.produceReady) return;
        const t = D.animalTypes[a.type];
        const grade = this.computeGrade(a.points);
        this.stAdd(t.productKey, grade, 1);
        a.produceReady = false; a.produceDays = 0; s.stats.products++;
        got.push({ name: a.name, icon: t.productIcon, grade: grade });
      });
      if (!got.length) return { ok: false, msg: '暂时没有可收取的产物' };
      this.save();
      return { ok: true, items: got };
    },

    grazeOut() {
      const s = this.state;
      const w = D.getWeather(s.weather);
      if (w.effect !== 'none') return { ok: false, msg: '今天天气不好，不适合放牧（' + this.weatherInfo().name + '）' };
      if (!s.animals.length) return { ok: false, msg: '还没有动物' };
      const chk = this.spend(D.staminaCosts.graze, 'graze');
      if (!chk.ok) return chk;
      s.animals.forEach(a => { a.grazing = true; });
      this.save();
      return { ok: true, count: s.animals.length };
    },

    grazeIn() {
      const s = this.state;
      const n = s.animals.filter(a => a.grazing).length;
      if (!n) return { ok: false, msg: '动物都在小屋里' };
      s.animals.forEach(a => { a.grazing = false; });
      this.save();
      return { ok: true, count: n };
    },

    feedDog() {
      const d = this.state.dog;
      if (d.fed) return { ok: false, msg: d.name + ' 刚吃过' };
      d.fed = true;
      d.points = Math.min(250, d.points + 2);
      const chk = this.spend(1, 'feed');
      if (!chk.ok) return chk;
      this.save();
      return { ok: true };
    },

    toggleGuarding() {
      const d = this.state.dog;
      d.guarding = !d.guarding;
      this.save();
      return { ok: true, guarding: d.guarding };
    },

    /* ---------- 马厩 ---------- */

    toggleRide() {
      const s = this.state;
      const h = s.horse;
      if (!h.owned) return { ok: false, msg: '还没有马，去商店购买吧（5000G）' };
      h.riding = !h.riding;
      if (h.riding) { h.points = Math.min(250, h.points + 1); this.spendTime(5); }
      this.save();
      return { ok: true, riding: h.riding };
    },

    feedHorse() {
      const s = this.state;
      const h = s.horse;
      if (!h.owned) return { ok: false, msg: '还没有马' };
      if (h.fed) return { ok: false, msg: '小棕刚吃过' };
      h.fed = true;
      h.points = Math.min(250, h.points + 2);
      const chk = this.spend(1, 'feed');
      if (!chk.ok) return chk;
      this.save();
      return { ok: true };
    },

    brushHorse() {
      const h = this.state.horse;
      if (!h.owned) return { ok: false, msg: '还没有马' };
      const chk = this.spend(D.staminaCosts.brush, 'brush');
      if (!chk.ok) return chk;
      h.points = Math.min(250, h.points + 1);
      this.save();
      return { ok: true, hearts: this.heartsOf(h.points) };
    },

    /* ---------- 商店 ---------- */

    buy(itemId) {
      const s = this.state;
      const item = D.shopItems.find(i => i.id === itemId);
      const animalPrices = { buy_chicken: 'chicken', buy_cow: 'cow', buy_sheep: 'sheep', buy_anjela: 'anjela', buy_horse: 'horse' };

      // 动物专属药：买下后进入药品库存（按动物类型计），在牧场对生病动物使用
      const med = D.medicineById[itemId];
      if (med) {
        if (s.gold < med.price) return { ok: false, msg: '金币不足（需 ' + med.price + 'G）' };
        s.gold -= med.price; s.stats.spent += med.price;
        s.medicines = s.medicines || {};
        s.medicines[med.type] = (s.medicines[med.type] || 0) + 1;
        this.save();
        return { ok: true, label: med.name + '（' + D.animalTypes[med.type].name + '专用，库存 ' + s.medicines[med.type] + ' 支）' };
      }

      if (animalPrices[itemId]) {
        const type = animalPrices[itemId];
        if (type === 'horse') {
          if (s.horse.owned) return { ok: false, msg: '已经有一匹马了' };
          if (s.gold < 5000) return { ok: false, msg: '金币不足（需 5000G）' };
          s.gold -= 5000; s.stats.spent += 5000;
          s.horse.owned = true; s.horse.name = '小棕';
          this.save();
          return { ok: true, label: '小棕（马）' };
        }
        const t = D.animalTypes[type];
        const capacity = s.build.barnLevel === 1 ? 4 : 8;
        if (s.animals.length >= capacity) return { ok: false, msg: '动物小屋已满（上限 ' + capacity + '），请先扩建' };
        if (s.gold < t.buyPrice) return { ok: false, msg: '金币不足（需 ' + t.buyPrice + 'G）' };
        s.gold -= t.buyPrice; s.stats.spent += t.buyPrice;
        const name = ANIMAL_NAMES[s.animals.length % ANIMAL_NAMES.length];
        s.animals.push(createAnimal(type, name));
        this.save();
        return { ok: true, label: name + '（' + t.name + '）' };
      }

      if (!item) return { ok: false, msg: '商品不存在' };
      if (itemId === 'fence' && (s.tools.fence || 0) >= D.FENCE_MAX) {
        return { ok: false, msg: '围栏已达上限（最多 ' + D.FENCE_MAX + ' 段）' };
      }
      if (item.category === 'machine' && s.machines[itemId]) return { ok: false, msg: '已经拥有这台机器了' };
      if (itemId === 'barn' && s.build.barnLevel >= 2) return { ok: false, msg: '小屋已经扩建过了' };
      if (itemId === 'bed' && s.build.beds) return { ok: false, msg: '已经有大床了' };
      if (s.gold < item.price) return { ok: false, msg: '金币不足（需 ' + item.price + 'G）' };

      s.gold -= item.price;
      s.stats.spent += item.price;
      switch (itemId) {
        case 'fertilizer': s.tools.fertilizer = (s.tools.fertilizer || 0) + 1; break;
        case 'medicine':   s.tools.medicine = (s.tools.medicine || 0) + 1; break;
        case 'fence':      s.tools.fence = Math.min(D.FENCE_MAX, (s.tools.fence || 0) + 1); break;
        case 'cheesemaker': s.machines.cheesemaker = 1; break;
        case 'mayomaker':   s.machines.mayomaker = 1; break;
        case 'yarnmaker':   s.machines.yarnmaker = 1; break;
        case 'barn':        s.build.barnLevel = 2; break;
        case 'bed':         s.build.beds = true; break;
        case 'feed':
          s.animals.forEach(a => { a.fed = true; a.points = Math.min(250, a.points + 1); });
          if (s.horse.owned) s.horse.fed = true;
          if (s.dog.owned) s.dog.fed = true;
          break;
        default: break;
      }
      this.save();
      return { ok: true, label: item.name };
    },

    /* ---------- 工具升级 ---------- */

    upgradeTool(key) {
      const s = this.state;
      const tool = D.tools[key];
      if (!tool) return { ok: false, msg: '没有这件工具' };
      const cur = s.tools[key] || 0;
      if (cur >= 5) return { ok: false, msg: tool.name + ' 已经是贤者级' };
      const recipe = D.getUpgradeRecipe(cur + 1);
      if (!recipe) return { ok: false, msg: '无法继续升级' };
      if ((s.ores[recipe.ore] || 0) < recipe.count) {
        return { ok: false, msg: `${D.ores[recipe.ore].name} 不足（需 ${recipe.count}，现有 ${s.ores[recipe.ore] || 0}）` };
      }
      if (s.gold < recipe.cost) return { ok: false, msg: '金币不足（需 ' + recipe.cost + 'G）' };
      s.ores[recipe.ore] -= recipe.count;
      s.gold -= recipe.cost;
      s.stats.spent += recipe.cost;
      s.tools[key] = cur + 1;
      this.save();
      return { ok: true, tool: tool.name, level: D.toolLevels[cur + 1] };
    },

    /* ---------- 围栏 / 加工机升级（最高 5 级） ---------- */

    /** 围栏等级（1~5，随存档记录，缺省 1） */
    fenceLevel() {
      return Math.max(1, Math.min(5, Math.round(Number(this.state.build.fenceLevel) || 1)));
    },

    /** 加工机等级（0 = 未拥有，1~5 = 等级） */
    machineLevel(id) {
      const v = Number(this.state.machines[id]) || 0;
      return v > 0 ? Math.max(1, Math.min(5, Math.round(v))) : 0;
    },

    /** 通用升级校验：kind = 'fence' | 'machine'，cur = 当前等级 */
    checkStructureUpgrade(kind, cur) {
      const s = this.state;
      if (cur >= 5) return { ok: false, msg: '已经是最高等级 Lv.5 了' };
      const rule = D.getStructureUpgrade(kind, cur + 1);
      if (!rule) return { ok: false, msg: '无法继续升级' };
      for (let i = 0; i < rule.ores.length; i++) {
        const need = rule.ores[i];
        const have = s.ores[need.ore] || 0;
        if (have < need.count) {
          return { ok: false, msg: D.ores[need.ore].name + ' 不足（需 ' + need.count + '，现有 ' + have + '）' };
        }
      }
      if (s.gold < rule.cost) return { ok: false, msg: '金币不足（需 ' + rule.cost + 'G）' };
      return { ok: true, rule: rule };
    },

    /** 扣除升级所需金币与矿石 */
    payStructureUpgrade(rule) {
      const s = this.state;
      rule.ores.forEach(need => { s.ores[need.ore] -= need.count; });
      s.gold -= rule.cost;
      s.stats.spent += rule.cost;
    },

    /** 升级加工机：cheesemaker / mayomaker / yarnmaker */
    upgradeMachine(id) {
      const s = this.state;
      const item = D.shopItems.find(x => x.id === id && x.category === 'machine');
      if (!item) return { ok: false, msg: '没有这台机器' };
      const cur = this.machineLevel(id);
      if (!cur) return { ok: false, msg: '还没有这台机器，请先去商店购买' };
      const chk = this.checkStructureUpgrade('machine', cur);
      if (!chk.ok) return chk;
      this.payStructureUpgrade(chk.rule);
      s.machines[id] = cur + 1;
      this.save();
      return { ok: true, machine: item.name, level: cur + 1, levelName: D.structureLevelName(cur + 1) };
    },

    /** 升级围栏（需先拥有至少一段围栏） */
    upgradeFence() {
      const s = this.state;
      if (!(s.tools.fence > 0)) return { ok: false, msg: '还没有围栏，请先去商店修建一段围栏' };
      const cur = this.fenceLevel();
      const chk = this.checkStructureUpgrade('fence', cur);
      if (!chk.ok) return chk;
      this.payStructureUpgrade(chk.rule);
      s.build.fenceLevel = cur + 1;
      this.save();
      return { ok: true, machine: '牧场围栏', level: cur + 1, levelName: D.structureLevelName(cur + 1) };
    },

    /* ---------- 矿洞 ---------- */

    mineOpen(key) {
      const m = D.mines[key];
      if (!m) return false;
      return m.openSeason === null || this.state.season === m.openSeason;
    },

    enterMine(key) {
      const s = this.state;
      if (!this.mineOpen(key)) return { ok: false, msg: D.mines[key].name + ' 冬季结冰后才能进入' };
      const deepest = s.mine[key] || 0;
      s.mine.inMine = true;
      s.mine.current = key;
      s.mine.floor = Math.max(1, deepest);
      s.mine.loot = [];
      this.save();
      return { ok: true, floor: s.mine.floor, name: D.mines[key].name, deepest: deepest };
    },

    digMine(layers) {
      const s = this.state;
      if (!s.mine.inMine) return { ok: false, msg: '还没有进入矿洞' };
      const cfg = D.mines[s.mine.current];
      const n = Math.max(1, layers || 1);
      const cost = D.staminaCosts.mine * n;
      const chk = this.spend(cost);
      if (!chk.ok) return { ok: false, faint: chk.faint, msg: chk.msg || '体力不足，无法继续挖掘' };

      const found = [];
      for (let i = 0; i < n; i++) {
        if (s.mine.floor >= cfg.maxFloor) break;
        s.mine.floor++;
        s.stats.mined++;
        const loot = this.rollLoot(s.mine.floor);
        if (loot) {
          if (loot === 'powerberry') {
            if (s.berries < D.BERRY_MAX) {
              s.berries++;
              s.stamina.max += D.STAMINA_PER_BERRY;
              s.stamina.cur += D.STAMINA_PER_BERRY;
              found.push({ key: 'powerberry', icon: D.ores.powerberry.icon, name: '力之果实（体力上限 +10）' });
            }
          } else {
            s.ores[loot] = (s.ores[loot] || 0) + 1;
            found.push({ key: loot, icon: D.ores[loot].icon, name: D.ores[loot].name });
          }
          s.mine.loot.push(loot);
        }
      }
      if (s.mine.floor > (s.mine[s.mine.current] || 0)) s.mine[s.mine.current] = s.mine.floor;
      this.spendTime(30 * n);
      this.save();
      return { ok: true, floor: s.mine.floor, found: found, max: cfg.maxFloor };
    },

    rollLoot(floor) {
      const pool = [];
      Object.keys(D.ores).forEach(k => {
        const o = D.ores[k];
        if (floor < o.minFloor) return;
        const depthBonus = Math.min(3, Math.floor(floor / 30));
        let w = o.weight + (k === 'copper' ? 0 : depthBonus);
        if (k === 'powerberry' && this.state.berries >= D.BERRY_MAX) w = 0;
        if (w > 0) pool.push({ key: k, w: w });
      });
      if (!pool.length) return null;
      const total = pool.reduce((n, p) => n + p.w, 0);
      let r = Math.random() * total;
      for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) return pool[i].key; }
      return pool[pool.length - 1].key;
    },

    leaveMine() {
      const s = this.state;
      s.mine.inMine = false;
      s.mine.current = null;
      s.mine.floor = 0;
      this.spendTime(30);
      this.save();
      return { ok: true };
    },

    /* ---------- 加工链 ---------- */

    process(key) {
      const s = this.state;
      const map = { milk: { machine: 'cheesemaker', out: 'cheese', label: '奶酪' }, egg: { machine: 'mayomaker', out: 'mayonnaise', label: '蛋黄酱' }, wool: { machine: 'yarnmaker', out: 'yarn', label: '毛线球' } };
      const rule = map[key];
      if (!rule) return { ok: false, msg: '这种产物无法加工' };
      if (!s.machines[rule.machine]) return { ok: false, msg: '还没有对应的加工机，去商店购买吧' };
      const g = s.storage[key];
      if (!g) return { ok: false, msg: '库存里没有这种产物' };
      let grade = null;
      for (let i = D.GRADE_IDS.length - 1; i >= 0; i--) { const id = D.GRADE_IDS[i]; if (g[id] > 0) { grade = id; break; } }
      if (!grade) return { ok: false, msg: '库存里没有这种产物' };
      const chk = this.spend(D.staminaCosts.process, 'process');
      if (!chk.ok) return chk;
      g[grade]--;
      this.stAdd(rule.out, grade, 1);
      // 机器等级加成：Lv3 起加工时有概率额外产出一件（Lv3 20% / Lv4 40% / Lv5 60%）
      const mLv = this.machineLevel(rule.machine);
      const bonus = mLv >= 5 ? 0.6 : (mLv >= 4 ? 0.4 : (mLv >= 3 ? 0.2 : 0));
      let extra = 0;
      if (bonus > 0 && Math.random() < bonus) { this.stAdd(rule.out, grade, 1); extra = 1; }
      this.save();
      return { ok: true, label: rule.label, grade: grade, level: mLv, extra: extra };
    },

    /* ---------- 节日与祭典 ---------- */

    joinFestival() {
      const s = this.state;
      const f = this.todayFestival();
      if (!f) return { ok: false, msg: '今天没有节日' };
      const key = s.season + '-' + f.day;
      if (s.festivals.joined[key]) return { ok: false, msg: '今天已经参加过 ' + f.name + ' 了' };

      s.festivals.joined[key] = true;
      const r = f.reward || {};
      const parts = [];
      if (r.gold) { s.gold += r.gold; s.stats.earned += r.gold; parts.push('+' + r.gold + 'G'); }
      if (r.hearts) {
        s.animals.forEach(a => { a.points = Math.min(250, a.points + r.hearts); });
        if (s.horse.owned) s.horse.points = Math.min(250, s.horse.points + r.hearts);
        s.dog.points = Math.min(250, s.dog.points + r.hearts);
        parts.push('动物全体爱心 +' + r.hearts + ' 点');
      }
      if (r.seed) { s.seeds[r.seed] = (s.seeds[r.seed] || 0) + (r.count || 1); parts.push(D.getCropInfo(r.seed).name + '种子 ×' + (r.count || 1)); }
      if (r.contest && !s.contestWin) { s.contestWin = true; parts.push('夺得冠军，产物等级解锁 G！'); }
      this.spendTime(180);
      this.save();
      return { ok: true, name: f.name, parts: parts };
    },

    /* ---------- 小矮人助手 ---------- */

    hireDwarf() {
      const s = this.state;
      const cost = D.dwarfConfig.hireCost;
      if (s.gold < cost) return { ok: false, msg: '金币不足（需 ' + cost + 'G）' };
      s.gold -= cost; s.stats.spent += cost;
      s.helpers.count = Math.min(7, (s.helpers.count || 0) + 1);
      s.helpers.days = 3;
      this.save();
      return { ok: true, count: s.helpers.count, days: s.helpers.days };
    },

    /* ---------- 仓库 ---------- */

    stAdd(key, grade, n) {
      const s = this.state;
      if (!s.storage[key]) s.storage[key] = emptyGrades();
      if (!s.storage[key][grade]) s.storage[key][grade] = 0;
      s.storage[key][grade] += (n || 1);
    },

    stTake(key, grade, n) {
      const s = this.state;
      const g = s.storage[key];
      if (!g || !g[grade] || g[grade] < n) return false;
      g[grade] -= n;
      return true;
    },

    /* ---------- 出售 ---------- */

    sell(key, grade, qty) {
      const s = this.state;
      const info = D.getStorageInfo(key);
      const g = s.storage[key];
      if (!g) return { ok: false, msg: '库存不足' };
      const have = grade ? (g[grade] || 0) : D.GRADE_IDS.reduce((n, id) => n + g[id], 0);
      const n = Math.min(qty || have, have);
      if (n <= 0) return { ok: false, msg: '库存不足' };

      let gain = 0, sold = 0;
      D.GRADE_IDS.forEach(id => {
        if (grade && id !== grade) return;
        const avail = Math.min(g[id], n - sold);
        if (avail > 0) {
          gain += Math.floor(info.base * SELL_RATE * D.gradeMultiplier(id)) * avail;
          g[id] -= avail;
          sold += avail;
        }
      });
      if (!sold) return { ok: false, msg: '库存不足' };
      s.gold += gain;
      s.stats.earned += gain;
      s.stats.itemsSold += sold;
      this.save();
      return { ok: true, name: info.name, qty: sold, gain: gain };
    },

    sellAllKey(key) {
      const g = this.state.storage[key];
      if (!g) return { ok: false, msg: '库存不足' };
      const total = D.GRADE_IDS.reduce((n, id) => n + g[id], 0);
      return this.sell(key, null, total);
    },

    sellEverything() {
      const s = this.state;
      let qty = 0, gain = 0;
      Object.keys(s.storage).forEach(key => {
        const g = s.storage[key];
        const info = D.getStorageInfo(key);
        D.GRADE_IDS.forEach(id => {
          if (g[id] > 0) {
            gain += Math.floor(info.base * SELL_RATE * D.gradeMultiplier(id)) * g[id];
            qty += g[id];
            g[id] = 0;
          }
        });
      });
      if (!qty) return { ok: false, msg: '仓库空空如也' };
      s.gold += gain; s.stats.earned += gain; s.stats.itemsSold += qty;
      this.save();
      return { ok: true, qty: qty, gain: gain };
    },

    sellOres() {
      const s = this.state;
      let gain = 0, qty = 0;
      Object.keys(s.ores).forEach(k => {
        if (k === 'powerberry') return;
        if (s.ores[k] > 0) { gain += D.ores[k].value * s.ores[k]; qty += s.ores[k]; s.ores[k] = 0; }
      });
      if (!qty) return { ok: false, msg: '没有可出售的矿石' };
      s.gold += gain; s.stats.earned += gain;
      this.save();
      return { ok: true, qty: qty, gain: gain };
    },

    /* ---------- 天气预报（未来 5 天） ---------- */

    generateForecast() {
      const s = this.state;
      const out = [];
      let seed = (s.day * 7919 + s.season * 131 + 17) % 2147483647;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

      for (let i = 1; i <= 5; i++) {
        const day = s.day + i;
        const season = D.getSeasonForDay(day);
        const dayOfSeason = D.getDayOfSeason(day);
        const r = rnd();
        let w = 0;
        if (r < 0.62) w = 0;
        else if (r < 0.86) w = 1;
        else {
          const pool = [[2], [3, 4], [2], [5]][season] || [2];
          w = pool[Math.floor(rnd() * pool.length) % pool.length];
        }
        out.push({
          day: day, dayOfSeason: dayOfSeason, season: season, weather: w,
          name: D.getWeatherName(w, season), icon: D.getWeather(w).icon,
          festival: D.findFestival(season, dayOfSeason)
        });
      }
      s.forecast = out;
      return out;
    },

    /* ---------- 日志 ---------- */

    pushLog(text) {
      const s = this.state;
      s.log.unshift(text);
      if (s.log.length > 30) s.log.pop();
    }
  };

  return Game;
})();
