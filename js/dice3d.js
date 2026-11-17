// Relix: 3D physics dice tray.
//
//   const tray = new DiceTray();
//   await tray.roll({ values:[6,3], mode:'swipe', kind:'combat', skin:'ruby', throwFx:'sparks', area, speed });
//
// How "rigged" physics works: when the throw starts we run a deterministic cannon-es simulation
// (fixed 1/120s step) to rest, read which face of each die ended on top, then pick a face layout
// (one of the 24 orientations of a standard die, opposite faces sum to 7) that puts the wanted value
// on that face. The recorded trajectory is then played back with those textures.
import * as THREE from '../vendor/three.module.min.js';
import * as CANNON from '../vendor/cannon-es.js';
import { DICE_SKINS, THROW_FX, byId } from './cosmetics.js';

// ---------------------------------------------------------------------------
// Physics planning (pure, no DOM; exported for tests)
// ---------------------------------------------------------------------------
const STEP = 1 / 120;          // fixed physics step
const REC_EVERY = 2;           // record every 2 steps -> 60 Hz frames
const FRAME_DT = STEP * REC_EVERY;
const GRAVITY = 62;            // in die-units / s^2 (die edge = 1)
const MAX_SIM = 4.5;           // seconds
const MAX_ATTEMPTS = 14;

// BoxGeometry material groups: +x, -x, +y, -y, +z, -z
const SLOT_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const BASE_LAYOUT = [3, 4, 1, 6, 2, 5]; // standard right-handed die
const slotOf = (v) => SLOT_N.findIndex((n) => n[0] === v[0] && n[1] === v[1] && n[2] === v[2]);
export const LAYOUTS = (() => {
  const rx = ([x, y, z]) => [x, -z, y];
  const ry = ([x, y, z]) => [z, y, -x];
  const seen = new Map([[BASE_LAYOUT.join(''), BASE_LAYOUT]]);
  const q = [BASE_LAYOUT];
  while (q.length) {
    const L = q.shift();
    for (const r of [rx, ry]) {
      const N = new Array(6);
      for (let i = 0; i < 6; i++) N[slotOf(r(SLOT_N[i]))] = L[i];
      const k = N.join('');
      if (!seen.has(k)) { seen.set(k, N); q.push(N); }
    }
  }
  return [...seen.values()]; // 24 layouts
})();

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** Index of the box slot (0..5) whose normal points most upward for quaternion q. */
export function topSlot(q) {
  let best = 0; let bd = -2;
  for (let i = 0; i < 6; i++) {
    _v.set(SLOT_N[i][0], SLOT_N[i][1], SLOT_N[i][2]).applyQuaternion(q);
    if (_v.y > bd) { bd = _v.y; best = i; }
  }
  return { slot: best, dot: bd };
}

function pickLayout(slot, value, rnd = Math.random) {
  const c = LAYOUTS.filter((L) => L[slot] === value);
  return c[Math.floor(rnd() * c.length) % c.length];
}

function rotQ(axis, angle) {
  const a = new THREE.Vector3(axis[0], axis[1], axis[2]);
  const len = a.length();
  if (len < 1e-6) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromAxisAngle(a.multiplyScalar(1 / len), angle);
}

/**
 * Build start conditions for n dice.
 * throwSpec: { dir:[dx,dz] (unit, on floor plane; -z = away from camera), power 0..1, from:[x,z] optional start centre,
 *              qHand:[Quaternion] optional (orientation the dice had in the hand) }
 */
function makeStarts(n, tray, spec, rnd) {
  const { hx, zFar, zNear } = tray;
  let [dx, dz] = spec.dir;
  const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const zMid = (zFar + zNear) / 2; const hz = (zNear - zFar) / 2;
  const margin = 0.85;
  // start centre: walk back from the tray centre against the throw direction until near the wall
  const tx = Math.abs(dx) > 1e-3 ? (hx - margin) / Math.abs(dx) : 1e9;
  const tz = Math.abs(dz) > 1e-3 ? (hz - margin) / Math.abs(dz) : 1e9;
  const t = Math.max(0, Math.min(tx, tz));
  let cx = -dx * t; let cz = zMid - dz * t;
  const px = -dz; const pz = dx; // perpendicular (lateral)
  const cols = Math.min(n, n === 4 ? 2 : 3);
  const depthAlong = Math.abs(dx) * hx * 2 + Math.abs(dz) * hz * 2;
  const p = Math.max(0, Math.min(1, spec.power));
  const base = (6.5 + 11 * p) * Math.max(0.68, Math.min(1.2, depthAlong / 6.5));
  const starts = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols; const row = Math.floor(i / cols);
    const rowCount = Math.min(cols, n - row * cols);
    const lat = (col - (rowCount - 1) / 2) * 1.25 + (rnd() - 0.5) * 0.3;
    const fwd = row * 1.2 + (rnd() - 0.5) * 0.25;
    let x = cx + px * lat + dx * fwd;
    let z = cz + pz * lat + dz * fwd;
    x = Math.max(-hx + 0.6, Math.min(hx - 0.6, x));
    z = Math.max(zFar + 0.6, Math.min(zNear - 0.6, z));
    const y = 1.5 + row * 0.55 + rnd() * 0.5 + (i % 2) * 0.25;
    const ang = (rnd() - 0.5) * 0.28;
    const ca = Math.cos(ang); const sa = Math.sin(ang);
    const ddx = dx * ca - dz * sa; const ddz = dx * sa + dz * ca;
    const sp = base * (0.86 + rnd() * 0.28);
    const v = [ddx * sp, 0.8 + p * 2.6 + rnd() * 1.2, ddz * sp];
    const spin = 7 + 15 * p + rnd() * 5;
    const w = [ddz * spin + (rnd() - 0.5) * 9, (rnd() - 0.5) * 9, -ddx * spin + (rnd() - 0.5) * 9];
    let q;
    if (spec.qHand && spec.qHand[i]) {
      // continue from the hand orientation, pre-rotated by the launch spin
      const wl = Math.hypot(w[0], w[1], w[2]);
      q = rotQ(w, wl * 0.1).multiply(spec.qHand[i].clone());
    } else {
      q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283));
    }
    starts.push({ p: [x, y, z], q: [q.x, q.y, q.z, q.w], v, w });
  }
  return starts;
}

function simulate(n, tray, starts) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.broadphase = new CANNON.NaiveBroadphase();
  const mDie = new CANNON.Material('die');
  const mFloor = new CANNON.Material('floor');
  const mWall = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(mDie, mFloor, { friction: 0.32, restitution: 0.36 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mDie, mWall, { friction: 0.08, restitution: 0.5 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mDie, mDie, { friction: 0.08, restitution: 0.35 }));

  const plane = (mat, pos, euler) => {
    const b = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Plane() });
    b.position.set(pos[0], pos[1], pos[2]);
    b.quaternion.setFromEuler(euler[0], euler[1], euler[2]);
    world.addBody(b);
    return b;
  };
  const floor = plane(mFloor, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  plane(mWall, [-tray.hx, 0, 0], [0, Math.PI / 2, 0]);
  plane(mWall, [tray.hx, 0, 0], [0, -Math.PI / 2, 0]);
  plane(mWall, [0, 0, tray.zFar], [0, 0, 0]);
  plane(mWall, [0, 0, tray.zNear], [0, Math.PI, 0]);

  const bodies = [];
  const events = []; // {t, die, floor, v}
  let step = 0;
  const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
  for (let i = 0; i < n; i++) {
    const s = starts[i];
    const b = new CANNON.Body({ mass: 1, material: mDie, shape, linearDamping: 0.12, angularDamping: 0.16,
      sleepSpeedLimit: 0.15, sleepTimeLimit: 0.15 });
    b.position.set(s.p[0], s.p[1], s.p[2]);
    b.quaternion.set(s.q[0], s.q[1], s.q[2], s.q[3]);
    b.velocity.set(s.v[0], s.v[1], s.v[2]);
    b.angularVelocity.set(s.w[0], s.w[1], s.w[2]);
    const idx = i;
    b.addEventListener('collide', (e) => {
      const iv = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (iv < 0.6) return;
      events.push({ t: step * STEP, die: idx, floor: e.body === floor, v: iv, other: bodies.indexOf(e.body) });
    });
    world.addBody(b);
    bodies.push(b);
  }

  const maxSteps = Math.round(MAX_SIM / STEP);
  const frames = [];
  const rec = () => {
    const f = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      f.set([b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], i * 7);
    }
    frames.push(f);
  };
  rec();
  let calm = 0; let kicks = 0;
  const stuck = new Array(n).fill(0);
  for (step = 1; step <= maxSteps; step++) {
    world.step(STEP);
    if (step % REC_EVERY === 0) rec();
    // un-stick: a die that comes to rest on another die (or cocked against a wall/die) gets a little kick,
    // like a real die sliding off. Keeps retries rare even with 6 dice in a small tray.
    if (step % 6 === 0 && step * STEP > 0.3) {
      for (let i = 0; i < n; i++) {
        const b = bodies[i];
        if (b.velocity.lengthSquared() > 1.2 || b.angularVelocity.lengthSquared() > 4) { stuck[i] = 0; continue; }
        _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        const flat = topSlot(_q).dot > 0.985 && b.position.y < 0.62;
        if (flat) { stuck[i] = 0; continue; }
        stuck[i] += 6;
        if (stuck[i] >= 12 && kicks < 10) {
          kicks++; stuck[i] = 0;
          let ax = -b.position.x; let az = (tray.zFar + tray.zNear) / 2 - b.position.z;
          for (let j = 0; j < n; j++) if (j !== i) { // away from neighbours
            const o = bodies[j]; const dx = b.position.x - o.position.x; const dz = b.position.z - o.position.z;
            const d2 = dx * dx + dz * dz; if (d2 < 2.5) { ax += dx * 3 / (d2 + 0.2); az += dz * 3 / (d2 + 0.2); }
          }
          const l = Math.hypot(ax, az) || 1;
          b.wakeUp();
          b.velocity.set((ax / l) * 3.2, 2.2, (az / l) * 3.2);
          b.angularVelocity.set((az / l) * 7, (Math.random() - 0.5) * 3, (-ax / l) * 7);
          calm = 0;
        }
      }
    }
    let still = true;
    for (const b of bodies) {
      if (b.sleepState !== CANNON.Body.SLEEPING && (b.velocity.lengthSquared() > 0.02 || b.angularVelocity.lengthSquared() > 0.05)) { still = false; break; }
    }
    calm = still ? calm + 1 : 0;
    if (calm > 24 && step % REC_EVERY === 0) break;
  }
  // validity: every die flat on the floor
  let bad = 0;
  const finals = bodies.map((b) => {
    const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const ts = topSlot(q);
    const ok = ts.dot > 0.985 && b.position.y < 0.62;
    if (!ok) bad++;
    return { q, slot: ts.slot, dot: ts.dot, y: b.position.y };
  });
  return { frames, events, finals, bad, valid: bad === 0, n };
}

/** Snap every die to lie exactly flat and trim the resting tail. Mutates sim. */
function finalize(sim) {
  const { frames, n, finals } = sim;
  const last = frames[frames.length - 1];
  // rest frame: last frame where anything still visibly moves
  let rest = frames.length - 1;
  for (let f = frames.length - 1; f >= 0; f--) {
    const fr = frames[f];
    let moving = false;
    for (let i = 0; i < n && !moving; i++) {
      const o = i * 7;
      const dp = Math.hypot(fr[o] - last[o], fr[o + 1] - last[o + 1], fr[o + 2] - last[o + 2]);
      const dq = Math.abs(fr[o + 3] * last[o + 3] + fr[o + 4] * last[o + 4] + fr[o + 5] * last[o + 5] + fr[o + 6] * last[o + 6]);
      if (dp > 0.015 || dq < 0.99995) moving = true;
    }
    if (moving) { rest = Math.min(frames.length - 1, f + 1); break; }
    rest = f;
  }
  frames.length = rest + 1;
  // flat-snap correction blended over the last ~0.15s
  const blend = Math.min(frames.length - 1, 9);
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    const fin = frames[frames.length - 1];
    const qf = new THREE.Quaternion(fin[o + 3], fin[o + 4], fin[o + 5], fin[o + 6]);
    const { slot } = topSlot(qf);
    const nrm = new THREE.Vector3(...SLOT_N[slot]).applyQuaternion(qf);
    const corr = new THREE.Quaternion().setFromUnitVectors(nrm.normalize(), UP);
    const dy = 0.5 - fin[o + 1];
    const needY = Math.abs(dy) < 0.15; // only settle onto the floor if close to it
    for (let k = 0; k <= blend; k++) {
      const fi = frames.length - 1 - blend + k;
      const w = blend ? k / blend : 1;
      const fr = frames[fi];
      const qc = new THREE.Quaternion().slerp(corr, w);
      _q.set(fr[o + 3], fr[o + 4], fr[o + 5], fr[o + 6]).premultiply(qc);
      fr[o + 3] = _q.x; fr[o + 4] = _q.y; fr[o + 5] = _q.z; fr[o + 6] = _q.w;
      if (needY) fr[o + 1] += dy * w;
    }
    finals[i].slot = slot;
  }
  sim.duration = (frames.length - 1) * FRAME_DT;
  sim.events = sim.events.filter((e) => e.t <= sim.duration + 0.05);
  return sim;
}

/**
 * Plan a roll: returns { frames, events, duration, layouts:[6 values per die], starts }.
 * Face layouts are chosen so that each die shows values[i] on top at rest.
 */
export function planRoll({ values, tray, spec, rnd = Math.random }) {
  const n = values.length;
  let best = null; let attempts = 0;
  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    attempts++;
    const starts = makeStarts(n, tray, spec, rnd);
    const sim = simulate(n, tray, starts);
    sim.starts = starts;
    sim.raw = sim.frames.length * FRAME_DT;
    // score: prefer quick rolls that end spread out near the middle of the tray, not jammed into a wall
    const zMid = (tray.zFar + tray.zNear) / 2; const hz = (tray.zNear - tray.zFar) / 2;
    const last = sim.frames[sim.frames.length - 1];
    let cx = 0; let cz = 0; let wallPen = 0;
    for (let i = 0; i < n; i++) {
      const x = last[i * 7]; const z = last[i * 7 + 2];
      cx += x / n; cz += (z - zMid) / n;
      if (tray.hx - Math.abs(x) < 0.75) wallPen += 0.35;
      if (hz - Math.abs(z - zMid) < 0.75) wallPen += 0.35;
    }
    sim.score = sim.bad * 100 + Math.max(0, sim.raw - 1.1) * 1.4 + Math.hypot(cx / tray.hx, cz / hz) * 1.2 + wallPen / Math.sqrt(n);
    if (!best || sim.score < best.score) best = sim;
    if (best.valid && (best.score < 0.7 || (a >= 1 && best.score < 1.5) || a >= 2)) break;
  }
  finalize(best);
  best.layouts = best.finals.map((f, i) => pickLayout(f.slot, values[i], rnd));
  best.attempts = attempts;
  return best;
}

/** Value showing on top for a die with quaternion q and slot layout L. */
export function readTop(q, L) { return L[topSlot(q).slot]; }

// ---------------------------------------------------------------------------
// Visuals
// ---------------------------------------------------------------------------
const RESULT = {
  crit: { color: '#f2c443', label: 'CRIT' },
  hit: { color: '#4fd17a', label: 'HIT' },
  miss: { color: '#e5484d', label: 'MISS' },
  cmiss: { color: '#9b1426', label: 'CRIT MISS' },
  trigger: { color: '#f2c443', label: 'SKILL' },
  dim: { color: '#7d7689', label: '' },
  neutral: { color: '#f2c443', label: '' },
};
function classify(kind, v, triggers) {
  if (kind === 'combat') return v === 6 ? 'crit' : v >= 4 ? 'hit' : v === 1 ? 'cmiss' : 'miss';
  if (kind === 'skill') return (triggers || []).includes(v) ? 'trigger' : 'dim';
  return 'neutral';
}

const BEVEL = 0.13;
const HAND_SCALE = 0.8;
function roundedBoxGeometry(r = BEVEL, segR = 4, segF = 2) {
  const n = segR * 2 + segF;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const remap = (c) => {
    const k = Math.round((c + 0.5) * n);
    if (k <= segR) return -0.5 + r * (1 - Math.cos((k / segR) * Math.PI / 2)) ** 0.85;
    if (k >= n - segR) return 0.5 - r * (1 - Math.cos(((n - k) / segR) * Math.PI / 2)) ** 0.85;
    return -0.5 + r + (1 - 2 * r) * ((k - segR) / segF);
  };
  const pos = g.attributes.position; const nor = g.attributes.normal; const uv = g.attributes.uv;
  const inner = 0.5 - r;
  const p = new THREE.Vector3(); const c = new THREE.Vector3(); const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.set(remap(pos.getX(i)), remap(pos.getY(i)), remap(pos.getZ(i)));
    c.set(Math.max(-inner, Math.min(inner, p.x)), Math.max(-inner, Math.min(inner, p.y)), Math.max(-inner, Math.min(inner, p.z)));
    d.subVectors(p, c);
    if (d.lengthSq() > 1e-10) {
      d.normalize();
      p.copy(c).addScaledVector(d, r);
      nor.setXYZ(i, d.x, d.y, d.z);
    }
    pos.setXYZ(i, p.x, p.y, p.z);
    uv.setXY(i, remap(uv.getX(i) - 0.5) + 0.5, remap(uv.getY(i) - 0.5) + 0.5);
  }
  pos.needsUpdate = true; nor.needsUpdate = true; uv.needsUpdate = true;
  return g;
}

const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};
const TEX = 256;
function mkCanvas(w = TEX, h = w) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
const col = (hex) => new THREE.Color(hex);
const css = (c, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
const mix = (a, b, t) => a.clone().lerp(b, t);

function faceTextures(skin, value) {
  const body = col(skin.body); const edge = col(skin.edge); const pip = col(skin.pip);
  const S = TEX; const band = BEVEL * S;
  const glow = skin.finish === 'glow';
  // --- albedo
  const c = mkCanvas(); const x = c.getContext('2d');
  x.fillStyle = css(edge); x.fillRect(0, 0, S, S);
  const steps = Math.ceil(band);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = outer edge, 1 = face
    x.fillStyle = css(mix(edge, body, Math.min(1, t * 1.15) ** 0.7));
    x.fillRect(i, i, S - 2 * i, S - 2 * i);
  }
  const g = x.createRadialGradient(S * 0.45, S * 0.4, S * 0.05, S / 2, S / 2, S * 0.62);
  g.addColorStop(0, css(mix(body, new THREE.Color('#ffffff'), 0.08)));
  g.addColorStop(1, css(body, 0));
  x.fillStyle = g; x.fillRect(band, band, S - 2 * band, S - 2 * band);
  if (skin.finish === 'matte') { // fine grain
    for (let i = 0; i < 900; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
      x.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
    }
  }
  if (skin.finish === 'metal') { // brushed
    for (let i = 0; i < 160; i++) {
      x.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      const yy = Math.random() * S; x.beginPath(); x.moveTo(0, yy); x.lineTo(S, yy + (Math.random() - 0.5) * 4); x.stroke();
    }
  }
  const pr = (value === 1 ? 0.125 : 0.085) * S;
  const dark = mix(body, new THREE.Color('#000000'), 0.55);
  for (const [u, v] of PIPS[value]) {
    const px = u * S; const py = v * S;
    // engraved lip: dark crescent top-left, light bottom-right
    x.beginPath(); x.arc(px, py, pr * 1.12, 0, Math.PI * 2);
    const lip = x.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
    lip.addColorStop(0, css(dark, 0.85)); lip.addColorStop(1, css(mix(body, new THREE.Color('#ffffff'), 0.35), 0.8));
    x.fillStyle = lip; x.fill();
    x.beginPath(); x.arc(px + pr * 0.04, py + pr * 0.04, pr, 0, Math.PI * 2);
    const pg = x.createRadialGradient(px + pr * 0.25, py + pr * 0.3, pr * 0.1, px, py, pr);
    pg.addColorStop(0, css(glow ? mix(pip, new THREE.Color('#ffffff'), 0.5) : mix(pip, new THREE.Color('#ffffff'), 0.12)));
    pg.addColorStop(0.75, css(pip));
    pg.addColorStop(1, css(mix(pip, new THREE.Color('#000000'), 0.45)));
    x.fillStyle = pg; x.fill();
  }
  // --- bump (white = high)
  const b = mkCanvas(128); const bx = b.getContext('2d');
  bx.fillStyle = '#fff'; bx.fillRect(0, 0, 128, 128);
  for (const [u, v] of PIPS[value]) {
    const r = pr / 2;
    const bg = bx.createRadialGradient(u * 128, v * 128, r * 0.3, u * 128, v * 128, r * 1.15);
    bg.addColorStop(0, '#000'); bg.addColorStop(0.8, '#333'); bg.addColorStop(1, '#fff');
    bx.fillStyle = bg; bx.beginPath(); bx.arc(u * 128, v * 128, r * 1.15, 0, Math.PI * 2); bx.fill();
  }
  // --- emissive (glow finish only)
  let e = null;
  if (glow) {
    e = mkCanvas(128); const ex = e.getContext('2d');
    ex.fillStyle = css(body.clone().multiplyScalar(0.22)); ex.fillRect(0, 0, 128, 128);
    const eb = 128 * BEVEL;
    const eg = ex.createLinearGradient(0, 0, 0, 128);
    ex.strokeStyle = css(edge, 0.55); ex.lineWidth = eb * 0.6; ex.strokeRect(eb * 0.3, eb * 0.3, 128 - eb * 0.6, 128 - eb * 0.6);
    void eg;
    for (const [u, v] of PIPS[value]) {
      const r = pr / 2;
      const gg = ex.createRadialGradient(u * 128, v * 128, 0, u * 128, v * 128, r * 1.7);
      gg.addColorStop(0, css(mix(pip, new THREE.Color('#ffffff'), 0.4)));
      gg.addColorStop(0.55, css(pip));
      gg.addColorStop(1, css(pip, 0));
      ex.fillStyle = gg; ex.beginPath(); ex.arc(u * 128, v * 128, r * 1.7, 0, Math.PI * 2); ex.fill();
    }
  }
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(c, true), bump: tex(b, false), emissive: e ? tex(e, true) : null };
}

function makeFaceMaterial(skin, value) {
  const t = faceTextures(skin, value);
  const common = { map: t.map, bumpMap: t.bump, bumpScale: 2.2 };
  let m;
  switch (skin.finish) {
    case 'gloss':
      m = new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.1 });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ ...common, roughness: 0.26, metalness: 0.85, envMapIntensity: 2.4 });
      break;
    case 'glow':
      m = new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
        emissive: new THREE.Color('#ffffff'), emissiveMap: t.emissive, emissiveIntensity: 1.25, envMapIntensity: 1 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ ...common, roughness: 0.62, metalness: 0, envMapIntensity: 0.75 });
  }
  m.userData.value = value;
  return m;
}

function radialTexture(stops, size = 128) {
  const c = mkCanvas(size); const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, s] of stops) g.addColorStop(o, s);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildEnvironment(renderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
      vec3 top = vec3(0.55,0.48,0.62); vec3 mid = vec3(0.16,0.11,0.22); vec3 bot = vec3(0.05,0.03,0.07);
      vec3 c = h > 0. ? mix(mid, top, pow(h, .7)) : mix(mid, bot, pow(-h, .5));
      gl_FragColor = vec4(c, 1.); }`,
  }));
  scene.add(sky);
  const panel = (w, h, color, intensity, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); scene.add(m);
  };
  panel(26, 14, '#fff3dc', 3.2, [-14, 26, 16]);   // warm key softbox
  panel(18, 30, '#b9a6ff', 1.6, [30, 8, -10]);    // cool purple rim
  panel(30, 6, '#ffd27a', 1.4, [0, 4, 34]);       // low gold front strip
  panel(10, 10, '#ffffff', 2.4, [8, 40, -6]);     // top
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.035);
  pm.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
class Particles {
  constructor(cap, additive) {
    this.cap = cap; this.n = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap); this.alpha = new Float32Array(cap); this.shape = new Float32Array(cap); this.rot = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.age = new Float32Array(cap); this.life = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap);
    this.c0 = new Float32Array(cap * 3); this.c1 = new Float32Array(cap * 3);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.spin = new Float32Array(cap); this.twk = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    const attr = (arr, k) => { const a = new THREE.BufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); return a; };
    geo.setAttribute('position', attr(this.pos, 3));
    geo.setAttribute('color', attr(this.col, 3));
    geo.setAttribute('size', attr(this.size, 1));
    geo.setAttribute('alpha', attr(this.alpha, 1));
    geo.setAttribute('shape', attr(this.shape, 1));
    geo.setAttribute('rot', attr(this.rot, 1));
    geo.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 300 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; attribute float shape; attribute float rot;
        uniform float uScale; varying vec3 vC; varying float vA; varying float vS; varying float vR;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
          gl_PointSize = min(160., size*uScale/max(0.001,-mv.z)); vC=color; vA=alpha; vS=shape; vR=rot; }`,
      fragmentShader: `varying vec3 vC; varying float vA; varying float vS; varying float vR;
        void main(){ vec2 p = gl_PointCoord*2.-1.; float cs=cos(vR), sn=sin(vR); p = vec2(cs*p.x-sn*p.y, sn*p.x+cs*p.y);
          float r = length(p); float a;
          if (vS < .5) { a = 1.-smoothstep(0.,1.,r); a*=a; }
          else if (vS < 1.5) { float an = atan(p.y,p.x); float k = pow(.5+.5*cos(5.*an), 2.5); float R = .38+.55*k;
            a = 1.-smoothstep(R-.18, R, r); a = max(a, (1.-smoothstep(0.,.35,r))); }
          else if (vS < 2.5) { float an = atan(p.y,p.x); float arms = pow(abs(cos(3.*an)), 30.)*(1.-smoothstep(.6,1.,r));
            a = max(arms, 1.-smoothstep(.12,.32,r)); }
          else { a = max(1.-smoothstep(0.,.18,abs(p.x))*1., 0.)*(1.-smoothstep(.5,1.,abs(p.y))); a = max(a, 1.-smoothstep(0.,.4,r)); }
          if (a < .01) discard;
          ${additive ? 'gl_FragColor = vec4(vC*a*vA, a*vA);' : 'gl_FragColor = vec4(vC, a*vA);'} }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geo = geo;
  }
  emit(o) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set(o.p, i * 3); this.vel.set(o.v || [0, 0, 0], i * 3);
    this.age[i] = 0; this.life[i] = o.life || 0.6;
    this.s0[i] = o.s0 ?? 0.3; this.s1[i] = o.s1 ?? this.s0[i];
    this.a0[i] = o.a ?? 1;
    const c0 = o.c0; const c1 = o.c1 || o.c0;
    this.c0[i * 3] = c0.r; this.c0[i * 3 + 1] = c0.g; this.c0[i * 3 + 2] = c0.b;
    this.c1[i * 3] = c1.r; this.c1[i * 3 + 1] = c1.g; this.c1[i * 3 + 2] = c1.b;
    this.grav[i] = o.g ?? 0; this.drag[i] = o.drag ?? 1.5; this.shape[i] = o.shape ?? 0;
    this.rot[i] = Math.random() * 6.28; this.spin[i] = o.spin ?? 0; this.twk[i] = o.twinkle ?? 0;
    this.size[i] = 0; this.alpha[i] = 0;
  }
  _copy(d, s) {
    for (const k of ['pos', 'col', 'vel', 'c0', 'c1']) { const a = this[k]; a[d * 3] = a[s * 3]; a[d * 3 + 1] = a[s * 3 + 1]; a[d * 3 + 2] = a[s * 3 + 2]; }
    for (const k of ['size', 'alpha', 'shape', 'rot', 'age', 'life', 's0', 's1', 'a0', 'grav', 'drag', 'spin', 'twk']) this[k][d] = this[k][s];
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.n--; if (i !== this.n) this._copy(i, this.n); i--; continue; }
      const t = this.age[i] / this.life[i];
      const k = Math.max(0, 1 - this.drag[i] * dt);
      const j = i * 3;
      this.vel[j] *= k; this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt; this.vel[j + 2] *= k;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02) { this.pos[j + 1] = 0.02; this.vel[j + 1] *= -0.3; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      let a = this.a0[i] * Math.min(1, t * 8) * (1 - t) ** 1.3;
      if (this.twk[i]) a *= 0.55 + 0.45 * Math.sin(this.age[i] * this.twk[i] + i);
      this.alpha[i] = a;
      this.rot[i] += this.spin[i] * dt;
      for (let c = 0; c < 3; c++) this.col[j + c] = this.c0[j + c] + (this.c1[j + c] - this.c0[j + c]) * t;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'alpha', 'shape', 'rot']) this.geo.attributes[k].needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

const C = (h) => new THREE.Color(h);
const rr = (a, b) => a + Math.random() * (b - a);
const FXC = {
  dust: [C('#a8957c'), C('#6b5b4d')],
  sparks: [C('#fff1b0'), C('#ffb02e'), C('#ff5a1a')],
  flames: [C('#fff0a0'), C('#ffae2b'), C('#ff4a14'), C('#8a1a08')],
  frost: [C('#ffffff'), C('#bfe8ff'), C('#5fb8ff')],
  stars: [C('#fff6c8'), C('#f2c443'), C('#ffffff'), C('#c9a6ff')],
};
/** Trail particles behind a moving die. `pos` local, `vel` local, `amt` 0..1 */
function emitTrail(fx, sys, pos, vel, amt, reduced) {
  const P = (dx = 0.3) => [pos[0] + rr(-dx, dx), pos[1] + rr(-dx, dx), pos[2] + rr(-dx, dx)];
  const back = (k) => [-vel[0] * k + rr(-0.6, 0.6), -vel[1] * k + rr(-0.3, 0.6), -vel[2] * k + rr(-0.6, 0.6)];
  const m = reduced ? 0.4 : 1;
  const count = (base) => { const x = base * amt * m; return Math.floor(x) + (Math.random() < x % 1 ? 1 : 0); };
  switch (fx) {
    case 'dust': {
      for (let i = count(0.8); i--;) sys.normal.emit({ p: P(0.35), v: back(0.05), life: rr(0.5, 0.9), s0: rr(0.35, 0.55), s1: rr(1.1, 1.6), a: 0.28, c0: FXC.dust[0], c1: FXC.dust[1], g: -0.4, drag: 2.5 });
      break;
    }
    case 'sparks': {
      for (let i = count(2.2); i--;) sys.add.emit({ p: P(0.3), v: [rr(-3, 3), rr(0, 4), rr(-3, 3)], life: rr(0.25, 0.5), s0: rr(0.12, 0.2), s1: 0.03, a: 1, c0: FXC.sparks[0], c1: FXC.sparks[2], g: 18, drag: 1 });
      break;
    }
    case 'flames': {
      for (let i = count(2.4); i--;) sys.add.emit({ p: P(0.28), v: [rr(-0.5, 0.5) - vel[0] * 0.06, rr(1.5, 3.5), rr(-0.5, 0.5) - vel[2] * 0.06], life: rr(0.3, 0.55), s0: rr(0.6, 0.95), s1: 0.12, a: 1, c0: FXC.flames[0], c1: FXC.flames[2], g: -3, drag: 2 });
      if (Math.random() < 0.35 * amt) sys.add.emit({ p: P(0.2), v: [rr(-2, 2), rr(2, 5), rr(-2, 2)], life: 0.5, s0: 0.1, s1: 0.02, a: 1, c0: FXC.flames[0], c1: FXC.flames[2], g: 4, drag: 1 });
      break;
    }
    case 'frost': {
      for (let i = count(1.3); i--;) sys.add.emit({ p: P(0.4), v: [rr(-0.6, 0.6), rr(-0.2, 0.8), rr(-0.6, 0.6)], life: rr(0.6, 1.1), s0: rr(0.3, 0.48), s1: 0.12, a: 0.95, c0: FXC.frost[0], c1: FXC.frost[2], g: 1.2, drag: 2, shape: 2, spin: rr(-2, 2) });
      if (Math.random() < 0.5 * amt) sys.normal.emit({ p: P(0.3), v: back(0.04), life: 0.8, s0: 0.5, s1: 1.3, a: 0.16, c0: FXC.frost[1], g: -0.2, drag: 2 });
      break;
    }
    case 'stars': {
      for (let i = count(1.1); i--;) {
        const c = FXC.stars[Math.floor(Math.random() * 4)];
        sys.add.emit({ p: P(0.35), v: [rr(-0.8, 0.8), rr(0, 1.2), rr(-0.8, 0.8)], life: rr(0.6, 1.0), s0: rr(0.35, 0.55), s1: 0.1, a: 1, c0: c, c1: FXC.stars[1], g: 0.6, drag: 1.5, shape: 1, spin: rr(-3, 3), twinkle: 18 });
      }
      break;
    }
    default:
  }
}
/** Landing burst at floor position `pos` (local), strength 0..1. */
function emitBurst(fx, sys, pos, k, reduced) {
  const N = (b) => Math.round(b * (0.45 + 0.55 * k) * (reduced ? 0.4 : 1));
  const ring = (i, n, sp) => { const a = (i / n) * Math.PI * 2 + rr(-0.2, 0.2); return [Math.cos(a) * sp, Math.sin(a) * sp]; };
  const p = [pos[0], 0.08, pos[2]];
  switch (fx) {
    case 'dust': {
      const n = N(14);
      for (let i = 0; i < n; i++) { const [x, z] = ring(i, n, rr(2.2, 3.6)); sys.normal.emit({ p: [p[0] + x * 0.12, 0.15, p[2] + z * 0.12], v: [x, rr(0.2, 0.8), z], life: rr(0.6, 1), s0: 0.4, s1: rr(1.2, 1.8), a: 0.32, c0: FXC.dust[0], c1: FXC.dust[1], drag: 3.5, g: -0.3 }); }
      break;
    }
    case 'sparks': {
      const n = N(26);
      for (let i = 0; i < n; i++) { const [x, z] = ring(i, n, rr(2, 6)); sys.add.emit({ p, v: [x, rr(3, 8), z], life: rr(0.3, 0.6), s0: rr(0.14, 0.22), s1: 0.02, c0: FXC.sparks[0], c1: FXC.sparks[2], g: 22, drag: 0.8 }); }
      sys.add.emit({ p: [p[0], 0.3, p[2]], v: [0, 0, 0], life: 0.18, s0: 1.6, s1: 2.6, a: 0.6, c0: FXC.sparks[1], c1: FXC.sparks[2], drag: 0 });
      break;
    }
    case 'flames': {
      const n = N(22);
      for (let i = 0; i < n; i++) { const [x, z] = ring(i, n, rr(1.8, 3.2)); sys.add.emit({ p: [p[0], 0.25, p[2]], v: [x, rr(1, 3), z], life: rr(0.35, 0.6), s0: rr(0.6, 0.9), s1: 0.15, a: 0.8, c0: FXC.flames[1], c1: FXC.flames[3], g: -4, drag: 3 }); }
      sys.add.emit({ p: [p[0], 0.4, p[2]], v: [0, 1, 0], life: 0.25, s0: 1.8, s1: 2.8, a: 0.55, c0: FXC.flames[0], c1: FXC.flames[2], drag: 0 });
      break;
    }
    case 'frost': {
      const n = N(18);
      for (let i = 0; i < n; i++) { const [x, z] = ring(i, n, rr(1.5, 3.4)); sys.add.emit({ p: [p[0], 0.2, p[2]], v: [x, rr(0.5, 2.5), z], life: rr(0.5, 0.9), s0: rr(0.3, 0.5), s1: 0.1, c0: FXC.frost[0], c1: FXC.frost[2], g: 3, drag: 2.5, shape: 2, spin: rr(-4, 4) }); }
      for (let i = 0; i < N(6); i++) { const [x, z] = ring(i, 6, 1.2); sys.normal.emit({ p: [p[0], 0.2, p[2]], v: [x, 0.2, z], life: 0.9, s0: 0.6, s1: 1.8, a: 0.22, c0: FXC.frost[1], drag: 3 }); }
      break;
    }
    case 'stars': {
      const n = N(14);
      for (let i = 0; i < n; i++) { const [x, z] = ring(i, n, rr(2, 3.6)); sys.add.emit({ p: [p[0], 0.3, p[2]], v: [x, rr(1.5, 3.5), z], life: rr(0.5, 0.85), s0: rr(0.4, 0.6), s1: 0.12, c0: FXC.stars[Math.floor(Math.random() * 3)], c1: FXC.stars[3], g: 4, drag: 2, shape: 1, spin: rr(-4, 4), twinkle: 20 }); }
      break;
    }
    default:
  }
}
function emitCritBurst(sys, pos, color) {
  const c = C(color);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    sys.add.emit({ p: [pos[0], 0.9, pos[2]], v: [Math.cos(a) * rr(1.5, 2.6), rr(1.5, 3), Math.sin(a) * rr(1.5, 2.6)], life: rr(0.5, 0.8), s0: rr(0.3, 0.45), s1: 0.08, c0: C('#ffffff'), c1: c, g: 3, drag: 2.2, shape: 1, spin: rr(-4, 4) });
  }
}

// ---------------------------------------------------------------------------
// DiceTray
// ---------------------------------------------------------------------------
let cssInjected = false;
function injectCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  if ([...document.styleSheets].some((s) => (s.href || '').includes('/dice.css'))) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('../css/dice.css', import.meta.url).href;
  document.head.appendChild(l);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sfx = (name, intensity = 1) => window.dispatchEvent(new CustomEvent('relix:sfx', { detail: { name, intensity } }));

export class DiceTray {
  constructor(opts = {}) {
    this.opts = opts;
    injectCss();
    const el = document.createElement('div');
    el.className = 'dice-tray';
    el.style.display = 'none';
    el.innerHTML = `<canvas class="dice-canvas"></canvas>
      <div class="dice-layer"></div>
      <div class="dice-title"></div>
      <div class="dice-prompt" aria-live="polite">
        <div class="dice-hint"><i class="dh-trail"></i><i class="dh-finger"></i><i class="dh-chev"></i><i class="dh-chev"></i></div>
        <div class="dice-prompt-text">Swipe to throw</div>
        <div class="dice-prompt-sub">or tap for a gentle toss</div>
      </div>
      <div class="dice-safe"></div>`;
    (opts.parent || document.body).appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.layer = el.querySelector('.dice-layer');
    this.titleEl = el.querySelector('.dice-title');
    this.promptEl = el.querySelector('.dice-prompt');
    this.safeEl = el.querySelector('.dice-safe');
    this.reduced = opts.reducedMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this._token = 0;
    this.timeScale = 1; // debug slow-motion
    this.debugFixedDt = 0; // debug: advance a fixed time per rendered frame (deterministic screenshots)
    this._clockWaiters = [];
    this._clock = 0;
    this._raf = 0;
    this._visible = false;
    this._state = 'idle';
    this._onResize = () => this._resize();
    this._bindPointer();
  }

  // ---------- public ----------
  async roll({ values, mode = 'auto', kind = 'plain', triggers = [], label = '', skin = 'bone', throwFx = 'dust', area = null, speed = 1, reducedMotion } = {}) {
    const vals = (values || []).slice(0, 6).map((v) => clamp(Math.round(v) || 1, 1, 6));
    if (!vals.length || speed < 0.05) return vals;
    this._finishPending();
    const token = ++this._token;
    const reduced = reducedMotion ?? this.reduced;
    this._init();
    const skinDef = typeof skin === 'object' ? skin : byId(DICE_SKINS, skin);
    const fx = THROW_FX.some((f) => f.id === throwFx) ? throwFx : 'none';
    const human = mode === 'swipe';
    const r = { values: vals, kind, triggers, label, skin: skinDef, fx, speed, human, reduced, token };
    this.cur = r;
    let resolveFn;
    const done = new Promise((res) => { resolveFn = res; });
    this._pendingResolve = () => resolveFn(vals);

    this._show();
    this.el.classList.toggle('human', human);
    this._layout(area, vals.length);
    this._setupDice(r);
    this._setTitle(label);
    this.layer.innerHTML = '';

    let spec;
    if (human) {
      this._state = 'hand';
      this.el.classList.add('waiting');
      this.promptEl.classList.add('show');
      const t = await this._waitThrow(token);
      if (token !== this._token) return done;
      this.promptEl.classList.remove('show');
      this.el.classList.remove('waiting');
      spec = this._specFromSwipe(t);
      r.fromHand = true;
    } else {
      spec = this._autoSpec(reduced);
    }
    // plan (simulate to rest) and assign faces
    const t0 = performance.now();
    const plan = planRoll({ values: vals, tray: this.tray, spec });
    this.lastStats = { attempts: plan.attempts, simMs: Math.round(performance.now() - t0), duration: plan.duration };
    r.plan = plan;
    this._applyLayouts(r);
    // timing
    const targetSim = human ? Math.max(0.75, 1.3 * Math.min(1, speed)) : Math.max(0.42, 1.0 * speed);
    r.rate = clamp(plan.duration / targetSim, human ? 0.95 : 1, human ? 1.7 : 2.6);
    r.launch = human ? 0.13 : Math.max(0.08, 0.16 * Math.min(1, speed + 0.2));
    r.launchFrom = human ? this.dice.slice(0, vals.length).map((d) => d.mesh.position.clone()) : this._autoLaunchFrom(plan, spec);
    r.evIdx = 0; r.landed = new Set(); r.lastHit = 0;
    r.t0 = this._clock;
    this._state = 'play';
    sfx('dice_throw', human ? clamp(spec.power + 0.3, 0.3, 1) : 0.6);
    const total = r.launch + plan.duration / r.rate;
    await Promise.race([this._waitState('settled', token), this._fallback(total + 1.2)]);
    if (token !== this._token) return done;
    if (this._state !== 'settled') this._settle(r); // tab hidden fallback
    sfx('dice_settle', 0.8);
    this._highlight(r);
    const hold = human ? Math.max(0.65, 1.05 * Math.min(1, speed + 0.3)) : Math.max(0.2, 0.5 * speed);
    await Promise.race([this._waitClock(this._clock + hold), this._fallback(hold + 0.3), this._waitTap(token, human)]);
    if (token !== this._token) return done;
    this._pendingResolve = null;
    resolveFn(vals);
    this._fadeOut(token);
    return done;
  }

  /** Optional: build the WebGL context, environment and a skin's textures ahead of the first roll (~0.3–0.7s on phones). */
  warmup(skin = 'bone') {
    this._init();
    const sk = typeof skin === 'object' ? skin : byId(DICE_SKINS, skin);
    const mats = this._skinMats(sk);
    this.dice[0].mesh.material = BASE_LAYOUT.map((v) => mats[v]);
    this.dice[0].mesh.visible = true;
    try { this.renderer.compile(this.scene, this.camera); } catch { /* ignore */ }
    this.dice[0].mesh.visible = false;
  }

  hide() {
    this._finishPending();
    this._token++;
    this._hideNow();
  }

  /** Debug: values currently on top of the rendered dice (reads the material sitting on the top face). */
  debugTopFaces() {
    if (!this.cur || !this.dice) return [];
    return this.dice.slice(0, this.cur.values.length).map((d) => {
      const { slot } = topSlot(d.mesh.quaternion);
      return d.mesh.material[slot].userData.value;
    });
  }

  get state() { return this._state; }

  // ---------- setup ----------
  _init() {
    if (this.renderer) return;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    const scene = new THREE.Scene();
    scene.environment = buildEnvironment(renderer);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
    const pitch = THREE.MathUtils.degToRad(60);
    this.camera.position.set(0, Math.sin(pitch) * 40, Math.cos(pitch) * 40);
    this.camera.lookAt(0, 0, 0);

    this.root = new THREE.Group();
    scene.add(this.root);
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a1838, 0.55));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    this.key = key;
    this.root.add(key); this.root.add(key.target);
    key.position.set(-3.5, 12, 5); key.target.position.set(0, 0, 0);
    const rim = new THREE.DirectionalLight(0xb48cff, 1.0);
    rim.position.set(6, 5, -7); this.root.add(rim);

    // floor: shadow catcher + soft pool of light
    this.shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.42, color: 0x0a0410 }));
    this.shadowPlane.rotation.x = -Math.PI / 2; this.shadowPlane.receiveShadow = true;
    this.root.add(this.shadowPlane);
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(10,4,18,0.55)'], [0.55, 'rgba(20,8,32,0.32)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
    this.pool.rotation.x = -Math.PI / 2; this.pool.position.y = 0.004; this.pool.renderOrder = -2;
    this.root.add(this.pool);
    this.poolGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0)'], [0.8, 'rgba(242,196,67,0.09)'], [0.9, 'rgba(160,110,255,0.06)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.poolGlow.rotation.x = -Math.PI / 2; this.poolGlow.position.y = 0.006; this.poolGlow.renderOrder = -1;
    this.root.add(this.poolGlow);

    this.geo = roundedBoxGeometry();
    this.haloTex = radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.25, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    this.ringTex = radialTexture([[0, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,0.05)'], [0.62, 'rgba(255,255,255,0.9)'], [0.7, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    this.dice = [];
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.geo, []);
      mesh.castShadow = true;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      halo.scale.setScalar(2.6); halo.renderOrder = 3;
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.renderOrder = 1;
      mesh.visible = false; halo.visible = false; ring.visible = false;
      this.root.add(mesh); this.root.add(halo); this.root.add(ring);
      this.dice.push({ mesh, halo, ring, spinAxis: new THREE.Vector3(), mats: null });
    }
    this.fx = { add: new Particles(1400, true), normal: new Particles(500, false) };
    this.root.add(this.fx.normal.points); this.root.add(this.fx.add.points);
    this.skinCache = new Map();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  }

  _skinMats(skin) {
    if (!this.skinCache.has(skin.id)) {
      const m = {}; for (let v = 1; v <= 6; v++) m[v] = makeFaceMaterial(skin, v);
      this.skinCache.set(skin.id, m);
    }
    return this.skinCache.get(skin.id);
  }

  _resize() {
    if (!this.renderer) return;
    const w = window.innerWidth; const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this._pxScale = buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.camera.updateMatrixWorld();
    if (this.root) {
      const s = this.root.scale.x;
      this.fx.add.uniforms.uScale.value = this._pxScale * s;
      this.fx.normal.uniforms.uScale.value = this._pxScale * s;
    }
  }

  _screenToPlane(x, y, h = 0) {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.camera);
    const t = (h - rc.ray.origin.y) / rc.ray.direction.y;
    return rc.ray.origin.clone().addScaledVector(rc.ray.direction, t);
  }

  _layout(area, n) {
    this._resize();
    const vw = window.innerWidth; const vh = window.innerHeight;
    this.safeB = this.safeEl.offsetHeight || 0;
    let rect;
    if (area && area.width > 20 && area.height > 20) rect = { x: area.left ?? area.x, y: area.top ?? area.y, w: area.width, h: area.height };
    else {
      const w = Math.min(vw * 0.88, 560); const h = Math.min(vh * 0.42, 420);
      rect = { x: (vw - w) / 2, y: vh * 0.45 - h / 2, w, h };
    }
    this.rect = rect;
    const cx = rect.x + rect.w / 2; const cy = rect.y + rect.h / 2;
    const C0 = this._screenToPlane(cx, cy, 0);
    const p1 = C0.clone().add(new THREE.Vector3(1, 0, 0)).project(this.camera);
    const p0 = C0.clone().project(this.camera);
    const kx = Math.abs(p1.x - p0.x) * vw / 2; // px per world unit
    const small = Math.min(vw, vh) < 600;
    const need = n > 4 ? [5.2, 4.5] : n > 2 ? [4.4, 3.9] : [3.8, 3.4]; // tray size in die units
    const diePx = clamp(Math.min(rect.w / need[0], rect.h / need[1]), small ? 28 : 32, small ? 58 : 70);
    this.diePx = diePx;
    const s = diePx / kx;
    this.root.position.copy(C0);
    this.root.scale.setScalar(s);
    this.root.updateMatrixWorld();
    const toL = (sx, sy, h = 0) => this.root.worldToLocal(this._screenToPlane(sx, sy, h));
    const tl = toL(rect.x, rect.y); const tr = toL(rect.x + rect.w, rect.y);
    const bl = toL(rect.x, rect.y + rect.h); const br = toL(rect.x + rect.w, rect.y + rect.h);
    let hx = Math.min(tr.x - tl.x, br.x - bl.x) / 2 - 0.2;
    let zFar = Math.max(tl.z, tr.z) + 0.7; let zNear = Math.min(bl.z, br.z) - 0.15;
    hx = Math.max(hx, need[0] / 2);
    const minD = need[1];
    if (zNear - zFar < minD) { const m = (zNear + zFar) / 2; zFar = m - minD / 2; zNear = m + minD / 2; }
    this.tray = { hx, zFar, zNear };
    const W = hx * 2; const D = zNear - zFar; const zc = (zNear + zFar) / 2;
    this.shadowPlane.scale.set(W + 4, D + 4, 1); this.shadowPlane.position.set(0, 0.001, zc);
    this.pool.scale.set(W * 1.25, D * 1.35, 1); this.pool.position.z = zc;
    this.poolGlow.scale.set(W * 1.3, D * 1.4, 1); this.poolGlow.position.z = zc;
    const sc = this.key.shadow.camera; const ext = Math.max(W, D) / 2 + 2.5;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 40;
    this.key.position.set(-3.5, 13, zc + 5); this.key.target.position.set(0, 0, zc);
    sc.updateProjectionMatrix();
    // the "hand": where swipe-mode dice wait, near the bottom of the screen
    const handY = Math.max(rect.y + rect.h + diePx * 0.5, vh - 185 - this.safeB);
    this.handY = Math.min(handY, vh - 120 - this.safeB);
    this.hand = toL(vw / 2, this.handY, 1.6 * s);
    this.promptEl.style.top = `${this.handY + diePx * 1.2}px`;
    this.promptEl.style.setProperty('--hand-dy', `${diePx * 1.2}px`);
  }

  _setTitle(label) {
    this.titleEl.textContent = label || '';
    this.titleEl.style.display = label ? '' : 'none';
    if (label) {
      const top = Math.max(8 + (this.opts.safeTop || 0), this.rect.y - this.diePx * 0.9 - 30);
      this.titleEl.style.top = `${top}px`;
      this.titleEl.style.left = `${this.rect.x + this.rect.w / 2}px`;
    }
  }

  _setupDice(r) {
    const n = r.values.length;
    const mats = this._skinMats(r.skin);
    const cols = n === 4 ? 2 : Math.min(3, n);
    this.fx.add.clear(); this.fx.normal.clear();
    this.dice.forEach((d, i) => {
      const on = i < n;
      d.mesh.visible = on; d.halo.visible = on && r.skin.finish === 'glow'; d.ring.visible = false;
      d.ring.material.opacity = 0; d.halo.material.opacity = 0;
      if (!on) return;
      if (d.mats) d.mats.forEach((m) => m.dispose());
      d.mats = BASE_LAYOUT.map((v) => mats[v].clone());
      d.mats.forEach((m, k) => { m.userData.value = BASE_LAYOUT[k]; m.userData.baseColor = m.color.clone(); });
      d.mesh.material = d.mats;
      d.mesh.scale.setScalar(HAND_SCALE);
      const col = i % cols; const row = Math.floor(i / cols); const rowCount = Math.min(cols, n - row * cols);
      d.handOff = new THREE.Vector3((col - (rowCount - 1) / 2) * 1.12 + (row % 2) * 0.2, row * 0.3, row * -1.0 + (Math.floor((n - 1) / cols)) * 0.5);
      d.mesh.position.copy(this.hand).add(d.handOff);
      d.mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
      d.spinAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      d.phase = Math.random() * 6.28;
      d.halo.material.color.set(r.skin.pip);
    });
    this.handDrag = new THREE.Vector3();
    this.grab = 0;
  }

  _applyLayouts(r) {
    r.plan.layouts.forEach((L, i) => {
      const d = this.dice[i];
      const mats = this._skinMats(r.skin);
      d.mats.forEach((m) => m.dispose());
      d.mats = L.map((v) => { const m = mats[v].clone(); m.userData.value = v; m.userData.baseColor = m.color.clone(); return m; });
      d.mesh.material = d.mats;
    });
  }

  // ---------- throw input ----------
  _bindPointer() {
    const el = this.el;
    let st = null; let samples = [];
    el.addEventListener('pointerdown', (e) => {
      if (this._tapWaiter && this._state === 'settled') { this._tapWaiter(); return; }
      if (this._state !== 'hand') return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      st = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      samples = [{ x: e.clientX, y: e.clientY, t: st.t }];
      this.grab = 1;
    });
    el.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id || this._state !== 'hand') return;
      const t = performance.now();
      samples.push({ x: e.clientX, y: e.clientY, t });
      while (samples.length > 2 && t - samples[0].t > 90) samples.shift();
      this.dragPx = { x: e.clientX - st.x, y: e.clientY - st.y };
    });
    const up = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      const s0 = st; st = null; this.grab = 0; this.dragPx = null;
      if (cancel || this._state !== 'hand' || !this._throwWaiter) return;
      const t = performance.now();
      samples.push({ x: e.clientX, y: e.clientY, t });
      const dist = Math.hypot(e.clientX - s0.x, e.clientY - s0.y);
      if (dist < 12) { this._throwWaiter({ tap: true }); return; }
      const a = samples[0]; const b = samples[samples.length - 1];
      const dt = Math.max(16, b.t - a.t);
      let vx = (b.x - a.x) / dt; let vy = (b.y - a.y) / dt; // px/ms
      if (Math.hypot(vx, vy) < 0.05) { vx = (e.clientX - s0.x) / Math.max(16, t - s0.t); vy = (e.clientY - s0.y) / Math.max(16, t - s0.t); }
      this._throwWaiter({ vx, vy });
    };
    el.addEventListener('pointerup', (e) => up(e, false));
    el.addEventListener('pointercancel', (e) => up(e, true));
    window.addEventListener('keydown', (e) => {
      if (this._state === 'hand' && this._throwWaiter && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); this._throwWaiter({ vx: (Math.random() - 0.5) * 0.6, vy: -1.6 }); }
      else if (this._state === 'settled' && this._tapWaiter && (e.key === ' ' || e.key === 'Enter')) this._tapWaiter();
    });
  }

  _waitThrow(token) {
    return new Promise((res) => {
      this._throwWaiter = (t) => { this._throwWaiter = null; res(t); };
      this._cancelThrow = () => { this._throwWaiter = null; res(null); };
      void token;
    });
  }

  _waitClock(t) { return new Promise((res) => this._clockWaiters.push({ t, res })); }

  /** Wall-clock safety net (e.g. tab hidden, rAF paused) so the game never stalls on the dice. */
  _fallback(sec) {
    if (this.debugFixedDt || this.timeScale !== 1) return new Promise(() => {});
    return sleep(sec * 1000);
  }

  _waitTap(token, enabled) {
    if (!enabled) return new Promise(() => {});
    return new Promise((res) => { this._tapWaiter = () => { this._tapWaiter = null; res(); }; });
  }

  _waitState(state, token) {
    return new Promise((res) => {
      const chk = () => { if (this._state === state || token !== this._token) res(); else this._stateWaiters.push(chk); };
      this._stateWaiters = this._stateWaiters || [];
      chk();
    });
  }
  _setState(s) {
    this._state = s;
    const w = this._stateWaiters || []; this._stateWaiters = [];
    w.forEach((f) => f());
  }

  _specFromSwipe(t) {
    const qHand = this.dice.slice(0, this.cur.values.length).map((d) => d.mesh.quaternion.clone());
    if (!t || t.tap) {
      return { dir: [(Math.random() - 0.5) * 0.3, -1], power: 0.08, qHand };
    }
    const sp = Math.hypot(t.vx, t.vy);
    let dx = t.vx / (sp || 1); let dz = t.vy / (sp || 1);
    if (dz > -0.35) dz = -0.35; // always throw into the tray
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const power = clamp((sp - 0.25) / 2.6, 0.12, 1) * (this.reduced ? 0.6 : 1);
    return { dir: [dx, dz], power, qHand };
  }

  _autoSpec(reduced) {
    // bots: throw from a random side toward the opposite one
    const a = (Math.random() - 0.5) * 0.9;
    const sides = [[0, -1], [0, -1], [1, 0], [-1, 0], [0, 1]];
    const [bx, bz] = sides[Math.floor(Math.random() * sides.length)];
    const dir = [bx * Math.cos(a) - bz * Math.sin(a), bx * Math.sin(a) + bz * Math.cos(a)];
    return { dir, power: reduced ? 0.2 : 0.35 + Math.random() * 0.4 };
  }

  _autoLaunchFrom(plan, spec) {
    // dice fly in from outside the tray along the throw direction
    return plan.starts.map((s) => new THREE.Vector3(s.p[0] - spec.dir[0] * 3.2, s.p[1] + 1.6, s.p[2] - spec.dir[1] * 3.2));
  }

  // ---------- show / hide / loop ----------
  _show() {
    clearTimeout(this._fadeTimer);
    this.el.style.display = '';
    this.el.classList.remove('out');
    void this.el.offsetWidth;
    this.el.classList.add('on');
    this.el.classList.toggle('human', false);
    this._visible = true;
    this._last = performance.now();
    if (!this._raf) this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  _fadeOut(token) {
    this.el.classList.add('out');
    this.el.classList.remove('human', 'waiting');
    this._fadeTimer = setTimeout(() => { if (token === this._token) this._hideNow(); }, 260);
  }

  _hideNow() {
    clearTimeout(this._fadeTimer);
    this.el.style.display = 'none';
    this.el.classList.remove('on', 'out', 'waiting', 'human');
    this.promptEl.classList.remove('show');
    this.layer.innerHTML = '';
    this._visible = false;
    this._setState('idle');
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.fx) { this.fx.add.clear(); this.fx.normal.clear(); }
  }

  _finishPending() {
    if (this._cancelThrow) { const c = this._cancelThrow; this._cancelThrow = null; if (this._throwWaiter) c(); }
    this._throwWaiter = null; this._tapWaiter = null;
    if (this._pendingResolve) { const p = this._pendingResolve; this._pendingResolve = null; p(); }
  }

  _frame(now) {
    this._raf = 0;
    if (!this._visible) return;
    const dt = this.debugFixedDt || Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this._clock += dt * this.timeScale;
    const r = this.cur;
    if (r) {
      const c = this._clock; const sdt = dt * this.timeScale;
      if (this._state === 'hand') this._updateHand(r, dt, now / 1000);
      else if (this._state === 'play') this._updatePlay(r, c);
      else if (this._state === 'settled') this._updateSettled(r, sdt, c);
      this.dice.forEach((d) => { if (d.halo.visible) d.halo.position.copy(d.mesh.position); });
    }
    this.fx.add.update(dt * this.timeScale); this.fx.normal.update(dt * this.timeScale);
    if (this._clockWaiters.length) {
      const due = this._clockWaiters.filter((w) => w.t <= this._clock);
      this._clockWaiters = this._clockWaiters.filter((w) => w.t > this._clock);
      due.forEach((w) => w.res());
    }
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  _updateHand(r, dt, t) {
    const n = r.values.length;
    const drag = this.dragPx ? new THREE.Vector3(this.dragPx.x / this.diePx * 0.45, 0, this.dragPx.y / this.diePx * 0.45) : new THREE.Vector3();
    drag.x = clamp(drag.x, -2.5, 2.5); drag.z = clamp(drag.z, -2.5, 1.5);
    this.handDrag.lerp(drag, 1 - Math.exp(-dt * 18));
    for (let i = 0; i < n; i++) {
      const d = this.dice[i];
      const shake = this.grab ? 0.07 : 0;
      d.mesh.position.copy(this.hand).add(d.handOff).add(this.handDrag);
      d.mesh.position.y += Math.sin(t * 2.2 + d.phase) * 0.12 + (Math.random() - 0.5) * shake;
      d.mesh.position.x += (Math.random() - 0.5) * shake;
      _q.setFromAxisAngle(d.spinAxis, dt * (this.grab ? 5 : 0.7));
      d.mesh.quaternion.premultiply(_q);
      if (d.halo.visible) d.halo.material.opacity = 0.35;
    }
  }

  _diePose(plan, i, simT, outP, outQ) {
    const f = clamp(simT / FRAME_DT, 0, plan.frames.length - 1);
    const a = Math.floor(f); const b = Math.min(plan.frames.length - 1, a + 1); const k = f - a;
    const A = plan.frames[a]; const B = plan.frames[b]; const o = i * 7;
    outP.set(A[o] + (B[o] - A[o]) * k, A[o + 1] + (B[o + 1] - A[o + 1]) * k, A[o + 2] + (B[o + 2] - A[o + 2]) * k);
    outQ.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]);
    if (k > 0) outQ.slerp(_q.set(B[o + 3], B[o + 4], B[o + 5], B[o + 6]), k);
  }

  _updatePlay(r, now) {
    const plan = r.plan; const n = r.values.length;
    const t = now - r.t0;
    const P = new THREE.Vector3(); const Q = new THREE.Quaternion();
    if (t < r.launch) {
      const u = t / r.launch;
      for (let i = 0; i < n; i++) {
        const d = this.dice[i]; const s = plan.starts[i];
        const p2 = new THREE.Vector3(...s.p); const v0 = new THREE.Vector3(...s.v);
        const p0 = r.launchFrom[i];
        const p1 = p2.clone().addScaledVector(v0, -r.launch * r.rate * 0.5);
        P.copy(p0).multiplyScalar((1 - u) ** 2).addScaledVector(p1, 2 * u * (1 - u)).addScaledVector(p2, u * u);
        d.mesh.position.copy(P);
        const q0 = new THREE.Quaternion(...s.q);
        const wl = Math.hypot(...s.w);
        Q.copy(rotQ(s.w, -wl * 0.1 * (1 - u))).multiply(q0);
        d.mesh.quaternion.copy(Q);
        d.mesh.scale.setScalar(r.fromHand ? HAND_SCALE + (1 - HAND_SCALE) * u : 0.35 + 0.65 * Math.min(1, u * 1.4));
        if (r.fx !== 'none') emitTrail(r.fx, this.fx, [P.x, P.y, P.z], [v0.x, v0.y, v0.z], 1, r.reduced);
      }
      return;
    }
    const simT = (t - r.launch) * r.rate;
    for (let i = 0; i < n; i++) {
      const d = this.dice[i];
      const prev = d.mesh.position.clone();
      this._diePose(plan, i, simT, P, Q);
      d.mesh.position.copy(P); d.mesh.quaternion.copy(Q); d.mesh.scale.setScalar(1);
      if (r.fx !== 'none') {
        const v = P.clone().sub(prev).multiplyScalar(60);
        const spd = v.length() / Math.max(1, r.rate);
        if (spd > 2.5) emitTrail(r.fx, this.fx, [P.x, P.y, P.z], [v.x, v.y, v.z], clamp(spd / 14, 0.15, 1), r.reduced);
      }
    }
    // collision events -> sfx + bursts
    const ev = plan.events;
    while (r.evIdx < ev.length && ev[r.evIdx].t <= simT) {
      const e = ev[r.evIdx++];
      const k = clamp(e.v / 12, 0, 1);
      if (now - r.lastHit > 0.035 && k > 0.08) { sfx('dice_hit', Number(k.toFixed(2))); r.lastHit = now; }
      if (e.floor && r.fx !== 'none' && (!r.landed.has(e.die) || k > 0.55)) {
        const first = !r.landed.has(e.die);
        r.landed.add(e.die);
        const pos = this.dice[e.die].mesh.position;
        emitBurst(r.fx, this.fx, [pos.x, 0, pos.z], first ? Math.max(0.5, k) : k * 0.5, r.reduced);
      }
    }
    if (simT >= plan.duration) this._settle(r);
  }

  _settle(r) {
    const plan = r.plan; const P = new THREE.Vector3(); const Q = new THREE.Quaternion();
    for (let i = 0; i < r.values.length; i++) {
      this._diePose(plan, i, plan.duration, P, Q);
      this.dice[i].mesh.position.copy(P); this.dice[i].mesh.quaternion.copy(Q); this.dice[i].mesh.scale.setScalar(1);
    }
    r.settleT = this._clock;
    this._setState('settled');
  }

  _highlight(r) {
    const n = r.values.length;
    r.results = r.values.map((v) => classify(r.kind, v, r.triggers));
    const tags = []; const tagPos = [];
    const vw = window.innerWidth;
    let minX = 1e9; let maxX = -1e9; let maxY = -1e9; let minY = 1e9;
    for (let i = 0; i < n; i++) {
      const d = this.dice[i]; const res = r.results[i]; const R = RESULT[res];
      d.ring.position.set(d.mesh.position.x, 0.02, d.mesh.position.z);
      d.ring.material.color.set(R.color);
      d.ring.visible = res !== 'dim';
      d.res = res;
      const top = d.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)).applyMatrix4(this.root.matrixWorld).project(this.camera);
      const sx = (top.x + 1) / 2 * vw; const sy = (1 - top.y) / 2 * window.innerHeight;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy);
      const bot = d.mesh.position.clone().add(new THREE.Vector3(0, 0, 0.6)).applyMatrix4(this.root.matrixWorld).project(this.camera);
      maxY = Math.max(maxY, (1 - bot.y) / 2 * window.innerHeight);
      if (R.label) tagPos.push({ sx, sy: sy - this.diePx * 0.42, res, label: R.label, i, w: R.label.length * 9 + 18 });
      if (res === 'crit' || res === 'trigger') emitCritBurst(this.fx, d.mesh.position, R.color);
    }
    // per-die tags, unless they would overlap (many small dice): then one summary row instead
    const overlap = tagPos.some((a, i) => tagPos.some((b, j) => j > i && Math.abs(a.sx - b.sx) < (a.w + b.w) / 2 + 2 && Math.abs(a.sy - b.sy) < 22));
    if (!overlap) {
      for (const t of tagPos) tags.push(`<div class="dice-tag r-${t.res}" style="left:${t.sx.toFixed(1)}px;top:${t.sy.toFixed(1)}px;animation-delay:${t.i * 40}ms">${t.label}</div>`);
    } else {
      const order = ['crit', 'trigger', 'hit', 'miss', 'cmiss'];
      const counts = {}; tagPos.forEach((t) => { counts[t.res] = (counts[t.res] || 0) + 1; });
      const parts = order.filter((k) => counts[k]).map((k) => `<span class="dice-tag r-${k}">${counts[k] > 1 ? `${counts[k]}× ` : ''}${RESULT[k].label}</span>`);
      const y = Math.min(window.innerHeight - 60 - this.safeB, maxY + 10);
      tags.push(`<div class="dice-summary" style="left:${clamp((minX + maxX) / 2, 120, vw - 120).toFixed(1)}px;top:${y.toFixed(1)}px">${parts.join('')}</div>`);
      maxY = y + 30;
    }
    if (r.kind === 'move' || r.kind === 'pvp') {
      const sum = r.values.reduce((a, b) => a + b, 0);
      const y = Math.min(window.innerHeight - 70 - this.safeB, maxY + 14);
      tags.push(`<div class="dice-sum" style="left:${clamp((minX + maxX) / 2, 70, vw - 70).toFixed(1)}px;top:${y.toFixed(1)}px"><small>${r.kind === 'move' ? 'MOVE' : 'TOTAL'}</small>${sum}</div>`);
    }
    this.layer.innerHTML = tags.join('');
    this.el.classList.toggle('human', r.human);
  }

  _updateSettled(r, dt, now) {
    const t = now - (r.settleT || now);
    const e = 1 - Math.exp(-t * 9);
    for (let i = 0; i < r.values.length; i++) {
      const d = this.dice[i]; const res = d.res;
      if (!res) continue;
      d.ring.material.opacity = (res === 'neutral' ? 0.45 : 0.85) * e * (0.85 + 0.15 * Math.sin(now * 6 + i));
      d.ring.scale.setScalar(0.7 + 0.3 * e);
      const pop = t < 0.25 ? 1 + 0.12 * Math.sin((t / 0.25) * Math.PI) : 1;
      d.mesh.scale.setScalar(pop);
      for (const m of d.mats) {
        if (res === 'dim') {
          m.color.copy(m.userData.baseColor).lerp(new THREE.Color('#5a5566'), 0.55 * e).multiplyScalar(1 - 0.35 * e);
        } else if (!m.emissiveMap && (res === 'crit' || res === 'trigger' || res === 'cmiss')) {
          m.emissive.set(RESULT[res].color);
          m.emissiveIntensity = (res === 'cmiss' ? 0.1 : 0.13) * e * (0.6 + 0.4 * Math.sin(now * 7));
        }
      }
      if (d.halo.visible) d.halo.material.opacity = res === 'dim' ? 0.1 : 0.55;
    }
  }
}

export default DiceTray;
