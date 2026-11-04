// The fleet. One builder covers every hull, driven by the model data in config.js:
// painted hull with a pale boot stripe, white wheelhouse forward, working deck aft.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { box, cone, cyl, merged, paint, place } from './kit.js';
import { stylize } from './mist.js';
import { waveHeight, waveState } from './water.js';

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.r *= k;
  c.g *= k;
  c.b *= k;
  return `#${c.getHexString()}`;
};

// Hull lines, from stern to stem: [z fraction, half beam fraction, keel, sheer].
const HULL = [
  [-0.5, 0.78, 0.14, 1.08],
  [-0.46, 0.88, 0.0, 1.05],
  [-0.36, 0.97, -0.16, 1.0],
  [-0.16, 1, -0.3, 0.98],
  [0.08, 0.99, -0.3, 1.0],
  [0.22, 0.91, -0.26, 1.08],
  [0.33, 0.73, -0.14, 1.26],
  [0.42, 0.47, 0.02, 1.48],
  [0.49, 0.2, 0.26, 1.7],
  [0.53, 0.02, 0.56, 1.88],
];
const DECK_DROP = 0.2; // how far the deck sits below the top of the bulwark

function hullAt(zf, col) {
  for (let i = 0; i < HULL.length - 1; i++) {
    const a = HULL[i];
    const b = HULL[i + 1];
    if (zf > b[0]) continue;
    const t = Math.max(0, (zf - a[0]) / (b[0] - a[0]));
    return a[col] + (b[col] - a[col]) * t;
  }
  return HULL[HULL.length - 1][col];
}

function hullGeometry(L, B, hull, stripe, deck) {
  const k = L / 8;
  const stations = HULL.map(([z, w, kl, d]) => [z * L, (w * B) / 2, kl * k, d * k]);
  const parts = { foul: [], side: [], rub: [], band: [], top: [], inner: [], floor: [] };
  const q = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
  // Heights on the side of the hull, between keel and sheer.
  const water = 0.16 * k;
  const bandH = 0.2 * k;
  const rubH = 0.05 * k;
  const skin = (arr, flip, w0, a0, b0, z0, w1, a1, b1, z1) => {
    if (flip) q(arr, [-w0, a0, z0], [-w1, a1, z1], [-w1, b1, z1], [-w0, b0, z0]);
    else q(arr, [w0, a0, z0], [w0, b0, z0], [w1, b1, z1], [w1, a1, z1]);
  };
  for (let i = 0; i < stations.length - 1; i++) {
    const [z0, w0, k0, d0] = stations[i];
    const [z1, w1, k1, d1] = stations[i + 1];
    const f0 = Math.max(k0, water);
    const f1 = Math.max(k1, water);
    for (const flip of [false, true]) {
      skin(parts.foul, flip, w0, k0, f0, z0, w1, k1, f1, z1);
      skin(parts.side, flip, w0, f0, d0 - bandH - rubH, z0, w1, f1, d1 - bandH - rubH, z1);
      skin(parts.rub, flip, w0 * 1.015, d0 - bandH - rubH, d0 - bandH, z0, w1 * 1.015, d1 - bandH - rubH, d1 - bandH, z1);
      skin(parts.band, flip, w0, d0 - bandH, d0, z0, w1, d1 - bandH, d1, z1);
      // Inside face of the bulwark, seen from above.
      skin(parts.inner, flip, w0 * 0.93, d0 - DECK_DROP * k, d0, z0, w1 * 0.93, d1 - DECK_DROP * k, d1, z1);
    }
    // Capping the bulwark between its inner and outer faces.
    for (const s of [-1, 1]) {
      q(parts.band, [s * w0 * 0.93, d0, z0], [s * w0, d0, z0], [s * w1, d1, z1], [s * w1 * 0.93, d1, z1]);
    }
    // Deck plate.
    q(parts.top, [-w0 * 0.93, d0 - DECK_DROP * k, z0], [-w1 * 0.93, d1 - DECK_DROP * k, z1], [w1 * 0.93, d1 - DECK_DROP * k, z1], [w0 * 0.93, d0 - DECK_DROP * k, z0]);
    // The hull is solid: a keel plate underneath, and a floor at the waterline so a
    // reflection, which sees her from below, never looks up inside her.
    q(parts.floor, [-w0, k0, z0], [w0, k0, z0], [w1, k1, z1], [-w1, k1, z1]);
    const y0 = Math.max(k0, 0.04);
    const y1 = Math.max(k1, 0.04);
    q(parts.floor, [-w0, y0, z0], [w0, y0, z0], [w1, y1, z1], [-w1, y1, z1]);
  }
  const [z0, w0, k0, d0] = stations[0];
  q(parts.foul, [-w0, k0, z0], [-w0, water, z0], [w0, water, z0], [w0, k0, z0]);
  q(parts.side, [-w0, water, z0], [-w0, d0 - bandH, z0], [w0, d0 - bandH, z0], [w0, water, z0]);
  q(parts.band, [-w0, d0 - bandH, z0], [-w0, d0, z0], [w0, d0, z0], [w0, d0 - bandH, z0]);
  const mk = (pos, col) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return paint(g, col);
  };
  return [
    mk(parts.foul, '#3a2a2c'),
    mk(parts.floor, shade(hull, 0.42)),
    mk(parts.side, hull),
    mk(parts.rub, shade(hull, 0.55)),
    mk(parts.band, stripe),
    mk(parts.inner, shade(stripe, 0.82)),
    mk(parts.top, deck),
  ];
}

// A straight member between two points, for jibs, stays and wires.
const UP = new THREE.Vector3(0, 1, 0);
function beam(a, b, w, color) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const g = box(w, len, w, color);
  const qt = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), qt, new THREE.Vector3(1, 1, 1)));
  return g;
}

// Static body of a hull: everything that does not animate. Also used for portraits.
// Every fitting is placed from the hull lines, so it stands on what is under it.
export function buildShipGeometry(model) {
  const { length: L, beam: B, hull, stripe, tiers, house, roof, crane: craneCol, mast } = model;
  const k = L / 8;
  const parts = hullGeometry(L, B, hull, stripe, '#8f8672');
  const deckAt = (z) => (hullAt(z / L, 3) - DECK_DROP) * k; // deck surface at a position along her
  const sheerAt = (z) => hullAt(z / L, 3) * k; // top of the bulwark
  const halfAt = (z) => (hullAt(z / L, 1) * B) / 2;
  const steel = '#3c4a52';
  const rail = '#e9ecec';
  const glass = '#27404f';

  const hd = 0.25 * L;
  const hz = 0.1 * L;
  const aft = hz - hd / 2;
  const hw = B * 0.62;
  const stern = -0.46 * L;
  const workEnd = aft - 0.04 * L;

  // Deck planking runs from the stern to the house, lying on the deck.
  for (let i = -2; i <= 2; i++) {
    const x = (i * B) / 7;
    parts.push(beam([x, deckAt(stern) + 0.012, stern], [x, deckAt(workEnd) + 0.012, workEnd], 0.024, '#6d6657'));
  }
  // Hatch over the crab tank, to port, clear of the cages.
  const hatchZ = -0.3 * L;
  const hatchX = -B * 0.27;
  parts.push(place(box(B * 0.24, 0.14 * k, 0.16 * L, '#49626b'), hatchX, deckAt(hatchZ) + 0.05 * k, hatchZ));
  parts.push(place(box(B * 0.19, 0.03 * k, 0.13 * L, '#5f7c85'), hatchX, deckAt(hatchZ) + 0.13 * k, hatchZ));

  // Rails follow the bulwark, posts standing on it.
  const railUp = 0.38 * k;
  let prev = null;
  for (let i = 0; i <= 5; i++) {
    const z = stern + (i * (workEnd - stern)) / 5;
    const x = halfAt(z) * 0.965;
    const y = sheerAt(z);
    for (const s of [-1, 1]) {
      parts.push(beam([s * x, y - 0.02, z], [s * x, y + railUp, z], 0.04, rail));
      if (prev) parts.push(beam([s * prev.x, prev.y + railUp, prev.z], [s * x, y + railUp, z], 0.04, rail));
    }
    prev = { x, y, z };
  }
  {
    const x = halfAt(stern) * 0.965;
    const y = sheerAt(stern) + railUp;
    parts.push(beam([-x, y, stern], [x, y, stern], 0.04, rail));
  }

  // Wheelhouse, forward of midships. Its first level stands right on the deck.
  const workY = 0.98 * k;
  const tierH = 0.82 * k;
  let y = workY;
  const footing = deckAt(hz) - 0.06 * k;
  for (let t = 0; t < tiers; t++) {
    const shrink = 1 - t * 0.14;
    const w = hw * shrink;
    const d = hd * shrink;
    const z = hz + t * 0.02 * L;
    const base = t === 0 ? footing : y;
    const height = y + tierH - base;
    parts.push(place(box(w, height, d, house), 0, base + height / 2, z));
    parts.push(place(box(w + 0.05, 0.05 * k, d + 0.05, shade(house, 0.78)), 0, y + 0.03 * k, z));
    if (t === tiers - 1) {
      // Bridge: a wraparound band of panes split by white mullions.
      const winH = 0.32 * k;
      const winY = y + tierH * 0.64;
      parts.push(place(box(w + 0.02, winH, d * 0.8, glass), 0, winY, z));
      parts.push(place(box(w * 0.84, winH, d + 0.02, glass), 0, winY, z));
      const panes = 4;
      for (let i = 1; i < panes; i++) {
        const px = -w * 0.42 + (w * 0.84 * i) / panes;
        parts.push(place(box(0.03, winH, 0.04, house), px, winY, z + d / 2 + 0.01));
      }
      for (let i = 1; i < 3; i++) {
        const pz = z - d * 0.4 + (d * 0.8 * i) / 3;
        for (const sx of [-1, 1]) parts.push(place(box(0.04, winH, 0.03, house), (sx * w) / 2 + sx * 0.01, winY, pz));
      }
      parts.push(place(box(w + 0.3 * k, 0.09 * k, d + 0.34 * k, roof), 0, y + tierH + 0.04, z + 0.03 * k));
      parts.push(place(box(w + 0.34 * k, 0.03 * k, d + 0.38 * k, shade(roof, 1.35)), 0, y + tierH + 0.1 * k, z + 0.03 * k));
    } else {
      const n = Math.max(2, Math.round(d / (0.5 * k)));
      for (let i = 0; i < n; i++) {
        const wz = z - d / 2 + (d * (i + 0.5)) / n;
        for (const sx of [-1, 1]) {
          parts.push(place(cyl(0.11 * k, 0.11 * k, 0.03, 8, shade(house, 0.7)), (sx * w) / 2 + sx * 0.012, y + tierH * 0.58, wz, 0, 1, 1, 1, 0, Math.PI / 2));
          parts.push(place(cyl(0.08 * k, 0.08 * k, 0.04, 8, glass), (sx * w) / 2 + sx * 0.02, y + tierH * 0.58, wz, 0, 1, 1, 1, 0, Math.PI / 2));
        }
      }
      parts.push(place(box(w + 0.16, 0.05 * k, d + 0.16, shade(house, 0.8)), 0, y + tierH + 0.02, z));
    }
    y += tierH;
  }
  const roofY = y;

  // Door and ladder on the after face of the house, both reaching the deck.
  const aftDeck = deckAt(aft);
  parts.push(place(box(0.34 * k, 0.72 * k, 0.03, '#61757f'), -B * 0.14, aftDeck + 0.36 * k, aft - 0.012));
  const ladderX = B * 0.18;
  const ladderW = 0.24 * k;
  const ladderTop = roofY + 0.1 * k;
  for (const lx of [ladderX, ladderX + ladderW]) parts.push(beam([lx, aftDeck, aft - 0.05], [lx, ladderTop, aft - 0.05], 0.035, rail));
  for (let ry = aftDeck + 0.14 * k; ry < ladderTop; ry += 0.17 * k) parts.push(place(box(ladderW, 0.022, 0.022, rail), ladderX + ladderW / 2, ry, aft - 0.05));

  // Roof fittings all stand on the roof plate.
  const topW = hw * (1 - (tiers - 1) * 0.14);
  const topD = hd * (1 - (tiers - 1) * 0.14);
  const topZ = hz + (tiers - 1) * 0.02 * L;
  const rw = topW * 0.46;
  const rd = topD * 0.46;
  const roofTop = roofY + 0.11 * k;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(beam([sx * rw, roofTop, topZ + sz * rd], [sx * rw, roofTop + 0.2 * k, topZ + sz * rd], 0.03, rail));
  parts.push(beam([-rw, roofTop + 0.2 * k, topZ - rd], [rw, roofTop + 0.2 * k, topZ - rd], 0.03, rail));
  for (const s of [-1, 1]) parts.push(beam([s * rw, roofTop + 0.2 * k, topZ - rd], [s * rw, roofTop + 0.2 * k, topZ + rd], 0.03, rail));
  parts.push(place(cyl(0.03 * k, 0.04 * k, 0.1 * k, 6, '#3c4a52'), rw * 0.6, roofTop + 0.05 * k, topZ + rd * 0.75));
  parts.push(place(cyl(0.07 * k, 0.07 * k, 0.1 * k, 8, '#f2e7b8'), rw * 0.6, roofTop + 0.14 * k, topZ + rd * 0.8, 0, 1, 1, 1, Math.PI / 2));
  parts.push(place(cyl(0.012, 0.02, 0.9 * k, 4, '#30383e'), -rw * 0.8, roofTop + 0.45 * k, topZ - rd * 0.6));
  parts.push(place(cyl(0.012, 0.02, 0.7 * k, 4, '#30383e'), rw * 0.8, roofTop + 0.35 * k, topZ - rd * 0.6));
  // Running lights on the bridge wings: red to port, green to starboard.
  parts.push(place(box(0.05, 0.08 * k, 0.12 * k, '#d6342d'), topW / 2 + 0.03, roofY - 0.1 * k, topZ + topD * 0.32));
  parts.push(place(box(0.05, 0.08 * k, 0.12 * k, '#2fa866'), -topW / 2 - 0.03, roofY - 0.1 * k, topZ + topD * 0.32));

  // Stack: rises from the deck against the after face, and clears the roof.
  const stackX = B * 0.2;
  const stackZ = aft - 0.14 * k;
  const stackBase = deckAt(stackZ);
  const stackTop = workY + tierH + 0.62 * k;
  parts.push(place(cyl(0.12 * k, 0.14 * k, stackTop - stackBase, 8, '#26343c'), stackX, (stackBase + stackTop) / 2, stackZ));
  parts.push(place(cyl(0.125 * k, 0.125 * k, 0.15 * k, 8, hull), stackX, stackTop - 0.18 * k, stackZ));
  parts.push(place(cyl(0.135 * k, 0.135 * k, 0.03 * k, 8, '#1b2429'), stackX, stackTop, stackZ));
  // Life rings on the house sides, and a raft canister on a cradle beside the door.
  const ring = () => paint(new THREE.TorusGeometry(0.13 * k, 0.04 * k, 4, 10), '#e3662e');
  parts.push(place(ring(), hw / 2 + 0.03, workY + tierH * 0.45, hz - hd * 0.3, Math.PI / 2));
  parts.push(place(ring(), -hw / 2 - 0.03, workY + tierH * 0.45, hz - hd * 0.3, Math.PI / 2));
  const raftZ = aft - 0.42 * k;
  parts.push(place(box(0.34 * k, 0.06 * k, 0.22 * k, steel), -B * 0.34, deckAt(raftZ) + 0.03 * k, raftZ));
  parts.push(place(cyl(0.12 * k, 0.12 * k, 0.42 * k, 8, '#eef1f1'), -B * 0.34, deckAt(raftZ) + 0.18 * k, raftZ, 0, 1, 1, 1, 0, Math.PI / 2));

  // Masts. The main stands on the roof; a second, if she has one, on the deck, stayed to the first.
  const mastZ = hz;
  const mh = 1.5 * k;
  const mainTop = roofY + mh;
  parts.push(place(cyl(0.035 * k, 0.05 * k, mh, 6, '#e9ecec'), 0, roofY + mh / 2, mastZ));
  parts.push(place(box(0.7 * k, 0.03 * k, 0.03 * k, '#e9ecec'), 0, roofY + mh * 0.68, mastZ));
  parts.push(place(box(0.06 * k, 0.06 * k, 0.06 * k, '#f2e7b8'), 0, roofY + mh * 0.68 + 0.045 * k, mastZ));
  parts.push(place(cone(0.05 * k, 0.1 * k, 5, '#d7a436'), 0, mainTop + 0.05 * k, mastZ));
  if (mast > 1) {
    const z2 = -0.34 * L;
    const base = deckAt(z2);
    const top2 = base + mh * 1.25;
    parts.push(place(cyl(0.03 * k, 0.05 * k, top2 - base, 6, '#e9ecec'), B * 0.28, (base + top2) / 2, z2));
    parts.push(beam([B * 0.28, top2 - 0.04, z2], [0, roofY + mh * 0.6, mastZ], 0.018, steel));
  }

  // Hauling crane: post from the deck, a jib out over the side, a wire and block.
  const craneZ = -0.1 * L;
  const postX = B * 0.3;
  const postBase = deckAt(craneZ);
  const postTop = postBase + 1.15 * k;
  parts.push(place(cyl(0.08 * k, 0.11 * k, postTop - postBase, 7, craneCol), postX, (postBase + postTop) / 2, craneZ));
  parts.push(place(box(0.2 * k, 0.12 * k, 0.2 * k, shade(craneCol, 0.8)), postX, postBase + 0.08 * k, craneZ));
  parts.push(place(box(0.17 * k, 0.11 * k, 0.17 * k, shade(craneCol, 0.8)), postX, postTop, craneZ));
  const tip = [postX + 0.95 * k * 0.34, postTop + 0.34 * k, craneZ - 0.65 * k];
  parts.push(beam([postX, postTop, craneZ], tip, 0.09 * k, craneCol));
  const blockY = deckAt(tip[2]) + 0.5 * k;
  parts.push(beam(tip, [tip[0], blockY, tip[2]], 0.018, '#26292c'));
  parts.push(place(box(0.09 * k, 0.12 * k, 0.09 * k, '#d7a436'), tip[0], blockY, tip[2]));
  // Winch standing on the deck, by the crane.
  const winchZ = craneZ + 0.5 * k;
  parts.push(place(box(0.34 * k, 0.08 * k, 0.3 * k, steel), postX - 0.05 * k, deckAt(winchZ) + 0.04 * k, winchZ));
  parts.push(place(cyl(0.13 * k, 0.13 * k, 0.3 * k, 8, '#3f5c66'), postX - 0.05 * k, deckAt(winchZ) + 0.2 * k, winchZ, 0, 1, 1, 1, 0, Math.PI / 2));
  // Rope coiled on the deck, and spare buoys lashed along the stern rail.
  const coilZ = -0.42 * L;
  parts.push(place(paint(new THREE.TorusGeometry(0.15 * k, 0.05 * k, 4, 10), '#d98b3a'), -B * 0.2, deckAt(coilZ) + 0.05 * k, coilZ, 0, 1, 1, 1, Math.PI / 2));
  {
    const y0 = sheerAt(stern) + railUp;
    for (let i = -1; i <= 1; i++) parts.push(place(paint(new THREE.IcosahedronGeometry(0.1 * k, 0), '#e3662e'), (i * B) / 4.6, y0 - 0.1 * k, stern - 0.015));
  }

  // Foredeck: rails converging on the stem, an anchor winch and a hawse each side.
  const fore0 = hz + hd / 2 + 0.03 * L;
  const fore1 = 0.46 * L;
  let fPrev = null;
  for (let i = 0; i <= 4; i++) {
    const z = fore0 + (i * (fore1 - fore0)) / 4;
    const x = halfAt(z) * 0.93;
    const yb = sheerAt(z);
    for (const s of [-1, 1]) {
      parts.push(beam([s * x, yb - 0.02, z], [s * x, yb + 0.3 * k, z], 0.04, rail));
      if (fPrev) parts.push(beam([s * fPrev.x, fPrev.y + 0.3 * k, fPrev.z], [s * x, yb + 0.3 * k, z], 0.04, rail));
    }
    fPrev = { x, y: yb, z };
  }
  const anchorZ = 0.3 * L;
  const anchorY = deckAt(anchorZ);
  parts.push(place(box(0.34 * k, 0.16 * k, 0.28 * k, '#3f5c66'), 0, anchorY + 0.08 * k, anchorZ));
  parts.push(place(cyl(0.05 * k, 0.05 * k, 0.5 * k, 6, '#2c383e'), 0, anchorY + 0.18 * k, anchorZ, 0, 1, 1, 1, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    const hz2 = 0.38 * L;
    parts.push(place(cyl(0.05 * k, 0.05 * k, 0.03, 8, '#26292c'), s * (halfAt(hz2) + 0.005), sheerAt(hz2) - 0.34 * k, hz2, 0, 1, 1, 1, 0, Math.PI / 2));
  }
  return merged(parts);
}

export function makeBoatMaterial() {
  return stylize(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

// Where cages stack: two columns on the working deck, from the stern to the house,
// higher only once the deck is full.
function deckSlots(m, count) {
  const L = m.length;
  const k = L / 8;
  const slots = [];
  const start = -0.43 * L + 0.34;
  const end = 0.1 * L - 0.125 * L - 0.04 * L - 0.34;
  const pitch = 0.6;
  const rows = Math.max(2, Math.floor((end - start) / pitch) + 1);
  for (let layer = 0; layer < 6 && slots.length < count; layer++) {
    for (let r = 0; r < rows; r++) {
      const z = start + r * pitch;
      const deck = (hullAt(z / L, 3) - DECK_DROP) * k;
      for (const col of [-0.3, 0.3]) slots.push([col, deck + 0.21 + layer * 0.42, z]);
    }
  }
  return slots;
}

export function buildShip(classId = 'auk') {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const mat = makeBoatMaterial();

  // Stacked cages on deck: their count shows at a glance how many are aboard.
  const edge = '#c9b17f';
  const cageGeo = merged([
    box(0.46, 0.32, 0.46, '#34434b'),
    place(box(0.5, 0.04, 0.5, edge), 0, 0.18, 0),
    place(box(0.5, 0.04, 0.5, edge), 0, -0.18, 0),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => place(box(0.04, 0.36, 0.04, edge), x * 0.24, 0, z * 0.24)),
    place(box(0.5, 0.02, 0.02, '#5f7681'), 0, 0.06, 0.235),
    place(box(0.5, 0.02, 0.02, '#5f7681'), 0, -0.06, 0.235),
    place(box(0.02, 0.32, 0.02, '#5f7681'), 0, 0, 0.235),
    place(box(0.02, 0.02, 0.5, '#5f7681'), 0.235, 0.06, 0),
    place(box(0.02, 0.02, 0.5, '#5f7681'), 0.235, -0.06, 0),
  ]);
  const cages = new THREE.InstancedMesh(cageGeo, makeBoatMaterial(), 24);
  cages.count = 0;
  cages.castShadow = true;
  cages.receiveShadow = true;
  tilt.add(cages);

  const figure = (coat) =>
    merged([
      place(cyl(0.13, 0.16, 0.5, 6, coat), 0, 0.25, 0),
      place(cyl(0.09, 0.13, 0.2, 6, '#efd9c2'), 0, 0.6, 0),
      place(cyl(0.06, 0.17, 0.12, 6, coat), 0, 0.72, 0),
    ]);
  const deckhand = new THREE.Mesh(figure('#e3662e'), mat);
  const skipper = new THREE.Mesh(figure('#d7a436'), mat);
  const captain = new THREE.Mesh(figure('#2b6fa8'), mat);
  tilt.add(deckhand, skipper, captain);

  const pennantGeo = new THREE.BufferGeometry();
  pennantGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.2, 0, 0, -0.2, 0, 0, 0.2, -0.36, 0, -0.2, -0.36, 0, 0, -0.84], 3));
  pennantGeo.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  pennantGeo.computeVertexNormals();
  const pennant = new THREE.Mesh(pennantGeo, stylize(new THREE.MeshLambertMaterial({ color: '#d63a33', side: THREE.DoubleSide, emissive: '#4a0d0a' })));
  tilt.add(pennant);

  const radarBar = new THREE.Mesh(box(0.72, 0.05, 0.1, '#f0f2f2'), mat);
  tilt.add(radarBar);

  const body = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  tilt.add(body);
  for (const fig of [deckhand, skipper, captain]) fig.castShadow = true;

  root.userData = { tilt, body, cages, deckhand, captain, skipper, pennant, radarBar, slots: [] };
  setShipClass(root, classId);
  return root;
}

export function setShipClass(root, classId) {
  const u = root.userData;
  if (u.classId === classId) return;
  u.classId = classId;
  const { model } = CFG.ships[classId];
  const old = u.body.geometry;
  u.body.geometry = buildShipGeometry(model);
  old.dispose();
  u.length = model.length;
  u.beam = model.beam;
  const k = model.length / 8;
  const deckY = 0.98 * k;
  const tierH = 0.82 * k;
  const roofY = deckY + tierH * model.tiers;
  u.pennant.position.set(0, roofY + 1.5 * k - 0.1, 0.1 * model.length);
  u.radarBar.position.set(0, roofY + 1.5 * k * 0.5, 0.1 * model.length);
  const L = model.length;
  const crewDeck = (z) => (hullAt(z / L, 3) - DECK_DROP) * k;
  u.deckhand.position.set(-model.beam * 0.28, crewDeck(-0.14 * L), -0.14 * L);
  u.skipper.position.set(model.beam * 0.08, roofY - tierH * 0.8, 0.14 * model.length);
  u.skipper.visible = false;
  const doorZ = 0.1 * L - 0.125 * L - 0.28 * k;
  u.captain.position.set(-model.beam * 0.14, crewDeck(doorZ), doorZ);
  u.stack = { x: model.beam * 0.2, y: deckY + tierH + 0.62 * k, z: 0.1 * L - 0.125 * L - 0.14 * k };
  const slots = deckSlots(model, 24);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    const [x, y, z] = slots[i] ?? [0, -5, 0];
    m.makeTranslation(x, y, z);
    u.cages.setMatrixAt(i, m);
  }
  u.cages.instanceMatrix.needsUpdate = true;
}

export function updateShip(root, game, time, dt) {
  const { tilt, cages, deckhand, captain, pennant, radarBar } = root.userData;
  const s = game.s;
  const ship = s.ship;
  const a = game.alpha;
  const prev = game.prev;
  setShipClass(root, s.fleet.current);

  const dh = Math.atan2(Math.sin(ship.heading - prev.heading), Math.cos(ship.heading - prev.heading));
  root.position.set(prev.x + (ship.x - prev.x) * a, 0, prev.z + (ship.z - prev.z) * a);
  root.rotation.y = prev.heading + dh * a;

  // Afloat for real: the hull samples the swell at bow, stern and both sides, rising
  // with the water and pitching and rolling with its slope. A long hull averages the
  // waves out, a small one feels them more.
  const u = root.userData;
  const hx = Math.sin(root.rotation.y);
  const hz = Math.cos(root.rotation.y);
  const { world } = game;
  const px = root.position.x;
  const pz = root.position.z;
  const lever = u.length * 0.4;
  const side = u.beam * 0.5;
  const bow = waveHeight(world, px + hx * lever, pz + hz * lever, time);
  const stern = waveHeight(world, px - hx * lever, pz - hz * lever, time);
  const right = waveHeight(world, px + hz * side, pz - hx * side, time);
  const left = waveHeight(world, px - hz * side, pz + hx * side, time);
  const want = (bow + stern + right + left) / 4;
  const follow = 1 - Math.exp(-dt * 3); // the hull's mass smooths the motion
  u.rideY = (u.rideY ?? want) + (want - (u.rideY ?? want)) * follow;
  u.ridePitch = (u.ridePitch ?? 0) + (Math.atan2(bow - stern, lever * 2) - (u.ridePitch ?? 0)) * follow;
  u.rideRoll = (u.rideRoll ?? 0) + (Math.atan2(right - left, side * 2) - (u.rideRoll ?? 0)) * follow;
  tilt.position.y = u.rideY * 1.5;
  tilt.rotation.z = u.rideRoll * 2.2 - ship.rudder * Math.min(1, Math.abs(ship.speed) / 6) * 0.05;
  tilt.rotation.x = -u.ridePitch * 2 - Math.min(0.03, Math.max(0, ship.speed) * 0.005);

  cages.count = Math.min(24, game.cagesAboard);
  deckhand.visible = s.crew.deckhand;
  captain.visible = s.crew.captain;
  pennant.rotation.y = Math.sin(time * 3) * 0.28 + Math.sin(time * 7.3) * 0.08;
  if (s.radarOn) radarBar.rotation.y += dt * 4;
}

// Buoys mark the cages: a saturated float and pennant, plus a soak ring.
export class BuoyField {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map();
    this.mat = makeBoatMaterial();
    this.geo = merged([
      place(cyl(0.32, 0.38, 0.55, 8, '#e3662e'), 0, 0.22, 0),
      place(cyl(0.38, 0.38, 0.12, 8, '#f6f7f4'), 0, 0.34, 0),
      place(cyl(0.035, 0.035, 1.4, 5, '#2f3438'), 0, 1, 0),
    ]);
    this.flagGeo = new THREE.BufferGeometry();
    this.flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.36, 0, 0.6, -0.18, 0], 3));
    this.flagGeo.computeVertexNormals();
    this.ringGeo = new THREE.RingGeometry(0.78, 0.86, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  update(game, time) {
    const s = game.s;
    const seen = new Set();
    for (const c of s.cages) {
      seen.add(c.id);
      let it = this.items.get(c.id);
      if (!it) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(this.geo, this.mat);
        const flagMat = stylize(new THREE.MeshLambertMaterial({ color: '#f2c53d', side: THREE.DoubleSide }));
        const flag = new THREE.Mesh(this.flagGeo, flagMat);
        flag.position.set(0, 1.68, 0);
        const ringMat = new THREE.MeshBasicMaterial({ color: '#fbfcfb', transparent: true, opacity: 0.8, depthWrite: false });
        const ring = new THREE.Mesh(this.ringGeo, ringMat);
        ring.position.y = 0.03;
        group.add(body, flag, ring);
        group.position.set(c.x, 0, c.z);
        this.scene.add(group);
        it = { group, body, flag, flagMat, ring, ringMat, born: time };
        this.items.set(c.id, it);
      }
      const age = s.t - c.t0;
      const ready = age >= CFG.soakPeak;
      const past = age > CFG.soakPeak + 20;
      it.flagMat.color.set(ready ? (past ? '#d63a33' : '#3fb56b') : '#f2c53d');
      // The ring lies on the water; the float itself bobs on the swell.
      it.group.position.y = waveHeight(game.world, c.x, c.z, time, waveState.geo);
      it.body.position.y = waveHeight(game.world, c.x, c.z, time) - it.group.position.y;
      it.flag.position.y = 1.68 + it.body.position.y;
      it.flag.rotation.y = Math.sin(time * 2.6 + c.id) * 0.3 - 1;
      const pulse = ready ? 1.8 + Math.sin(time * 2.6) * 0.5 : 1 + 0.55 * Math.min(1, age / CFG.soakPeak);
      it.ring.scale.setScalar(pulse);
      it.ringMat.opacity = ready ? 0.85 : 0.5;
    }
    for (const [id, it] of this.items) {
      if (!seen.has(id)) {
        this.scene.remove(it.group);
        it.flagMat.dispose();
        it.ringMat.dispose();
        this.items.delete(id);
      }
    }
  }
}
