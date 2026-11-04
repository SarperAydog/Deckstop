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
  const k = L / 8;
  const stations = st.map(([z, w, kl, d]) => [z * L, (w * B) / 2, kl * k, d * k]);
  const parts = { foul: [], side: [], rub: [], band: [], top: [], inner: [] };
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
      skin(parts.inner, flip, w0 * 0.93, d0 - 0.2 * k, d0, z0, w1 * 0.93, d1 - 0.2 * k, d1, z1);
    }
    // Capping rail along the top, then the deck a little below it.
    q(parts.top, [-w0 * 0.93, d0 - 0.2 * k, z0], [-w1 * 0.93, d1 - 0.2 * k, z1], [w1 * 0.93, d1 - 0.2 * k, z1], [w0 * 0.93, d0 - 0.2 * k, z0]);
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
    mk(parts.side, hull),
    mk(parts.rub, shade(hull, 0.55)),
    mk(parts.band, stripe),
    mk(parts.inner, shade(stripe, 0.82)),
    mk(parts.top, deck),
  ];
}

// Static body of a hull: everything that does not animate. Also used for portraits.
export function buildShipGeometry(model) {
  const { length: L, beam: B, hull, stripe, tiers, house, roof, crane: craneCol, mast } = model;
  const k = L / 8;
  const parts = hullGeometry(L, B, hull, stripe, '#8f8672');
  const deckY = 0.78 * k + 0.02; // deck surface, sunk behind the bulwark
  const workY = 0.98 * k;
  const steel = '#3c4a52';
  const rail = '#e9ecec';

  // Deck planking, as fine lines along the working deck.
  for (let i = -2; i <= 2; i++) {
    parts.push(place(box(0.025, 0.012, 0.56 * L, '#6d6657'), (i * B) / 7, deckY + 0.015, -0.17 * L));
  }
  // Hatch over the crab tank, with a raised coaming.
  parts.push(place(box(B * 0.42, 0.12 * k, 0.2 * L, '#49626b'), 0, deckY + 0.06 * k, -0.02 * L));
  parts.push(place(box(B * 0.34, 0.03 * k, 0.16 * L, '#5f7c85'), 0, deckY + 0.13 * k, -0.02 * L));

  // Rails along the working deck and at the stern.
  const railY = workY + 0.22 * k;
  for (let i = 0; i < 6; i++) {
    const z = -0.46 * L + (i * 0.56 * L) / 5;
    for (const sx of [-1, 1]) parts.push(place(box(0.04, 0.4 * k, 0.04, rail), sx * (B * 0.47), railY, z));
  }
  for (const sx of [-1, 1]) parts.push(place(box(0.04, 0.04, 0.56 * L, rail), sx * (B * 0.47), workY + 0.42 * k, -0.18 * L));
  parts.push(place(box(B * 0.94, 0.04, 0.04, rail), 0, workY + 0.42 * k, -0.46 * L));

  // Wheelhouse, forward of midships as on the reference boat.
  const hw = B * 0.62;
  const hd = 0.25 * L;
  const hz = 0.1 * L;
  let y = workY;
  const tierH = 0.82 * k;
  const glass = '#27404f';
  for (let t = 0; t < tiers; t++) {
    const shrink = 1 - t * 0.14;
    const w = hw * shrink;
    const d = hd * shrink;
    const z = hz + t * 0.02 * L;
    parts.push(place(box(w, tierH, d, house), 0, y + tierH / 2, z));
    parts.push(place(box(w + 0.05, 0.05 * k, d + 0.05, shade(house, 0.78)), 0, y + 0.03 * k, z));
    const top = t === tiers - 1;
    if (top) {
      // Bridge: a wraparound band of panes split by white mullions, raked forward.
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
      // Overhanging roof with a visor over the windows.
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
  // Door and ladder on the after face of the house.
  const aft = hz - hd / 2;
  parts.push(place(box(0.34 * k, 0.6 * k, 0.03, '#61757f'), B * -0.14, workY + 0.32 * k, aft - 0.01));
  parts.push(place(box(0.04, tierH * tiers, 0.04, rail), B * 0.2, workY + (tierH * tiers) / 2, aft - 0.07));
  parts.push(place(box(0.04, tierH * tiers, 0.04, rail), B * 0.2 + 0.26 * k, workY + (tierH * tiers) / 2, aft - 0.07));
  const rungs = Math.round((tierH * tiers) / (0.16 * k));
  for (let i = 1; i < rungs; i++) parts.push(place(box(0.26 * k, 0.025, 0.025, rail), B * 0.2 + 0.13 * k, workY + i * 0.16 * k, aft - 0.07));

  // Roof fittings: rail, searchlight, horn and whip aerials.
  const rw = hw * (1 - (tiers - 1) * 0.14) * 0.46;
  const rd = hd * (1 - (tiers - 1) * 0.14) * 0.46;
  const roofTop = roofY + 0.12 * k;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(place(box(0.03, 0.2 * k, 0.03, rail), sx * rw, roofTop + 0.1 * k, hz + sz * rd));
  parts.push(place(box(rw * 2, 0.03, 0.03, rail), 0, roofTop + 0.2 * k, hz - rd));
  parts.push(place(box(0.03, 0.03, rd * 2, rail), rw, roofTop + 0.2 * k, hz));
  parts.push(place(box(0.03, 0.03, rd * 2, rail), -rw, roofTop + 0.2 * k, hz));
  parts.push(place(cyl(0.07 * k, 0.09 * k, 0.09 * k, 8, '#f2e7b8'), rw * 0.6, roofTop + 0.06 * k, hz + rd * 0.8, 0, 1, 1, 1, Math.PI / 2));
  parts.push(place(cyl(0.012, 0.02, 0.9 * k, 4, '#30383e'), -rw * 0.8, roofTop + 0.45 * k, hz - rd * 0.6));
  parts.push(place(cyl(0.012, 0.02, 0.7 * k, 4, '#30383e'), rw * 0.8, roofTop + 0.35 * k, hz - rd * 0.6));
  // Running lights: red to port, green to starboard.
  parts.push(place(box(0.05, 0.08 * k, 0.12 * k, '#d6342d'), hw / 2 + 0.03, roofY - 0.1 * k, hz + hd * 0.32));
  parts.push(place(box(0.05, 0.08 * k, 0.12 * k, '#2fa866'), -hw / 2 - 0.03, roofY - 0.1 * k, hz + hd * 0.32));

  // Stack, banded in the hull colour, and vents.
  const stackX = B * 0.14;
  const stackZ = hz - hd * 0.62;
  parts.push(place(cyl(0.11 * k, 0.15 * k, 0.72 * k, 8, '#26343c'), stackX, workY + tierH * 0.86 + 0.2 * k, stackZ));
  parts.push(place(cyl(0.122 * k, 0.133 * k, 0.16 * k, 8, hull), stackX, workY + tierH * 0.86 + 0.34 * k, stackZ));
  parts.push(place(cyl(0.05 * k, 0.05 * k, 0.28 * k, 6, '#c9d0d3'), -B * 0.14, workY + tierH + 0.12 * k, hz - hd * 0.55));
  // Life rings on the house sides, and a raft canister.
  const ring = () => paint(new THREE.TorusGeometry(0.13 * k, 0.04 * k, 4, 10), '#e3662e');
  parts.push(place(ring(), hw / 2 + 0.02, workY + tierH * 0.45, hz - hd * 0.3, Math.PI / 2));
  parts.push(place(ring(), -hw / 2 - 0.02, workY + tierH * 0.45, hz - hd * 0.3, Math.PI / 2));
  parts.push(place(cyl(0.12 * k, 0.12 * k, 0.42 * k, 8, '#eef1f1'), -B * 0.34, workY + 0.14 * k, aft - 0.2 * k, 0, 1, 1, 1, Math.PI / 2));

  // Masts.
  const mastZ = hz;
  const mh = 1.5 * k;
  parts.push(place(cyl(0.035 * k, 0.05 * k, mh, 6, '#e9ecec'), 0, roofY + mh / 2, mastZ));
  parts.push(place(box(0.7 * k, 0.03 * k, 0.03 * k, '#e9ecec'), 0, roofY + mh * 0.68, mastZ));
  parts.push(place(box(0.06 * k, 0.06 * k, 0.06 * k, '#f2e7b8'), 0, roofY + mh * 0.68 + 0.05 * k, mastZ));
  parts.push(place(cone(0.05 * k, 0.1 * k, 5, '#d7a436'), 0, roofY + mh + 0.06, mastZ));
  if (mast > 1) {
    parts.push(place(cyl(0.03 * k, 0.05 * k, mh * 1.1, 6, '#e9ecec'), 0, workY + mh * 0.55, -0.26 * L));
    parts.push(place(box(0.03 * k, 0.03 * k, 0.5 * L, steel), 0, roofY + mh * 0.3, -0.08 * L, 0, 1, 1, 1, 0.14));
  }

  // Hauling crane on the working deck: post, jib, block and the winch beneath it.
  const craneZ = -0.08 * L;
  parts.push(place(cyl(0.08 * k, 0.11 * k, 1 * k, 7, craneCol), B * 0.32, workY + 0.5 * k, craneZ));
  parts.push(place(box(0.16 * k, 0.1 * k, 0.16 * k, shade(craneCol, 0.8)), B * 0.32, workY + 0.96 * k, craneZ));
  parts.push(place(box(0.09 * k, 0.09 * k, 1.1 * k, craneCol), B * 0.14, workY + 1 * k, craneZ - 0.05 * L, -0.5, 1, 1, 1, -0.34));
  parts.push(place(box(0.02, 0.5 * k, 0.02, '#26292c'), -0.1, workY + 0.84 * k, craneZ - 0.11 * L));
  parts.push(place(box(0.08 * k, 0.1 * k, 0.08 * k, '#d7a436'), -0.1, workY + 0.56 * k, craneZ - 0.11 * L));
  parts.push(place(cyl(0.16 * k, 0.16 * k, 0.34 * k, 8, '#3f5c66'), -B * 0.3, workY + 0.14 * k, craneZ, 0, 1, 1, 1, Math.PI / 2));
  // Rope coiled on deck, and a row of spare buoys along the stern rail.
  parts.push(place(paint(new THREE.TorusGeometry(0.16 * k, 0.05 * k, 4, 10), '#d98b3a'), -B * 0.2, deckY + 0.06 * k, -0.38 * L, 0, 1, 1, 1, Math.PI / 2));
  for (let i = -1; i <= 1; i++) parts.push(place(paint(new THREE.IcosahedronGeometry(0.1 * k, 0), '#e3662e'), (i * B) / 4.4, workY + 0.46 * k, -0.47 * L));

  // Foredeck: rails converging on the stem, anchor winch, and a hawse pipe each side.
  const bz = 0.33 * L;
  const by = 1.3 * k;
  for (const sx of [-1, 1]) {
    parts.push(place(box(0.04, 0.3 * k, 0.05, rail), sx * B * 0.24, by + 0.28 * k, bz + 0.05 * L));
    parts.push(place(box(0.04, 0.05, 0.2 * L, rail), sx * B * 0.17, by + 0.42 * k, bz + 0.07 * L, sx * -0.28));
    parts.push(place(cyl(0.05 * k, 0.05 * k, 0.03, 8, '#26292c'), sx * B * 0.24, 1.05 * k, 0.36 * L, 0, 1, 1, 1, 0, Math.PI / 2));
  }
  parts.push(place(box(0.34 * k, 0.2 * k, 0.28 * k, '#3f5c66'), 0, by + 0.1 * k, bz));
  parts.push(place(cyl(0.05 * k, 0.05 * k, 0.5 * k, 6, '#2c383e'), 0, by + 0.14 * k, bz, 0, 1, 1, 1, 0, Math.PI / 2));
  return merged(parts);
}

export function makeBoatMaterial() {
  return stylize(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function deckSlots(m, count) {
  const k = m.length / 8;
  const slots = [];
  const deckY = 0.8 * k;
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
  u.deckhand.position.set(-model.beam * 0.24, 0.8 * k, -0.16 * model.length);
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
