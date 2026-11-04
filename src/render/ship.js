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

function hullGeometry(L, B, hull, stripe, deck) {
  // Lofted from stations along Z: [z fraction, half beam fraction, keel, deck]
  const st = [
    [-0.5, 0.74, 0.1, 1.05],
    [-0.38, 0.95, -0.15, 1],
    [-0.1, 1, -0.3, 0.98],
    [0.18, 0.95, -0.28, 1.04],
    [0.34, 0.68, -0.1, 1.28],
    [0.44, 0.34, 0.1, 1.56],
    [0.52, 0.02, 0.5, 1.84],
  ];
  const k = L / 8;
  const stations = st.map(([z, w, kl, d]) => [z * L, (w * B) / 2, kl * k, d * k]);
  const parts = { side: [], band: [], top: [] };
  const q = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < stations.length - 1; i++) {
    const [z0, w0, k0, d0] = stations[i];
    const [z1, w1, k1, d1] = stations[i + 1];
    const b0 = d0 - 0.26 * k;
    const b1 = d1 - 0.26 * k;
    q(parts.side, [w0, k0, z0], [w0, b0, z0], [w1, b1, z1], [w1, k1, z1]);
    q(parts.side, [-w0, k0, z0], [-w1, k1, z1], [-w1, b1, z1], [-w0, b0, z0]);
    q(parts.band, [w0, b0, z0], [w0, d0, z0], [w1, d1, z1], [w1, b1, z1]);
    q(parts.band, [-w0, b0, z0], [-w1, b1, z1], [-w1, d1, z1], [-w0, d0, z0]);
    q(parts.top, [-w0, d0 - 0.05, z0], [-w1, d1 - 0.05, z1], [w1, d1 - 0.05, z1], [w0, d0 - 0.05, z0]);
  }
  const [z0, w0, k0, d0] = stations[0];
  q(parts.side, [-w0, k0, z0], [-w0, d0 - 0.26 * k, z0], [w0, d0 - 0.26 * k, z0], [w0, k0, z0]);
  q(parts.band, [-w0, d0 - 0.26 * k, z0], [-w0, d0, z0], [w0, d0, z0], [w0, d0 - 0.26 * k, z0]);
  const mk = (pos, col) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return paint(g, col);
  };
  return [mk(parts.side, hull), mk(parts.band, stripe), mk(parts.top, deck)];
}

// Static body of a hull: everything that does not animate. Also used for portraits.
export function buildShipGeometry(model) {
  const { length: L, beam: B, hull, stripe, tiers, house, roof, crane: craneCol, mast } = model;
  const k = L / 8;
  const parts = hullGeometry(L, B, hull, stripe, '#8e8574');
  const deckY = 0.98 * k;

  // Rails along the working deck, and a bow rail.
  const rail = '#e9ecec';
  for (let i = 0; i < 4; i++) {
    const z = -0.42 * L + (i * 0.5 * L) / 3;
    for (const sx of [-1, 1]) parts.push(place(box(0.05, 0.42 * k, 0.05, rail), (sx * B) / 2 - sx * 0.05, deckY + 0.24 * k, z));
  }
  for (const sx of [-1, 1]) parts.push(place(box(0.05, 0.05, 0.5 * L, rail), (sx * B) / 2 - sx * 0.05, deckY + 0.44 * k, -0.17 * L));

  // Wheelhouse, forward of midships as on the reference boat.
  const hw = B * 0.62;
  const hd = 0.25 * L;
  const hz = 0.1 * L;
  let y = deckY;
  const tierH = 0.82 * k;
  for (let t = 0; t < tiers; t++) {
    const shrink = 1 - t * 0.14;
    const w = hw * shrink;
    const d = hd * shrink;
    const z = hz + t * 0.02 * L;
    parts.push(place(box(w, tierH, d, house), 0, y + tierH / 2, z));
    const top = t === tiers - 1;
    const winH = 0.28 * k;
    // Band of windows, darker around the bridge at the top.
    if (top) {
      parts.push(place(box(w + 0.02, winH, d * 0.72, '#2d4356'), 0, y + tierH * 0.62, z));
      parts.push(place(box(w * 0.82, winH, d + 0.02, '#2d4356'), 0, y + tierH * 0.62, z));
      parts.push(place(box(w + 0.3 * k, 0.09 * k, d + 0.3 * k, roof), 0, y + tierH + 0.04, z));
    } else {
      const n = Math.max(2, Math.round(d / (0.55 * k)));
      for (let i = 0; i < n; i++) {
        const wz = z - d / 2 + (d * (i + 0.5)) / n;
        parts.push(place(box(w + 0.02, 0.2 * k, 0.2 * k, '#2d4356'), 0, y + tierH * 0.58, wz));
      }
      parts.push(place(box(w + 0.16, 0.05 * k, d + 0.16, shade(house, 0.8)), 0, y + tierH + 0.02, z));
    }
    y += tierH;
  }
  const roofY = y;
  // Stack and vents.
  parts.push(place(cyl(0.11 * k, 0.15 * k, 0.5 * k, 8, '#26343c'), B * 0.13, deckY + tierH + 0.2 * k, hz - hd * 0.62));
  parts.push(place(cyl(0.16 * k, 0.16 * k, 0.1 * k, 8, hull), B * 0.13, deckY + tierH + 0.44 * k, hz - hd * 0.62));
  // Life ring on the house side.
  const ring = paint(new THREE.TorusGeometry(0.13 * k, 0.04 * k, 4, 10), '#e3662e');
  parts.push(place(ring, hw / 2 + 0.02, deckY + tierH * 0.45, hz - hd * 0.3, Math.PI / 2));

  // Masts.
  const mastX = 0;
  const mastZ = hz;
  const mh = 1.5 * k;
  parts.push(place(cyl(0.035 * k, 0.05 * k, mh, 6, '#e9ecec'), mastX, roofY + mh / 2, mastZ));
  parts.push(place(box(0.7 * k, 0.03 * k, 0.03 * k, '#e9ecec'), mastX, roofY + mh * 0.68, mastZ));
  parts.push(place(cone(0.05 * k, 0.1 * k, 5, '#d7a436'), mastX, roofY + mh + 0.06, mastZ));
  if (mast > 1) {
    parts.push(place(cyl(0.03 * k, 0.05 * k, mh * 1.1, 6, '#e9ecec'), 0, deckY + mh * 0.55, -0.26 * L));
    parts.push(place(box(0.03 * k, 0.03 * k, 0.5 * L, '#3c4a52'), 0, roofY + mh * 0.3, -0.08 * L, 0, 1, 1, 1, 0.14));
  }

  // Hauling crane on the working deck.
  const craneZ = -0.08 * L;
  parts.push(place(cyl(0.08 * k, 0.11 * k, 1 * k, 7, craneCol), B * 0.32, deckY + 0.5 * k, craneZ));
  parts.push(place(box(0.09 * k, 0.09 * k, 1.1 * k, craneCol), B * 0.14, deckY + 1 * k, craneZ - 0.05 * L, -0.5, 1, 1, 1, -0.34));
  parts.push(place(box(0.02, 0.5 * k, 0.02, '#26292c'), B * 0.0 - 0.1, deckY + 0.84 * k, craneZ - 0.11 * L));
  parts.push(place(cyl(0.16 * k, 0.16 * k, 0.34 * k, 8, '#3f5c66'), -B * 0.3, deckY + 0.14 * k, craneZ, 0, 1, 1, 1, Math.PI / 2));

  // Bow rails and a small anchor winch.
  const bz = 0.33 * L;
  const by = 1.3 * k;
  for (const sx of [-1, 1]) {
    parts.push(place(box(0.04, 0.3 * k, 0.05, rail), sx * B * 0.24, by + 0.28 * k, bz + 0.05 * L));
    parts.push(place(box(0.04, 0.05, 0.2 * L, rail), sx * B * 0.17, by + 0.42 * k, bz + 0.07 * L, sx * -0.28));
  }
  parts.push(place(box(0.34 * k, 0.2 * k, 0.28 * k, '#3f5c66'), 0, by + 0.1 * k, bz));
  return merged(parts);
}

export function makeBoatMaterial() {
  return stylize(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function deckSlots(m, count) {
  const k = m.length / 8;
  const slots = [];
  const deckY = 0.98 * k;
  const rows = Math.ceil(count / 4);
  const size = 0.52;
  for (let layer = 0; layer < 3; layer++) {
    for (let r = 0; r < rows + 1; r++) {
      for (const col of [-0.5, 0.5]) {
        slots.push([col * size * 1.15, deckY + 0.2 + layer * 0.42, -0.42 * m.length + 0.32 + r * size * 1.2]);
      }
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
  const cageGeo = merged([
    box(0.5, 0.36, 0.5, '#3d4c54'),
    place(box(0.54, 0.05, 0.54, '#c0a678'), 0, 0.18, 0),
    place(box(0.54, 0.05, 0.54, '#c0a678'), 0, -0.18, 0),
  ]);
  const cages = new THREE.InstancedMesh(cageGeo, makeBoatMaterial(), 24);
  cages.count = 0;
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
  tilt.add(body);

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
  u.deckhand.position.set(-model.beam * 0.24, deckY, -0.16 * model.length);
  u.skipper.position.set(model.beam * 0.08, roofY - tierH * 0.8, 0.14 * model.length);
  u.skipper.visible = false;
  u.captain.position.set(0, roofY + 0.04, 0.1 * model.length - 0.6);
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
  tilt.position.y = u.rideY;
  tilt.rotation.z = u.rideRoll * 0.8 - ship.rudder * Math.min(1, Math.abs(ship.speed) / 6) * 0.05;
  tilt.rotation.x = -u.ridePitch - Math.min(0.03, Math.max(0, ship.speed) * 0.005);

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
