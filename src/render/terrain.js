// Islands: soft-edged stacked plateaus with cream cliffs, a thin coloured top and
// near-black tree masses, in the spirit of hand-built miniature dioramas.
import * as THREE from 'three';
import { islandHeight, rng, fbm } from '../sim/world.js';
import { box, blob, cone, cyl, gable, merged, place } from './kit.js';
import { withMist } from './mist.js';

const PALETTES = {
  sage: { top: '#a9bb95', top2: '#8ea684', cliff: '#ece9dd', shade: '#a7b5ba', wet: '#c4cfb3', tree: '#27493f', tree2: '#1f3d36', conifer: false },
  rust: { top: '#cb9c83', top2: '#b98771', cliff: '#e8dfd3', shade: '#ab9ea6', wet: '#d6b6a1', tree: '#3a2b3e', tree2: '#2d2233', conifer: true },
  moss: { top: '#b7bb8a', top2: '#9fa679', cliff: '#e9e6d6', shade: '#a6adab', wet: '#cdcfa6', tree: '#2f4a3a', tree2: '#233b2f', conifer: true },
  ice: { top: '#f5f7f6', top2: '#e7eff0', cliff: '#dcecef', shade: '#a2c2cd', wet: '#e9f3f3', tree: '#2f4a4a', tree2: '#233b3b', conifer: true },
};

const c = {
  top: new THREE.Color(),
  top2: new THREE.Color(),
  cliff: new THREE.Color(),
  shade: new THREE.Color(),
  wet: new THREE.Color(),
  snow: new THREE.Color('#f4f5f1'),
  out: new THREE.Color(),
};

function islandPalette(isl) {
  if (isl.kind === 'port') return PALETTES.sage;
  if (isl.kind === 'ice') return PALETTES.ice;
  const r = rng(isl.seed + 3)();
  return r < 0.4 ? PALETTES.sage : r < 0.7 ? PALETTES.rust : PALETTES.moss;
}

function buildIslandMesh(isl, pal, material) {
  const step = 0.55;
  const x0 = isl.minX;
  const z0 = isl.minZ;
  const nx = Math.ceil((isl.maxX - isl.minX) / step) + 1;
  const nz = Math.ceil((isl.maxZ - isl.minZ) / step) + 1;
  const hs = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) hs[iz * nx + ix] = islandHeight(isl, x0 + ix * step, z0 + iz * step);
  }

  const vid = new Int32Array(nx * nz).fill(-1);
  const indices = [];
  const positions = [];
  const addV = (ix, iz) => {
    const k = iz * nx + ix;
    if (vid[k] < 0) {
      vid[k] = positions.length / 3;
      positions.push(x0 + ix * step, hs[k], z0 + iz * step);
    }
    return vid[k];
  };
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = hs[iz * nx + ix];
      const b = hs[iz * nx + ix + 1];
      const d = hs[(iz + 1) * nx + ix];
      const e = hs[(iz + 1) * nx + ix + 1];
      if (Math.max(a, b, d, e) < -0.2) continue;
      const va = addV(ix, iz);
      const vb = addV(ix + 1, iz);
      const vd = addV(ix, iz + 1);
      const ve = addV(ix + 1, iz + 1);
      indices.push(va, vd, vb, vb, vd, ve);
    }
  }
  if (!indices.length) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  c.top.set(pal.top);
  c.top2.set(pal.top2);
  c.cliff.set(pal.cliff);
  c.shade.set(pal.shade);
  c.wet.set(pal.wet);

  const nor = geo.attributes.normal;
  const colors = new Float32Array(positions.length);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const k = iz * nx + ix;
      const id = vid[k];
      if (id < 0) continue;
      const h = hs[k];
      const x = x0 + ix * step;
      const z = z0 + iz * step;
      // Baked occlusion: darker where taller ground stands close by.
      let around = 0;
      let count = 0;
      for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
        const jx = ix + dx;
        const jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        around += Math.max(0, hs[jz * nx + jx] - h);
        count++;
      }
      const ao = Math.min(1, count ? (around / count) * 0.75 : 0);
      const up = nor.getY(id);
      const flat = THREE.MathUtils.smoothstep(up, 0.62, 0.88);
      const patch = fbm(x * 0.13, z * 0.13, isl.seed + 5, 3);
      c.out.copy(c.top).lerp(c.top2, THREE.MathUtils.smoothstep(patch, 0.42, 0.62));
      // Old snow lingers on high ground: it keeps every island reading as Arctic.
      const snow = THREE.MathUtils.smoothstep(h + patch * 3.4, 6.2, 8.2);
      c.out.lerp(c.snow, snow);
      if (h < 0.42) c.out.lerp(c.wet, 0.8);
      c.out.lerp(c.cliff, 1 - flat);
      c.out.lerp(c.shade, ao * (flat > 0.5 ? 0.55 : 0.9));
      colors[id * 3] = c.out.r;
      colors[id * 3 + 1] = c.out.g;
      colors[id * 3 + 2] = c.out.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function flatEnough(isl, x, z, reach = 1.3) {
  const h = islandHeight(isl, x, z);
  if (h < 0.3) return null;
  for (const [dx, dz] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
    if (Math.abs(islandHeight(isl, x + dx, z + dz) - h) > 0.28) return null;
  }
  return h;
}

function house(parts, x, y, z, ry, w, d, h, wall = '#f3efe5', roof = '#c6ad9f') {
  parts.push(place(box(w, h, d, wall), x, y + h / 2, z, ry));
  parts.push(place(gable(w * 1.2, w * 0.62, d * 1.08, roof), x, y + h, z, ry));
  const cz = Math.cos(ry);
  const sz = Math.sin(ry);
  parts.push(place(box(0.34, 0.75, 0.04, '#6d5a5c'), x + sz * (d / 2 + 0.01), y + 0.38, z + cz * (d / 2 + 0.01), ry));
  parts.push(place(box(0.3, 0.3, 0.04, '#596a73'), x + sz * (d / 2 + 0.01) + cz * w * 0.26, y + h * 0.62, z + cz * (d / 2 + 0.01) - sz * w * 0.26, ry));
}

function forest(parts, isl, pal, rand, count, zones = null) {
  const blobs = zones ?? isl.blobs.filter((b) => b.level > 1);
  if (!blobs.length) return;
  for (let i = 0; i < count; i++) {
    const b = blobs[Math.floor(rand() * blobs.length)];
    const cx = b.x + (rand() - 0.5) * b.hx * 1.5;
    const cz = b.z + (rand() - 0.5) * b.hz * 1.5;
    const trees = 5 + Math.floor(rand() * 16);
    for (let t = 0; t < trees; t++) {
      const x = cx + (rand() - 0.5) * 8;
      const z = cz + (rand() - 0.5) * 7;
      const h = flatEnough(isl, x, z, 0.9);
      if (h === null) continue;
      const col = rand() < 0.5 ? pal.tree : pal.tree2;
      if (pal.conifer) {
        const tall = 1.7 + rand() * 1.9;
        parts.push(place(cone(0.72 + rand() * 0.25, tall, 7, col), x, h + tall / 2, z, rand() * 3));
      } else {
        const r = 0.8 + rand() * 0.7;
        parts.push(place(blob(r, col), x, h + r * 0.62, z, 0, 1, 0.82, 1));
      }
    }
  }
}

function shrubs(parts, isl, pal, rand, count) {
  const shrub = isl.kind === 'ice' ? null : pal.top2;
  for (let i = 0; i < count; i++) {
    const x = isl.minX + rand() * (isl.maxX - isl.minX);
    const z = isl.minZ + rand() * (isl.maxZ - isl.minZ);
    const h = islandHeight(isl, x, z);
    if (h < 0.35) {
      // Dark boulders collect along the shoreline.
      if (h > -0.4 && rand() < 0.5) {
        const r = 0.3 + rand() * 0.55;
        parts.push(place(blob(r, '#4c4a55', 0), x, h + r * 0.3, z, rand() * 6, 1, 0.7, 1));
      }
      continue;
    }
    if (shrub && flatEnough(isl, x, z, 0.5) !== null) {
      const r = 0.22 + rand() * 0.32;
      const dark = new THREE.Color(shrub).multiplyScalar(0.72).getStyle();
      parts.push(place(blob(r, dark, 0), x, h + r * 0.4, z, rand() * 6, 1, 0.75, 1));
    }
  }
}

function portDecor(parts, world, isl) {
  const { pierX, pierStartZ, pierEndZ } = world.port;
  const plank = '#6b5656';
  const pierLen = pierEndZ - pierStartZ;
  parts.push(place(box(4, 0.22, pierLen, plank), pierX, 0.78, (pierStartZ + pierEndZ) / 2));
  for (let z = pierStartZ + 1; z <= pierEndZ; z += 3.6) {
    for (const dx of [-1.85, 1.85]) parts.push(place(cyl(0.17, 0.17, 2.1, 6, '#4a3c42'), pierX + dx, 0.2, z));
  }
  // Crates and rope bollards on the pier head.
  parts.push(place(box(1, 0.8, 1, '#a68a70'), pierX - 1, 1.3, pierEndZ - 2));
  parts.push(place(box(0.8, 0.6, 0.8, '#94785f'), pierX - 0.9, 1.2, pierEndZ - 3.2, 0.4));
  parts.push(place(cyl(0.16, 0.2, 0.5, 6, '#2d2a33'), pierX + 1.6, 1.15, pierEndZ - 1.2));

  // A little harbour crane.
  parts.push(place(box(0.5, 4, 0.5, '#544750'), pierX + 1, 2.9, pierStartZ + 7));
  parts.push(place(box(0.34, 0.34, 5, '#544750'), pierX + 1.8, 4.9, pierStartZ + 8.5, 1.1));

  // The harbour village on the lower plateau.
  const houses = [
    [6, 2, 0.2, 3.6, 3.1, 2.1],
    [13, 3, -0.3, 3, 3.8, 1.9],
    [20, 4, 1.4, 3, 3, 1.9],
    [-2, 5, 0.1, 3.2, 3.4, 2],
    [-16, 3, 1.5, 3, 3.4, 1.8],
    [-22, -4, 0.2, 2.8, 3, 1.8],
    [9, -8, 1.2, 3.4, 3, 2],
  ];
  for (const [x, z, ry, w, d, h] of houses) {
    const y = islandHeight(isl, x, z);
    const roof = Math.abs(x) % 3 < 1 ? '#b86a56' : '#c6ad9f';
    house(parts, x, y - 0.1, z, ry, w, d, h, '#f4f0e6', roof);
  }

  // The chapel on the upper terrace: the island's landmark.
  {
    const x = -11;
    const z = -9;
    const y = islandHeight(isl, x, z) - 0.1;
    house(parts, x, y, z, 0.35, 4.2, 6.6, 2.8);
    const tx = x - 2.3;
    const tz = z - 2.6;
    parts.push(place(box(2.4, 5.8, 2.4, '#f6f2e8'), tx, y + 2.9, tz, 0.35));
    parts.push(place(cone(1.9, 2.2, 4, '#b86a56'), tx, y + 6.9, tz, 0.35 + Math.PI / 4));
    parts.push(place(box(0.5, 0.9, 0.05, '#596a73'), tx + 0.42, y + 4.2, tz + 1.14, 0.35));
  }

  // A striped lighthouse on the seaward knoll.
  {
    const x = 17;
    const z = -11;
    const y = islandHeight(isl, x, z) - 0.1;
    parts.push(place(cyl(0.9, 1.25, 2, 10, '#f4f0e6'), x, y + 1, z));
    parts.push(place(cyl(0.82, 0.9, 1.3, 10, '#b5473f'), x, y + 2.65, z));
    parts.push(place(cyl(0.72, 0.82, 1.3, 10, '#f4f0e6'), x, y + 3.95, z));
    parts.push(place(cyl(0.5, 0.5, 0.6, 8, '#f6d98c'), x, y + 4.9, z));
    parts.push(place(cone(0.82, 0.8, 10, '#3f3540'), x, y + 5.6, z));
  }
}

export function buildWorldMeshes(world) {
  const group = new THREE.Group();
  const terrainMat = withMist(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const decorMat = withMist(new THREE.MeshLambertMaterial({ vertexColors: true }));

  for (const isl of world.islands) {
    const pal = islandPalette(isl);
    const mesh = buildIslandMesh(isl, pal, terrainMat);
    if (mesh) group.add(mesh);

    const rand = rng(isl.seed + 11);
    const parts = [];
    const area = (isl.maxX - isl.minX) * (isl.maxZ - isl.minZ);
    if (isl.kind === 'port') {
      portDecor(parts, world, isl);
      // Tree mass behind the village, kept clear of the houses.
      const zones = [{ x: -19, z: 7, hx: 9, hz: 4 }, { x: 22, z: 12, hx: 6, hz: 5 }, { x: 4, z: -15, hx: 6, hz: 2.5 }];
      forest(parts, isl, pal, rand, 6, zones);
    } else if (isl.kind === 'wild') {
      forest(parts, isl, pal, rand, Math.min(5, 1 + Math.floor(area / 900)));
      if (rand() < 0.3) {
        const b = isl.blobs[isl.blobs.length - 1];
        const h = flatEnough(isl, b.x, b.z, 2);
        if (h !== null) house(parts, b.x, h - 0.1, b.z, rand() * 3, 2.8, 3.2, 1.8);
      }
    }
    shrubs(parts, isl, pal, rand, isl.kind === 'ice' ? 6 : Math.floor(area / 14));
    if (parts.length) {
      const decor = new THREE.Mesh(merged(parts), decorMat);
      decor.castShadow = true;
      decor.receiveShadow = true;
      group.add(decor);
    }
  }
  return group;
}

// Drifting ice floes: pure dressing, they never collide with anything.
export function buildFloes(world) {
  const rand = rng(world.seed + 77);
  const geo = new THREE.CylinderGeometry(1, 1.15, 0.28, 6);
  const mat = withMist(new THREE.MeshLambertMaterial({ color: '#f4f8f8' }));
  const count = 240;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let i = 0;
  let guard = 0;
  while (i < count && guard++ < 6000) {
    const x = (rand() - 0.5) * world.size;
    const z = (rand() - 0.5) * world.size;
    if (world.shoreDistance(x, z) < 6 || Math.hypot(x - world.port.x, z - world.port.z) < 26) continue;
    const r = 0.35 + rand() * rand() * 1.5;
    q.setFromAxisAngle(up, rand() * 6.28);
    pos.set(x, 0.03, z);
    scl.set(r, 1, r * (0.65 + rand() * 0.35));
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i++, m);
  }
  mesh.count = i;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}
