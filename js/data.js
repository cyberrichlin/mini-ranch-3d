/**
 * data.js —— 静态游戏数据配置（v2 · 矿石镇化）
 * 作物 / 天气 / 动物 / 产物分级 / 工具升级 / 矿洞 / 节日 / 商店。
 * 纯数据层，不接触 DOM，也不接触状态。
 */
window.GAME_DATA = (function () {
  'use strict';

  const DAYS_PER_SEASON = 30;   // 每季 30 天
  const DAY_START = 360;        // 6:00（以分钟计）
  const DAY_END = 1320;         // 22:00
  const MINUTES_PER_SECOND = 6; // 现实 1 秒 = 游戏 6 分钟（一天约 160 秒）

  const seasons = ['春', '夏', '秋', '冬'];
  const seasonIcons = ['🌸', '☀️', '🍂', '❄️'];
  const seasonFullNames = ['春季', '夏季', '秋季', '冬季'];
  const seasonDescs = [
    '万物复苏，粉樱飘落。田野回暖，是播种萝卜、土豆、黄瓜和草莓的好时节。',
    '烈日炎炎，蝉鸣阵阵。番茄、玉米和西瓜在阳光下茁壮成长，注意防旱防台风。',
    '金风送爽，枫叶飘红。茄子、胡萝卜、南瓜和红薯正是收获的季节。',
    '银装素裹，白雪皑皑。户外只剩白菜和白萝卜能生长，更多时候该下矿洞了。'
  ];

  /* ---------- 四季 3D 色调（场景渲染用） ---------- */
  const seasonTheme = [
    { sky: 0xcfe9ff, ground: 0x92d46c, ground2: 0x76bd52, fog: 0xe6f6dd, foliage: 0x7fca5a, foliage2: 0xa8e07e, trunk: 0x8a6242, decor: 'petal', ambient: 0xffffff, hill: 0x8ed46a },
    { sky: 0x9fd8ff, ground: 0x6bc44f, ground2: 0x51a83c, fog: 0xdff3e2, foliage: 0x3f9e3a, foliage2: 0x64bd4e, trunk: 0x7d5738, decor: 'bug', ambient: 0xffffff, hill: 0x66bd4a },
    { sky: 0xffe0b0, ground: 0xd9a65c, ground2: 0xbe8438, fog: 0xffeccd, foliage: 0xd97a2b, foliage2: 0xe8a24a, trunk: 0x7a5636, decor: 'leaf', ambient: 0xfff0d8, hill: 0xd79a4e },
    { sky: 0xd8e8f8, ground: 0xeaf3fb, ground2: 0xd2e2ee, fog: 0xf2f8ff, foliage: 0xdfe9f2, foliage2: 0xbcd2e2, trunk: 0x6f5a48, decor: 'snow', ambient: 0xf4f9ff, hill: 0xdce8f2 }
  ];

  /* ---------- 作物 ---------- */
  const crops = [
    [
      { id: 'turnip',     name: '萝卜',   icon: '🥕', price: 60,  growthDays: 4, seedPrice: 20, regrow: 0, desc: '生长快速的基础作物' },
      { id: 'potato',     name: '土豆',   icon: '🥔', price: 80,  growthDays: 5, seedPrice: 25, regrow: 0, desc: '产量稳定的主食作物' },
      { id: 'cucumber',   name: '黄瓜',   icon: '🥒', price: 100, growthDays: 6, seedPrice: 30, regrow: 3, desc: '需要勤浇水，可复收' },
      { id: 'strawberry', name: '草莓',   icon: '🍓', price: 150, growthDays: 7, seedPrice: 50, regrow: 4, desc: '高价水果，可复收' },
      { id: 'tulip',       name: '郁金香', icon: '🌷', price: 110, growthDays: 4, seedPrice: 35, regrow: 0, kind: 'flower', desc: '春季常见的观赏花卉' },
      { id: 'pansy',       name: '三色堇', icon: '🌸', price: 90,  growthDays: 4, seedPrice: 30, regrow: 0, kind: 'flower', desc: '花坛点缀的小巧花卉' }
    ],
    [
      { id: 'tomato',     name: '番茄',   icon: '🍅', price: 90,  growthDays: 5, seedPrice: 25, regrow: 3, desc: '夏季主要作物，可复收' },
      { id: 'corn',       name: '玉米',   icon: '🌽', price: 110, growthDays: 6, seedPrice: 30, regrow: 4, desc: '耐旱耐热' },
      { id: 'watermelon', name: '西瓜',   icon: '🍉', price: 200, growthDays: 8, seedPrice: 60, regrow: 0, desc: '夏季高价水果' },
      { id: 'sunflower',      name: '向日葵', icon: '🌻', price: 140, growthDays: 5, seedPrice: 45, regrow: 0, kind: 'flower', desc: '追着太阳开的夏季花卉' },
      { id: 'morningglory',   name: '牵牛花', icon: '💐', price: 110, growthDays: 4, seedPrice: 35, regrow: 0, kind: 'flower', desc: '清晨绽放的藤本花卉' }
    ],
    [
      { id: 'eggplant',    name: '茄子',   icon: '🍆', price: 90,  growthDays: 5, seedPrice: 25, regrow: 3, desc: '秋季常见作物，可复收' },
      { id: 'carrot',      name: '胡萝卜', icon: '🥕', price: 80,  growthDays: 4, seedPrice: 20, regrow: 0, desc: '生长快速的根茎作物' },
      { id: 'pumpkin',     name: '南瓜',   icon: '🎃', price: 180, growthDays: 7, seedPrice: 55, regrow: 0, desc: '万圣节的主角' },
      { id: 'sweetpotato', name: '红薯',   icon: '🍠', price: 120, growthDays: 6, seedPrice: 35, regrow: 2, desc: '香甜的根茎作物，可复收' },
      { id: 'chrysanthemum', name: '菊花', icon: '🌼', price: 130, growthDays: 5, seedPrice: 40, regrow: 0, kind: 'flower', desc: '秋季代表性的观赏花卉' },
      { id: 'dahlia',        name: '大丽花', icon: '🌹', price: 150, growthDays: 6, seedPrice: 50, regrow: 0, kind: 'flower', desc: '花朵层叠的秋日名花' }
    ],
    [
      { id: 'cabbage', name: '白菜',   icon: '🥬', price: 100, growthDays: 5, seedPrice: 30, regrow: 0, desc: '冬季主要蔬菜' },
      { id: 'radish',  name: '白萝卜', icon: '🥕', price: 70,  growthDays: 4, seedPrice: 20, regrow: 0, desc: '耐寒根茎作物' },
      { id: 'poinsettia', name: '一品红',   icon: '🌺', price: 160, growthDays: 6, seedPrice: 55, regrow: 0, kind: 'flower', desc: '冬日暖意的节庆花卉' },
      { id: 'camellia',   name: '山茶花',   icon: '🏵️', price: 140, growthDays: 5, seedPrice: 45, regrow: 0, kind: 'flower', desc: '寒冬绽放的坚贞花卉' }
    ]
  ];

  /* ---------- 天气：0 晴 / 1 雨雪 / 2 暴风雨 / 3 干旱 / 4 台风 / 5 暴雪 ---------- */
  const weatherTypes = [
    { id: 0, name: '晴',   icon: '☀️', effect: 'none',      desc: '风和日丽，适合耕作与放牧。' },
    { id: 1, name: '降雨', icon: '🌧️', effect: 'water',     desc: '细雨绵绵，作物自动获得水分，但动物容易感冒。' },
    { id: 2, name: '暴风雨', icon: '⛈️', effect: 'damage',  desc: '狂风暴雨！作物可能受损，动物必须收回小屋。' },
    { id: 3, name: '干旱', icon: '🔥', effect: 'drought',   desc: '持续干旱，作物停止生长，水壶消耗加倍。' },
    { id: 4, name: '台风', icon: '🌪️', effect: 'damage-big', desc: '台风过境！大量作物被毁。' },
    { id: 5, name: '暴雪', icon: '🌨️', effect: 'damage',   desc: '暴雪封锁牧场，户外作物可能冻伤。' }
  ];
  const rainNameBySeason = ['小雨', '雷阵雨', '秋雨', '小雪'];

  /* ---------- 动物 ---------- */
  const animalTypes = {
    chicken: {
      key: 'chicken', name: '小鸡', icon: '🐔', product: '鸡蛋', productKey: 'egg', productIcon: '🥚',
      feedDays: 1, basePrice: 50, buyPrice: 1500, scale: 0.95,
      colors: { body: 0xfff8ea, accent: 0xff9f43, beak: 0xffc04d, comb: 0xef5350 }
    },
    cow: {
      key: 'cow', name: '奶牛', icon: '🐄', product: '牛奶', productKey: 'milk', productIcon: '🥛',
      feedDays: 1, basePrice: 100, buyPrice: 5000, scale: 1.14,
      colors: { body: 0xfff6f2, accent: 0x4a4a52, beak: 0xf7b4c0, comb: 0xf7b4c0 }
    },
    sheep: {
      key: 'sheep', name: '绵羊', icon: '🐑', product: '羊毛', productKey: 'wool', productIcon: '🧶',
      feedDays: 3, basePrice: 150, buyPrice: 4000, scale: 1.05,
      colors: { body: 0xfffdf8, accent: 0x6b6b74, beak: 0xf3c7c7, comb: 0xf3c7c7 }
    },
    anjela: {
      key: 'anjela', name: '安哥拉兔', icon: '🐰', product: '兔毛', productKey: 'rabbitwool', productIcon: '☁️',
      feedDays: 3, basePrice: 120, buyPrice: 3000, scale: 0.78,
      colors: { body: 0xfffdf8, accent: 0xf1c8d0, beak: 0xf7b8c4, comb: 0xf7b4c0 }
    },
    cat: {
      key: 'cat', name: '三花猫', icon: '🐱', product: '小鱼干', productKey: 'driedfish', productIcon: '🐟',
      feedDays: 2, basePrice: 130, buyPrice: 3500, scale: 0.84,
      colors: { body: 0xfff4e6, accent: 0xd98a4a, beak: 0xf7b4c0, comb: 0xf7b4c0 }
    },
    llama: {
      key: 'llama', name: '羊驼', icon: '🦙', product: '羊驼绒', productKey: 'llamawool', productIcon: '🧵',
      feedDays: 3, basePrice: 180, buyPrice: 6000, scale: 1.08,
      colors: { body: 0xfdf6ec, accent: 0xd9b892, beak: 0xf0c4c4, comb: 0xf0c4c4 }
    }
  };

  /* ----------
   * 动物专属药：每种动物一种，只能在商店购买
   * 定价红线：price ≤ floor(该动物 buyPrice / 3)，下方自检会在超限时告警
   * ---------- */
  const animalMedicines = [
    { id: 'med_chicken', type: 'chicken', name: '小鸡暖身草药', icon: '💊', price: 400,  desc: '小鸡感冒时服用' },
    { id: 'med_cow',     type: 'cow',     name: '奶牛健胃药',   icon: '💊', price: 1500, desc: '奶牛肠胃不适时服用' },
    { id: 'med_sheep',   type: 'sheep',   name: '绵羊驱寒药',   icon: '💊', price: 1200, desc: '绵羊受凉时服用' },
    { id: 'med_anjela',  type: 'anjela',  name: '兔兔清鼻滴剂', icon: '💊', price: 900,  desc: '安哥拉兔流鼻涕时服用' },
    { id: 'med_cat',     type: 'cat',     name: '猫猫小鱼药丸', icon: '💊', price: 1000, desc: '三花猫没精神时服用' },
    { id: 'med_llama',   type: 'llama',   name: '羊驼安神膏',   icon: '💊', price: 1800, desc: '羊驼没胃口时服用' }
  ];
  const medicineById = {};
  const medicineByType = {};
  animalMedicines.forEach(m => { medicineById[m.id] = m; medicineByType[m.type] = m; });
  /** 某类动物对应专属药（没有则为 null） */
  function medicineFor(type) { return medicineByType[type] || null; }
  /** 药价上限：该动物售价的三分之一 */
  function medicinePriceCap(type) {
    const t = animalTypes[type];
    return t ? Math.floor(t.buyPrice / 3) : 0;
  }
  // 定价红线自检：任何一款药超过售价 1/3 都视为配置错误
  animalMedicines.forEach(m => {
    if (m.price > medicinePriceCap(m.type)) {
      console.warn('[数据错误] ' + m.name + ' 价格 ' + m.price + 'G 超过 ' + animalTypes[m.type].name + ' 售价的 1/3（上限 ' + medicinePriceCap(m.type) + 'G）');
    }
  });

  /* ---------- 产物与分级（S/M/L/G/P/X） ---------- */
  const produceGrades = [
    { id: 'S', name: 'S', mult: 1.0, color: '#9e9e9e', cond: '爱心 1~3' },
    { id: 'M', name: 'M', mult: 1.5, color: '#8bc34a', cond: '爱心 4~7' },
    { id: 'L', name: 'L', mult: 2.2, color: '#2196f3', cond: '爱心 8 以上' },
    { id: 'G', name: 'G', mult: 3.2, color: '#ffb300', cond: 'L + 比赛夺冠' },
    { id: 'P', name: 'P', mult: 5.0, color: '#ab47bc', cond: 'G + 放牧 547 小时' },
    { id: 'X', name: 'X', mult: 8.0, color: '#ef5350', cond: 'P + 1/255 概率' }
  ];
  const GRADE_IDS = ['S', 'M', 'L', 'G', 'P', 'X'];

  const storageMeta = {
    egg:         { name: '鸡蛋',   icon: '🥚', base: 50 },
    milk:        { name: '牛奶',   icon: '🥛', base: 100 },
    wool:        { name: '羊毛',   icon: '🧶', base: 100 },
    rabbitwool:  { name: '兔毛',   icon: '☁️', base: 120 },
    driedfish:   { name: '小鱼干', icon: '🐟', base: 130 },
    llamawool:   { name: '羊驼绒', icon: '🧵', base: 180 },
    cheese:      { name: '奶酪',   icon: '🧀', base: 300 },
    mayonnaise:  { name: '蛋黄酱', icon: '🥫', base: 100 },
    yarn:        { name: '毛线球', icon: '🪡', base: 300 },
    /* 海产（海边可采 / 可钓，同时进入海产图鉴本） */
    shell:       { name: '贝壳',   icon: '🐚', base: 60 },
    crab:        { name: '螃蟹',   icon: '🦀', base: 110 },
    starfish:    { name: '海星',   icon: '⭐', base: 90 },
    crucian:     { name: '鲫鱼',   icon: '🐟', base: 120 },
    carp:        { name: '鲤鱼',   icon: '🐠', base: 150 },
    trout:       { name: '鳟鱼',   icon: '🐟', base: 180 },
    bass:        { name: '鲈鱼',   icon: '🐠', base: 220 },
    bream:       { name: '鲷鱼',   icon: '🐟', base: 320 },
    salmon:      { name: '鲑鱼',   icon: '🐠', base: 480 },
    puffer:      { name: '河豚',   icon: '🐡', base: 700 },
    squid:       { name: '鱿鱼',   icon: '🦑', base: 520 },
    eel:         { name: '鳗鱼',   icon: '🐍', base: 620 },
    octopus:     { name: '章鱼',   icon: '🐙', base: 900 }
  };

  /* ---------- 矿石与矿洞 ---------- */
  const ores = {
    copper:     { key: 'copper',     name: '铜矿石',   icon: '🟤', value: 60,   minFloor: 1,  weight: 26 },
    silver:     { key: 'silver',     name: '银矿石',   icon: '⚪', value: 150,  minFloor: 15, weight: 18 },
    gold:       { key: 'gold',       name: '金矿石',   icon: '🟡', value: 400,  minFloor: 35, weight: 12 },
    gem:        { key: 'gem',        name: '宝石',     icon: '💎', value: 900,  minFloor: 55, weight: 7 },
    mithril:    { key: 'mithril',    name: '秘银',     icon: '🔷', value: 1200, minFloor: 75, weight: 5 },
    jade:       { key: 'jade',       name: '女神之玉', icon: '🟢', value: 2000, minFloor: 20, weight: 2 },
    sage:       { key: 'sage',       name: '贤者之石', icon: '🔮', value: 5000, minFloor: 100, weight: 1 },
    powerberry: { key: 'powerberry', name: '力之果实', icon: '🍒', value: 0,    minFloor: 25, weight: 1 }
  };

  const mines = {
    spring: { key: 'spring', name: '泉矿场', icon: '⛲', maxFloor: 120, openSeason: null, desc: '常时开放。越深矿石越稀有。' },
    lake:   { key: 'lake',   name: '湖矿场', icon: '🧊', maxFloor: 80,  openSeason: 3,    desc: '冬季湖面结冰后才能进入，深层藏有秘银与贤者之石。' }
  };

  /* ---------- 工具与升级阶梯 ---------- */
  const toolLevels = ['普通', '铜', '银', '金', '秘银', '贤者'];
  const tools = {
    hoe:         { key: 'hoe',         name: '锄头',   icon: '🪓', desc: '开垦田地，等级越高一次开垦范围越大', range: [1, 3, 5, 7, 9, 9] },
    wateringcan: { key: 'wateringcan', name: '水壶',   icon: '🚿', desc: '浇水，等级越高一次浇水格数越多',   range: [1, 3, 5, 7, 9, 9] },
    axe:         { key: 'axe',         name: '斧头',   icon: '🪵', desc: '清理树枝与树桩' },
    hammer:      { key: 'hammer',      name: '锤子',   icon: '🔨', desc: '敲碎石头，等级越高挖矿收益越好' },
    sickle:      { key: 'sickle',      name: '镰刀',   icon: '🌿', desc: '收割牧草' },
    fishingrod:  { key: 'fishingrod',  name: '钓竿',   icon: '🎣', desc: '在河边钓鱼' }
  };
  const upgradeRecipes = [
    null,
    { level: 1, ore: 'copper',  count: 5, cost: 1000,  label: '铜' },
    { level: 2, ore: 'silver',  count: 5, cost: 3000,  label: '银' },
    { level: 3, ore: 'gold',    count: 5, cost: 8000,  label: '金' },
    { level: 4, ore: 'mithril', count: 3, cost: 20000, label: '秘银' },
    { level: 5, ore: 'sage',    count: 1, cost: 50000, label: '贤者' }
  ];

  /* ---------- 围栏与加工机：5 级升级阶梯 ----------
     规则：1→2 级只花金币；3~5 级需要矿石，数量逐级增多、种类越来越稀有 */
  const FENCE_MAX = 10;                       // 围栏最多 10 段
  const structureLevels = ['木制', '加固', '精工', '白银', '传说'];

  const fenceUpgrades = [
    null, null,
    { level: 2, cost: 6000,   ores: [] },
    { level: 3, cost: 18000,  ores: [{ ore: 'copper',  count: 3 }] },
    { level: 4, cost: 45000,  ores: [{ ore: 'silver',  count: 5 }] },
    { level: 5, cost: 110000, ores: [{ ore: 'mithril', count: 6 }, { ore: 'sage', count: 2 }] }
  ];

  const machineUpgrades = [
    null, null,
    { level: 2, cost: 9000,   ores: [] },
    { level: 3, cost: 26000,  ores: [{ ore: 'copper',  count: 5 }] },
    { level: 4, cost: 65000,  ores: [{ ore: 'gold',    count: 6 }] },
    { level: 5, cost: 160000, ores: [{ ore: 'mithril', count: 8 }, { ore: 'sage', count: 3 }] }
  ];

  /* ---------- 节日日历 ---------- */
  const festivals = [
    [
      { day: 1,  name: '年糕大会',   icon: '🍡', reward: { gold: 300 },                    desc: '全村一起打年糕，参加即得 300G' },
      { day: 14, name: '春之感恩节', icon: '🍫', reward: { hearts: 20 },                    desc: '收到心意巧克力，动物们也跟着开心（全体爱心 +20）' },
      { day: 18, name: '赛马大会',   icon: '🐎', reward: { gold: 800, contest: true },      desc: '赛马夺冠，牛乳等级解锁 G（并得 800G）' },
      { day: 22, name: '料理祭',     icon: '🍳', reward: { seed: 'strawberry', count: 3 }, desc: '料理祭获得草莓种子 ×3' }
    ],
    [
      { day: 1,  name: '海滩开幕',   icon: '🏖️', reward: { gold: 300 },                    desc: '海滩开幕啦，参加即得 300G' },
      { day: 7,  name: '斗鸡祭',     icon: '🐓', reward: { hearts: 20 },                    desc: '斗鸡祭热闹非凡（全体爱心 +20）' },
      { day: 20, name: '牛祭',       icon: '🐄', reward: { gold: 800, contest: true },      desc: '牛祭夺冠，产物等级解锁 G（并得 800G）' },
      { day: 24, name: '烟花大会',   icon: '🎆', reward: { gold: 400 },                    desc: '夜空烟花，参加即得 400G' }
    ],
    [
      { day: 9,  name: '收获祭',     icon: '🍇', reward: { gold: 500 },                    desc: '把作物拿出来分享，得 500G' },
      { day: 13, name: '赏月',       icon: '🌕', reward: { hearts: 25 },                    desc: '与动物一起赏月（全体爱心 +25）' },
      { day: 21, name: '羊祭',       icon: '🐑', reward: { gold: 800, contest: true },      desc: '羊祭夺冠，产物等级解锁 G（并得 800G）' },
      { day: 30, name: '万圣节',     icon: '🎃', reward: { seed: 'pumpkin', count: 3 },     desc: '万圣节讨糖，获得南瓜种子 ×3' }
    ],
    [
      { day: 14, name: '冬之感恩节', icon: '🎁', reward: { gold: 400 },                    desc: '收到礼物，得 400G' },
      { day: 24, name: '星夜祭',     icon: '🌟', reward: { hearts: 25 },                    desc: '星夜祭的温暖（全体爱心 +25）' },
      { day: 30, name: '除夕',       icon: '🔔', reward: { gold: 1000 },                   desc: '听着钟声跨年，得 1000G' }
    ]
  ];

  /* ---------- 比赛活动（大型赛事：每月固定 2~3 天，日期互不连续） ---------- */
  /** 比赛定义：need 为参与前置条件（rod=钓竿 / animal=牧场动物 / pet=飞禽伙伴） */
  const contests = {
    racehorse: {
      id: 'racehorse', name: '赛马比赛', icon: '🐎', stamina: 14, time: 150, baseGold: 900, hearts: 12,
      need: { animal: 'horse' }, desc: '骑着小棕沿海滩竞速，马的心情越好名次越靠前',
      reward: '奖金 900G 起（马的心情加成）· 全体动物爱心 +12'
    },
    falcon: {
      id: 'falcon', name: '飞鹰比赛', icon: '🦅', stamina: 12, time: 120, baseGold: 700, hearts: 10,
      need: { pet: 'eagle' }, desc: '放飞老鹰比飞行高度与速度，亲密度越高飞得越稳',
      reward: '奖金 700G 起（亲密度加成）· 全体动物爱心 +10'
    },
    cormorant: {
      id: 'cormorant', name: '鸬鹚抓鱼比赛', icon: '🐦', stamina: 12, time: 120, baseGold: 650, hearts: 10, seaGain: 3,
      need: { pet: 'cormorant' }, desc: '鸬鹚下水抓鱼，比谁抓得多；抓到海产直接进背包与图鉴',
      reward: '奖金 650G 起 · 海产 ×3 · 全体动物爱心 +10'
    },
    fishcontest: {
      id: 'fishcontest', name: '钓鱼比赛', icon: '🎣', stamina: 12, time: 120, baseGold: 500,
      need: { rod: true }, desc: '与村民比钓鱼，钓竿等级与高级鱼网分数越高奖金越多',
      reward: '奖金 500G 起（钓竿 / 高级鱼网加成）'
    },
    sandcastle: {
      id: 'sandcastle', name: '沙雕比赛', icon: '🏰', stamina: 10, time: 120, baseGold: 400,
      need: {}, desc: '堆一座漂亮的沙堡参赛，比拼造型与创意',
      reward: '奖金 400G 起'
    },
    bonfireparty: {
      id: 'bonfireparty', name: '篝火比赛', icon: '🔥', stamina: 8, time: 100, baseGold: 300, hearts: 18,
      need: {}, desc: '比谁把篝火生得最旺，大家围着篝火唱歌跳舞',
      reward: '奖金 300G 起 · 全体动物爱心 +18'
    }
  };

  /** 比赛日程表：每季（月）固定 3 天，日期互不连续；四季均有比赛，配合节日保证每季多天有活动 */
  const contestCalendar = [
    [ { day: 6,  ids: ['racehorse'] },    { day: 13, ids: ['fishcontest'] },  { day: 24, ids: ['sandcastle'] } ],
    [ { day: 4,  ids: ['fishcontest'] },  { day: 11, ids: ['bonfireparty'] }, { day: 22, ids: ['racehorse'] } ],
    [ { day: 8,  ids: ['falcon'] },       { day: 17, ids: ['fishcontest'] },  { day: 27, ids: ['sandcastle'] } ],
    [ { day: 5,  ids: ['cormorant'] },    { day: 15, ids: ['falcon'] },       { day: 25, ids: ['bonfireparty'] } ]
  ];

  /* ---------- 飞禽伙伴（参加飞鹰 / 鸬鹚抓鱼比赛的前置条件） ---------- */
  const pets = {
    eagle: {
      key: 'eagle', name: '老鹰', artName: '小旋', icon: '🦅', model: 'pet_eagle', price: 8000, contest: 'falcon',
      desc: '目光锐利的老鹰，领养后可参加飞鹰比赛',
      // 日常：每天清早盘旋巡视农田，叼走田鼠与害虫；雨天不外出
      daily: { maxPerDay: 4, rainStop: true, kind: '农田除害' }
    },
    cormorant: {
      key: 'cormorant', name: '鸬鹚', artName: '小黑', icon: '🐦', model: 'pet_cormorant', price: 6000, contest: 'cormorant',
      desc: '擅长潜水抓鱼的鸬鹚，领养后可参加鸬鹚抓鱼比赛',
      // 日常：可派去鱼塘抓鱼，每天有体力上限（喂饱后满体力）
      daily: { staminaMax: 3, staminaPerTrip: 1 }
    }
  };

  /* ---------- 鱼塘：只出淡水鱼，派鸬鹚下水抓鱼 ---------- */
  const pond = {
    key: 'pond', name: '鱼塘', icon: '🌊',
    desc: '牧场东侧引活水挖出的鱼塘，塘里只养淡水鱼；派鸬鹚下水，就能叼回鲜鱼去卖或补图鉴。',
    // 只出淡水鱼（鲤 / 鲫 / 草鱼 / 鲢鱼 / 黑鱼 / 鲶鱼 / 黄颡鱼 / 鳜鱼 共 8 种），无海鱼、无采集类海产
    freshFish: ['carp', 'crucian', 'grasscarp', 'silvercarp', 'snakehead', 'catfish', 'yellowcat', 'mandarin'],
    cormorant: {
      staminaCost: 3,      // 牧场主体力消耗（与钓鱼一致）
      time: 30,            // 耗时（分钟）
      catchMin: 1,
      catchMax: 2          // 一次最多叼回 2 条
    },
    pest: {
      chance: 0.1,         // 每块成长中的田地每天生虫概率
      naturalFade: 0.5     // 无老鹰巡视（或雨天）时，虫子自行散去的概率
    }
  };

  /* ---------- 体力消耗 ---------- */
  const staminaCosts = {
    plow: 2, plant: 1, water: 2, fertilize: 1, harvest: 1, brush: 2, talk: 0,
    collect: 0, mine: 8, graze: 1, fish: 3, feed: 1, process: 2
  };
  const STAMINA_BASE = 150;
  const STAMINA_PER_BERRY = 10;
  const BERRY_MAX = 9;
  const FAINT_FATIGUE = 100;   // 疲劳上限，超过即晕倒

  /* ---------- 商店 ---------- */
  const shopItems = [
    { id: 'fertilizer',  category: 'tool',   name: '肥料',     icon: '🧪', price: 30,   desc: '为单块田地施肥，加速生长' },
    { id: 'feed',        category: 'feed',   name: '精饲料',   icon: '🌾', price: 20,   desc: '一次喂饱牧场所有动物（含马与狗）' },
    // 动物专属药：每种动物一种，药价均不超过该动物售价的三分之一
    ...animalMedicines.map(m => ({
      id: m.id, category: 'medicine', name: m.name, icon: m.icon, price: m.price, animal: m.type,
      desc: m.desc + ' · 仅对' + animalTypes[m.type].name + '有效'
    })),
    { id: 'fence',       category: 'tool',   name: '修围栏',   icon: '🚧', price: 500,  desc: '加固围栏，显著降低野狗袭击概率' },
    { id: 'cheesemaker', category: 'machine', name: '奶酪加工机', icon: '🧀', price: 20000, desc: '牛奶 → 奶酪，售价翻数倍' },
    { id: 'mayomaker',   category: 'machine', name: '蛋黄酱机',   icon: '🥫', price: 20000, desc: '鸡蛋 → 蛋黄酱' },
    { id: 'yarnmaker',   category: 'machine', name: '毛线机',     icon: '🪡', price: 20000, desc: '羊毛 → 毛线球' },
    { id: 'barn',        category: 'build',   name: '扩建动物小屋', icon: '🏚️', price: 8000, desc: '可多养 3 只动物' },
    { id: 'bed',         category: 'build',   name: '大床',       icon: '🛏️', price: 10000, desc: '牧场主的心愿（睡觉恢复疲劳更多）' }
  ];

  /* ---------- 小矮人（体力外包） ---------- */
  const dwarfConfig = {
    name: '小矮人',
    icons: ['🧙', '🧝', '🧚', '🧛', '🧞', '🧜', '🧟'],
    hireCost: 500,          // 每次雇佣 500G，帮忙浇水 3 天
    giftHearts: 15
  };

  /* ---------- 海滩与海产图鉴 ---------- */
  const beach = {
    name: '沙滩海岸',
    desc: '夏日海滩常年开放，捡贝壳、抓螃蟹、沙滩篝火随时可玩；钓鱼比赛、沙雕比赛、篝火晚会、赛马比赛等大型赛事按每月特定日期举行。',
    gather: [
      { id: 'shell',    key: 'shell',    name: '捡贝壳',   icon: '🐚', stamina: 2, min: 1, max: 2, desc: '潮水退去后沙滩上到处是贝壳' },
      { id: 'crab',     key: 'crab',     name: '抓螃蟹',   icon: '🦀', stamina: 4, min: 1, max: 1, desc: '礁石缝里的螃蟹，卖价不错' },
      { id: 'starfish', key: 'starfish', name: '找海星',   icon: '⭐', stamina: 3, min: 1, max: 1, desc: '浅水区偶尔能拾到海星' }
    ],
    contests: [
      { id: 'fishcontest', name: '钓鱼比赛', icon: '🎣', stamina: 12, time: 120, needRod: true,  baseGold: 500, desc: '与村民比钓鱼，钓竿等级越高奖金越多' },
      { id: 'sandcastle',  name: '沙雕比赛', icon: '🏰', stamina: 10, time: 120, needRod: false, baseGold: 400, desc: '堆一座漂亮的沙堡，参与即得奖金' },
      { id: 'bonfire',     name: '沙滩篝火', icon: '🔥', stamina: 6,  time: 90,  needRod: false, baseGold: 120, hearts: 12, desc: '围着篝火唱歌跳舞，动物爱心全体 +12' }
    ]
  };

  /** 海产图鉴条目：rarity 稀有度 / base 基准售价 / sizeRange 体型区间(cm) */
  const seafood = {
    shell:    { key: 'shell',    name: '贝壳',   icon: '🐚', field: 'gather',   rarity: 1, base: 60,  size: [4, 9] },
    crab:     { key: 'crab',     name: '螃蟹',   icon: '🦀', field: 'gather',   rarity: 2, base: 110, size: [8, 18] },
    starfish: { key: 'starfish', name: '海星',   icon: '⭐', field: 'gather',   rarity: 2, base: 90,  size: [6, 14] },
    crucian:  { key: 'crucian',  name: '鲫鱼',   icon: '🐟', field: 'fishing',  rarity: 1, base: 120, size: [12, 28] },
    carp:     { key: 'carp',     name: '鲤鱼',   icon: '🐠', field: 'fishing',  rarity: 1, base: 150, size: [18, 42] },
    // 鱼塘 8 种淡水鱼（鲤 / 鲫 / 草 / 鲢 / 黑鱼 / 鲶 / 黄颡 / 鳜）
    grasscarp: { key: 'grasscarp', name: '草鱼',  icon: '🐟', field: 'fishing',  rarity: 2, base: 200, size: [30, 70] },
    silvercarp:{ key: 'silvercarp', name: '鲢鱼', icon: '🐟', field: 'fishing',  rarity: 2, base: 190, size: [28, 65] },
    snakehead: { key: 'snakehead', name: '黑鱼',  icon: '🐟', field: 'fishing',  rarity: 3, base: 300, size: [25, 60] },
    catfish:   { key: 'catfish',   name: '鲶鱼',  icon: '🐟', field: 'fishing',  rarity: 2, base: 210, size: [26, 62] },
    yellowcat: { key: 'yellowcat', name: '黄颡鱼', icon: '🐠', field: 'fishing', rarity: 3, base: 280, size: [14, 28] },
    mandarin:  { key: 'mandarin',  name: '鳜鱼',  icon: '🐠', field: 'fishing',  rarity: 4, base: 460, size: [22, 48] },
    trout:    { key: 'trout',    name: '鳟鱼',   icon: '🐟', field: 'fishing',  rarity: 2, base: 180, size: [20, 45] },
    bass:     { key: 'bass',     name: '鲈鱼',   icon: '🐠', field: 'fishing',  rarity: 2, base: 220, size: [22, 52] },
    bream:    { key: 'bream',    name: '鲷鱼',   icon: '🐟', field: 'fishing',  rarity: 3, base: 320, size: [24, 55] },
    salmon:   { key: 'salmon',   name: '鲑鱼',   icon: '🐠', field: 'fishing',  rarity: 3, base: 480, size: [30, 70] },
    puffer:   { key: 'puffer',   name: '河豚',   icon: '🐡', field: 'fishing',  rarity: 4, base: 700, size: [12, 30] },
    squid:    { key: 'squid',    name: '鱿鱼',   icon: '🦑', field: 'fishing',  rarity: 4, base: 520, size: [20, 48] },
    eel:      { key: 'eel',      name: '鳗鱼',   icon: '🐍', field: 'fishing',  rarity: 4, base: 620, size: [40, 90] },
    octopus:  { key: 'octopus',  name: '章鱼',   icon: '🐙', field: 'fishing',  rarity: 5, base: 900, size: [30, 80] }
  };
  const FISHING_ORDER = ['crucian', 'carp', 'trout', 'bass', 'bream', 'salmon', 'squid', 'eel', 'puffer', 'octopus'];

  /* ---------- 商店兑换（矿产 / 加工品 → 奇特商品） ---------- */
  const exchangeItems = [
    { id: 'stamina_up',   name: '体力果实',   icon: '🍒', need: { ore: 'gold',    count: 3 }, gold: 2000,  limit: 5, desc: '体力上限 +10（最多兑换 5 次）' },
    { id: 'heart_up',     name: '爱心铃铛',   icon: '🔔', need: { quality: 'cheese', count: 2 }, gold: 1500, limit: 9, desc: '全部动物爱心 +15' },
    { id: 'mystic_seed',  name: '神秘种子',   icon: '🌱', need: { ore: 'silver',  count: 4 }, gold: 800,  limit: 99, desc: '随机获得 3 包当季高价种子' },
    { id: 'mystic_gear',  name: '矿工头灯',   icon: '🕯️', need: { ore: 'gem',     count: 2 }, gold: 3000, limit: 3,  desc: '矿洞挖掘体力消耗 -1（最多 3 次）' },
    { id: 'charm_bell',   name: '牧场风铃',   icon: '🎐', need: { quality: 'yarn', count: 2 }, gold: 1200, limit: 3, desc: '每天早上动物爱心 +4' },
    { id: 'dried_net',    name: '高级鱼网',   icon: '🕸️', need: { ore: 'mithril', count: 2 }, gold: 5000, limit: 3, desc: '钓鱼比赛奖金 +60%（最多 3 次）' }
  ];

  /* ---------- 可控天气与产量：工具 / 建筑（可升级） ---------- */
  const devices = {
    weather: {
      key: 'weather', name: '天气祭坛', icon: '⛩️', maxLevel: 3,
      levels: [
        { cost: 20000, ores: { copper: 10 }, desc: '可祈祷次日为晴天' },
        { cost: 40000, ores: { silver: 8 },  desc: '可祈祷次日为雨天（自动浇水）' },
        { cost: 80000, ores: { gold: 8 },    desc: '可祈祷次日为任意天气，含克制灾害的护佑（灾害概率下降）' }
      ]
    },
    greenhouse: {
      key: 'greenhouse', name: '温室大棚', icon: '🏡', maxLevel: 3,
      levels: [
        { cost: 30000, ores: { copper: 15 }, desc: '室内作物免疫天气灾害与换季枯萎' },
        { cost: 60000, ores: { silver: 12 }, desc: '产量 +1（每次收获额外产出 1 个）' },
        { cost: 120000, ores: { gold: 10 },  desc: '生长速度 +1 天（每天按 2 天成长）' }
      ]
    }
  };

  /* ---------- 矿洞铁镐（影响单层可挖次数） ---------- */
  const pickaxeLevels = [
    { level: 0, name: '普通铁镐', hits: 1, cost: 0,    ore: null,      count: 0 },
    { level: 1, name: '铜铁镐',   hits: 2, cost: 2000, ore: 'copper',  count: 5 },
    { level: 2, name: '银铁镐',   hits: 3, cost: 6000, ore: 'silver',  count: 5 },
    { level: 3, name: '金铁镐',   hits: 4, cost: 15000, ore: 'gold',   count: 5 },
    { level: 4, name: '秘银铁镐', hits: 5, cost: 30000, ore: 'mithril', count: 5 },
    { level: 5, name: '贤者铁镐', hits: 6, cost: 60000, ore: 'sage',   count: 3 }
  ];

  /* ---------- 工具函数 ---------- */
  function getSeasonForDay(day) { return Math.floor((day - 1) / DAYS_PER_SEASON) % 4; }
  function getYearForDay(day) { return Math.floor((day - 1) / (DAYS_PER_SEASON * 4)) + 1; }
  function getDayOfSeason(day) { return ((day - 1) % DAYS_PER_SEASON) + 1; }
  function getCurrentCrops(season) { return crops[season] || crops[0]; }
  function getCropInfo(cropId) {
    for (let i = 0; i < crops.length; i++) {
      const found = crops[i].find(c => c.id === cropId);
      if (found) return found;
    }
    return null;
  }
  function getWeather(id) { return weatherTypes[id] || weatherTypes[0]; }
  function getWeatherName(id, season) { return id === 1 ? (rainNameBySeason[season] || '小雨') : getWeather(id).name; }
  function getStorageInfo(key) {
    const crop = getCropInfo(key);
    if (crop) return { name: crop.name, icon: crop.icon, base: crop.price, kind: 'crop' };
    if (storageMeta[key]) return Object.assign({ kind: 'product' }, storageMeta[key]);
    if (ores[key]) return { name: ores[key].name, icon: ores[key].icon, base: ores[key].value, kind: 'ore' };
    return { name: key, icon: '📦', base: 0, kind: 'unknown' };
  }
  function gradeMultiplier(gid) {
    const g = produceGrades.find(x => x.id === gid);
    return g ? g.mult : 1;
  }
  function getFestivals(season) { return festivals[season] || []; }
  function findFestival(season, dayOfSeason) {
    return (festivals[season] || []).find(f => f.day === dayOfSeason) || null;
  }
  function getUpgradeRecipe(level) { return upgradeRecipes[level] || null; }
  /** 围栏 / 加工机的升级配方：kind = 'fence' | 'machine'，level 为目标等级(2~5) */
  function getStructureUpgrade(kind, level) {
    const table = kind === 'fence' ? fenceUpgrades : machineUpgrades;
    return table[level] || null;
  }
  function structureLevelName(level) { return structureLevels[level - 1] || ''; }

  /* ---------- 比赛日程查询 ---------- */
  function getContests(season) { return contestCalendar[season] || []; }
  function getContest(id) { return contests[id] || null; }
  /** 某天举行的全部比赛（返回比赛定义数组） */
  function findContests(season, dayOfSeason) {
    const row = (contestCalendar[season] || []).find(x => x.day === dayOfSeason);
    return row ? row.ids.map(id => contests[id]).filter(Boolean) : [];
  }
  /** 指定比赛距离 season / dayOfSeason 的下一场 { away, season, day }（today 为 0 天） */
  function nextContestInfo(id, season, dayOfSeason) {
    for (let i = 0; i < 4; i++) {
      const sn = (season + i) % 4;
      const rows = contestCalendar[sn] || [];
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (row.ids.indexOf(id) < 0) continue;
        if (i === 0 && row.day < dayOfSeason) continue;
        return { away: i * DAYS_PER_SEASON + (row.day - dayOfSeason), season: sn, day: row.day };
      }
    }
    return null;
  }

  return {
    DAYS_PER_SEASON, DAY_START, DAY_END, MINUTES_PER_SECOND,
    seasons, seasonIcons, seasonFullNames, seasonDescs, seasonTheme,
    crops, weatherTypes, animalTypes, animalMedicines, medicineById, storageMeta, produceGrades, GRADE_IDS,
    ores, mines, tools, toolLevels, upgradeRecipes, festivals,
    FENCE_MAX, structureLevels, fenceUpgrades, machineUpgrades,
    contests, contestCalendar, pets, pond,
    staminaCosts, STAMINA_BASE, STAMINA_PER_BERRY, BERRY_MAX, FAINT_FATIGUE,
    shopItems, dwarfConfig, beach, seafood, FISHING_ORDER, exchangeItems, devices, pickaxeLevels,
    getSeasonForDay, getYearForDay, getDayOfSeason, getCurrentCrops, getCropInfo,
    getWeather, getWeatherName, getStorageInfo, gradeMultiplier,
    medicineFor, medicinePriceCap,
    getFestivals, findFestival, getUpgradeRecipe,
    getStructureUpgrade, structureLevelName,
    getContests, getContest, findContests, nextContestInfo
  };
})();
