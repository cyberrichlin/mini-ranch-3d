/**
 * scene.js —— 3D 牧场场景渲染层（v2 · 萌版 3D）
 * 基于本地 Three.js：固定俯视角、Q 版圆润动物、卡通渲染、柔光与景深、四季色调、天气粒子。
 * 只读 Game.state，不修改任何游戏状态。若 WebGL / Three.js 不可用，自动降级为等距伪 3D。
 */
window.Scene = (function () {
  'use strict';

  const D = window.GAME_DATA;

  const LAYOUT = {
    field: { cols: 6, rows: 4, plotSize: 2, gap: 0.12, x: -6.3, z: -10.2 },
    pasture: { minX: -11, maxX: 11, minZ: -4, maxZ: 4 },
    house: { x: -11.5, z: -7.5 },
    barn: { x: 11.5, z: -7.5 },
    coop: { x: 8.5, z: -13 },
    doghouse: { x: -13, z: -1.5 },
    pond: { x: -15.5, z: 4.5, r: 3.2 },
    mine: { x: 15, z: 3.5 },
    camOffset: { x: 0, y: 27, z: 26 }
  };

  const CROP_COLOR = {
    turnip: 0x8bd46a, potato: 0x7fbf5a, cucumber: 0x63bd52, strawberry: 0xef5f6b,
    tomato: 0xe14b3f, corn: 0xf2c14e, watermelon: 0x3f8f4a, eggplant: 0x8455c8,
    carrot: 0xf08a3c, pumpkin: 0xf08a2a, sweetpotato: 0xc0603a, cabbage: 0x9fd45f, radish: 0xe8f0f5
  };

  let mode = '3d';
  let container = null;
  let renderer = null, scene = null, camera = null, clock = null;
  let groups = {};
  let animalRigs = [], horseRig = null, dogRig = null, riderRig = null;
  let plotMeshes = [], cropMeshes = [];
  let gradientMap = null;
  let weatherSys = null;
  let running = false, rafId = 0;
  let pointer = { x: 0, y: 0 };
  let raycaster = null;
  let callbacks = { plot: null, animal: null, mine: null };
  let anim = { t: 0, rideAngle: 0, riders: 0, flash: 0 };
  let last = { season: -1, weather: -1, riding: false, animalSig: '' };
  let fallbackCtx = null, fallbackCanvas = null, fallbackState = null;
  const toonMats = {};

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

    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    groups.clouds = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        const s = mesh(sphere(1.1 + Math.random() * 0.9, 12, 10), cloudMat, (j - n / 2) * 1.4, Math.random() * 0.4, Math.random() * 0.6, c, false, false);
        s.scale.y = 0.62;
      }
      c.position.set(-40 + Math.random() * 80, 20 + Math.random() * 8, -40 + Math.random() * 55);
      groups.clouds.add(c);
    }
    groups.terrain.add(groups.clouds);
  }

  function buildGround() {
    const g = mesh(new THREE.CircleGeometry(46, 48), soft(0x92d46c), 0, -0.02, 0, groups.terrain, false, true);
    g.rotation.x = -Math.PI / 2;
    groups.ground = g;

    // 远山
    const hillMat = soft(0x8ed46a);
    for (let i = 0; i < 5; i++) {
      const h = mesh(sphere(6 + Math.random() * 5, 14, 10), hillMat, -34 + i * 17, -3.5, -30 - Math.random() * 8, groups.terrain, false, false);
      h.scale.y = 0.55;
    }

    // 草簇
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x7ec85a });
    const grassGeo = new THREE.ConeGeometry(0.16, 0.7, 5);
    for (let i = 0; i < 90; i++) {
      const x = -22 + Math.random() * 44, z = -20 + Math.random() * 40;
      if (x > -8 && x < 8 && z > -12 && z < -1) continue;
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

    // 矿洞入口
    const m = LAYOUT.mine;
    const rockArch = mesh(new THREE.TorusGeometry(1.8, 0.7, 10, 18, Math.PI), toon(0x9a8877), m.x, 0.1, m.z, groups.buildings);
    rockArch.rotation.x = 0;
    const cave = mesh(new THREE.CircleGeometry(1.7, 20), new THREE.MeshBasicMaterial({ color: 0x2b2620 }), m.x, 1.6, m.z + 0.05, groups.buildings, false, false);
    void cave;
    const mineTop = new THREE.Mesh(new THREE.CircleGeometry(1.75, 20), new THREE.MeshBasicMaterial({ color: 0x1d1a16 }));
    mineTop.position.set(m.x, 1.7, m.z - 0.02);
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
        const soilHit = new THREE.Mesh(new THREE.BoxGeometry(F.plotSize * 1.02, 0.5, F.plotSize * 1.02), new THREE.MeshBasicMaterial({ visible: false }));
        soilHit.position.set(x, 0.25, z);
        soilHit.userData.pickType = 'plot';
        soilHit.userData.index = idx;
        groups.field.add(soilHit);
        pickables.push(soilHit);
        plotMeshes.push({ soil: soil, grass: grass, cropGroup: cropGroup, x: x, z: z, soilHit: soilHit });
        cropMeshes.push({ group: cropGroup, pods: [] });
      }
    }
  }

  function buildFence() {
    const P = LAYOUT.pasture;
    const postMat = toon(0xc08a55);
    const railMat = toon(0xdba469);
    const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 1.5, 7);
    const railGeo = new THREE.BoxGeometry(1.4, 0.16, 0.12);
    const step = 2.2;
    const segments = [];

    for (let x = P.minX; x <= P.maxX + 0.01; x += step) {
      segments.push({ x: x, z: P.minZ, rot: 0, dir: 'x' });
      segments.push({ x: x, z: P.maxZ, rot: 0, dir: 'x' });
    }
    for (let z = P.minZ; z <= P.maxZ + 0.01; z += step) {
      segments.push({ x: P.minX, z: z, rot: Math.PI / 2, dir: 'z' });
      segments.push({ x: P.maxX, z: z, rot: Math.PI / 2, dir: 'z' });
    }
    segments.forEach(s => {
      mesh(postGeo, postMat, s.x, 0.75, s.z, groups.props);
      for (let k = 0; k < 2; k++) {
        const r = mesh(railGeo, railMat, s.x, 0.5 + k * 0.55, s.z, groups.props);
        r.rotation.y = s.rot;
      }
    });
  }

  function buildProps() {
    // 树
    const trunkMat = toon(0x8a6242);
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 2.2, 8);
    groups.foliage = [];
    const spots = [
      [-17, -14], [-13, -16], [16, -13], [18, -6], [-18, 1], [19, 2], [-16, 15], [16, 17],
      [-5, 19], [7, 19], [-19, -6], [4, -16], [-9, 17], [13, 14], [-21, 10], [21, -14]
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

    // 石头
    const rockMat = toon(0xa9a29a);
    for (let i = 0; i < 9; i++) {
      const x = -20 + Math.random() * 40, z = -18 + Math.random() * 36;
      if (x > -9 && x < 9 && z > -13 && z < -1) continue;
      if (x > -12 && x < 12 && z > 0 && z < 13) continue;
      const r = mesh(new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.6, 0), rockMat, x, 0.35, z, groups.props);
      r.rotation.set(Math.random(), Math.random(), Math.random());
      r.scale.y = 0.75;
    }

    // 木牌
    const sign = mesh(new THREE.BoxGeometry(1.5, 0.9, 0.12), toon(0xd8b074), -3.5, 1.3, -0.4, groups.props);
    void sign;
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), toon(0x8a6242), -3.5, 0.6, -0.4, groups.props);
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
    return state.animals.map(a => a.id + a.type + a.grazing + a.produceReady + a.sick + Math.floor(a.points / 25)).join('|') +
      '|' + (state.horse.owned ? 'H' : '-') + (state.horse.riding ? 'R' : '-') + (state.dog.owned ? 'D' : '-');
  }

  /** 爱心值 → 等级（与 ui.js / game.js 的 25 分一档保持一致） */
  function heartTierOf(points) {
    const lv = Math.floor((points || 0) / 25);
    if (lv >= 8) return 'red';
    if (lv >= 4) return 'yellow';
    return 'gray';
  }

  /** 撒娇爱心指示：低心灰 / 中黄 / 高红（几何拼成的小爱心，避免 file:// 下贴图受限） */
  function charmHeartMesh(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: color });
    mesh(sphere(0.17, 12, 12), mat, -0.13, 0.09, 0, g, false, false);
    mesh(sphere(0.17, 12, 12), mat, 0.13, 0.09, 0, g, false, false);
    const tip = mesh(new THREE.ConeGeometry(0.245, 0.32, 4), mat, 0, -0.17, 0, g, false, false);
    tip.rotation.z = Math.PI;
    tip.rotation.y = Math.PI / 4;
    g.visible = false;
    return g;
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

  function spawnAnimals(state) {
    animalRigs.forEach(r => groups.animals.remove(r.group));
    animalRigs = [];
    if (horseRig) { groups.animals.remove(horseRig.group); horseRig = null; }
    if (dogRig) { groups.animals.remove(dogRig.group); dogRig = null; }

    const P = LAYOUT.pasture;
    state.animals.forEach((a, i) => {
      const rig = buildRigFor(a);
      rig.id = a.id;
      const ang = (i / Math.max(1, state.animals.length)) * Math.PI * 2;
      rig.group.position.set(P.minX + 3 + (i % 4) * 5 + Math.random(), 0, P.minZ + 2.5 + Math.floor(i / 4) * 4.5 + Math.random());
      rig.wander = { tx: rig.group.position.x, tz: rig.group.position.z, timer: 1 + Math.random() * 3, speed: 0.5 + Math.random() * 0.4 };
      void ang;
      rig.group.traverse(o => { if (o.isMesh) { o.userData.pickType = 'animal'; o.userData.animalId = a.id; pickables.push(o); } });
      groups.animals.add(rig.group);
      animalRigs.push(rig);
    });

    if (state.dog.owned) {
      dogRig = buildDog(1);
      dogRig.group.position.set(LAYOUT.doghouse.x - 2, 0, LAYOUT.doghouse.z - 2);
      dogRig.wander = { tx: dogRig.group.position.x, tz: dogRig.group.position.z, timer: 2, speed: 0.7 };
      groups.animals.add(dogRig.group);
    }

    if (state.horse.owned) {
      horseRig = buildHorse(1.28);
      horseRig.group.position.set(LAYOUT.barn.x - 4, 0, LAYOUT.pasture.minZ + 3);
      horseRig.wander = { tx: horseRig.group.position.x, tz: horseRig.group.position.z, timer: 2, speed: 0.6 };
      if (state.horse.riding) {
        riderRig = buildRider();
        riderRig.position.set(0, 2.0, -0.1);
        horseRig.group.add(riderRig);
      }
      groups.animals.add(horseRig.group);
    }
  }

  function updateAnimal(rig, dt, state) {
    const P = LAYOUT.pasture;
    const isHorse = rig.type === 'horse';
    const riding = isHorse && state.horse.riding;

    // 呼吸
    rig.bob += dt * 2.2;
    if (rig.parts.body) {
      rig.parts.body.scale.y = (rig.parts.body.userData.sy || (rig.parts.body.userData.sy = rig.parts.body.scale.y)) * (1 + Math.sin(rig.bob) * 0.025);
    }
    if (rig.parts.tail) rig.parts.tail.rotation.y = Math.sin(rig.bob * 1.6) * 0.35;
    if (rig.parts.head) {
      const targetHeadY = rig.grazing ? -0.5 : 0;
      rig.parts.head.rotation.x += ((rig.parts.head.rotation.x || 0) - targetHeadY) * -dt * 3;
    }

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

    // 撒娇互动：点击动物后朝玩家方向蹦跳撒娇，头顶爱心按爱心值显示 灰 / 黄 / 红
    const aRef = state.animals.find(x => x.id === rig.id);
    if (aRef) {
      if (aRef.charm > 0) {
        rig.charm = aRef.charm;
        aRef.charm = Math.max(0, aRef.charm - dt);
      } else if (rig.charm) {
        rig.charm = 0;
      }
    }
    if (rig.charm > 0) {
      const hop = Math.abs(Math.sin(anim.t * 6)) * 0.32;
      rig.group.position.y = hop;
      rig.group.rotation.y += (0 - rig.group.rotation.y) * Math.min(1, dt * 5);
      if (rig.parts.head) rig.parts.head.rotation.z = Math.sin(anim.t * 9) * 0.18;
      if (rig.parts.tail) rig.parts.tail.rotation.y = Math.sin(anim.t * 10) * 0.6;
      if (rig.charmHeart) {
        const tier = heartTierOf(aRef ? aRef.points : 0);
        if (rig.charmTier !== tier) {
          rig.charmTier = tier;
          const col = tier === 'red' ? 0xef4b64 : (tier === 'yellow' ? 0xf5b731 : 0xa9a9b0);
          rig.charmHeart.traverse(o => { if (o.material && o.material.color) o.material.color.setHex(col); });
        }
        rig.charmHeart.visible = true;
        const k = Math.min(1, rig.charm / 2.4);
        rig.charmHeart.scale.setScalar(0.7 + k * 0.45);
        rig.charmHeart.position.y = 2.5 + Math.abs(Math.sin(anim.t * 5)) * 0.22;
        rig.charmHeart.rotation.y += dt * 1.8;
      }
    } else {
      if (!riding && rig.group.position.y !== 0) rig.group.position.y = 0;
      if (rig.parts.head) rig.parts.head.rotation.z = (rig.parts.head.rotation.z || 0) * (1 - Math.min(1, dt * 4));
      if (rig.charmHeart) rig.charmHeart.visible = false;
    }

    // 移动
    let dirX = 0, dirZ = 0, moving = false;
    if (riding) {
      anim.rideAngle += dt * 0.55;
      const rx = Math.sin(anim.rideAngle) * 9.5;
      const rz = Math.cos(anim.rideAngle) * 3.2;
      rig.group.position.x += (rx - rig.group.position.x) * Math.min(1, dt * 3);
      rig.group.position.z += (rz - rig.group.position.z) * Math.min(1, dt * 3);
      rig.group.position.y = Math.abs(Math.sin(anim.rideAngle * 8)) * 0.22;
      rig.group.rotation.y = Math.atan2(Math.cos(anim.rideAngle) * 9.5, -Math.sin(anim.rideAngle) * 3.2) + Math.PI / 2;
      moving = true;
      rig.speedFactor = 2.6;
    } else {
      rig.wander.timer -= dt;
      if (rig.wander.timer <= 0) {
        rig.wander.timer = 1.6 + Math.random() * 3.4;
        rig.wander.tx = P.minX + 1.5 + Math.random() * (P.maxX - P.minX - 3);
        rig.wander.tz = P.minZ + 1.5 + Math.random() * (P.maxZ - P.minZ - 3);
      }
      dirX = rig.wander.tx - rig.group.position.x;
      dirZ = rig.wander.tz - rig.group.position.z;
      const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (dist > 0.35) {
        const step = (rig.state === 'grazing' ? 0.35 : 0.7) * (rig.speedFactor || 1) * dt * (rig.idle ? 1 : 1);
        rig.group.position.x += (dirX / dist) * step;
        rig.group.position.z += (dirZ / dist) * step;
        rig.group.rotation.y = Math.atan2(dirX, dirZ);
        moving = true;
      }
      rig.speedFactor = undefined;
    }
    void dirX; void dirZ;

    // 走路摆腿
    const legs = rig.parts.legs || [];
    rig.walkPhase = (rig.walkPhase || 0) + dt * (moving ? 9 * (rig.speedFactor || 1) : 0);
    legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(rig.walkPhase + (i % 2) * Math.PI) * (moving ? 0.35 : 0);
    });
    rig.group.position.y = (rig.group.position.y || 0) * 0.9 + (moving ? Math.abs(Math.sin(rig.walkPhase)) * 0.05 : 0);

    // 生病标记：头顶小气泡
    if (rig.sickFlag === undefined || rig.sickFlag !== rig.sick) {
      rig.sickFlag = rig.sick;
      if (rig.sick && !rig.sickMesh) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7ad06d }));
        s.position.set(0, 2.6, 0);
        rig.group.add(s);
        rig.sickMesh = s;
      } else if (!rig.sick && rig.sickMesh) {
        rig.group.remove(rig.sickMesh);
        rig.sickMesh = null;
      }
    }
    if (rig.sickMesh) rig.sickMesh.position.y = 2.6 + Math.sin(anim.t * 3) * 0.1;

    // 产物就绪光环
    if (rig.produceFlag !== rig.produce) {
      rig.produceFlag = rig.produce;
      if (rig.produce && !rig.produceMesh) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 18), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
        ring.position.set(0, 2.3, 0);
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
      rig.produceMesh.position.y = 2.3 + Math.sin(anim.t * 4) * 0.08;
    }
  }

  /* ======================= 田地同步 ======================= */

  const cropGeoCache = {};
  function cropGeo(kind) {
    if (!cropGeoCache[kind]) {
      cropGeoCache[kind] = kind === 'plant' ? new THREE.ConeGeometry(0.17, 0.55, 7) : new THREE.SphereGeometry(0.2, 12, 10);
    }
    return cropGeoCache[kind];
  }

  function syncField(state) {
    state.plots.forEach((p, i) => {
      const slot = plotMeshes[i];
      if (!slot) return;
      slot.grass.visible = !p.plowed;
      slot.soil.visible = !!p.plowed;
      if (p.fertilizerLevel > 0) slot.soil.material = toon(0x5f7a3a);
      else if (p.waterLevel > 0) slot.soil.material = toon(0x6b4a30);
      else slot.soil.material = toon(0x8a6242);

      const cm = cropMeshes[i];
      const need = p.cropType ? (p.harvestable ? 5 : 3) : 0;
      while (cm.pods.length < need) {
        const kind = cm.pods.length < 3 ? 'plant' : 'fruit';
        const color = p.harvestable ? (CROP_COLOR[p.cropType] || 0xef5f6b) : 0x6cc25a;
        const m = mesh(cropGeo(kind), toon(color), 0, 0.25, 0, cm.group, true, false);
        m.userData.baseY = 0.25;
        cm.pods.push(m);
      }
      while (cm.pods.length > need) {
        const m = cm.pods.pop();
        cm.group.remove(m);
        m.geometry = m.geometry;
      }
      if (!p.cropType) return;

      const ratio = p.maxGrowth ? Math.min(1, p.growthStage / p.maxGrowth) : 1;
      cm.group.visible = true;
      cm.pods.forEach((m, k) => {
        const ang = (k / Math.max(1, cm.pods.length)) * Math.PI * 2;
        const r = 0.52;
        m.position.set(Math.cos(ang) * r, 0.25, Math.sin(ang) * r);
        if (k < 3) {
          m.scale.set(1, 0.6 + ratio * 0.9, 1);
          m.position.y = 0.1 + ratio * 0.22;
        } else {
          m.scale.setScalar(0.8 + ratio * 0.5);
          m.position.y = p.harvestable ? 0.72 + Math.sin(anim.t * 3 + k) * 0.03 : 0.5;
        }
      });
    });
  }

  /* ======================= 天气系统 ======================= */

  function buildWeather(weather, season) {
    if (weatherSys) { scene.remove(weatherSys.points); weatherSys = null; }
    if (!scene) return;
    const theme = D.seasonTheme[season];
    const isSnow = weather === 5 || (season === 3 && weather === 1);
    let kind = null, color = 0xa8d8ff, size = 0.16, count = 700, speed = 14;
    if (weather === 2 || weather === 4) { kind = 'rain'; count = 1100; size = 0.19; speed = 26; color = 0x9dc8ff; }
    else if (weather === 1) { kind = isSnow ? 'snow' : 'rain'; count = isSnow ? 500 : 800; size = isSnow ? 0.22 : 0.16; speed = isSnow ? 5 : 16; }
    else if (weather === 5) { kind = 'snow'; count = 900; size = 0.24; speed = 6; }
    else { kind = theme.decor; count = kind === 'petal' ? 160 : kind === 'leaf' ? 140 : 80; size = kind === 'leaf' ? 0.3 : 0.2; speed = 3; color = kind === 'petal' ? 0xffc0d4 : kind === 'leaf' ? 0xe08a3c : 0xffffff; }

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
    const mat = new THREE.PointsMaterial({ color: color, size: size, transparent: true, opacity: kind === 'rain' || kind === 'snow' ? 0.85 : 0.9, depthWrite: false, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    weatherSys = { points: points, kind: kind, count: count, speed: speed, vel: vel };
  }

  function updateWeather(dt) {
    if (!weatherSys) return;
    const arr = weatherSys.points.geometry.attributes.position.array;
    const isRain = weatherSys.kind === 'rain';
    for (let i = 0; i < weatherSys.count; i++) {
      const i3 = i * 3;
      arr[i3 + 1] -= weatherSys.speed * weatherSys.vel[i] * dt;
      if (weatherSys.kind === 'petal' || weatherSys.kind === 'leaf' || weatherSys.kind === 'bug') {
        arr[i3] += Math.sin(anim.t * 1.2 + i) * dt * 1.8;
        arr[i3 + 2] += Math.cos(anim.t * 0.9 + i) * dt * 1.4;
      } else {
        arr[i3] += (isRain ? 2.5 : 0.4) * dt;
      }
      if (arr[i3 + 1] < 0) {
        arr[i3 + 1] = 24 + Math.random() * 4;
        arr[i3] = (Math.random() - 0.5) * 54;
        arr[i3 + 2] = (Math.random() - 0.5) * 54;
      }
    }
    weatherSys.points.geometry.attributes.position.needsUpdate = true;
  }

  /* ======================= 主题 ======================= */

  function applyTheme(season, weather, immediate) {
    const theme = D.seasonTheme[season];
    if (scene) scene.fog = new THREE.Fog(theme.fog, 34, 78);
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

    // 雨天压暗
    const dim = (weather === 2 || weather === 4 || weather === 5) ? 0.55 : weather === 1 ? 0.78 : 1;
    if (groups.light) {
      groups.light.intensity = 0.9 * dim;
      groups.hemi.intensity = 0.85 * (dim + 0.15);
    }
    if (!immediate) groups._flashTarget = dim;
    // 冬季地面覆雪
    if (groups.ground && season === 3) groups.ground.material.color.setHex(0xeaf3fb);
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
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xdcefff, 72, 150);   // 远处轻微空气雾，增强景深
    gradientMap = makeGradientMap();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
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
    scene.add(groups.terrain, groups.field, groups.buildings, groups.props, groups.animals);

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

    buildSky();
    buildGround();
    buildPond();
    buildField();
    buildFence();
    buildProps();
    buildBuildings();

    pickables.length = 0;
    bindPointer(canvasEl);
    resize();
    applyTheme(state.season, state.weather, true);
    buildWeather(state.weather, state.season);
    spawnAnimals(state);
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
    canvasEl.addEventListener('click', e => {
      if (mode !== '3d' || !renderer) { handleFallbackClick(e); return; }
      const rect = canvasEl.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      for (let i = 0; i < hits.length; i++) {
        const ud = hits[i].object.userData;
        if (ud.pickType === 'plot' && callbacks.plot) { callbacks.plot(ud.index); return; }
        if (ud.pickType === 'animal' && callbacks.animal) { callbacks.animal(ud.animalId); return; }
        if (ud.pickType === 'mine' && callbacks.mine) { callbacks.mine(); return; }
        if (ud.pickType === 'pasture') { return; }
      }
    });
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
      if (groups.clouds) groups.clouds.rotation.y += dt * 0.012;
      if (groups.water) groups.water.material.opacity = 0.86 + Math.sin(anim.t * 1.6) * 0.06;
      if (groups.foliage) groups.foliage.forEach(f => { f.rotation.z = Math.sin(anim.t * 0.9 + f.userData.phase) * 0.02; });
      if (currentState) animalRigs.forEach(r => updateAnimal(r, dt, currentState));
      if (dogRig && currentState) updateAnimal(dogRig, dt, currentState);
      if (horseRig && currentState) updateAnimal(horseRig, dt, currentState);
      cropMeshes.forEach(cm => {
        cm.pods.forEach((m, k) => {
          if (m.geometry && m.geometry.type === 'SphereGeometry' && m.material && m.material.color) {
            m.rotation.y += dt * 0.6;
          }
        });
      });
      updateWeather(dt);
      if (currentState && currentState.horse.riding && camera) {
        camera.position.x = LAYOUT.camOffset.x + Math.sin(anim.t * 0.4) * 1.2;
        camera.lookAt(0, -2.2, 2.5);
      } else if (camera) {
        camera.position.x += (LAYOUT.camOffset.x - camera.position.x) * dt;
        camera.lookAt(0, -2.2, 1.5);
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
      ctx.fillStyle = p.plowed ? '#8a6242' : '#' + theme.ground2.toString(16).padStart(6, '0');
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.stroke();
      if (p.cropType) {
        const ratio = p.maxGrowth ? Math.min(1, p.growthStage / p.maxGrowth) : 1;
        ctx.fillStyle = p.harvestable ? '#ef5f6b' : '#5fae4a';
        ctx.beginPath();
        ctx.arc(0, -2, ph * (0.12 + ratio * 0.2), 0, Math.PI * 2);
        ctx.fill();
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
    syncField(state);
  }

  function destroy() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (renderer) { renderer.dispose(); }
    renderer = null; scene = null; camera = null;
    animalRigs = []; horseRig = null; dogRig = null; pickables = [];
  }

  return {
    init: init,
    refresh: refresh,
    resize: resize,
    destroy: destroy,
    mode: function () { return mode; },
    // 只读自检接口：维护／冒烟测试时确认场景是否按预期构建
    stats: function () {
      return {
        mode: mode,
        animals: animalRigs.map(function (r) { return r.type + ':' + r.id; }),
        horse: !!horseRig,
        dog: !!dogRig,
        pickables: pickables.length,
        canvas: renderer ? [renderer.domElement.width, renderer.domElement.height] : null
      };
    },
    onClickPlot: function (cb) { callbacks.plot = cb; },
    onClickAnimal: function (cb) { callbacks.animal = cb; },
    onClickMine: function (cb) { callbacks.mine = cb; }
  };
})();
