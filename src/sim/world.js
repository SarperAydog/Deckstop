// Deterministic world generation. No three.js here: the sim and tests share it.
import { CFG } from '../config.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

export function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, y, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / norm;
}

const sat = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);

function roundedBoxSdf(px, pz, b) {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const dx = px - b.x;
  const dz = pz - b.z;
  const lx = Math.abs(c * dx + s * dz) - b.hx + b.r;
  const lz = Math.abs(-s * dx + c * dz) - b.hz + b.r;
  const ox = Math.max(lx, 0);
  const oz = Math.max(lz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(lx, lz), 0) - b.r;
}

function blobExtent(b) {
  return Math.hypot(b.hx, b.hz) + 3;
}

function makeIsland(kind, blobs, seed) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of blobs) {
    const e = blobExtent(b);
    minX = Math.min(minX, b.x - e);
    maxX = Math.max(maxX, b.x + e);
    minZ = Math.min(minZ, b.z - e);
    maxZ = Math.max(maxZ, b.z + e);
  }
  return { kind, blobs, seed, minX, maxX, minZ, maxZ };
}

// Island height: the highest rounded plateau wins. Walls are short and steep, so
// the result reads as stacked soft-edged blocks rather than rolling hills.
export function islandHeight(isl, x, z) {
  if (x < isl.minX || x > isl.maxX || z < isl.minZ || z > isl.maxZ) return -0.6;
  const wob = (fbm(x * 0.09, z * 0.09, isl.seed, 2) - 0.5) * 3.2;
  let h = -0.6;
  for (const b of isl.blobs) {
    const d = roundedBoxSdf(x, z, b) + wob * (b.wobble ?? 1);
    const t = sat(-d / b.wall);
    if (t <= 0) continue;
    const v = -0.6 + (b.level + 0.6) * smooth(Math.pow(t, 0.8));
    if (v > h) h = v;
  }
  return h;
}

function portIsland(seed) {
  return makeIsland(
    'port',
    [
      { x: 0, z: 0, hx: 34, hz: 25, r: 10, level: 0.55, wall: 1.6, rot: 0 },
      { x: -2, z: -5, hx: 27, hz: 15, r: 7, level: 4.2, wall: 1.7, rot: 0.03 },
      { x: -11, z: -9, hx: 10, hz: 8, r: 4.5, level: 7.8, wall: 1.5, rot: -0.12 },
      { x: 17, z: -11, hx: 7, hz: 5.5, r: 3.5, level: 6.4, wall: 1.3, rot: 0.25 },
    ],
    seed,
  );
}

function wildIsland(cx, cz, r, seed) {
  const rand = rng(seed);
  const size = 8 + rand() * 20;
  const rot = rand() * Math.PI;
  const blobs = [
    {
      x: cx,
      z: cz,
      hx: size * (0.8 + rand() * 0.5),
      hz: size * (0.6 + rand() * 0.4),
      r: 4 + rand() * 3,
      level: 0.5,
      wall: 1.5,
      rot,
    },
  ];
  const stacks = 1 + Math.floor(rand() * 3);
  let level = 2.2 + rand() * 1.6;
  for (let i = 0; i < stacks; i++) {
    const ang = rand() * Math.PI * 2;
    const off = size * 0.35 * rand();
    const shrink = 0.72 - i * 0.14;
    blobs.push({
      x: cx + Math.cos(ang) * off,
      z: cz + Math.sin(ang) * off,
      hx: size * shrink * (0.7 + rand() * 0.4),
      hz: size * shrink * (0.5 + rand() * 0.4),
      r: 2.5 + rand() * 2.5,
      level,
      wall: 1.3 + rand() * 0.5,
      rot: rot + (rand() - 0.5) * 0.7,
    });
    level += 1.5 + rand() * 2;
  }
  return makeIsland(r < 0.28 ? 'ice' : 'wild', blobs, seed);
}

function iceberg(cx, cz, seed) {
  const rand = rng(seed);
  const s = 2.5 + rand() * 4;
  return makeIsland(
    'ice',
    [
      { x: cx, z: cz, hx: s * 1.3, hz: s, r: s * 0.6, level: 0.6, wall: 1, rot: rand() * 3, wobble: 0.5 },
      { x: cx + rand() - 0.5, z: cz + rand() - 0.5, hx: s * 0.8, hz: s * 0.65, r: s * 0.4, level: 2 + rand() * 3.5, wall: 1.1, rot: rand() * 3, wobble: 0.5 },
    ],
    seed,
  );
}

// Felzenszwalb 1D squared-distance transform.
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    do {
      const p = v[k];
      s = (f[q] + q * q - f[p] - p * p) / (2 * q - 2 * p);
      if (s <= z[k]) k--;
      else break;
    } while (k >= 0);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

function distanceTransform(mask, n, cell) {
  const INF = 1e12;
  const grid = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) grid[i] = mask[i] ? 0 : INF;
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = grid[y * n + x];
    edt1d(f, n, d, v, z);
    for (let y = 0; y < n; y++) grid[y * n + x] = d[y];
  }
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = grid[y * n + x];
    edt1d(f, n, d, v, z);
    for (let x = 0; x < n; x++) out[y * n + x] = Math.sqrt(d[x]) * cell;
  }
  return out;
}

export function generateWorld(seed) {
  const size = CFG.worldSize;
  const half = size / 2;
  const rand = rng(seed);
  const islands = [portIsland(seed + 1)];
  const placed = [{ x: 0, z: 0, r: 80 }];

  const tryPlace = (minR, maxR, clearance, make) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const ang = rand() * Math.PI * 2;
      const dist = minR + rand() * (maxR - minR);
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      if (Math.abs(x) > half - 40 || Math.abs(z) > half - 40) continue;
      // Keep the sea lane south of the pier clear so leaving port is never fiddly.
      if (z > 0 && z < 110 && Math.abs(x) < 34) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + clearance)) continue;
      placed.push({ x, z, r: clearance });
      islands.push(make(x, z));
      return;
    }
  };

  for (let i = 0; i < 20; i++) {
    const s = Math.floor(rand() * 1e9);
    const kindRoll = rand();
    tryPlace(100, 300, 46, (x, z) => wildIsland(x, z, kindRoll, s));
  }
  for (let i = 0; i < 26; i++) {
    const s = Math.floor(rand() * 1e9);
    tryPlace(62, 310, 14, (x, z) => iceberg(x, z, s));
  }

  const n = Math.round(size / CFG.sdfCell);
  const cell = CFG.sdfCell;
  const mask = new Uint8Array(n * n);
  for (const isl of islands) {
    const x0 = Math.max(0, Math.floor((isl.minX + half) / cell));
    const x1 = Math.min(n - 1, Math.ceil((isl.maxX + half) / cell));
    const z0 = Math.max(0, Math.floor((isl.minZ + half) / cell));
    const z1 = Math.min(n - 1, Math.ceil((isl.maxZ + half) / cell));
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        if (islandHeight(isl, gx * cell - half, gz * cell - half) > 0) mask[gz * n + gx] = 1;
      }
    }
  }
  const sdf = distanceTransform(mask, n, cell);

  const densitySeed = seed + 991;
  const density = (x, z) => {
    const v = fbm(x * 0.048 + 13.1, z * 0.048 - 7.7, densitySeed, 3);
    return sat((v - 0.3) / 0.42);
  };

  const shoreDistance = (x, z) => {
    const fx = (x + half) / cell;
    const fz = (z + half) / cell;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= n - 1 || iz >= n - 1) return CFG.sdfMax;
    const u = fx - ix;
    const v = fz - iz;
    const a = sdf[iz * n + ix];
    const b = sdf[iz * n + ix + 1];
    const c = sdf[(iz + 1) * n + ix];
    const d = sdf[(iz + 1) * n + ix + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  const heightAt = (x, z) => {
    let h = -0.6;
    for (const isl of islands) {
      const v = islandHeight(isl, x, z);
      if (v > h) h = v;
    }
    return h;
  };

  return {
    seed,
    size,
    half,
    islands,
    n,
    cell,
    mask,
    sdf,
    density,
    shoreDistance,
    heightAt,
    // The berth sits beside the pier head; the pier is decoration, not collision.
    port: { x: 15.5, z: 42, heading: 0, pierX: 8, pierStartZ: 22, pierEndZ: 44 },
  };
}
