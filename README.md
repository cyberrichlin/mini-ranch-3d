---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 5035900202c792eec3eaa16b083401f8_55dd1551b5bd11f188f9525400248c00
    ReservedCode1: YpuDMZzFDWpS7Q67KxJgMYN3nZGCaWNOZBoZ8zVyMT8TyZ79g2s5b41mrutfmApyilBK7z9rFhU/Z+zl8lGkXr5hqcimhyf0ebITOh26ZmMptZOTafk52JFaR+eqAsdaZJOyoB2kT+VD2eVspVcZudyV6fbyJ5uWMCQc6BoXzi06ku98WzooipZEmrI=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 5035900202c792eec3eaa16b083401f8_55dd1551b5bd11f188f9525400248c00
    ReservedCode2: YpuDMZzFDWpS7Q67KxJgMYN3nZGCaWNOZBoZ8zVyMT8TyZ79g2s5b41mrutfmApyilBK7z9rFhU/Z+zl8lGkXr5hqcimhyf0ebITOh26ZmMptZOTafk52JFaR+eqAsdaZJOyoB2kT+VD2eVspVcZudyV6fbyJ5uWMCQc6BoXzi06ku98WzooipZEmrI=
---



# 迷你牧场 · 网页版（矿石镇萌版 3D）

参考任天堂《牧场物语：矿石镇的小伙伴们》玩法制作的**纯前端**牧场经营小游戏，画面为固定俯视角 Q 版 3D（大眼高光、柔和描边、四季色调）。
**零依赖、零构建、可离线**：双击 `index.html` 即可在浏览器中直接游玩，也可直接部署到 GitHub Pages。

---

## 一、如何运行

| 方式 | 操作 |
| --- | --- |
| 最简单 | 双击 `index.html`，用 Chrome / Edge / Firefox 打开即可离线游玩 |
| Windows 启动器（推荐） | 双击 `启动迷你牧场_自动端口.cmd`：自动挑一个空闲端口起本地服务并打开浏览器 |
| 固定端口启动器 | 双击 `启动迷你牧场.cmd`：固定使用 8080 端口 |
| 命令行 | 在本目录执行 `python -m http.server 8081`，浏览器访问 `http://127.0.0.1:8081/` |

> 用本地服务器方式打开时，存档（`localStorage`）更稳定。手机访问可在同一局域网内用 `python -m http.server 8081 --bind 0.0.0.0`，再用手机浏览器打开 `http://<电脑局域网IP>:8081/`。

---

## 二、目录结构

```
农场/
├─ index.html                       页面骨架（含 viewport 与全部脚本引用）
├─ README.md                        本说明
├─ LICENSE                          MIT 许可
├─ .nojekyll                        禁用 GitHub Pages 的 Jekyll 处理
├─ .gitignore                       忽略开发缓存与临时产物
├─ 启动迷你牧场.cmd                   Windows 本地启动器（端口 8080）
├─ 启动迷你牧场_自动端口.cmd           Windows 本地启动器（端口自动顺延）
├─ css/
│  ├─ style.css                     全部主样式（四季主题变量、农田网格、商店、动画、响应式）
│  └─ ext.css                       扩展玩法样式（背包面板、图鉴、矿洞等浮层）
├─ js/
│  ├─ lib/three.min.js              本地 Three.js（r128，离线可用）
│  ├─ data.js                       纯数据层：作物 / 天气 / 动物 / 商店 / 季节 / 兑换 / 建筑
│  ├─ game.js                       核心逻辑层：状态机、生长、经济、存档（不依赖 DOM）
│  ├─ game-ext.js                   扩展玩法层：撒娇 / 海产图鉴 / 海滩 / 矿洞 / 商店兑换 / 天气祭坛与温室
│  ├─ models.js                     建模层：9 种动物的萌版 3D 建模与图标渲染
│  ├─ scene.js                      渲染层：固定俯视角 3D 场景（含等距伪 3D 降级）
│  ├─ ui.js                         交互层：HUD、视图渲染、浮层与动效
│  └─ main.js                       启动入口：依赖自检后拉起游戏
├─ assets/
│  ├─ manifest.js                   素材路径清单（相对路径，适合子目录部署）
│  ├─ animals/                      9 种动物头部缩略图
│  ├─ icons/                        商店 / 工具 / 种子 / 商品等 3D 图标
│  ├─ preview/                      动物预览图（成年 / 幼年）
│  ├─ views/adult、views/baby/      动物三视图（正面 / 侧面 / 背面）
│  └─ overview/                     牧场全景图
├─ screenshots/                     各视图与四季效果截图
└─ tools/                           素材渲染工具（开发用，不影响游戏运行）
   ├─ render-assets.js              Chrome 无头 + CDP 离屏渲染，生成 assets/ 与 manifest.js
   ├─ assetgen.html
   └─ assetgen.page.js
```

分层原则：`data → game → scene/ui`，逻辑层不碰 DOM，因此换 UI 不影响玩法。

---

## 三、玩法说明

### 1. 核心循环
「农田播种 → 浇水施肥 → 收获入库 → 商店出售 → 攒钱扩张 → 结束一天」。
所有操作即时结算，存档自动写入浏览器 `localStorage`，关闭页面不丢失。

### 2. 季节系统
每 **30 天**轮换一次季节（春 → 夏 → 秋 → 冬），换季时播放季节幕布。
每个季节有 **专属作物**，货架与可播种列表随季节自动更新，跨季不换种会白忙一季。

### 3. 农田（6 × 4 = 24 块地）
| 操作 | 说明 |
| --- | --- |
| 耕地 | 荒地无法播种，需先开垦；也可「开垦全部」 |
| 播种 | 优先消耗种子袋，无袋则自动扣金币购买 |
| 浇水 | 每块地每天最多 3 点水分；缺水当天停止生长 |
| 施肥 | 拥有肥料优先消耗，否则花 30G，可叠加 3 层，加速生长 |
| 收获 | 成熟后地块高亮，一键收获全部 |

### 4. 养殖
- 鸡（300G）/ 牛（800G）/ 羊（600G），喂食后按各自周期蓄产，产物可收取出售。
- **看门狗旺财**：喂饱后能有效降低恶劣天气造成的农田损失，饿肚子则形同虚设。
- **马**（1500G）：买下后在马厩可骑乘 / 下马，骑乘状态会同步到牧场场景。
- **动物爱心与撒娇**：点击动物会显示灰 / 黄 / 红爱心，并按好感度触发撒娇动作。

### 5. 天气系统
共 6 种天气：晴、雨、暴风雨、干旱、大风、雪。
- 雨天自动为农田补水；
- 干旱使作物停止生长；
- 暴风雨 / 大风可能损毁作物，损失程度取决于狗是否吃饱；
- 天气页提供 **未来 5 天预报**（含灾害预警标记）与 **牧场日志**（最近 14 条）；
- 建成 **天气祭坛** 后可主动改变天气（可升级）。

### 6. 商店
四个分页：种子 / 动物 / 道具 / 仓库。仓库页支持单品出售与一键清仓（8 折回收）。
**兑换商店**：用矿石或高品质产物兑换体力上限提升、爱心道具、神秘种子等限定商品。

### 7. 矿洞
多层矿洞递进探索，可获取矿石等稀有产出；需逐步升级工具（如铁镐）才能深入，下矿会消耗体力。

### 8. 海滩与海产图鉴
可前往海滩获取海产，收集后录入 **海产图鉴**，补全图鉴是本作的收集向目标之一。

### 9. 加工链
**奶酪机 / 蛋黄酱机 / 毛线机** 可将牛奶、鸡蛋、羊毛等畜产品加工为高价值成品再出售。

### 10. 建筑与体力
- **温室大棚**：改善种植条件（可升级）。
- **睡觉**：跳到次日 6:00 并恢复体力；体力耗尽会强制结束一天。
- 日常劳作、下矿、开垦均消耗体力。

### 11. 节日日历
日历页展示当月节日，节日当天可领取额外奖励。

### 12. 背包与仓库
牧场页顶部「仓库 N 件」信息条可点击，弹出仓库 / 背包面板查看全部持有物。

---

## 四、移动端与适配说明

- 页面已声明 `viewport`，采用弹性布局（`height:100%` + 内部滚动容器），画布尺寸随容器自适应，并限制 `devicePixelRatio ≤ 2` 控制性能。
- CSS 内置 `max-width: 720px` 与 `min-width: 1100px` 两档断点，适配手机与宽屏。
- 主要交互基于点击（click），未依赖鼠标悬停，触屏设备可直接操作。
- 建议在手机浏览器中横屏或全屏游玩以获得更大视野。

---

## 五、部署到 GitHub Pages

本项目为纯静态站点（相对路径引用、无构建、无外部 CDN），可直接托管。

1. **创建仓库**：登录 GitHub，点击右上角 `+` → `New repository`，填写仓库名（例如 `mini-farm`），选择 `Public`，创建。
2. **上传文件**：把本项目**目录内的全部文件**（含 `index.html`、`css/`、`js/`、`assets/`、`.nojekyll`、`.gitignore`、`README.md`、`LICENSE`）提交到仓库根目录。命令行方式：
   ```bash
   git init
   git add .
   git commit -m "chore: initialize mini-farm web"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
   > 注意：`git add .` 会遵循 `.gitignore`，开发缓存与无头浏览器 profile 不会被提交。`.nojekyll` 必须一并提交。
3. **开启 Pages**：仓库页 `Settings` → 左侧 `Pages` → `Build and deployment` → `Source` 选择 `Deploy from a branch` → `Branch` 选择 `main`，目录选择 `/ (root)` → 点击 `Save`。
4. **等待发布**：约 1 分钟后刷新该页面，顶部会显示站点地址。
5. **访问地址格式**：
   ```
   https://<用户名>.github.io/<仓库名>/
   ```
   例如用户名为 `alice`、仓库名为 `mini-farm`，则访问 `https://alice.github.io/mini-farm/`。

**注意事项**
- 仓库名用全小写英文与连字符更稳妥；若仓库名含中文或大小写混合，Pages 地址仍可生成，但建议保持规范。
- 本项目资源全部为相对路径，部署在子路径（`/<仓库名>/`）下可正常工作，无需修改任何代码。
- 若绑定自有域名，可额外添加 `CNAME` 文件；如需自定义 404 页面可添加 `404.html`。
- 更新站点：本地修改后 `git add . && git commit -m "..." && git push`，Pages 会自动重新构建。

---

## 六、与小程序版的差异

| 项 | 小程序版 `mini-farm` | 网页版（本项目） |
| --- | --- | --- |
| 运行环境 | 微信开发者工具 / 微信 | 任意现代浏览器，双击即玩 |
| 渲染 | WXML + WXSS | HTML + CSS + Canvas / WebGL 实时 3D |
| 存档 | 微信本地存储 | `localStorage` |
| 场景 | 静态样式拼接 | Q 版 3D 实时渲染（云飘动、动物走动、天气粒子、季节配色） |
| 部署 | 微信平台 | 任意静态托管（GitHub Pages / 对象存储 / 本地服务器） |

---

## 七、开发校验

项目内置一份 `jsdom` 冒烟测试脚本（开发期位于工作区 `temp/smoke.js`），可验证：
脚本加载、视图渲染、耕地 / 播种 / 施肥 / 收获、牲畜买卖、骑乘切换、仓库出售、
连续推进 30 天（跨季 + 灾害）、存档读写与重置。执行：

```bash
node smoke.js
```

素材重新生成（需要本机安装 Chrome）：在项目根目录执行 `node tools/render-assets.js`，会离屏渲染并重写 `assets/` 下的 PNG 与 `assets/manifest.js`。

---

## 八、可扩展方向

- 矿洞深层事件与矿石镇 NPC 剧情
- 作物品质分级（普通 / 银 / 金）扩展
- 节日集市与 NPC 好感度
- 移动端触控手势与音效

---

## 九、许可

本项目基于 [MIT License](./LICENSE) 开源（版权人请在 `LICENSE` 中替换占位符 `<YOUR NAME>`）。

*（内容由AI生成，仅供参考）*
*（内容由AI生成，仅供参考）*
