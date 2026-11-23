/**
 * scene.js —— 3D 牧场场景渲染层（v2 · 萌版 3D）
 * 基于本地 Three.js：固定俯视角、Q 版圆润动物、卡通渲染、柔光与景深、四季色调、天气粒子。
 * 只读 Game.state，不修改任何游戏状态。若 WebGL / Three.js 不可用，自动降级为等距伪 3D。
 */
window.Scene = (function () {
  'use strict';

  const D = window.GAME_DATA;

  const LAYOUT = {
    /* 农田移到东边（让出中间竖条给牧场）；农田页本身是 HTML 网格，3D 田只作特写 */
    field: { cols: 6, rows: 4, plotSize: 2, gap: 0.12, x: 24, z: -20 },
    /* 牧场竖长一页（v9/v10）：从上到下 = 放牧空地 → 大栏杆 → 建筑排 → 散养区 → 松鼠树 → 池塘 */
    /* 7 个大栏：牛/羊并排、鸡/兔/羊驼各一整栏、空栏 2 个（栏大、间隔大，栏里有空地走动） */
    pens: [
      { key: 'cow',     minX: -16, minZ: -29, w: 15, d: 8 },
      { key: 'sheep',   minX: 1,   minZ: -29, w: 15, d: 8 },
      { key: 'chicken', minX: -16, minZ: -19, w: 32, d: 7 },
      { key: 'anjela',  minX: -16, minZ: -10, w: 32, d: 6.5 },
      { key: 'llama',   minX: -16, minZ: -1.5, w: 32, d: 7 },
      { key: 'empty1',  minX: -16, minZ: 7.5, w: 15, d: 6.5 },
      { key: 'empty2',  minX: 1,   minZ: 7.5, w: 15, d: 6.5 }
    ],
    penOf: { cow: 'cow', sheep: 'sheep', chicken: 'chicken', anjela: 'anjela', llama: 'llama' },
    /* 放牧空地（最上方一大块椭圆草地，够 10 只动物一起出来） */
    meadow: { minX: -15, maxX: 15, minZ: -38, maxZ: -31.5 },
    /* 建筑排（v12 位置）：马厩在上（西侧近放牧空地）、谷仓/仓库在中段西侧、农舍/粮草屋/狗窝/猫窝在下段；
       鸡舍在西侧近鸡栏，出货箱挨着仓库 */
    house: { x: 13, z: 19 },
    barn: { x: -20, z: -6 },
    coop: { x: -18.5, z: -15.5 },
    stable: { x: -20, z: -24 },
    warehouse: { x: -20, z: 2 },
    hayhouse: { x: 6, z: 19 },
    doghouse: { x: -16, z: 20 },
    cathouse: { x: -11, z: 21 },
    pond: { x: 0, z: 34, r: 4.5 },
    mine: { x: 25, z: 0 },
    crate: { x: -17.5, z: 4.8 },
    camOffset: { x: 0, y: 27, z: 26 },
    /* 农田特写机位（农田 v9：镜头只是微微斜着往下看，不是完全垂直俯视；约 69° 仰角，植物能看到茎的高度） */
    camField: { x: 30, y: 17, z: -9.5, lookX: 30, lookY: 0, lookZ: -16 }
  };

  /* 每种作物的专属视觉：leaf 叶片色 / fruit 果实色 / accent 点缀色 / bloom 花色 / shape 造型
     shape 取值：root 直根、bulb 球根、tuber 块茎、round 圆果、berry 浆果、long 长果、oval 椭果、
                 cob 玉米穗、melon 条纹瓜、gourd 扁圆瓜、head 结球叶菜、flower 花卉 */
  const CROP_STYLE = {
    turnip:      { shape: 'bulb',   leaf: 0x74c247, fruit: 0xf4f1e4, accent: 0xc9a6dc, bloom: 0xfff5c0 },
    potato:      { shape: 'tuber',  leaf: 0x62b547, fruit: 0xd8a75e, accent: 0xbb8943, bloom: 0xf7f2da },
    cucumber:    { shape: 'long',   leaf: 0x57b04a, fruit: 0x4fa83c, accent: 0x8ed45f, bloom: 0xf6e05a },
    strawberry:  { shape: 'berry',  leaf: 0x4f9e3a, fruit: 0xef5f6b, accent: 0xffe9ec, bloom: 0xfffaf4 },
    tomato:      { shape: 'round',  leaf: 0x54a83f, fruit: 0xe14b3f, accent: 0xf2c34e, bloom: 0xf7e35a },
    corn:        { shape: 'cob',    leaf: 0x6cb84a, fruit: 0xf2c14e, accent: 0xb98a45, bloom: 0xf2e6a8 },
    watermelon:  { shape: 'melon',  leaf: 0x4f9e3a, fruit: 0x3f8f4a, accent: 0x245c2c, bloom: 0xf5e35a },
    eggplant:    { shape: 'oval',   leaf: 0x5aa845, fruit: 0x8455c8, accent: 0x6ec25a, bloom: 0xd8c2f0 },
    carrot:      { shape: 'root',   leaf: 0x63b04a, fruit: 0xf08a3c, accent: 0xc96a22, bloom: 0xfff6e0 },
    pumpkin:     { shape: 'gourd',  leaf: 0x5aab46, fruit: 0xf08a2a, accent: 0x8fbf4a, bloom: 0xf7e35a },
    sweetpotato: { shape: 'tuber',  leaf: 0x5fae4a, fruit: 0xc0603a, accent: 0x8f4a2a, bloom: 0xf3dfd0 },
    cabbage:     { shape: 'head',   leaf: 0x6cbb4c, fruit: 0xd8ecc0, accent: 0xa6d86a, bloom: 0xf7f4c8 },
    radish:      { shape: 'root',   leaf: 0x64b348, fruit: 0xf3f5ee, accent: 0xdfe6d8, bloom: 0xfffaf0 },
    /* 花卉（每季新增可购买品种） */
    tulip:         { shape: 'flower', leaf: 0x63b04a, fruit: 0xe8506a, accent: 0xffd76a, bloom: 0xe8506a },
    pansy:         { shape: 'flower', leaf: 0x5fae4a, fruit: 0x8a5ad0, accent: 0xffe066, bloom: 0x8a5ad0 },
    sunflower:     { shape: 'flower', leaf: 0x54a83f, fruit: 0xf7c948, accent: 0x8a5a2a, bloom: 0xf7c948 },
    morningglory:  { shape: 'flower', leaf: 0x5aab46, fruit: 0xb08adf, accent: 0xfff3f6, bloom: 0xb08adf },
    chrysanthemum: { shape: 'flower', leaf: 0x5fae4a, fruit: 0xf6c24a, accent: 0xfff0c0, bloom: 0xf6c24a },
    dahlia:        { shape: 'flower', leaf: 0x4f9e3a, fruit: 0xe0578a, accent: 0xffd9e6, bloom: 0xe0578a },
    poinsettia:    { shape: 'flower', leaf: 0x3f8f4a, fruit: 0xd93b4a, accent: 0xffe066, bloom: 0xd93b4a },
    camellia:      { shape: 'flower', leaf: 0x4f9e3a, fruit: 0xe8657f, accent: 0xfff0c0, bloom: 0xe8657f }
  };

  /* 土壤四态（农田 v9 确认稿）：翻耕浅驼色 / 浇水浅奶茶棕（绝不深巧克力）/ 施肥浅暖棕 + 黑点 / 干裂苍白 */
  const SOIL_COLOR = { normal: 0xc79a68, wet: 0xa87a4e, fert: 0x9a6b3f, dry: 0xd9b48f };

  /* 生长阶段：0 幼苗 / 1 生长 / 2 开花 / 3 结果成熟 */
  const STAGE_NAMES = ['幼苗', '生长', '开花', '结果'];
  const CROP_STAGE_ICONS = ['🌱', '🌿', '🌼', '🍎'];

  let mode = '3d';
  let container = null;
  let renderer = null, scene = null, camera = null, clock = null;
  let groups = {};
  let animalRigs = [], horseRig = null, dogRig = null, riderRig = null;
  /* 飞禽伙伴（老鹰 / 鸬鹚）：领养后在牧场场景中摆出正式 3D 模型 */
  let eagleRig = null, cormorantRig = null;
  let plotMeshes = [], cropMeshes = [];
  let gradientMap = null;
  let weatherSys = null;
  let running = false, rafId = 0;
  let pointer = { x: 0, y: 0 };
  let raycaster = null;
  let callbacks = { plot: null, animal: null, mine: null, crate: null };
  let anim = { t: 0, rideAngle: 0, riders: 0, flash: 0 };
  let last = { season: -1, weather: -1, riding: false, animalSig: '' };
  let camMode = 'wide';   // wide 全景 / field 农田特写
  let camPan = { x: 0, z: -16 };   // 拖动镜头平移量（牧场是竖长一页，往下拉看；默认停在牛羊栏 + 鸡栏，栏里动物可见，放牧空地在画面上方边缘，往上拖能看到）
  let squirrelRig = null;   // 松鼠（平时在树上，下来啃果实）
  let fallbackCtx = null, fallbackCanvas = null, fallbackState = null;
  const toonMats = {};
  /* 施肥标记用的黑色小点（芝麻状）共享几何与材质 */
  const speckGeo = new THREE.SphereGeometry(0.045, 6, 5);
  const speckMat = new THREE.MeshBasicMaterial({ color: 0x1d1710 });

  /* ======================= 材质与工具 ======================= */

  function makeGradientMap() {
    const data = new Uint8Array([70, 70, 80, 255, 150, 150, 160, 255, 210, 210, 220, 255, 255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  function toon(color) {
    const key = color + '';
    if (!toonMats[key]) toonMats[key] = new THREE.MeshToonMaterial({ color: color, gradientMap: gradientMap });
    return toonMats[key];
  }

  function soft(color) {
    return new THREE.MeshLambertMaterial({ color: color });
  }

  function mesh(geo, mat, x, y, z, parent, cast, receive) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = cast !== false;
    m.receiveShadow = receive !== false;
    if (parent) parent.add(m);
    return m;
  }

  function outline(target, scale, color) {
    const o = new THREE.Mesh(target.geometry, new THREE.MeshBasicMaterial({ color: color || 0x54443a, side: THREE.BackSide }));
    o.scale.multiplyScalar(scale || 1.07);
    o.castShadow = false;
    o.receiveShadow = false;
    target.add(o);
    return o;
  }

  function sphere(r, wSeg, hSeg) {
    return new THREE.SphereGeometry(r, wSeg || 20, hSeg || 16);
  }

  function blinker(rig) { rig.blinkTimer = 1 + Math.random() * 3; }

  /* ======================= 地形与建筑 ======================= */

  function buildSky() {
    const geo = new THREE.SphereGeometry(90, 24, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfe9ff, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(geo, mat);
    sky.name = 'sky';
    groups.terrain.add(sky);
    groups.sky = sky;

    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
    // 太阳圆盘（晴 / 干旱时可见，applyTheme 控制显隐与大小）
    const sun = mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ color: 0xffe98a, fog: false }), -34, 26, -52, groups.terrain, false, false);
    groups.sun = sun;
    groups.clouds = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        const s = mesh(sphere(1.1 + Math.random() * 0.9, 12, 10), cloudMat, (j - n / 2) * 1.4, Math.random() * 0.4, Math.random() * 0.6, c, false, false);
        s.scale.y = 0.62;
      }
      c.position.set(-60 + Math.random() * 120, 20 + Math.random() * 8, -70 + Math.random() * 85);
      groups.clouds.add(c);
    }
    groups.terrain.add(groups.clouds);
  }

  function buildGround() {
    /* 草地一直延伸到远方（v12 远景）：大圆盘 + 远处雾色融合进天空 */
    const g = mesh(new THREE.CircleGeometry(120, 48), soft(0x92d46c), 0, -0.02, 0, groups.terrain, false, true);
    g.rotation.x = -Math.PI / 2;
    groups.ground = g;

    /* 远山（v12）：连绵绿色山丘在最北边，雾不遮挡（fog:false），视线开阔不被树和建筑挡住 */
    const hillCols = [0x9ccf88, 0x8fbf7f, 0xa8d695, 0x93c47f, 0x9ccf88];
    for (let i = 0; i < 5; i++) {
      const h = mesh(sphere(12 + Math.random() * 8, 14, 10),
        new THREE.MeshLambertMaterial({ color: hillCols[i], fog: false }),
        -44 + i * 22, -4.5, -68 - Math.random() * 10, groups.terrain, false, false);
      h.scale.y = 0.38 + Math.random() * 0.12;
    }
    [[-62, -30, 14], [62, -24, 15]].forEach(s => {
      const h = mesh(sphere(s[2], 14, 10), new THREE.MeshLambertMaterial({ color: 0x9ccf88, fog: false }),
        s[0], -4, s[1], groups.terrain, false, false);
      h.scale.y = 0.4;
    });

    // 草簇（避开农田与池塘）
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x7ec85a });
    const grassGeo = new THREE.ConeGeometry(0.16, 0.7, 5);
    for (let i = 0; i < 120; i++) {
      const x = -24 + Math.random() * 48, z = -40 + Math.random() * 76;
      if (x > 23 && x < 38 && z > -21 && z < -11) continue;   // 农田
      const pdx = x - LAYOUT.pond.x, pdz = z - LAYOUT.pond.z;
      if (pdx * pdx + pdz * pdz < 30) continue;   // 池塘
      const tuft = mesh(grassGeo, grassMat, x, 0.32, z, groups.terrain, false, false);
      tuft.rotation.z = (Math.random() - 0.5) * 0.4;
      tuft.scale.setScalar(0.7 + Math.random() * 0.7);
    }
  }

  function buildPond() {
    const p = LAYOUT.pond;
    const water = mesh(new THREE.CircleGeometry(p.r, 32), new THREE.MeshLambertMaterial({ color: 0x63c2ea, transparent: true, opacity: 0.92 }), p.x, 0.05, p.z, groups.terrain, false, false);
    water.rotation.x = -Math.PI / 2;
    groups.water = water;
    const rim = mesh(new THREE.TorusGeometry(p.r, 0.28, 8, 32), soft(0xb99268), p.x, 0.08, p.z, groups.terrain, false, true);
    rim.rotation.x = -Math.PI / 2;
    // 芦苇 + 睡莲叶
    const reedMat = toon(0x5f9f42);
    [[-1.6, -1.2], [-1.2, 1.4], [1.5, -1.0]].forEach(rp => {
      mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 5), reedMat, p.x + rp[0], 0.8, p.z + rp[1], groups.terrain, false, false);
      mesh(sphere(0.12, 8, 8), toon(0x8a6a3a), p.x + rp[0], 1.65, p.z + rp[1], groups.terrain, false, false);
    });
    [[0.8, 0.6], [-0.4, 1.2]].forEach(lp => {
      const pad = mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshLambertMaterial({ color: 0x4f9e3a }), p.x + lp[0], 0.07, p.z + lp[1], groups.terrain, false, false);
      pad.rotation.x = -Math.PI / 2;
    });
  }

  function buildBuildings() {
    // 牧场小屋
    const h = LAYOUT.house;
    const houseBase = mesh(new THREE.BoxGeometry(5, 3.2, 4), toon(0xfff3e0), h.x, 1.6, h.z, groups.buildings);
    outline(houseBase, 1.03, 0x6a5546);
    const roof = mesh(new THREE.ConeGeometry(3.8, 2.2, 4), toon(0xe2604f), h.x, 4.3, h.z, groups.buildings);
    roof.rotation.y = Math.PI / 4;
    const door = mesh(new THREE.BoxGeometry(1.1, 1.8, 0.2), toon(0x8d6242), h.x - 1.6, 0.9, h.z + 2.02, groups.buildings);
    void door;
    mesh(new THREE.BoxGeometry(1.1, 1.1, 0.2), toon(0x9fd8ff), h.x + 1.5, 2.0, h.z + 2.02, groups.buildings, false, false);

    // 动物小屋
    const b = LAYOUT.barn;
    const barnBase = mesh(new THREE.BoxGeometry(5.4, 3, 4.2), toon(0xf6d9b0), b.x, 1.5, b.z, groups.buildings);
    outline(barnBase, 1.03, 0x6a5546);
    const barnRoof = mesh(new THREE.BoxGeometry(6, 0.5, 4.8), toon(0xcf7f5c), b.x, 3.2, b.z, groups.buildings);
    barnRoof.rotation.z = 0;
    mesh(new THREE.BoxGeometry(0.3, 2.4, 4.6), toon(0xcf7f5c), b.x - 3.6, 4.1, b.z, groups.buildings);
    mesh(new THREE.BoxGeometry(0.3, 2.4, 4.6), toon(0xcf7f5c), b.x + 3.6, 4.1, b.z, groups.buildings);

    // 鸡舍
    const c = LAYOUT.coop;
    const coopBase = mesh(new THREE.BoxGeometry(3.4, 2.2, 3), toon(0xfff0d8), c.x, 1.1, c.z, groups.buildings);
    outline(coopBase, 1.04, 0x6a5546);
    const coopRoof = mesh(new THREE.ConeGeometry(2.6, 1.5, 4), toon(0x7bc47f), c.x, 2.95, c.z, groups.buildings);
    coopRoof.rotation.y = Math.PI / 4;

    // 狗屋
    const dg = LAYOUT.doghouse;
    const dogHouse = mesh(new THREE.BoxGeometry(1.7, 1.3, 1.5), toon(0xe9b07a), dg.x, 0.65, dg.z, groups.buildings);
    outline(dogHouse, 1.06, 0x6a5546);
    const dogRoof = mesh(new THREE.ConeGeometry(1.4, 0.9, 4), toon(0xc4703f), dg.x, 1.75, dg.z, groups.buildings);
    dogRoof.rotation.y = Math.PI / 4;
    mesh(new THREE.CircleGeometry(0.35, 14), toon(0x4a3b34), dg.x, 0.6, dg.z + 0.78, groups.buildings, false, false);
    // 狗窝骨头牌
    const boneMat = toon(0xfff6e8);
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8), boneMat, dg.x, 2.45, dg.z + 0.8, groups.buildings, false, false).rotation.z = Math.PI / 2;
    mesh(sphere(0.13, 8, 8), boneMat, dg.x - 0.35, 2.45, dg.z + 0.8, groups.buildings, false, false);
    mesh(sphere(0.13, 8, 8), boneMat, dg.x + 0.35, 2.45, dg.z + 0.8, groups.buildings, false, false);

    // 马厩（敞开式 + 干草架）
    const st = LAYOUT.stable;
    const stBase = mesh(new THREE.BoxGeometry(4.6, 2.6, 3.6), toon(0xd9b380), st.x, 1.3, st.z, groups.buildings);
    outline(stBase, 1.03, 0x6a5546);
    const stRoof = mesh(new THREE.BoxGeometry(5.2, 0.4, 4.2), toon(0xa8623c), st.x, 2.8, st.z, groups.buildings);
    void stRoof;
    mesh(new THREE.BoxGeometry(1.6, 1.8, 0.2), toon(0x5e4630), st.x, 0.9, st.z + 1.85, groups.buildings, false, false);
    mesh(new THREE.BoxGeometry(1.2, 0.5, 0.9), toon(0xe8c25a), st.x + 1.2, 0.35, st.z + 1.2, groups.buildings, false, false);

    // 灰色仓库
    const wh = LAYOUT.warehouse;
    const whBase = mesh(new THREE.BoxGeometry(5, 3.4, 4), toon(0xb9b3ac), wh.x, 1.7, wh.z, groups.buildings);
    outline(whBase, 1.03, 0x5c564e);
    mesh(new THREE.BoxGeometry(5.6, 0.4, 4.6), toon(0x8a857e), wh.x, 3.6, wh.z, groups.buildings);
    mesh(new THREE.BoxGeometry(1.4, 2.2, 0.2), toon(0x6f6a63), wh.x, 1.1, wh.z + 2.05, groups.buildings, false, false);

    // 粮草屋（茅草顶 + 门口干草垛）
    const hh = LAYOUT.hayhouse;
    const hhBase = mesh(new THREE.BoxGeometry(3.6, 2.4, 3.2), toon(0xf0d9a8), hh.x, 1.2, hh.z, groups.buildings);
    outline(hhBase, 1.03, 0x6a5546);
    const hhRoof = mesh(new THREE.ConeGeometry(2.9, 1.6, 4), toon(0xd9b25a), hh.x, 3.2, hh.z, groups.buildings);
    hhRoof.rotation.y = Math.PI / 4;
    mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.0, 12), toon(0xe8c25a), hh.x - 1.6, 0.7, hh.z + 1.6, groups.buildings).rotation.z = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 12), toon(0xe8c25a), hh.x + 1.8, 0.55, hh.z + 1.4, groups.buildings).rotation.z = Math.PI / 2;

    // 粉色猫窝（鱼牌）
    const ch = LAYOUT.cathouse;
    const chBase = mesh(new THREE.BoxGeometry(2.2, 1.6, 2), toon(0xf7b8c8), ch.x, 0.8, ch.z, groups.buildings);
    outline(chBase, 1.05, 0x8a5a68);
    const chRoof = mesh(new THREE.ConeGeometry(1.8, 1.0, 4), toon(0xe87a9a), ch.x, 2.1, ch.z, groups.buildings);
    chRoof.rotation.y = Math.PI / 4;
    mesh(new THREE.CircleGeometry(0.3, 14), toon(0x4a3b34), ch.x, 0.55, ch.z + 1.02, groups.buildings, false, false);
    const fishMat = toon(0x6db7e8);
    const fishBody = mesh(sphere(0.28, 10, 8), fishMat, ch.x, 2.9, ch.z + 1.0, groups.buildings, false, false);
    fishBody.scale.set(1.4, 0.8, 0.4);
    mesh(new THREE.ConeGeometry(0.2, 0.4, 4), fishMat, ch.x - 0.5, 2.9, ch.z + 1.0, groups.buildings, false, false).rotation.z = Math.PI / 2;

    // 出货箱（敞口木箱 + 小麦/蔬菜，点它以后进仓库卖货页；本次只做点击提示）
    const cr = LAYOUT.crate;
    const crateMat = toon(0xc89a5e);
    mesh(new THREE.BoxGeometry(2.2, 0.25, 1.6), crateMat, cr.x, 0.13, cr.z, groups.buildings);
    [[0, 0.82], [0, -0.82]].forEach(o => mesh(new THREE.BoxGeometry(2.2, 0.9, 0.15), crateMat, cr.x, 0.55, cr.z + o[1], groups.buildings));
    [[1.1, 0], [-1.1, 0]].forEach(o => mesh(new THREE.BoxGeometry(0.15, 0.9, 1.6), crateMat, cr.x + o[0], 0.55, cr.z, groups.buildings));
    const lid = mesh(new THREE.BoxGeometry(2.2, 0.12, 1.4), toon(0xb3854a), cr.x + 1.4, 0.75, cr.z - 0.6, groups.buildings);
    lid.rotation.z = -0.5;
    mesh(new THREE.ConeGeometry(0.16, 0.7, 6), toon(0xe8c25a), cr.x - 0.5, 1.0, cr.z, groups.buildings, false, false);
    mesh(new THREE.ConeGeometry(0.16, 0.7, 6), toon(0xe8c25a), cr.x - 0.1, 1.0, cr.z + 0.3, groups.buildings, false, false);
    mesh(sphere(0.2, 10, 8), toon(0xef7d3c), cr.x + 0.5, 0.95, cr.z - 0.2, groups.buildings, false, false);
    mesh(sphere(0.18, 10, 8), toon(0x7ec85a), cr.x + 0.6, 0.9, cr.z + 0.35, groups.buildings, false, false);
    const crateHit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.2), new THREE.MeshBasicMaterial({ visible: false }));
    crateHit.position.set(cr.x, 0.8, cr.z);
    crateHit.userData.pickType = 'crate';
    groups.buildings.add(crateHit);
    pickables.push(crateHit);

    // 屋顶积雪（暴雪 / 冬季显示，applyTheme 控制）
    groups.snowCaps = [];
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const cap1 = mesh(new THREE.ConeGeometry(2.2, 0.9, 4), snowMat, h.x, 5.3, h.z, groups.buildings, false, false);
    cap1.rotation.y = Math.PI / 4;
    cap1.visible = false;
    groups.snowCaps.push(cap1);
    const cap2 = mesh(new THREE.BoxGeometry(5.5, 0.2, 4.9), snowMat, b.x, 3.55, b.z, groups.buildings, false, false);
    cap2.visible = false;
    groups.snowCaps.push(cap2);
    const cap3 = mesh(new THREE.BoxGeometry(5.6, 0.2, 4.7), snowMat, wh.x, 3.85, wh.z, groups.buildings, false, false);
    cap3.visible = false;
    groups.snowCaps.push(cap3);

    // 矿山：整座山、山脚洞口（确认稿 mine v3）；洞口朝南（朝牧场），矿车轨道向南铺
    const m = LAYOUT.mine;
    const mountain = mesh(sphere(5.5, 24, 18), toon(0x9a8a7a), m.x, 0.2, m.z, groups.buildings);
    mountain.scale.set(1, 0.72, 1);
    outline(mountain, 1.01, 0x6a5a4a);
    const peak2 = mesh(new THREE.ConeGeometry(2.8, 3.8, 8), toon(0x8a7a6a), m.x + 2.5, 1.8, m.z - 3.5, groups.buildings);
    void peak2;
    // 山坡松树
    [[m.x - 3, m.z + 4.2], [m.x + 2.5, m.z + 3.8], [m.x - 4, m.z - 2]].forEach(tp => {
      mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.4, 7), toon(0x7a5636), tp[0], 1.6, tp[1], groups.buildings, false, false);
      mesh(new THREE.ConeGeometry(1.0, 2.4, 8), toon(0x4f8f3a), tp[0], 3.4, tp[1], groups.buildings, false, false);
    });
    // 矿脉：铜 / 银 / 金 / 蓝水晶（嵌在朝牧场的南坡上）
    [[20.6, 2.4, 3.4, 0xb87333], [21.2, 1.2, 4.6, 0xd8d8d8], [22.4, 3.2, 3.0, 0xffd24a],
     [24.5, 1.0, 4.4, 0x66ccff], [26.5, 2.6, 3.2, 0xb87333], [28.2, 1.4, 2.2, 0xffd24a]].forEach(o => {
      const ore = mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshLambertMaterial({ color: o[3], emissive: o[3], emissiveIntensity: 0.25 }), o[0], o[1], o[2], groups.buildings, false, false);
      ore.rotation.set(Math.random(), Math.random(), 0);
    });
    // 洞口（朝南）：石拱 + 黑洞 + 暖灯 + 镐 + 矿车轨道
    const ez = 5.0;
    const rockArch = mesh(new THREE.TorusGeometry(1.8, 0.7, 10, 18, Math.PI), toon(0x9a8877), 23, 0.1, ez, groups.buildings);
    const cave = mesh(new THREE.CircleGeometry(1.7, 20), new THREE.MeshBasicMaterial({ color: 0x2b2620 }), 23, 1.6, ez + 0.05, groups.buildings, false, false);
    void cave;
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), toon(0x6b4a2a), 21.2, 0.8, ez + 1.2, groups.buildings, false, false);
    const lamp = mesh(sphere(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd98a }), 21.2, 1.7, ez + 1.2, groups.buildings, false, false);
    void lamp;
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), toon(0x8a6242), 24.8, 0.55, ez + 1.4, groups.buildings, false, false).rotation.z = 0.7;
    mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), toon(0x9aa3ad), 24.8, 1.05, ez + 1.4, groups.buildings, false, false);
    mesh(new THREE.BoxGeometry(0.16, 0.08, 3.6), toon(0x6b4a2a), 22.6, 0.06, ez + 2.4, groups.buildings, false, false);
    mesh(new THREE.BoxGeometry(0.16, 0.08, 3.6), toon(0x6b4a2a), 23.4, 0.06, ez + 2.4, groups.buildings, false, false);
    const cart = mesh(new THREE.BoxGeometry(1.1, 0.6, 0.8), toon(0x8d5a2b), 23, 0.42, ez + 3.6, groups.buildings);
    void cart;
    mesh(sphere(0.2, 8, 8), toon(0x9a8a7a), 23, 0.8, ez + 3.6, groups.buildings, false, false);
    const mineTop = new THREE.Mesh(new THREE.CircleGeometry(1.75, 20), new THREE.MeshBasicMaterial({ color: 0x1d1a16 }));
    mineTop.position.set(23, 1.7, ez);
    groups.buildings.add(mineTop);
    groups.minePick = mineTop;
    mineTop.userData.pickType = 'mine';
    pickables.push(mineTop);
  }

  function buildField() {
    const F = LAYOUT.field;
    plotMeshes = [];
    cropMeshes = [];
    const soilGeo = new THREE.BoxGeometry(F.plotSize, 0.24, F.plotSize);
    const grassGeo = new THREE.BoxGeometry(F.plotSize, 0.16, F.plotSize);

    for (let row = 0; row < F.rows; row++) {
      for (let col = 0; col < F.cols; col++) {
        const idx = row * F.cols + col;
        const x = F.x + col * (F.plotSize + F.gap);
        const z = F.z + row * (F.plotSize + F.gap);
        const grass = mesh(grassGeo, soft(0x86cf63), x, 0.08, z, groups.field, false, true);
        const soil = mesh(soilGeo, toon(0x8a6242), x, 0.16, z, groups.field, false, true);
        grass.visible = true;
        soil.visible = false;
        const cropGroup = new THREE.Group();
        cropGroup.position.set(x, 0.28, z);
        groups.field.add(cropGroup);

        // 施肥后浮现的黑色芝麻状小点（默认隐藏，仅施肥地块显示）
        const fertGroup = new THREE.Group();
        fertGroup.position.set(x, 0.292, z);
        fertGroup.visible = false;
        groups.field.add(fertGroup);
        const specks = [];
        for (let k = 0; k < 27; k++) {
          const a = (k * 137.508) * Math.PI / 180;          // 黄金角散布，避免排列整齐
          const rr = 0.16 + Math.sqrt((k + 1) / 27) * 0.72;
          const sp = new THREE.Mesh(speckGeo, speckMat);
          sp.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
          sp.scale.setScalar(0.7 + (k % 4) * 0.18);
          sp.castShadow = false;
          sp.receiveShadow = false;
          fertGroup.add(sp);
          specks.push(sp);
        }

        // 荒地杂草 + 石头（未耕地时显示，乱一点、不种花）；干裂纹（已耕未浇水无作物时显示）
        const weedGroup = new THREE.Group();
        weedGroup.position.set(x, 0.3, z);
        groups.field.add(weedGroup);
        const weedMat = new THREE.MeshLambertMaterial({ color: 0x6da34a });
        const weedMat2 = new THREE.MeshLambertMaterial({ color: 0x8a9a4a });
        [[-0.5, -0.4, 0.5], [0.45, 0.3, 0.42], [0.1, -0.55, 0.62], [-0.2, 0.5, 0.38]].forEach((w, wi) => {
          const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.16, w[2], 5), wi % 2 ? weedMat2 : weedMat);
          tuft.position.set(w[0], w[2] / 2, w[1]);
          tuft.rotation.z = (wi - 1.5) * 0.25;
          tuft.castShadow = false;
          weedGroup.add(tuft);
        });
        const stoneMat = new THREE.MeshLambertMaterial({ color: 0xa9a29a });
        [[0.55, -0.35, 0.16], [-0.6, 0.15, 0.12]].forEach(st => {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(st[2], 0), stoneMat);
          rock.position.set(st[0], 0.06, st[1]);
          rock.scale.y = 0.6;
          rock.castShadow = false;
          weedGroup.add(rock);
        });
        const crackGroup = new THREE.Group();
        crackGroup.position.set(x, 0.295, z);
        crackGroup.visible = false;
        groups.field.add(crackGroup);
        const crackMat = new THREE.MeshBasicMaterial({ color: 0x5e4630 });
        [[0, 0.1, 0, 1.5], [0.3, -0.2, 0.5, 1.1], [-0.35, 0.35, -0.6, 0.9], [0.1, 0.45, 1.1, 0.7]].forEach(c => {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, c[3]), crackMat);
          line.position.set(c[0], 0, c[1]);
          line.rotation.y = c[2];
          crackGroup.add(line);
        });

        // 成熟作物在地块上方的专属图标（Sprite，仅成熟时显示）
        const iconSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
        iconSprite.position.set(x, 1.02, z);
        iconSprite.scale.set(0.92, 0.92, 1);
        iconSprite.visible = false;
        groups.field.add(iconSprite);

        const soilHit = new THREE.Mesh(new THREE.BoxGeometry(F.plotSize * 1.02, 0.5, F.plotSize * 1.02), new THREE.MeshBasicMaterial({ visible: false }));
        soilHit.position.set(x, 0.25, z);
        soilHit.userData.pickType = 'plot';
        soilHit.userData.index = idx;
        groups.field.add(soilHit);
        pickables.push(soilHit);
        plotMeshes.push({ soil: soil, grass: grass, cropGroup: cropGroup, fertGroup: fertGroup, specks: specks, iconSprite: iconSprite, weedGroup: weedGroup, crackGroup: crackGroup, x: x, z: z, soilHit: soilHit });
        cropMeshes.push({ group: cropGroup, model: null, built: '', ripe: false });
      }
    }
  }

  /* 8 个大栏：2 行 × 4 列木栅栏（栏间距大，中间是宽草地）；每栏北面开一个门，门扇向外敞开 */
  /* 栏杆按 key 查（LAYOUT.pens 是显式列表：牛/羊并排，鸡/兔/羊驼各一整栏，空栏 2 个） */
  function penByKey(key) {
    const P = LAYOUT.pens.find(p => p.key === key);
    if (!P) return null;
    return { minX: P.minX, maxX: P.minX + P.w, minZ: P.minZ, maxZ: P.minZ + P.d, cx: P.minX + P.w / 2, cz: P.minZ + P.d / 2 };
  }

  function buildFence() {
    const postMat = toon(0xc08a55);
    const railMat = toon(0xdba469);
    const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 1.5, 7);
    const step = 2.6;   // 立柱间距（大栏杆用整条横栏，减少网格数）
    /* 每条边 = 两条整长横栏（门洞处断开）+ 立柱 */
    const railSide = (x0, z0, x1, z1, gateX) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const horiz = Math.abs(z1 - z0) < 0.01;
      const segs = [];
      if (gateX === null || gateX === undefined) { segs.push([mx, mz, len]); }
      else {
        const along = horiz ? mx : mz;   // 门洞只开在北边横栏上
        const half = len / 2, gHalf = 1.4;
        const c = horiz ? (x0 + x1) / 2 : (z0 + z1) / 2;
        const leftLen = (gateX - gHalf) - (c - half), rightLen = (c + half) - (gateX + gHalf);
        if (leftLen > 0.3) segs.push([horiz ? (c - half + gateX - gHalf) / 2 : mx, horiz ? mz : (c - half + gateX - gHalf) / 2, leftLen]);
        if (rightLen > 0.3) segs.push([horiz ? (gateX + gHalf + c + half) / 2 : mx, horiz ? mz : (gateX + gHalf + c + half) / 2, rightLen]);
        void along;
      }
      segs.forEach(s => {
        for (let k = 0; k < 2; k++) {
          const rail = mesh(new THREE.BoxGeometry(horiz ? s[2] : 0.12, 0.16, horiz ? 0.12 : s[2]), railMat, s[0], 0.5 + k * 0.55, s[1], groups.props);
          void rail;
        }
      });
    };
    LAYOUT.pens.forEach(P => {
      const R = penByKey(P.key);
      const gateZ = R.minZ;   // 门一律开在北面（朝放牧空地方向，放牧从这里走出去）
      /* 立柱（门口不立柱；末端用 Math.min 补角柱） */
      for (let x = R.minX; x <= R.maxX + step; x += step) {
        [R.minZ, R.maxZ].forEach(z => {
          if (z === gateZ && Math.abs(Math.min(x, R.maxX) - R.cx) < 1.4) return;
          mesh(postGeo, postMat, Math.min(x, R.maxX), 0.75, z, groups.props);
        });
      }
      for (let z = R.minZ; z <= R.maxZ + step; z += step) {
        [R.minX, R.maxX].forEach(x => { mesh(postGeo, postMat, x, 0.75, Math.min(z, R.maxZ), groups.props); });
      }
      /* 横栏：北边留门洞，其余三边整条 */
      railSide(R.minX, gateZ, R.maxX, gateZ, R.cx);
      railSide(R.minX, R.maxZ, R.maxX, R.maxZ, null);
      railSide(R.minX, R.minZ, R.minX, R.maxZ, null);
      railSide(R.maxX, R.minZ, R.maxX, R.maxZ, null);
      /* 敞开的门扇：X 撑木门，铰在左门柱上、向外张开约 100° */
      const gate = new THREE.Group();
      gate.position.set(R.cx - 1.3, 0, gateZ);
      gate.rotation.y = -1.9;
      groups.props.add(gate);
      mesh(new THREE.BoxGeometry(1.7, 1.05, 0.09), railMat, 0.85, 0.55, 0, gate);
      const diag = mesh(new THREE.BoxGeometry(1.9, 0.1, 0.06), postMat, 0.85, 0.55, 0.06, gate, false, false);
      diag.rotation.z = 0.55;
      const diag2 = mesh(new THREE.BoxGeometry(1.9, 0.1, 0.06), postMat, 0.85, 0.55, 0.06, gate, false, false);
      diag2.rotation.z = -0.55;
    });
    // 空栏布置：empty1 种花、empty2 放干草堆
    const flowerPen = penByKey('empty1');
    const petalMat = new THREE.MeshLambertMaterial({ color: 0xff8fb0 });
    const petalMat2 = new THREE.MeshLambertMaterial({ color: 0xffd76a });
    for (let i = 0; i < 6; i++) {
      const fx = flowerPen.minX + 1.2 + (i % 3) * 2.2, fz = flowerPen.minZ + 1.4 + Math.floor(i / 3) * 2.4;
      mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), toon(0x5f9f42), fx, 0.35, fz, groups.props, false, false);
      const bloom = mesh(sphere(0.3, 10, 8), i % 2 ? petalMat2 : petalMat, fx, 0.78, fz, groups.props, false, false);
      bloom.scale.y = 0.7;
    }
    const hayPen = penByKey('empty2');
    const hayMat = toon(0xe8c25a);
    [[-1.2, -1], [1.2, 0.8], [0, 1.6]].forEach(h => {
      const bale = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 12), hayMat, hayPen.cx + h[0], 0.7, hayPen.cz + h[1], groups.props);
      bale.rotation.z = Math.PI / 2;
      bale.rotation.y = h[0];
    });
  }

  /* 放牧空地：栏杆区上方一大块椭圆草地（够 10 只动物一起出来），边缘草丛 + 野花 + 木牌 */
  function buildMeadow() {
    const M = LAYOUT.meadow;
    const cx = (M.minX + M.maxX) / 2, cz = (M.minZ + M.maxZ) / 2;
    const oval = mesh(new THREE.CircleGeometry(17, 40), new THREE.MeshLambertMaterial({ color: 0xa8e07e }), cx, 0.02, cz, groups.terrain, false, true);
    oval.rotation.x = -Math.PI / 2;
    oval.scale.set(1, 0.22, 1);
    // 边缘草丛圈
    const tuftMat = new THREE.MeshLambertMaterial({ color: 0x7ec85a });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const tx = cx + Math.cos(a) * 16.6, tz = cz + Math.sin(a) * 3.6;
      const tuft = mesh(new THREE.ConeGeometry(0.22, 0.8, 5), tuftMat, tx, 0.4, tz, groups.terrain, false, false);
      tuft.rotation.z = (Math.random() - 0.5) * 0.4;
    }
    // 野花
    const petalCols = [0xff8fb0, 0xffd76a, 0xffffff, 0xc9a6dc];
    for (let i = 0; i < 12; i++) {
      const fx = M.minX + 2 + Math.random() * (M.maxX - M.minX - 4);
      const fz = M.minZ + 1 + Math.random() * (M.maxZ - M.minZ - 2);
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), toon(0x5f9f42), fx, 0.2, fz, groups.terrain, false, false);
      mesh(sphere(0.16, 8, 8), new THREE.MeshLambertMaterial({ color: petalCols[i % 4] }), fx, 0.44, fz, groups.terrain, false, false);
    }
    // 木牌「放牧草地」
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6), toon(0x8a6242), cx, 0.7, M.maxZ + 0.6, groups.props);
    const board = mesh(new THREE.BoxGeometry(2.4, 0.9, 0.12), toon(0xd8b074), cx, 1.5, M.maxZ + 0.6, groups.props);
    outline(board, 1.04, 0x6a5546);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#fff8ea'; c2.fillRect(0, 0, 256, 96);
    c2.fillStyle = '#5e4630'; c2.font = 'bold 44px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText('放牧草地', 128, 50);
    const tex = new THREE.CanvasTexture(cv);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.82), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(cx, 1.5, M.maxZ + 0.68);
    groups.props.add(sign);
  }

  function buildProps() {
    // 树（v11：旁边树少一点，只留 8 棵边树 + 松鼠树 2 棵，不挡栏杆和建筑；多放花朵、三叶草、杂草）
    const trunkMat = toon(0x8a6242);
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 2.2, 8);
    groups.foliage = [];
    const spots = [
      [-21, -30], [21, -28], [-22, -14], [22, -12], [-23, 8], [21, 6], [-22, 16], [22, 18],
      [14, 27], [-14, 27]   // 松鼠树（东边这棵是松鼠的家）
    ];
    spots.forEach((p, i) => {
      mesh(trunkGeo, trunkMat, p[0], 1.1, p[1], groups.props);
      const fol = new THREE.Group();
      const n = 3;
      for (let k = 0; k < n; k++) {
        const ball = mesh(sphere(1.1 + Math.random() * 0.45, 14, 12), toon(0x7fca5a), (k - 1) * 0.75, 2.6 + (k === 1 ? 0.7 : 0), (k % 2) * 0.5 - 0.25, fol);
        ball.userData.tint = true;
        if (k === 1) ball.scale.setScalar(1.15);
      }
      fol.position.set(p[0], 0, p[1]);
      fol.userData.phase = i * 0.7;
      groups.props.add(fol);
      groups.foliage.push(fol);
    });

    // 花朵 / 三叶草 / 杂草：沿两侧草地 + 牧场空地边缘散放（v11）
    const flowerCols = [0xff8fb0, 0xffd76a, 0xffffff, 0xc9a6dc, 0xff9d9d];
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5);
    const bloomGeo = sphere(0.17, 8, 8);
    const cloverGeo = new THREE.CircleGeometry(0.3, 8);
    const cloverMat = new THREE.MeshLambertMaterial({ color: 0x4f9e3a });
    const weedGeo = new THREE.ConeGeometry(0.18, 0.75, 5);
    const weedMat = new THREE.MeshLambertMaterial({ color: 0x7ec85a });
    for (let i = 0; i < 56; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (18.5 + Math.random() * 5), z = -36 + Math.random() * 68;
      const kind = i % 3;
      if (kind === 0) {
        mesh(stemGeo, toon(0x5f9f42), x, 0.25, z, groups.props, false, false);
        mesh(bloomGeo, new THREE.MeshLambertMaterial({ color: flowerCols[i % flowerCols.length] }), x, 0.55, z, groups.props, false, false);
      } else if (kind === 1) {
        for (let k = 0; k < 3; k++) {
          const leaf = mesh(cloverGeo, cloverMat, x + (k - 1) * 0.32, 0.06, z + (k % 2) * 0.28 - 0.14, groups.props, false, false);
          leaf.rotation.x = -Math.PI / 2;
        }
      } else {
        const w = mesh(weedGeo, weedMat, x, 0.36, z, groups.props, false, false);
        w.rotation.z = (Math.random() - 0.5) * 0.4;
      }
    }

    // 石头（避开竖条牧场区和农田）
    const rockMat = toon(0xa9a29a);
    for (let i = 0; i < 9; i++) {
      const x = -20 + Math.random() * 40, z = -18 + Math.random() * 36;
      if (x > -17 && x < 17 && z > -30 && z < 15) continue;   // 牧场竖条
      if (x > 23 && x < 38 && z > -21 && z < -11) continue;   // 农田
      const r = mesh(new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.6, 0), rockMat, x, 0.35, z, groups.props);
      r.rotation.set(Math.random(), Math.random(), Math.random());
      r.scale.y = 0.75;
    }

    // 木牌（移到羊驼栏与空栏之间的走道上）
    const sign = mesh(new THREE.BoxGeometry(1.5, 0.9, 0.12), toon(0xd8b074), 0, 1.3, 6.5, groups.props);
    void sign;
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), toon(0x8a6242), 0, 0.6, 6.5, groups.props);
  }

  /* 松鼠：平时在树上，下来到地上啃果实（啃食动作：低头快速点啄）；体型很迷你，约猫的一半大（v11/v12） */
  const SQUIRREL_TREE = { x: 14, z: 27, perchY: 3.3 };
  const SQUIRREL_FRUITS = [[15.5, 28.5], [12.8, 25.8], [15.8, 25.5]];
  const SQ_SCALE = 0.4;

  function buildSquirrel() {
    const g = new THREE.Group();
    const body = mesh(sphere(0.34, 16, 12), toon(0xb5763c), 0, 0.42, 0, g);
    body.scale.set(0.9, 1, 1.15);
    outline(body, 1.05, 0x5c3b22);
    const head = mesh(sphere(0.24, 16, 12), toon(0xb5763c), 0, 0.82, 0.18, g);
    outline(head, 1.06, 0x5c3b22);
    makeEyes(head, 0.07, 0.1, 0.04, 0.2);
    for (let s = -1; s <= 1; s += 2) {
      const ear = mesh(new THREE.ConeGeometry(0.07, 0.22, 6), toon(0x9a5f30), 0.13 * s, 1.04, 0.14, g);
      ear.rotation.z = s * 0.25;
    }
    const tail = mesh(sphere(0.3, 14, 12), toon(0xd08a4a), 0, 0.72, -0.42, g);
    tail.scale.set(0.7, 1.25, 0.5);
    tail.rotation.x = -0.5;
    outline(tail, 1.04, 0x5c3b22);
    g.position.set(SQUIRREL_TREE.x, SQUIRREL_TREE.perchY, SQUIRREL_TREE.z);
    g.rotation.y = 0.8;
    g.scale.setScalar(SQ_SCALE);   // 很迷你，约猫的一半大
    groups.animals.add(g);
    // 树下落果（松鼠啃食的目标）
    SQUIRREL_FRUITS.forEach(f => {
      mesh(sphere(0.16, 10, 8), toon(0xe14b3f), f[0], 0.16, f[1], groups.props, false, false);
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 5), toon(0x5f9f42), f[0], 0.3, f[1], groups.props, false, false);
    });
    squirrelRig = { group: g, head: head, tail: tail, state: 'tree', timer: 6 + Math.random() * 6, t: 0, from: null, to: null, fruit: null, leg: 0 };
    // 点按松鼠的拾取体（跟着松鼠走；点到就逃跑，不给爱心气泡）
    // 注意：拾取球是松鼠组的子物体，会随组缩放，半径按 SQ_SCALE 反推，保证世界尺寸约 0.9
    const sqHit = new THREE.Mesh(new THREE.SphereGeometry(0.9 / SQ_SCALE, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    sqHit.position.set(0, 1.2, 0);
    sqHit.userData.pickType = 'squirrel';
    g.add(sqHit);
    pickables.push(sqHit);
  }

  /** 摸了松鼠：立马逃到树上躲起来（先窜回树根、爬上树、缩在树干后），过一会儿再探头 */
  function fleeSquirrel() {
    const sq = squirrelRig;
    if (!sq || sq.state === 'flee' || sq.state === 'hide' || sq.state === 'peek') return;
    sq.head.rotation.x = 0;
    sq.from = sq.group.position.clone();
    sq.to = new THREE.Vector3(SQUIRREL_TREE.x, 0, SQUIRREL_TREE.z);
    sq.state = 'flee'; sq.t = 0; sq.leg = 1;
  }

  function updateSquirrel(dt) {
    const sq = squirrelRig;
    if (!sq) return;
    sq.t += dt;
    if (sq.state === 'flee') {
      // 两段逃跑：先窜回树根，再爬上树躲到树干后
      const k = Math.min(1, sq.t / 0.45);
      sq.group.position.lerpVectors(sq.from, sq.to, k);
      sq.group.position.y += Math.sin(k * Math.PI) * 0.7;
      sq.group.rotation.y = Math.atan2(sq.to.x - sq.from.x, sq.to.z - sq.from.z);
      if (k >= 1) {
        if (sq.leg === 1) {
          sq.from = sq.group.position.clone();
          sq.to = new THREE.Vector3(SQUIRREL_TREE.x + 0.3, 3.6, SQUIRREL_TREE.z - 0.7);
          sq.state = 'flee'; sq.t = 0; sq.leg = 2;
        } else {
          sq.state = 'hide'; sq.timer = 6 + Math.random() * 4;
          sq.group.scale.y = SQ_SCALE * 0.7;   // 缩在树干后躲起来
        }
      }
      return;
    }
    if (sq.state === 'hide') {
      sq.timer -= dt;
      if (sq.timer <= 0) {
        sq.from = sq.group.position.clone();
        sq.to = new THREE.Vector3(SQUIRREL_TREE.x, SQUIRREL_TREE.perchY, SQUIRREL_TREE.z + 0.3);
        sq.state = 'peek'; sq.t = 0;
        sq.group.scale.y = SQ_SCALE;
      }
      return;
    }
    if (sq.state === 'peek') {
      const k = Math.min(1, sq.t / 0.5);
      sq.group.position.lerpVectors(sq.from, sq.to, k);
      sq.group.rotation.y = 0.8;
      if (k >= 1) { sq.state = 'tree'; sq.timer = 8 + Math.random() * 8; }
      return;
    }
    if (sq.state === 'tree') {
      sq.tail.rotation.z = Math.sin(sq.t * 2.2) * 0.18;
      sq.timer -= dt;
      if (sq.timer <= 0) {
        sq.fruit = SQUIRREL_FRUITS[Math.floor(Math.random() * SQUIRREL_FRUITS.length)];
        sq.from = sq.group.position.clone();
        sq.to = new THREE.Vector3(sq.fruit[0], 0, sq.fruit[1]);
        sq.state = 'down'; sq.t = 0;
      }
    } else if (sq.state === 'down' || sq.state === 'up') {
      const k = Math.min(1, sq.t / 0.9);
      sq.group.position.lerpVectors(sq.from, sq.to, k);
      sq.group.position.y += Math.sin(k * Math.PI) * 0.9;   // 跳跃弧线
      sq.group.rotation.y = Math.atan2(sq.to.x - sq.from.x, sq.to.z - sq.from.z);
      if (k >= 1) {
        if (sq.state === 'down') { sq.state = 'gnaw'; sq.timer = 3 + Math.random() * 2; sq.t = 0; }
        else { sq.state = 'tree'; sq.timer = 8 + Math.random() * 8; sq.group.rotation.y = 0.8; }
      }
    } else if (sq.state === 'gnaw') {
      // 啃食：低头快速点啄 + 身体轻抖
      sq.head.rotation.x = 0.35 + Math.abs(Math.sin(sq.t * 9)) * 0.3;
      sq.group.position.y = Math.abs(Math.sin(sq.t * 9)) * 0.03;
      sq.timer -= dt;
      if (sq.timer <= 0) {
        sq.head.rotation.x = 0;
        sq.from = sq.group.position.clone();
        sq.to = new THREE.Vector3(SQUIRREL_TREE.x, SQUIRREL_TREE.perchY, SQUIRREL_TREE.z);
        sq.state = 'up'; sq.t = 0;
      }
    }
  }

  /* ======================= Q 版动物建模 ======================= */

  function makeEyes(parent, radius, dx, dy, dz, scale) {
    const eyes = [];
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x2b2320 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let s = -1; s <= 1; s += 2) {
      const eye = new THREE.Group();
      const w = mesh(sphere(radius, 16, 14), whiteMat, 0, 0, 0, eye, false, false);
      w.scale.set(1, 1.15, 0.55);
      const p = mesh(sphere(radius * 0.62, 14, 12), pupilMat, 0, 0, radius * 0.5, eye, false, false);
      p.scale.set(1, 1.1, 0.5);
      const g = mesh(sphere(radius * 0.26, 8, 8), glintMat, radius * 0.28, radius * 0.3, radius * 0.72, eye, false, false);
      g.scale.set(1, 1, 0.5);
      eye.position.set(dx * s, dy, dz);
      if (scale) eye.scale.setScalar(scale);
      parent.add(eye);
      eyes.push(eye);
    }
    return eyes;
  }

  function blushSpots(parent, r, dx, dy, dz) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb3c1, transparent: true, opacity: 0.55 });
    for (let s = -1; s <= 1; s += 2) {
      const b = mesh(new THREE.CircleGeometry(r, 12), mat, dx * s, dy, dz, parent, false, false);
      b.scale.y = 0.7;
    }
  }

  function buildLegs(parent, color, count, bodyY, spread, len, radius) {
    const mat = toon(color);
    const legs = [];
    const geo = new THREE.CylinderGeometry(radius, radius * 0.88, len, 8);
    for (let i = 0; i < count; i++) {
      const s = i % 2 === 0 ? -1 : 1;
      const row = i < 2 ? -1 : 1;
      const leg = mesh(geo, mat, spread.x * s, bodyY, spread.z * row, parent);
      leg.userData.baseY = bodyY;
      legs.push(leg);
    }
    return legs;
  }

  function buildChicken(scale) {
    const g = new THREE.Group();
    const rig = { group: g, type: 'chicken', parts: {}, bob: Math.random() * 6 };
    const body = mesh(sphere(0.62, 20, 16), toon(0xfff8ea), 0, 0.72, 0, g);
    body.scale.set(1, 0.92, 1.05);
    outline(body, 1.06, 0x6a5546);
    const head = mesh(sphere(0.42, 20, 16), toon(0xfff8ea), 0, 1.34, 0.16, g);
    outline(head, 1.07, 0x6a5546);
    rig.parts.head = head;
    rig.parts.eyes = makeEyes(head, 0.12, 0.17, 0.06, 0.34);
    blushSpots(head, 0.075, 0.29, -0.08, 0.3);
    const beak = mesh(new THREE.ConeGeometry(0.11, 0.26, 6), toon(0xffc04d), 0, 1.3, 0.55, g);
    beak.rotation.x = Math.PI / 2;
    mesh(sphere(0.14, 12, 10), toon(0xef5350), 0, 1.76, 0.1, g);
    mesh(sphere(0.1, 10, 8), toon(0xef5350), 0, 1.68, 0.34, g);
    const wingL = mesh(sphere(0.24, 12, 10), toon(0xffeccf), -0.58, 0.72, 0, g);
    wingL.scale.set(0.55, 0.9, 1.1);
    const wingR = wingL.clone();
    wingR.position.x = 0.58;
    g.add(wingR);
    rig.parts.legs = buildLegs(g, 0xffb347, 2, 0.24, { x: 0.2, z: 0 }, 0.48, 0.055);
    const tail = mesh(sphere(0.22, 12, 10), toon(0xffe0b0), 0, 0.86, -0.62, g);
    tail.scale.set(0.7, 1, 0.9);
    rig.parts.tail = tail;
    blinker(rig);
    g.scale.setScalar(scale || 1);
    return rig;
  }

  function buildCow(scale, sheep) {
    const g = new THREE.Group();
    const bodyColor = sheep ? 0xfffdf8 : 0xfff6f2;
    const accent = sheep ? 0xf0e6dc : 0x4a4a52;
    const rig = { group: g, type: sheep ? 'sheep' : 'cow', parts: {}, bob: Math.random() * 6 };
    const body = mesh(sphere(1.02, 24, 18), toon(bodyColor), 0, 1.05, 0, g);
    body.scale.set(0.86, 0.88, 1.22);
    outline(body, 1.05, 0x6a5546);
    rig.parts.body = body;

    if (!sheep) {
      for (let i = 0; i < 3; i++) {
        const spot = mesh(sphere(0.3, 12, 10), toon(accent), -0.5 + Math.random() * 0.2, 1.2 + i * 0.22, -0.5 + i * 0.5, g);
        spot.scale.set(0.5, 0.5, 0.62);
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const puff = mesh(sphere(0.34, 12, 10), toon(0xffffff), -0.7 + Math.random() * 1.4, 1.4 + Math.random() * 0.35, -0.8 + Math.random() * 1.6, g);
        puff.scale.setScalar(0.85 + Math.random() * 0.4);
      }
    }

    const head = mesh(sphere(0.62, 22, 18), toon(bodyColor), 0, 1.72, 0.92, g);
    outline(head, 1.06, 0x6a5546);
    rig.parts.head = head;
    const snout = mesh(sphere(0.33, 16, 12), toon(0xf7b4c0), 0, 1.56, 1.42, g);
    snout.scale.set(1, 0.78, 0.7);
    rig.parts.eyes = makeEyes(head, 0.14, 0.28, 0.12, 0.52);
    blushSpots(head, 0.09, 0.48, -0.12, 0.42);

    if (!sheep) {
      const hornMat = toon(0xd9c9a3);
      for (let s = -1; s <= 1; s += 2) {
        const horn = mesh(new THREE.TorusGeometry(0.17, 0.055, 6, 10, Math.PI * 1.1), hornMat, 0.34 * s, 1.98, 0.86, g);
        horn.rotation.z = s * 0.6;
      }
    } else {
      const earMat = toon(0xf0e0d2);
      for (let s = -1; s <= 1; s += 2) {
        const ear = mesh(sphere(0.2, 12, 10), earMat, 0.6 * s, 1.96, 0.86, g);
        ear.scale.set(0.6, 0.9, 1.4);
        ear.rotation.z = s * 0.7;
      }
    }

    rig.parts.legs = buildLegs(g, sheep ? 0xddcfc2 : 0xf0e2dc, 4, 0.34, { x: 0.42, z: 0.62 }, 0.66, 0.12);
    const tail = mesh(sphere(0.16, 10, 8), toon(accent), 0, 1.35, -1.15, g);
    rig.parts.tail = tail;
    blinker(rig);
    g.scale.setScalar(scale || 1);
    return rig;
  }

  function buildRabbit(scale) {
    const g = new THREE.Group();
    const rig = { group: g, type: 'anjela', parts: {}, bob: Math.random() * 6 };
    const body = mesh(sphere(0.5, 20, 16), toon(0xfffdf8), 0, 0.62, 0, g);
    body.scale.set(0.95, 0.94, 1.1);
    outline(body, 1.06, 0x6a5546);
    const head = mesh(sphere(0.36, 20, 16), toon(0xfffdf8), 0, 1.16, 0.18, g);
    outline(head, 1.07, 0x6a5546);
    rig.parts.head = head;
    rig.parts.eyes = makeEyes(head, 0.115, 0.15, 0.05, 0.3);
    blushSpots(head, 0.07, 0.25, -0.08, 0.26);
    mesh(sphere(0.07, 10, 8), toon(0xf7b8c4), 0, 1.1, 0.52, g);
    const earGeo = THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.08, 0.4, 4, 8)
      : new THREE.CylinderGeometry(0.08, 0.08, 0.52, 8);
    for (let s = -1; s <= 1; s += 2) {
      const ear = mesh(earGeo, toon(0xfffdf8), 0.16 * s, 1.6, 0.1, g);
      ear.scale.set(1, 1, 0.7);
      ear.rotation.z = s * 0.22;
    }
    rig.parts.legs = [mesh(sphere(0.14, 10, 8), toon(0xf1e2e6), -0.3, 0.14, 0.42, g), mesh(sphere(0.14, 10, 8), toon(0xf1e2e6), 0.3, 0.14, 0.42, g)];
    const tail = mesh(sphere(0.16, 10, 8), toon(0xffffff), 0, 0.72, -0.52, g);
    rig.parts.tail = tail;
    blinker(rig);
    g.scale.setScalar(scale || 1);
    return rig;
  }

  function buildDog(scale) {
    const g = new THREE.Group();
    const rig = { group: g, type: 'dog', parts: {}, bob: Math.random() * 6 };
    const body = mesh(sphere(0.46, 20, 16), toon(0xf3c48a), 0, 0.56, 0, g);
    body.scale.set(0.85, 0.8, 1.25);
    outline(body, 1.06, 0x6a5546);
    const head = mesh(sphere(0.36, 20, 16), toon(0xf3c48a), 0, 1.02, 0.42, g);
    outline(head, 1.07, 0x6a5546);
    rig.parts.head = head;
    rig.parts.eyes = makeEyes(head, 0.11, 0.15, 0.06, 0.3);
    const snout = mesh(sphere(0.17, 12, 10), toon(0xfff2dd), 0, 0.94, 0.72, g);
    snout.scale.set(1, 0.7, 0.8);
    mesh(sphere(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0x3a2f2a }), 0, 0.99, 0.87, g, false, false);
    for (let s = -1; s <= 1; s += 2) {
      const ear = mesh(sphere(0.16, 10, 8), toon(0xe2a05f), 0.26 * s, 1.24, 0.34, g);
      ear.scale.set(0.6, 1, 0.8);
      ear.rotation.z = s * 0.5;
    }
    rig.parts.legs = buildLegs(g, 0xe2a05f, 4, 0.16, { x: 0.22, z: 0.3 }, 0.32, 0.075);
    rig.parts.tail = mesh(new THREE.ConeGeometry(0.1, 0.4, 8), toon(0xe2a05f), 0, 0.78, -0.6, g);
    rig.parts.tail.rotation.x = -0.7;
    blinker(rig);
    g.scale.setScalar(scale || 1);
    return rig;
  }

  function buildHorse(scale) {
    const g = new THREE.Group();
    const rig = { group: g, type: 'horse', parts: {}, bob: Math.random() * 6 };
    const body = mesh(sphere(0.86, 24, 18), toon(0xb87333), 0, 1.32, 0, g);
    body.scale.set(0.82, 0.9, 1.35);
    outline(body, 1.05, 0x5c3b22);
    rig.parts.body = body;
    const mane = mesh(new THREE.BoxGeometry(0.18, 0.5, 1.1), toon(0x5c3b22), 0, 1.9, 0.1, g);
    mane.rotation.x = -0.18;
    const neck = mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.9, 12), toon(0xb87333), 0, 1.85, 0.7, g);
    neck.rotation.x = 0.4;
    const head = mesh(sphere(0.44, 20, 16), toon(0xb87333), 0, 2.28, 1.02, g);
    head.scale.set(0.82, 0.95, 1.25);
    outline(head, 1.07, 0x5c3b22);
    rig.parts.head = head;
    rig.parts.eyes = makeEyes(head, 0.13, 0.2, 0.1, 0.4);
    const snout = mesh(sphere(0.24, 14, 12), toon(0xe8c9a8), 0, 2.14, 1.5, g);
    snout.scale.set(0.85, 0.72, 0.9);
    for (let s = -1; s <= 1; s += 2) {
      const ear = mesh(new THREE.ConeGeometry(0.1, 0.34, 6), toon(0xb87333), 0.2 * s, 2.72, 0.86, g);
      ear.rotation.z = s * 0.25;
    }
    rig.parts.legs = buildLegs(g, 0xa5652c, 4, 0.42, { x: 0.36, z: 0.56 }, 0.84, 0.115);
    rig.parts.tail = mesh(new THREE.ConeGeometry(0.14, 0.8, 8), toon(0x5c3b22), 0, 1.6, -1.15, g);
    rig.parts.tail.rotation.x = 0.6;
    blinker(rig);
    g.scale.setScalar(scale || 1);
    return rig;
  }

  function buildRider() {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.7, 12), toon(0x4a90d9), 0, 0.35, 0, g);
    void body;
    const head = mesh(sphere(0.24, 16, 14), toon(0xffdcb8), 0, 0.9, 0, g);
    mesh(sphere(0.26, 16, 12), toon(0xf6d76e), 0, 1.0, 0, g).scale.set(1.15, 0.55, 1.15);
    rigEyes(head);
    return g;
  }

  function rigEyes(head) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x2b2320 });
    for (let s = -1; s <= 1; s += 2) mesh(sphere(0.035, 8, 8), mat, 0.09 * s, 0.04, 0.22, head, false, false);
  }

  /* ======================= 动物同步与动画 ======================= */

  function animalSignature(state) {
    return state.animals.map(a => a.id + a.type + a.produceReady + a.sick + Math.floor(a.points / 25)).join('|') +
      '|' + (state.horse.owned ? 'H' : '-') + (state.horse.riding ? 'R' : '-') + (state.dog.owned ? 'D' : '-') +
      // 飞禽伙伴领养状态变化也要重建（老鹰 / 鸬鹚的 3D 模型随之出现或移除）
      '|' + ((state.pets && state.pets.eagle && state.pets.eagle.owned) ? 'E' : '-') +
      ((state.pets && state.pets.cormorant && state.pets.cormorant.owned) ? 'C' : '-');
  }

  /** 爱心值 → 等级（与 ui.js / game.js 的 25 分一档保持一致） */
  function heartTierOf(points) {
    const lv = Math.floor((points || 0) / 25);
    if (lv >= 8) return 'red';
    if (lv >= 4) return 'yellow';
    return 'gray';
  }

  /** 撒娇爱心指示：对话气泡 + 爱心（低心灰 / 中黄 / 高红），气泡底保持白色不参与变色 */
  function charmHeartMesh(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: color });
    // 气泡底：白色圆底 + 小尾巴（变色时跳过，见 updateAnimal 里的 traverse）
    const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    bubbleMat.userData.keep = true;
    const bubble = mesh(sphere(0.36, 14, 12), bubbleMat, 0, 0.02, -0.14, g, false, false);
    bubble.scale.set(1.25, 1.05, 0.5);
    const tail = mesh(new THREE.ConeGeometry(0.09, 0.2, 6), bubbleMat, 0.12, -0.36, -0.14, g, false, false);
    tail.rotation.x = 0.5;
    mesh(sphere(0.17, 12, 12), mat, -0.13, 0.09, 0, g, false, false);
    mesh(sphere(0.17, 12, 12), mat, 0.13, 0.09, 0, g, false, false);
    const tip = mesh(new THREE.ConeGeometry(0.245, 0.32, 4), mat, 0, -0.17, 0, g, false, false);
    tip.rotation.z = Math.PI;
    tip.rotation.y = Math.PI / 4;
    g.visible = false;
    return g;
  }

  /** emoji 贴图精灵（生病 💔 指示用；canvas 现画现用，file:// 下可用） */
  function emojiSprite(emoji, scale) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const cx = cv.getContext('2d');
    cx.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(emoji, 64, 70);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  /** 把撒娇爱心挂到动物头顶：低心灰 / 中黄 / 高红（点击动物后浮现） */
  function attachCharmHeart(rig, y, scale) {
    if (!rig || rig.charmHeart) return rig;
    rig.charmHeartY = y || 2.5;
    rig.charmHeartS = scale || 1;
    rig.charmHeart = charmHeartMesh(0xa9a9b0);
    rig.charmHeart.position.set(0, rig.charmHeartY, 0);
    rig.group.add(rig.charmHeart);
    return rig;
  }

  /** 造型统一入口：优先复用 models.js 的萌版 3D 建模（与出图素材同源），异常时回退场景内置建模 */
  function buildRigFor(a) {
    const t = D.animalTypes[a.type] || {};
    const scale = t.scale || 1;
    if (window.Models && typeof window.Models.buildAnimal === 'function') {
      try {
        if (typeof window.Models.setShading === 'function') window.Models.setShading('scene');
        const rig = window.Models.buildAnimal(a.type, scale);
        if (rig && rig.group && rig.parts) return rig;
      } catch (e) {
        console.warn('复用 models.js 建模失败，回退内置建模：' + a.type, e);
      }
    }
    if (a.type === 'chicken') return buildChicken(scale);
    if (a.type === 'sheep') return buildCow(scale, true);
    if (a.type === 'anjela') return buildRabbit(scale);
    return buildCow(scale, false);
  }

  /** 给动物叠加一层不可见拾取体：手机端手指点击的容错更大，避免点不中（不参与渲染） */
  function addAnimalHitbox(group, animalId, size) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]),
      new THREE.MeshBasicMaterial({ visible: false }));
    box.position.y = size[1] / 2;
    box.userData.pickType = 'animal';
    box.userData.animalId = animalId;
    group.add(box);
    pickables.push(box);
    return box;
  }

  /* 马 / 狗 / 猫的自由活动区（全场随意跑，不受栏杆限制；猫可以翻栏杆，走道也算活动区） */
  const FREE_RECTS = [
    { minX: -14, maxX: 14, minZ: 24, maxZ: 30 },      // 南边散养大草地
    { minX: -13, maxX: 13, minZ: -37, maxZ: -32.5 }, // 放牧空地也可以去
    { minX: -17, maxX: 17, minZ: 5.5, maxZ: 7.5 },   // 羊驼栏与空栏之间的走道
    { minX: -17, maxX: 17, minZ: -21, maxZ: -19 },   // 牛羊栏与鸡栏之间的走道
    { minX: 17, maxX: 19, minZ: -30, maxZ: 30 }      // 东侧通道
  ];
  /* 放牧出栏路径：从各栏北门走出去（穿门洞，不穿墙），到放牧空地；收回时原路返回
     牛/羊栏直通空地；鸡栏走两栏中间的缝；兔/羊驼栏先沿栏间走道往西，再从西侧北上 */
  const GRAZE_ROUTES = {
    cow: [[-8.5, -29], [-8.5, -33.5]],
    sheep: [[8.5, -29], [8.5, -33.5]],
    chicken: [[0, -19], [0, -21.5], [0, -33.5]],
    anjela: [[0, -10], [-17.5, -11], [-17.5, -33.5]],
    llama: [[0, -1.5], [-17.5, -2.5], [-17.5, -33.5]]
  };
  /* 猫上屋顶的落点（农舍 / 谷仓屋顶）与屋前起跳点 */
  const ROOF_SPOTS = [
    { x: 14, z: 19.8, y: 4.4, gx: 14, gz: 22.5 },
    { x: -20, z: -6, y: 3.6, gx: -20, gz: -2.5 }
  ];

  /* 按当前区域取一个散步范围：栏内 / 放牧空地 / 自由活动区 */
  function roamRectFor(rig) {
    if (rig.zone === 'meadow') {
      const M = LAYOUT.meadow;
      return { minX: M.minX + 1.5, maxX: M.maxX - 1.5, minZ: M.minZ + 1, maxZ: M.maxZ - 1 };
    }
    if (rig.zone === 'free') return FREE_RECTS[Math.floor(Math.random() * FREE_RECTS.length)];
    const R = rig.penKey ? penByKey(rig.penKey) : null;
    if (R) return { minX: R.minX + 0.7, maxX: R.maxX - 0.7, minZ: R.minZ + 0.7, maxZ: R.maxZ - 0.7 };
    return { minX: -5, maxX: 5, minZ: 8, maxZ: 12 };
  }

  function spawnAnimals(state) {
    animalRigs.forEach(r => groups.animals.remove(r.group));
    animalRigs = [];
    if (horseRig) { groups.animals.remove(horseRig.group); horseRig = null; }
    if (dogRig) { groups.animals.remove(dogRig.group); dogRig = null; }
    if (eagleRig) { groups.animals.remove(eagleRig.group); eagleRig = null; }
    if (cormorantRig) { groups.animals.remove(cormorantRig.group); cormorantRig = null; }
    // 清掉上一轮注册的动物拾取对象，避免已移除的网格残留在拾取列表
    pickables = pickables.filter(o => !(o.userData && o.userData.pickType === 'animal'));

    /* 栏内网格站位（动物按真实比例缩小后，栏里仍有空地走动） */
    const penSlots = (key, n) => {
      const R = penByKey(key);
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * (R.maxX - R.minX) / (R.maxZ - R.minZ))));
      const rows = Math.max(1, Math.ceil(n / cols));
      const out = [];
      for (let i = 0; i < n; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        out.push({
          x: R.minX + (c + 0.5) * (R.maxX - R.minX) / cols,
          z: R.minZ + (r + 0.5) * (R.maxZ - R.minZ) / rows
        });
      }
      return out;
    };
    const penCount = {};
    const typeCount = {};
    state.animals.forEach(a => { typeCount[a.type] = (typeCount[a.type] || 0) + 1; });
    state.animals.forEach(a => {
      const rig = buildRigFor(a);
      rig.id = a.id;
      rig.type = a.type;
      const tScale = (D.animalTypes[a.type] && D.animalTypes[a.type].scale) || 1;
      rig.baseScale = tScale;
      rig.baseY = 0;
      rig.zone = 'pen';
      rig.eating = 0; rig.eatTimer = 2 + Math.random() * 4;
      rig.trip = null; rig.roof = null;
      const key = LAYOUT.penOf[a.type];
      const idx = (penCount[a.type] = (penCount[a.type] || 0));
      penCount[a.type] = idx + 1;
      if (a.type === 'cat') {
        /* 猫散养：全场自由跑，也会上屋顶 */
        rig.zone = 'free';
        rig.group.position.set(-6 + Math.random() * 4, 0, 25 + Math.random() * 3);
      } else if (key) {
        const slots = penSlots(key, Math.max(1, typeCount[a.type]));
        const s = slots[Math.min(idx, slots.length - 1)];
        rig.group.position.set(s.x + (Math.random() - 0.5) * 0.8, 0, s.z + (Math.random() - 0.5) * 0.8);
        rig.penKey = key;
      } else {
        rig.group.position.set(0, 0, 10 + Math.random() * 2);
      }
      rig.wander = { tx: rig.group.position.x, tz: rig.group.position.z, timer: 1 + Math.random() * 3, speed: 0.5 + Math.random() * 0.4 };
      rig.group.traverse(o => { if (o.isMesh) { o.userData.pickType = 'animal'; o.userData.animalId = a.id; pickables.push(o); } });
      addAnimalHitbox(rig.group, a.id, [Math.max(0.9, tScale * 1.6), Math.max(1.0, tScale * 1.9), Math.max(0.9, tScale * 1.6)]);   // 手机端点选容错
      attachCharmHeart(rig, tScale * 1.8 + 0.3, 0.5 + tScale * 0.5);
      groups.animals.add(rig.group);
      animalRigs.push(rig);
    });

    if (state.dog.owned) {
      dogRig = buildDog(0.48);   // 狗小（v12 比例：约牛的 0.42）
      dogRig.group.position.set(10, 0, 25);
      dogRig.walkSpeed = 0.95;            // 小狗比马更活跃，走动明显
      dogRig.id = 'dog'; dogRig.type = 'dog'; dogRig.baseScale = 0.48; dogRig.baseY = 0;
      dogRig.zone = 'free';
      dogRig.eating = 0; dogRig.eatTimer = 2 + Math.random() * 4;
      dogRig.trip = null; dogRig.roof = null;
      dogRig.wander = { tx: dogRig.group.position.x, tz: dogRig.group.position.z, timer: 1.2, pause: false };
      attachCharmHeart(dogRig, 0.95, 0.6);
      dogRig.group.traverse(o => { if (o.isMesh) { o.userData.pickType = 'animal'; o.userData.animalId = 'dog'; pickables.push(o); } });
      addAnimalHitbox(dogRig.group, 'dog', [0.9, 1.1, 0.9]);   // 手机端点选容错
      groups.animals.add(dogRig.group);
    }

    if (state.horse.owned) {
      horseRig = buildHorse(1.13);   // 马高大（v12 比例：比牛略高）
      horseRig.group.position.set(-6, 0, 26);
      horseRig.id = 'horse'; horseRig.type = 'horse'; horseRig.baseScale = 1.13; horseRig.baseY = 0;
      horseRig.zone = 'free';
      horseRig.walkSpeed = 0.62;
      horseRig.eating = 0; horseRig.eatTimer = 2 + Math.random() * 4;
      horseRig.trip = null; horseRig.roof = null;
      attachCharmHeart(horseRig, 3.2, 1.1);
      horseRig.group.traverse(o => { if (o.isMesh) { o.userData.pickType = 'animal'; o.userData.animalId = 'horse'; pickables.push(o); } });
      addAnimalHitbox(horseRig.group, 'horse', [1.6, 2.6, 1.6]);   // 手机端点选容错
      horseRig.wander = { tx: horseRig.group.position.x, tz: horseRig.group.position.z, timer: 1.6, pause: false };
      if (state.horse.riding) {
        riderRig = buildRider();
        riderRig.position.set(0, 1.8, -0.1);
        horseRig.group.add(riderRig);
      }
      groups.animals.add(horseRig.group);
    }

    spawnPets(state);
  }

  /** 飞禽伙伴摆放：老鹰在空中巡视，鸬鹚守在池塘边（纯表现层，不读写游戏状态） */
  function spawnPets(state) {
    const pets = state.pets || {};
    if (pets.eagle && pets.eagle.owned) {
      eagleRig = buildPetRig('eagle', 1.1);
      if (eagleRig) {
        // 航线中心选在牛羊栏上空（投影落在画面中上部），避免贴住屏幕顶端被 HUD 遮挡
        eagleRig.home = { x: 0, y: 4.2, z: -14, rx: 5.2, rz: 3.2 };
        eagleRig.group.position.set(eagleRig.home.x + eagleRig.home.rx, eagleRig.home.y, eagleRig.home.z);
        groups.animals.add(eagleRig.group);
      }
    }
    if (pets.cormorant && pets.cormorant.owned) {
      cormorantRig = buildPetRig('cormorant', 1.0);
      if (cormorantRig) {
        cormorantRig.baseYaw = -0.75;
        cormorantRig.group.position.set(LAYOUT.pond.x + 2.6, 0, LAYOUT.pond.z + 2.0);
        cormorantRig.group.rotation.y = cormorantRig.baseYaw;
        groups.animals.add(cormorantRig.group);
      }
    }
  }

  /** 飞禽伙伴：复用 models.js 的正式 3D 造型（与造型稿同源），异常时返回 null 不摆放 */
  function buildPetRig(key, scale) {
    if (!window.Models || typeof window.Models.buildPet !== 'function') return null;
    try {
      if (typeof window.Models.setShading === 'function') window.Models.setShading('scene');
      const rig = window.Models.buildPet(key, scale);
      if (rig && rig.group && rig.parts) { rig.id = 'pet_' + key; return rig; }
    } catch (e) {
      console.warn('飞禽伙伴建模失败，跳过摆放：' + key, e);
    }
    return null;
  }

  /** 统计 rig 内网格数量（stats 自检用，确认模型确实有实体几何而非空组） */
  function countMeshes(group) {
    let n = 0;
    group.traverse(o => { if (o.isMesh) n++; });
    return n;
  }

  /** 飞禽伙伴动画：老鹰在牧场上空盘旋巡视，鸬鹚在塘边摇摆、偶尔低头啄水（纯表现） */
  function updatePets(rig, dt) {
    if (!rig) return;
    rig.bob += dt * 2.0;
    if (rig.parts.body) {
      const sy = rig.parts.body.userData.sy || (rig.parts.body.userData.sy = rig.parts.body.scale.y);
      rig.parts.body.scale.y = sy * (1 + Math.sin(rig.bob) * 0.022);
    }
    rig.blinkTimer -= dt;
    if (rig.blinkTimer <= 0) { rig.blinkTimer = 1.6 + Math.random() * 3.2; rig.blinkPhase = 0.16; }
    if (rig.blinkPhase > 0) {
      rig.blinkPhase -= dt;
      const s = rig.blinkPhase > 0 ? 0.14 : 1;
      (rig.parts.eyes || []).forEach(e => { e.scale.y = (e.userData.sy || (e.userData.sy = e.scale.y)) * s; });
    } else {
      (rig.parts.eyes || []).forEach(e => { e.scale.y = e.userData.sy || 1; });
    }

    if (rig.id === 'pet_eagle') {
      // 盘旋：在牧场上空走椭圆航线 + 轻微升降，机头始终朝飞行方向
      const h = rig.home || { x: 0, y: 4.2, z: 0.6, rx: 5.2, rz: 3.2 };
      const rx = h.rx || 5.2, rz = h.rz || 3.2;
      const a = anim.t * 0.42;
      rig.group.position.set(h.x + Math.cos(a) * rx, h.y + Math.sin(anim.t * 1.15) * 0.32, h.z + Math.sin(a) * rz);
      rig.group.rotation.y = -a + Math.PI / 2;
      if (rig.parts.wings) rig.parts.wings.forEach((w, i) => { w.rotation.z = Math.sin(anim.t * 3.4 + i * Math.PI) * 0.26; });
      if (rig.parts.head) rig.parts.head.rotation.y = Math.sin(anim.t * 0.7) * 0.3;
      if (rig.parts.tail) rig.parts.tail.rotation.z = Math.sin(anim.t * 1.6) * 0.12;
    } else {
      // 鸬鹚：塘边原地小幅转身，间歇低头啄水，翅尖轻抖
      const dip = Math.sin(anim.t * 0.9);
      rig.group.rotation.y = (rig.baseYaw || 0) + Math.sin(anim.t * 0.5) * 0.32;
      if (rig.parts.head) rig.parts.head.rotation.x = dip > 0.72 ? -0.55 : Math.sin(anim.t * 0.8) * 0.1;
      if (rig.parts.wings) rig.parts.wings.forEach((w, i) => { w.rotation.z = Math.sin(anim.t * 2.2 + i * Math.PI) * 0.14; });
      if (rig.parts.tail) rig.parts.tail.rotation.z = Math.sin(anim.t * 1.3) * 0.1;
      rig.group.position.y = Math.abs(Math.sin(anim.t * 1.1)) * 0.045;
    }
  }

  function updateAnimal(rig, dt, state) {
    const isHorse = rig.type === 'horse';
    const riding = isHorse && state.horse.riding;
    if (rig.baseY === undefined) rig.baseY = 0;

    // 呼吸
    rig.bob += dt * 2.2;
    if (rig.parts.body) {
      rig.parts.body.scale.y = (rig.parts.body.userData.sy || (rig.parts.body.userData.sy = rig.parts.body.scale.y)) * (1 + Math.sin(rig.bob) * 0.025);
    }
    if (rig.parts.tail) rig.parts.tail.rotation.y = Math.sin(rig.bob * 1.6) * 0.35;
    // 低头吃东西：吃食状态低头 + 点啄；放牧中的动物在空地也低头吃草；赶路 / 撒娇 / 骑乘时不低头
    if (rig.parts.head) {
      const nibble = rig.eating > 0 ? Math.sin(anim.t * 9) * 0.08 : 0;
      const targetHeadY = (rig.eating > 0 || (rig.grazing && !rig.trip)) ? -0.5 + nibble : 0;
      rig.parts.head.rotation.x += ((rig.parts.head.rotation.x || 0) - targetHeadY) * -dt * 3;
    }
    // 吃食计时：随机进入吃食状态 2~4 秒，吃完再走
    if (!rig.trip && !rig.roof && (rig.charm || 0) <= 0 && !riding) {
      if (rig.eating > 0) { rig.eating -= dt; }
      else {
        rig.eatTimer = (rig.eatTimer === undefined ? 2 + Math.random() * 4 : rig.eatTimer) - dt;
        if (rig.eatTimer <= 0) { rig.eating = 2 + Math.random() * 2; rig.eatTimer = 4 + Math.random() * 6; }
      }
    } else if (rig.eating > 0) { rig.eating = 0; }

    // 眨眼
    rig.blinkTimer -= dt;
    if (rig.blinkTimer <= 0) {
      rig.blinkTimer = 1.5 + Math.random() * 3.5;
      rig.blinkPhase = 0.18;
    }
    if (rig.blinkPhase > 0) {
      rig.blinkPhase -= dt;
      const s = rig.blinkPhase > 0 ? 0.12 : 1;
      (rig.parts.eyes || []).forEach(e => { e.scale.y = (e.userData.sy || (e.userData.sy = e.scale.y)) * s; });
    } else {
      (rig.parts.eyes || []).forEach(e => { e.scale.y = e.userData.sy || 1; });
    }

    // 摸了享受地眯眼：撒娇期间眼睛眯成细缝（1~2 秒），摸完恢复正常
    if (rig.charm > 0 && !riding) {
      (rig.parts.eyes || []).forEach(e => { e.scale.y = (e.userData.sy || 1) * 0.15; });
    }

    // 撒娇互动：点击动物后朝玩家蹦跳撒娇，头顶爱心按爱心值显示 灰 / 黄 / 红
    // 家畜读 state.animals，马 / 小狗读 state.horse / state.dog
    const petKey = rig.id === 'dog' ? 'dog' : (rig.id === 'horse' ? 'horse' : null);
    const pet = petKey ? state[petKey] : null;
    const aRef = state.animals.find(x => x.id === rig.id);
    const charmSrc = aRef || pet;
    if (charmSrc) {
      if (charmSrc.charm > 0) {
        rig.charm = charmSrc.charm;
        charmSrc.charm = Math.max(0, charmSrc.charm - dt);
      } else if (rig.charm) {
        rig.charm = 0;
      }
    }
    const charmPoints = aRef ? (aRef.points || 0) : (pet ? (pet.points || 0) : 0);
    if (rig.charm > 0 && !riding) {
      const hop = Math.abs(Math.sin(anim.t * 6)) * 0.32;
      rig.group.position.y = (rig.baseY || 0) + hop;
      rig.group.rotation.y += (0 - rig.group.rotation.y) * Math.min(1, dt * 5);
      if (rig.parts.head) rig.parts.head.rotation.z = Math.sin(anim.t * 9) * 0.18;
      if (rig.parts.tail) rig.parts.tail.rotation.y = Math.sin(anim.t * 10) * 0.6;
      if (rig.charmHeart) {
        const tier = heartTierOf(charmPoints);
        if (rig.charmTier !== tier) {
          rig.charmTier = tier;
          const col = tier === 'red' ? 0xef4b64 : (tier === 'yellow' ? 0xf5b731 : 0xa9a9b0);
          rig.charmHeart.traverse(o => { if (o.material && o.material.color && !(o.material.userData && o.material.userData.keep)) o.material.color.setHex(col); });
        }
        rig.charmHeart.visible = true;
        const k = Math.min(1, rig.charm / 2.4);
        rig.charmHeart.scale.setScalar((rig.charmHeartS || 1) * (0.7 + k * 0.45));
        rig.charmHeart.position.y = (rig.charmHeartY || 2.5) + Math.abs(Math.sin(anim.t * 5)) * 0.22;
        rig.charmHeart.rotation.y += dt * 1.8;
      }
    } else {
      if (!riding && rig.group.position.y !== (rig.baseY || 0)) rig.group.position.y = rig.baseY || 0;
      if (rig.parts.head) rig.parts.head.rotation.z = (rig.parts.head.rotation.z || 0) * (1 - Math.min(1, dt * 4));
      if (rig.charmHeart) rig.charmHeart.visible = false;
    }

    // 移动
    let dirX = 0, dirZ = 0, moving = false;
    if (riding) {
      /* 骑马绕南边散养大草地转圈（中心约 0,27，不再是老牧场中心） */
      anim.rideAngle += dt * 0.55;
      const rx = Math.sin(anim.rideAngle) * 10;
      const rz = 27 + Math.cos(anim.rideAngle) * 3.2;
      rig.group.position.x += (rx - rig.group.position.x) * Math.min(1, dt * 3);
      rig.group.position.z += (rz - rig.group.position.z) * Math.min(1, dt * 3);
      rig.group.position.y = Math.abs(Math.sin(anim.rideAngle * 8)) * 0.22;
      rig.group.rotation.y = Math.atan2(Math.cos(anim.rideAngle) * 10, -Math.sin(anim.rideAngle) * 3.2) + Math.PI / 2;
      moving = true;
      rig.speedFactor = 2.6;
    } else if (rig.charm > 0) {
      // 撒娇期间原地站定，互动动作更清晰
      moving = false;
    } else if (rig.trip) {
      /* 赶路：沿路径点走（放牧出栏 / 收回 / 上屋顶），走到点就换下一个点 */
      const pts = rig.trip.pts;
      const wp = pts[rig.trip.leg];
      if (wp) {
        const dx = wp.x - rig.group.position.x, dz = wp.z - rig.group.position.z;
        const targetY = wp.y === undefined ? (rig.baseY || 0) : wp.y;
        const dy = targetY - rig.group.position.y;
        const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
        const step = (rig.trip.speed || 2.6) * dt;
        if (dist < Math.max(0.4, step)) {
          rig.group.position.x = wp.x; rig.group.position.z = wp.z;
          if (wp.y !== undefined) { rig.group.position.y = wp.y; rig.baseY = wp.y; }
          rig.trip.leg++;
          if (rig.trip.leg >= pts.length) {
            const done = rig.trip;
            rig.trip = null;
            if (done.kind === 'graze') { rig.zone = 'meadow'; }
            else if (done.kind === 'return') { rig.zone = 'pen'; rig.baseY = 0; }
            else if (done.kind === 'roof') { rig.roof = { y: wp.y, timer: 6 + Math.random() * 4 }; }
            else if (done.kind === 'roofback') { rig.roof = null; rig.baseY = 0; }
          }
        } else {
          rig.group.position.x += (dx / dist) * step;
          rig.group.position.z += (dz / dist) * step;
          rig.group.position.y += (dy / dist) * step;
          rig.group.rotation.y = Math.atan2(dx, dz);
          moving = true;
        }
      } else { rig.trip = null; }
    } else if (rig.roof) {
      /* 在屋顶待着，待够了跳下来回地面 */
      rig.roof.timer -= dt;
      if (rig.roof.timer <= 0) {
        rig.trip = { kind: 'roofback', pts: [{ x: rig.roofBackX, z: rig.roofBackZ, y: 0 }], leg: 0, speed: 2.6 };
      }
      moving = false;
    } else if (rig.eating > 0) {
      // 吃东西时原地低头，不走动
      moving = false;
    } else {
      /* 放牧触发：放牧中 + 还在栏里 → 从北门走出去；收回 + 还在草地 → 走回栏里 */
      if (rig.grazing && rig.zone === 'pen' && rig.penKey && GRAZE_ROUTES[rig.penKey]) {
        const pts = GRAZE_ROUTES[rig.penKey].map(p => ({ x: p[0], z: p[1] }));
        const M = LAYOUT.meadow;
        pts.push({ x: M.minX + 1.5 + Math.random() * (M.maxX - M.minX - 3), z: M.minZ + 1 + Math.random() * (M.maxZ - M.minZ - 2) });
        rig.trip = { kind: 'graze', pts: pts, leg: 0, speed: 2.6 };
        rig.eating = 0;
      } else if (!rig.grazing && rig.zone === 'meadow' && rig.penKey) {
        const R = penByKey(rig.penKey);
        const pts = GRAZE_ROUTES[rig.penKey].slice().reverse().map(p => ({ x: p[0], z: p[1] }));
        pts.push({ x: R.cx, z: R.cz });
        rig.trip = { kind: 'return', pts: pts, leg: 0, speed: 2.6 };
        rig.eating = 0;
      } else if (rig.type === 'cat' && !rig.roof && !rig.trip && Math.random() < dt * 0.02) {
        /* 猫上屋顶：先走到屋前，再跳上屋顶待一会儿 */
        const spot = ROOF_SPOTS[Math.floor(Math.random() * ROOF_SPOTS.length)];
        rig.roofBackX = spot.gx; rig.roofBackZ = spot.gz;
        rig.trip = { kind: 'roof', pts: [{ x: spot.gx, z: spot.gz }, { x: spot.x, z: spot.z, y: spot.y }], leg: 0, speed: 2.6 };
        rig.eating = 0;
      }
      if (!rig.trip) {
        rig.wander.timer -= dt;
        if (rig.wander.timer <= 0) {
          rig.wander.timer = 1.6 + Math.random() * 3.4;
          const R = roamRectFor(rig);
          rig.wander.tx = R.minX + Math.random() * (R.maxX - R.minX);
          rig.wander.tz = R.minZ + Math.random() * (R.maxZ - R.minZ);
        }
        dirX = rig.wander.tx - rig.group.position.x;
        dirZ = rig.wander.tz - rig.group.position.z;
        const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (dist > 0.35) {
          const step = (rig.grazing ? 0.45 : 0.7) * (rig.walkSpeed || 1) * dt;
          rig.group.position.x += (dirX / dist) * step;
          rig.group.position.z += (dirZ / dist) * step;
          rig.group.rotation.y = Math.atan2(dirX, dirZ);
          moving = true;
        }
      }
      rig.speedFactor = undefined;
    }
    void dirX; void dirZ;

    // 走路摆腿
    const legs = rig.parts.legs || [];
    rig.walkPhase = (rig.walkPhase || 0) + dt * (moving ? 9 * (rig.speedFactor || 1) : 0);
    legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(rig.walkPhase + (i % 2) * Math.PI) * (moving ? (rig.type === 'dog' ? 0.5 : 0.35) : 0);
    });
    /* 走路颠簸（赶路时高度由路径点控制，不参与衰减） */
    if (!rig.trip) rig.group.position.y = ((rig.group.position.y || 0) - (rig.baseY || 0)) * 0.9 + (rig.baseY || 0) + (moving ? Math.abs(Math.sin(rig.walkPhase)) * 0.05 : 0);

    // 生病标记：头顶裂开的爱心 💔 + 脸上三条黑色下垂线（没精神），一眼可辨；病好即拆
    if (rig.sickFlag === undefined || rig.sickFlag !== rig.sick) {
      rig.sickFlag = rig.sick;
      if (rig.sick && !rig.sickMesh) {
        const grp = new THREE.Group();
        grp.position.set(0, (rig.charmHeartY || 2.5) + 0.3, 0);
        grp.add(emojiSprite('💔', Math.max(0.55, (rig.baseScale || 1) * 1.1)));
        rig.group.add(grp);
        rig.sickMesh = grp;
        // 脸上下垂线：挂在头上，随头一起动
        rig.sickLines = [];
        if (rig.parts.head) {
          const lineMat = new THREE.MeshBasicMaterial({ color: 0x2b2320 });
          [[-0.28, 0.3, 0.4, 0.5], [0, 0.34, 0.44, 0], [0.28, 0.3, 0.4, -0.5]].forEach(d => {
            const ln = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.02), lineMat);
            ln.position.set(d[0], d[1], d[2]);
            ln.rotation.z = d[3];
            rig.parts.head.add(ln);
            rig.sickLines.push(ln);
          });
        }
      } else if (!rig.sick && rig.sickMesh) {
        rig.group.remove(rig.sickMesh);
        rig.sickMesh = null;
        if (rig.sickLines) {
          rig.sickLines.forEach(ln => { if (ln.parent) ln.parent.remove(ln); });
          rig.sickLines = null;
        }
      }
    }
    if (rig.sickMesh) rig.sickMesh.position.y = (rig.charmHeartY || 2.5) + 0.3 + Math.sin(anim.t * 3) * 0.1;

    // 产物就绪光环
    if (rig.produceFlag !== rig.produce) {
      rig.produceFlag = rig.produce;
      if (rig.produce && !rig.produceMesh) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 18), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
        ring.position.set(0, rig.charmHeartY || 2.5, 0);
        ring.rotation.x = Math.PI / 2;
        rig.group.add(ring);
        rig.produceMesh = ring;
      } else if (!rig.produce && rig.produceMesh) {
        rig.group.remove(rig.produceMesh);
        rig.produceMesh = null;
      }
    }
    if (rig.produceMesh) {
      rig.produceMesh.rotation.z += dt * 2;
      rig.produceMesh.position.y = (rig.charmHeartY || 2.5) + Math.sin(anim.t * 4) * 0.08;
    }
  }

  /* ======================= 田地同步 ======================= */


  /* ======================= 田地同步：生长阶段造型 / 成熟图标 / 施肥标记 ======================= */

  const cropGeoCache = {};
  function geoOf(kind) {
    if (!cropGeoCache[kind]) {
      switch (kind) {
        case 'leaf':  cropGeoCache[kind] = new THREE.SphereGeometry(0.17, 10, 8); break;
        case 'stem':  cropGeoCache[kind] = new THREE.CylinderGeometry(0.034, 0.05, 1, 6); break;
        case 'ball':  cropGeoCache[kind] = new THREE.SphereGeometry(0.2, 12, 10); break;
        case 'cone':  cropGeoCache[kind] = new THREE.ConeGeometry(0.2, 0.5, 12); break;
        case 'cyl':   cropGeoCache[kind] = new THREE.CylinderGeometry(0.16, 0.17, 0.56, 12); break;
        case 'petal': cropGeoCache[kind] = new THREE.SphereGeometry(0.085, 8, 6); break;
        default:      cropGeoCache[kind] = new THREE.SphereGeometry(0.16, 10, 8);
      }
    }
    return cropGeoCache[kind];
  }

  /* 生长阶段判定：0 幼苗 / 1 生长 / 2 开花 / 3 结果成熟 */
  function cropStageIndex(p) {
    if (!p.cropType) return -1;
    if (p.harvestable) return 3;
    const ratio = p.maxGrowth ? Math.min(1, p.growthStage / p.maxGrowth) : 1;
    if (ratio < 0.25) return 0;
    if (ratio < 0.6) return 1;
    return 2;
  }

  function putMesh(parent, kind, color, x, y, z, sx, sy, sz, rx, ry, rz) {
    const m = new THREE.Mesh(geoOf(kind), toon(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }

  /* 花朵：六瓣 + 花心 */
  function addBlossom(parent, x, y, z, petalColor, heartColor, r) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      putMesh(parent, 'petal', petalColor, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 1.15, 0.45, 0.85, 0, -a, 0);
    }
    putMesh(parent, 'ball', heartColor, x, y + 0.02, z, 0.3, 0.24, 0.3);
  }

  /* 成熟花卉：一丛三朵 */
  function buildFlowerCluster(g, st) {
    const spots = [[0, 0.2, 0], [0.22, 0.13, 0.18], [-0.2, 0.16, -0.16]];
    spots.forEach((sp, k) => {
      const h = 0.3 + k * 0.1;
      putMesh(g, 'stem', 0x5f9f42, sp[0], h / 2, sp[2], 0.62, h, 0.62);
      addBlossom(g, sp[0], h + 0.06, sp[2], st.bloom, st.accent, 0.135 + k * 0.01);
    });
  }

  /* 成熟果实：按作物造型类别分别搭建专属模型 */
  function buildFruit(g, st) {
    const F = st.fruit, A = st.accent, L = st.leaf;
    switch (st.shape) {
      case 'bulb':   // 球根（萝卜）：球根露出地面 + 顶部紫晕
        putMesh(g, 'ball', F, 0, 0.22, 0, 1.2, 0.92, 1.2);
        putMesh(g, 'ball', A, 0, 0.4, 0, 0.68, 0.34, 0.68);
        break;
      case 'root':   // 直根（胡萝卜 / 白萝卜）：圆锥根露出土面
        putMesh(g, 'cone', F, 0, 0.28, 0, 1.15, 1.1, 1.15, Math.PI, 0, 0);
        putMesh(g, 'cone', A, 0, 0.3, 0, 0.5, 0.5, 0.5, Math.PI, 0, 0);
        break;
      case 'tuber':  // 块茎（土豆 / 红薯）
        putMesh(g, 'ball', F, 0, 0.18, 0, 1.25, 0.72, 1.05);
        putMesh(g, 'ball', F, 0.32, 0.14, 0.2, 0.95, 0.6, 0.85);
        putMesh(g, 'ball', F, -0.28, 0.14, -0.2, 1.0, 0.62, 0.9);
        putMesh(g, 'ball', A, 0.1, 0.28, 0.05, 0.2, 0.16, 0.2);
        break;
      case 'round':  // 圆果（番茄）：三颗圆果 + 绿萼
        [[0, 0.2, 0, 1.3], [0.3, 0.16, 0.16, 1.0], [-0.26, 0.16, -0.18, 0.95]].forEach(o => {
          putMesh(g, 'ball', F, o[0], o[1], o[2], o[3] * 1.1, o[3], o[3] * 1.1);
          putMesh(g, 'leaf', L, o[0], o[1] + 0.15 * o[3], o[2], 0.5, 0.16, 0.32);
        });
        break;
      case 'berry':  // 浆果（草莓）：红色心形 + 绿萼
        putMesh(g, 'ball', F, 0, 0.26, 0, 1.35, 0.95, 1.35);
        putMesh(g, 'cone', F, 0, 0.02, 0, 1.1, 0.85, 1.1, Math.PI, 0, 0);
        putMesh(g, 'leaf', L, 0, 0.44, 0, 1.05, 0.3, 0.62);
        putMesh(g, 'leaf', L, 0.2, 0.42, 0.08, 0.7, 0.22, 0.45, 0, 0.6, 0);
        putMesh(g, 'leaf', L, -0.2, 0.42, -0.08, 0.7, 0.22, 0.45, 0, -0.6, 0);
        break;
      case 'long':   // 长果（黄瓜）
        putMesh(g, 'cyl', F, 0.08, 0.3, 0.02, 0.72, 1.05, 0.72, 0.42, 0, 0.38);
        putMesh(g, 'cyl', F, -0.26, 0.22, -0.22, 0.5, 0.72, 0.5, 0.42, 0, -0.5);
        break;
      case 'oval':   // 椭果（茄子）：紫亮长球 + 绿萼
        putMesh(g, 'ball', F, 0.06, 0.32, 0.02, 0.88, 1.35, 0.88, 0.22, 0, 0.3);
        putMesh(g, 'leaf', A, 0.02, 0.52, 0, 0.85, 0.26, 0.5, 0, 0, -0.2);
        break;
      case 'cob':    // 玉米穗：黄穗 + 两片包叶 + 顶部须
        putMesh(g, 'cyl', F, 0, 0.36, 0, 0.66, 1.05, 0.66);
        putMesh(g, 'leaf', L, 0.16, 0.3, 0.06, 1.15, 0.34, 0.72, 0, 0.5, -0.55);
        putMesh(g, 'leaf', L, -0.16, 0.3, -0.06, 1.15, 0.34, 0.72, 0, -0.5, 0.55);
        putMesh(g, 'ball', A, 0, 0.66, 0, 0.3, 0.24, 0.3);
        break;
      case 'melon':  // 条纹瓜（西瓜）
        putMesh(g, 'ball', F, 0, 0.34, 0, 1.6, 1.24, 1.6);
        [0, 0.7, 1.4, 2.1].forEach(a => {
          putMesh(g, 'ball', A, Math.cos(a) * 0.24, 0.34, Math.sin(a) * 0.24, 0.2, 1.2, 1.55, 0, a, 0);
        });
        break;
      case 'gourd':  // 扁圆瓜（南瓜）：扁圆瓜 + 顶梗 + 藤叶
        putMesh(g, 'ball', F, 0, 0.3, 0, 1.55, 1.0, 1.55);
        putMesh(g, 'ball', A, 0, 0.5, 0, 0.24, 0.3, 0.24);
        putMesh(g, 'leaf', L, 0.5, 0.24, 0.36, 0.85, 0.26, 0.55, 0, 0.8, 0);
        break;
      case 'head':   // 结球叶菜（白菜）
        putMesh(g, 'ball', L, 0, 0.26, 0, 1.35, 1.02, 1.35);
        putMesh(g, 'ball', F, 0, 0.3, 0, 0.95, 0.86, 0.95);
        break;
      default:
        putMesh(g, 'ball', F, 0, 0.28, 0, 1.1, 1.0, 1.1);
    }
  }

  /* 单个作物的阶段模型（幼苗 / 生长 / 开花 / 结果）——不同阶段造型与配色各不相同 */
  function buildCropModel(cropId, stageIdx) {
    const st = CROP_STYLE[cropId] || CROP_STYLE.turnip;
    const g = new THREE.Group();
    const stemH = [0.12, 0.3, 0.5, 0.62][stageIdx];
    const leafColor = stageIdx === 0 ? 0xc4ec92 : st.leaf;

    putMesh(g, 'stem', stageIdx === 0 ? 0xa9dd7c : 0x5f9f42, 0, stemH / 2, 0,
      stageIdx === 0 ? 0.78 : 1, stemH, stageIdx === 0 ? 0.78 : 1);

    const leafCount = [2, 3, 4, 4][stageIdx];
    const leafScale = [0.62, 0.86, 1.0, 1.06][stageIdx];
    for (let k = 0; k < leafCount; k++) {
      const a = (k / leafCount) * Math.PI * 2 + 0.6;
      const y = 0.06 + (k / Math.max(1, leafCount)) * (stemH * 0.82);
      const r = 0.1 + stageIdx * 0.05;
      putMesh(g, 'leaf', leafColor, Math.cos(a) * r, y, Math.sin(a) * r,
        leafScale, leafScale * 0.3, leafScale * 0.6, 0.18, -a, -0.45 - stageIdx * 0.08);
    }

    if (stageIdx === 1) {
      // 生长中：茎侧结出未成熟的小果（果实主色 + 明显缩小的尺寸），与幼苗期明显区分
      const fr = 0.3;
      if (st.shape === 'root' || st.shape === 'bulb' || st.shape === 'tuber' ||
          st.shape === 'melon' || st.shape === 'gourd' || st.shape === 'head') {
        putMesh(g, 'ball', st.fruit, 0.32, 0.13, 0.2, fr * 1.1, fr * 0.8, fr * 1.1);
      } else {
        putMesh(g, 'ball', st.fruit, 0.3, stemH * 0.72, 0.06, fr, fr, fr);
        putMesh(g, 'ball', st.fruit, -0.26, stemH * 0.46, -0.14, fr * 0.8, fr * 0.8, fr * 0.8);
      }
    } else if (stageIdx === 2) {
      putMesh(g, 'ball', st.bloom, 0, stemH + 0.05, 0, 0.46, 0.52, 0.46);
      addBlossom(g, 0, stemH + 0.02, 0, st.bloom, st.accent, 0.1);
      putMesh(g, 'ball', st.bloom, 0.3, stemH * 0.72, 0.16, 0.2, 0.2, 0.2);      // 侧生花苞
      putMesh(g, 'ball', st.bloom, -0.28, stemH * 0.54, -0.18, 0.17, 0.17, 0.17);
    } else if (stageIdx === 3) {
      if (st.shape === 'flower') buildFlowerCluster(g, st);
      else buildFruit(g, st);
    }
    return g;
  }

  /* ---------- 成熟作物专属图标（Canvas 矢量绘制：3D 用 Sprite，2D 降级直接贴图） ---------- */

  function cssHex(c) { return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6); }

  function paintCropIcon(ctx, cropId, S, noPlate) {
    const st = CROP_STYLE[cropId] || CROP_STYLE.turnip;
    const F = cssHex(st.fruit), A = cssHex(st.accent), L = cssHex(st.leaf), B = cssHex(st.bloom);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.lineWidth = S * 0.035;
    ctx.strokeStyle = 'rgba(72,54,40,0.6)';
    if (!noPlate) {   // noPlate=true 时不画白色底盘，便于叠加 / 直接贴在土色地块上
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath(); ctx.arc(0, 0, S * 0.44, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const leaf = (x, y, w, h, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
      ctx.fillStyle = L; ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    switch (st.shape) {
      case 'bulb':
        ctx.fillStyle = F; ctx.beginPath(); ctx.arc(0, S * 0.08, S * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = A; ctx.beginPath(); ctx.ellipse(0, -S * 0.06, S * 0.12, S * 0.06, 0, 0, Math.PI * 2); ctx.fill();
        leaf(-S * 0.1, -S * 0.2, S * 0.08, S * 0.12, -0.7); leaf(S * 0.1, -S * 0.2, S * 0.08, S * 0.12, 0.7);
        break;
      case 'root':
        ctx.fillStyle = F; ctx.beginPath();
        ctx.moveTo(-S * 0.13, -S * 0.1); ctx.lineTo(S * 0.13, -S * 0.1); ctx.lineTo(0, S * 0.34); ctx.closePath();
        ctx.fill(); ctx.stroke();
        leaf(-S * 0.09, -S * 0.18, S * 0.07, S * 0.13, -0.6); leaf(0, -S * 0.22, S * 0.07, S * 0.14, 0); leaf(S * 0.09, -S * 0.18, S * 0.07, S * 0.13, 0.6);
        break;
      case 'tuber':
        ctx.fillStyle = F; ctx.beginPath(); ctx.ellipse(0, S * 0.06, S * 0.24, S * 0.17, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = A;
        [[-0.1, 0.02], [0.06, 0.1], [0.1, -0.02]].forEach(p => { ctx.beginPath(); ctx.arc(p[0] * S, p[1] * S, S * 0.022, 0, Math.PI * 2); ctx.fill(); });
        leaf(-S * 0.14, -S * 0.16, S * 0.07, S * 0.11, -0.7); leaf(S * 0.02, -S * 0.2, S * 0.07, S * 0.12, 0.1);
        break;
      case 'round':
        ctx.fillStyle = F; ctx.beginPath(); ctx.arc(0, S * 0.08, S * 0.21, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.beginPath(); ctx.ellipse(-S * 0.08, -S * 0.01, S * 0.06, S * 0.04, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = A; ctx.beginPath(); ctx.arc(0, -S * 0.13, S * 0.055, 0, Math.PI * 2); ctx.fill();
        leaf(-S * 0.12, -S * 0.13, S * 0.07, S * 0.045, -0.5); leaf(S * 0.12, -S * 0.13, S * 0.07, S * 0.045, 0.5);
        break;
      case 'berry':
        ctx.fillStyle = F; ctx.beginPath();
        ctx.moveTo(0, S * 0.32);
        ctx.bezierCurveTo(-S * 0.3, S * 0.1, -S * 0.24, -S * 0.16, 0, -S * 0.16);
        ctx.bezierCurveTo(S * 0.24, -S * 0.16, S * 0.3, S * 0.1, 0, S * 0.32);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        [[-0.08, 0.02], [0.06, 0.08], [0.02, -0.06], [-0.04, 0.14]].forEach(p => { ctx.beginPath(); ctx.arc(p[0] * S, p[1] * S, S * 0.018, 0, Math.PI * 2); ctx.fill(); });
        ctx.fillStyle = L; ctx.beginPath(); ctx.ellipse(0, -S * 0.2, S * 0.16, S * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'long':
        ctx.save(); ctx.rotate(-0.5);
        ctx.fillStyle = F; ctx.beginPath(); ctx.moveTo(-S * 0.09, -S * 0.2); ctx.lineTo(S * 0.09, -S * 0.2);
        ctx.lineTo(S * 0.07, S * 0.26); ctx.lineTo(-S * 0.07, S * 0.26); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-S * 0.03, -S * 0.16, S * 0.03, S * 0.36);
        ctx.restore();
        ctx.fillStyle = A; ctx.beginPath(); ctx.arc(S * 0.1, -S * 0.22, S * 0.04, 0, Math.PI * 2); ctx.fill();
        break;
      case 'oval':
        ctx.save(); ctx.rotate(0.35);
        ctx.fillStyle = F; ctx.beginPath(); ctx.ellipse(0, S * 0.04, S * 0.16, S * 0.24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.beginPath(); ctx.ellipse(-S * 0.06, -S * 0.04, S * 0.04, S * 0.1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = A; ctx.beginPath(); ctx.ellipse(-S * 0.08, -S * 0.2, S * 0.14, S * 0.05, -0.4, 0, Math.PI * 2); ctx.fill();
        break;
      case 'cob':
        ctx.fillStyle = F; ctx.beginPath(); ctx.ellipse(0, S * 0.06, S * 0.14, S * 0.26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(180,130,60,0.8)'; ctx.lineWidth = S * 0.018;
        for (let r = -2; r <= 2; r++) { ctx.beginPath(); ctx.moveTo(-S * 0.12, S * (0.06 + r * 0.08)); ctx.lineTo(S * 0.12, S * (0.06 + r * 0.08)); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(72,54,40,0.6)'; ctx.lineWidth = S * 0.035;
        leaf(-S * 0.15, S * 0.08, S * 0.08, S * 0.22, -0.35); leaf(S * 0.15, S * 0.08, S * 0.08, S * 0.22, 0.35);
        break;
      case 'melon':
        ctx.fillStyle = F; ctx.beginPath(); ctx.arc(0, S * 0.04, S * 0.24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = A; ctx.lineWidth = S * 0.035;
        [-0.14, 0, 0.14].forEach(dx => { ctx.beginPath(); ctx.moveTo(dx * S, -S * 0.2); ctx.quadraticCurveTo(dx * S * 1.6, S * 0.04, dx * S, S * 0.27); ctx.stroke(); });
        break;
      case 'gourd':
        ctx.fillStyle = F; ctx.beginPath(); ctx.ellipse(0, S * 0.08, S * 0.26, S * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(190,110,30,0.75)'; ctx.lineWidth = S * 0.03;
        [-0.14, 0, 0.14].forEach(dx => { ctx.beginPath(); ctx.moveTo(dx * S, -S * 0.11); ctx.quadraticCurveTo(dx * S * 1.5, S * 0.08, dx * S, S * 0.27); ctx.stroke(); });
        ctx.fillStyle = A; ctx.fillRect(-S * 0.035, -S * 0.26, S * 0.07, S * 0.1);
        ctx.strokeStyle = 'rgba(72,54,40,0.6)'; ctx.lineWidth = S * 0.035;
        break;
      case 'head':
        ctx.fillStyle = L; ctx.beginPath(); ctx.arc(0, S * 0.06, S * 0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = F; ctx.beginPath(); ctx.arc(0, S * 0.08, S * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-S * 0.05, S * 0.02, S * 0.06, 0, Math.PI * 2); ctx.fill();
        break;
      case 'flower':
      default:
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.fillStyle = B; ctx.beginPath();
          ctx.ellipse(Math.cos(a) * S * 0.16, Math.sin(a) * S * 0.16 + S * 0.02, S * 0.12, S * 0.09, a, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = A; ctx.beginPath(); ctx.arc(0, S * 0.02, S * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = L; ctx.beginPath(); ctx.ellipse(0, S * 0.3, S * 0.14, S * 0.06, 0, 0, Math.PI * 2); ctx.fill();
        break;
    }
    ctx.restore();
  }

  /* ---------- 田间各生长阶段造型（幼苗 / 生长 / 开花 / 结果，按作物品种区分） ---------- */

  /**
   * 绘制「作物 × 生长阶段」的田间造型（透明底，直接贴在土色地块上）：
   *  - 0 幼苗：矮茎 + 2 片浅色嫩叶
   *  - 1 生长：高茎 + 多片深色叶 + 未成熟的果实雏形（根茎 / 瓜类会露出土面）
   *  - 2 开花：高茎 + 叶 + 顶端花朵（花瓣用品种花色，区分不同作物）
   *  - 3 结果：复用成熟果实造型（去掉白底盘）
   */
  function paintCropPlant(ctx, cropId, stageIdx, S) {
    const st = CROP_STYLE[cropId] || CROP_STYLE.turnip;
    const L = cssHex(st.leaf), F = cssHex(st.fruit), B = cssHex(st.bloom), A = cssHex(st.accent);
    const stage = Math.max(0, Math.min(3, stageIdx | 0));
    ctx.clearRect(0, 0, S, S);

    if (stage >= 3) {   // 结果期：立起来的整株植物（茎 + 叶 + 顶端果实/花），不是漂浮的果子
      ctx.save();
      ctx.translate(S * 0.5, S * 0.88);
      ctx.lineWidth = S * 0.03;
      ctx.strokeStyle = 'rgba(72,54,40,0.5)';
      var sh = 0.6 * S;
      ctx.fillStyle = '#5f9f42';
      ctx.fillRect(-S * 0.035, -sh, S * 0.07, sh);
      for (var lk = 0; lk < 4; lk++) {
        var ld = (lk % 2 === 0) ? -1 : 1;
        var ll = 0.45 + Math.floor(lk / 2) * 0.3;
        ctx.save();
        ctx.translate(0, -sh * ll);
        ctx.rotate(ld * 0.55);
        ctx.fillStyle = L;
        ctx.beginPath();
        ctx.ellipse(ld * S * 0.13, 0, S * 0.14, S * 0.07, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.translate(0, -sh);
      ctx.scale(0.92, 0.92);
      ctx.translate(-S * 0.5, -S * 0.5);
      paintCropIcon(ctx, cropId, S, true);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(S / 2, S * 0.86);          // 以土面为茎基
    ctx.lineWidth = S * 0.03;
    ctx.strokeStyle = 'rgba(72,54,40,0.5)';

    const stemH = [0.3, 0.58, 0.68][stage] * S;
    const stemW = (stage === 0 ? 0.05 : 0.07) * S;
    ctx.fillStyle = stage === 0 ? '#a9dd7c' : '#5f9f42';
    ctx.fillRect(-stemW / 2, -stemH, stemW, stemH);

    const leafCount = [2, 4, 5][stage];
    const leafScale = [0.17, 0.23, 0.25][stage];
    for (let k = 0; k < leafCount; k++) {
      const dir = (k % 2 === 0) ? -1 : 1;
      const lvl = Math.min(1, 0.42 + Math.floor(k / 2) * 0.28);
      ctx.save();
      ctx.translate(0, -stemH * lvl);
      ctx.rotate(dir * (0.5 + stage * 0.08));
      ctx.fillStyle = stage === 0 ? '#c4ec92' : L;
      ctx.beginPath();
      ctx.ellipse(dir * leafScale * S * 0.62, 0, leafScale * S * 0.66, leafScale * S * 0.32, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    const tuberLike = (st.shape === 'root' || st.shape === 'bulb' || st.shape === 'tuber' ||
      st.shape === 'gourd' || st.shape === 'head' || st.shape === 'melon');
    if (stage === 1 && tuberLike) {          // 根茎 / 瓜类：土面已露出未成熟的小果
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = F;
      ctx.beginPath(); ctx.ellipse(0, -S * 0.02, S * 0.14, S * 0.08, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (stage === 1) {                // 地上结果类：茎侧结出未熟小果
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = F;
      ctx.beginPath(); ctx.arc(S * 0.1, -stemH * 0.44, S * 0.075, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (stage === 2) {                       // 开花期：顶端开出品种专属花色的花朵
      const cy = -stemH - S * 0.02;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ctx.fillStyle = B;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * S * 0.095, cy + Math.sin(a) * S * 0.095, S * 0.082, S * 0.058, a, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = A;
      ctx.beginPath(); ctx.arc(0, cy, S * 0.058, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    ctx.restore();
  }

  const cropPlantCanvasCache = {};
  /** 取「作物 × 生长阶段」田间造型图标的 dataURL（供 UI 面板复用同一套 2D 造型） */
  function cropStageIconURL(cropId, stageIdx) {
    const key = cropId + '|' + stageIdx;
    if (cropPlantCanvasCache[key]) return cropPlantCanvasCache[key];
    let url = '';
    try {
      const S = 128;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d');
      if (ctx) { paintCropPlant(ctx, cropId, stageIdx, S); url = cv.toDataURL('image/png'); }
    } catch (e) { url = ''; }
    cropPlantCanvasCache[key] = url;
    return url;
  }

  const cropIconCanvasCache = {};
  function cropIconCanvas(cropId) {
    if (!cropIconCanvasCache[cropId]) {
      const S = 128;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      paintCropIcon(cv.getContext('2d'), cropId, S);
      cropIconCanvasCache[cropId] = cv;
    }
    return cropIconCanvasCache[cropId];
  }

  const cropIconTexCache = {};
  function cropIconTexture(cropId) {
    if (!cropIconTexCache[cropId]) {
      const tex = new THREE.CanvasTexture(cropIconCanvas(cropId));
      tex.needsUpdate = true;
      cropIconTexCache[cropId] = tex;
    }
    return cropIconTexCache[cropId];
  }

  function clearCropModel(cm) {
    if (cm.model) { cm.group.remove(cm.model); cm.model = null; }
    cm.built = '';
  }

  /* ======================= 围栏段与加工机（按等级造型） ======================= */

  const FENCE_MAX = (D && D.FENCE_MAX) || 10;
  const FENCE_SPOT = { startX: -9, step: 2.0, z: 4.9 };
  const MACHINE_SPOT = { x: 8.8, z: [-1.6, 0.8, 3.2], rot: -Math.PI / 2 };
  const MACHINE_ORDER = ['cheesemaker', 'mayomaker', 'yarnmaker'];
  let structureSig = '';

  /** 依据存档中的围栏段数 / 围栏等级 / 各机器等级，重建牧场中的设施造型（仅状态变化时重建） */
  function syncStructures(state) {
    if (!groups.structures || !window.Models) return;
    const fenceLv = Math.max(1, Math.min(5, Math.round(Number(state.build && state.build.fenceLevel) || 1)));
    const fenceCount = Math.max(0, Math.min(FENCE_MAX, Math.round(Number(state.tools && state.tools.fence) || 0)));
    const lvList = MACHINE_ORDER.map(id => Math.max(0, Math.min(5, Math.round(Number(state.machines && state.machines[id]) || 0))));
    const sig = fenceCount + '|' + fenceLv + '|' + lvList.join(',');
    if (sig === structureSig) return;
    structureSig = sig;

    while (groups.structures.children.length) groups.structures.remove(groups.structures.children[0]);

    for (let i = 0; i < fenceCount; i++) {
      const seg = window.Models.buildFenceByLevel(fenceLv);
      if (!seg) continue;
      seg.position.set(FENCE_SPOT.startX + i * FENCE_SPOT.step, 0, FENCE_SPOT.z);
      seg.userData.structKind = 'fence';
      groups.structures.add(seg);
    }
    lvList.forEach((lv, idx) => {
      if (!lv) return;
      const kind = (window.Models.MACHINE_KINDS || {})[MACHINE_ORDER[idx]] || 'cheese';
      const g = window.Models.buildMachineByLevel(kind, lv);
      if (g) {
        g.position.set(MACHINE_SPOT.x, 0, MACHINE_SPOT.z[idx]);
        g.rotation.y = MACHINE_SPOT.rot;
        g.userData.structKind = 'machine';
        groups.structures.add(g);
      }
    });
  }

  function syncField(state) {
    state.plots.forEach((p, i) => {
      const slot = plotMeshes[i];
      if (!slot) return;
      slot.grass.visible = !p.plowed;
      slot.soil.visible = !!p.plowed;
      if (slot.weedGroup) slot.weedGroup.visible = !p.plowed;
      const isDry = p.plowed && !p.cropType && (p.waterLevel || 0) === 0;
      if (slot.crackGroup) slot.crackGroup.visible = !!isDry;
      const lv = p.plowed ? Math.max(0, Math.min(3, p.fertilizerLevel || 0)) : 0;
      if (lv > 0) slot.soil.material = toon(SOIL_COLOR.fert);
      else if (p.waterLevel > 0) slot.soil.material = toon(SOIL_COLOR.wet);
      else if (isDry) slot.soil.material = toon(SOIL_COLOR.dry);
      else slot.soil.material = toon(SOIL_COLOR.normal);

      // 施肥痕迹：黑色芝麻状小点，施肥等级越高越密（等级 1/2/3 → 15/21/27 点）
      slot.fertGroup.visible = lv > 0;
      if (lv > 0) {
        const want = 9 + lv * 6;
        slot.specks.forEach((sp, k) => { sp.visible = k < want; });
      }

      // 作物模型：按「作物 + 生长阶段」重建，各阶段造型与配色互不相同
      const cm = cropMeshes[i];
      const stageIdx = cropStageIndex(p);
      const key = p.cropType ? (p.cropType + '#' + stageIdx) : '';
      if (cm.built !== key) {
        clearCropModel(cm);
        if (p.cropType) {
          cm.model = buildCropModel(p.cropType, stageIdx);
          // 作物立起来、有高度感（农田 v9）：向日葵最高、番茄次之，其余统一拔高
          const hScale = p.cropType === 'sunflower' ? 1.5 : (p.cropType === 'tomato' ? 1.35 : 1.25);
          cm.model.scale.setScalar(hScale);
          cm.group.add(cm.model);
        }
        cm.built = key;
      }
      cm.ripe = !!p.harvestable;
      cm.group.visible = !!p.cropType;

      // 成熟作物专属图标（悬于地块上方，一眼可辨品种）
      slot.iconSprite.visible = !!p.harvestable;
      if (p.harvestable) {
        const tex = cropIconTexture(p.cropType);
        if (slot.iconSprite.material.map !== tex) {
          slot.iconSprite.material.map = tex;
          slot.iconSprite.material.needsUpdate = true;
        }
      }
    });
  }

  /* ======================= 天气系统 ======================= */

  /* 天气风力（摆动幅度 / 云速共用，applyTheme 里按天气设定） */
  let windSway = 0.02, cloudSpeed = 0.012;

  function buildWeather(weather, season) {
    if (weatherSys) { scene.remove(weatherSys.points); weatherSys = null; }
    if (!scene) return;
    const theme = D.seasonTheme[season];
    const isSnow = weather === 5 || (season === 3 && weather === 1);
    let kind = null, color = 0xa8d8ff, size = 0.16, count = 700, speed = 14, wind = 0;
    if (weather === 2) { kind = 'rain'; count = 1500; size = 0.22; speed = 30; color = 0x9dc8ff; wind = 6; }   // 暴风雨：更密更快
    else if (weather === 4) { kind = 'rain'; count = 1600; size = 0.22; speed = 34; color = 0x8fb8e8; wind = 16; } // 台风：雨斜着打
    else if (weather === 1) { kind = isSnow ? 'snow' : 'rain'; count = isSnow ? 500 : 800; size = isSnow ? 0.22 : 0.16; speed = isSnow ? 5 : 16; wind = isSnow ? 1 : 2.5; }
    else if (weather === 5) { kind = 'snow'; count = 1400; size = 0.3; speed = 7; color = 0xffffff; wind = 5; } // 暴雪：大而密
    else if (weather === 3) { kind = 'dust'; count = 60; size = 0.3; speed = 1.5; color = 0xfff2c0; wind = 1; }   // 干旱：漂浮尘粒
    else {
      kind = theme.decor;
      // 四季氛围：春花瓣 / 夏萤火 / 秋落叶 / 冬飘雪（数量按季节调足）
      count = kind === 'petal' ? 200 : kind === 'leaf' ? 180 : kind === 'snow' ? 220 : 110;
      size = kind === 'leaf' ? 0.3 : kind === 'snow' ? 0.26 : 0.2;
      speed = kind === 'snow' ? 4 : 3;
      color = kind === 'petal' ? 0xffc0d4 : kind === 'leaf' ? 0xe08a3c : kind === 'bug' ? 0xffe98a : 0xffffff;
    }

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 54;
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 54;
      vel[i] = 0.6 + Math.random() * 0.8;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: color, size: size, transparent: true, opacity: kind === 'rain' || kind === 'snow' ? 0.85 : (kind === 'dust' ? 0.35 : 0.9), depthWrite: false, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    weatherSys = { points: points, kind: kind, count: count, speed: speed, vel: vel, wind: wind, weather: weather, flashTimer: 3 + Math.random() * 5 };
  }

  function updateWeather(dt) {
    if (!weatherSys) return;
    const arr = weatherSys.points.geometry.attributes.position.array;
    const isRain = weatherSys.kind === 'rain';
    const wind = weatherSys.wind || 0;
    for (let i = 0; i < weatherSys.count; i++) {
      const i3 = i * 3;
      arr[i3 + 1] -= weatherSys.speed * weatherSys.vel[i] * dt;
      if (weatherSys.kind === 'petal' || weatherSys.kind === 'leaf' || weatherSys.kind === 'bug') {
        arr[i3] += Math.sin(anim.t * 1.2 + i) * dt * 1.8;
        arr[i3 + 2] += Math.cos(anim.t * 0.9 + i) * dt * 1.4;
      } else if (weatherSys.kind === 'snow') {
        arr[i3] += (Math.sin(anim.t * 0.8 + i) * 0.8 + wind) * dt;
        arr[i3 + 2] += Math.cos(anim.t * 0.6 + i) * dt * 0.5;
      } else {
        arr[i3] += wind * dt;   // 雨斜着打：风越大雨丝越斜（台风最斜）
      }
      if (arr[i3 + 1] < 0) {
        arr[i3 + 1] = 24 + Math.random() * 4;
        arr[i3] = (Math.random() - 0.5) * 54;
        arr[i3 + 2] = (Math.random() - 0.5) * 54;
      }
    }
    weatherSys.points.geometry.attributes.position.needsUpdate = true;
  }

  /* ======================= 天气覆盖层：屏幕雨滴 / 斜阳光（2D canvas 盖在 3D 画布上，pointer-events:none，不挡点击） ======================= */

  let fxCanvas = null, fxCtx = null, fxW = 0, fxH = 0;
  let fxDrops = [], fxFlakes = [], fxFrost = null, fxSpawnAcc = 0;

  function initWeatherFX() {
    fxCanvas = document.getElementById('weather-fx');
    if (!fxCanvas) return;
    fxCtx = fxCanvas.getContext('2d');
    resizeWeatherFX();
  }

  function resizeWeatherFX() {
    if (!fxCanvas || !fxCtx || !container) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    fxW = container.clientWidth || 720;
    fxH = container.clientHeight || 460;
    fxCanvas.width = Math.round(fxW * dpr);
    fxCanvas.height = Math.round(fxH * dpr);
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxFrost = null;
  }

  /* 斜射阳光：右上斜照进镜头的光束 + 镜头光晕（晴天弱、干旱强） */
  function fxSunbeams(strength) {
    const ctx = fxCtx;
    ctx.save();
    ctx.translate(fxW * 0.82, -fxH * 0.08);
    ctx.rotate(0.5);
    for (let i = -1; i <= 1; i++) {
      const w = 60 + Math.abs(i) * 50;
      const g = ctx.createLinearGradient(0, 0, 0, fxH * 1.3);
      g.addColorStop(0, 'rgba(255,236,170,' + (0.18 * strength) + ')');
      g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g;
      ctx.fillRect(i * 130 - w / 2, 0, w, fxH * 1.3);
    }
    ctx.restore();
    // 镜头光晕：右上角暖光团
    const glow = ctx.createRadialGradient(fxW * 0.86, fxH * 0.06, 0, fxW * 0.86, fxH * 0.06, fxW * 0.34);
    glow.addColorStop(0, 'rgba(255,232,150,' + (0.28 * strength) + ')');
    glow.addColorStop(1, 'rgba(255,232,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, fxW, fxH);
    if (strength > 1.2) {   // 干旱：整屏偏白刺眼
      ctx.fillStyle = 'rgba(255,246,210,0.04)';
      ctx.fillRect(0, 0, fxW, fxH);
    }
  }

  /* 屏幕雨滴：先挂在“镜头”上慢慢长大，再往下流、拖出水痕、消失；新的不断出现 */
  function fxDroplets(dt, weather) {
    const ctx = fxCtx;
    const rate = weather === 4 ? 46 : weather === 2 ? 38 : 13;   // 台风 / 暴风雨更密
    const slant = weather === 4 ? -0.45 : weather === 2 ? -0.18 : 0;  // 台风雨滴斜着流
    fxSpawnAcc += dt * rate;
    while (fxSpawnAcc >= 1 && fxDrops.length < 120) {
      fxSpawnAcc -= 1;
      fxDrops.push({
        x: Math.random() * fxW, y: Math.random() * fxH * 0.85,
        r: 1.2 + Math.random() * 1.6, maxR: 2.2 + Math.random() * 3.4,
        wait: 0.4 + Math.random() * 2.2, vy: 0, trail: []
      });
    }
    fxDrops = fxDrops.filter(d => {
      if (d.wait > 0) {
        d.wait -= dt;
        if (d.r < d.maxR) d.r += dt * 0.9;
      } else {
        d.vy = Math.min(300, d.vy + 520 * dt);
        d.y += d.vy * dt;
        d.x += d.vy * slant * dt;
        d.trail.push({ x: d.x, y: d.y });
        if (d.trail.length > 14) d.trail.shift();
        if (d.y - d.r > fxH + 10 || d.x < -20) return false;
      }
      return true;
    });
    ctx.lineCap = 'round';
    fxDrops.forEach(d => {
      if (d.trail.length > 2) {
        ctx.strokeStyle = 'rgba(220,238,255,0.35)';
        ctx.lineWidth = Math.max(1, d.r * 0.45);
        ctx.beginPath();
        ctx.moveTo(d.trail[0].x, d.trail[0].y);
        d.trail.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.55, 'rgba(210,232,255,0.45)');
      g.addColorStop(1, 'rgba(210,232,255,0.08)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* 暴雪：屏幕边缘结霜 + 镜头上的雪花慢慢飘 */
  function fxBlizzard(dt) {
    const ctx = fxCtx;
    if (!fxFrost) {
      fxFrost = [];
      for (let i = 0; i < 46; i++) {
        const edge = i % 4;
        let x, y;
        if (edge === 0) { x = Math.random() * fxW; y = Math.random() * 26; }
        else if (edge === 1) { x = Math.random() * fxW; y = fxH - Math.random() * 26; }
        else if (edge === 2) { x = Math.random() * 22; y = Math.random() * fxH; }
        else { x = fxW - Math.random() * 22; y = Math.random() * fxH; }
        fxFrost.push({ x: x, y: y, r: 4 + Math.random() * 14 });
      }
      fxFlakes = [];
      for (let i = 0; i < 26; i++) fxFlakes.push({ x: Math.random() * fxW, y: Math.random() * fxH, r: 1.5 + Math.random() * 2.5, ph: Math.random() * 6 });
    }
    fxFrost.forEach(f => {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    });
    fxFlakes.forEach(f => {
      f.y += 14 * dt;
      f.x += Math.sin(anim.t * 0.9 + f.ph) * 12 * dt;
      if (f.y > fxH + 4) { f.y = -4; f.x = Math.random() * fxW; }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    });
  }

  /* 每帧绘制天气覆盖层（只在牧场视图显示，画在 #scene-wrap 内，不盖 HUD / 底栏） */
  function drawWeatherFX(dt) {
    if (!fxCtx || mode !== '3d') return;
    fxCtx.clearRect(0, 0, fxW, fxH);
    if (document.body.dataset.view !== 'pasture') { fxDrops = []; return; }
    const w = currentState ? currentState.weather : 0;
    if (w === 0) fxSunbeams(1);
    else if (w === 3) fxSunbeams(1.7);
    else if (w === 1 || w === 2 || w === 4) fxDroplets(dt, w);
    else if (w === 5) fxBlizzard(dt);
    // 闪电白闪（与 3D 灯光闪烁同步）
    if (anim.flash > 0) {
      fxCtx.fillStyle = 'rgba(255,255,255,' + (anim.flash / 0.16 * 0.4).toFixed(3) + ')';
      fxCtx.fillRect(0, 0, fxW, fxH);
    }
  }

  /* ======================= 主题 ======================= */

  function applyTheme(season, weather, immediate) {
    const theme = D.seasonTheme[season];
    if (scene) scene.fog = new THREE.Fog(theme.fog, 60, 150);
    if (renderer) renderer.setClearColor(theme.sky, 1);
    if (groups.sky) groups.sky.material.color.setHex(theme.sky);
    if (groups.ground) groups.ground.material.color.setHex(theme.ground);
    if (groups.bgMat) groups.bgMat.color.setHex(theme.hill);
    if (groups.foliage) {
      groups.foliage.forEach(fol => {
        fol.children.forEach(c => {
          if (c.material && !c.userData.isTrunk) {
            if (!c.userData.origMat) {
              c.userData.origMat = true;
              c.material = toon(theme.foliage);
            } else {
              c.material = toon(theme.foliage);
            }
          }
        });
      });
    }
    if (groups.water) groups.water.material.color.setHex(season === 3 ? 0x9fd8f0 : 0x63c2ea);

    // 各天气光影（只改视觉，不动玩法）：晴暖亮 / 雨湿暗 / 暴风雨更暗+闪电 / 干旱刺眼发白 / 台风最暗 / 暴雪灰白
    const dim = weather === 4 ? 0.42 : weather === 2 ? 0.55 : weather === 5 ? 0.6 : weather === 1 ? 0.8 : weather === 3 ? 1.15 : 1;
    const skyHex = weather === 1 ? 0xa8bfd4 : weather === 2 ? 0x8fa5b8 : weather === 4 ? 0x7e8fa0
      : weather === 5 ? 0xe8eef2 : weather === 3 ? 0xfff6da : theme.sky;
    if (groups.sky) groups.sky.material.color.setHex(skyHex);
    if (renderer) renderer.setClearColor(skyHex, 1);
    /* 雾距按天气：晴 / 干旱要看得远（v12 开阔远景，远山可见），雨雪天才收近 */
    const fogNear = weather === 4 ? 22 : weather === 2 ? 26 : weather === 5 ? 28 : weather === 1 ? 40 : weather === 3 ? 55 : 60;
    const fogFar = weather === 4 ? 58 : weather === 2 ? 66 : weather === 5 ? 70 : weather === 1 ? 100 : weather === 3 ? 140 : 150;
    if (scene) scene.fog = new THREE.Fog(skyHex, fogNear, fogFar);
    if (renderer) renderer.toneMappingExposure = weather === 3 ? 1.25 : weather === 4 ? 0.85 : 1.0;
    if (groups.light) {
      groups.light.intensity = 1.12 * dim;
      groups.light.color.setHex(weather === 3 ? 0xfff6da : weather === 4 ? 0xc8d4e0 : 0xfff3d8);
      groups.hemi.intensity = 0.72 * (dim + 0.15);
    }
    groups._dim = dim;
    groups._skyHex = skyHex;
    // 风力：摆动幅度与云速（台风最大，干旱最小）
    windSway = weather === 4 ? 0.16 : weather === 2 ? 0.09 : weather === 1 ? 0.05 : weather === 5 ? 0.05 : weather === 3 ? 0.015 : 0.02;
    cloudSpeed = weather === 4 ? 0.09 : weather === 2 ? 0.05 : weather === 1 ? 0.02 : weather === 5 ? 0.015 : weather === 3 ? 0.008 : 0.012;
    // 太阳：只在晴 / 干旱出现，干旱更大更白更刺眼
    if (groups.sun) {
      groups.sun.visible = (weather === 0 || weather === 3);
      groups.sun.material.color.setHex(weather === 3 ? 0xfffbe8 : 0xffe98a);
      groups.sun.scale.setScalar(weather === 3 ? 1.5 : 1);
    }
    // 地面：雨湿润偏深、干旱偏干黄、暴雪/冬季覆雪
    if (groups.ground) {
      if (weather === 5 || season === 3) groups.ground.material.color.setHex(0xeaf3fb);
      else if (weather === 3) groups.ground.material.color.setHex(0xcbb45e);
      else if (weather === 2 || weather === 4) groups.ground.material.color.setHex(weather === 4 ? 0x5e8a48 : 0x6f9a52);
      else if (weather === 1) groups.ground.material.color.setHex(0x7fae58);
      else groups.ground.material.color.setHex(theme.ground);
    }
    // 屋顶积雪：暴雪或冬季显示
    if (groups.snowCaps) groups.snowCaps.forEach(c => { c.visible = (weather === 5 || season === 3); });
  }

  /* ======================= 初始化 ======================= */

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      const ok = !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
      return ok;
    } catch (e) { return false; }
  }

  function init(canvasEl, containerEl, state) {
    container = containerEl;
    currentState = state || null;      // 首帧渲染前先注入状态，避免 animate 拿到 null 报错
    fallbackState = state || null;
    if (typeof window.THREE === 'undefined' || !webglAvailable()) {
      mode = '2d';
      return initFallback(canvasEl, state);
    }
    mode = '3d';
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) {
      mode = '2d';
      return initFallback(canvasEl, state);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 720, container.clientHeight || 480, false);
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xdcefff, 72, 150);   // 远处轻微空气雾，增强景深
    gradientMap = makeGradientMap();
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 220);   // 视野 50°：新牧场栏杆更宽（32 格），38° 时栏边动物会出画，要拖镜头才找得到
    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();

    const C = LAYOUT.camOffset;
    camera.position.set(C.x, C.y, C.z);
    camera.lookAt(0, -2.2, 1.5);

    groups.terrain = new THREE.Group();
    groups.field = new THREE.Group();
    groups.buildings = new THREE.Group();
    groups.props = new THREE.Group();
    groups.animals = new THREE.Group();
    /* 玩家修建的围栏段与加工机（等级造型动态重建） */
    groups.structures = new THREE.Group();
    scene.add(groups.terrain, groups.field, groups.buildings, groups.props, groups.animals, groups.structures);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8e8c8, 0.72);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff3d8, 1.12);
    dir.position.set(16, 30, 14);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -26; dir.shadow.camera.right = 26;
    dir.shadow.camera.top = 26; dir.shadow.camera.bottom = -26;
    dir.shadow.camera.near = 1; dir.shadow.camera.far = 80;
    dir.shadow.bias = -0.0012;
    scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(amb);
    groups.light = dir;
    groups.hemi = hemi;
    pickables.length = 0;   // 重建前先清空旧拾取体（必须在 buildField/buildBuildings 之前，否则会清掉刚注册的地块/矿洞/出货箱点击体）

    buildSky();
    buildGround();
    buildPond();
    buildField();
    buildFence();
    buildMeadow();
    buildProps();
    buildBuildings();
    buildSquirrel();

    bindPointer(canvasEl);
    resize();
    /* 容器高会随 HUD/卡片内容变化（不是窗口 resize），用 ResizeObserver 跟着调，避免相机比例与画布缓冲过期、画面被压扁 */
    if (typeof ResizeObserver !== 'undefined' && container && !container._ro) {
      container._ro = new ResizeObserver(function () { resize(); });
      container._ro.observe(container);
    }
    initWeatherFX();   // 天气覆盖层（屏幕雨滴 / 斜阳光）
    applyTheme(state.season, state.weather, true);
    buildWeather(state.weather, state.season);
    spawnAnimals(state);
    syncStructures(state);
    syncField(state);
    running = true;
    last.season = state.season;
    last.weather = state.weather;
    animate();
    return '3d';
  }

  let pickables = [];

  function initFallback(canvasEl, state) {
    fallbackCanvas = canvasEl;
    fallbackCtx = canvasEl.getContext('2d');
    fallbackState = state;
    resize();
    running = true;
    animate();
    return '2d';
  }

  /* ======================= 交互拾取 ======================= */

  function bindPointer(canvasEl) {
    let lastPickAt = 0;

    const hitTest = (clientX, clientY) => {
      const rect = canvasEl.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      for (let i = 0; i < hits.length; i++) {
        const ud = hits[i].object.userData;
        if (ud.pickType === 'plot' && callbacks.plot) { callbacks.plot(ud.index); return true; }
        if (ud.pickType === 'animal' && callbacks.animal) { callbacks.animal(ud.animalId); return true; }
        if (ud.pickType === 'squirrel') { fleeSquirrel(); return true; }
        if (ud.pickType === 'crate' && callbacks.crate) { callbacks.crate(); return true; }
        if (ud.pickType === 'mine' && callbacks.mine) { callbacks.mine(); return true; }
        if (ud.pickType === 'pasture') { return true; }
      }
      return true;
    };

    const pick = (clientX, clientY) => {
      if (mode !== '3d' || !renderer) { handleFallbackClick({ clientX: clientX, clientY: clientY }); return; }
      const now = Date.now();
      // 同一次触摸在移动端会先后触发 pointerup 与 click，用时间窗去重，避免一次点击响应两回
      if (now - lastPickAt < 350) return;
      lastPickAt = now;
      hitTest(clientX, clientY);
    };

    canvasEl.addEventListener('click', e => pick(e.clientX, e.clientY));

    // 触屏兜底：部分移动端浏览器不会给 canvas 派发 click，改用 pointerup / touchend 完成拾取
    const pickTouch = e => {
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      if (!t) return;
      pick(t.clientX, t.clientY);
    };
    let downX = 0, downY = 0, tracking = false;
    let lastPX = 0, lastPY = 0, panning = false;   // 镜头拖动状态（牧场是竖长一页，拖动平移相机查看）
    if (window.PointerEvent) {
      canvasEl.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; lastPX = e.clientX; lastPY = e.clientY; panning = false; tracking = true; });
      canvasEl.addEventListener('pointermove', e => {
        if (!tracking) return;
        if (!panning && Math.hypot(e.clientX - downX, e.clientY - downY) > 12) panning = true;
        if (panning) {
          /* 内容跟手走：往下拖看到更南边，往右拖看到更西边；x ±8，z -30..32（放牧空地到池塘） */
          camPan.x = Math.max(-8, Math.min(8, camPan.x - (e.clientX - lastPX) * 0.045));
          camPan.z = Math.max(-30, Math.min(32, camPan.z + (e.clientY - lastPY) * 0.045));
        }
        lastPX = e.clientX; lastPY = e.clientY;
      });
      canvasEl.addEventListener('pointerup', e => {
        if (!tracking) return;
        tracking = false;
        const wasPan = panning; panning = false;
        if (wasPan) return;   // 拖动过就不算点击
        if (Math.abs(e.clientX - downX) > 16 || Math.abs(e.clientY - downY) > 16) return;   // 拖动 / 滑动不算点击
        pick(e.clientX, e.clientY);
      });
    } else {
      canvasEl.addEventListener('touchstart', e => {
        const t = e.changedTouches[0];
        if (t) { downX = t.clientX; downY = t.clientY; lastPX = t.clientX; lastPY = t.clientY; panning = false; tracking = true; }
      }, { passive: true });
      canvasEl.addEventListener('touchmove', e => {
        const t = e.changedTouches[0];
        if (!t || !tracking) return;
        if (!panning && Math.hypot(t.clientX - downX, t.clientY - downY) > 12) panning = true;
        if (panning) {
          e.preventDefault();   // 拖动镜头时不滚动页面
          camPan.x = Math.max(-8, Math.min(8, camPan.x - (t.clientX - lastPX) * 0.045));
          camPan.z = Math.max(-30, Math.min(32, camPan.z + (t.clientY - lastPY) * 0.045));
        }
        lastPX = t.clientX; lastPY = t.clientY;
      }, { passive: false });
      canvasEl.addEventListener('touchend', e => {
        const wasPan = panning; panning = false; tracking = false;
        if (wasPan) return;   // 拖动过就不算点击
        pickTouch(e);
      });
    }
  }

  function handleFallbackClick(e) {
    if (!callbacks.plot) return;
    const rect = fallbackCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (y > 0.25 && y < 0.78 && x > 0.1 && x < 0.9) {
      const col = Math.min(5, Math.max(0, Math.floor((x - 0.1) / 0.8 * 6)));
      const row = Math.min(3, Math.max(0, Math.floor((y - 0.25) / 0.53 * 4)));
      callbacks.plot(row * 6 + col);
    }
  }

  /* ======================= 主循环 ======================= */

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);
    const dt = clock ? Math.min(0.05, clock.getDelta()) : 1 / 60;
    anim.t += dt;

    if (mode === '3d') {
      if (groups.clouds) groups.clouds.rotation.y += dt * cloudSpeed;
      if (groups.sun) groups.sun.lookAt(camera.position);
      if (groups.water) groups.water.material.opacity = 0.86 + Math.sin(anim.t * 1.6) * 0.06;
      if (groups.foliage) groups.foliage.forEach(f => { f.rotation.z = Math.sin(anim.t * 0.9 + f.userData.phase) * windSway; });
      if (currentState) animalRigs.forEach(r => updateAnimal(r, dt, currentState));
      if (dogRig && currentState) updateAnimal(dogRig, dt, currentState);
      if (horseRig && currentState) updateAnimal(horseRig, dt, currentState);
      if (eagleRig && currentState) updatePets(eagleRig, dt);
      if (cormorantRig && currentState) updatePets(cormorantRig, dt);
      if (squirrelRig) updateSquirrel(dt);
      // 作物随风轻摆（台风摆幅最大）；成熟地块的专属图标上下浮动
      cropMeshes.forEach((cm, i) => {
        if (cm.model) cm.model.rotation.z = Math.sin(anim.t * 1.5 + i * 0.7) * (cm.ripe ? windSway * 0.9 : windSway * 2);
      });
      plotMeshes.forEach((slot, i) => {
        if (slot.iconSprite.visible) slot.iconSprite.position.y = 1.0 + Math.sin(anim.t * 2 + i * 0.8) * 0.06;
      });
      updateWeather(dt);
      // 暴风雨闪电：随机 3~11 秒一次，天空短暂变亮（3D 灯光 + 覆盖层白闪同步）
      if (weatherSys && weatherSys.weather === 2) {
        weatherSys.flashTimer -= dt;
        if (weatherSys.flashTimer <= 0) { weatherSys.flashTimer = 3 + Math.random() * 8; anim.flash = 0.16; }
      }
      if (anim.flash > 0) {
        anim.flash -= dt;
        const f = Math.max(0, anim.flash / 0.16);
        if (groups.light) groups.light.intensity = 1.12 * ((groups._dim || 0.55) + f * 2.4);
        if (groups.sky) groups.sky.material.color.setHex(0xf4f9ff);
      } else if (groups.sky && groups._skyHex !== undefined) {
        groups.sky.material.color.setHex(groups._skyHex);
        if (groups.light) groups.light.intensity = 1.12 * (groups._dim || 1);
      }
      drawWeatherFX(dt);
      const cam = (camMode === 'field' && !(currentState && currentState.horse.riding)) ? LAYOUT.camField : LAYOUT.camOffset;
      const look = camMode === 'field' ? [cam.lookX, cam.lookY, cam.lookZ] : [0, -2.2, 1.5];
      if (currentState && currentState.horse.riding && camera) {
        camera.position.x = LAYOUT.camOffset.x + Math.sin(anim.t * 0.4) * 1.2;
        camera.lookAt(0, -2.2, 2.5);
      } else if (camera) {
        camera.position.x += (cam.x + camPan.x - camera.position.x) * dt;
        camera.position.y += (cam.y - camera.position.y) * dt;
        camera.position.z += (cam.z + camPan.z - camera.position.z) * dt;
        camera.lookAt(look[0] + camPan.x, look[1], look[2] + camPan.z);
      }
      if (renderer && scene && camera) renderer.render(scene, camera);
    } else {
      renderFallback(dt);
    }
  }

  let currentState = null;

  /* ======================= 2D 等距伪 3D 降级 ======================= */

  function renderFallback(dt) {
    const ctx = fallbackCtx;
    if (!ctx || !fallbackCanvas) return;
    const s = fallbackState;
    const W = fallbackCanvas.width, H = fallbackCanvas.height;
    if (!s) return;
    const theme = D.seasonTheme[s.season];

    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, '#' + theme.sky.toString(16).padStart(6, '0'));
    sky.addColorStop(1, '#' + theme.fog.toString(16).padStart(6, '0'));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.55);
    ctx.fillStyle = '#' + theme.ground.toString(16).padStart(6, '0');
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    // 阴影
    const drawShadow = (x, y, r) => {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // 田地（等距投影）
    const baseX = W * 0.5, baseY = H * 0.32;
    const pw = W * 0.11, ph = H * 0.075;
    s.plots.forEach((p, i) => {
      const row = Math.floor(i / 6), col = i % 6;
      const cx = baseX + (col - 2.5) * pw * 1.02;
      const cy = baseY + row * ph * 1.05;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.moveTo(0, -ph * 0.5); ctx.lineTo(pw * 0.5, 0); ctx.lineTo(0, ph * 0.5); ctx.lineTo(-pw * 0.5, 0);
      ctx.closePath();
      const lv = p.plowed ? Math.max(0, Math.min(3, p.fertilizerLevel || 0)) : 0;
      ctx.fillStyle = p.plowed ? (lv > 0 ? '#4e3728' : (p.waterLevel > 0 ? '#6b4a30' : '#8a6242')) : '#' + theme.ground2.toString(16).padStart(6, '0');
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.stroke();
      if (lv > 0) {
        // 施肥痕迹：黑色芝麻状小点（施肥等级越高越密）
        ctx.fillStyle = 'rgba(20,16,10,0.85)';
        const pts = Math.min(27, 9 + lv * 6);
        for (let k = 0; k < pts; k++) {
          const a = k * 2.39996;
          const rr = 0.16 + Math.sqrt((k + 1) / 27) * 0.72;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * rr * pw * 0.42, Math.sin(a) * rr * ph * 0.42, Math.max(0.9, ph * 0.024), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (p.cropType) {
        const st = CROP_STYLE[p.cropType] || CROP_STYLE.turnip;
        const si = cropStageIndex(p);
        const hgt = [0.16, 0.3, 0.42, 0.5][si];
        ctx.strokeStyle = '#5f9f42';
        ctx.lineWidth = Math.max(1, ph * 0.035);
        ctx.beginPath(); ctx.moveTo(0, ph * 0.12); ctx.lineTo(0, ph * 0.12 - ph * hgt); ctx.stroke();
        ctx.fillStyle = si === 0 ? '#c4ec92' : '#' + st.leaf.toString(16).padStart(6, '0');
        const lw = pw * (0.13 + si * 0.05);
        [-1, 1].forEach(function (dir) {
          ctx.beginPath();
          ctx.ellipse(dir * lw * 0.42, ph * 0.1 - ph * hgt * 0.72, lw * 0.45, ph * 0.055, dir * 0.6, 0, Math.PI * 2);
          ctx.fill();
        });
        if (p.harvestable) {
          const ic = cropIconCanvas(p.cropType);
          const isz = ph * 0.8;
          ctx.drawImage(ic, -isz / 2, -ph * 0.5 - isz * 0.88, isz, isz);
        } else if (si === 2) {
          ctx.fillStyle = '#' + st.bloom.toString(16).padStart(6, '0');
          ctx.beginPath(); ctx.arc(0, ph * 0.12 - ph * hgt, ph * 0.1, 0, Math.PI * 2); ctx.fill();
        }
      } else if (p.waterLevel > 0) {
        ctx.fillStyle = 'rgba(80,140,220,0.25)';
        ctx.beginPath(); ctx.ellipse(0, 0, pw * 0.4, ph * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });

    // 动物（Q 版圆身 + 大眼 + 立体渐变 + 阴影）
    const animals = s.animals.concat(s.horse.owned ? [{ type: 'horse', name: s.horse.name }] : []).concat(s.dog.owned ? [{ type: 'dog', name: s.dog.name }] : []);
    animals.forEach((a, i) => {
      const t = (anim.t * 0.35 + i * 1.7);
      const cx = W * (0.2 + ((i * 0.23 + Math.sin(t) * 0.04) % 0.6));
      const cy = H * (0.66 + Math.cos(t * 0.8) * 0.05 + (i % 2) * 0.06);
      const cfg = { chicken: ['#fff8ea', 0.05], cow: ['#fff6f2', 0.085], sheep: ['#fffdf8', 0.08], anjela: ['#fffdf8', 0.055], horse: ['#b87333', 0.1], dog: ['#f3c48a', 0.06] }[a.type] || ['#fff8ea', 0.07];
      const r = cfg[1] * Math.min(W, H);
      drawShadow(cx, cy + r * 0.85, r * 1.05);
      const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.15, cx, cy, r * 1.15);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, cfg[0]);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.05, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(90,70,55,0.55)'; ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.stroke();
      // 头
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.95, r * 0.66, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // 大眼 + 高光
      [-1, 1].forEach(sgn => {
        ctx.fillStyle = '#2b2320';
        ctx.beginPath(); ctx.arc(cx + sgn * r * 0.26, cy - r * 0.98, r * 0.11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx + sgn * r * 0.26 + r * 0.04, cy - r * 1.03, r * 0.045, 0, Math.PI * 2); ctx.fill();
      });
      // 腮红
      ctx.fillStyle = 'rgba(255,160,175,0.5)';
      [-1, 1].forEach(sgn => { ctx.beginPath(); ctx.ellipse(cx + sgn * r * 0.5, cy - r * 0.78, r * 0.12, r * 0.07, 0, 0, Math.PI * 2); ctx.fill(); });
    });

    // 天气粒子
    if (s.weather !== 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(180,215,255,0.75)';
      ctx.lineWidth = 1.4;
      const isSnow = s.weather === 5 || s.season === 3;
      for (let i = 0; i < 90; i++) {
        const x = ((i * 37 + anim.t * (isSnow ? 30 : 420)) % W);
        const y = ((i * 53 + anim.t * (isSnow ? 90 : 700)) % H);
        if (isSnow) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 12); ctx.stroke(); }
      }
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('等距伪 3D 降级模式（未检测到 WebGL）', 14, H - 16);
    ctx.restore();
  }

  /* ======================= 对外接口 ======================= */

  function resize() {
    if (mode === '3d' && renderer && container) {
      const w = container.clientWidth || 720, h = container.clientHeight || 460;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      resizeWeatherFX();
    } else if (mode === '2d' && fallbackCanvas) {
      const w = container ? (container.clientWidth || 720) : 720;
      const h = container ? (container.clientHeight || 460) : 460;
      fallbackCanvas.width = w;
      fallbackCanvas.height = h;
    }
  }

  function refresh(state) {
    currentState = state;
    fallbackState = state;
    if (mode === '2d') return;
    if (!scene) return;
    if (state.season !== last.season) {
      last.season = state.season;
      applyTheme(state.season, state.weather);
    }
    if (state.weather !== last.weather) {
      last.weather = state.weather;
      applyTheme(state.season, state.weather);
      buildWeather(state.weather, state.season);
    }
    const sig = animalSignature(state);
    if (sig !== last.animalSig) {
      last.animalSig = sig;
      spawnAnimals(state);
    }
    // 同步动物状态标记
    state.animals.forEach(a => {
      const rig = animalRigs.find(r => r.id === a.id);
      if (rig) { rig.grazing = a.grazing; rig.produce = a.produceReady; rig.sick = a.sick; }
    });
    if (dogRig) { dogRig.grazing = false; dogRig.produce = state.dog.fed; }
    if (horseRig) { horseRig.grazing = false; horseRig.produce = state.horse.riding; }
    syncStructures(state);
    syncField(state);
  }

  function destroy() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (renderer) { renderer.dispose(); }
    renderer = null; scene = null; camera = null;
    animalRigs = []; horseRig = null; dogRig = null; pickables = [];
    eagleRig = null; cormorantRig = null;
  }

  return {
    init: init,
    refresh: refresh,
    resize: resize,
    destroy: destroy,
    // 农田特写机位开关（用于查看作物各生长阶段与施肥痕迹）
    focusField: function (on) { camMode = on ? 'field' : 'wide'; },
    mode: function () { return mode; },
    // 只读自检接口：返回围栏段 / 加工机在屏幕空间的归一化坐标（0~1），用于确认设施确实落在可视区内
    probeStructures: function () {
      var out = [];
      if (!camera || !groups.structures || !renderer) return out;
      var v = new THREE.Vector3();
      groups.structures.children.forEach(function (c) {
        v.set(c.position.x, 0.6, c.position.z).project(camera);
        out.push({
          kind: c.userData.structKind,
          x: +((v.x + 1) / 2).toFixed(3),
          y: +((1 - v.y) / 2).toFixed(3),
          inView: v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 && v.z < 1
        });
      });
      return out;
    },
    // 只读自检接口：返回飞禽伙伴在屏幕空间的归一化坐标（0~1），用于确认老鹰 / 鸬鹚 3D 模型确实落在可视区内
    probeBirds: function () {
      var out = {};
      if (!camera || !renderer || mode !== '3d') return out;
      var v = new THREE.Vector3();
      var box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3();
      var vf = new THREE.Vector2(); renderer.getSize(vf);
      var vFov = camera.fov * Math.PI / 180;
      [['eagle', eagleRig], ['cormorant', cormorantRig]].forEach(function (pair) {
        var rig = pair[1];
        if (!rig) { out[pair[0]] = null; return; }
        v.set(rig.group.position.x, rig.group.position.y + 0.8, rig.group.position.z).project(camera);
        box.setFromObject(rig.group); box.getSize(size); box.getCenter(center);
        var rWorld = Math.max(size.x, size.y, size.z) / 2;
        var dist = camera.position.distanceTo(center);
        var worldH = 2 * Math.tan(vFov / 2) * dist;
        out[pair[0]] = {
          x: +((v.x + 1) / 2).toFixed(3), y: +((1 - v.y) / 2).toFixed(3),
          inView: v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 && v.z < 1,
          worldSize: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)],
          camDist: +dist.toFixed(1),
          heightPx: +(2 * rWorld * (vf.y / worldH)).toFixed(1)
        };
      });
      return out;
    },
    // 只读自检接口：维护／冒烟测试时确认场景是否按预期构建
    stats: function () {
      return {
        mode: mode,
        animals: animalRigs.map(function (r) { return r.type + ':' + r.id; }),
        horse: !!horseRig,
        dog: !!dogRig,
        pickables: pickables.length,
        // 玩家设施自检：围栏等级 / 已摆出围栏段数 / 已摆出加工机数量
        structures: (function () {
          var lv = (currentState && currentState.build) ? Math.max(1, Math.min(5, Math.round(Number(currentState.build.fenceLevel) || 1))) : 1;
          var fences = 0, machines = 0;
          if (groups.structures) {
            groups.structures.children.forEach(function (c) {
              if (c.userData.structKind === 'fence') fences++;
              else if (c.userData.structKind === 'machine') machines++;
            });
          }
          return { fenceLevel: lv, fenceSegments: fences, machines: machines };
        })(),
        // 撒娇中的动物：id + 爱心档位 + 头顶爱心颜色 + 爱心是否浮现
        charm: (function () {
          var all = animalRigs.concat(dogRig ? [dogRig] : []).concat(horseRig ? [horseRig] : []);
          return all.filter(function (r) { return r.charm > 0; }).map(function (r) {
            var pts = 0;
            if (currentState) {
              var a = currentState.animals.filter(function (x) { return x.id === r.id; })[0];
              var pet = (r.id === 'dog' || r.id === 'horse') ? currentState[r.id] : null;
              pts = a ? (a.points || 0) : (pet ? (pet.points || 0) : 0);
            }
            var col = 'na';
            if (r.charmHeart && r.charmHeart.children.length) {
              var mm = r.charmHeart.children[0].material;
              if (mm && mm.color) col = '#' + mm.color.getHexString();
            }
            return (r.id || r.type) + ':' + heartTierOf(pts) + ':' + col + ':' + (r.charmHeart && r.charmHeart.visible ? 'heart-on' : 'heart-off');
          });
        })(),
        // 马 / 小狗当前位置（用于确认是否在自主走动）
        pets: {
          dog: dogRig ? [+dogRig.group.position.x.toFixed(2), +dogRig.group.position.z.toFixed(2)] : null,
          horse: horseRig ? [+horseRig.group.position.x.toFixed(2), +horseRig.group.position.z.toFixed(2)] : null
        },
        // 飞禽伙伴：正式 3D 模型是否已摆出（按领养状态）+ 当前位置，用于回归确认牧场里确实有老鹰 / 鸬鹚模型
        birds: {
          eagle: eagleRig ? { x: +eagleRig.group.position.x.toFixed(2), y: +eagleRig.group.position.y.toFixed(2), z: +eagleRig.group.position.z.toFixed(2), meshes: countMeshes(eagleRig.group) } : null,
          cormorant: cormorantRig ? { x: +cormorantRig.group.position.x.toFixed(2), y: +cormorantRig.group.position.y.toFixed(2), z: +cormorantRig.group.position.z.toFixed(2), meshes: countMeshes(cormorantRig.group) } : null
        },
        canvas: renderer ? [renderer.domElement.width, renderer.domElement.height] : null
      };
    },
    // 只读自检接口：返回牧场动物的屏幕归一化坐标（0~1），便于自动化测试直接点中动物本体
    probeAnimals: function () {
      var out = [];
      if (!camera || !renderer || mode !== '3d') return out;
      var v = new THREE.Vector3();
      var dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      var all = animalRigs.concat(dogRig ? [dogRig] : []).concat(horseRig ? [horseRig] : []);
      all.forEach(function (r) {
        v.set(r.group.position.x, 1.0, r.group.position.z).project(camera);
        out.push({
          id: r.id || r.type,
          wx: +r.group.position.x.toFixed(2),
          wy: +r.group.position.y.toFixed(2),
          wz: +r.group.position.z.toFixed(2),
          x: +((v.x + 1) / 2).toFixed(3),
          y: +((1 - v.y) / 2).toFixed(3),
          inView: v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 && v.z < 1
        });
      });
      /* 松鼠调试位（与动物同口径：屏幕分数 0..1；state: tree/down/gnaw/up/flee/hide/peek） */
      var sq = null;
      if (squirrelRig && squirrelRig.group) {
        v.set(squirrelRig.group.position.x, squirrelRig.group.position.y + 0.5, squirrelRig.group.position.z).project(camera);
        sq = {
          wx: +squirrelRig.group.position.x.toFixed(2),
          wy: +squirrelRig.group.position.y.toFixed(2),
          wz: +squirrelRig.group.position.z.toFixed(2),
          x: +((v.x + 1) / 2).toFixed(3),
          y: +((1 - v.y) / 2).toFixed(3),
          inView: v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 && v.z < 1,
          state: squirrelRig.state
        };
      }
      return { animals: out, squirrel: sq, cam: {
        px: +camera.position.x.toFixed(2), py: +camera.position.y.toFixed(2), pz: +camera.position.z.toFixed(2),
        fx: +dir.x.toFixed(3), fy: +dir.y.toFixed(3), fz: +dir.z.toFixed(3),
        aspect: +camera.aspect.toFixed(3), fov: camera.fov, near: camera.near, far: camera.far
      } };
    },
    // 田间各生长阶段造型图标（供 UI 农田面板复用同一套 2D 造型，保证与 3D 场景一致）
    cropStageIcon: function (cropId, stageIdx) { return cropStageIconURL(cropId, stageIdx); },
    onClickPlot: function (cb) { callbacks.plot = cb; },
    onClickAnimal: function (cb) { callbacks.animal = cb; },
    onClickMine: function (cb) { callbacks.mine = cb; },
    onClickCrate: function (cb) { callbacks.crate = cb; }
  };
})();
