// The crabber: oxblood hull, cream wheelhouse, tiny saturated crew. Bright colour
// is reserved for what matters to play, against an otherwise muted world.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { box, cone, cyl, merged, paint, place } from './kit.js';
import { withMist } from './mist.js';

function hullGeometry(color, deck) {
  // Lofted from stations along Z: [z, halfWidth, keelY, deckY]
  const st = [
    [-3.0, 0.82, 0.12, 0.92],
    [-2.2, 1.1, -0.1, 0.86],
    [-0.6, 1.2, -0.25, 0.84],
    [1.0, 1.12, -0.22, 0.92],
    [2.2, 0.72, -0.05, 1.14],
    [3.2, 0.05, 0.32, 1.42],
  ];
  const side = [];
  const top = [];
  const q = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < st.length - 1; i++) {
    const [z0, w0, k0, d0] = st[i];
    const [z1, w1, k1, d1] = st[i + 1];
    q(side, [w0, k0, z0], [w0, d0, z0], [w1, d1, z1], [w1, k1, z1]);
    q(side, [-w0, k0, z0], [-w1, k1, z1], [-w1, d1, z1], [-w0, d0, z0]);
    q(top, [-w0, d0, z0], [-w1, d1, z1], [w1, d1, z1], [w0, d0, z0]);
  }
  const [z0, w0, k0, d0] = st[0];
  q(side, [-w0, k0, z0], [-w0, d0, z0], [w0, d0, z0], [w0, k0, z0]);
  const mk = (pos, col) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return paint(g, col);
  };
  return [mk(side, color), mk(top, deck)];
}

export function makeBoatMaterial() {
  return withMist(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

export function buildShip() {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const mat = makeBoatMaterial();

  const parts = [...hullGeometry('#6c2a37', '#c9b69c')];
  // Pale waterline stripe and raised rail.
  parts.push(place(box(2.46, 0.09, 4.2, '#efe7d9'), 0, 0.72, -0.8));
  // Wheelhouse, set aft as on real crabbers... then windows, roof and funnel.
  parts.push(place(box(1.5, 1.2, 1.5, '#f3eee3'), 0, 1.45, -1.55));
  parts.push(place(box(1.54, 0.34, 0.06, '#35424c'), 0, 1.72, -0.79));
  parts.push(place(box(0.06, 0.32, 1.1, '#35424c'), 0.77, 1.72, -1.55));
  parts.push(place(box(0.06, 0.32, 1.1, '#35424c'), -0.77, 1.72, -1.55));
  parts.push(place(box(1.74, 0.13, 1.76, '#a84c3e'), 0, 2.12, -1.55));
  parts.push(place(cyl(0.16, 0.2, 0.75, 8, '#2f2b35'), 0.42, 2.45, -2.1));
  parts.push(place(cyl(0.17, 0.17, 0.14, 8, '#a84c3e'), 0.42, 2.76, -2.1));
  // Mast and hauling crane over the working deck.
  parts.push(place(cyl(0.05, 0.07, 2.1, 6, '#3a3640'), -0.25, 3.15, -1.5));
  parts.push(place(cyl(0.09, 0.13, 1.8, 7, '#d9a53e'), 0.72, 1.7, 1.2));
  parts.push(place(box(0.13, 0.13, 2.1, '#d9a53e'), 0.28, 2.55, 1.28, 0, 1, 1, 1, 0, 0.25));
  parts.push(place(cone(0.1, 0.22, 6, '#2f2b35'), -0.42, 2.14, 1.28));
  // Bow rail.
  parts.push(place(box(0.05, 0.3, 1.5, '#f0e9dc'), 0.56, 1.32, 2.2, -0.42));
  parts.push(place(box(0.05, 0.3, 1.5, '#f0e9dc'), -0.56, 1.32, 2.2, 0.42));

  const body = new THREE.Mesh(merged(parts), mat);
  body.castShadow = true;
  tilt.add(body);

  // Stacked cages on deck: their count shows at a glance how many are aboard.
  const cageGeo = merged([
    box(0.62, 0.42, 0.62, '#40464e'),
    place(box(0.66, 0.05, 0.66, '#d6c8ab'), 0, 0.21, 0),
    place(box(0.66, 0.05, 0.66, '#d6c8ab'), 0, -0.21, 0),
  ]);
  const cageMat = makeBoatMaterial();
  const cages = new THREE.InstancedMesh(cageGeo, cageMat, 12);
  const m = new THREE.Matrix4();
  const slots = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row < 3; row++) {
      for (const col of [-0.36, 0.36]) slots.push([col, 1.12 + layer * 0.46, -0.3 + row * 0.68]);
    }
  }
  slots.forEach(([x, y, z], i) => {
    m.makeTranslation(x, y, z);
    cages.setMatrixAt(i, m);
  });
  cages.count = 0;
  cages.castShadow = true;
  tilt.add(cages);

  // Crew: tiny figures in bright oilskins.
  const figure = (coat) =>
    merged([
      place(cyl(0.11, 0.13, 0.42, 6, coat), 0, 0.21, 0),
      place(cyl(0.07, 0.11, 0.16, 6, '#efd9c2'), 0, 0.5, 0),
      place(cyl(0.05, 0.14, 0.1, 6, coat), 0, 0.6, 0),
    ]);
  const skipper = new THREE.Mesh(figure('#e9b23c'), mat);
  skipper.position.set(0.05, 0.9, -0.48);
  skipper.castShadow = true;
  tilt.add(skipper);
  const deckhand = new THREE.Mesh(figure('#e8602e'), mat);
  deckhand.position.set(-0.75, 0.9, 1.0);
  deckhand.castShadow = true;
  tilt.add(deckhand);
  const captain = new THREE.Mesh(figure('#2b6fc2'), mat);
  captain.position.set(0, 2.18, -1.2);
  captain.castShadow = true;
  tilt.add(captain);

  // Pennant at the masthead, in a saturated colour.
  const pennantGeo = new THREE.BufferGeometry();
  pennantGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.27, 0, 0, -0.27, 0, 0, 0.27, -0.45, 0, -0.27, -0.45, 0, 0, -1.05], 3));
  pennantGeo.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  pennantGeo.computeVertexNormals();
  const pennantMat = withMist(new THREE.MeshLambertMaterial({ color: '#e0363f', side: THREE.DoubleSide, emissive: '#5a0d12' }));
  const pennant = new THREE.Mesh(pennantGeo, pennantMat);
  pennant.position.set(-0.25, 4.0, -1.5);
  tilt.add(pennant);

  // Radar bar turns whenever the radar is switched on.
  const radarBar = new THREE.Mesh(box(0.7, 0.05, 0.1, '#f0e9dc'), mat);
  radarBar.position.set(-0.25, 3.5, -1.5);
  tilt.add(radarBar);

  root.userData = { tilt, cages, deckhand, captain, skipper, pennant, radarBar };
  return root;
}

export function updateShip(root, game, time, dt) {
  const { tilt, cages, deckhand, captain, pennant, radarBar } = root.userData;
  const s = game.s;
  const ship = s.ship;
  const a = game.alpha;
  const prev = game.prev;

  const dh = Math.atan2(Math.sin(ship.heading - prev.heading), Math.cos(ship.heading - prev.heading));
  root.position.set(prev.x + (ship.x - prev.x) * a, 0, prev.z + (ship.z - prev.z) * a);
  root.rotation.y = prev.heading + dh * a;

  const storm = s.weather.storm;
  const swell = 0.03 + storm * 0.34;
  tilt.position.y = Math.sin(time * (1.1 + storm * 0.9)) * swell + storm * 0.2;
  tilt.rotation.z = Math.sin(time * 0.9) * (0.018 + storm * 0.2) - ship.rudder * Math.min(1, Math.abs(ship.speed) / 8) * 0.07;
  tilt.rotation.x = Math.sin(time * 1.25 + 1) * (0.012 + storm * 0.13) - Math.min(0.05, Math.max(0, ship.speed) * 0.006);

  cages.count = Math.min(12, game.cagesAboard);
  cages.instanceMatrix.needsUpdate = true;
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
      place(cyl(0.3, 0.34, 0.5, 8, '#e8602e'), 0, 0.2, 0),
      place(cyl(0.34, 0.34, 0.1, 8, '#f6efe2'), 0, 0.3, 0),
      place(cyl(0.035, 0.035, 1.3, 5, '#2f2b35'), 0, 0.95, 0),
    ]);
    this.flagGeo = new THREE.BufferGeometry();
    this.flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.34, 0, 0.56, -0.17, 0], 3));
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
        body.castShadow = true;
        const flagMat = withMist(new THREE.MeshLambertMaterial({ color: '#f2c53d', side: THREE.DoubleSide }));
        const flag = new THREE.Mesh(this.flagGeo, flagMat);
        flag.position.set(0, 1.58, 0);
        const ringMat = new THREE.MeshBasicMaterial({ color: '#fbfbf6', transparent: true, opacity: 0.8, depthWrite: false });
        const ring = new THREE.Mesh(this.ringGeo, ringMat);
        group.add(body, flag, ring);
        group.position.set(c.x, 0, c.z);
        this.scene.add(group);
        it = { group, body, flag, flagMat, ring, ringMat, born: time };
        this.items.set(c.id, it);
      }
      const age = s.t - c.t0;
      const ready = age >= CFG.soakPeak;
      const past = age > CFG.soakPeak + 20;
      it.flagMat.color.set(ready ? (past ? '#e0363f' : '#55d17a') : '#f2c53d');
      it.body.position.y = Math.sin(time * 1.3 + c.id) * 0.06 + s.weather.storm * Math.sin(time * 2.1 + c.id) * 0.3;
      it.flag.position.y = 1.58 + it.body.position.y;
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
