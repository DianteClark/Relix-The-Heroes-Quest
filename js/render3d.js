// 2.5D isometric board: real 3D tiles and lighting, with the 2D chibi art
// standing on the board as camera-facing cut-outs.
import * as THREE from '../vendor/three.module.min.js';
import { TILE, heroDef } from './data.js';

const S = 1.3; // grid spacing
const T = 1.12; // tile size
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

const TYPE_COLORS = {
  [TILE.MONSTER]: 0xa8323a,
  [TILE.TREASURE]: 0xe0b23a,
  [TILE.TRAP]: 0x1f8a63,
  [TILE.BLANK]: 0x2c4f8a,
  [TILE.START]: 0x3f63b8,
  [TILE.BOSS]: 0x5a2f78,
};

function roundedSlab(w, h, r, depth, bevel) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export class BoardView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.zoom = 1;
    this.target = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.follow = true;

    this.hemi = new THREE.HemisphereLight(0xcfd8ff, 0x302020, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-8, 16, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.tokens = new Map(); // player id -> token
    this.flames = [];
    this.motes = null;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickable = [];
    this.onPick = null;
    this.anims = [];

    this.bindControls();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.aspect = w / h;
    this.updateCamera();
  }

  updateCamera() {
    const a = this.aspect || 1;
    const diag = this.diag || 6;
    const needW = diag + (a < 0.8 ? 0.2 : 1.2);
    const needH = diag * 0.62 + 2.4;
    const half = Math.max(needH, needW / a) / this.zoom;
    this.camera.left = -half * a; this.camera.right = half * a; this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  bindControls() {
    const el = this.renderer.domElement;
    let drag = null, pinch = null, moved = 0;
    const pts = new Map();
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      moved = 0;
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoom }; drag = null; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        this.zoom = THREE.MathUtils.clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.5, 3.5);
        this.updateCamera();
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      drag = { x: e.clientX, y: e.clientY };
      if (moved > 6) {
        this.follow = false;
        const scale = (this.camera.right - this.camera.left) / el.clientWidth;
        const right = new THREE.Vector3(1, 0, -1).normalize();
        const up = new THREE.Vector3(-1, 0, -1).normalize();
        this.camTarget.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale * 1.4);
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        if (moved < 6 && this.onPick) this.pick(e);
        drag = null;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.5, 3.5);
      this.updateCamera();
    }, { passive: false });
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickable, false)[0];
    if (hit && hit.object.userData.pickId != null) this.onPick(hit.object.userData.pickId);
  }

  tilePos(i) {
    const t = this.board.tiles[i];
    return new THREE.Vector3(this.cx - t.x * S, this.tileTop(i), this.cz - t.z * S);
  }
  tileTop(i) { return this.board.tiles[i].type === TILE.BOSS ? 0.62 : 0.26; }

  // ---------- floor construction ----------
  setFloor(game) {
    this.game = game;
    this.board = game.board;
    const theme = game.boss.def.theme;
    this.theme = theme;
    this.world.clear();
    this.tokens.clear();
    this.flames = [];
    this.pickable = [];
    this.highlights = [];
    this.lootMarks = {};
    this.enemy = null;

    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, 26, 60);
    this.hemi.color.set(theme.light);
    this.hemi.groundColor.set(theme.ground);

    const tiles = this.board.tiles;
    this.cx = (this.board.cols - 1) * S / 2;
    this.cz = (this.board.rows - 1) * S / 2;
    this.extent = Math.max(this.board.cols, this.board.rows) * S + 3;
    this.diag = (this.board.cols + this.board.rows) / 2 * S * 0.72;

    // Ground plane with a faint flagstone pattern.
    const groundTex = this.makeGroundTexture(theme);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundTex, roughness: 0.95 }));
    groundTex.repeat.set(20, 20);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.world.add(ground);

    // Raised dungeon floor under the board.
    const padW = this.board.cols * S + 1.4, padD = this.board.rows * S + 1.4;
    const pad = new THREE.Mesh(roundedSlab(padW, padD, 0.5, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.ground).multiplyScalar(0.8), roughness: 0.9 }));
    pad.receiveShadow = true;
    this.world.add(pad);

    const slabGeo = roundedSlab(T, T, 0.16, 0.12, 0.05);
    const insetGeo = roundedSlab(T * 0.8, T * 0.8, 0.12, 0.02, 0.02);
    const stone = new THREE.Color(theme.ground).lerp(new THREE.Color(0x8a8a96), 0.45);
    const iconGeo = new THREE.PlaneGeometry(T * 0.7, T * 0.7);
    const icons = { [TILE.MONSTER]: 'monster', [TILE.TREASURE]: 'treasure', [TILE.TRAP]: 'trap', [TILE.START]: 'start' };

    tiles.forEach((t, i) => {
      const g = new THREE.Group();
      const p = new THREE.Vector3(this.cx - t.x * S, 0.1, this.cz - t.z * S);
      g.position.copy(p);
      const isBoss = t.type === TILE.BOSS;
      const slab = new THREE.Mesh(isBoss ? roundedSlab(T * 1.08, T * 1.08, 0.2, 0.45, 0.06) : slabGeo,
        new THREE.MeshStandardMaterial({ color: stone.clone().offsetHSL(0, 0, (Math.sin(i * 12.9) * 0.04)), roughness: 0.85 }));
      slab.castShadow = true; slab.receiveShadow = true;
      g.add(slab);
      const inset = new THREE.Mesh(insetGeo, new THREE.MeshStandardMaterial({ color: TYPE_COLORS[t.type], roughness: 0.6, emissive: TYPE_COLORS[t.type], emissiveIntensity: 0.08 }));
      inset.position.y = isBoss ? 0.5 : 0.16;
      inset.receiveShadow = true;
      g.add(inset);
      if (icons[t.type]) {
        const ic = new THREE.Mesh(iconGeo, new THREE.MeshStandardMaterial({ map: tex(`assets/tiles/${icons[t.type]}.webp`), transparent: true, alphaTest: 0.1, roughness: 0.7 }));
        ic.rotation.x = -Math.PI / 2;
        ic.rotation.z = Math.PI / 4;
        ic.position.y = inset.position.y + 0.075;
        ic.receiveShadow = true;
        g.add(ic);
      }
      // Hit target for tile picking.
      const hitBox = new THREE.Mesh(new THREE.BoxGeometry(T, 0.6, T), new THREE.MeshBasicMaterial({ visible: false }));
      hitBox.position.y = 0.2;
      hitBox.userData.pickId = i;
      g.add(hitBox);
      this.pickable.push(hitBox);
      // Direction chevron toward the next tile.
      if (i < tiles.length - 1) {
        const n = tiles[i + 1];
        const dir = new THREE.Vector2(t.x - n.x, t.z - n.z);
        const chev = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 3), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35 }));
        chev.rotation.z = -Math.PI / 2;
        const holder = new THREE.Group();
        holder.add(chev);
        holder.rotation.y = -Math.atan2(dir.y, dir.x);
        holder.position.set(dir.x * (S / 2), 0.2, dir.y * (S / 2));
        if (Math.abs(dir.x) + Math.abs(dir.y) === 1) g.add(holder);
      }
      g.userData = { inset, index: i };
      t.group = g;
      this.world.add(g);
    });

    // Boss
    const bossTile = tiles[this.board.bossIdx];
    const bp = this.tilePos(this.board.bossIdx);
    const bossSprite = this.makeSprite(art(game.boss.def.art), 3.2);
    bossSprite.position.set(bp.x, bp.y, bp.z);
    this.world.add(bossSprite);
    this.bossSprite = bossSprite;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 40), new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(bp.x, bp.y + 0.03, bp.z);
    this.world.add(ring);
    this.bossRing = ring;
    const bossLight = new THREE.PointLight(theme.accent, 6, 7, 1.6);
    bossLight.position.set(bp.x, bp.y + 2, bp.z);
    this.world.add(bossLight);
    this.bossLight = bossLight;

    this.decorate(theme);
    this.makeMotes(theme);
    this.syncPlayers(game, true);
    this.syncLoot(game);
    this.focusTile(0, true);
    this.updateCamera();
  }

  makeGroundTexture(theme) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const base = new THREE.Color(theme.ground);
    x.fillStyle = '#' + base.getHexString();
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const k = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.025);
      x.fillStyle = '#' + k.getHexString();
      x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  decorate(theme) {
    const w = this.board.cols * S, d = this.board.rows * S;
    const pillarMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.ground).lerp(new THREE.Color(0x777777), 0.35), roughness: 0.9 });
    const spots = [];
    const m = 1.5;
    // Pillars and torches along the two far walls only, so nothing blocks the view.
    for (let k = 0; k <= 6; k++) spots.push([-w / 2 - m, -d / 2 + (k / 6) * (d + m)]);
    for (let k = 1; k <= 6; k++) spots.push([-w / 2 - m + (k / 6) * (w + m), -d / 2 - m]);
    spots.forEach(([x, z], k) => {
      const h = 2.2 + ((k * 37) % 10) / 12;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, h, 8), pillarMat);
      pillar.position.set(x + S / 2, h / 2, z + S / 2);
      pillar.receiveShadow = true;
      pillar.castShadow = true;
      this.world.add(pillar);
      if (k % 2 === 0) this.addTorch(pillar.position.x, h, pillar.position.z, theme);
      else {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.62), pillarMat);
        cap.position.set(pillar.position.x, h + 0.07, pillar.position.z);
        cap.castShadow = true;
        this.world.add(cap);
      }
    });
    // Scattered rocks
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.ground).multiplyScalar(1.3), roughness: 1, flatShading: true });
    for (let k = 0; k < 26; k++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + ((k * 13) % 7) / 30, 0), rockMat);
      const ang = k * 2.4, rad = Math.max(w, d) / 2 + 2 + (k % 5);
      r.position.set(Math.cos(ang) * rad, 0.08, Math.sin(ang) * rad);
      r.rotation.set(k, k * 2, k * 3);
      r.castShadow = true;
      this.world.add(r);
    }
  }

  addTorch(x, y, z, theme) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a20 }));
    bowl.position.set(x, y + 0.08, z);
    this.world.add(bowl);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), color: theme.accent, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.scale.set(0.7, 0.9, 1);
    flame.position.set(x, y + 0.4, z);
    this.world.add(flame);
    const light = new THREE.PointLight(theme.accent, 3.5, 5.5, 1.8);
    light.position.set(x, y + 0.6, z);
    this.world.add(light);
    this.flames.push({ flame, light, seed: Math.random() * 10 });
  }

  glowTex() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 36, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    this._glow = new THREE.CanvasTexture(c);
    return this._glow;
  }

  makeMotes(theme) {
    const n = 140;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.extent * 1.4;
      pos[i * 3 + 1] = Math.random() * 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.extent * 1.4;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: theme.accent, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false }));
    this.world.add(this.motes);
  }

  makeSprite(texture, height) {
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.05 });
    const s = new THREE.Sprite(mat);
    const fit = () => {
      const img = texture.image;
      if (!img || !img.width) return false;
      s.scale.set(height * img.width / img.height, height, 1);
      return true;
    };
    s.center.set(0.5, 0.02);
    if (!fit()) {
      s.scale.set(height * 0.8, height, 1);
      const iv = setInterval(() => { if (fit()) clearInterval(iv); }, 100);
    }
    return s;
  }

  // ---------- players ----------
  makeToken(p) {
    const grp = new THREE.Group();
    const sprite = this.makeSprite(art(heroDef(p.hero).art), 1.45);
    grp.add(sprite);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    grp.add(shadow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    grp.add(ring);
    const tok = { group: grp, sprite, ring, shadow, pet: null, petKey: null, hop: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1), base: new THREE.Vector3(), bob: Math.random() * 6 };
    this.world.add(grp);
    return tok;
  }

  slotOffset(i, count, k) {
    if (count <= 1) return new THREE.Vector3();
    const ang = (k / count) * Math.PI * 2 + Math.PI / 4;
    const r = 0.26;
    return new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
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
        if (g) tok.ring.material.color.set(g.color);
      });
    }
    // Pets follow their owners.
    for (const p of game.players) {
      const tok = this.tokens.get(p.id);
      const petCard = p.equipped.find((c) => c.id.startsWith('pet_'));
      const key = petCard ? `${petCard.id}:${game.petForms[petCard.uid] || 1}` : null;
      if (key !== tok.petKey) {
        if (tok.pet) { tok.group.remove(tok.pet); tok.pet = null; }
        if (petCard) {
          const base = { pet_golem: 'golem', pet_tezuki: 'kitsune', pet_kezz: 'goblin' }[petCard.id];
          const form = game.petForms[petCard.uid] || 1;
          tok.pet = this.makeSprite(art(`${base}_${form}`), 0.38 + form * 0.12);
          tok.pet.position.set(0.32, 0, 0.18);
          tok.group.add(tok.pet);
        }
        tok.petKey = key;
      }
    }
  }

  setActive(id) {
    this.activeId = id;
    if (this.game) {
      const p = this.game.players[id];
      if (p) { this.follow = true; this.focusTile(p.pos); }
    }
  }

  focusTile(i, snap = false) {
    if (!this.board) return;
    const p = this.tilePos(i);
    this.camTarget.copy(p);
    if (snap) this.target.copy(p);
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
      if (this.follow && id === this.activeId) this.focusTile(i);
      const dur = speed < 0.05 ? 0 : (how === 'walk' ? 240 : 600) * Math.max(0.15, speed);
      await this.tween(dur, (k) => {
        tok.group.position.lerpVectors(a, b, k);
        tok.group.position.y += Math.sin(k * Math.PI) * (how === 'walk' ? 0.45 : 2.2);
      });
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
    if (artName === null) return;
    if (big) { this.bossSprite.userData.fighting = true; return; }
    const p = this.tilePos(i);
    const s = this.makeSprite(art(artName), 1.35);
    s.position.set(p.x + 0.45, p.y, p.z - 0.45);
    s.material.opacity = 0;
    this.world.add(s);
    this.enemy = s;
    this.tween(300, (k) => { s.material.opacity = k; });
  }
  hideEnemy() {
    if (this.enemy) { this.world.remove(this.enemy); this.enemy = null; }
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
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 3 * spread, Math.random() * 3 + 1, (Math.random() - 0.5) * 3 * spread));
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.14, transparent: true, depthWrite: false }));
    this.world.add(pts);
    this.tween(900, (k) => {
      const a = g.attributes.position.array;
      for (let j = 0; j < n; j++) {
        a[j * 3] = p.x + vel[j].x * k;
        a[j * 3 + 1] = p.y + 0.4 + vel[j].y * k - 4 * k * k;
        a[j * 3 + 2] = p.z + vel[j].z * k;
      }
      g.attributes.position.needsUpdate = true;
      pts.material.opacity = 1 - k;
    }).then(() => this.world.remove(pts));
  }

  fx(kind, at) {
    if (!this.board || at == null) return;
    if (kind === 'bomb') this.burst(at, 0xff8833, 60, 1.2);
    if (kind === 'yessi') this.burst(at, 0xff66dd, 70, 2);
    if (kind === 'slide') this.burst(at, 0xb0a080, 80, 2.5);
    if (kind === 'trap') this.burst(at, 0x33ffaa, 30, 0.6);
    if (kind === 'loot') this.burst(at, 0xffe066, 30, 0.6);
    if (kind === 'relic') this.burst(at, 0xffffff, 120, 2);
  }

  syncLoot(game) {
    if (!this.board) return;
    for (const k of Object.keys(this.lootMarks)) { this.world.remove(this.lootMarks[k]); delete this.lootMarks[k]; }
    for (const [i, pile] of Object.entries(game.tileLoot || {})) {
      if (!pile.cards.length && !pile.relics.length) continue;
      const s = this.makeSprite(tex('assets/tiles/treasure.webp'), 0.55);
      const p = this.tilePos(+i);
      s.position.set(p.x - 0.3, p.y + 0.05, p.z + 0.3);
      this.world.add(s);
      this.lootMarks[i] = s;
    }
  }

  highlight(indices, onPick) {
    this.clearHighlight();
    this.onPick = onPick;
    for (const i of indices) {
      const t = this.board.tiles[i];
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 4, 1), new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.renderOrder = 10;
      const p = this.tilePos(i);
      ring.position.set(p.x, p.y + 0.12, p.z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.set(p.x, p.y + 0.8, p.z);
      this.world.add(beam);
      this.highlights.push(beam);
      ring.userData.pulse = true;
      this.world.add(ring);
      this.highlights.push(ring);
    }
  }
  clearHighlight() {
    for (const h of this.highlights || []) this.world.remove(h);
    this.highlights = [];
    this.onPick = null;
  }

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
    // Camera follow
    if (this.follow && this.activeId != null && this.game) {
      const tok = this.tokens.get(this.activeId);
      if (tok && tok.group.visible) {
        const w = THREE.MathUtils.clamp(0.3 + (this.zoom - 1) * 0.7, 0.3, 1);
        const want = new THREE.Vector3(0, 0.6, 0).lerp(tok.group.position, w);
        this.camTarget.lerp(want, 0.05);
      }
    }
    this.target.lerp(this.camTarget, 1 - Math.pow(0.002, dt));
    const off = new THREE.Vector3(10, 11, 10);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
    this.sun.position.copy(this.target).add(new THREE.Vector3(-8, 16, 6));
    this.sun.target.position.copy(this.target);

    for (const f of this.flames) {
      const s = 0.85 + Math.sin(t * 9 + f.seed) * 0.1 + Math.sin(t * 23 + f.seed) * 0.06;
      f.flame.scale.set(0.7 * s, 0.95 * s, 1);
      f.light.intensity = 3 * s;
    }
    if (this.motes) {
      const a = this.motes.geometry.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) { a[i] += dt * 0.25; if (a[i] > 5) a[i] = 0; }
      this.motes.geometry.attributes.position.needsUpdate = true;
    }
    for (const tok of this.tokens.values()) {
      tok.bob += dt * 3;
      tok.sprite.position.y = Math.abs(Math.sin(tok.bob)) * 0.04;
      tok.sprite.scale.y = tok.sprite.scale.y; // keep
      if (tok.flash > 0) {
        tok.flash = Math.max(0, tok.flash - dt * 2);
        tok.sprite.material.color.copy(new THREE.Color(1, 1, 1).lerp(tok.flashColor, tok.flash));
      }
      if (tok.shake > 0) {
        tok.shake = Math.max(0, tok.shake - dt * 3);
        tok.sprite.position.x = Math.sin(t * 60) * 0.06 * tok.shake;
      } else tok.sprite.position.x = 0;
      if (tok.pet) tok.pet.position.y = Math.abs(Math.sin(tok.bob * 1.3 + 1)) * 0.08;
      tok.ring.visible = true;
      if (tok.group.visible && this.activeId != null) {
        const active = this.game && this.game.players[this.activeId] && this.tokens.get(this.activeId) === tok;
        tok.shadow.material.color.set(active ? 0xffe066 : 0x000000);
        tok.shadow.material.opacity = active ? 0.55 + Math.sin(t * 4) * 0.15 : 0.35;
      }
    }
    if (this.bossSprite) {
      const b = this.bossSprite;
      const breathe = 1 + Math.sin(t * 2) * 0.015;
      b.material.rotation = 0;
      b.position.x = (b.userData.baseX ??= b.position.x) + (b.userData.shake > 0 ? Math.sin(t * 50) * 0.1 * b.userData.shake : 0);
      if (b.userData.shake > 0) b.userData.shake -= dt * 2.5;
      b.scale.y = (b.userData.baseH ??= b.scale.y) * breathe;
      this.bossRing.rotation.z += dt * 0.6;
      this.bossLight.intensity = 5 + Math.sin(t * 3) * 1.5;
    }
    if (this.enemy) {
      const e = this.enemy;
      e.position.x = (e.userData.baseX ??= e.position.x) + (e.userData.shake > 0 ? Math.sin(t * 50) * 0.08 * e.userData.shake : 0);
      if (e.userData.shake > 0) e.userData.shake -= dt * 2.5;
    }
    for (const h of this.highlights || []) h.material.opacity = h.geometry.type === 'CylinderGeometry' ? 0.14 + Math.sin(t * 6) * 0.08 : 0.55 + Math.sin(t * 6) * 0.35;
    this.renderer.render(this.scene, this.camera);
  }
}
