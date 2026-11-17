// The board: a cartoon diorama. Real 3D tiles, props and walls drawn in a
// hand-inked cel style (toon ramp + inverted-hull outlines + painted canvas
// textures), with the 2D chibi art standing on it as camera-facing cut-outs.
//
// Two camera framings: a 45° isometric "corner of the room" view for landscape
// screens, and a straight-on "stage" view for portrait phones (the board is
// deeper than wide, so it fills a tall screen). Walls only stand on the far
// sides of the room and are placed from the measured extents of every sprite
// in both framings, so nothing ever clips into them or is hidden behind them.
import * as THREE from '../vendor/three.module.min.js';
import { TILE, heroDef } from './data.js';
import { makeRng } from './board.js';
import * as A from './board-art.js';

const S = 1.8;          // grid spacing
const T = 1.5;          // tile size (gap = S - T)
const TOP = 0.42;       // tile top height
const START_R = 1.62;   // start platform top radius
const START_TOP = 0.5;
const BOSS_R = 1.75;    // boss dais top radius
const BOSS_TOP = 0.9;
const HERO_H = 1.75;
const BOSS_H = 3.9;
const ENEMY_H = 1.5;
const HEAD = 2.5;       // hero + flag height used for framing
const WALL_H = 4.4;
const WALL_T = 0.7;
const DEG = Math.PI / 180;
const MODES = {
  iso: { az: 45 * DEG, el: 38 * DEG },
  stage: { az: 0, el: 46 * DEG },
};

const loader = new THREE.TextureLoader();
const texCache = {};
export function tex(path) {
  if (!texCache[path]) {
    const t = loader.load(path);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache[path] = t;
  }
  return texCache[path];
}
const art = (name) => tex(`assets/chars/${name}.webp`);
const STICKER = { [TILE.MONSTER]: 'monster', [TILE.TREASURE]: 'treasure', [TILE.TRAP]: 'trap', [TILE.BLANK]: 'blank' };

function basis(mode) {
  const { az, el } = MODES[mode];
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
  const up = new THREE.Vector3().crossVectors(dir, right).normalize();
  const fwdH = new THREE.Vector3(Math.sin(az), 0, Math.cos(az)); // horizontal, toward the camera
  return { mode, az, el, dir, right, up, fwdH };
}
const BASES = { iso: basis('iso'), stage: basis('stage') };

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// Split a grouped geometry into one non-indexed geometry per group.
function splitGroups(geom) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const out = [];
  const groups = geom.groups.length ? geom.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
  // toNonIndexed keeps group ranges in index space, which match vertex order after expansion.
  for (const gr of groups) {
    const part = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const arr = attr.array.slice(gr.start * attr.itemSize, (gr.start + gr.count) * attr.itemSize);
      part.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize));
    }
    (out[gr.materialIndex] ||= []).push(part);
  }
  return out.map((list) => (list.length === 1 ? list[0] : A.Batcher.merge(list, ['position', 'normal', 'uv'])));
}

export class BoardView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.zoom = 1;
    this.zoomTo = null;
    this.target = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.follow = true;
    this.mode = null;
    this.B = BASES.iso;
    this.fit = { k: 40, target: new THREE.Vector3() };
    this.kCur = 40;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.45);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.tokens = new Map();
    this.flames = [];
    this.anims = [];
    this.pickable = [];
    this.highlights = [];
    this.lootMarks = {};
    this.onPick = null;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.safeOverride = null;
    this._safeSig = '';
    this._safeT = 0;

    this.bindControls();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------ camera
  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.W = w; this.H = h;
    this.renderer.setSize(w, h);
    this.aspect = w / h;
    const mode = this.aspect < 0.9 ? 'stage' : 'iso';
    if (mode !== this.mode) {
      this.mode = mode;
      this.B = BASES[mode];
      if (this.board) this.applyMode();
    }
    if (this.board) this.computeFit(true);
    this.updateCamera();
  }

  // Safe screen area (CSS px) not covered by HUD; measured from the DOM when
  // the HUD exists, with fallbacks. setSafeArea() overrides it.
  setSafeArea(s) { this.safeOverride = s; if (this.board) this.computeFit(false); }
  safeArea() {
    const W = this.W, H = this.H, cr = this.renderer.domElement.getBoundingClientRect();
    if (this.safeOverride) return { left: 0, right: 0, top: 0, bottom: 0, exclude: [], ...this.safeOverride };
    const portrait = W < H * 0.9;
    const s = portrait ? { top: 124, bottom: 134, left: 6, right: 6, exclude: [] } : { top: 104, bottom: 40, left: 16, right: 16, exclude: [] };
    const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' ? r : null; };
    const q = (sel) => document.querySelector(sel);
    const game = q('#game');
    if (game && game.classList.contains('active') !== false) {
      let top = 0;
      for (const sel of ['#topbar', '#players']) { const r = vis(q(sel)); if (r && r.top < H * 0.4) top = Math.max(top, r.bottom - cr.top); }
      if (top) s.top = top + 6;
      let bot = H;
      for (const sel of ['#me', '#ticker']) { const r = vis(q(sel)); if (r && r.top > H * 0.55) bot = Math.min(bot, r.top - cr.top); }
      if (bot < H) s.bottom = H - bot + 6;
      const o = vis(q('#others'));
      if (o && o.height > 10) {
        if (o.width > W * 0.4) s.top = Math.max(s.top, o.bottom - cr.top + 6);
        else s.exclude.push({ x0: o.left - cr.left - 4, y0: o.top - cr.top - 4, x1: o.right - cr.left + 8, y1: o.bottom - cr.top + 6 });
      }
      // landscape: the column of other players runs down the left side
      if (!portrait && o && o.height > 10) s.left = Math.max(s.left, o.right - cr.left + 10);
    }
    return s;
  }

  // Choose a scale and centre so every important point lands inside the safe
  // rect and outside the excluded HUD rects, as large as possible.
  computeFit(snap) {
    const W = this.W, H = this.H, sa = this.safeArea();
    this._safeSig = JSON.stringify(sa);
    const pts = this.fitPts[this.mode];
    const B = this.B;
    const uv = pts.map((p) => [p.dot(B.right), p.dot(B.up)]);
    const us = uv.map((a) => a[0]), vs = uv.map((a) => a[1]);
    const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs);
    const sl = sa.left, sr = W - sa.right, st = sa.top, sb = H - sa.bottom;
    const kMax = Math.min((sr - sl) / (maxU - minU), (sb - st) / (maxV - minV));
    let best = null;
    for (let k = kMax; k > kMax * 0.55 && !best; k *= 0.975) {
      const uLo = maxU - (sr - W / 2) / k, uHi = minU - (sl - W / 2) / k;
      const vLo = maxV - (H / 2 - st) / k, vHi = minV - (H / 2 - sb) / k;
      if (uLo > uHi + 1e-6 || vLo > vHi + 1e-6) continue;
      const cands = [];
      const N = 8;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const u0 = uLo + (uHi - uLo) * i / N, v0 = vLo + (vHi - vLo) * j / N;
        cands.push([u0, v0, Math.hypot(i / N - 0.5, j / N - 0.5)]);
      }
      cands.sort((a, b) => a[2] - b[2]);
      for (const [u0, v0] of cands) {
        let ok = true;
        for (const ex of sa.exclude || []) {
          for (const [u, v] of uv) {
            const x = W / 2 + (u - u0) * k, y = H / 2 - (v - v0) * k;
            if (x > ex.x0 && x < ex.x1 && y > ex.y0 && y < ex.y1) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (ok) { best = { k, u0, v0 }; break; }
      }
    }
    if (!best) best = { k: kMax * 0.55, u0: (minU + maxU) / 2, v0: (minV + maxV) / 2 };
    const t = B.right.clone().multiplyScalar(best.u0).addScaledVector(B.up, best.v0);
    t.addScaledVector(B.dir, (0.5 - t.y) / B.dir.y);
    this.fit = { k: best.k, target: t, box: { minU, maxU, minV, maxV } };
    if (snap) { this.kCur = best.k; }
    if (this.follow || snap) this.camTarget.copy(t);
    if (snap) this.target.copy(t);
  }

  updateCamera() {
    const k = (this.kCur || 40) * this.zoom;
    const hw = (this.W || 400) / 2 / k, hh = (this.H || 800) / 2 / k;
    this.camera.left = -hw; this.camera.right = hw; this.camera.top = hh; this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }

  bindControls() {
    const el = this.renderer.domElement;
    let drag = null, pinch = null, moved = 0;
    const pts = new Map();
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (pts.size === 1) { moved = 0; drag = { x: e.clientX, y: e.clientY }; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: this.zoom }; drag = null; moved = 99; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        this.zoom = THREE.MathUtils.clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.6, 3.2);
        this.zoomTo = null;
        this.updateCamera();
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      drag = { x: e.clientX, y: e.clientY };
      if (moved > 14) {
        this.follow = false;
        const k = this.kCur * this.zoom;
        this.camTarget.addScaledVector(this.B.right, -dx / k).addScaledVector(this.B.up, dy / k);
        this.clampTarget();
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        if (moved < 14 && this.onPick) this.pick(e);
        drag = null;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.6, 3.2);
      this.zoomTo = null;
      if (this.zoom <= 1.02) this.follow = true;
      this.updateCamera();
    }, { passive: false });
  }

  clampTarget() {
    if (!this.fit.box) return;
    const B = this.B, f = this.fit.target, b = this.fit.box;
    const d = this.camTarget.clone().sub(f);
    const du = THREE.MathUtils.clamp(d.dot(B.right), -(b.maxU - b.minU) / 2, (b.maxU - b.minU) / 2);
    const dv = THREE.MathUtils.clamp(d.dot(B.up), -(b.maxV - b.minV) / 2, (b.maxV - b.minV) / 2);
    this.camTarget.copy(f).addScaledVector(B.right, du).addScaledVector(B.up, dv);
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickable, false)[0];
    if (hit && hit.object.userData.pickId != null) this.onPick(hit.object.userData.pickId);
  }

  // Screen position (CSS px, viewport) of a world point; null if off-canvas.
  screenOfPoint(v) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    const p = v.clone().project(this.camera);
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  screenOf(playerId) {
    const tok = this.tokens.get(playerId);
    if (!tok || !tok.group.visible || !this.board) return null;
    const p = tok.group.position.clone();
    p.y += HERO_H + 0.12;
    return this.screenOfPoint(p);
  }
  screenOfTile(i) {
    if (!this.board || !this.disp || !this.disp[i]) return null;
    return this.screenOfPoint(this.tilePos(i));
  }

  // ------------------------------------------------------------ layout
  tilePos(i) {
    const d = this.disp[i];
    return new THREE.Vector3(d.x, this.tileTop(i), d.z);
  }
  isPlatform(i) { return i === 0 || i === this.board.bossIdx; }
  tileTop(i) { return i === this.board.bossIdx ? BOSS_TOP : i === 0 ? START_TOP : TOP; }

  layout() {
    const tiles = this.board.tiles, n = tiles.length - 1;
    // Mirror x so the boss always ends up on the right of the room (the HUD's
    // player column sits on the left).
    const sx = tiles[n].x >= (this.board.cols - 1) / 2 ? 1 : -1;
    this.sx = sx;
    const raw = tiles.map((t) => new THREE.Vector3(sx * t.x * S, 0, -t.z * S));
    const sqDist = (p, q) => Math.hypot(Math.max(Math.abs(p.x - q.x) - T / 2, 0), Math.max(Math.abs(p.z - q.z) - T / 2, 0));
    // Start and boss platforms sit off the ends of the path: start toward the
    // front of the room, boss toward the back, clear of every tile.
    const place = (i, j, fwd, clear) => {
      const dir = raw[i].clone().sub(raw[j]).normalize().multiplyScalar(fwd > 0 ? 0.2 : 0.45).add(new THREE.Vector3(0, 0, fwd)).normalize();
      const p = raw[i].clone();
      for (let s = 0; s < 200; s++) {
        let ok = true;
        for (let k = 1; k < n; k++) if (sqDist(p, raw[k]) < clear) { ok = false; break; }
        if (ok) break;
        p.addScaledVector(dir, 0.05);
      }
      return p;
    };
    raw[0] = place(0, 1, 1, START_R + 0.32 + 0.3);
    raw[n] = place(n, n - 1, -1, BOSS_R + 0.6 + 0.3);
    const box = new THREE.Box3();
    raw.forEach((v, i) => { const r = i === 0 ? START_R + 0.4 : i === n ? BOSS_R + 0.6 : T / 2; box.expandByPoint(v.clone().add(new THREE.Vector3(r, 0, r))); box.expandByPoint(v.clone().sub(new THREE.Vector3(r, 0, r))); });
    const c = box.getCenter(new THREE.Vector3()); c.y = 0;
    this.disp = raw.map((v) => v.sub(c));
    box.min.sub(c); box.max.sub(c);
    this.bbox = box;
    // Important points per framing: tile corners, heads above every spot,
    // platforms and the boss sprite.
    this.fitPts = {};
    this.spriteHull = {};
    for (const mode of ['iso', 'stage']) {
      const B = BASES[mode], pts = [], hull = [];
      const head = (p, w, h) => { const a = p.clone().addScaledVector(B.up, h); hull.push(a.clone().addScaledVector(B.right, w / 2), a.clone().addScaledVector(B.right, -w / 2), p.clone().addScaledVector(B.right, w / 2), p.clone().addScaledVector(B.right, -w / 2)); };
      this.disp.forEach((d, i) => {
        const top = this.tileTop(i);
        if (this.isPlatform(i)) {
          const r = i === 0 ? START_R + 0.35 : BOSS_R + 0.55;
          for (let a = 0; a < 16; a++) pts.push(new THREE.Vector3(d.x + Math.cos(a / 16 * Math.PI * 2) * r, a % 2 ? 0 : top, d.z + Math.sin(a / 16 * Math.PI * 2) * r));
          const front = new THREE.Vector3(d.x, top, d.z).addScaledVector(B.fwdH, i === 0 ? 0 : 0.5);
          for (const s of [-1, 0, 1]) head(front.clone().addScaledVector(B.right, s * (i === 0 ? 0.9 : 0.7)), 1.3, HEAD);
          if (i !== 0) head(new THREE.Vector3(d.x, top, d.z).addScaledVector(B.fwdH, -0.85), BOSS_H * 0.98, BOSS_H + 0.1);
        } else {
          for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(new THREE.Vector3(d.x + sx * T / 2, top, d.z + sz * T / 2));
          pts.push(new THREE.Vector3(d.x, 0, d.z).addScaledVector(B.fwdH, T * 0.72));
          head(new THREE.Vector3(d.x, top, d.z), 1.3, HEAD);
        }
      });
      this.fitPts[mode] = pts.concat(hull);
      this.spriteHull[mode] = hull;
    }
  }

  // ------------------------------------------------------------ floor build
  setFloor(game) {
    this.game = game;
    this.board = game.board;
    const pal = A.PALETTES[game.floor] || A.PALETTES[1];
    this.pal = pal;
    this.theme = game.boss.def.theme;
    this.disposeWorld();
    this.tokens.clear();
    this.flames = [];
    this.pickable = [];
    this.highlights = [];
    this.lootMarks = {};
    this.enemy = null;
    this.liquids = [];
    this.floaters = [];
    this.spinners = [];
    this.R = makeRng(game.floor * 977 + this.board.tiles.length).next;

    this.layout();
    if (this.scene.background?.isTexture) this.scene.background.dispose();
    this.scene.background = A.skyTex(pal);
    this.hemi.color.set(pal.hemiSky);
    this.hemi.groundColor.set(pal.hemiGround);
    this.sun.color.set(pal.sun);

    this.tex = {
      tiles: A.tileTopAtlas(pal, game.floor),
      stickers: A.stickerAtlas(pal),
      floor: A.floorTex(pal, game.floor),
      wall: A.wallTex(pal, game.floor),
      startTop: A.platformTex(pal, 'start'),
      bossTop: A.platformTex(pal, 'boss'),
    };
    this.mats = {
      lit: A.toon({ vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      tileTop: A.toon({ map: this.tex.tiles, vertexColors: true }),
      startTop: A.toon({ map: this.tex.startTop, vertexColors: true }),
      bossTop: A.toon({ map: this.tex.bossTop, vertexColors: true }),
      wall: A.toon({ map: this.tex.wall, vertexColors: true }),
      ink: A.inkMaterial(),
      sticker: new THREE.MeshBasicMaterial({ map: this.tex.stickers, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    };
    this.mats.glow.userData.noShadow = true;

    this.buildRoom(pal);
    this.buildTiles(pal);
    this.buildPlatforms(pal);
    this.buildProps(pal);
    this.buildAtmosphere(pal);
    this.applyMode();

    // Boss
    this.bossSprite = this.makeSprite(art(game.boss.def.art), BOSS_H);
    this.world.add(this.bossSprite);
    this.bossShadow = this.makeShadow(1.5);
    this.world.add(this.bossShadow);
    this.placeBoss();

    this.syncPlayers(game, true);
    this.syncLoot(game);
    this.follow = true;
    this.computeFit(true);
    this.zoom = 0.8;
    this.zoomTo = 1;
    this.updateCamera();
  }

  disposeWorld() {
    this.world.traverse((o) => {
      if (o.geometry && !o.isSprite && !o.userData.sharedGeo) o.geometry.dispose();
    });
    if (this.tex) for (const t of Object.values(this.tex)) t.dispose();
    if (this._hitGeo) this._hitGeo.dispose();
    if (this.mats) for (const m of Object.values(this.mats)) m.dispose();
    this.world.clear();
  }

  addBatch(batch, parent = this.world, opts) {
    const meshes = batch.build(this.mats, opts);
    for (const m of meshes) parent.add(m);
    return meshes;
  }

  // Room: floor, back walls with coping boulders and wall decorations.
  buildRoom(pal) {
    const bb = this.bbox, R = this.R;
    // Walls are placed past every sprite's extent in both framings (+ torches).
    let minX = bb.min.x - 2.3, minZ = bb.min.z - 2.3;
    for (const mode of ['iso', 'stage']) for (const p of this.spriteHull[mode]) { minX = Math.min(minX, p.x - 0.75); minZ = Math.min(minZ, p.z - 0.75); }
    this.room = { wx: minX, wz: minZ, ex: bb.max.x + 2.3, fz: bb.max.z + 1.9, fx: bb.max.x + 1.9 };
    const room = this.room;

    // floor
    // Floor: stops at the back walls in the iso view (sky shows above them);
    // runs out sideways in the stage view where the side walls are edge-on.
    this.mats.floor = A.toon({ map: this.tex.floor });
    const floorMesh = (x0, x1, z0, z1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 7, -pos.getZ(i) / 7);
      const m = new THREE.Mesh(g, this.mats.floor);
      m.receiveShadow = true;
      this.world.add(m);
      return m;
    };
    this.floors = {
      iso: floorMesh(room.wx - WALL_T, room.wx + 90, room.wz - WALL_T, room.wz + 90),
      stage: floorMesh(-90, 90, room.wz - WALL_T, room.wz + 90),
    };


    // shadow camera covers the room
    const cx = (room.wx + room.ex) / 2, cz = (room.wz + room.fz) / 2;
    const half = Math.max(room.ex - room.wx, room.fz - room.wz) / 2 + 2;
    this.sun.position.set(cx - 7, 16, cz + 9);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 60;
    sc.updateProjectionMatrix();

    this.walls = {};
    const far = 18;
    // north (back) wall spans x; west wall spans z; east wall only for the stage framing
    this.walls.north = this.buildWall(pal, room.wx - WALL_T, room.ex + far, room.wz, 'z');
    this.walls.west = this.buildWall(pal, room.wz - WALL_T, room.fz + far, room.wx, 'x');
    this.walls.northExt = this.buildWall(pal, room.wx - far, room.wx - WALL_T, room.wz, 'z');
    // low boulder edge on the open front sides
    this.edges = { south: new THREE.Group(), east: new THREE.Group(), southExt: new THREE.Group() };
    for (const [key, a0, a1, fixed, axis] of [['south', room.wx, room.ex + far, room.fz, 'z'], ['east', room.wz, room.fz + far, room.fx, 'x'], ['southExt', room.wx - far, room.wx, room.fz, 'z']]) {
      const b = new A.Batcher();
      for (let a = a0 + 0.3; a < a1; a += 0.55 + R() * 0.25) {
        const pr = A.boulder(pal, 0.2 + R() * 0.1, R);
        const p = axis === 'z' ? new THREE.Vector3(a, 0, fixed + (R() - 0.5) * 0.2) : new THREE.Vector3(fixed + (R() - 0.5) * 0.2, 0, a);
        pr.addTo(b, new THREE.Matrix4().makeTranslation(p.x, 0, p.z));
      }
      this.addBatch(b, this.edges[key]);
      this.world.add(this.edges[key]);
    }
  }

  // One straight wall. axis 'z' = wall runs along x at z=fixed (faces +z);
  // axis 'x' = runs along z at x=fixed (faces +x, or -x when flip = -1).
  buildWall(pal, a0, a1, fixed, axis, flip = 1) {
    const grp = new THREE.Group(), deco = new THREE.Group();
    const b = new A.Batcher(), R = this.R;
    const len = a1 - a0, mid = (a0 + a1) / 2;
    const toWorld = (along, y, out) => axis === 'z' ? new THREE.Vector3(along, y, fixed + out) : new THREE.Vector3(fixed + out * flip, y, along);
    const rotY = axis === 'z' ? 0 : flip > 0 ? Math.PI / 2 : -Math.PI / 2;
    const place = (along, y, out, ry = 0) => new THREE.Matrix4().compose(toWorld(along, y, out), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY + ry, 0)), new THREE.Vector3(1, 1, 1));
    // brick face (textured, uv in world units)
    const face = new THREE.PlaneGeometry(len, WALL_H, 1, 1);
    const fu = face.attributes.uv;
    for (let i = 0; i < fu.count; i++) fu.setXY(i, (fu.getX(i) * len) / 2.6, (fu.getY(i) * WALL_H) / 2.6);
    b.add(face, place(mid, WALL_H / 2, 0), { key: 'wall', color: 0xffffff });
    // wall body behind the face
    b.add(new THREE.BoxGeometry(len, WALL_H, WALL_T), place(mid, WALL_H / 2, -WALL_T / 2 - 0.01), { color: A.shade(pal.wallDeep, -0.05) });
    // skirting stones along the base
    b.add(new THREE.BoxGeometry(len, 0.34, 0.24), place(mid, 0.17, 0.1), { color: A.shade(pal.wallDeep, 0.04), ink: 0.03 });
    // coping boulders on top (the card-frame look)
    for (let a = a0 + 0.2; a < a1; a += 0.62 + R() * 0.2) {
      const s = 0.3 + R() * 0.08;
      b.add(new THREE.DodecahedronGeometry(s, 0), place(a, WALL_H + s * 0.35, -WALL_T / 2).multiply(new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(), R() * 6, R())), new THREE.Vector3(1.25, 0.8, 0.95))), { color: R() < 0.5 ? pal.cap : A.shade(pal.cap, -0.06), ink: 0.035, flat: true });
    }
    // decorations along the inner face, only over the room itself
    const roomA0 = Math.max(a0, axis === 'z' ? this.room.wx : this.room.wz);
    const roomA1 = Math.min(a1, axis === 'z' ? this.room.ex + 6 : this.room.fz + 6);
    const banner = (this.tex.banner ||= A.bannerTex(pal));
    const win = (pal.key === 'sanctum' || pal.key === 'forge' || pal.key === 'hive') ? (this.tex.window ||= A.windowTex(pal)) : null;
    let k = 0;
    for (let a = roomA0 + 1.5; a < roomA1; a += 2.7, k++) {
      if (k % 2 === 0) {
        const tp = A.torchProp(pal);
        tp.addTo(b, place(a, 2.35, 0));
        this.addFlames(tp, place(a, 2.35, 0), deco);
      } else if (win && k % 4 === 1) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.65), new THREE.MeshBasicMaterial({ map: win, transparent: true, alphaTest: 0.4 }));
        m.applyMatrix4(place(a, 2.3, 0.04));
        deco.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.1), new THREE.MeshBasicMaterial({ map: banner, transparent: true, alphaTest: 0.4 }));
        m.applyMatrix4(place(a, 2.45, 0.06));
        m.userData.sway = R() * 6;
        deco.add(m);
      }
    }
    this.addBatch(b, grp, { castShadow: false });
    grp.add(deco);
    grp.userData.deco = deco;
    this.world.add(grp);
    return grp;
  }

  // Flame sprites (painted flame + soft glow) at a prop's flame anchors.
  addFlames(prop, matrix, parent = this.world) {
    for (const f of prop.flames) {
      const p = new THREE.Vector3(...f.p).applyMatrix4(matrix);
      const colors = f.colors || this.pal.flame;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex(), color: colors[1], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.copy(p).add(new THREE.Vector3(0, f.size * 0.45, 0));
      glow.scale.setScalar(f.size * 2.6);
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.flameTex(colors), transparent: true, depthWrite: false }));
      fl.center.set(0.5, 0.08);
      fl.position.copy(p);
      fl.scale.set(f.size * 0.75, f.size * 1.12, 1);
      parent.add(glow, fl);
      this.flames.push({ fl, glow, size: f.size, seed: this.R() * 10 });
    }
  }

  buildTiles(pal) {
    const R = this.R;
    const slab = new THREE.ExtrudeGeometry(roundedRectShape(T - 0.16, T - 0.16, 0.3), { depth: TOP - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 5 });
    slab.rotateX(-Math.PI / 2);
    slab.translate(0, 0.08, 0);
    const [caps, sides] = splitGroups(slab);
    const b = new A.Batcher();
    const top = new THREE.Color(pal.tile), rim = new THREE.Color(A.shade(pal.tile, 0.05)), side = new THREE.Color(pal.tileSide), deep = new THREE.Color(pal.tileDeep);
    const hitGeo = this._hitGeo = new THREE.BoxGeometry(T + 0.2, 0.7, T + 0.2);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const arrowShape = new THREE.Shape(); arrowShape.moveTo(-0.12, -0.1); arrowShape.lineTo(0.14, 0); arrowShape.lineTo(-0.12, 0.1); arrowShape.lineTo(-0.06, 0); arrowShape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrowShape); arrowGeo.rotateX(-Math.PI / 2);
    this.board.tiles.forEach((t, i) => {
      const d = this.disp[i];
      if (!this.isPlatform(i)) {
        const v = Math.floor(R() * 4), col = v % 2, row = Math.floor(v / 2);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(d.x, (R() - 0.5) * 0.03, d.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (R() - 0.5) * 0.06, 0)), new THREE.Vector3(1, 1, 1));
        b.add(caps, m, { key: 'tileTop', uvFn: (p) => [(p.x / T + 0.5 + col) / 2, 1 - (row + 0.5 + p.z / T) / 2], colorFn: (p, c) => c.setRGB(1, 1, 1) });
        b.add(sides, m, { colorFn: (p, c) => c.copy(p.y > TOP - 0.06 ? rim : p.y > TOP - 0.13 ? top : p.y > 0.12 ? side : deep), ink: 0.045 });
      }
      const plat = this.isPlatform(i);
      const hs = plat ? (i === 0 ? START_R : BOSS_R) * 2 : T + 0.2;
      const hit = new THREE.Mesh(plat ? new THREE.BoxGeometry(hs, 1, hs) : hitGeo, hitMat);
      if (!plat) hit.userData.sharedGeo = true;
      hit.position.set(d.x, plat ? this.tileTop(i) / 2 : 0.25, d.z);
      hit.userData.pickId = i;
      this.world.add(hit);
      this.pickable.push(hit);
      // direction arrows painted in the gap toward the next tile
      if (i < this.board.tiles.length - 1) {
        const a = this.disp[i], c = this.disp[i + 1];
        const dir = new THREE.Vector3().subVectors(c, a); const len = dir.length(); dir.normalize();
        const r0 = i === 0 ? START_R + 0.3 : T / 2 + 0.04, r1 = i + 1 === this.board.bossIdx ? BOSS_R + 0.55 : T / 2 + 0.04;
        const along = r0 + (len - r0 - r1) / 2;
        const ang = Math.atan2(-dir.z, dir.x);
        const gapY = Math.min(this.tileTop(i), this.tileTop(i + 1)) - 0.02;
        const mm = new THREE.Matrix4().compose(new THREE.Vector3(a.x + dir.x * along, gapY > 0.6 ? 0.42 : 0.3, a.z + dir.z * along), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0)), new THREE.Vector3(1.4, 1, 1.4));
        b.add(arrowGeo, mm, { key: 'glow', color: '#fff4d0' });
        b.add(arrowGeo, mm.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0.02, -0.01, 0), new THREE.Quaternion(), new THREE.Vector3(1.45, 1, 1.6))), { key: 'glow', color: A.INK });
      }
    });
    this.addBatch(b);
  }

  buildPlatforms(pal) {
    const b = new A.Batcher(), R = this.R;
    const side = new THREE.Color(pal.tileSide), top = new THREE.Color(pal.tile), deep = new THREE.Color(pal.tileDeep);
    // Start: two-tier round stone platform ringed by boulders.
    const s = this.disp[0];
    const at = (p, y = 0) => new THREE.Matrix4().makeTranslation(p.x, y, p.z);
    {
      const lower = new THREE.CylinderGeometry(START_R + 0.3, START_R + 0.38, 0.26, 44);
      b.add(lower, at(s, 0.13), { colorFn: (p, c) => c.copy(p.y > 0.1 ? top : side), ink: 0.05 });
      const upper = new THREE.CylinderGeometry(START_R, START_R + 0.04, 0.24, 44);
      const [uSide, uTop] = splitGroups(upper);
      b.add(uSide, at(s, 0.38), { colorFn: (p, c) => c.copy(p.y > 0.09 ? top : side), ink: 0.045 });
      b.add(uTop, at(s, 0.38), { key: 'startTop', color: 0xffffff });
      for (let a = 0; a < 18; a++) {
        const ang = a / 18 * Math.PI * 2 + R() * 0.1, r = START_R + 0.5;
        const pr = A.boulder(pal, 0.17 + R() * 0.06, R);
        pr.addTo(b, new THREE.Matrix4().makeTranslation(s.x + Math.cos(ang) * r, 0, s.z + Math.sin(ang) * r));
      }
    }
    // Boss: three octagonal tiers, the top one painted with the boss rune.
    const d = this.disp[this.board.bossIdx];
    const radii = [BOSS_R + 0.6, BOSS_R + 0.3, BOSS_R];
    radii.forEach((r, k) => {
      const g = new THREE.CylinderGeometry(r, r + 0.05, 0.3, 8);
      g.rotateY(Math.PI / 8);
      const [gs, gt] = splitGroups(g);
      const tierTop = new THREE.Color(A.shade(pal.tileSide, 0.08 + k * 0.03));
      b.add(gs, at(d, 0.15 + k * 0.3), { colorFn: (p, c) => c.copy(p.y > 0.1 ? tierTop : k === 0 ? deep : side), ink: 0.05 });
      if (k === 2) b.add(gt, at(d, 0.15 + k * 0.3), { key: 'bossTop', color: 0xffffff });
      else b.add(gt, at(d, 0.15 + k * 0.3), { color: tierTop });
    });
    this.addBatch(b);
    // spinning rune rings
    const ring = (r0, r1, color, p, y, seg = 64) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, seg), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, y, p.z);
      this.world.add(m);
      return m;
    };
    this.spinners.push({ o: ring(START_R - 0.2, START_R - 0.1, 0x8ac8ff, s, START_TOP + 0.012), v: 0.35 });
    this.spinners.push({ o: ring(BOSS_R - 0.22, BOSS_R - 0.1, new THREE.Color(pal.boss), d, BOSS_TOP + 0.012, 8), v: -0.3 });
    // braziers on the dais (live group: repositioned per framing)
    this.braziers = [];
    for (let k = 0; k < 2; k++) {
      const pr = A.brazierProp(pal), grp = new THREE.Group(), bb = new A.Batcher();
      pr.addTo(bb, new THREE.Matrix4());
      this.addBatch(bb, grp);
      this.addFlames(pr, new THREE.Matrix4(), grp);
      const light = new THREE.PointLight(new THREE.Color(pal.bossFlame[1]), 6, 7, 1.6);
      light.position.set(0, 1.9, 0);
      grp.add(light);
      this.world.add(grp);
      this.braziers.push({ grp, light, seed: k * 3.3 });
    }
  }

  // Occlusion guard: a prop may stand only where, in both framings, it
  // doesn't cover any tile/hero area that's further from the camera.
  clearOf(box) {
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    for (const mode of ['iso', 'stage']) {
      const B = BASES[mode];
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, dmax = -Infinity;
      for (const c of corners) { const u = c.dot(B.right), v = c.dot(B.up), d = c.dot(B.dir); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); dmax = Math.max(dmax, d); }
      for (const it of this.occ[mode]) {
        if (u1 < it.u0 || u0 > it.u1 || v1 < it.v0 || v0 > it.v1) continue;
        if (dmax > it.d - 0.2) return false;
      }
    }
    return true;
  }
  buildOcc() {
    this.occ = {};
    for (const mode of ['iso', 'stage']) {
      const B = BASES[mode], list = [];
      this.disp.forEach((d, i) => {
        const plat = this.isPlatform(i), r = plat ? (i === 0 ? START_R + 0.4 : BOSS_R + 0.6) : T * 0.75;
        const c = new THREE.Vector3(d.x, 0, d.z);
        const h = i === this.board.bossIdx ? BOSS_H + BOSS_TOP : HEAD + this.tileTop(i);
        const pts = [];
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(c.clone().add(new THREE.Vector3(sx * r, 0, sz * r)));
        pts.push(c.clone().addScaledVector(B.up, h).addScaledVector(B.right, r), c.clone().addScaledVector(B.up, h).addScaledVector(B.right, -r));
        const us = pts.map((p) => p.dot(B.right)), vs = pts.map((p) => p.dot(B.up));
        list.push({ u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), d: c.dot(B.dir) - r * 0.3 });
      });
      this.occ[mode] = list;
    }
  }

  footprintFree(x, z, r) {
    const n = this.board.tiles.length - 1;
    for (let i = 0; i <= n; i++) {
      const d = this.disp[i];
      if (i === 0 || i === n) { if (Math.hypot(x - d.x, z - d.z) < (i === 0 ? START_R + 0.75 : BOSS_R + 0.85) + r) return false; continue; }
      const dx = Math.max(Math.abs(x - d.x) - T / 2, 0), dz = Math.max(Math.abs(z - d.z) - T / 2, 0);
      if (Math.hypot(dx, dz) < r + 0.22) return false;
    }
    // stay clear of the boss braziers
    for (const p of this.placed || []) {
      if (p.rect) { if (Math.abs(x - p.x) < p.rect[0] + r && Math.abs(z - p.z) < p.rect[1] + r) return false; }
      else if (Math.hypot(x - p.x, z - p.z) < r + p.r) return false;
    }
    return true;
  }

  buildProps(pal) {
    const R = this.R, room = this.room, set = A.THEME_PROPS[pal.key];
    this.buildOcc();
    this.placed = [];
    const b = new A.Batcher();
    const x0 = room.wx + 0.55, x1 = room.fx - 0.2, z0 = room.wz + 0.55, z1 = room.fz - 0.3;
    // Liquids in empty grid cells inside the board (ladder gaps) and pockets around it.
    const occupied = new Set(this.board.tiles.map((t) => `${t.x},${t.z}`));
    const cols = this.board.cols, rows = this.board.rows;
    const liquidKind = { forge: 'lava', mire: 'water', hive: 'honey' }[pal.key];
    if (liquidKind) {
      const runs = [];
      for (let z = 0; z < rows; z++) {
        let start = null;
        for (let x = 0; x <= cols; x++) {
          const free = x < cols && !occupied.has(`${x},${z}`);
          if (free && start === null) start = x;
          if (!free && start !== null) { if (x - start >= 2) runs.push({ x0: start, x1: x - 1, z }); start = null; }
        }
      }
      for (let x = 0; x < cols; x++) {
        let start = null;
        for (let z = 0; z <= rows; z++) {
          const free = z < rows && !occupied.has(`${x},${z}`);
          if (free && start === null) start = z;
          if (!free && start !== null) { if (z - start >= 2) runs.push({ z0: start, z1: z - 1, x }); start = null; }
        }
      }
      const off = this.disp[1].clone().add(new THREE.Vector3(-this.sx * this.board.tiles[1].x * S, 0, this.board.tiles[1].z * S));
      for (const r of runs) {
        let cx, cz, w, d;
        if (r.z !== undefined) { cx = off.x + this.sx * (r.x0 + r.x1) / 2 * S; cz = off.z - r.z * S; w = (r.x1 - r.x0 + 1) * S - 0.55; d = S - T + 0.95; }
        else { cz = off.z - (r.z0 + r.z1) / 2 * S; cx = off.x + this.sx * r.x * S; d = (r.z1 - r.z0 + 1) * S - 0.55; w = S - T + 0.95; }
        this.addLiquid(liquidKind, cx, cz, w, d);
        this.placed.push({ x: cx, z: cz, r: Math.min(w, d) / 2, rect: [w / 2, d / 2] });
      }
      // a few pockets out in the room
      for (let k = 0, tries = 0; k < 3 && tries < 80; tries++) {
        const w = 1.4 + R() * 1.2, d = 0.9 + R() * 0.7, x = x0 + w / 2 + R() * (x1 - x0 - w), z = z0 + d / 2 + R() * (z1 - z0 - d);
        if (!this.footprintFree(x, z, Math.max(w, d) / 2 + 0.1)) continue;
        this.addLiquid(liquidKind, x, z, w, d, true);
        this.placed.push({ x, z, r: Math.max(w, d) / 2 });
        k++;
      }
    }
    if (pal.key === 'sanctum') {
      for (let k = 0, tries = 0; k < 4 && tries < 80; tries++) {
        const r = 0.45 + R() * 0.25, x = x0 + r + R() * (x1 - x0 - 2 * r), z = z0 + r + R() * (z1 - z0 - 2 * r);
        if (!this.footprintFree(x, z, r)) continue;
        const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.75, r, 6), new THREE.MeshBasicMaterial({ color: pal.trim, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z);
        this.world.add(m);
        this.spinners.push({ o: m, v: 0.2 * (k % 2 ? 1 : -1) });
        k++;
      }
    }
    // Big and small props: rejection-sampled into free, non-occluding spots.
    const tryPlace = (make, count, maxTries, hugWalls) => {
      let placedN = 0;
      for (let t = 0; t < maxTries && placedN < count; t++) {
        let x, z;
        if (hugWalls && R() < 0.7) {
          if (R() < 0.5) { x = x0 + R() * 1.2; z = z0 + R() * (z1 - z0); } else { z = z0 + R() * 1.2; x = x0 + R() * (x1 - x0); }
        } else { x = x0 + R() * (x1 - x0); z = z0 + R() * (z1 - z0); }
        const pr = make(pal, R);
        const ry = R() * Math.PI * 2;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
        const box = pr.bounds().applyMatrix4(m);
        const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
        if (box.min.x < room.wx + 0.15 || box.min.z < room.wz + 0.15) continue;
        if (!this.footprintFree(x, z, r)) continue;
        if (!this.clearOf(box)) continue;
        pr.addTo(b, m);
        this.addFlames(pr, m);
        this.placed.push({ x, z, r: r + 0.1 });
        placedN++;
      }
    };
    const area = (x1 - x0) * (z1 - z0);
    const nBig = Math.round(area / 10), nSmall = Math.round(area / 9);
    tryPlace((p, r) => set.big[Math.floor(r() * set.big.length)](p, r), nBig, 500, true);
    tryPlace((p, r) => (r() < 0.35 ? A.boulderPile(p, r, 2 + Math.floor(r() * 2), 0.26) : set.small[Math.floor(r() * set.small.length)](p, r)), nSmall, 600, false);
    this.addBatch(b);
    // Floating crystals in the sanctum / amber motes in the hive (live meshes).
    if (pal.key === 'sanctum' || pal.key === 'mire') {
      const cols = pal.key === 'sanctum' ? ['#ff7ae0', '#6ae8ff', '#c49aff'] : ['#f4ff6a'];
      for (let k = 0, tries = 0; k < (pal.key === 'sanctum' ? 6 : 0) && tries < 200; tries++) {
        const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), y = 1.4 + R() * 1.2;
        const box = new THREE.Box3(new THREE.Vector3(x - 0.3, y - 0.5, z - 0.3), new THREE.Vector3(x + 0.3, y + 0.7, z + 0.3));
        if (!this.footprintFree(x, z, 0.3) || !this.clearOf(box)) continue;
        const g = new THREE.OctahedronGeometry(0.22, 0); g.scale(1, 1.8, 1);
        const bb = new A.Batcher(); bb.add(g, new THREE.Matrix4(), { key: 'glow', color: cols[k % cols.length], ink: 0.03, flat: true });
        const grp = new THREE.Group(); this.addBatch(bb, grp, { castShadow: false });
        grp.position.set(x, y, z);
        const sh = this.makeShadow(0.5); sh.position.set(x, 0.02, z); this.world.add(sh);
        this.world.add(grp);
        this.floaters.push({ o: grp, y, seed: R() * 6 });
        this.placed.push({ x, z, r: 0.4 });
        k++;
      }
    }
  }

  addLiquid(kind, x, z, w, d, round = false) {
    const r = Math.min(w, d) * (round ? 0.48 : 0.3);
    const shape = roundedRectShape(w, d, r);
    const g = new THREE.ShapeGeometry(shape, 6); g.rotateX(-Math.PI / 2);
    const rim = new THREE.ShapeGeometry(roundedRectShape(w + 0.16, d + 0.16, r + 0.08), 6); rim.rotateX(-Math.PI / 2);
    const rimM = new THREE.Mesh(rim, new THREE.MeshBasicMaterial({ color: A.INK }));
    rimM.position.set(x, 0.012, z);
    const t = A.liquidTex(kind); t.repeat.set(w / 2, d / 2);
    const mat = new THREE.MeshBasicMaterial({ map: t });
    const m = new THREE.Mesh(g, mat);
    // shape uvs are in world units; normalise to 0..1 over the pool
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / d + 0.5);
    m.position.set(x, 0.022, z);
    this.world.add(rimM, m);
    this.liquids.push({ tex: t, kind, mat });
    this.tex['liquid' + this.liquids.length] = t;
    if (kind === 'water') {
      const b = new A.Batcher(), R = this.R;
      for (let i = 0; i < Math.max(1, Math.round(w * d / 2)); i++) {
        const lx = x + (R() - 0.5) * (w - 0.5), lz = z + (R() - 0.5) * (d - 0.4);
        const pad = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12, 1, false, 0.5, Math.PI * 1.8);
        b.add(pad, new THREE.Matrix4().makeTranslation(lx, 0.04, lz), { color: '#6ad04a', ink: 0.02 });
      }
      this.addBatch(b, this.world, { castShadow: false });
    }
  }

  buildAtmosphere(pal) {
    const P = pal.motes, room = this.room, R = this.R;
    const n = P.n, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
    const box = { x0: room.wx, x1: room.fx + 1, z0: room.wz, z1: room.fz + 1 };
    for (let i = 0; i < n; i++) { pos[i * 3] = box.x0 + R() * (box.x1 - box.x0); pos[i * 3 + 1] = R() * 5; pos[i * 3 + 2] = box.z0 + R() * (box.z1 - box.z0); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: P.color, size: P.size, map: A.sparkTex(), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.motes = new THREE.Points(g, mat);
    this.motes.userData = { ...P, box, seeds: Float32Array.from({ length: n }, () => R() * 100) };
    this.motes.frustumCulled = false;
    this.world.add(this.motes);
  }

  // Everything that depends on the camera framing.
  applyMode() {
    if (!this.board) return;
    const B = this.B, stage = this.mode === 'stage';
    this.floors.iso.visible = !stage;
    this.floors.stage.visible = stage;
    // stage view: one long back wall, no side walls (they'd be edge-on)
    this.walls.west.visible = !stage;
    this.walls.northExt.visible = stage;
    this.edges.east.visible = !stage;
    this.edges.southExt.visible = stage;
    // stickers + START label oriented to read upright on screen
    if (this.stickerMesh) { this.world.remove(this.stickerMesh); this.stickerMesh.geometry.dispose(); }
    const b = new A.Batcher();
    const plane = new THREE.PlaneGeometry(1.24, 1.24); plane.rotateX(-Math.PI / 2);
    this.board.tiles.forEach((t, i) => {
      if (this.isPlatform(i)) return;
      const k = A.STICKER_INDEX[STICKER[t.type]] ?? 3, col = k % 2, row = Math.floor(k / 2);
      const d = this.disp[i];
      const m = new THREE.Matrix4().compose(new THREE.Vector3(d.x, TOP + 0.012, d.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, B.az, 0)), new THREE.Vector3(1, 1, 1));
      b.add(plane, m, { key: 'sticker', uvFn: (p) => [(p.x / 1.24 + 0.5 + col) / 2, 1 - (row + 0.5 + p.z / 1.24) / 2] });
    });
    const [mesh] = b.build(this.mats, { castShadow: false, receiveShadow: false });
    mesh.renderOrder = 1;
    this.stickerMesh = mesh;
    this.world.add(mesh);
    if (this.startLabel) { this.world.remove(this.startLabel); this.startLabel.geometry.dispose(); this.startLabel.material.dispose(); }
    this.tex.label ||= A.labelTex('START', '#ffe36a');
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), new THREE.MeshBasicMaterial({ map: this.tex.label, transparent: true, depthWrite: false }));
    lab.rotation.set(-Math.PI / 2, 0, B.az, 'YXZ');
    lab.rotation.set(0, 0, 0);
    lab.quaternion.setFromEuler(new THREE.Euler(0, B.az, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    const s = this.disp[0];
    lab.position.set(s.x, START_TOP + 0.02, s.z).addScaledVector(B.fwdH, START_R * 0.62);
    lab.renderOrder = 2;
    this.startLabel = lab;
    this.world.add(lab);
    // braziers flank the dais, slightly behind the heroes' spot
    const d = this.disp[this.board.bossIdx];
    this.braziers.forEach((br, k) => {
      const sgn = k ? 1 : -1;
      br.grp.position.set(d.x, BOSS_TOP - 0.3, d.z).addScaledVector(B.right, sgn * (BOSS_R + 0.32)).addScaledVector(B.fwdH, -0.45);
      br.grp.position.y = 0.3;
    });
    this.placeBoss();
    if (this.game) this.syncPlayers(this.game, true);
    if (this.game) this.syncLoot(this.game);
  }

  placeBoss() {
    if (!this.bossSprite || !this.board) return;
    const d = this.disp[this.board.bossIdx], B = this.B;
    const p = new THREE.Vector3(d.x, BOSS_TOP, d.z).addScaledVector(B.fwdH, -0.85);
    this.bossSprite.position.copy(p);
    this.bossSprite.userData.baseX = p.x;
    this.bossSprite.userData.baseZ = p.z;
    this.bossShadow.position.set(p.x, BOSS_TOP + 0.015, p.z);
    this.bossFront = B.fwdH.clone().multiplyScalar(0.55);
  }

  // Guild banner texture. main.js can supply a richer painter via setBannerPainter().
  setBannerPainter(fn) { this.bannerPainter = fn; this._flagCache = {}; }
  flagTexture(g) {
    this._flagCache ||= {};
    const key = `${g.id}:${g.name}`;
    if (this._flagCache[key]) return this._flagCache[key];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 192;
    const banner = g.banner || { field: g.color, accent: '#f2c443', pattern: 'plain', emblem: 'dragon', emblemColor: '#f4ecdf' };
    if (this.bannerPainter) this.bannerPainter(c, banner);
    else {
      const x = c.getContext('2d');
      x.fillStyle = '#5a4030'; x.fillRect(60, 0, 8, 192);
      x.fillStyle = banner.field;
      x.beginPath(); x.moveTo(14, 16); x.lineTo(114, 16); x.lineTo(114, 170); x.lineTo(64, 140); x.lineTo(14, 170); x.closePath(); x.fill();
      x.strokeStyle = banner.accent; x.lineWidth = 8; x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this._flagCache[key] = t;
    return t;
  }

  makeSprite(texture, height) {
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.05 });
    const s = new THREE.Sprite(mat);
    s.userData.h = height;
    const fit = () => {
      const img = texture.image;
      if (!img || !img.width) return false;
      s.scale.set(height * img.width / img.height, height, 1);
      s.userData.baseW = s.scale.x;
      return true;
    };
    s.center.set(0.5, 0.03);
    if (!fit()) {
      s.scale.set(height * 0.9, height, 1);
      const iv = setInterval(() => { if (fit()) clearInterval(iv); }, 100);
    }
    return s;
  }
  makeShadow(r) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: A.shadowTex(), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    return m;
  }

  // ------------------------------------------------------------ players
  makeToken(p) {
    const grp = new THREE.Group();
    const sprite = this.makeSprite(art(heroDef(p.hero).art), HERO_H);
    sprite.renderOrder = 3;
    grp.add(sprite);
    const shadow = this.makeShadow(0.46);
    shadow.scale.set(1, 0.75, 1);
    shadow.position.y = 0.015;
    grp.add(shadow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.renderOrder = 2;
    grp.add(ring);
    const active = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    active.rotation.x = -Math.PI / 2; active.position.y = 0.025; active.renderOrder = 2;
    grp.add(active);
    const flag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    flag.center.set(0.5, 0);
    flag.position.y = HERO_H + 0.02;
    flag.scale.set(0.4, 0.6, 1);
    flag.visible = false;
    flag.renderOrder = 4;
    grp.add(flag);
    const tok = { group: grp, sprite, ring, active, shadow, flag, flagKey: null, pet: null, petKey: null, flash: 0, flashColor: new THREE.Color(1, 1, 1), base: new THREE.Vector3(), bob: Math.random() * 6, squash: 0 };
    this.world.add(grp);
    return tok;
  }

  slotOffset(i, count, k) {
    const B = this.B;
    const base = i === this.board.bossIdx && this.bossFront ? this.bossFront.clone() : new THREE.Vector3();
    if (count <= 1) return base;
    if (i === 0) {
      // one row facing the camera for up to 3, two staggered rows beyond that
      if (count <= 3) return base.addScaledVector(B.right, (k - (count - 1) / 2) * 0.78).addScaledVector(B.fwdH, (k % 2) * 0.25 - 0.1);
      const back = Math.ceil(count / 2), inBack = k < back, n = inBack ? back : count - back, j = inBack ? k : k - back;
      const along = (j - (n - 1) / 2) * 0.78;
      return base.addScaledVector(B.right, along + (inBack ? 0 : 0.36)).addScaledVector(B.fwdH, inBack ? -0.45 : 0.45);
    }
    if (i === this.board.bossIdx) {
      const along = (k - (count - 1) / 2) * (count > 3 ? 0.5 : 0.62);
      return base.addScaledVector(B.right, along).addScaledVector(B.fwdH, (k % 2) * 0.32 - 0.1);
    }
    const ang = (k / count) * Math.PI * 2 + Math.PI / 4;
    const r = count > 3 ? 0.42 : 0.32;
    return base.add(new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r));
  }

  syncPlayers(game, snap = false) {
    if (!this.board) return;
    const groups = {};
    for (const p of game.players) {
      if (!this.tokens.has(p.id)) this.tokens.set(p.id, this.makeToken(p));
      const tok = this.tokens.get(p.id);
      const visible = game.active(p);
      tok.group.visible = visible;
      if (!visible) continue;
      (groups[p.pos] ||= []).push(p);
    }
    for (const [pos, list] of Object.entries(groups)) {
      list.forEach((p, k) => {
        const tok = this.tokens.get(p.id);
        const target = this.tilePos(+pos).add(this.slotOffset(+pos, list.length, k));
        tok.base.copy(target);
        if (snap || !tok.moving) tok.group.position.copy(target);
        const g = game.guildOf(p);
        tok.ring.material.opacity = g ? 0.95 : 0;
        const fkey = g ? `${g.id}:${g.name}` : null;
        if (fkey !== tok.flagKey) {
          tok.flagKey = fkey;
          tok.flag.visible = !!g;
          if (g) { tok.flag.material.map = this.flagTexture(g); tok.flag.material.needsUpdate = true; }
        }
        if (g) tok.ring.material.color.set(g.color);
      });
    }
    // Pets follow their owners, on the camera-right side.
    for (const p of game.players) {
      const tok = this.tokens.get(p.id);
      const petCard = p.equipped.find((c) => c.id.startsWith('pet_'));
      const key = petCard ? `${petCard.id}:${game.petForms[petCard.uid] || 1}` : null;
      if (key !== tok.petKey) {
        if (tok.pet) { tok.group.remove(tok.pet); tok.pet = null; }
        if (petCard) {
          const base = { pet_golem: 'golem', pet_tezuki: 'kitsune', pet_kezz: 'goblin' }[petCard.id];
          const form = game.petForms[petCard.uid] || 1;
          tok.pet = this.makeSprite(art(`${base}_${form}`), 0.42 + form * 0.13);
          tok.pet.renderOrder = 3;
          tok.group.add(tok.pet);
        }
        tok.petKey = key;
      }
      if (tok.pet) tok.pet.position.copy(this.B.right.clone().multiplyScalar(0.42).addScaledVector(this.B.fwdH, 0.16));
    }
  }

  setActive(id) {
    this.activeId = id;
    if (this.game && this.game.players[id]) this.follow = true;
  }

  focusTile(i, snap = false) {
    if (!this.board) return;
    this.follow = false;
    this.camTarget.copy(this.followTarget(this.tilePos(i)));
    if (snap) this.target.copy(this.camTarget);
  }

  // Camera target that puts world point p at the centre of the safe area.
  followTarget(p) {
    const sa = this._lastSafe || this.safeArea();
    this._lastSafe = sa;
    const k = this.kCur * this.zoom;
    const cx = (sa.left + this.W - sa.right) / 2, cy = (sa.top + this.H - sa.bottom) / 2;
    return p.clone().addScaledVector(this.B.right, -(cx - this.W / 2) / k).addScaledVector(this.B.up, (cy - this.H / 2) / k);
  }

  async movePlayer(id, from, to, how, speed = 1) {
    const tok = this.tokens.get(id);
    if (!tok || !this.board) return;
    tok.moving = true;
    const path = [];
    if (how === 'walk' && from !== to) {
      const step = to > from ? 1 : -1;
      for (let i = from + step; step > 0 ? i <= to : i >= to; i += step) path.push(i);
    } else path.push(to);
    for (const i of path) {
      const a = tok.group.position.clone();
      const b = this.tilePos(i);
      const dur = speed < 0.05 ? 0 : (how === 'walk' ? 260 : 620) * Math.max(0.15, speed);
      await this.tween(dur, (k) => {
        tok.group.position.lerpVectors(a, b, k);
        tok.group.position.y += Math.sin(k * Math.PI) * (how === 'walk' ? 0.5 : 2.4);
        tok.squash = k > 0.85 ? (1 - k) * 4 : 0;
      });
      tok.land = 1;
    }
    tok.moving = false;
    this.syncPlayers(this.game);
  }

  tween(ms, fn) {
    return new Promise((res) => {
      if (ms <= 5) { fn(1); res(); return; }
      this.anims.push({ t0: performance.now(), ms, fn, res });
    });
  }

  flash(id, kind) {
    const tok = this.tokens.get(id);
    if (!tok) return;
    tok.flash = 1;
    tok.flashColor.set(kind === 'heal' ? 0x66ff88 : kind === 'skill' ? 0xffe066 : 0xff3344);
    if (kind === 'hurt') tok.shake = 1;
  }

  showEnemy(i, artName, big = false) {
    this.hideEnemy();
    if (artName === null && !big) return;
    if (big) { if (this.bossSprite) this.bossSprite.userData.fighting = true; return; }
    if (!artName) return;
    const p = this.tilePos(i).addScaledVector(this.B.right, 0.72).addScaledVector(this.B.fwdH, -0.18);
    const s = this.makeSprite(art(artName), ENEMY_H);
    s.position.copy(p);
    s.material.opacity = 0;
    s.renderOrder = 3;
    const sh = this.makeShadow(0.42); sh.position.set(p.x, p.y + 0.015, p.z); sh.scale.set(1, 0.75, 1);
    this.world.add(s, sh);
    this.enemy = s;
    this.enemyShadow = sh;
    s.userData.baseX = p.x;
    this.tween(300, (k) => { s.material.opacity = k; s.scale.y = (s.userData.h) * (0.6 + 0.4 * k); });
  }
  hideEnemy() {
    if (this.enemy) { this.world.remove(this.enemy, this.enemyShadow); this.enemy.material.dispose(); this.enemyShadow.geometry.dispose(); this.enemyShadow.material.dispose(); this.enemy = null; }
    if (this.bossSprite) this.bossSprite.userData.fighting = false;
  }
  hitEnemy() {
    const s = this.enemy || this.bossSprite;
    if (s) s.userData.shake = 1;
  }

  burst(i, color = 0xffaa33, n = 40, spread = 1) {
    const p = this.tilePos(i);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), vel = [];
    for (let k = 0; k < n; k++) {
      pos.set([p.x, p.y + 0.4, p.z], k * 3);
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 3 * spread, Math.random() * 3 + 1.5, (Math.random() - 0.5) * 3 * spread));
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.34, map: A.sparkTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 40), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.y + 0.03, p.z);
    this.world.add(pts, ring);
    this.tween(900, (k) => {
      const a = g.attributes.position.array;
      for (let j = 0; j < n; j++) {
        a[j * 3] = p.x + vel[j].x * k;
        a[j * 3 + 1] = p.y + 0.4 + vel[j].y * k - 4 * k * k;
        a[j * 3 + 2] = p.z + vel[j].z * k;
      }
      g.attributes.position.needsUpdate = true;
      pts.material.opacity = 1 - k * k;
      ring.scale.setScalar(0.4 + k * 1.6 * spread);
      ring.material.opacity = 1 - k;
    }).then(() => { this.world.remove(pts, ring); g.dispose(); pts.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); });
  }

  fx(kind, at) {
    if (!this.board || at == null) return;
    if (kind === 'bomb') this.burst(at, 0xff8833, 60, 1.2);
    if (kind === 'yessi') this.burst(at, 0xff66dd, 70, 2);
    if (kind === 'slide') this.burst(at, 0xd0b080, 80, 2.5);
    if (kind === 'trap') this.burst(at, 0xb07aff, 34, 0.7);
    if (kind === 'loot') this.burst(at, 0xffe066, 34, 0.7);
    if (kind === 'relic') this.burst(at, 0xffffff, 120, 2);
  }

  syncLoot(game) {
    if (!this.board) return;
    for (const k of Object.keys(this.lootMarks)) { this.world.remove(this.lootMarks[k]); delete this.lootMarks[k]; }
    for (const [i, pile] of Object.entries(game.tileLoot || {})) {
      if (!pile.cards.length && !pile.relics.length) continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.bagTex(), transparent: true, alphaTest: 0.05 }));
      s.center.set(0.5, 0.05);
      s.scale.set(0.62, 0.62, 1);
      const p = this.tilePos(+i).addScaledVector(this.B.right, -0.42).addScaledVector(this.B.fwdH, 0.3);
      s.position.copy(p);
      s.userData.y = p.y;
      s.renderOrder = 3;
      this.world.add(s);
      this.lootMarks[i] = s;
    }
  }

  highlight(indices, onPick) {
    this.clearHighlight();
    this.onPick = onPick;
    const occupied = new Set();
    if (this.game) for (const p of this.game.players) if (this.game.active(p)) occupied.add(p.pos);
    for (const i of indices) {
      const p = this.tilePos(i), plat = this.isPlatform(i);
      const r = plat ? (i === 0 ? START_R : BOSS_R) : 0;
      const outlineGeo = plat ? new THREE.RingGeometry(r - 0.02, r + 0.16, 56) : (() => { const s = roundedRectShape(T + 0.14, T + 0.14, 0.38); s.holes.push(roundedRectShape(T - 0.08, T - 0.08, 0.28)); const g = new THREE.ShapeGeometry(s, 6); return g; })();
      const outline = new THREE.Mesh(outlineGeo, new THREE.MeshBasicMaterial({ color: 0xffe25a, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      outline.rotation.x = -Math.PI / 2;
      outline.position.set(p.x, p.y + 0.02, p.z);
      if (!plat) outline.rotation.z = 0;
      outline.renderOrder = 2;
      const fillGeo = plat ? new THREE.CircleGeometry(r - 0.02, 48) : new THREE.ShapeGeometry(roundedRectShape(T - 0.08, T - 0.08, 0.28), 6);
      const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(p.x, p.y + 0.018, p.z);
      fill.renderOrder = 2;
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.markerTex(), transparent: true, depthWrite: false, depthTest: false }));
      marker.center.set(0.5, 0);
      marker.scale.set(0.52, 0.65, 1);
      const baseY = p.y + (plat ? 0.55 : occupied.has(i) ? HEAD + 0.25 : 0.75);
      marker.position.set(p.x, baseY, p.z);
      if (plat) marker.position.addScaledVector(this.B.fwdH, r + 0.25);
      marker.userData.baseY = baseY;
      marker.renderOrder = 20;
      this.world.add(outline, fill, marker);
      this.highlights.push({ outline, fill, marker, seed: this.highlights.length * 0.7 });
    }
  }
  clearHighlight() {
    for (const h of this.highlights || []) {
      this.world.remove(h.outline, h.fill, h.marker);
      h.outline.geometry.dispose(); h.fill.geometry.dispose();
      h.outline.material.dispose(); h.fill.material.dispose(); h.marker.material.dispose();
    }
    this.highlights = [];
    this.onPick = null;
  }

  // ------------------------------------------------------------ frame
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const now = performance.now();
    this.anims = this.anims.filter((a) => {
      const k = Math.min(1, (now - a.t0) / a.ms);
      a.fn(k);
      if (k >= 1) { a.res(); return false; }
      return true;
    });
    if (!this.board) { this.renderer.render(this.scene, this.camera); return; }

    // Re-measure the HUD now and then; refit smoothly if it moved.
    this._safeT += dt;
    if (this._safeT > 0.6) {
      this._safeT = 0;
      if (!document.body.classList.contains('prompting')) {
        const sa = this.safeArea();
        this._lastSafe = sa;
        if (JSON.stringify(sa) !== this._safeSig) this.computeFit(false);
      }
    }
    if (Math.abs(this.kCur - this.fit.k) > 1e-3) this.kCur += (this.fit.k - this.kCur) * Math.min(1, dt * 4);
    if (this.zoomTo != null) {
      this.zoom += (this.zoomTo - this.zoom) * Math.min(1, dt * 3);
      if (Math.abs(this.zoom - this.zoomTo) < 0.002) { this.zoom = this.zoomTo; this.zoomTo = null; }
    }
    // Camera: framed board at zoom 1, follows the active hero when zoomed in.
    if (this.follow) {
      const tok = this.activeId != null ? this.tokens.get(this.activeId) : null;
      if (this.zoom > 1.04 && tok && tok.group.visible) {
        const w = THREE.MathUtils.clamp((this.zoom - 1) * 1.5, 0, 1);
        const want = this.fit.target.clone().lerp(this.followTarget(tok.group.position), w);
        this.camTarget.lerp(want, 0.06);
        this.clampTarget();
      } else this.camTarget.lerp(this.fit.target, 0.08);
    }
    this.target.lerp(this.camTarget, 1 - Math.pow(0.002, dt));
    this.updateCamera();
    this.camera.position.copy(this.target).addScaledVector(this.B.dir, 60);
    this.camera.lookAt(this.target);

    for (const f of this.flames) {
      const s = 0.9 + Math.sin(t * 11 + f.seed) * 0.07 + Math.sin(t * 27 + f.seed * 2) * 0.05;
      f.fl.scale.set(f.size * 0.75 * (2 - s), f.size * 1.12 * s, 1);
      f.glow.material.opacity = 0.42 + s * 0.15;
    }
    for (const br of this.braziers || []) br.light.intensity = 5.5 + Math.sin(t * 9 + br.seed) * 0.8 + Math.sin(t * 23 + br.seed) * 0.4;
    for (const sp of this.spinners) sp.o.rotation.z += sp.v * dt;
    for (const fl of this.floaters) { fl.o.position.y = fl.y + Math.sin(t * 1.5 + fl.seed) * 0.18; fl.o.rotation.y += dt * 0.8; }
    for (const lq of this.liquids) {
      lq.tex.offset.x += dt * (lq.kind === 'lava' ? 0.05 : 0.03);
      lq.tex.offset.y += dt * (lq.kind === 'lava' ? 0.02 : 0.015);
      if (lq.kind === 'lava') lq.mat.color.setScalar(0.9 + Math.sin(t * 2.5) * 0.1);
    }
    for (const w of Object.values(this.walls)) for (const o of w.userData.deco.children) if (o.userData.sway != null) o.rotation.z = Math.sin(t * 1.4 + o.userData.sway) * 0.03;
    if (this.motes) {
      const u = this.motes.userData, a = this.motes.geometry.attributes.position.array, bx = u.box;
      for (let i = 0, k = 0; i < a.length; i += 3, k++) {
        const sd = u.seeds[k];
        a[i] += (u.vx || 0) * dt + Math.sin(t * 0.8 + sd) * u.sway * dt;
        a[i + 1] += u.vy * dt;
        a[i + 2] += Math.cos(t * 0.7 + sd) * u.sway * dt;
        if (a[i + 1] > 5) a[i + 1] = 0;
        if (a[i] > bx.x1) a[i] = bx.x0;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
      if (u.blink) this.motes.material.opacity = 0.6 + Math.sin(t * 3) * 0.35;
    }
    for (const tok of this.tokens.values()) {
      tok.bob += dt * 3;
      const sp = tok.sprite, h = sp.userData.h, w = sp.userData.baseW || sp.scale.x;
      sp.position.y = Math.abs(Math.sin(tok.bob)) * 0.035;
      if (tok.land > 0) tok.land = Math.max(0, tok.land - dt * 5);
      const sq = Math.sin((tok.land || 0) * Math.PI) * 0.12;
      sp.scale.set(w * (1 + sq), h * (1 - sq), 1);
      if (tok.flash > 0) {
        tok.flash = Math.max(0, tok.flash - dt * 2);
        sp.material.color.setRGB(1, 1, 1).lerp(tok.flashColor, tok.flash);
      }
      if (tok.shake > 0) {
        tok.shake = Math.max(0, tok.shake - dt * 3);
        sp.position.x = Math.sin(t * 60) * 0.06 * tok.shake;
      } else sp.position.x = 0;
      if (tok.pet) tok.pet.position.y = Math.abs(Math.sin(tok.bob * 1.3 + 1)) * 0.08;
      if (tok.flag.visible) { tok.flag.material.rotation = Math.sin(t * 2 + tok.bob) * 0.06; tok.flag.position.y = HERO_H * (1 - sq) + 0.02 + sp.position.y; }
      const isActive = this.activeId != null && this.tokens.get(this.activeId) === tok;
      tok.active.material.opacity = isActive ? 0.65 + Math.sin(t * 5) * 0.3 : 0;
      if (isActive) tok.active.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
    }
    if (this.bossSprite) {
      const b = this.bossSprite, h = b.userData.h, w = b.userData.baseW || b.scale.x;
      const breathe = 1 + Math.sin(t * 2) * 0.015;
      b.scale.set(w * (2 - breathe), h * breathe, 1);
      const shake = b.userData.shake > 0 ? Math.sin(t * 50) * 0.12 * b.userData.shake : 0;
      b.position.x = (b.userData.baseX ?? b.position.x) + shake * this.B.right.x;
      b.position.z = (b.userData.baseZ ?? b.position.z) + shake * this.B.right.z;
      if (b.userData.shake > 0) { b.userData.shake -= dt * 2.5; b.material.color.setRGB(1, 1 - b.userData.shake * 0.5, 1 - b.userData.shake * 0.5); }
      else b.material.color.setRGB(1, 1, 1);
    }
    if (this.enemy) {
      const e = this.enemy;
      e.position.x = e.userData.baseX + (e.userData.shake > 0 ? Math.sin(t * 50) * 0.08 * e.userData.shake : 0);
      if (e.userData.shake > 0) e.userData.shake -= dt * 2.5;
    }
    for (const s of Object.values(this.lootMarks)) s.position.y = s.userData.y + Math.abs(Math.sin(t * 2.5)) * 0.08;
    for (const h of this.highlights) {
      const k = 0.5 + Math.sin(t * 6 + h.seed) * 0.5;
      h.outline.material.opacity = 0.7 + k * 0.3;
      h.fill.material.opacity = 0.15 + k * 0.2;
      h.marker.position.y = h.marker.userData.baseY + Math.abs(Math.sin(t * 4 + h.seed)) * 0.28;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
