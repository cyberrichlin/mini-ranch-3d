/**
 * models.js —— 萌版 3D 模型工厂（矿石镇风格）
 *
 * 一处定义、两处复用：
 *   1) scene.js 场景内动物建模 → Models.buildAnimal(type, scale)
 *   2) 界面缩略图 / 道具图标 → Models.buildHead(type) / Models.buildTool(key)
 *   3) 真实 Three.js 离屏渲染成 PNG 资源 → tools/assetgen.html 调 Models.renderToPNG()
 *
 * 造型参考《牧场物语：矿石镇的伙伴们》：大眼、圆润、清晰物种特征、
 * 低饱和暖色 + 卡通描边（BackSide 外壳）。依赖本地 three.min.js（r128）。
 */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  if (!THREE) { global.Models = null; return; }

  var M = {};
  var matCache = {};
  /** 动物清单：原 6 种 + 参考图补齐的鸭 / 猫 / 羊驼 */
  var ANIMALS = ['chicken', 'cow', 'sheep', 'anjela', 'horse', 'dog', 'duck', 'cat', 'llama'];
  var TOOLS = ['hoe', 'wateringcan', 'axe', 'hammer', 'sickle', 'fishingrod',
               'fertilizer', 'feed', 'medicine', 'fence',
               'cheesemaker', 'mayomaker', 'yarnmaker', 'barn', 'bed'];
  var SEED_COLOR = {
    turnip: 0xa8e07a, potato: 0xd8b070, cucumber: 0x66c552, strawberry: 0xef5f6b,
    tomato: 0xe14b3f, corn: 0xf2c14e, watermelon: 0x3f8f4a, eggplant: 0x8455c8,
    carrot: 0xf08a3c, pumpkin: 0xf08a2a, sweetpotato: 0xc0603a, cabbage: 0x9fd45f,
    radish: 0xeef4f8
  };
  var SEEDS = Object.keys(SEED_COLOR);

  /* ======================= 基础材质与几何 ======================= */

  /* 卡通阶梯色阶：场景用对比稍强，图标离屏渲染用更平的色阶（避免暗面糊成一团、亮面过曝） */
  var toonMats = [];
  var RAMP = { scene: null, icon: null };

  function makeRamp(steps) {
    var data = new Uint8Array(steps.length * 4);
    for (var i = 0; i < steps.length; i++) {
      data[i * 4] = steps[i]; data[i * 4 + 1] = steps[i]; data[i * 4 + 2] = steps[i]; data[i * 4 + 3] = 255;
    }
    var tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  function gradientMap() {
    if (!RAMP.scene) {
      RAMP.scene = makeRamp([90, 175, 255]);   // 第四轮：三档明暗（卡通配方）
      RAMP.icon = makeRamp([170, 208, 238, 255]);
    }
    return RAMP.scene;
  }

  function toon(color) {
    var key = 't' + color;
    if (matCache[key]) return matCache[key];
    var m = new THREE.MeshToonMaterial({ color: color });
    m.gradientMap = gradientMap();
    matCache[key] = m;
    toonMats.push(m);
    return m;
  }

  /** 切换所有卡通材质的色阶：'scene'（场景）/ 'icon'（离屏图标，更平更亮） */
  M.setShading = function (mode) {
    gradientMap();
    var t = mode === 'icon' ? RAMP.icon : RAMP.scene;
    for (var i = 0; i < toonMats.length; i++) {
      if (toonMats[i].gradientMap !== t) {
        toonMats[i].gradientMap = t;
        toonMats[i].needsUpdate = true;
      }
    }
  };

  function ink(color) {
    var key = 'k' + color;
    if (matCache[key]) return matCache[key];
    matCache[key] = new THREE.MeshBasicMaterial({ color: color });
    return matCache[key];
  }

  function soft(color, opacity) {
    var key = 's' + color + '_' + opacity;
    if (matCache[key]) return matCache[key];
    matCache[key] = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity });
    return matCache[key];
  }

  function sph(r, seg) { return new THREE.SphereGeometry(r, seg || 18, Math.max(6, Math.round((seg || 18) * 0.72))); }
  function cyl(rt, rb, h, seg) { return new THREE.CylinderGeometry(rt, rb, h, seg || 12); }
  function con(r, h, seg) { return new THREE.ConeGeometry(r, h, seg || 10); }
  function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  function torus(r, tube, arc) { return new THREE.TorusGeometry(r, tube, 8, 20, arc || Math.PI * 2); }
  /** 剪影挤出：2D 轮廓 → 有真实厚度的 3D 部件（矿石镇图标风格，剪影第一眼可辨） */
  function extrudeGeo(shape, depth, bev) {
    return new THREE.ExtrudeGeometry(shape, {
      depth: depth || 0.08, curveSegments: 18,
      bevelEnabled: true, bevelThickness: bev || 0.012, bevelSize: bev || 0.012, bevelSegments: 1
    });
  }
  /** 弯月/弧刃轮廓：两端收尖、中段最厚 */
  function arcBladeShape(R, thick, a0, a1, n) {
    var sh = new THREE.Shape();
    var i, u, t, w;
    for (i = 0; i <= n; i++) {
      u = i / n; t = a0 + (a1 - a0) * u;
      w = thick * Math.pow(Math.sin(Math.PI * u), 0.55);
      if (i === 0) sh.moveTo(Math.cos(t) * (R + w / 2), Math.sin(t) * (R + w / 2));
      else sh.lineTo(Math.cos(t) * (R + w / 2), Math.sin(t) * (R + w / 2));
    }
    for (i = n; i >= 0; i--) {
      u = i / n; t = a0 + (a1 - a0) * u;
      w = thick * Math.pow(Math.sin(Math.PI * u), 0.55);
      sh.lineTo(Math.cos(t) * (R - w / 2), Math.sin(t) * (R - w / 2));
    }
    return sh;
  }

  /** 统一挂件：pos/scale/rot 都是数组或 null */
  function part(parent, geo, mat, pos, scale, rot) {
    var m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    return m;
  }

  /** 卡通描边：背面放大的同几何外壳 */
  function outline(m, s, color) {
    var out = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({
      color: color === undefined ? 0x54402f : color, side: THREE.BackSide
    }));
    out.scale.setScalar(s || 1.055);
    m.add(out);
    return out;
  }

  /** 大眼睛：参考图那种又大又圆的黑色亮眼（黑瞳 + 双高光点，玻璃质感）。
   *  返回的每个元素是 Group（眨眼缩放其 scale.y） */
  function makeEyes(head, r, dx, dy, dz, opt) {
    opt = opt || {};
    var out = [];
    for (var s = -1; s <= 1; s += 2) {
      var g = new THREE.Group();
      g.position.set(dx * s, dy, dz);
      g.rotation.y = s * (opt.rotY === undefined ? 0.18 : opt.rotY);
      head.add(g);
      if (opt.iris !== undefined) {
        // 彩色虹膜 + 黑瞳孔（原来 pupil 颜色会涂满整个眼球：绿眼变实心绿球）
        part(g, sph(r, 16), ink(opt.iris), [0, 0, 0], [1, 1.06, 0.9]);
        part(g, sph(r * 0.62, 14), ink(0x241f1c), [0, 0, r * 0.42], [1, 1.06, 1]);
        part(g, sph(r * 0.22, 10), ink(0xffffff), [-r * 0.22, r * 0.3, r * 0.78]);
        part(g, sph(r * 0.11, 8), ink(0xf6fbff), [r * 0.26, -r * 0.24, r * 0.82]);
      } else {
        part(g, sph(r, 16), ink(opt.pupil === undefined ? 0x241f1c : opt.pupil), [0, 0, 0], [1, 1.06, 1]);
        part(g, sph(r * 0.36, 10), ink(0xffffff), [-r * 0.28, r * 0.34, r * 0.7]);
        part(g, sph(r * 0.17, 8), ink(0xf6fbff), [r * 0.34, -r * 0.3, r * 0.74]);
      }
      out.push(g);
    }
    return out;
  }

  function blush(parent, r, x, y, z, color) {
    for (var s = -1; s <= 1; s += 2) {
      part(parent, sph(r, 10), soft(color === undefined ? 0xf79aa8 : color, 0.72), [x * s, y, z], [1.15, 0.8, 0.55]);
    }
  }

  function newRig(g, type) {
    return {
      group: g, type: type, parts: {},
      bob: Math.random() * 6,
      blinkTimer: 0.4 + Math.random() * 2.4,
      blinkPhase: 0
    };
  }

  /** 腿：以髋关节为原点建 Group，走路动画绕髋关节摆动 */
  function mkLeg(parent, x, y, z, len, r, mat, opt) {
    opt = opt || {};
    var hip = new THREE.Group();
    hip.position.set(x, y, z);
    parent.add(hip);
    part(hip, cyl(r * (opt.taper === undefined ? 0.86 : opt.taper), r, len, 8), mat, [0, -len / 2, 0]);
    if (opt.hoof) part(hip, cyl(r * 1.02, r * 1.06, opt.hoofH || 0.11, 8), opt.hoof, [0, -len - (opt.hoofH || 0.11) / 2 + 0.03, 0]);
    if (opt.foot) part(hip, box(opt.foot[0], opt.foot[1], opt.foot[2]), opt.footMat || mat, [0, -len - opt.foot[1] / 2 + 0.02, opt.foot[2] * 0.15]);
    return hip;
  }

  /* ======================= 物种：头部（萌版 3D · 对齐参考图） ======================= */

  /** 白色系判定：白鸡 / 鸭 / 奶牛 / 绵羊 / 兔 / 羊驼等近白部件需要更醒目的描边 */
  function isNearWhite(col) {
    if (!col) return false;
    return Math.min(col.r, col.g, col.b) >= 0.78;
  }

  /** 柔和描边：取本体色压暗后的颜色，贴合参考图「不抢戏的柔和轮廓」。
   *  白色系部件自动「加粗 + 加深」：白身白底不再糊成一片。 */
  function outlineOf(mesh, s, factor) {
    var base = (mesh && mesh.material && mesh.material.color) ? mesh.material.color : null;
    var sc = s === undefined ? 1.05 : s;
    var fac = factor === undefined ? 0.56 : factor;
    if (isNearWhite(base)) {
      fac = Math.min(fac, 0.52);   // 更深：灰褐描边，白毛轮廓一眼可辨
      sc = sc + 0.035;             // 更粗：壳体放大量再加码
    }
    var col = base ? new THREE.Color(base).multiplyScalar(fac).getHex() : 0x54402f;
    return outline(mesh, sc, col);
  }

  /** 圆润绒毛团：固定分布，保证每次渲染完全一致 */
  function puffs(parent, layout, color, edge) {
    layout.forEach(function (p) {
      var m = part(parent, sph(p[3], 16), toon(color), [p[0], p[1], p[2]]);
      outlineOf(m, 1.045, edge === undefined ? 0.9 : edge);
    });
  }

  /** 腿：短小圆润 + 圆脚掌（球体压扁，无棱角）；Group 原点在髋关节，便于走路摆动 */
  function limb(parent, x, y, z, len, r, mat, opt) {
    opt = opt || {};
    var hip = new THREE.Group();
    hip.position.set(x, y, z);
    parent.add(hip);
    var shank = part(hip, cyl(r * 0.92, r, len, 12), mat, [0, -len / 2, 0]);
    outlineOf(shank, 1.06, 0.62);
    var fr = r * (opt.footR || 1.32);
    var foot = part(hip, sph(fr, 12), opt.footMat || mat,
      [0, -len - fr * 0.12, opt.footZ || 0], [1, 0.84, 1.12]);
    outlineOf(foot, 1.05, 0.62);
    return hip;
  }

  /** 四条短腿：脚底统一落在 y=0，保证 9 种动物站在同一条地平线上 */
  function fourLegs(parent, len, r, color, opt) {
    opt = opt || {};
    var fr = r * (opt.footR || 1.32);
    var topY = len + fr * 0.96;
    var footMat = opt.footColor === undefined ? null : toon(opt.footColor);
    var out = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (q) {
      out.push(limb(parent, opt.x * q[0], topY, opt.z * q[1], len, r, toon(color),
        { footMat: footMat, footR: opt.footR }));
    });
    return out;
  }

  /** 禽类腿：细杆 + 圆脚掌 + 三趾，脚底同样落在 y=0 */
  function birdLeg(parent, x, len, r, color) {
    var hip = new THREE.Group();
    hip.position.set(x, len + r * 1.25, 0);
    parent.add(hip);
    var mat = toon(color);
    var shank = part(hip, cyl(r * 0.82, r, len, 8), mat, [0, -len / 2, 0]);
    outlineOf(shank, 1.08, 0.62);
    var foot = part(hip, sph(r * 1.5, 10), mat, [0, -len, 0.02], [1, 0.6, 1.5]);
    outlineOf(foot, 1.05, 0.62);
    for (var i = -1; i <= 1; i++) {
      part(hip, sph(r * 0.7, 8), mat, [i * r * 1.15, -len - r * 0.12, r * 1.9], [1, 0.68, 1.5]);
    }
    return hip;
  }

  /** 禽类翅膀（鸡 / 鸭）：幼年短而圆、只贴在体侧上方；成年更长更薄，
   *  三段递减圆瓣沿体侧向后铺开，末端拉到体后 → 视觉上「包住身体两侧」。
   *  opt = { r: 躯干半径, y: 躯干中心高度, z: 躯干中心前后位, color: 翅膀色 } */
  function birdWings(g, opt) {
    var R = opt.r, baby = isBaby(), out = [];
    for (var e = -1; e <= 1; e += 2) {
      var pivot = new THREE.Group();
      pivot.position.set(R * (baby ? 0.95 : 0.88) * e, opt.y, opt.z);
      pivot.rotation.set(0, e * 0.1, e * -0.14);
      g.add(pivot);
      if (baby) {
        // 短而圆：一枚圆瓣贴在体侧上方，长度只有躯干的一小半
        var bw = part(pivot, sph(R * 0.42, 16), toon(opt.color), [0, 0.1, 0.06], [0.58, 0.68, 0.72]);
        outlineOf(bw, 1.06, 0.9);
      } else {
        var lobes = [
          [R * 0.50, 0.00, -0.02, 0.42, 1.02, 1.35],
          [R * 0.44, -0.03, -R * 0.62, 0.40, 0.92, 1.16],
          [R * 0.33, -0.05, -R * 1.16, 0.36, 0.78, 1.00]
        ];
        for (var i = 0; i < lobes.length; i++) {
          var L = lobes[i];
          var wl = part(pivot, sph(L[0], 16), toon(opt.color), [0, L[1], L[2]], [L[3], L[4], L[5]]);
          outlineOf(wl, 1.06, 0.9);
        }
      }
      out.push(pivot);
    }
    return out;
  }

  /** 挂头：统一「头大身小」的挂载方式，保证 9 种动物构图与视角一致。
   *  成年：头部统一缩小（更成熟）；幼年：此处不缩，由 applyBaby 再放大 → 两年龄差异更明显。 */
  function attachHead(g, rig, fn, x, y, z) {
    var head = new THREE.Group();
    head.position.set(x, y, z);
    g.add(head);
    fn(head, rig);
    if (!isBaby()) {
      head.scale.setScalar(1.02);
      head.position.y -= 0.07;   // 缩小后轻微下沉，保持与脖子 / 躯干衔接不漏缝
    }
    rig.parts.head = head;
    return head;
  }

  function headChicken(head, rig) {
    var R = 0.46;
    var skull = part(head, sph(R, 22), toon(0xfffbf2), [0, 0.03, 0], [1, 1.02, 1.04]);
    outlineOf(skull, 1.05);
    // 鸡冠：三枚饱满红冠瓣，颜色加深（图标色阶会提亮，浅红会洗成粉）
    var comb = toon(0xd42a1e);
    part(head, sph(0.15, 12), comb, [0, R * 0.96, 0.16], [0.9, 1.25, 1.3]);
    part(head, sph(0.19, 14), comb, [0, R * 1.08, -0.01], [0.9, 1.3, 1.35]);
    part(head, sph(0.14, 12), comb, [0, R * 0.94, -0.18], [0.9, 1.15, 1.25]);
    // 喙：橘黄大圆喙（圆锥加粗，顶端收圆）
    var beak = part(head, cyl(0.02, 0.14, 0.3, 10), toon(0xf59a1a), [0, -0.06, R * 0.88], [1, 1, 0.9], [Math.PI / 2, 0, 0]);
    outlineOf(beak, 1.09, 0.58);
    // 肉垂：两枚红垂
    part(head, sph(0.1, 10), comb, [-0.07, -0.26, R * 0.6], [0.85, 1.15, 0.85]);
    part(head, sph(0.1, 10), comb, [0.07, -0.26, R * 0.6], [0.85, 1.15, 0.85]);
    rig.parts.eyes = makeEyes(head, 0.135, 0.185, 0.05, R * 0.8, { rotY: 0.16 });
    blush(head, 0.07, 0.26, -0.1, 0.29);
  }
  function headDuck(head, rig) {
    var R = 0.46;
    var skull = part(head, sph(R, 22), toon(0xfff8e6), [0, 0.02, 0], [1, 1.0, 1.06]);
    outlineOf(skull, 1.05, 0.9);
    part(head, sph(0.13, 12), toon(0xfff8e6), [0, R * 0.9, -0.12], [1.25, 0.75, 1.1]);
    // 扁嘴：宽扁橘嘴（上片宽亮、下片深橘，只比颅面高出一点）
    var bill = part(head, sph(0.17, 14), toon(0xe87f14), [0, -0.15, R * 0.86], [1.6, 0.36, 1.1]);
    outlineOf(bill, 1.06, 0.6);
    part(head, sph(0.09, 10), toon(0xf5a623), [0, -0.11, R * 1.14], [1.3, 0.38, 0.7]);
    part(head, sph(0.11, 10), toon(0xe87f14), [0, -0.2, R * 0.92], [1.35, 0.3, 0.9]);
    rig.parts.eyes = makeEyes(head, 0.135, 0.185, 0.1, R * 0.8, { rotY: 0.16 });
    blush(head, 0.07, 0.25, -0.06, 0.3);
  }
  function headCow(head, rig) {
    var R = 0.64;
    var skull = part(head, sph(R, 24), toon(0xfffcf7), [0, 0, 0], [1, 0.97, 1.06]);
    outlineOf(skull, 1.04);
    var PATCH = 0x221e24;  // 真黑斑（图标色阶提亮，0x39353f 会洗成灰）
    // 眼周黑斑：眼睛就长在黑斑上（斑块只比颅面高出约 0.05，不再是浮起的圆盘）
    part(head, sph(0.21, 14), toon(PATCH), [-0.29, 0.14, 0.52], [1, 1.2, 0.5]);
    part(head, sph(0.21, 14), toon(PATCH), [0.29, 0.14, 0.52], [1, 1.2, 0.5]);
    // 额顶与侧面黑斑
    part(head, sph(0.24, 14), toon(PATCH), [-0.2, 0.44, 0.38], [1.05, 0.6, 0.5]);
    part(head, sph(0.2, 14), toon(PATCH), [-0.56, -0.08, 0.28], [0.45, 0.9, 0.9]);
    part(head, sph(0.18, 14), toon(PATCH), [0.54, -0.14, 0.3], [0.45, 0.85, 0.9]);
    // 牛角：三球拼成的短粗弯角（黏土风，细锥 + 圆头会被读成天线）
    for (var s = -1; s <= 1; s += 2) {
      var hc = toon(0xf7ead2);
      outlineOf(part(head, sph(0.11, 12), hc, [0.32 * s, 0.58, 0.0]), 1.1, 0.72);
      outlineOf(part(head, sph(0.085, 10), hc, [0.42 * s, 0.66, 0.0]), 1.1, 0.72);
      outlineOf(part(head, sph(0.06, 10), hc, [0.5 * s, 0.72, 0.0]), 1.1, 0.72);
    }
    // 耳：深灰外耳 + 粉色内耳
    for (var e = -1; e <= 1; e += 2) {
      var ear = part(head, sph(0.22, 12), toon(0x2a272e),
        [0.64 * e, 0.02, -0.06], [0.5, 0.62, 1.1], [0, e * -0.5, e * 0.28]);
      outlineOf(ear, 1.06, 0.72);
      part(head, sph(0.12, 10), toon(0xf2a0b0),
        [0.62 * e, 0.02, 0.02], [0.5, 0.6, 0.5], [0, e * -0.5, e * 0.28]);
    }
    // 口鼻：大粉鼻
    var muz = part(head, sph(0.34, 18), toon(0xf2a0b0), [0, -0.34, 0.46], [1.05, 0.72, 0.78]);
    outlineOf(muz, 1.05, 0.82);
    for (var n = -1; n <= 1; n += 2) part(head, sph(0.055, 8), toon(0xc96a7e), [0.13 * n, -0.35, 0.68], [1, 0.8, 0.5]);
    rig.parts.eyes = makeEyes(head, 0.16, 0.3, 0.14, R * 0.82, { rotY: 0.2 });
    blush(head, 0.11, 0.5, -0.16, 0.3, 0xf5a0ad);
  }
  function headSheep(head, rig) {
    var R = 0.47;
    // 羊毛外圈（先铺，脸压在前面）
    puffs(head, [
      [0, 0.36, -0.14, 0.27], [0.32, 0.26, -0.2, 0.25], [-0.32, 0.26, -0.2, 0.25],
      [0.42, 0.02, -0.24, 0.24], [-0.42, 0.02, -0.24, 0.24], [0, 0.44, 0.06, 0.22],
      [0.18, 0.44, -0.18, 0.2], [-0.18, 0.44, -0.18, 0.2]
    ], 0xfffdf6, 0.92);
    var face = part(head, sph(R, 20), toon(0xf3d9bd), [0, -0.03, 0.12], [0.88, 0.9, 0.9]);
    outlineOf(face, 1.045, 0.74);
    // 正面上沿绒毛：拉开与纯白头部的区别，缩略图也能一眼读出「绵羊」
    puffs(head, [
      [0, 0.46, 0.2, 0.18], [0.27, 0.4, 0.16, 0.17], [-0.27, 0.4, 0.16, 0.17],
      [0.46, 0.24, 0.06, 0.16], [-0.46, 0.24, 0.06, 0.16]
    ], 0xfffdf6, 0.92);
    // 口鼻（清晰可辨）
    var muz = part(head, sph(0.21, 14), toon(0xf7cdd6), [0, -0.25, 0.44], [1, 0.66, 0.72]);
    outlineOf(muz, 1.05, 0.8);
    for (var nz = -1; nz <= 1; nz += 2) part(head, sph(0.042, 8), toon(0xcb8494), [0.08 * nz, -0.26, 0.58], [1, 0.8, 0.5]);
    // 耷拉耳
    for (var e = -1; e <= 1; e += 2) {
      var ear = part(head, sph(0.19, 12), toon(0xf2dccc),
        [0.47 * e, 0.0, -0.02], [1.22, 0.44, 0.72], [0, e * -0.3, e * -0.78]);
      outlineOf(ear, 1.06, 0.76);
    }
    // 羊角：一对向外、向后卷曲的圆润弯角（成年更长更粗，幼年短小）——绵羊专属特征
    var bigHorn = !isBaby();
    var hornColor = toon(0xd9c39a);
    for (var hn = -1; hn <= 1; hn += 2) {
      var horn = part(head, torus(bigHorn ? 0.26 : 0.155, bigHorn ? 0.078 : 0.05, Math.PI * 1.5),
        hornColor, [0.35 * hn, bigHorn ? 0.5 : 0.4, -0.02], null,
        [0.5, hn * 0.5, hn * -1.2]);
      outlineOf(horn, 1.12, 0.66);
      var hornTip = part(head, sph(bigHorn ? 0.075 : 0.05, 10), toon(0xe6d5b0),
        [0.46 * hn, bigHorn ? 0.6 : 0.46, 0.1], [1, 1, 1]);
      outlineOf(hornTip, 1.14, 0.66);
    }
    rig.parts.eyes = makeEyes(head, 0.14, 0.2, 0.055, 0.4, { rotY: 0.18 });
    blush(head, 0.08, 0.3, -0.16, 0.32, 0xf0a8b4);
  }
  function headRabbit(head, rig) {
    var R = 0.46;
    var skull = part(head, sph(R, 22), toon(0xfffdfa), [0, 0, 0], [1, 1.02, 1.04]);
    outlineOf(skull, 1.05, 0.92);
    // 额顶绒毛：三团小毛球（安哥拉兔毛茸茸）
    [[-0.16, 0.42, 0.1, 0.12], [0, 0.46, 0.12, 0.13], [0.16, 0.42, 0.1, 0.12]].forEach(function (p) {
      outlineOf(part(head, sph(p[3], 10), toon(0xfffdfa), [p[0], p[1], p[2]]), 1.05, 0.9);
    });
    var muz = part(head, sph(0.18, 14), toon(0xffecf2), [0, -0.2, 0.34], [1.12, 0.7, 0.8]);
    outlineOf(muz, 1.05, 0.86);
    // 长直耳：更长更直（外张角 0.54→0.38），粉色内耳更大
    var earLen = isBaby() ? 2.1 : 2.85;
    for (var e = -1; e <= 1; e += 2) {
      var ear = new THREE.Group();
      ear.position.set(0.24 * e, 0.28, -0.02);
      ear.rotation.set(-0.08, -e * 0.14, -e * (isBaby() ? 0.5 : 0.38));
      head.add(ear);
      var pad = part(ear, sph(0.135, 14), toon(0xfffdfa), [0, 0.3, 0], [1, earLen, 0.6]);
      outlineOf(pad, 1.06, 0.9);
      part(ear, sph(0.075, 10), soft(0xf8bccb, 0.95), [0, 0.3, 0.048], [1, earLen * 0.9, 0.48]);
    }
    var nose = part(head, sph(0.065, 10), toon(0xf79bb0), [0, -0.09, 0.4], [1, 0.8, 0.62]);
    outlineOf(nose, 1.08, 0.86);
    rig.parts.eyes = makeEyes(head, 0.14, 0.2, 0.05, 0.355, { rotY: 0.16 });
    blush(head, 0.08, 0.29, -0.14, 0.29);
  }
  function headHorse(head, rig) {
    var R = 0.5;
    var skull = part(head, sph(R, 22), toon(0xa86a32), [0, 0, 0], [0.86, 1.0, 1.24]);
    outlineOf(skull, 1.045, 0.5);
    // 额头白斑
    part(head, sph(0.12, 12), toon(0xf7eee2), [0, 0.16, 0.4], [0.7, 1.1, 0.5]);
    // 长口鼻
    var muz = part(head, sph(0.31, 16), toon(0xe8c39a), [0, -0.28, 0.5], [1, 0.7, 1.0]);
    outlineOf(muz, 1.05, 0.68);
    for (var n = -1; n <= 1; n += 2) part(head, sph(0.06, 8), toon(0x8f5f3a), [0.13 * n, -0.3, 0.74], [1, 0.86, 0.5]);
    part(head, cyl(0.016, 0.016, 0.16, 6), toon(0x8f5f3a), [0, -0.44, 0.62], null, [0, 0, Math.PI / 2]);
    // 长耳：短粗锥形耳（原来细长圆柱像两根天线），棕色 + 粉色内耳，向外张开
    for (var e = -1; e <= 1; e += 2) {
      var earPivot = new THREE.Group();
      earPivot.position.set(0.26 * e, 0.36, -0.06);
      earPivot.rotation.set(-0.14, 0, -e * 0.42);
      head.add(earPivot);
      var hear = part(earPivot, con(0.13, 0.38, 12), toon(0x8a5a30), [0, 0.19, 0]);
      outlineOf(hear, 1.07, 0.5);
      part(earPivot, sph(0.06, 10), soft(0xe8b7a4, 0.9), [0, 0.18, 0.05], [1, 2.2, 0.5]);
    }
    // 鬃毛：额前刘海 + 两侧垂鬃（框住脸，确认稿特征）
    part(head, sph(0.19, 12), toon(0x4a2e18), [0, 0.42, -0.08], [0.85, 0.7, 1.45]);
    part(head, sph(0.17, 12), toon(0x4a2e18), [0, 0.32, -0.42], [0.85, 0.68, 1.35]);
    part(head, sph(0.16, 12), toon(0x4a2e18), [-0.4, 0.1, -0.12], [0.5, 1.2, 0.8]);
    part(head, sph(0.16, 12), toon(0x4a2e18), [0.4, 0.1, -0.12], [0.5, 1.2, 0.8]);
    part(head, sph(0.16, 12), toon(0x4a2e18), [0, 0.47, 0.18], [1.7, 0.55, 0.5]);
    rig.parts.eyes = makeEyes(head, 0.185, 0.24, 0.1, 0.4, { rotY: 0.22, iris: 0x5a3418 });
    blush(head, 0.13, 0.35, -0.17, 0.3, 0xf2a0a8);
    // 胖脸颊：两团浅色圆颊，配大眼 + 腮红更萌
    part(head, sph(0.19, 12), toon(0xe8c39a), [-0.34, -0.12, 0.32], [1, 0.9, 0.6]);
    part(head, sph(0.19, 12), toon(0xe8c39a), [0.34, -0.12, 0.32], [1, 0.9, 0.6]);
  }
  function headDog(head, rig) {
    var R = 0.48;
    var skull = part(head, sph(R, 22), toon(0xeeb95e), [0, 0, 0], [1, 1, 1.08]);
    outlineOf(skull, 1.05, 0.58);
    // 眼周深色斑，与奶牛/马区分
    part(head, sph(0.2, 12), toon(0xdcab52), [0.34, 0.08, 0.24], [0.72, 0.92, 0.55]);
    // 口鼻：成年吻部向前突出（比幼年明显更长），幼年保持短圆
    var snout = isBaby() ? 0 : 0.14;
    var muz = part(head, sph(0.24, 14), toon(0xfff4e2),
      [0, -0.18 + snout * 0.12, 0.4 + snout], [1 - snout * 0.22, 0.74, 0.92 + snout * 0.7]);
    outlineOf(muz, 1.05, 0.88);
    if (!isBaby()) {
      var jaw = part(head, sph(0.15, 12), toon(0xf7e2c8), [0, -0.27, 0.5], [0.9, 0.6, 1.12]);
      outlineOf(jaw, 1.05, 0.86);
      // 舌头：确认稿里张嘴笑的粉舌头
      part(head, sph(0.09, 10), toon(0xef8a9a), [0, -0.36, 0.52], [1, 0.55, 0.6]);
    }
    part(head, sph(0.085, 10), ink(0x3a2f2a), [0, -0.05, 0.58 + snout * 1.3], [1.15, 0.8, 0.6]);
    // 耷拉耳：垂在脸颊两侧（原来横贴在头顶两侧，正面看不见）
    for (var e = -1; e <= 1; e += 2) {
      var ear = part(head, sph(0.21, 12), toon(0xb87a2e),
        [0.44 * e, -0.06, -0.02], [0.55, 1.35, 0.7], [0, 0, e * 0.22]);
      outlineOf(ear, 1.06, 0.58);
    }
    rig.parts.eyes = makeEyes(head, 0.175, 0.2, 0.06, 0.36, { rotY: 0.16, iris: 0x5a3418 });
    blush(head, 0.12, 0.28, -0.14, 0.3, 0xf2a8a8);
    // 胖脸颊：两团浅色圆颊，配大眼 + 腮红更萌
    part(head, sph(0.17, 12), toon(0xfff4e2), [-0.32, -0.1, 0.3], [1, 0.9, 0.6]);
    part(head, sph(0.17, 12), toon(0xfff4e2), [0.32, -0.1, 0.3], [1, 0.9, 0.6]);
  }
  function headCat(head, rig) {
    var R = 0.48;
    // 三花猫：白底 + 橘斑 + 黑斑（与确认稿 sheet2 / sheet4 v6 一致，不再是深灰猫）
    var skull = part(head, sph(R, 22), toon(0xfffaf2), [0, 0, 0], [1, 1, 1.02]);
    outlineOf(skull, 1.05, 0.92);
    // 三花斑：贴合颅面、只露一小帽（原来整块圆盘浮在额头上，又大又黄）
    part(head, sph(0.19, 14), toon(0xd96f1e), [0.16, 0.4, 0.2], [1.1, 0.55, 0.4]);
    part(head, sph(0.19, 14), toon(0x221e24), [-0.42, 0.12, 0.16], [0.4, 0.95, 0.9]);
    part(head, sph(0.12, 12), toon(0xd96f1e), [0.4, -0.06, 0.26], [0.5, 0.9, 0.4]);
    // 圆润三角耳 + 粉色内耳（耳更大）
    for (var e = -1; e <= 1; e += 2) {
      var ear = part(head, cyl(0.05, 0.17, 0.34, 12), toon(0xfffaf2),
        [0.27 * e, 0.46, -0.02], [1, 1, 0.72], [0, 0, e * -0.26]);
      outlineOf(ear, 1.07, 0.92);
      part(head, sph(0.085, 10), soft(0xf5a8bb, 0.9), [0.27 * e, 0.44, 0.06], [1, 1.15, 0.5], [0, 0, e * -0.26]);
    }
    // 浅色口鼻区
    var muz = part(head, sph(0.19, 12), toon(0xfff2e2), [0, -0.2, 0.34], [1.15, 0.72, 0.8]);
    outlineOf(muz, 1.05, 0.86);
    var nose = part(head, sph(0.06, 10), toon(0xf294a8), [0, -0.13, 0.45], [1.2, 0.78, 0.6]);
    outlineOf(nose, 1.08, 0.86);
    // 胡须：细软浅色，不破坏整体圆润
    for (var s = -1; s <= 1; s += 2) {
      for (var i = -1; i <= 1; i++) {
        part(head, cyl(0.008, 0.008, 0.3, 5), ink(0xf4f0e8),
          [0.4 * s, -0.16 + i * 0.08, 0.28], null, [0, s * 0.5, Math.PI / 2 + i * 0.18]);
      }
    }
    // 绿眼睛：绿虹膜 + 黑瞳孔（原来整个眼球是实心绿球）
    rig.parts.eyes = makeEyes(head, 0.15, 0.215, 0.06, 0.36, { rotY: 0.16, iris: 0x2e8b3a });
    blush(head, 0.08, 0.31, -0.13, 0.3, 0xf09aa8);
  }
  function headLlama(head, rig) {
    var R = 0.47;
    var skull = part(head, sph(R, 22), toon(0xfffefa), [0, 0.02, 0], [1, 1.0, 1.12]);
    outlineOf(skull, 1.05, 0.92);
    puffs(head, [
      [0, 0.36, -0.06, 0.2], [0.24, 0.28, -0.14, 0.18], [-0.24, 0.28, -0.14, 0.18],
      [0.37, 0.06, -0.16, 0.18], [-0.37, 0.06, -0.16, 0.18],
      [0.3, -0.2, -0.2, 0.16], [-0.3, -0.2, -0.2, 0.16]
    ], 0xfffefa, 0.92);
    // 短圆耳（圆头香蕉形），更长一点
    for (var e = -1; e <= 1; e += 2) {
      var ear = part(head, sph(0.1, 12), toon(0xfffefa),
        [0.23 * e, 0.48, -0.04], [1, 2.0, 0.68], [0, 0, e * -0.3]);
      outlineOf(ear, 1.06, 0.92);
      part(ear, sph(0.055, 8), soft(0xf8c4ce, 0.85), [0, 0.03, 0.045], [1, 1.5, 0.5], [0, 0, e * -0.3]);
    }
    // 浅灰口鼻
    var muz = part(head, sph(0.19, 12), toon(0xefe4d8), [0, -0.24, 0.4], [1, 0.7, 0.85]);
    outlineOf(muz, 1.05, 0.84);
    part(head, sph(0.055, 8), toon(0xd8b8c0), [0, -0.2, 0.5], [1.2, 0.7, 0.6]);
    // 刘海：五绺直刘海盖住额头（原来三绺太窄）
    [[-0.26, 0.42, 0.3], [-0.13, 0.46, 0.32], [0, 0.48, 0.32], [0.13, 0.46, 0.32], [0.26, 0.42, 0.3]].forEach(function (p) {
      outlineOf(part(head, sph(0.095, 10), toon(0xfffefa), [p[0], p[1], p[2]], [1, 1.5, 0.55]), 1.06, 0.92);
    });
    rig.parts.eyes = makeEyes(head, 0.14, 0.2, 0.06, 0.38, { rotY: 0.16 });
    blush(head, 0.08, 0.3, -0.15, 0.3, 0xf2b0b8);
  }

  var HEADS = {
    chicken: headChicken, cow: headCow, sheep: headSheep, anjela: headRabbit,
    horse: headHorse, dog: headDog, duck: headDuck, cat: headCat, llama: headLlama
  };

  /* ======================= 物种：整只（短圆四肢 + 头大身小） ======================= */

  function animalChicken() {
    var g = new THREE.Group();
    var rig = newRig(g, 'chicken');
    rig.parts.legs = [birdLeg(g, -0.16, 0.2, 0.055, 0xf59a1a), birdLeg(g, 0.16, 0.2, 0.055, 0xf59a1a)];
    var body = part(g, sph(0.5, 22), toon(0xfffbf2), [0, 0.7, -0.02], [1.0, 1.0, 1.05]);
    outlineOf(body, 1.04);
    rig.parts.body = body;
    // 翅膀：确认稿是橘色翅膀（原来近白色，糊在白身上）
    rig.parts.wings = birdWings(g, { r: 0.5, y: 0.72, z: -0.04, color: 0xf2a65a });
    // 尾羽：两枚圆润上翘
    outlineOf(part(g, sph(0.2, 12), toon(0xffe9cc), [0, 0.96, -0.42], [0.8, 1.15, 0.9], [-0.7, 0, 0]), 1.05);
    rig.parts.tail = part(g, sph(0.17, 12), toon(0xffe9cc), [0, 1.12, -0.52], [0.72, 0.9, 0.8], [-0.9, 0, 0]);
    outlineOf(rig.parts.tail, 1.05);
    attachHead(g, rig, headChicken, 0, 1.14, 0.08);
    return rig;
  }
  function animalDuck() {
    var g = new THREE.Group();
    var rig = newRig(g, 'duck');
    rig.parts.legs = [birdLeg(g, -0.17, 0.16, 0.06, 0xf59a1a), birdLeg(g, 0.17, 0.16, 0.06, 0xf59a1a)];
    var body = part(g, sph(0.54, 22), toon(0xfff8e6), [0, 0.64, -0.02], [1.02, 0.96, 1.1]);
    outlineOf(body, 1.04, 0.92);
    rig.parts.body = body;
    // 翅膀：幼年短圆贴体，成年沿体侧向后包住躯干
    rig.parts.wings = birdWings(g, { r: 0.54, y: 0.66, z: -0.04, color: 0xfff2da });
    rig.parts.tail = part(g, sph(0.22, 12), toon(0xffeed2), [0, 0.84, -0.5], [0.85, 0.9, 0.95], [-0.55, 0, 0]);
    outlineOf(rig.parts.tail, 1.05);
    attachHead(g, rig, headDuck, 0, 1.06, 0.12);
    return rig;
  }
  function animalCow() {
    var g = new THREE.Group();
    var rig = newRig(g, 'cow');
    // 四脚站立：腿加长加粗，身体离地（原来腿短、身体贴地像个白球）
    rig.parts.legs = fourLegs(g, 0.55, 0.15, 0xfffcf7, { x: 0.38, z: 0.5, footColor: 0x4a4657 });
    // 躯干：横向拉长的圆桶身（不再是圆球），头颈前伸、与身体分出剪影
    var body = part(g, sph(0.82, 24), toon(0xfffcf7), [0, 1.18, 0], [0.92, 0.88, 1.32]);
    outlineOf(body, 1.035);
    rig.parts.body = body;
    // 黑斑：贴合体表的圆润块（避开头部），真黑（0x221e24，浅灰会被色阶洗掉）
    [[0.42, 1.42, 0.42, 0.36], [-0.46, 1.24, -0.32, 0.32], [0.24, 1.62, -0.52, 0.28],
     [-0.22, 1.0, 0.66, 0.26], [0.12, 1.64, 0.5, 0.22], [-0.5, 1.5, 0.3, 0.2]].forEach(function (p) {
      part(g, sph(p[3], 14), toon(0x221e24), [p[0], p[1], p[2]], [1, 0.8, 1]);
    });
    // 短脖
    part(g, cyl(0.32, 0.42, 0.46, 14), toon(0xfffcf7), [0, 1.56, 0.52], null, [0.45, 0, 0]);
    // 棕色项圈 + 金色铃铛（确认稿特征，铃铛加大）
    var collar = part(g, torus(0.34, 0.06, Math.PI * 2), toon(0x8d5a2b), [0, 1.6, 0.6], null, [0.5, 0, 0]);
    outlineOf(collar, 1.1, 0.6);
    part(g, sph(0.14, 12), toon(0xf0c04a), [0, 1.44, 0.86], [1, 1, 1]);
    part(g, sph(0.05, 8), toon(0x8d5a2b), [0, 1.34, 0.9], [1, 0.6, 0.6]);
    // 乳房
    part(g, sph(0.24, 14), toon(0xf9bcc8), [0, 0.72, -0.3], [1.1, 0.72, 0.9]);
    var tail = new THREE.Group();
    tail.position.set(0, 1.55, -1.05);
    g.add(tail);
    part(tail, cyl(0.035, 0.05, 0.55, 8), toon(0xfffcf7), [0, -0.26, 0]);
    part(tail, sph(0.13, 12), toon(0x221e24), [0, -0.56, 0.03]);
    rig.parts.tail = tail;
    attachHead(g, rig, headCow, 0, 1.92, 0.98);
    return rig;
  }
  function animalSheep() {
    var g = new THREE.Group();
    var rig = newRig(g, 'sheep');
    rig.parts.legs = fourLegs(g, 0.26, 0.105, 0xe8d8c4, { x: 0.32, z: 0.42, footColor: 0xd6c3ab });
    var body = part(g, sph(0.62, 22), toon(0xfffaf0), [0, 0.78, 0], [0.9, 0.86, 1.06]);
    outlineOf(body, 1.035, 0.9);
    rig.parts.body = body;
    // 羊毛团：两层共 20 团，整个身体就是毛球（确认稿：全身毛茸茸）
    [[0, 1.28, 0.1, 0.34], [0.38, 1.14, 0.26, 0.28], [-0.38, 1.14, 0.26, 0.28],
     [0.5, 1.04, -0.3, 0.29], [-0.5, 1.04, -0.3, 0.29], [0, 1.24, -0.54, 0.3],
     [0.44, 0.82, 0.54, 0.25], [-0.44, 0.82, 0.54, 0.25], [0, 0.64, 0.7, 0.24],
     [0.56, 0.78, -0.1, 0.24], [-0.56, 0.78, -0.1, 0.24],
     [0.2, 1.38, -0.2, 0.26], [-0.2, 1.38, -0.2, 0.26], [0.58, 0.98, 0.2, 0.24],
     [-0.58, 0.98, 0.2, 0.24], [0, 1.0, -0.72, 0.26], [0.3, 0.66, -0.5, 0.22],
     [-0.3, 0.66, -0.5, 0.22], [0.62, 0.9, -0.45, 0.22], [-0.62, 0.9, -0.45, 0.22]].forEach(function (p) {
      // 白色羊毛团补描边：剪影由羊毛团构成，不描边会和浅底糊在一起
      outlineOf(part(g, sph(p[3], 16), toon(0xfffdf6), [p[0], p[1], p[2]]), 1.05, 0.58);
    });
    rig.parts.tail = part(g, sph(0.2, 12), toon(0xfffdf6), [0, 0.94, -0.86]);
    outlineOf(rig.parts.tail, 1.05, 0.58);
    attachHead(g, rig, headSheep, 0, 1.22, 0.5);
    return rig;
  }
  function animalRabbit() {
    var g = new THREE.Group();
    var rig = newRig(g, 'anjela');
    var baby = isBaby();
    rig.parts.legs = fourLegs(g, 0.24, 0.095, 0xf1e4e8, { x: 0.24, z: baby ? 0.3 : 0.4, footColor: 0xe8d6dc });
    // 短毛体型：与 cat / dog 同一套做法（单个平滑躯干，不再用毛团堆剪影）；成年略前后拉长，幼年圆短
    var body = part(g, sph(0.5, 24), toon(0xfffdfa), [0, 0.6, 0],
      baby ? [0.96, 0.92, 1.06] : [0.88, 0.88, 1.15]);
    outlineOf(body, 1.035, 0.9);
    rig.parts.body = body;
    // 安哥拉兔绒毛：身体周围 18 团毛茸茸的绒团（毛量明显多，蓬松剪影），不是光滑短毛
    var fluffMat = toon(0xfffdfa);
    var fluffs = [
      [0.38, 0.62, 0.1, 0.2], [-0.38, 0.62, 0.1, 0.2],
      [0.34, 0.8, -0.28, 0.19], [-0.34, 0.8, -0.28, 0.19],
      [0.3, 0.5, 0.38, 0.18], [-0.3, 0.5, 0.38, 0.18],
      [0, 0.98, -0.12, 0.21], [0, 0.72, -0.58, 0.2],
      [0.32, 0.98, 0.3, 0.15], [-0.32, 0.98, 0.3, 0.15],
      [0.42, 0.78, 0.3, 0.17], [-0.42, 0.78, 0.3, 0.17],
      [0, 0.86, 0.42, 0.18], [0.2, 0.5, -0.45, 0.18], [-0.2, 0.5, -0.45, 0.18],
      [0.44, 0.66, -0.3, 0.17], [-0.44, 0.66, -0.3, 0.17], [0, 1.02, 0.12, 0.16]
    ];
    fluffs.forEach(function (f) {
      var puff = part(g, sph(f[3], 12), fluffMat, [f[0], f[1], f[2]]);
      outlineOf(puff, 1.05, 0.9);
    });
    var chest = part(g, sph(0.24, 14), toon(0xffeef4), [0, 0.54, 0.38], [0.86, 0.98, 0.68]);
    outlineOf(chest, 1.05, 0.86);
    // 前爪：两只小圆爪搭在身前
    part(g, sph(0.11, 10), toon(0xfffdfa), [-0.16, 0.34, 0.44], [1, 1.2, 0.8]);
    part(g, sph(0.11, 10), toon(0xfffdfa), [0.16, 0.34, 0.44], [1, 1.2, 0.8]);
    // 圆棉尾（毛茸茸的大棉球）
    rig.parts.tail = part(g, sph(0.28, 12), toon(0xffffff), [0, 0.62, -0.56]);
    outlineOf(rig.parts.tail, 1.06, 0.58);
    attachHead(g, rig, headRabbit, 0, 1.12, 0.16);
    return rig;
  }
  function animalHorse() {
    var g = new THREE.Group();
    var rig = newRig(g, 'horse');
    var baby = isBaby();
    rig.parts.legs = fourLegs(g, 0.6, 0.13, 0xa86a32, { x: 0.36, z: baby ? 0.44 : 0.6, footColor: 0x6b4522 });
    // 成年躯干：前后拉长、上下略压扁（马身修长）；幼年保持圆滚滚
    var body = part(g, sph(0.78, 24), toon(0xa86a32), [0, 1.32, 0],
      baby ? [0.86, 0.9, 1.06] : [0.8, 0.88, 1.6]);
    outlineOf(body, 1.035, 0.52);
    rig.parts.body = body;
    var neckZ = baby ? 0.5 : 0.68;
    // 长脖（加长）
    part(g, cyl(0.3, 0.42, 0.9, 14), toon(0xa86a32), [0, 1.92, neckZ], null, [0.42, 0, 0]);
    // 鬃毛：沿脖根的长鬃，7 块由上到下渐小 + 两侧垂鬃
    [[0, 2.18, 0.36, 0.25], [0, 2.1, 0.14, 0.24], [0, 1.94, -0.04, 0.23],
     [0, 1.74, -0.1, 0.22], [0, 1.54, -0.12, 0.21], [0, 1.36, -0.12, 0.19],
     [0.3, 1.9, 0.3, 0.16], [-0.3, 1.9, 0.3, 0.16]].forEach(function (p) {
      part(g, sph(p[3], 12), toon(0x4a2e18), [p[0], p[1], p[2] + (baby ? 0 : 0.06)], [0.78, 0.66, 1.45]);
    });
    // 尾巴：更长更飘
    var tail = new THREE.Group();
    tail.position.set(0, 1.62, baby ? -0.62 : -1.08);
    g.add(tail);
    part(tail, cyl(0.05, 0.07, 0.7, 8), toon(0xa8683a), [0, -0.32, -0.08], null, [-0.25, 0, 0]);
    part(tail, sph(0.15, 12), toon(0x4a2e18), [0, -0.66, -0.24], [0.85, 1.5, 0.85], [0, 0, -0.2]);
    part(tail, sph(0.12, 12), toon(0x4a2e18), [0, -0.9, -0.36], [0.8, 1.3, 0.8], [0, 0, -0.3]);
    rig.parts.tail = tail;
    attachHead(g, rig, headHorse, 0, 2.42, baby ? 0.62 : 0.9);
    return rig;
  }
  function animalDog() {
    var g = new THREE.Group();
    var rig = newRig(g, 'dog');
    rig.parts.legs = fourLegs(g, 0.3, 0.095, 0xeeb95e, { x: 0.28, z: 0.38, footColor: 0xf7dcae });
    var body = part(g, sph(0.52, 22), toon(0xeeb95e), [0, 0.72, 0], [0.9, 0.86, 1.32]);
    outlineOf(body, 1.035, 0.58);
    rig.parts.body = body;
    // 胸前浅色
    outlineOf(part(g, sph(0.26, 14), toon(0xfff4e2), [0, 0.64, 0.42], [0.86, 1.0, 0.7]), 1.05, 0.8);
    // 胸前绒毛：三团浅色毛
    [[-0.14, 0.86, 0.44, 0.13], [0.14, 0.86, 0.44, 0.13], [0, 0.72, 0.5, 0.14]].forEach(function (p) {
      outlineOf(part(g, sph(p[3], 12), toon(0xfff4e2), [p[0], p[1], p[2]]), 1.05, 0.86);
    });
    // 上翘卷尾（圆润，尾尖浅色）
    var tail = new THREE.Group();
    tail.position.set(0, 0.98, -0.62);
    g.add(tail);
    part(tail, cyl(0.055, 0.065, 0.4, 8), toon(0xeeb95e), [0, 0.12, -0.05], null, [-0.55, 0, 0]);
    part(tail, sph(0.13, 12), toon(0xe0aa4e), [0, 0.3, -0.16], [0.9, 1.0, 1.1]);
    part(tail, sph(0.09, 12), toon(0xfff4e2), [0, 0.38, -0.21], [0.9, 1.0, 1.1]);
    rig.parts.tail = tail;
    attachHead(g, rig, headDog, 0, 1.1, 0.34);
    return rig;
  }
  function animalCat() {
    var g = new THREE.Group();
    var rig = newRig(g, 'cat');
    var baby = isBaby();
    rig.parts.legs = fourLegs(g, 0.28, 0.09, 0xfffaf2, { x: 0.26, z: baby ? 0.32 : 0.42, footColor: 0xf2e2d2 });
    // 三花猫体态修长（前后拉长、上下收窄）；幼年保留圆胖；白底
    var body = part(g, sph(0.5, 22), toon(0xfffaf2), [0, 0.66, 0],
      baby ? [0.9, 0.86, 1.1] : [0.82, 0.8, 1.45]);
    outlineOf(body, 1.035, 0.92);
    rig.parts.body = body;
    // 身上橘斑 + 黑斑（与头部花色呼应，真橘真黑）
    part(g, sph(0.19, 14), toon(0xd96f1e), [0.26, 0.86, -0.24], [1.1, 0.6, 0.9]);
    part(g, sph(0.17, 14), toon(0x221e24), [-0.27, 0.78, 0.26], [1, 0.6, 0.9]);
    part(g, sph(0.13, 12), toon(0xd96f1e), [-0.08, 0.92, -0.52], [1, 0.6, 0.9]);
    part(g, sph(0.14, 12), toon(0x221e24), [0.29, 0.7, 0.44], [0.9, 0.6, 0.9]);
    // 胸前浅色
    part(g, sph(0.24, 14), toon(0xffe9d6), [0, 0.6, 0.36], [0.88, 0.95, 0.68]);
    // 竖起的卷尾：白底 + 橘环 + 黑尖（确认稿：橘黑相间的条纹尾）
    var tail = new THREE.Group();
    tail.position.set(0, 0.88, -0.55);
    g.add(tail);
    part(tail, cyl(0.055, 0.065, 0.5, 8), toon(0xfffaf2), [0, 0.16, -0.04], null, [-0.35, 0, 0]);
    part(tail, sph(0.09, 10), toon(0xd96f1e), [0, 0.32, -0.1], [1.1, 0.9, 1.1]);
    part(tail, sph(0.1, 10), toon(0x221e24), [0, 0.44, -0.15], [1, 1, 1]);
    part(tail, sph(0.09, 10), toon(0xfffaf2), [0, 0.54, -0.2], [0.95, 1, 0.95]);
    rig.parts.tail = tail;
    // 成年补颈段：头抬高并前移，露出可见的颈段（不再头身直接相接）；幼年保持「没脖子」的圆幼态
    if (!baby) {
      var neck = part(g, cyl(0.17, 0.24, 0.55, 12), toon(0xfffaf2), [0, 1.1, 0.42], null, [0.42, 0, 0]);
      outlineOf(neck, 1.05, 0.92);
    }
    attachHead(g, rig, headCat, 0, baby ? 1.0 : 1.52, baby ? 0.28 : 0.5);
    return rig;
  }
  function animalLlama() {
    var g = new THREE.Group();
    var rig = newRig(g, 'llama');
    var wool = 0xfffefa;
    rig.parts.legs = fourLegs(g, 0.36, 0.1, 0xf2ece2, { x: 0.3, z: 0.42, footColor: 0xdcd4c8 });
    var body = part(g, sph(0.66, 22), toon(wool), [0, 0.94, 0], [0.88, 0.9, 1.12]);
    outlineOf(body, 1.035, 0.92);
    rig.parts.body = body;
    // 蓬松毛团（14 团）
    [[0, 1.4, 0.16, 0.3], [0.42, 1.28, 0.24, 0.26], [-0.42, 1.28, 0.24, 0.26],
     [0.5, 1.12, -0.3, 0.26], [-0.5, 1.12, -0.3, 0.26], [0, 1.34, -0.5, 0.27],
     [0.44, 0.9, 0.5, 0.24], [-0.44, 0.9, 0.5, 0.24], [0, 0.72, 0.66, 0.23],
     [0.2, 1.5, -0.3, 0.24], [-0.2, 1.5, -0.3, 0.24], [0.56, 1.0, 0.1, 0.22],
     [-0.56, 1.0, 0.1, 0.22], [0, 1.1, -0.68, 0.24]].forEach(function (p) {
      outlineOf(part(g, sph(p[3], 16), toon(wool), [p[0], p[1], p[2]]), 1.05, 0.58);
    });
    // 长脖子（圆润柱体 + 脖根绒毛）：成年再拉长一档，幼年保留短脖的幼态
    var baby = isBaby();
    var neckLen = baby ? 0.86 : 1.35;
    var neckY = baby ? 1.68 : 1.98;
    outlineOf(part(g, cyl(0.2, 0.27, neckLen, 14), toon(wool), [0, neckY, 0.38], null, [0.3, 0, 0]), 1.05, 0.58);
    outlineOf(part(g, sph(0.25, 14), toon(wool), [0, baby ? 1.42 : 1.5, 0.34], [1.1, 0.85, 1.0]), 1.05, 0.58);
    // 脖子绒毛：沿脖颈两侧 8 团（确认稿：脖子也是毛茸茸的，不是光杆）
    [[-0.22, 2.3, 0.5, 0.16], [0.22, 2.3, 0.5, 0.16], [-0.24, 2.0, 0.44, 0.17],
     [0.24, 2.0, 0.44, 0.17], [-0.24, 1.7, 0.38, 0.17], [0.24, 1.7, 0.38, 0.17],
     [0, 2.42, 0.42, 0.15], [0, 1.56, 0.32, 0.16]].forEach(function (p) {
      outlineOf(part(g, sph(p[3], 12), toon(wool), [p[0], p[1], p[2]]), 1.05, 0.58);
    });
    rig.parts.tail = part(g, sph(0.2, 12), toon(wool), [0, 1.04, -0.76]);
    outlineOf(rig.parts.tail, 1.05, 0.58);
    attachHead(g, rig, headLlama, 0, baby ? 2.14 : 2.62, baby ? 0.58 : 0.66);
    return rig;
  }

  var BODIES = {
    chicken: animalChicken, cow: animalCow, sheep: animalSheep, anjela: animalRabbit,
    horse: animalHorse, dog: animalDog, duck: animalDuck, cat: animalCat, llama: animalLlama
  };

  /* ======================= 道具 3D 图标 ======================= */

  var WOOD = 0xb97c42, WOOD_D = 0x8d5a2b, METAL = 0xbfc8d2, METAL_D = 0x98a3ae,
      IRON = 0x9aa3ad, GOLDG = 0xf0c04a;

  function iconShell(g) { void g; }

  function buildHoe() {
    var g = new THREE.Group();
    // 长木柄（不带顶部球头，避免读成锤子）
    var handle = part(g, cyl(0.05, 0.062, 1.5, 12), toon(WOOD), [0.14, 0.14, 0], null, [0, 0, 0.1]);
    outline(handle, 1.08, 0x5d3c1d);
    for (var i = 0; i < 2; i++) part(g, cyl(0.064, 0.064, 0.05, 12), toon(0x9c6b3a), [0.16 - i * 0.014, -0.28 - i * 0.16, 0], null, [0, 0, 0.1]);
    // 弯折的锄颈：从柄下端斜向左伸出
    var neck = part(g, cyl(0.05, 0.056, 0.36, 10), toon(METAL_D), [0.02, -0.66, 0], null, [0, 0, 1.05]);
    outline(neck, 1.07, 0x3c4048);
    // 锄刃：宽而薄的平板，板面斜朝镜头（薄板 → 与锤子的厚方块明显区分）
    var sh = new THREE.Shape();
    sh.moveTo(-0.46, 0.17);
    sh.lineTo(0.46, 0.17);
    sh.lineTo(0.39, -0.17);
    sh.lineTo(-0.39, -0.17);
    sh.lineTo(-0.46, 0.17);
    var blade = part(g, extrudeGeo(sh, 0.06, 0.01), toon(METAL), [-0.3, -0.8, 0.02], [1, 1, 1], [-0.6, 0, 0.08]);
    outline(blade, 1.06, 0x3c4048);
    // 刃口亮线（贴着板下缘）
    var edgeSh = new THREE.Shape();
    edgeSh.moveTo(-0.39, -0.17);
    edgeSh.lineTo(0.39, -0.17);
    edgeSh.lineTo(0.35, -0.06);
    edgeSh.lineTo(-0.35, -0.06);
    edgeSh.lineTo(-0.39, -0.17);
    part(g, extrudeGeo(edgeSh, 0.07, 0.006), toon(0xeef4fa), [-0.3, -0.8, 0.025], [1, 1, 1], [-0.6, 0, 0.08]);
    iconShell(g);
    return g;
  }

  function buildWateringCan() {
    var g = new THREE.Group();
    var bodyMat = toon(0x4fa9e0);
    var body = part(g, cyl(0.33, 0.28, 0.54, 18), bodyMat, [0.08, -0.14, 0]);
    outline(body, 1.05, 0x2f6f95);
    part(g, cyl(0.34, 0.3, 0.1, 18), toon(0x8ed2f5), [0.08, 0.16, 0]);
    part(g, cyl(0.3, 0.28, 0.08, 18), toon(0xd9f0ff), [0.08, 0.24, 0]);
    // 提手（顶部拱形）
    var handle = part(g, torus(0.32, 0.05, Math.PI), toon(0x9fb9c8), [0.08, 0.26, 0]);
    outline(handle, 1.08, 0x54707f);
    // 长壶嘴（向右上方伸出）+ 花洒头
    var spout = part(g, cyl(0.06, 0.1, 0.86, 12), bodyMat, [-0.42, 0.04, 0], null, [0, 0, -0.82]);
    outline(spout, 1.08, 0x2f6f95);
    var rose = part(g, cyl(0.21, 0.1, 0.18, 14), toon(0xd9e3ec), [-0.76, 0.3, 0], null, [0, 0, -0.82]);
    outline(rose, 1.07, 0x54707f);
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2;
      part(g, cyl(0.022, 0.022, 0.06, 6), ink(0x4a6d80),
        [-0.76 + Math.cos(a) * 0.1, 0.3 + Math.sin(a) * 0.1, 0.06], null, [Math.PI / 2, 0, 0]);
    }
    iconShell(g);
    return g;
  }

  function buildAxe() {
    var g = new THREE.Group();
    // 木柄
    var handle = part(g, cyl(0.05, 0.062, 1.5, 12), toon(WOOD), [-0.02, -0.02, 0], null, [0, 0, 0.14]);
    outline(handle, 1.08, 0x5d3c1d);
    for (var i = 0; i < 3; i++) part(g, cyl(0.064, 0.064, 0.05, 12), toon(0x9c6b3a), [-0.06 - i * 0.024, -0.52 - i * 0.17, 0], null, [0, 0, 0.14]);
    // 斧头：明显偏在柄右侧的单刃楔形（高>宽，刃口为微凸竖边），一眼是斧头
    var sh = new THREE.Shape();
    sh.moveTo(-0.1, 0.3);
    sh.lineTo(0.24, 0.36);
    sh.quadraticCurveTo(0.56, 0.34, 0.6, 0.0);
    sh.quadraticCurveTo(0.56, -0.34, 0.22, -0.36);
    sh.lineTo(-0.1, -0.3);
    sh.lineTo(-0.16, -0.16);
    sh.lineTo(-0.16, 0.16);
    sh.lineTo(-0.1, 0.3);
    var headGrp = new THREE.Group();
    headGrp.position.set(0.16, 0.56, 0);
    headGrp.rotation.set(0, 0, 0.2);
    g.add(headGrp);
    var head = part(headGrp, extrudeGeo(sh, 0.24), toon(0x6f7a88), [0, 0, -0.12]);
    outline(head, 1.05, 0x353a42);
    // 亮色刃口：贴着外侧竖边的一条月牙带
    var edgeSh = new THREE.Shape();
    edgeSh.moveTo(0.34, 0.31);
    edgeSh.quadraticCurveTo(0.58, 0.3, 0.63, 0.0);
    edgeSh.quadraticCurveTo(0.58, -0.3, 0.32, -0.33);
    edgeSh.lineTo(0.28, -0.26);
    edgeSh.quadraticCurveTo(0.49, -0.22, 0.53, 0.0);
    edgeSh.quadraticCurveTo(0.49, 0.22, 0.3, 0.24);
    edgeSh.lineTo(0.34, 0.31);
    part(headGrp, extrudeGeo(edgeSh, 0.245, 0.008), toon(0xdde6f0), [0, 0, -0.1225]);
    // 斧眼箍（柄穿头处）
    part(headGrp, cyl(0.095, 0.095, 0.27, 14), toon(0x565f6d), [-0.02, 0.0, 0]);
    iconShell(g);
    return g;
  }

  function buildHammer() {
    var g = new THREE.Group();
    var handle = part(g, cyl(0.05, 0.058, 1.15, 10), toon(WOOD), [0, -0.14, 0], null, [0, 0, 0.2]);
    outline(handle, 1.08, 0x5d3c1d);
    var headGrp = new THREE.Group();
    headGrp.position.set(0.06, 0.52, 0);
    headGrp.rotation.set(0, 0, 0.2);
    g.add(headGrp);
    var head = part(headGrp, box(0.66, 0.28, 0.3), toon(IRON), [0, 0, 0]);
    outline(head, 1.05, 0x3c4048);
    part(headGrp, box(0.14, 0.32, 0.34), toon(0xdfe6ee), [-0.36, 0, 0]);
    part(headGrp, box(0.14, 0.32, 0.34), toon(0x848d98), [0.36, 0, 0]);
    part(headGrp, cyl(0.11, 0.11, 0.32, 8), toon(0x77808b), [0, 0.16, 0], null, [Math.PI / 2, 0, 0]);
    iconShell(g);
    return g;
  }

  function buildSickle() {
    var g = new THREE.Group();
    var bladeGrp = new THREE.Group();
    bladeGrp.position.set(0.12, -0.06, 0);
    bladeGrp.rotation.set(0.08, 0, -0.5);
    g.add(bladeGrp);
    var R = 0.52, t0 = -0.62, t1 = 3.02;
    // 弯月刀刃：两端收尖、中段最宽（一眼是镰刀）
    var shape = arcBladeShape(R, 0.3, t0, t1, 30);
    var blade = part(bladeGrp, extrudeGeo(shape, 0.085, 0.01), toon(METAL), [0, 0, -0.042]);
    outline(blade, 1.04, 0x3c4048);
    // 靠近外弧的亮色开刃线
    part(bladeGrp, extrudeGeo(arcBladeShape(R + 0.035, 0.1, t0 + 0.12, t1 - 0.12, 28), 0.09, 0.006), toon(0xeef4fa), [0, 0, -0.045]);
    // 短木柄：接在刀根处，沿弧的切线方向往外
    var tipX = Math.cos(t0) * R, tipY = Math.sin(t0) * R;
    var dirX = Math.sin(t0), dirY = -Math.cos(t0);
    var handleGrp = new THREE.Group();
    handleGrp.position.set(tipX, tipY, 0);
    handleGrp.rotation.set(0, 0, Math.atan2(dirY, dirX) + Math.PI / 2);
    bladeGrp.add(handleGrp);
    var handle = part(handleGrp, cyl(0.055, 0.066, 0.68, 12), toon(WOOD), [0, -0.3, 0]);
    outline(handle, 1.08, 0x5d3c1d);
    part(handleGrp, cyl(0.072, 0.072, 0.09, 12), toon(0x8f7440), [0, -0.02, 0]);
    part(handleGrp, sph(0.078, 12), toon(WOOD_D), [0, -0.66, 0]);
    iconShell(g);
    return g;
  }

  function buildFishingRod() {
    var g = new THREE.Group();
    // 斜放的竿身（右下握把 → 左上竿梢）
    var rod = part(g, cyl(0.038, 0.019, 1.46, 10), toon(0xb98a4e), [-0.05, 0.12, 0], null, [0, 0, 0.35]);
    outline(rod, 1.06, 0x4a3319);
    var grip = part(g, cyl(0.072, 0.058, 0.4, 12), toon(0x6b4a2a), [0.08, -0.5, 0], null, [0, 0, 0.35]);
    outline(grip, 1.06, 0x3a2413);
    for (var i = 0; i < 3; i++) part(g, cyl(0.075, 0.075, 0.045, 12), toon(0x9c6b3a), [0.02 + i * 0.052, -0.36 - i * 0.11, 0], null, [0, 0, 0.35]);
    // 卷线轮（贴在握把上侧）
    var reel = part(g, cyl(0.14, 0.14, 0.09, 14), toon(0xd8e2ea), [0.2, -0.36, 0.09], null, [Math.PI / 2, 0, 0]);
    outline(reel, 1.05, 0x54707f);
    part(g, cyl(0.05, 0.05, 0.11, 10), toon(0x8f98a3), [0.2, -0.36, 0.13], null, [Math.PI / 2, 0, 0]);
    // 鱼线（从竿梢垂下）
    part(g, cyl(0.008, 0.008, 1.26, 6), ink(0xeaf3fa), [-0.31, 0.16, 0]);
    // 浮漂 + 鱼钩
    var floatTop = part(g, sph(0.115, 14), toon(0xef4b4b), [-0.31, -0.42, 0], [1, 0.95, 1]);
    outline(floatTop, 1.06, 0x8d2626);
    part(g, sph(0.115, 14), toon(0xfbfdff), [-0.31, -0.56, 0], [1, 0.6, 1]);
    part(g, torus(0.1, 0.022, Math.PI * 1.55), toon(METAL_D), [-0.31, -0.72, 0], null, [0, 0, 0.5]);
    iconShell(g);
    return g;
  }

  function buildFertilizer() {
    var g = new THREE.Group();
    var bagMat = toon(0xd8bd7c);
    var bag = part(g, box(0.62, 0.76, 0.36), bagMat, [0, -0.04, 0]);
    outline(bag, 1.05, 0x6b5a33);
    part(g, box(0.5, 0.14, 0.34), toon(0xbfa263), [0, 0.42, 0]);
    part(g, box(0.44, 0.3, 0.03), toon(0xfdf7e4), [0, 0.02, 0.19]);
    part(g, sph(0.11, 10), toon(0x6fbf4e), [-0.08, 0.06, 0.22], [1, 0.7, 0.5], [0, 0, 0.5]);
    part(g, sph(0.09, 10), toon(0x8fd46a), [0.12, 0.02, 0.22], [1, 0.7, 0.5], [0, 0, -0.5]);
    part(g, cyl(0.06, 0.09, 0.18, 8), toon(0x8f7440), [0, 0.54, 0]);
    iconShell(g);
    return g;
  }

  function buildFeed() {
    var g = new THREE.Group();
    var bucket = part(g, cyl(0.38, 0.3, 0.56, 16), toon(0xc98f4d), [0, -0.12, 0]);
    outline(bucket, 1.05, 0x6b4a22);
    part(g, cyl(0.39, 0.36, 0.08, 16), toon(0x8f7440), [0, 0.2, 0]);
    // 谷物堆
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2;
      part(g, sph(0.11, 10), toon(0xf0dca0), [Math.cos(a) * 0.16, 0.28 + (i % 3) * 0.05, Math.sin(a) * 0.16], [1, 0.8, 1]);
    }
    part(g, sph(0.13, 10), toon(0xfbeec4), [0, 0.41, 0]);
    part(g, sph(0.1, 10), toon(0x7bc25a), [0.22, 0.22, 0.16], [1, 0.6, 0.7], [0, 0, 0.6]);
    // 提手
    var handle = part(g, torus(0.36, 0.035, Math.PI), toon(0x9aa3ad), [0, 0.28, 0], null, [0, Math.PI / 2, 0]);
    void handle;
    iconShell(g);
    return g;
  }

  function buildMedicine() {
    var g = new THREE.Group();
    var bottle = part(g, cyl(0.26, 0.26, 0.68, 16), toon(0xa8d8f0), [0, -0.1, 0]);
    outline(bottle, 1.05, 0x37637f);
    part(g, cyl(0.27, 0.27, 0.2, 16), toon(0xe9f6ff), [0, 0.06, 0], null, [0, 0, 0]);
    part(g, cyl(0.15, 0.17, 0.2, 12), toon(0xdfe9f2), [0, 0.32, 0]);
    part(g, cyl(0.17, 0.17, 0.14, 12), toon(0x9a6a3c), [0, 0.46, 0]);
    // 红十字标签
    part(g, box(0.34, 0.26, 0.02), toon(0xfdfbf4), [0, -0.06, 0.255]);
    part(g, box(0.2, 0.08, 0.02), toon(0xe0483f), [0, -0.06, 0.27]);
    part(g, box(0.08, 0.2, 0.02), toon(0xe0483f), [0, -0.06, 0.27]);
    iconShell(g);
    return g;
  }

  function buildFence() {
    var g = new THREE.Group();
    var wood = toon(0xc39257);
    for (var i = -1; i <= 1; i++) {
      var post = part(g, cyl(0.07, 0.08, 0.96, 8), wood, [i * 0.44, -0.06, 0]);
      outline(post, 1.07, 0x6b4a22);
      part(g, sph(0.09, 10), toon(0x8d5a2b), [i * 0.44, 0.44, 0], [1, 0.6, 1]);
    }
    for (var r = 0; r < 2; r++) {
      var rail = part(g, cyl(0.055, 0.055, 1.16, 8), wood, [0, r === 0 ? 0.1 : -0.24, 0], null, [0, 0, Math.PI / 2]);
      outline(rail, 1.08, 0x6b4a22);
    }
    part(g, sph(0.1, 10), toon(0x6fbf4e), [0.44, 0.56, 0.04], [1, 0.45, 0.8], [0, 0, 0.3]);
    iconShell(g);
    return g;
  }

  function mkMachine(g, baseColor, topColor) {
    var base = part(g, box(0.66, 0.44, 0.56), toon(baseColor), [0, -0.44, 0]);
    outline(base, 1.045, 0x4a4038);
    part(g, box(0.7, 0.08, 0.6), toon(topColor), [0, -0.2, 0]);
    for (var i = -1; i <= 1; i += 2) {
      for (var j = -1; j <= 1; j += 2) {
        part(g, cyl(0.07, 0.07, 0.16, 8), toon(0x8f98a3), [0.26 * i, -0.72, 0.2 * j], null, [Math.PI / 2, 0, 0]);
      }
    }
    part(g, cyl(0.16, 0.16, 0.09, 12), toon(GOLDG), [0, -0.16, 0], null, [Math.PI / 2, 0, 0]);
  }

  function buildCheesemaker() {
    var g = new THREE.Group();
    mkMachine(g, 0xd9705f, 0xbb5a4b);
    part(g, cyl(0.3, 0.28, 0.36, 16), toon(0xc9d3dc), [0, 0.02, 0]);
    part(g, cyl(0.26, 0.26, 0.1, 16), toon(0xf0c04a), [0, 0.2, 0]);
    var wheel = part(g, cyl(0.26, 0.26, 0.14, 16), toon(0xf2c14e), [0, 0.36, 0], null, [0.35, 0, 0.2]);
    outline(wheel, 1.06, 0xa8791f);
    part(g, sph(0.06, 8), toon(0xf7d98a), [0.14, 0.42, 0.16]);
    iconShell(g);
    return g;
  }

  function buildMayomaker() {
    var g = new THREE.Group();
    mkMachine(g, 0x6fb1d8, 0x5590b6);
    var jar = part(g, cyl(0.26, 0.24, 0.42, 16), soft(0xf4f8fb, 0.55), [0, 0.0, 0]);
    outline(jar, 1.05, 0x37637f);
    part(g, sph(0.2, 14), toon(0xfdf6e8), [0, -0.02, 0], [0.85, 1.15, 0.85]);
    part(g, cyl(0.14, 0.14, 0.06, 12), toon(0xf2c14e), [0, 0.28, 0]);
    part(g, box(0.34, 0.12, 0.02), toon(0xfdfbf4), [0, -0.06, 0.24]);
    iconShell(g);
    return g;
  }

  function buildYarnmaker() {
    var g = new THREE.Group();
    mkMachine(g, 0x8fb46a, 0x6f9449);
    part(g, cyl(0.3, 0.28, 0.3, 16), toon(0xc9d3dc), [0, -0.02, 0]);
    var ball = part(g, sph(0.26, 16), toon(0xf2a0b8), [0, 0.3, 0]);
    outline(ball, 1.05, 0x9c5367);
    for (var i = 0; i < 3; i++) {
      part(ball, torus(0.26, 0.022, Math.PI * 1.6), toon(0xfbd0dc), [0, 0, 0], null, [i * 0.65, i * 0.9, 0.4]);
    }
    part(g, cyl(0.05, 0.05, 0.24, 8), toon(0x9aa3ad), [0.34, 0.1, 0], null, [0, 0, 0.6]);
    iconShell(g);
    return g;
  }

  /* ======================= 围栏 / 加工机：5 级造型（对齐已确认造型稿） =======================
   * 配色取自造型稿（02_fence_lv1-5.png / 03_machines_lv1-5.png），每级一套。
   * 建模单位与造型稿一致：围栏宽 1.6、机器整体高约 1.3~1.7。
   * ==================================================================================== */

  var FENCE_COLORS = [
    { post: 0xcaa878, rail: 0xd8bb92, cap: 0xb98f5f, trim: 0xa8804f },   // Lv1 米木
    { post: 0xb5854e, rail: 0xc79d68, cap: 0x9c7038, trim: 0x8b6234 },   // Lv2 深木
    { post: 0x9a6236, rail: 0xac7748, cap: 0x7c4e28, trim: 0x6e4522 },   // Lv3 棕木
    { post: 0xf0e7d4, rail: 0xf7f1e3, cap: 0xded0b0, trim: 0xd8a83c },   // Lv4 白银+金饰
    { post: 0x3c2e23, rail: 0x4b3a2c, cap: 0x2a201a, trim: 0xe8c052 }    // Lv5 黑檀+金饰
  ];

  var MACHINE_COLORS = {
    cheese: {
      body: [0xd98f4a, 0xe8a03c, 0xf0c04a, 0xd99a2b, 0xf5e6b8],
      dark: [0xa8632a, 0xb57a24, 0xc08f1f, 0xa8711c, 0xc9a94e],
      trim: [0x8a4f1f, 0x995c14, 0xa87413, 0x8f5c12, 0xe0b64a],
      gem:  [0xd9a24a, 0xe8b45a, 0xf2cf72, 0xd9b04e, 0xf6e6a8]
    },
    mayo: {
      body: [0xefe6d0, 0xf6e6b4, 0xf3d67a, 0xe8bc4c, 0xfbf3da],
      dark: [0xc4b79b, 0xd0bd88, 0xcea94e, 0xc09633, 0xd9c79c],
      trim: [0x9c8f74, 0xa08f60, 0xa8852c, 0x96701c, 0xe0b64a],
      gem:  [0xd9cdb2, 0xe6d79c, 0xf2df90, 0xd9b45a, 0xf7ecc4]
    },
    yarn: {
      body: [0x8ea8c8, 0x7fb6d9, 0x8b7fd9, 0xa06fc9, 0xd97fae],
      dark: [0x6c8098, 0x5e8ba8, 0x6a60a8, 0x7c528f, 0xa85c82],
      trim: [0x5a6b80, 0x4d7590, 0x574f90, 0x67447a, 0xe0b64a],
      gem:  [0xb8cbe0, 0xa9d4ec, 0xb8afe8, 0xc7a3e0, 0xf2c2d8]
    }
  };

  var MACHINE_KINDS = { cheesemaker: 'cheese', mayomaker: 'mayo', yarnmaker: 'yarn' };

  function clampLv(lv) {
    lv = Math.round(Number(lv) || 1);
    if (lv < 1) lv = 1;
    if (lv > 5) lv = 5;
    return lv;
  }

  /** 围栏（单段，宽 1.6）：Lv 越高横栏越多、柱顶装饰越华丽 */
  function buildFenceByLevel(lv) {
    lv = clampLv(lv);
    var c = FENCE_COLORS[lv - 1], g = new THREE.Group(), W = 1.6, i, x;
    for (i = -1; i <= 1; i += 2) {
      x = i * W / 2;
      outline(part(g, box(0.2, 0.95, 0.2), toon(c.post), [x, 0.475, 0]), 1.06, 0x4a3b2f);
      part(g, box(0.27, 0.1, 0.27), toon(c.cap), [x, 1.0, 0]);
      if (lv >= 4) part(g, sph(0.09, 14), toon(c.trim), [x, 1.1, 0]);
      if (lv >= 5) part(g, con(0.1, 0.2, 4), toon(c.trim), [x, 1.24, 0], null, [0, Math.PI / 4, 0]);
    }
    outline(part(g, box(1.62, 0.13, 0.11), toon(c.rail), [0, 0.72, 0]), 1.06, 0x4a3b2f);
    outline(part(g, box(1.62, 0.13, 0.11), toon(c.rail), [0, 0.4, 0]), 1.06, 0x4a3b2f);
    if (lv >= 2) part(g, box(1.62, 0.1, 0.09), toon(c.rail), [0, 0.2, 0]);
    if (lv >= 3) part(g, box(1.62, 0.11, 0.1), toon(c.rail), [0, 0.56, 0]);
    if (lv >= 4) {
      for (i = -1; i <= 1; i += 2) part(g, box(0.07, 0.2, 0.16), toon(c.trim), [i * 0.42, 0.72, 0]);
    }
    if (lv >= 5) part(g, box(0.07, 1.0, 0.06), toon(c.trim), [0, 0.5, 0]);
    iconShell(g);
    return g;
  }

  /** 加工机（kind = cheese | mayo | yarn，正面朝 +z）：Lv 越高越多金色环带与宝石装饰 */
  function buildMachineByLevel(kind, lv) {
    lv = clampLv(lv);
    var t = MACHINE_COLORS[kind] || MACHINE_COLORS.cheese;
    var c = t.body[lv - 1], d = t.dark[lv - 1], tr = t.trim[lv - 1], gm = t.gem[lv - 1];
    var g = new THREE.Group(), body;

    part(g, box(1.04, 0.12, 1.04), toon(d), [0, 0.06, 0]);       /* 底座 */
    body = part(g, box(0.86, 0.78, 0.86), toon(c), [0, 0.51, 0]);/* 机身 */
    outline(body, 1.045, 0x4a4038);
    part(g, box(0.92, 0.09, 0.92), toon(d), [0, 0.16, 0]);       /* 下箍 */
    part(g, box(0.92, 0.09, 0.92), toon(d), [0, 0.86, 0]);       /* 上箍 */
    part(g, cyl(0.4, 0.4, 0.14, 22), toon(d), [0, 0.94, 0]);     /* 顶盖 */
    part(g, box(0.42, 0.24, 0.05), toon(tr), [0, 0.58, 0.44]);   /* 正面铭牌 */
    part(g, cyl(0.035, 0.035, 0.26, 8), toon(tr), [0.46, 0.56, 0], null, [0, 0, Math.PI / 2]);
    part(g, sph(0.07, 10), toon(tr), [0.6, 0.56, 0]);            /* 摇柄 */
    part(g, cyl(0.075, 0.095, 0.32, 14), toon(d), [0.28, 1.05, 0.26]); /* 烟囱 */
    part(g, cyl(0.08, 0.08, 0.22, 12), toon(tr), [-0.3, 0.3, 0.46], null, [Math.PI / 2, 0, 0]);

    /* 顶部标识：区分三种机器 */
    if (kind === 'cheese') {
      part(g, con(0.24, 0.36, 3), toon(0xf7d774), [0, 1.28, 0], null, [0, Math.PI / 6, 0]);
      part(g, sph(0.045, 8), toon(0xf7f1dc), [-0.1, 1.3, 0.1]);
      part(g, sph(0.04, 8), toon(0xf7f1dc), [0.08, 1.34, 0.06]);
    } else if (kind === 'mayo') {
      part(g, sph(0.23, 16), toon(0xfdf6e0), [0, 1.26, 0], [1, 1.18, 1]);
      part(g, cyl(0.09, 0.09, 0.06, 12), toon(0xf2d98a), [0, 1.06, 0]);
    } else {
      part(g, sph(0.22, 16), toon(0xf4f1ea), [0, 1.25, 0]);
      part(g, torus(0.2, 0.03, Math.PI * 2), toon(0xd97fae), [0, 1.25, 0], null, [Math.PI / 2, 0, 0]);
      part(g, torus(0.2, 0.03, Math.PI * 2), toon(0x8b7fd9), [0, 1.25, 0], null, [0, 0, Math.PI / 2]);
    }

    /* 等级装饰：随等级递增 */
    if (lv >= 2) part(g, cyl(0.08, 0.08, 0.05, 14), toon(tr), [-0.3, 0.72, 0.44], null, [Math.PI / 2, 0, 0]);
    if (lv >= 3) {
      part(g, torus(0.49, 0.035, Math.PI * 2), toon(gm), [0, 0.51, 0], null, [Math.PI / 2, 0, 0]);
      part(g, torus(0.44, 0.03, Math.PI * 2), toon(gm), [0, 0.28, 0], null, [Math.PI / 2, 0, 0]);
    }
    if (lv >= 4) {
      part(g, sph(0.08, 12), toon(gm), [-0.46, 0.9, 0.3]);
      part(g, sph(0.08, 12), toon(gm), [0.46, 0.9, -0.3]);
    }
    if (lv >= 5) {
      part(g, con(0.13, 0.22, 4), toon(gm), [0, 1.5, 0], null, [0, Math.PI / 4, 0]);
      part(g, sph(0.05, 10), toon(gm), [0, 1.62, 0]);
      part(g, box(0.06, 0.3, 0.03), toon(tr), [0.4, 1.02, 0.4]);
    }
    iconShell(g);
    return g;
  }

  function buildBarn() {
    var g = new THREE.Group();
    var wall = part(g, box(0.9, 0.66, 0.72), toon(0xcf7a5c), [0, -0.3, 0]);
    outline(wall, 1.04, 0x5f3626);
    // 屋顶（三棱柱）
    var roof = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.78, 3), toon(0xd9e2ea));
    roof.rotation.set(0, 0, Math.PI / 6);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, 0.2, 0);
    roof.scale.set(1, 1, 0.62);
    g.add(roof);
    var roofOut = outline(roof, 1.05, 0x4a4038);
    void roofOut;
    part(g, box(0.4, 0.5, 0.06), toon(0xfdf4e4), [0, -0.4, 0.38]);
    part(g, box(0.42, 0.06, 0.08), toon(0x9a5f43), [0, -0.4, 0.4]);
    part(g, box(0.24, 0.24, 0.04), toon(0x9fd8f0), [0.3, -0.18, 0.37]);
    part(g, box(0.24, 0.24, 0.04), toon(0x9fd8f0), [-0.3, -0.18, 0.37]);
    iconShell(g);
    return g;
  }

  function buildBed() {
    var g = new THREE.Group();
    // 四条床脚
    for (var i = -1; i <= 1; i += 2) {
      for (var j = -1; j <= 1; j += 2) {
        part(g, cyl(0.07, 0.06, 0.34, 8), toon(0x7b4f28), [0.42 * i, -0.56, 0.62 * j]);
      }
    }
    // 床板 + 高床头板（靠背明显）
    var frame = part(g, box(1.0, 0.16, 1.5), toon(0xa9713f), [0, -0.36, 0]);
    outline(frame, 1.04, 0x5b3a1c);
    var headboard = part(g, box(1.06, 0.62, 0.14), toon(0x8d5a2b), [0, -0.18, -0.78]);
    outline(headboard, 1.05, 0x5b3a1c);
    part(g, box(1.06, 0.1, 0.16), toon(0xc08b54), [0, 0.11, -0.78]);
    // 床垫 / 枕头 / 被子
    part(g, box(0.94, 0.28, 1.4), toon(0xfdfbf5), [0, -0.16, 0.02]);
    var pillow = part(g, box(0.74, 0.18, 0.34), toon(0xf6efe0), [0, 0.02, -0.46]);
    outline(pillow, 1.05, 0xb9a889);
    var quilt = part(g, box(0.98, 0.22, 0.92), toon(0x8fc0e8), [0, -0.02, 0.28]);
    outline(quilt, 1.05, 0x46698a);
    part(g, box(1.0, 0.1, 0.16), toon(0xfbd7e0), [0, 0.04, 0.7]);
    iconShell(g);
    return g;
  }

  var TOOL_BUILD = {
    hoe: buildHoe, wateringcan: buildWateringCan, axe: buildAxe, hammer: buildHammer,
    sickle: buildSickle, fishingrod: buildFishingRod, fertilizer: buildFertilizer,
    feed: buildFeed, medicine: buildMedicine, fence: buildFence,
    cheesemaker: buildCheesemaker, mayomaker: buildMayomaker, yarnmaker: buildYarnmaker,
    barn: buildBarn, bed: buildBed
  };

  function buildSeedPack(cropId) {
    var g = new THREE.Group();
    var color = SEED_COLOR[cropId] === undefined ? 0x8bd46a : SEED_COLOR[cropId];
    var packet = part(g, box(0.7, 0.94, 0.14), toon(0xf6e9cd), [0, -0.02, 0]);
    outline(packet, 1.04, 0x6b5a33);
    // 折口
    part(g, box(0.76, 0.16, 0.18), toon(0xdcc79a), [0, 0.5, 0]);
    // 袋口伸出的嫩芽（强调「种子」）
    part(g, cyl(0.028, 0.028, 0.26, 6), toon(0x5fae42), [0, 0.68, 0]);
    part(g, sph(0.11, 12), toon(0x74c455), [0.13, 0.78, 0], [1, 0.45, 0.62], [0, 0, -0.7]);
    part(g, sph(0.11, 12), toon(0x8fd46a), [-0.13, 0.78, 0], [1, 0.45, 0.62], [0, 0, 0.7]);
    // 中央作物图案（大而醒目）
    var crop = part(g, sph(0.24, 16), toon(color), [0, 0.08, 0.13], [1.1, 1.1, 0.6]);
    outline(crop, 1.06, 0x6b5a33);
    part(g, sph(0.11, 10), toon(0x5fae42), [0.16, 0.24, 0.13], [1, 0.6, 0.6], [0, 0, 0.7]);
    // 底部说明条（模拟包装文字）
    part(g, box(0.46, 0.09, 0.03), toon(0xb8a279), [0, -0.3, 0.09]);
    part(g, box(0.3, 0.07, 0.03), toon(0xcdbb92), [0, -0.42, 0.09]);
    return g;
  }

  /* ======================= 对外接口 ======================= */

  M.ANIMALS = ANIMALS;
  M.TOOLS = TOOLS;
  M.SEEDS = SEEDS;

  /* ======================= 成年 / 幼年 · 三视图 ======================= */

  var AGES = ['adult', 'baby'];
  var VIEWS = ['front', 'side', 'back'];
  var VIEW_YAW = { front: 0, side: Math.PI / 2, back: Math.PI };
  var VIEW_CAM = [0.05, 0.28, 1];
  var ANIMAL_NAMES = {
    chicken: '小鸡', cow: '奶牛', sheep: '绵羊', anjela: '安哥拉兔', horse: '马',
    dog: '狗', duck: '鸭', cat: '猫', llama: '羊驼'
  };
  var VIEW_NAMES = { front: '正面', side: '侧面', back: '背面' };
  var curAge = 'adult';
  function isBaby() { return curAge === 'baby'; }
  function asAge(age) { return age === 'baby' ? 'baby' : 'adult'; }

  /** 幼年化：四肢缩短 → 头变大 → 身体更圆 → 加颊肉与呆毛（同色系略亮） */
  function applyBaby(rig) {
    var g = rig.group;
    var legs = rig.parts.legs || [];
    var topY = 0;
    legs.forEach(function (l) { topY = Math.max(topY, l.position.y); });
    var k = 0.68;
    var drop = topY * (1 - k);
    legs.forEach(function (l) {
      l.scale.set(l.scale.x * 0.94, l.scale.y * k, l.scale.z * 0.94);
      l.position.y *= k;
    });
    g.children.forEach(function (ch) {
      if (legs.indexOf(ch) >= 0) return;
      ch.position.y -= drop;
    });
    var head = rig.parts.head;
    if (head) {
      // 幼年脑袋夸张放大（×1.36/1.30），与成年头部缩小 0.86 形成明显反差
      head.scale.set(head.scale.x * 1.36, head.scale.y * 1.3, head.scale.z * 1.36);
      addBabyFace(head);
    }
    var body = rig.parts.body;
    if (body) body.scale.set(body.scale.x * 1.1, body.scale.y * 1.12, body.scale.z * 1.1);
    rig.baby = true;
    rig.groundOffset = -drop;
  }

  /** 幼年专属五官：两团颊肉 + 两撮呆毛，强化「更圆更软更蓬松」 */
  function addBabyFace(head) {
    var first = head.children[0];
    var r = 0.45;
    if (first && first.geometry && first.geometry.parameters && first.geometry.parameters.radius) {
      r = first.geometry.parameters.radius;
    }
    var base = (first && first.material && first.material.color) ? first.material.color.getHex() : 0xfff3e2;
    var c = new THREE.Color(base).lerp(new THREE.Color(0xffffff), 0.24).getHex();
    var mat = toon(c);
    for (var e = -1; e <= 1; e += 2) {
      var cheek = part(head, sph(r * 0.27, 12), mat, [r * 0.66 * e, -r * 0.24, r * 0.32], [1, 0.86, 0.84]);
      outlineOf(cheek, 1.06, 0.9);
    }
    var tuft = part(head, sph(r * 0.16, 10), mat, [0, r * 0.98, r * 0.04], [0.8, 1.45, 0.8]);
    outlineOf(tuft, 1.07, 0.9);
    var tuft2 = part(head, sph(r * 0.12, 10), mat, [r * 0.18, r * 1.06, r * 0.02], [0.8, 1.35, 0.8], [0, 0, -0.5]);
    outlineOf(tuft2, 1.07, 0.9);
  }


  /* ============================================================
   * 第四轮：GLB 真模型文件（替换代码拼动物）
   * 来源（全部免费可商用，已逐个渲染看图确认是 Q 萌低多边形风）：
   *   牛 / 绵羊 / 马 / 羊驼：Quaternius 农场 & UAA 系列，CC0 1.0，
   *     经 Poly Pizza（static.poly.pizza）下载，见各条 via。
   *   鸡 / 狗 / 鸭 / 松鼠：Gobkit 免费模型库，CC0 1.0，
   *     https://gobkit.com/api/free（API 明示 CC0）。
   * 没找到合适 GLB 的保留代码拼模型：安哥拉兔（白毛四足；
   *   Quaternius 兔是双足拟人拿胡萝卜、Gobkit 兔是棕色野兔）、
   *   三花猫（Quaternius 猫是灰色方块、卡通猫只有头、
   *   Kenney 猫缺 colormap 贴图无法用）。
   * 加载失败 / 模型缺失时自动回退代码拼模型，绝不白屏。
   * height：该模型在 scale=1 时的目标包围盒高度（米制单位），
   *   与原代码拼模型实测高度一致，保证现有 scale / 爱心高度不变。
   * head：头像渲染取的头部高度带（包围盒高度的分数区间）。
   * ============================================================ */
  var GLB_DEFS = {
    cow:      { file: 'assets/models/cow.glb',      height: 2.66, head: [0.55, 1.00], src: 'Quaternius 低多边形农场牛（黑白斑+粉鼻）', lic: 'CC0 1.0', via: 'Poly Pizza m/5XSc2Fka3F' },
    sheep:    { file: 'assets/models/sheep.glb',    height: 2.19, head: [0.30, 0.85], headCam: [0.35, 0.2, 1], src: 'Quaternius 低多边形农场绵羊（白毛黑脸）', lic: 'CC0 1.0', via: 'Poly Pizza m/C39AUXUUes' },
    chicken:  { file: 'assets/models/chicken.glb',  height: 1.81, head: [0.30, 1.00], src: 'Gobkit BrahmaChicken（白毛红冠大眼）', lic: 'CC0 1.0', via: 'gobkit.com/freebies/animal009/BrahmaChicken.glb' },
    horse:    { file: 'assets/models/horse.glb',    height: 3.16, head: [0.60, 1.00], src: 'Quaternius UAA 马（棕马黑鬃）', lic: 'CC0 1.0', via: 'Poly Pizza m/qvTrSG9pZF' },
    dog:      { file: 'assets/models/dog.glb',      height: 1.55, head: [0.45, 1.00], src: 'Gobkit Corgi（橘白大头柯基）', lic: 'CC0 1.0', via: 'gobkit.com/freebies/animal/Corgi.glb' },
    duck:     { file: 'assets/models/duck.glb',     height: 1.50, head: [0.40, 1.00], src: 'Gobkit Duck（黄绿扁嘴鸭）', lic: 'CC0 1.0', via: 'gobkit.com/freebies/animal/Duck.glb' },
    llama:    { file: 'assets/models/llama.glb',    height: 3.30, head: [0.62, 1.00], src: 'Quaternius UAA 羊驼（棕色长脖）', lic: 'CC0 1.0', via: 'Poly Pizza m/bCVFD48i2l' },
    squirrel: { file: 'assets/models/squirrel.glb', height: 1.60, head: [0.40, 1.00], src: 'Gobkit Squirrel（橘色大尾巴松鼠）', lic: 'CC0 1.0', via: 'gobkit.com/freebies/animal006/Squirrel.glb' }
  };
  var glbCache = {};   // type -> { ok, scene, clips, error }
  var glbPromise = null;
  /** GLB 相对路径的基准：从 models.js 自身的 <script src> 推导，
   *  游戏页（js/models.js）与离屏渲染页（../js/models.js）都能找对 assets/。 */
  var GLB_BASE = (function () {
    try {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].getAttribute('src') || '';
        if (/models\.js(\?|$)/.test(src)) {
          var m = src.match(/^(.*)js\/models\.js(\?.*)?$/);
          return m ? m[1] : '';   // 裸 models.js（无 js/ 前缀）也返回 ''，别把文件名当目录
        }
      }
    } catch (e) {}
    return '';
  })();

  /** GLB 材质转卡通：MeshStandardMaterial -> MeshToonMaterial（同色阶），
   *  保留原贴图 / 顶点色 / 透明度；注册进 toonMats，随 setShading 切换色阶。 */
  function toonifyGLB(root) {
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      var out = mats.map(function (old) {
        if (!old) return old;
        if (old.isMeshToonMaterial) return old;
        var hasVC = !!(o.geometry && o.geometry.attributes && o.geometry.attributes.color);
        var m = new THREE.MeshToonMaterial({
          color: old.color ? old.color.clone() : new THREE.Color(0xffffff),
          map: old.map || null,
          vertexColors: hasVC,
          transparent: !!old.transparent,
          opacity: (old.opacity === undefined ? 1 : old.opacity),
          side: old.side || THREE.FrontSide,
          skinning: !!old.skinning   // GLTFLoader 给蒙皮网格的原材质置了 skinning=true；换材质必须带上，否则骨骼动画不生效（只剩绑定姿势平移）
        });
        m.gradientMap = gradientMap();
        toonMats.push(m);
        return m;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
      o.castShadow = true;
    });
  }

  /** 动画名归一化：去掉 Armature| / AnimalArmature| / CharacterArmature| 前缀（有的模型套了两三层）。 */
  function normClipName(n) {
    var s = String(n || '');
    var prev = null;
    while (prev !== s) { prev = s; s = s.replace(/^(armature|animalarmature|characterarmature)\|/i, ''); }
    return s.toLowerCase();
  }

  function clipScore(n, want) {
    if (/death|attack|hit|die/.test(n)) return 0;   // 死亡/攻击/受击片段绝不能当成待机/走路/吃食
    if (want === 'idle') {
      if (n === 'idle' || n === 'idle_2') return 3;
      if (/^idle/.test(n) && !/hit|death|attack/.test(n)) return 2;
      if (/idle/.test(n) && !/hit|death|attack/.test(n)) return 1;
    } else if (want === 'walk') {
      if (n === 'walk' || n === 'walkslow') return 3;
      if (/^(walk|run|gallop)/.test(n)) return 2;
      if (/(walk|run|gallop)/.test(n)) return 1;
    } else if (want === 'eat') {
      if (/^(eating|idle_eating|idle_peck)$/.test(n)) return 3;
      if (/(eat|peck)/.test(n)) return 2;
      if (/headlow/.test(n)) return 1;
    }
    return 0;
  }

  /** 给每种需求挑一个最合适的动画片段（idle / walk / eat），没有就留空用 idle 兜底。 */
  function indexClips(animations) {
    var out = { idle: null, walk: null, eat: null, all: animations || [] };
    var best = { idle: 0, walk: 0, eat: 0 };
    out.all.forEach(function (clip) {
      var n = normClipName(clip.name);
      ['idle', 'walk', 'eat'].forEach(function (w) {
        var sc = clipScore(n, w);
        if (sc > best[w]) { best[w] = sc; out[w] = clip; }
      });
    });
    if (!out.idle && out.all.length) out.idle = out.all[0];
    return out;
  }

  /** 预加载全部 GLB（并行，单文件 12 秒超时即放弃该文件）。
   *  永远 resolve、不 reject；失败的类型留在 glbCache 里标 ok:false，
   *  调用方回退代码拼模型。 */
  M.preloadGLB = function () {
    if (glbPromise) return glbPromise;
    glbPromise = new Promise(function (resolve) {
      if (!THREE.GLTFLoader) {
        Object.keys(GLB_DEFS).forEach(function (t) { glbCache[t] = { ok: false, error: 'no GLTFLoader' }; });
        resolve(glbCache);
        return;
      }
      var loader = new THREE.GLTFLoader();
      var keys = Object.keys(GLB_DEFS);
      var done = 0;
      function finishOne() { done++; if (done >= keys.length) resolve(glbCache); }
      keys.forEach(function (type) {
        var def = GLB_DEFS[type];
        var settled = false;
        function settle() { if (!settled) { settled = true; finishOne(); } }
        setTimeout(settle, 12000);
        try {
          loader.load(GLB_BASE + def.file, function (gltf) {
            if (settled) return;
            try {
              toonifyGLB(gltf.scene);
              glbCache[type] = { ok: true, scene: gltf.scene, clips: gltf.animations || [] };
            } catch (e) { glbCache[type] = { ok: false, error: String(e && e.message || e) }; }
            settle();
          }, undefined, function () {
            if (settled) return;
            glbCache[type] = { ok: false, error: 'load failed: ' + def.file };
            settle();
          });
        } catch (e) {
          if (!settled) glbCache[type] = { ok: false, error: String(e && e.message || e) };
          settle();
        }
      });
    });
    return glbPromise;
  };

  M.glbReady = function (type) { return !!(glbCache[type] && glbCache[type].ok); };
  M.glbStatus = function () {
    var out = {};
    Object.keys(GLB_DEFS).forEach(function (t) {
      var c = glbCache[t];
      out[t] = { file: GLB_DEFS[t].file, ok: !!(c && c.ok), error: (c && c.error) || null, src: GLB_DEFS[t].src, lic: GLB_DEFS[t].lic, via: GLB_DEFS[t].via };
    });
    return out;
  };
  M.GLB_DEFS = GLB_DEFS;

  /** 从模板克隆一个 GLB 动物实例：骨骼独立（SkeletonUtils.clone），
   *  内层归一化到目标高度、脚底落在 y=0；外层 scale 由调用方定。 */
  function buildGLBRig(type) {
    var def = GLB_DEFS[type];
    var tpl = glbCache[type];
    var src = tpl.scene;
    var clone = (THREE.SkeletonUtils && THREE.SkeletonUtils.clone) ? THREE.SkeletonUtils.clone(src) : src.clone();
    var bb = new THREE.Box3().setFromObject(clone);
    var sz = bb.getSize(new THREE.Vector3());
    var inner = new THREE.Group();
    var k = def.height / Math.max(0.05, sz.y);
    inner.scale.setScalar(k);
    inner.position.y = -bb.min.y * k;
    inner.add(clone);
    var g = new THREE.Group();
    g.add(inner);
    var rig = newRig(g, type);
    rig.glb = true;
    rig.mixer = new THREE.AnimationMixer(clone);
    rig.clips = indexClips(tpl.clips);
    rig._clipWant = null;
    rig._curAct = null;
    return rig;
  }

  /** 每帧驱动 GLB 骨骼动画：吃东西 > 走路 > 待机，0.2 秒淡入淡出切换。
   *  由 scene.js updateAnimal 末尾调用（moving 由它算出）。 */
  M.tickGLB = function (rig, dt, moving) {
    if (!rig || !rig.mixer || !rig.clips) return;
    var want = (rig.eating > 0) ? 'eat' : (moving ? 'walk' : 'idle');
    if (rig._clipWant !== want) {
      rig._clipWant = want;
      var clip = rig.clips[want] || rig.clips.idle;
      if (clip) {
        var act = rig.mixer.clipAction(clip);
        act.reset();
        act.setLoop(THREE.LoopRepeat, Infinity);
        act.fadeIn(0.2).play();
        if (rig._curAct && rig._curAct !== act) { try { rig._curAct.fadeOut(0.2); } catch (e) {} }
        rig._curAct = act;
      }
    }
    rig.mixer.update(dt);
  };

  /** 松鼠专用入口：scene.js buildSquirrel 优先用 GLB，失败返回 null 用代码松鼠。 */
  M.buildSquirrel = function (scale) {
    if (!glbCache.squirrel || !glbCache.squirrel.ok) return null;
    try {
      var rig = buildGLBRig('squirrel');
      rig.group.scale.setScalar(scale || 1);
      rig.type = 'squirrel';
      return rig;
    } catch (e) { return null; }
  };

  M.buildAnimal = function (type, scale, age) {
    if (glbCache[type] && glbCache[type].ok) {
      try {
        var grig = buildGLBRig(type);
        if (asAge(age) === 'baby') { grig.group.scale.setScalar((scale || 1) * 0.62); grig.baby = true; }
        else grig.group.scale.setScalar(scale || 1);
        grig.type = type;
        grig.age = asAge(age);
        return grig;
      } catch (e) { console.warn('[GLB] 构建失败，回退代码模型：' + type, e); }
    }
    var fn = BODIES[type] || BODIES.chicken;
    var prev = curAge;
    curAge = asAge(age);
    var rig = fn();
    curAge = prev;
    if (asAge(age) === 'baby') applyBaby(rig);
    rig.type = type;
    rig.age = asAge(age);
    rig.group.scale.setScalar(scale || 1);
    return rig;
  };

  M.buildHead = function (type) {
    var g = new THREE.Group();
    var rig = newRig(g, type);
    (HEADS[type] || HEADS.chicken)(g, rig);
    return g;
  };

  M.buildTool = function (key) {
    if (key && key.indexOf('seed_') === 0) return buildSeedPack(key.slice(5));
    return (TOOL_BUILD[key] || buildHoe)();
  };

  /** 按等级构建围栏 / 加工机（lv = 1~5，越界自动收敛） */
  M.buildFenceByLevel = function (lv) { return buildFenceByLevel(lv); };
  M.buildMachineByLevel = function (kind, lv) { return buildMachineByLevel(kind, lv); };
  M.MACHINE_KINDS = MACHINE_KINDS;

  /** 待生成资源清单 */
  M.assetList = function () {
    var list = [];
    ANIMALS.forEach(function (t) {
      list.push({ kind: 'head', animal: t, path: 'assets/animals/' + t + '.png', size: 320, fit: 1.66, yaw: 0.5 });
    });
    ANIMALS.forEach(function (t) {
      list.push({ kind: 'rig', animal: t, path: 'assets/preview/' + t + '.png', size: 320, fit: 2.3, yaw: 0.55 });
    });
    // 幼年全身（与成年同角度，便于直接对照）
    ANIMALS.forEach(function (t) {
      list.push({ kind: 'rig', animal: t, age: 'baby', path: 'assets/preview/' + t + '_baby.png', size: 320, fit: 2.06, yaw: 0.55 });
    });
    // 三视图：成年 / 幼年 × 正面 / 侧面 / 背面（9 种 × 2 年龄 × 3 视图 = 54 张）
    AGES.forEach(function (age) {
      ANIMALS.forEach(function (t) {
        VIEWS.forEach(function (v) {
          list.push({
            kind: 'rig', animal: t, age: age, view: v,
            path: 'assets/views/' + age + '/' + t + '_' + v + '.png',
            size: 360, fit: age === 'baby' ? 2.02 : 2.3, yaw: VIEW_YAW[v], cam: VIEW_CAM
          });
        });
      });
    });
    var ICON_YAW = { bed: 0.62, barn: 0.55, fence: 0.5, wateringcan: 0.34, sickle: 0.3, hoe: 0.3 };
    TOOLS.forEach(function (k) {
      list.push({ kind: 'tool', key: k, path: 'assets/icons/' + k + '.png', size: 320, fit: 1.62, yaw: ICON_YAW[k] === undefined ? 0.34 : ICON_YAW[k] });
    });
    SEEDS.forEach(function (k) {
      list.push({ kind: 'tool', key: 'seed_' + k, path: 'assets/icons/seed_' + k + '.png', size: 320, fit: 1.66, yaw: 0.3 });
    });
    // 海产图鉴鱼类：正面侧视，保证「每种造型一眼可辨」
    FISH_KEYS.forEach(function (k) {
      list.push({ kind: 'tool', key: 'fish_' + k, path: 'assets/icons/fish_' + k + '.png', size: 320, fit: 1.7, yaw: 0, cam: [0.05, 0.12, 1] });
    });
    // 飞禽伙伴图标：老鹰 / 鸬鹚（正式 3D 模型渲染）
    PET_KEYS.forEach(function (k) {
      list.push({ kind: 'tool', key: 'pet_' + k, path: 'assets/icons/pet_' + k + '.png', size: 352, fit: 1.95, yaw: 0.5, cam: [0.06, 0.3, 1] });
    });
    // 商店商品 / 产物 / 海产小物
    GOODS_KEYS.forEach(function (k) {
      list.push({ kind: 'tool', key: 'goods_' + k, path: 'assets/icons/goods_' + k + '.png', size: 320, fit: 1.66, yaw: 0.4 });
    });
    // 爱心三档（低灰 / 中黄 / 高红）
    HEART_KEYS.forEach(function (k) {
      list.push({ kind: 'tool', key: 'heart_' + k, path: 'assets/icons/heart_' + k + '.png', size: 256, fit: 1.6, yaw: 0.25, cam: [0.1, 0.3, 1] });
    });
    // 底部导航图标：不走生成器（上轮教训：生成器产出的简版图标是倒退）。
    // 9 张图标手工从确认稿 ui-icons 图裁切（tools/crop-nav-icons.py），
    // manifest 里的 nav_* 条目由渲染脚本补写，assetList 不再产出 nav_*。
    // 素材总览图
    list.push({ kind: 'sheet', path: 'assets/overview/sheet.png', w: 2300, h: 1500 });
    // 三视图总览：由页面把上面已渲染的 54 张三视图拼成一张「每列一只动物」的对比大图
    list.push({ kind: 'viewsheet', path: 'assets/overview/views_sheet.png', w: 2560, h: 1820 });
    return list;
  };

  var iconRenderer = null;

  function getRenderer(w, h) {
    if (!iconRenderer) {
      var canvas = document.createElement('canvas');
      iconRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      if (THREE.sRGBEncoding) iconRenderer.outputEncoding = THREE.sRGBEncoding;
      if (THREE.ACESFilmicToneMapping) {
        iconRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        iconRenderer.toneMappingExposure = 1.08;
      }
      iconRenderer.setClearAlpha(0);
    }
    iconRenderer.setPixelRatio(1);
    iconRenderer.setSize(w, h || w, false);
    return iconRenderer;
  }

  /** 真实 Three.js 离屏渲染 → PNG dataURL（kind: head / rig / tool / sheet） */
  M.renderToPNG = function (item) {
    if (item.kind === 'sheet') return renderSheet(item);
    var fit = item.fit || 1.6;
    var size = item.size || 256;
    var rnd = getRenderer(size);
    var scene = new THREE.Scene();
    // 头像：有 GLB 就用 GLB 全身 + 头部带取景（见下方 focus），没有则用代码拼头像；
    //   buildHead 保持代码版，只供素材总览图 sheet.png 的头行使用。
    var obj = item.kind === 'head'
      ? ((glbCache[item.animal] && glbCache[item.animal].ok) ? M.buildAnimal(item.animal, 1).group : M.buildHead(item.animal))
      : item.kind === 'rig' ? M.buildAnimal(item.animal, 1, item.age).group
        : M.buildTool(item.key);

    var bb = new THREE.Box3().setFromObject(obj);
    var c = bb.getCenter(new THREE.Vector3());
    var sz = bb.getSize(new THREE.Vector3());
    var maxDim = Math.max(sz.x, sz.y, sz.z) || 1;

    var holder = new THREE.Group();
    holder.add(obj);
    var focus = null;
    if (item.kind === 'head' && GLB_DEFS[item.animal] && glbCache[item.animal] && glbCache[item.animal].ok) focus = GLB_DEFS[item.animal].head;
    if (focus) {
      // GLB 头像只取头部带：头部中心移到原点、按头部高度定缩放，身体自然裁出画面外
      var cy = bb.min.y + sz.y * (focus[0] + focus[1]) / 2;
      var cz = bb.max.z - sz.z * 0.15;
      obj.position.set(-c.x, -cy, -cz);
      var headH = Math.max(0.3, sz.y * (focus[1] - focus[0]));
      holder.scale.setScalar(fit / headH);
    } else {
      obj.position.set(obj.position.x - c.x, obj.position.y - c.y, obj.position.z - c.z);
      var effMax = maxDim;
      if (item.kind === 'rig' && !item.view) effMax = Math.max(sz.y, sz.x, sz.z * 0.6);
      holder.scale.setScalar(fit / effMax);
      // GLB 幼年是等比缩小 0.62（无四肢缩短/头放大），取景归一化会抹掉它：
      // 这里再乘 0.62，让幼年渲染在框里确实更小，与成年形成对照。
      if (item.age === 'baby' && item.kind === 'rig' && glbCache[item.animal] && glbCache[item.animal].ok) holder.scale.multiplyScalar(0.62);
    }
    holder.rotation.y = item.yaw === undefined ? 0.45 : item.yaw;
    scene.add(holder);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xe4eedd, 0.48));
    var dir = new THREE.DirectionalLight(0xfff6e6, 0.5);
    dir.position.set(2.2, 3.6, 4.2);
    scene.add(dir);
    var fill = new THREE.DirectionalLight(0xdfeeff, 0.28);
    fill.position.set(-3.4, 1.6, 1.6);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.36));

    var cam = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    var dist = fit / (2 * Math.tan(16 * Math.PI / 180)) / 0.8;
    var cd = item.cam || (focus && GLB_DEFS[item.animal] && GLB_DEFS[item.animal].headCam) || [0.42, 0.6, 1];
    cam.position.set(cd[0], cd[1], cd[2]).normalize().multiplyScalar(dist);
    cam.lookAt(0, 0, 0);

    // 图标用平坦色阶 + 不做 ACES 色调映射，保证颜色真实、特征清晰
    M.setShading('icon');
    var prevTM = rnd.toneMapping;
    var prevExp = rnd.toneMappingExposure;
    rnd.toneMapping = THREE.NoToneMapping;
    rnd.render(scene, cam);
    rnd.toneMapping = prevTM;
    rnd.toneMappingExposure = prevExp;
    M.setShading('scene');
    return rnd.domElement.toDataURL('image/png');
  };

  M.assetCount = function () { return M.assetList().length; };

  /* ============================================================
   *  第二批素材：海产鱼类 / 商店商品 / 爱心三档 / 导航图标 / 素材总览图
   *  全部由同一套 Three.js 模型离屏渲染成 PNG（禁 emoji、禁手绘 SVG）。
   * ============================================================ */

  /* ---------- 通用几何工具 ---------- */

  /** 平滑闭合轮廓：给一组点即得圆润剪影（鱼身 / 鱼鳍 / 贝壳 / 海星都用它） */
  function blobShape(pts) {
    var sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    var rest = [];
    for (var i = 1; i < pts.length; i++) rest.push(new THREE.Vector2(pts[i][0], pts[i][1]));
    sh.splineThru(rest);
    sh.closePath();
    return sh;
  }

  /** 薄板挤出件（鱼鳍 / 板状零件） */
  function plate(parent, pts, depth, color, pos, rot, scale) {
    return part(parent, extrudeGeo(blobShape(pts), depth, 0.008), toon(color), pos, scale, rot);
  }

  function darken(hex, f) {
    var col = new THREE.Color(hex);
    col.multiplyScalar(f === undefined ? 0.66 : f);
    return col.getHex();
  }

  /** 鱼眼：左右各一只，白眼球 + 瞳孔 + 高光 */
  function fishEyes(g, x, y, halfDepth, r) {
    for (var s = -1; s <= 1; s += 2) {
      var eg = new THREE.Group();
      eg.position.set(x, y, s * (halfDepth + 0.012));
      eg.rotation.y = s * 0.16;
      g.add(eg);
      part(eg, sph(r * 1.2, 14), ink(0xffffff), [0, 0, 0], [1, 1, 0.5]);
      part(eg, sph(r, 12), ink(0x2b2320), [0, 0, r * 0.34], [1, 1.02, 0.8]);
      part(eg, sph(r * 0.34, 8), ink(0xffffff), [r * 0.3, r * 0.3, r * 0.66]);
    }
  }

  /** 尾鳍：叉尾 / 扇尾 / 弯月尾 / 尖尾 */
  function fishTail(g, kind, color, halfDepth, x, size) {
    var m = toon(color), s;
    if (kind === 'fork') {
      for (s = -1; s <= 1; s += 2) {
        part(g, con(size * 0.34, size * 1.05, 7), m,
          [x - size * 0.34, s * size * 0.14, 0], [1, 1, 0.42], [0, 0, Math.PI / 2 + s * 0.5]);
      }
    } else if (kind === 'fan') {
      part(g, cyl(size * 0.95, size * 0.22, size * 1.5, 14), m,
        [x - size * 0.7, 0, 0], [1, 1, halfDepth * 2.8], [0, 0, Math.PI / 2]);
    } else if (kind === 'crescent') {
      part(g, extrudeGeo(arcBladeShape(size * 0.62, size * 0.4, 2.3, 4.0, 16), 0.05, 0.008), m, [x, 0, 0]);
    } else {
      part(g, con(size * 0.3, size * 0.85, 6), m, [x - size * 0.3, 0, 0], [1, 1, 0.4], [0, 0, Math.PI / 2]);
    }
  }

  /* ---------- 鱼类：每种独立造型（萌版 3D） ---------- */

  var FISH_SPEC = {
    crucian: {
      // 鲫鱼：淡蓝灰侧扁小身，银白鳞点
      name: '鲫鱼', color: 0x5f7ba6, belly: 0xdfe9f6, halfDepth: 0.13,
      body: [[0.9, 0], [0.56, 0.38], [0.04, 0.5], [-0.46, 0.38], [-0.78, 0.16], [-0.84, 0], [-0.78, -0.16], [-0.46, -0.38], [0.04, -0.5], [0.56, -0.38]],
      dorsal: [[0.36, 0.44], [0.02, 0.8], [-0.4, 0.34]], finColor: 0xa7b2c2,
      tail: 'fork', tailColor: 0xa7b2c2, tailSize: 0.44, eye: [0.58, 0.1, 0.12],
      scaleColor: 0xb9cbe0, extras: ['mouth', 'scale']
    },
    carp: {
      // 鲤鱼：橘黄发亮 + 深棕大斑块 + 一对口须 + 金色鳞
      name: '鲤鱼', color: 0xd85a1e, belly: 0xffe4bd, halfDepth: 0.15,
      body: [[1.05, 0], [0.7, 0.34], [0.1, 0.44], [-0.5, 0.4], [-0.9, 0.18], [-0.96, 0], [-0.9, -0.18], [-0.5, -0.4], [0.1, -0.44], [0.7, -0.34]],
      dorsal: [[0.5, 0.38], [0.1, 0.88], [-0.5, 0.32]], finColor: 0xd45a1c,
      tail: 'fan', tailColor: 0xd45a1c, tailSize: 0.5, eye: [0.66, 0.1, 0.085],
      scaleColor: 0xffd07a, blotchColor: 0x6b3f1c,
      extras: ['barbel', 'scale', 'blotch']
    },
    grasscarp: {
      // 草鱼：翠绿长流线身，浅绿鳞，圆头无斑
      name: '草鱼', color: 0x4aab52, belly: 0xeaf6dc, halfDepth: 0.14,
      body: [[1.22, 0], [0.82, 0.27], [0.1, 0.34], [-0.55, 0.3], [-0.95, 0.13], [-1.02, 0], [-0.95, -0.13], [-0.55, -0.3], [0.1, -0.34], [0.82, -0.27]],
      dorsal: [[0.5, 0.3], [0.05, 0.7], [-0.55, 0.26]], finColor: 0x3f8f47,
      tail: 'fork', tailColor: 0x3f8f47, tailSize: 0.48, eye: [0.72, 0.08, 0.085],
      scaleColor: 0xd6efb8, extras: ['mouth', 'scale']
    },
    silvercarp: {
      // 鲢鱼：银白圆润大头，小黑点
      name: '鲢鱼', color: 0xc2d0dd, belly: 0xffffff, halfDepth: 0.17,
      body: [[1.0, 0], [0.68, 0.44], [0.02, 0.64], [-0.5, 0.48], [-0.88, 0.2], [-0.94, 0], [-0.88, -0.2], [-0.5, -0.48], [0.02, -0.64], [0.68, -0.44]],
      dorsal: [[0.38, 0.58], [0.0, 1.02], [-0.46, 0.44]], finColor: 0xdde6ee,
      tail: 'fork', tailColor: 0xcfdae4, tailSize: 0.5, eye: [0.6, 0.2, 0.12],
      extras: ['dots']
    },
    snakehead: {
      // 黑鱼：深灰修长身 + 黑白横带 + 大嘴
      name: '黑鱼', color: 0x2b3338, belly: 0xdde3e0, halfDepth: 0.13,
      body: [[1.3, 0], [0.88, 0.24], [0.1, 0.3], [-0.58, 0.27], [-1.0, 0.12], [-1.1, 0], [-1.0, -0.12], [-0.58, -0.27], [0.1, -0.3], [0.88, -0.24]],
      dorsal: [[0.64, 0.26], [0.1, 0.56], [-0.64, 0.2]], finColor: 0x262e34,
      tail: 'fan', tailColor: 0x262e34, tailSize: 0.46, eye: [0.74, 0.06, 0.08],
      bandColor: 0xc9d6d0, extras: ['band', 'bigmouth']
    },
    catfish: {
      // 鲶鱼：灰褐光滑无鳞身 + 长须
      name: '鲶鱼', color: 0x69543b, belly: 0xe6d9c0, halfDepth: 0.17,
      body: [[1.1, 0.04], [0.76, 0.3], [0.1, 0.34], [-0.5, 0.28], [-0.9, 0.12], [-0.98, 0], [-0.9, -0.12], [-0.5, -0.28], [0.1, -0.34], [0.76, -0.3]],
      dorsal: [[0.5, 0.26], [0.02, 0.5], [-0.5, 0.2]], finColor: 0x554430,
      tail: 'fan', tailColor: 0x554430, tailSize: 0.42, eye: [0.66, 0.14, 0.075],
      barbelColor: 0xd8c9a8, extras: ['barbel4', 'mouth']
    },
    yellowcat: {
      // 黄颡鱼：金黄身 + 深色横带 + 背刺 + 须
      name: '黄颡鱼', color: 0xf7cb1e, belly: 0xfbeaa8, halfDepth: 0.15,
      body: [[1.02, 0], [0.68, 0.36], [0.05, 0.46], [-0.5, 0.38], [-0.86, 0.16], [-0.94, 0], [-0.86, -0.16], [-0.5, -0.38], [0.05, -0.46], [0.68, -0.36]],
      dorsal: [[0.5, 0.42], [0.1, 0.92], [-0.5, 0.36]], finColor: 0xd8a411,
      tail: 'fork', tailColor: 0xd8a411, tailSize: 0.46, eye: [0.62, 0.12, 0.09],
      bandColor: 0x4a3a1a, barbelColor: 0xa88a44, extras: ['band', 'spike', 'barbel4']
    },
    mandarin: {
      // 鳜鱼：褐黄底 + 大块深斑 + 高背刺 + 大嘴
      name: '鳜鱼', color: 0x5d5c2b, belly: 0xece0b0, halfDepth: 0.17,
      body: [[1.0, 0], [0.66, 0.46], [0.0, 0.6], [-0.5, 0.46], [-0.88, 0.2], [-0.94, 0], [-0.88, -0.2], [-0.5, -0.46], [0.0, -0.6], [0.66, -0.46]],
      dorsal: [[0.5, 0.52], [0.05, 0.98], [-0.5, 0.44]], finColor: 0xb8862a,
      tail: 'fan', tailColor: 0xb8862a, tailSize: 0.5, eye: [0.58, 0.16, 0.105],
      blotchColor: 0x46331b, extras: ['blotch', 'bigmouth', 'spike']
    },
    trout: {
      name: '鳟鱼', color: 0x6fae9a, belly: 0xf2f7e8, halfDepth: 0.13,
      body: [[1.08, 0.06], [0.66, 0.34], [0.05, 0.42], [-0.55, 0.34], [-0.9, 0.14], [-0.96, 0], [-0.9, -0.14], [-0.55, -0.32], [0.05, -0.4], [0.66, -0.32]],
      dorsal: [[0.36, 0.36], [0.0, 0.76], [-0.44, 0.3]], finColor: 0x5d9c8a,
      tail: 'fork', tailColor: 0x5d9c8a, tailSize: 0.44, eye: [0.64, 0.1, 0.09],
      extras: ['spots']
    },
    bass: {
      name: '鲈鱼', color: 0x7f9a52, belly: 0xf6f0d8, halfDepth: 0.16,
      body: [[1.02, 0.02], [0.7, 0.4], [0.05, 0.52], [-0.55, 0.4], [-0.9, 0.16], [-0.96, 0], [-0.9, -0.16], [-0.55, -0.4], [0.05, -0.52], [0.7, -0.4]],
      dorsal: [[0.55, 0.42], [0.25, 0.86], [0.0, 0.42]], finColor: 0x6b8443,
      tail: 'fork', tailColor: 0x6b8443, tailSize: 0.5, eye: [0.62, 0.12, 0.1],
      extras: ['bigmouth', 'spike']
    },
    bream: {
      name: '鲷鱼', color: 0xf28fa0, belly: 0xffdfe6, halfDepth: 0.14,
      body: [[1.0, 0], [0.62, 0.5], [0.0, 0.64], [-0.5, 0.48], [-0.86, 0.2], [-0.92, 0], [-0.86, -0.2], [-0.5, -0.48], [0.0, -0.64], [0.62, -0.5]],
      dorsal: [[0.44, 0.56], [0.0, 1.02], [-0.5, 0.44]], finColor: 0xe8708a,
      tail: 'fork', tailColor: 0xe8708a, tailSize: 0.46, eye: [0.6, 0.12, 0.12],
      extras: ['mouth']
    },
    salmon: {
      name: '鲑鱼', color: 0xf07a56, belly: 0xffe0cc, halfDepth: 0.17,
      body: [[1.1, 0.02], [0.7, 0.38], [0.05, 0.48], [-0.55, 0.4], [-0.9, 0.16], [-0.96, 0], [-0.9, -0.16], [-0.55, -0.4], [0.05, -0.48], [0.7, -0.38]],
      dorsal: [[0.4, 0.42], [0.0, 0.84], [-0.48, 0.32]], finColor: 0xd9603f,
      tail: 'fan', tailColor: 0xd9603f, tailSize: 0.55, eye: [0.62, 0.1, 0.095],
      extras: ['hook', 'stripe']
    },
    puffer: { name: '河豚' },
    squid: { name: '乌贼' },
    eel: { name: '鳗鱼' },
    octopus: { name: '章鱼' }
  };

  function fishExtra(g, sp, name) {
    var s, i;
    if (name === 'mouth') {
      part(g, sph(0.06, 8), ink(0x9a7a6a), [1.0, -0.05, 0], [1, 0.7, 0.85]);
    } else if (name === 'barbel') {
      var baCol = sp.barbelColor === undefined ? 0xd98b2c : sp.barbelColor;
      for (s = -1; s <= 1; s += 2) {
        part(g, cyl(0.014, 0.02, 0.36, 6), toon(baCol), [0.96, -0.1, s * 0.05], null, [0, 0, 1.95]);
      }
    } else if (name === 'barbel4') {
      // 鲶鱼 / 黄颡鱼：两对长须
      var baCol2 = sp.barbelColor === undefined ? 0xd8c9a8 : sp.barbelColor;
      for (s = -1; s <= 1; s += 2) {
        part(g, cyl(0.012, 0.018, 0.5, 6), toon(baCol2), [0.94, -0.12, s * 0.07], null, [0, 0, 1.98]);
        part(g, cyl(0.01, 0.014, 0.34, 6), toon(baCol2), [0.84, -0.2, s * 0.13], null, [0, 0.35 * s, 2.5]);
      }
    } else if (name === 'scale') {
      var scCol = sp.scaleColor === undefined ? 0xffd07a : sp.scaleColor;
      [[0.42, 0.16], [-0.06, 0.2], [-0.5, 0.14], [0.18, 0.26]].forEach(function (p) {
        for (var k = -1; k <= 1; k += 2) {
          part(g, sph(0.1, 10), toon(scCol), [p[0], p[1], k * sp.halfDepth * 0.72], [1, 1, 0.34]);
        }
      });
    } else if (name === 'spots') {
      [[0.34, 0.14], [-0.06, 0.2], [-0.46, 0.12], [0.6, -0.06], [-0.3, -0.12]].forEach(function (p) {
        for (var k = -1; k <= 1; k += 2) {
          part(g, sph(0.075, 8), ink(0x3f6b58), [p[0], p[1], k * sp.halfDepth * 0.76], [1, 1, 0.3]);
        }
      });
    } else if (name === 'blotch') {
      // 大块深色斑（鲤鱼 / 鳜鱼）
      var blCol = sp.blotchColor === undefined ? 0x5a3a1e : sp.blotchColor;
      [[0.5, 0.2, 0.16], [0.14, 0.32, 0.19], [-0.28, 0.18, 0.17], [-0.62, 0.02, 0.13], [0.32, -0.18, 0.12]].forEach(function (p) {
        for (var k = -1; k <= 1; k += 2) {
          part(g, sph(p[2], 10), toon(blCol), [p[0], p[1], k * sp.halfDepth * 0.72], [1.25, 0.82, 0.3]);
        }
      });
    } else if (name === 'dots') {
      // 细小麻点（鲢鱼）
      [[0.5, 0.24], [0.24, 0.38], [-0.06, 0.28], [-0.42, 0.34], [-0.68, 0.16], [0.38, -0.16], [-0.2, -0.2]].forEach(function (p) {
        for (var k = -1; k <= 1; k += 2) {
          part(g, sph(0.055, 8), ink(0x6b7480), [p[0], p[1], k * sp.halfDepth * 0.78], [1, 1, 0.28]);
        }
      });
    } else if (name === 'band') {
      // 竖向横带（黑鱼 / 黄颡鱼）
      var bdCol = sp.bandColor === undefined ? 0x2f3a44 : sp.bandColor;
      for (var bi = -2; bi <= 2; bi++) {
        for (var bk = -1; bk <= 1; bk += 2) {
          part(g, sph(0.13, 10), toon(bdCol), [bi * 0.42, 0.02, bk * sp.halfDepth * 0.74], [0.3, 1.35, 0.2]);
        }
      }
    } else if (name === 'bigmouth') {
      plate(g, [[1.04, 0.02], [0.7, 0.18], [0.7, -0.16]], sp.halfDepth * 2.06, 0x5b4a3c, [0, 0, -sp.halfDepth * 1.03]);
    } else if (name === 'spike') {
      var d = sp.dorsal;
      for (i = 0; i < 5; i++) {
        var t = i / 4;
        part(g, con(0.062, 0.26, 5), toon(sp.finColor),
          [d[0][0] + (d[1][0] - d[0][0]) * t, d[0][1] + (d[1][1] - d[0][1]) * t, 0], null, [0, 0, -0.62]);
      }
    } else if (name === 'hook') {
      part(g, con(0.085, 0.3, 7), toon(0xf1eee6), [1.0, -0.14, 0], [1, 1, 0.5], [0, 0, -2.4]);
    } else if (name === 'stripe') {
      for (i = -2; i <= 2; i++) {
        for (s = -1; s <= 1; s += 2) {
          part(g, sph(0.1, 8), toon(0xffd9c0), [i * 0.34, 0.02, s * sp.halfDepth * 0.7], [0.3, 1.4, 0.22]);
        }
      }
    }
  }

  function buildFish(key) {
    var sp = FISH_SPEC[key] || FISH_SPEC.crucian;
    var g = new THREE.Group();
    var body = part(g, extrudeGeo(blobShape(sp.body), sp.halfDepth * 2, 0.02), toon(sp.color), [0, 0, -sp.halfDepth]);
    outline(body, 1.05, 0x4a4038);
    part(g, sph(0.42, 16), toon(sp.belly), [0.08, -0.28, 0], [1.4, 0.4, sp.halfDepth * 2.0]);
    if (sp.dorsal) plate(g, sp.dorsal, sp.halfDepth * 0.9, sp.finColor, [0, 0, 0]);
    for (var s = -1; s <= 1; s += 2) {
      part(g, sph(0.17, 10), toon(sp.finColor), [0.34, -0.2, s * (sp.halfDepth + 0.015)], [1.15, 0.5, 0.24], [0, 0, -0.55]);
    }
    fishTail(g, sp.tail, sp.tailColor, sp.halfDepth, -0.92, sp.tailSize);
    (sp.extras || []).forEach(function (n) { fishExtra(g, sp, n); });
    fishEyes(g, sp.eye[0], sp.eye[1], sp.halfDepth, sp.eye[2]);
    return g;
  }

  /** 河豚：圆滚滚带刺 */
  function buildPuffer() {
    var g = new THREE.Group();
    var body = part(g, sph(0.62, 20), toon(0xf7e6a8), [0, 0, 0], [1.06, 1.0, 0.74]);
    outline(body, 1.05, 0x8a6b2a);
    part(g, sph(0.4, 14), toon(0xfffbe8), [0.34, -0.18, 0], [1.2, 0.66, 0.62]);
    [[1, 0.25], [0.66, 0.85], [-0.15, 1], [-0.82, 0.66], [-1, 0], [0.85, -0.62], [-0.3, -0.95], [0.55, -0.85]].forEach(function (d) {
      var len = Math.sqrt(d[0] * d[0] + d[1] * d[1]) || 1;
      part(g, con(0.075, 0.3, 6), toon(0xe0b855),
        [0.6 * d[0] / len, 0.58 * d[1] / len, 0], null, [0, 0, -Math.atan2(d[0] / len, d[1] / len)]);
    });
    fishTail(g, 'fork', 0xe0b855, 0.16, -0.6, 0.34);
    fishEyes(g, 0.42, 0.16, 0.46, 0.14);
    part(g, sph(0.1, 10), ink(0xd07a6a), [0.68, -0.12, 0], [1, 0.8, 0.9]);
    return g;
  }

  /** 乌贼：尖筒身体 + 三角鳍 + 触手 */
  function buildSquid() {
    var g = new THREE.Group(), s, i, k;
    var mantle = part(g, cyl(0.05, 0.42, 1.1, 14), toon(0xf1c9d8), [0, 0.34, 0], [1, 1, 0.82]);
    outline(mantle, 1.05, 0xb07a92);
    for (s = -1; s <= 1; s += 2) {
      part(g, con(0.26, 0.5, 3), toon(0xe8aec4), [0, 0.8, s * 0.2], [1, 1, 0.14], [0.42 * s, 0, 0]);
    }
    part(g, sph(0.4, 16), toon(0xf6dde6), [0, -0.34, 0], [1.05, 0.95, 0.95]);
    for (s = -1; s <= 1; s += 2) {
      var eg = new THREE.Group();
      eg.position.set(0.16, -0.3, s * 0.33);
      g.add(eg);
      part(eg, sph(0.16, 14), ink(0xffffff), [0, 0, 0], [1, 1, 0.55]);
      part(eg, sph(0.1, 12), ink(0x2b2320), [0, -0.01, s * 0.07], [1, 1, 0.8]);
      part(eg, sph(0.035, 8), ink(0xffffff), [0.02, 0.04, s * 0.13]);
    }
    for (i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      for (k = 0; k < 3; k++) {
        var t = (k + 1) / 3;
        part(g, sph(0.12 - k * 0.025, 10), toon(0xe8aec4),
          [Math.cos(a) * 0.3 * (0.6 + t), -0.62 - t * 0.5, Math.sin(a) * 0.3 * (0.6 + t)], [1, 1.5, 1]);
      }
    }
    return g;
  }

  /** 鳗鱼：细长流线体 + 连续背鳍 + 弯月尾鳍 + 胸鳍 */
  function buildEel() {
    var g = new THREE.Group(), i, s;
    var N = 16, pts = [];
    for (i = 0; i <= N; i++) {
      var t = i / N;
      pts.push([
        1.05 - t * 2.15,
        Math.sin(t * Math.PI * 1.25) * 0.24,
        0.225 * (1 - 0.45 * t) * (t < 0.12 ? 0.8 + t * 1.7 : 1)
      ]);
    }
    pts.forEach(function (p, idx) {
      var m = part(g, sph(p[2], 16), toon(0x6f8f4a), [p[0], p[1], 0], [1.25, 1, 1]);
      if (idx === 0) outline(m, 1.06, 0x415330);
      if (idx % 2 === 0) part(g, sph(p[2] * 0.55, 10), toon(0xe8ddb0), [p[0], p[1] - p[2] * 0.62, 0], [1.25, 0.45, 1]);
    });
    // 连续背鳍：一条贴合脊背的鳍带
    var fin = new THREE.Shape();
    fin.moveTo(pts[0][0], pts[0][1] + pts[0][2] * 0.86);
    for (i = 1; i <= N; i++) fin.lineTo(pts[i][0], pts[i][1] + pts[i][2] * 0.86);
    for (i = N; i >= 0; i--) {
      var h = 0.22 * Math.sin(Math.PI * (i / N));
      fin.lineTo(pts[i][0], pts[i][1] + pts[i][2] * 0.86 + h);
    }
    part(g, extrudeGeo(fin, 0.07, 0.02), toon(0x9cbb6c), [0, 0, -0.035]);
    // 尾鳍（弯月）+ 胸鳍
    fishTail(g, 'crescent', 0x8fae5e, pts[N][2], pts[N][0] - 0.24, 0.36);
    for (s = -1; s <= 1; s += 2) {
      part(g, sph(0.15, 10), toon(0x9cbb6c), [0.76, -0.14, s * pts[2][2] * 0.85], [1.05, 0.5, 0.24], [0, 0, -0.5]);
    }
    // 头 + 嘴 + 眼
    part(g, sph(0.25, 16), toon(0x6f8f4a), [1.05, 0, 0], [1.05, 0.95, 0.85]);
    part(g, sph(0.07, 8), ink(0xd8c27a), [1.26, -0.02, 0], [1, 0.7, 0.75]);
    fishEyes(g, 0.96, 0.16, pts[0][2] * 0.95, 0.085);
    return g;
  }

  /** 章鱼：大圆头 + 8 触手 + 腮红 */
  function buildOctopus() {
    var g = new THREE.Group(), i, k, s;
    var head = part(g, sph(0.6, 20), toon(0xf07a8f), [0, 0.28, 0], [1.05, 1.0, 0.95]);
    outline(head, 1.05, 0xb04a5e);
    part(g, sph(0.34, 14), toon(0xffc2ce), [0.28, 0.08, 0.34], [1, 0.9, 0.5]);
    for (i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      for (k = 0; k < 3; k++) {
        var t = (k + 1) / 3;
        part(g, sph(0.14 - k * 0.03, 10), toon(0xef7288),
          [Math.cos(a) * 0.42 * (0.6 + t), -0.22 - t * 0.62, Math.sin(a) * 0.42 * (0.6 + t)], [1, 1.3, 1]);
      }
    }
    for (s = -1; s <= 1; s += 2) {
      var eg = new THREE.Group();
      eg.position.set(0.26, 0.42, s * 0.5);
      g.add(eg);
      part(eg, sph(0.19, 14), ink(0xffffff), [0, 0, 0], [1, 1, 0.5]);
      part(eg, sph(0.12, 12), ink(0x2b2320), [0.02, -0.01, s * 0.09], [1, 1, 0.8]);
      part(eg, sph(0.045, 8), ink(0xffffff), [0.06, 0.05, s * 0.14]);
      part(eg, sph(0.07, 8), ink(0xff9fb0), [-0.04, -0.16, s * 0.16], [1.3, 0.7, 0.3]);
    }
    part(g, sph(0.07, 8), ink(0xa8556a), [0.4, 0.16, 0], [1, 0.7, 0.8]);
    return g;
  }

  /* 8 种淡水鱼在前（鱼塘 / 图鉴用），其后为原有海水鱼类 */
  var FISH_KEYS = ['crucian', 'carp', 'grasscarp', 'silvercarp', 'snakehead', 'catfish', 'yellowcat', 'mandarin',
                   'trout', 'bass', 'bream', 'salmon', 'puffer', 'squid', 'eel', 'octopus'];
  var FISH_BUILD = { puffer: buildPuffer, squid: buildSquid, eel: buildEel, octopus: buildOctopus };
  FISH_KEYS.forEach(function (k) {
    TOOL_BUILD['fish_' + k] = (function (kk) {
      return function () { return (FISH_BUILD[kk] || buildFish)(kk); };
    })(k);
  });

  /* ---------- 飞禽伙伴：老鹰 / 鸬鹚（正式 3D 模型） ---------- */

  /** 猛禽爪：黄色三趾 + 后趾，以髋为原点便于走路动画 */
  function petClaw(parent, x, y, len, color) {
    var hip = new THREE.Group();
    hip.position.set(x, y, 0);
    parent.add(hip);
    part(hip, cyl(0.045, 0.05, len, 8), toon(color), [0, -len / 2, 0]);
    for (var i = -1; i <= 1; i++) {
      part(hip, cyl(0.022, 0.026, 0.2, 6), toon(color), [i * 0.055, -len - 0.05, 0.08], null, [1.0, 0, i * 0.24]);
    }
    part(hip, cyl(0.02, 0.024, 0.16, 6), toon(color), [0, -len - 0.04, -0.08], null, [-1.0, 0, 0]);
    return hip;
  }

  /** 水禽蹼足：橙黄短腿 + 扁蹼 */
  function petWebFoot(parent, x, y, len, color) {
    var hip = new THREE.Group();
    hip.position.set(x, y, 0);
    parent.add(hip);
    part(hip, cyl(0.05, 0.055, len, 8), toon(color), [0, -len / 2, 0]);
    part(hip, box(0.24, 0.05, 0.3), toon(color), [0, -len - 0.015, 0.11]);
    return hip;
  }

  /** 老鹰：米白头颈 + 深棕背翅 + 浅杏黄胸腹 + 黄色弯钩喙与利爪 */
  function petEagleRig() {
    var g = new THREE.Group(), s;
    var rig = newRig(g, 'eagle');
    var FEATHER = 0x8b5a2b, FEATHER_D = 0x6b4520, HEAD = 0xf6f1e6, BELLY = 0xf6d7a0, BEAK = 0xf5c731;
    rig.parts.legs = [petClaw(g, -0.16, 0.26, 0.08, BEAK), petClaw(g, 0.16, 0.26, 0.08, BEAK)];
    // 躯干：紧凑团状（背深棕）
    var body = part(g, sph(0.5, 22), toon(FEATHER), [0, 0.72, -0.02], [0.94, 0.98, 1.08]);
    outlineOf(body, 1.04, 0.6);
    rig.parts.body = body;
    // 浅杏黄胸腹
    var belly = part(g, sph(0.36, 16), toon(BELLY), [0, 0.66, 0.26], [0.88, 0.92, 0.7]);
    outlineOf(belly, 1.05, 0.86);
    // 收拢双翅：沿体侧向后抱身，翅尖深棕（辨识点）
    rig.parts.wings = [];
    for (s = -1; s <= 1; s += 2) {
      var wing = part(g, sph(0.3, 16), toon(FEATHER), [s * 0.35, 0.74, -0.08], [0.5, 0.88, 1.14], [0, s * 0.16, 0]);
      outlineOf(wing, 1.05, 0.6);
      var tip = part(g, con(0.13, 0.5, 8), toon(FEATHER_D), [s * 0.4, 0.58, -0.46], [1, 0.9, 0.5], [1.95, 0, 0]);
      outlineOf(tip, 1.06, 0.6);
      rig.parts.wings.push(wing);
    }
    // 尾羽：深棕扇形
    var tail = part(g, con(0.3, 0.62, 10), toon(FEATHER_D), [0, 0.6, -0.54], [1.15, 1, 0.34], [1.62, 0, 0]);
    outlineOf(tail, 1.05, 0.6);
    rig.parts.tail = tail;
    // 头：米白圆头 + 深色后颈羽 + 黄色弯钩喙
    var head = new THREE.Group();
    head.position.set(0, 1.16, 0.12);
    g.add(head);
    var skull = part(head, sph(0.42, 22), toon(HEAD), [0, 0.02, 0], [1.0, 1.0, 1.05]);
    outlineOf(skull, 1.05, 0.62);
    part(head, sph(0.17, 12), toon(FEATHER), [0, 0.34, -0.24], [1.2, 0.7, 1.0]);
    var beak = part(head, con(0.14, 0.36, 10), toon(BEAK), [0, -0.05, 0.4], [1, 1, 0.9], [1.45, 0, 0]);
    outlineOf(beak, 1.08, 0.6);
    part(head, sph(0.075, 10), toon(0xd8a516), [0, -0.16, 0.53], [1, 0.9, 1]);
    rig.parts.eyes = makeEyes(head, 0.115, 0.185, 0.06, 0.35, { rotY: 0.2 });
    for (s = -1; s <= 1; s += 2) {
      part(head, box(0.16, 0.045, 0.06), toon(FEATHER_D), [s * 0.19, 0.2, 0.35], null, [0, 0, s * -0.3]);
    }
    rig.parts.head = head;
    return rig;
  }

  /** 鸬鹚：深灰蓝身 + 白色喉胸 + 黄色长直喙带钩 + 橙黄蹼足 */
  function petCormorantRig() {
    var g = new THREE.Group(), s;
    var rig = newRig(g, 'cormorant');
    var COAT = 0x5f6f83, COAT_D = 0x4a5765, THROAT = 0xf2f4ef, BEAK = 0xe8b93c;
    rig.parts.legs = [petWebFoot(g, -0.15, 0.24, 0.08, BEAK), petWebFoot(g, 0.15, 0.24, 0.08, BEAK)];
    var body = part(g, sph(0.46, 22), toon(COAT), [0, 0.78, -0.02], [0.9, 1.06, 1.04]);
    outlineOf(body, 1.04, 0.6);
    rig.parts.body = body;
    var chest = part(g, sph(0.3, 16), toon(THROAT), [0, 0.72, 0.3], [0.72, 0.88, 0.6]);
    outlineOf(chest, 1.05, 0.9);
    // 贴体双翅（潜水用），翅面更深
    rig.parts.wings = [];
    for (s = -1; s <= 1; s += 2) {
      var wing = part(g, sph(0.28, 16), toon(COAT_D), [s * 0.31, 0.78, -0.06], [0.42, 0.94, 1.06], [0, s * 0.14, 0]);
      outlineOf(wing, 1.05, 0.6);
      rig.parts.wings.push(wing);
    }
    // 短尾
    var tail = part(g, con(0.24, 0.54, 10), toon(COAT_D), [0, 0.68, -0.48], [1.1, 1, 0.32], [1.6, 0, 0]);
    outlineOf(tail, 1.05, 0.6);
    rig.parts.tail = tail;
    // 长颈 + 头
    var neck = part(g, cyl(0.17, 0.23, 0.44, 12), toon(COAT), [0, 1.16, 0.1], null, [0.2, 0, 0]);
    outlineOf(neck, 1.05, 0.6);
    var head = new THREE.Group();
    head.position.set(0, 1.42, 0.17);
    g.add(head);
    var skull = part(head, sph(0.3, 20), toon(COAT), [0, 0, 0], [1, 0.96, 1.16]);
    outlineOf(skull, 1.05, 0.6);
    part(head, sph(0.13, 12), toon(THROAT), [0, -0.13, 0.16], [1, 0.86, 1.0]);
    // 长直喙 + 上钩尖
    var beak = part(head, cyl(0.026, 0.075, 0.62, 10), toon(BEAK), [0, -0.02, 0.5], null, [Math.PI / 2, 0, 0]);
    outlineOf(beak, 1.1, 0.6);
    part(head, sph(0.05, 8), toon(0xc9920f), [0, 0.02, 0.8], [1, 0.9, 1.15]);
    for (s = -1; s <= 1; s += 2) {
      part(head, sph(0.11, 10), toon(0xd8a83c), [s * 0.15, 0.05, 0.2], [1, 0.86, 0.5]);
    }
    rig.parts.eyes = makeEyes(head, 0.1, 0.15, 0.06, 0.24, { rotY: 0.22 });
    rig.parts.head = head;
    return rig;
  }

  var PET_KEYS = ['eagle', 'cormorant'];
  var PET_BUILD = { eagle: petEagleRig, cormorant: petCormorantRig };
  PET_KEYS.forEach(function (k) {
    TOOL_BUILD['pet_' + k] = (function (kk) {
      return function () { return PET_BUILD[kk]().group; };
    })(k);
  });

  /** 飞禽伙伴：返回 rig（含 group 与 parts），供场景摆放与动画 */
  M.buildPet = function (key, scale) {
    var rig = (PET_BUILD[key] || PET_BUILD.eagle)();
    rig.group.scale.setScalar(scale || 1);
    return rig;
  };
  M.PET_KEYS = PET_KEYS;

  /* ---------- 商店商品 / 产物 / 海产小物 ---------- */

  function buildMilk() {
    var g = new THREE.Group();
    var body = part(g, cyl(0.34, 0.4, 0.95, 16), toon(0xfdfdff), [0, -0.2, 0]);
    outline(body, 1.04, 0x8e97a3);
    part(g, cyl(0.29, 0.34, 0.46, 16), toon(0xfff4dd), [0, -0.42, 0]);
    part(g, cyl(0.185, 0.32, 0.3, 14), toon(0xfdfdff), [0, 0.4, 0]);
    var cap = part(g, cyl(0.21, 0.21, 0.18, 14), toon(0x74b6e6), [0, 0.62, 0]);
    outline(cap, 1.06, 0x3f6f92);
    part(g, box(0.6, 0.32, 0.05), toon(0x7fc0e8), [0, -0.16, 0.34]);
    part(g, sph(0.09, 10), toon(0xffffff), [0, -0.16, 0.38], [1.4, 0.9, 0.3]);
    return g;
  }

  function buildEgg() {
    var g = new THREE.Group();
    var b = part(g, sph(0.5, 18), toon(0xfff7e6), [0, -0.02, 0], [0.84, 1.08, 0.84]);
    outline(b, 1.045, 0xb9a88c);
    part(g, sph(0.2, 12), toon(0xfffdf6), [-0.14, 0.26, 0.24], [1, 0.8, 0.5]);
    return g;
  }

  function buildWoolBall(fuzz, tint) {
    var g = new THREE.Group(), i;
    var base = part(g, sph(0.56, 18), toon(tint), [0, 0, 0], [1, 0.94, 1]);
    outline(base, 1.04, 0xb8a98e);
    for (i = 0; i < 9; i++) {
      var a = (i / 9) * Math.PI * 2;
      var r = fuzz ? 0.44 : 0.5;
      part(g, sph(fuzz ? 0.26 : 0.2, 12), toon(tint),
        [Math.cos(a) * r, Math.sin(a * 1.7) * 0.3, Math.sin(a) * r]);
    }
    part(g, sph(0.14, 10), toon(fuzz ? 0xffffff : 0xf1e2c8), [0.2, 0.34, 0.3]);
    return g;
  }

  function buildCheese() {
    var g = new THREE.Group();
    var w = part(g, cyl(0.6, 0.6, 0.44, 3), toon(0xf7c948), [0, -0.06, 0], [1, 1, 1.1], [0, 0.52, 0]);
    outline(w, 1.045, 0xa8791f);
    [[0.16, 0.1, 0.3], [-0.2, -0.08, 0.28], [0.0, -0.3, 0.3], [-0.3, 0.16, 0.15]].forEach(function (p) {
      part(g, sph(0.085, 10), toon(0xd9a52e), p);
    });
    return g;
  }

  function buildMayo() {
    var g = new THREE.Group();
    var jar = part(g, cyl(0.42, 0.38, 0.9, 16), toon(0xfff7e0), [0, -0.16, 0]);
    outline(jar, 1.04, 0xb9a07a);
    part(g, cyl(0.44, 0.44, 0.2, 16), toon(0xef5350), [0, 0.4, 0]);
    part(g, cyl(0.3, 0.3, 0.08, 16), toon(0xd94a47), [0, 0.53, 0]);
    part(g, box(0.52, 0.34, 0.04), toon(0xf6d76e), [0, -0.18, 0.4]);
    part(g, sph(0.09, 10), toon(0xffffff), [0, -0.18, 0.44], [1.3, 0.9, 0.3]);
    return g;
  }

  /** 毛线球：球体 + 多圈缠绕线 + 引出的线头 + 两根交叉银色棒针 */
  function buildYarn() {
    var g = new THREE.Group(), i, k;
    var ball = part(g, sph(0.5, 18), toon(0xf2a8c0), [0, -0.14, 0]);
    outline(ball, 1.04, 0xc9758f);
    for (k = 0; k < 9; k++) {
      part(g, new THREE.TorusGeometry(0.478, 0.055, 8, 20), toon(0xd9608a), [0, -0.14, 0], null, [0.5 + k * 0.35, k * 0.7, k * 1.15]);
    }
    // 引出的线头
    for (i = 0; i < 4; i++) {
      part(g, sph(0.075, 8), toon(0xee8fb0), [-0.52 - i * 0.16, 0.16 + Math.sin(i * 1.1) * 0.2, 0.1 * i], [1, 1, 1]);
    }
    // 两根交叉棒针
    for (k = -1; k <= 1; k += 2) {
      part(g, cyl(0.034, 0.034, 1.32, 8), toon(0xcfd6df), [k * 0.3, 0.46, 0], null, [0, 0, -k * 0.44]);
      part(g, sph(0.075, 8), toon(0xe6ebf2), [k * 0.58, 0.9, 0]);
    }
    return g;
  }

  function buildShell() {
    var g = new THREE.Group(), i, k;
    var pts = [];
    for (i = 0; i <= 18; i++) {
      var a = Math.PI * (i / 18);
      pts.push([Math.cos(a) * 0.85, Math.sin(a) * 0.8]);
    }
    pts.push([-0.1, -0.12], [0, -0.3], [0.1, -0.12]);
    var s = part(g, extrudeGeo(blobShape(pts), 0.22, 0.03), toon(0xf6c9c0), [0, -0.2, -0.11]);
    outline(s, 1.05, 0xb57a6e);
    for (k = 0; k < 6; k++) {
      var a2 = 0.25 + (k / 5) * (Math.PI - 0.5);
      part(g, con(0.05, 0.5, 5), toon(0xe8a89e),
        [Math.cos(a2) * 0.45, Math.sin(a2) * 0.45 - 0.2, 0.12], [1, 1, 0.4], [0, 0, -(a2 - Math.PI / 2)]);
    }
    part(g, sph(0.12, 10), toon(0xffe4dc), [0, -0.32, 0.14], [1.4, 0.6, 0.8]);
    return g;
  }

  function buildCrab() {
    var g = new THREE.Group(), s, i;
    var body = part(g, sph(0.5, 18), toon(0xef5f4f), [0, 0, 0], [1.25, 0.72, 0.95]);
    outline(body, 1.05, 0xa83c2f);
    for (s = -1; s <= 1; s += 2) {
      part(g, cyl(0.05, 0.05, 0.26, 8), toon(0xef5f4f), [0.2 * s, 0.34, 0.2]);
      var eg = new THREE.Group();
      eg.position.set(0.2 * s, 0.5, 0.2);
      g.add(eg);
      part(eg, sph(0.14, 12), ink(0xffffff), [0, 0, 0], [1, 1, 0.85]);
      part(eg, sph(0.08, 10), ink(0x2b2320), [0, 0, 0.1]);
    }
    for (s = -1; s <= 1; s += 2) {
      part(g, sph(0.2, 12), toon(0xe04a3c), [0.62 * s, 0.06, 0.32], [1.2, 0.9, 1]);
      part(g, con(0.13, 0.32, 6), toon(0xf4705f), [0.86 * s, 0.16, 0.4], [1, 1, 0.8], [0, 0, -1.5 * s]);
      part(g, con(0.12, 0.3, 6), toon(0xf4705f), [0.86 * s, -0.08, 0.4], [1, 1, 0.8], [0, 0, -1.9 * s]);
    }
    for (i = 0; i < 3; i++) {
      for (s = -1; s <= 1; s += 2) {
        part(g, cyl(0.035, 0.05, 0.42, 6), toon(0xd8483a), [0.44 * s, -0.22, -0.12 - i * 0.18], null, [0, -0.2 * i * s, -2.2 * s]);
      }
    }
    return g;
  }

  function buildStarfish() {
    var g = new THREE.Group(), i;
    var pts = [];
    for (i = 0; i <= 10; i++) {
      var a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      var r = (i % 2 === 0) ? 0.92 : 0.4;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    var s = part(g, extrudeGeo(blobShape(pts), 0.24, 0.05), toon(0xf6a04a), [0, 0, -0.12]);
    outline(s, 1.05, 0xb56a1f);
    for (i = 0; i < 5; i++) {
      var a2 = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      part(g, sph(0.12, 10), toon(0xffc066), [Math.cos(a2) * 0.5, Math.sin(a2) * 0.5, 0.12], [1, 1, 0.7]);
    }
    part(g, sph(0.16, 12), toon(0xffd08a), [0, 0, 0.13], [1, 1, 0.6]);
    return g;
  }

  var GOODS_KEYS = ['milk', 'egg', 'wool', 'rabbitwool', 'cheese', 'mayonnaise', 'yarn', 'shell', 'crab', 'starfish'];
  var GOODS_BUILD = {
    milk: buildMilk, egg: buildEgg,
    wool: function () { return buildWoolBall(false, 0xfdf6e6); },
    rabbitwool: function () { return buildWoolBall(true, 0xfffdf8); },
    cheese: buildCheese, mayonnaise: buildMayo, yarn: buildYarn,
    shell: buildShell, crab: buildCrab, starfish: buildStarfish
  };
  GOODS_KEYS.forEach(function (k) { TOOL_BUILD['goods_' + k] = GOODS_BUILD[k]; });

  /* ---------- 爱心三档（灰 / 黄 / 红） ---------- */

  function heartShape(s) {
    var sh = new THREE.Shape();
    sh.moveTo(0, -0.52 * s);
    sh.bezierCurveTo(0.95 * s, 0.18 * s, 0.52 * s, 0.98 * s, 0, 0.5 * s);
    sh.bezierCurveTo(-0.52 * s, 0.98 * s, -0.95 * s, 0.18 * s, 0, -0.52 * s);
    return sh;
  }

  function buildHeart(color) {
    var g = new THREE.Group();
    var h = part(g, extrudeGeo(heartShape(0.8), 0.32, 0.06), toon(color), [0, 0, -0.16]);
    outline(h, 1.05, darken(color, 0.62));
    part(g, sph(0.13, 10), toon(0xffffff), [-0.24, 0.26, 0.18], [1, 0.7, 0.4]);
    return g;
  }

  var HEART_KEYS = ['gray', 'yellow', 'red'];
  var HEART_TINT = { gray: 0x8f97a6, yellow: 0xffce4a, red: 0xff5f7a };
  HEART_KEYS.forEach(function (k) {
    TOOL_BUILD['heart_' + k] = (function (kk) {
      return function () { return buildHeart(HEART_TINT[kk]); };
    })(k);
  });

  /* ---------- 底部导航图标 ---------- */

  function buildNavPasture() {
    var g = new THREE.Group();
    var base = part(g, box(1.0, 0.7, 0.8), toon(0xfff2dc), [0, -0.16, 0]);
    outline(base, 1.05, 0xa8763f);
    var roof = part(g, con(0.78, 0.62, 4), toon(0xd8503f), [0, 0.52, 0], null, [0, Math.PI / 4, 0]);
    outline(roof, 1.05, 0x8f3128);
    part(g, box(0.3, 0.42, 0.06), toon(0x8a5a33), [0, -0.3, 0.42]);
    part(g, box(0.24, 0.24, 0.06), toon(0x7fc0e8), [0.38, 0.06, 0.42]);
    return g;
  }

  /** 农场：土垄 + 大南瓜 + 小苗，一眼是"农田作物" */
  function buildNavFarm() {
    var g = new THREE.Group(), s, i;
    var soil = part(g, cyl(0.72, 0.84, 0.3, 16), toon(0x8a5a33), [0, -0.66, 0], [1, 1, 0.68]);
    outline(soil, 1.05, 0x5f3d22);
    // 南瓜：扁球 + 纵棱
    var body = part(g, sph(0.52, 18), toon(0xef8f2e), [0.16, -0.24, 0], [1.1, 0.78, 1.05]);
    outline(body, 1.04, 0xb55f14);
    for (i = 0; i < 4; i++) {
      var a = (i / 4) * Math.PI;
      part(g, sph(0.5, 14), toon(0xe07c20), [0.16 + Math.cos(a) * 0.05, -0.24 + Math.sin(a) * 0.04, Math.sin(a) * 0.06], [1.12, 0.76, 0.72], [0, a, 0]);
    }
    part(g, cyl(0.1, 0.12, 0.26, 8), toon(0x6a9a3c), [0.16, 0.2, 0], null, [0, 0, 0.22]);
    // 旁边小南瓜 + 落叶
    var small = part(g, sph(0.3, 14), toon(0xf2a245), [-0.5, -0.42, 0.14], [1.1, 0.78, 1]);
    outline(small, 1.04, 0xb55f14);
    part(g, cyl(0.06, 0.07, 0.16, 8), toon(0x6a9a3c), [-0.5, -0.14, 0.14], null, [0, 0, 0.2]);
    part(g, sph(0.2, 10), toon(0x7fc45a), [0.52, -0.5, 0.2], [1.2, 0.4, 0.9]);
    return g;
  }

  function buildNavShop() {
    var g = new THREE.Group();
    var b = part(g, box(1.0, 0.82, 0.5), toon(0xf0a53c), [0, -0.16, 0]);
    outline(b, 1.05, 0xa86a16);
    part(g, new THREE.TorusGeometry(0.26, 0.055, 8, 16, Math.PI), toon(0xd9862b), [0, 0.28, 0]);
    part(g, box(0.9, 0.22, 0.06), toon(0xffd88a), [0, -0.1, 0.27]);
    part(g, sph(0.12, 10), toon(0xffffff), [0.26, -0.34, 0.27], [1, 0.7, 0.4]);
    return g;
  }

  /** 矿洞：木框洞口 + 棱面岩块 + 金矿石 */
  function buildNavMine() {
    var g = new THREE.Group(), i;
    // 矿洞口木框（两根立柱 + 横梁），一眼是"矿洞"
    for (i = -1; i <= 1; i += 2) {
      var post = part(g, box(0.19, 1.16, 0.19), toon(0x8a5a33), [i * 0.58, -0.16, -0.16]);
      outline(post, 1.05, 0x53331a);
    }
    var beam = part(g, box(1.46, 0.2, 0.21), toon(0xa06b3c), [0, 0.5, -0.16]);
    outline(beam, 1.05, 0x53331a);
    // 洞内暗色
    part(g, box(1.0, 1.0, 0.1), ink(0x2c2833), [0, 0.06, -0.2]);
    var rockA = part(g, new THREE.IcosahedronGeometry(0.62, 0), toon(0x6f6a7c), [-0.2, -0.28, 0.16], [1.1, 0.95, 1]);
    outline(rockA, 1.06, 0x474353);
    part(g, new THREE.IcosahedronGeometry(0.4, 0), toon(0x8b8697), [0.38, -0.46, 0.2], [1.1, 0.9, 1]);
    part(g, new THREE.IcosahedronGeometry(0.32, 0), toon(0x5e5a6b), [0.02, 0.16, 0.2], null, [0.5, 0.8, 0.3]);
    // 金矿石：八面体
    var gem = part(g, new THREE.OctahedronGeometry(0.3, 0), toon(0xffc93c), [-0.2, 0.42, 0.5], null, [0.2, 0.5, 0.15]);
    outline(gem, 1.06, 0xc9920f);
    var gem2 = part(g, new THREE.OctahedronGeometry(0.18, 0), toon(0xffe285), [0.4, -0.06, 0.46], null, [0.1, 0.3, 0.4]);
    outline(gem2, 1.06, 0xc9920f);
    for (i = 0; i < 3; i++) {
      part(g, new THREE.IcosahedronGeometry(0.11, 0), toon(0x9d97a9), [-0.54 + i * 0.18, -0.72, 0.4 + i * 0.06], [1.1, 0.8, 1]);
    }
    return g;
  }

  function buildNavCalendar() {
    var g = new THREE.Group(), i, j, s;
    var page = part(g, box(1.0, 0.92, 0.14), toon(0xfdfdff), [0, -0.06, 0]);
    outline(page, 1.05, 0x9aa4b2);
    part(g, box(1.0, 0.26, 0.16), toon(0xef5350), [0, 0.36, 0]);
    for (s = -1; s <= 1; s += 2) part(g, cyl(0.05, 0.05, 0.2, 8), toon(0xbfc7d0), [0.3 * s, 0.5, 0]);
    for (i = 0; i < 3; i++) {
      for (j = 0; j < 3; j++) {
        part(g, sph(0.075, 8), ink(0x7f8a99), [-0.28 + i * 0.28, 0.02 - j * 0.26, 0.09], [1, 1, 0.3]);
      }
    }
    return g;
  }

  function buildNavBeach() {
    var g = new THREE.Group(), i;
    part(g, cyl(0.05, 0.05, 1.3, 8), toon(0xd8c0a0), [0, -0.2, 0]);
    var canopy = part(g, con(0.8, 0.5, 12), toon(0xef5350), [0, 0.55, 0]);
    outline(canopy, 1.05, 0x9c2c28);
    for (i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2;
      part(g, con(0.26, 0.52, 3), toon(0xfff3e0), [Math.cos(a) * 0.42, 0.5, Math.sin(a) * 0.42], [1, 0.9, 0.35]);
    }
    part(g, sph(0.08, 8), toon(0xffd24a), [0, 0.86, 0]);
    part(g, sph(0.26, 14), toon(0x74c0e8), [0.5, -0.66, 0.15]);
    part(g, sph(0.265, 12), toon(0xfff3e0), [0.5, -0.66, 0.15], [1, 0.5, 1]);
    return g;
  }

  function buildNavFishBook() {
    var g = new THREE.Group(), i;
    // 书：封面 + 纸张厚边 + 书脊 + 书签
    var cover = part(g, box(0.84, 0.96, 0.14), toon(0x4a90d9), [0.06, -0.02, 0]);
    outline(cover, 1.05, 0x2f5f92);
    for (i = 0; i < 4; i++) {
      part(g, box(0.74, 0.88 - i * 0.05, 0.03), toon(0xfdfdff), [-0.36 - i * 0.035, -0.03, 0]);
    }
    part(g, box(0.16, 0.98, 0.18), toon(0x356fb0), [0.5, -0.02, 0]);
    part(g, box(0.1, 0.3, 0.06), toon(0xef5350), [0.32, 0.52, 0.2], null, [0, 0, -0.1]);
    // 封面上的鱼（斜放，一眼是图鉴）
    var f = buildFish('carp');
    f.scale.setScalar(0.62);
    f.position.set(0.02, 0.0, 0.26);
    f.rotation.set(0, 0, -0.28);
    g.add(f);
    return g;
  }

  /** 背包：圆润包身 + 翻盖 + 提手 + 正面口袋 + 双背带与金扣，一眼是"收纳背包" */
  function buildNavBag() {
    var g = new THREE.Group(), s;
    // 包身（暖棕）
    var body = part(g, box(0.88, 0.76, 0.5), toon(0xc07a3e), [0, -0.26, 0]);
    outline(body, 1.05, 0x7d4a1f);
    // 缝线（两道浅色横线，像布料）
    part(g, box(0.9, 0.05, 0.52), toon(0xe0a968), [0, -0.06, 0]);
    part(g, box(0.9, 0.05, 0.52), toon(0xe0a968), [0, -0.56, 0]);
    // 正面口袋 + 口袋盖
    var pocket = part(g, box(0.5, 0.3, 0.16), toon(0xd99a55), [0, -0.4, 0.3]);
    outline(pocket, 1.06, 0x8a5423);
    // 翻盖（深棕，微微前倾）
    var flap = part(g, box(0.94, 0.4, 0.58), toon(0xa8652f), [0, 0.24, -0.02], null, [0.18, 0, 0]);
    outline(flap, 1.05, 0x6f3f18);
    // 顶部提手
    var handle = part(g, new THREE.TorusGeometry(0.18, 0.055, 8, 16, Math.PI), toon(0x8a5a33), [0, 0.48, -0.14]);
    outline(handle, 1.06, 0x5a3517);
    // 金色卡扣
    var buckle = part(g, box(0.2, 0.13, 0.1), toon(0xf2c452), [0, -0.02, 0.31]);
    outline(buckle, 1.08, 0xb8860f);
    // 双背带（垂到身后，末端金扣）
    for (s = -1; s <= 1; s += 2) {
      part(g, box(0.15, 0.84, 0.1), toon(0x7d4a1f), [s * 0.29, -0.28, -0.3], null, [0.12, 0, 0]);
      part(g, box(0.17, 0.1, 0.12), toon(0xe8b23c), [s * 0.29, -0.64, -0.34]);
    }
    return g;
  }

  var NAV_KEYS = ['pasture', 'farm', 'shop', 'mine', 'calendar', 'beach', 'fishbook', 'bag'];
  var NAV_BUILD = {
    pasture: buildNavPasture, farm: buildNavFarm, shop: buildNavShop, mine: buildNavMine,
    calendar: buildNavCalendar, beach: buildNavBeach, fishbook: buildNavFishBook, bag: buildNavBag
  };
  NAV_KEYS.forEach(function (k) { TOOL_BUILD['nav_' + k] = NAV_BUILD[k]; });

  /* ---------- 素材总览图 ---------- */

  function makeLabel(text, w) {
    var cw = 512, ch = 96;
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#33475a';
    ctx.font = '600 50px "Microsoft YaHei", "SimHei", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cw / 2, ch / 2);
    var tex = new THREE.CanvasTexture(cv);
    if (THREE.LinearFilter) tex.minFilter = THREE.LinearFilter;
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, w * ch / cw), mat);
  }

  function normItem(obj, size) {
    var bb = new THREE.Box3().setFromObject(obj);
    var c = bb.getCenter(new THREE.Vector3());
    var sz = bb.getSize(new THREE.Vector3());
    var maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
    obj.position.set(obj.position.x - c.x, obj.position.y - c.y, obj.position.z - c.z);
    var holder = new THREE.Group();
    holder.add(obj);
    holder.scale.setScalar(size / maxDim);
    return holder;
  }

  function sheetItem(d) {
    if (d.kind === 'head') return M.buildHead(d.animal);
    if (d.kind === 'rig') return M.buildAnimal(d.animal, 1, d.age).group;
    return M.buildTool(d.key);
  }

  M.buildSheet = function () {
    var rows = [
      { title: '动物全身 · 9 种（牧场伙伴）', size: 3.2, yaw: 0.5, cellW: 3.5, items: [
        { kind: 'rig', animal: 'chicken', label: '小鸡' },
        { kind: 'rig', animal: 'cow', label: '奶牛' },
        { kind: 'rig', animal: 'sheep', label: '绵羊' },
        { kind: 'rig', animal: 'anjela', label: '安哥拉兔' },
        { kind: 'rig', animal: 'horse', label: '马' },
        { kind: 'rig', animal: 'dog', label: '狗' },
        { kind: 'rig', animal: 'duck', label: '鸭' },
        { kind: 'rig', animal: 'cat', label: '猫' },
        { kind: 'rig', animal: 'llama', label: '羊驼' }] },
      { title: '动物幼年 · 9 种（体量更小 / 头身比更夸张 / 四肢更短）', size: 3.2, yaw: 0.5, cellW: 3.5, items: [
        { kind: 'rig', animal: 'chicken', age: 'baby', label: '小鸡（幼年）' },
        { kind: 'rig', animal: 'cow', age: 'baby', label: '奶牛（幼年）' },
        { kind: 'rig', animal: 'sheep', age: 'baby', label: '绵羊（幼年）' },
        { kind: 'rig', animal: 'anjela', age: 'baby', label: '安哥拉兔（幼年）' },
        { kind: 'rig', animal: 'horse', age: 'baby', label: '马（幼年）' },
        { kind: 'rig', animal: 'dog', age: 'baby', label: '狗（幼年）' },
        { kind: 'rig', animal: 'duck', age: 'baby', label: '鸭（幼年）' },
        { kind: 'rig', animal: 'cat', age: 'baby', label: '猫（幼年）' },
        { kind: 'rig', animal: 'llama', age: 'baby', label: '羊驼（幼年）' }] },
      { title: '动物头部特写 · 9 种（动物页缩略图）', size: 2.8, yaw: 0.5, cellW: 3.5, items: [
        { kind: 'head', animal: 'chicken', label: '小鸡头' },
        { kind: 'head', animal: 'cow', label: '奶牛头' },
        { kind: 'head', animal: 'sheep', label: '绵羊头' },
        { kind: 'head', animal: 'anjela', label: '兔头' },
        { kind: 'head', animal: 'horse', label: '马头' },
        { kind: 'head', animal: 'dog', label: '狗头' },
        { kind: 'head', animal: 'duck', label: '鸭头' },
        { kind: 'head', animal: 'cat', label: '猫头' },
        { kind: 'head', animal: 'llama', label: '羊驼头' }] },
      { title: '工具图标', size: 2.6, yaw: 0.34, items: [
        { key: 'hoe', label: '锄头' }, { key: 'wateringcan', label: '水壶' }, { key: 'axe', label: '斧头' },
        { key: 'hammer', label: '锤子' }, { key: 'sickle', label: '镰刀' }, { key: 'fishingrod', label: '钓竿' }] },
      { title: '商店商品 / 产物', size: 2.5, yaw: 0.4, items: [
        { key: 'goods_milk', label: '牛奶' }, { key: 'goods_egg', label: '鸡蛋' }, { key: 'goods_wool', label: '羊毛' },
        { key: 'goods_cheese', label: '奶酪' }, { key: 'goods_mayonnaise', label: '蛋黄酱' }, { key: 'goods_yarn', label: '毛线球' }] },
      { title: '海产图鉴 · 鱼类（每种造型不同）', size: 2.7, yaw: 0, items: FISH_KEYS.map(function (k) {
        return { key: 'fish_' + k, label: FISH_SPEC[k].name };
      }) },
      { title: '海产小物', size: 2.4, yaw: 0.42, items: [
        { key: 'goods_shell', label: '贝壳' }, { key: 'goods_crab', label: '螃蟹' }, { key: 'goods_starfish', label: '海星' }] },
      { title: '爱心三档', size: 2.4, yaw: 0.25, items: [
        { key: 'heart_gray', label: '灰心（低）' }, { key: 'heart_yellow', label: '黄心（中）' }, { key: 'heart_red', label: '红心（高）' }] }
    ];
    var g = new THREE.Group();
    var y = 0;
    rows.forEach(function (row) {
      var n = row.items.length;
      var cellW = row.cellW || 4.1;
      var rowW = n * cellW;
      row.items.forEach(function (it, i) {
        var cell = new THREE.Group();
        cell.position.set(-rowW / 2 + cellW * (i + 0.5), y, 0);
        var holder = normItem(sheetItem(it), row.size);
        holder.rotation.y = row.yaw === undefined ? 0.4 : row.yaw;
        holder.position.y = row.size * 0.16;
        cell.add(holder);
        var lb = makeLabel(it.label, Math.min(3.4, row.size * 1.25));
        lb.position.set(0, -row.size * 0.58, 0.3);
        cell.add(lb);
        g.add(cell);
      });
      var t = makeLabel(row.title, 8.4);
      t.position.set(-rowW / 2 - 5.4, y + row.size * 0.2, 0.3);
      g.add(t);
      y -= (row.size + 2.3);
    });
    var bb = new THREE.Box3().setFromObject(g);
    var c = bb.getCenter(new THREE.Vector3());
    g.children.forEach(function (ch) { ch.position.x -= c.x; ch.position.y -= c.y; });
    return g;
  };

  /** 素材总览图：正交相机平铺渲染成一张 PNG */
  function renderSheet(item) {
    var W = item.w || 1800, H = item.h || 1400;
    var rnd = getRenderer(W, H);
    var scene = new THREE.Scene();
    var g = M.buildSheet();
    scene.add(g);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe4eedd, 0.5));
    var d1 = new THREE.DirectionalLight(0xfff6e6, 0.5); d1.position.set(8, 14, 16); scene.add(d1);
    var d2 = new THREE.DirectionalLight(0xdfeeff, 0.3); d2.position.set(-12, 8, 10); scene.add(d2);
    scene.add(new THREE.AmbientLight(0xffffff, 0.42));

    var bb = new THREE.Box3().setFromObject(g);
    var c = bb.getCenter(new THREE.Vector3());
    var sz = bb.getSize(new THREE.Vector3());
    var aspect = W / H;
    var viewH = Math.max(sz.y, sz.x / aspect) * 1.06;
    var viewW = viewH * aspect;
    var cam = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 0.1, 500);
    cam.position.set(c.x, c.y, c.z + 140);
    cam.lookAt(c.x, c.y, c.z);

    var bg = new THREE.Mesh(new THREE.PlaneGeometry(viewW * 0.99, viewH * 0.99),
      new THREE.MeshBasicMaterial({ color: 0xeef6ff }));
    bg.position.set(c.x, c.y, c.z - 8);
    scene.add(bg);

    M.setShading('icon');
    var prevTM = rnd.toneMapping;
    rnd.toneMapping = THREE.NoToneMapping;
    rnd.render(scene, cam);
    rnd.toneMapping = prevTM;
    M.setShading('scene');
    return rnd.domElement.toDataURL('image/png');
  }

  /** 三视图总览：把已渲染的三视图拼成「每列一种动物、每行一个 年龄×视图」的对比大图 */
  M.composeViewSheet = function (assets, item) {
    var W = (item && item.w) || 2560, H = (item && item.h) || 1820;
    var cols = ANIMALS.length;
    var rowDefs = [];
    AGES.forEach(function (age) {
      VIEWS.forEach(function (v) {
        rowDefs.push({
          age: age, view: v,
          label: (age === 'baby' ? '幼年' : '成年') + ' · ' + VIEW_NAMES[v]
        });
      });
    });
    var rows = rowDefs.length;
    var leftW = Math.round(W * 0.125), topH = Math.round(H * 0.1), botH = Math.round(H * 0.03);
    var cellW = (W - leftW) / cols, cellH = (H - topH - botH) / rows;
    var FONT = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#eef6ff';
    ctx.fillRect(0, 0, W, H);

    function txt(s, x, y, size, color, align, weight) {
      ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
      ctx.fillStyle = color || '#3f3a4a';
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
    }
    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function load(src) {
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () { res(im); };
        im.onerror = function () { rej(new Error('三视图拼图：图片解码失败')); };
        im.src = src;
      });
    }

    txt('动物三视图总览 · 成年 × 幼年（每列一种动物：正面 / 侧面 / 背面）',
      W / 2, topH * 0.3, Math.round(H * 0.0208));
    txt('幼年行整体同比缩小绘制，体量 / 头身比 / 四肢长度差异可直接对比（马为长耳外翻、兔为双耳分开竖立）',
      W / 2, topH * 0.62, Math.round(H * 0.0128), '#6c7a8c', 'center', 600);
    ANIMALS.forEach(function (t, i) {
      txt(ANIMAL_NAMES[t] || t, leftW + cellW * (i + 0.5), topH * 0.88, Math.round(H * 0.0156), '#33475a');
    });

    var byPath = {};
    assets.forEach(function (a) { byPath[a.path] = a.dataURL; });

    var jobs = [];
    rowDefs.forEach(function (rd, r) {
      (function (rd, r) {
        ANIMALS.forEach(function (t, c) {
          var p = 'assets/views/' + rd.age + '/' + t + '_' + rd.view + '.png';
          var src = byPath[p];
          if (!src) { jobs.push(Promise.reject(new Error('三视图拼图：缺少 ' + p))); return; }
          jobs.push(load(src).then(function (im) { return { im: im, r: r, c: c, age: rd.age }; }));
        });
      })(rd, r);
    });

    return Promise.all(jobs).then(function (cells) {
      // 行底色 / 行标签
      rowDefs.forEach(function (rd, r) {
        var y = topH + cellH * r;
        ctx.fillStyle = rd.age === 'baby' ? '#fff7ef' : '#f5faff';
        ctx.fillRect(0, y, W, cellH);
        txt(rd.label, leftW * 0.5, y + cellH * 0.5, Math.round(H * 0.0168),
          rd.age === 'baby' ? '#a5642f' : '#33475a');
      });
      ctx.strokeStyle = '#c8d8ea';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, topH + cellH * 3);
      ctx.lineTo(W, topH + cellH * 3);
      ctx.stroke();
      // 卡片 + 图片
      cells.forEach(function (c) {
        var x = leftW + cellW * c.c, y = topH + cellH * c.r;
        rr(x + 8, y + 8, cellW - 16, cellH - 16, 18);
        ctx.fillStyle = c.age === 'baby' ? '#fffdfa' : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = c.age === 'baby' ? '#f0d9c0' : '#d5e4f2';
        ctx.lineWidth = 2;
        ctx.stroke();
        var s = Math.min(cellW, cellH) * 0.86 * (c.age === 'baby' ? 0.8 : 1);
        ctx.drawImage(c.im, x + (cellW - s) / 2, y + (cellH - s) / 2, s, s);
      });
      txt('成年：assets/views/adult   幼年：assets/views/baby   （每张 360×360 PNG，可直接接入牧场朝向切换）',
        W / 2, H - botH * 0.5, Math.round(H * 0.0118), '#6c7a8c', 'center', 600);
      return cv.toDataURL('image/png');
    });
  };

  M.FISH_KEYS = FISH_KEYS;
  M.GOODS_KEYS = GOODS_KEYS;
  M.HEART_KEYS = HEART_KEYS;
  M.NAV_KEYS = NAV_KEYS;
  M.FISH_NAMES = FISH_SPEC;

  global.Models = M;
})(typeof window !== 'undefined' ? window : this);
