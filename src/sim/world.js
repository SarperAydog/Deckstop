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

const sstep = (a, b, v) => smooth(sat((v - a) / (b - a)));
const mix = (a, b, t) => a + (b - a) * t;

function distSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = sat(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

// Town footprint: everything inside is levelled for building on.
export const TOWN = { x0: -34, x1: 42, z0: -9, z1: 42 };

// Where the coast runs: x, then z. It climbs north up the west side, passes the town,
// and falls away south just east of it, so land only holds the south-west corner.
const COAST = [
  [-360, -420], [-320, -325], [-280, -250], [-240, -155], [-200, -100], [-160, -60], [-110, -28], [-70, -9], [-44, -3],
  [42, -3], [62, 3], [90, 34], [130, 90], [190, 170], [260, 260], [360, 400],
];

function coastLine(x) {
  if (x <= COAST[0][0]) return COAST[0][1];
  for (let i = 0; i < COAST.length - 1; i++) {
    const [x0, z0] = COAST[i];
    const [x1, z1] = COAST[i + 1];
    if (x > x1) continue;
    // Catmull-Rom through the neighbours keeps the coast free of corners.
    const zp = COAST[Math.max(0, i - 1)][1];
    const zn = COAST[Math.min(COAST.length - 1, i + 2)][1];
    const t = (x - x0) / (x1 - x0);
    return 0.5 * (2 * z0 + (z1 - zp) * t + (2 * zp - 5 * z0 + 4 * z1 - zn) * t * t + (3 * z0 - zp - 3 * z1 + zn) * t * t * t);
  }
  return COAST[COAST.length - 1][1];
}

// Signed "how far inland" field for the mainland. The sea lies towards -Z, so from
// the default camera the coast runs across the screen with land at the lower left.
function landField(x, z, seed) {
  const far = sstep(58, 150, Math.abs(x));
  const ripple = (fbm(x * 0.031, 8.7, seed + 13, 2) - 0.5) * 12;
  // A cove on the west side of the harbour, sheltered by the breakwater.
  const cove = 7 * sstep(-9, -19, x) * sstep(-44, -30, x);
  const coast = coastLine(x) + cove + ripple * (0.25 + far * 0.75);
  let f = z - coast + (fbm(x * 0.021 + 3, z * 0.021 - 2, seed + 17, 3) - 0.5) * 46 * far;
  // Lighthouse point, east of town.
  f = Math.max(f, 7.5 - Math.hypot((x - 27) * 0.8, z + 6.5));
  return f;
}

function breakwaterField(x, z) {
  const a = distSegment(x, z, -17, 6, -15, -3);
  const b = distSegment(x, z, -15, -3, -12, -12);
  return Math.max(2.3 - Math.min(a, b), 3 - Math.hypot(x + 12, z + 12.5));
}

export function generateWorld(seed) {
  const size = CFG.worldSize;
  const half = size / 2;
  const step = CFG.meshStep;
  const rand = rng(seed);

  // Offshore: a few rocky skerries and big flat sheets of ice to steer around.
  const features = [];
  const clearOf = (x, z, r) => {
    if (Math.abs(x) > half - 30 || Math.abs(z) > half - 30) return false;
    if (Math.hypot(x - 6, z + 18) < 62 + r) return false;
    if (landField(x, z, seed) > -22 - r) return false;
    return features.every((f) => Math.hypot(f.x - x, f.z - z) > f.r + r + 16);
  };
  const scatter = (count, kind, rMin, rMax) => {
    for (let i = 0; i < count; i++) {
      for (let t = 0; t < 25; t++) {
        const x = (rand() - 0.5) * size;
        const z = -half + rand() * size;
        const r = rMin + rand() * (rMax - rMin);
        if (clearOf(x, z, r)) {
          features.push({ kind, x, z, r, s: Math.floor(rand() * 1e6) });
          break;
        }
      }
    }
  };
  scatter(4, 'skerry', 6, 11);
  scatter(10, 'ice', 9, 24);

  // The ground is one jittered triangle mesh. Height queries, collision and the
  // renderer all share it, so the faceted shoreline you see is the one you hit.
  const nv = Math.ceil(size / step) + 1;
  const px = new Float32Array(nv * nv);
  const pz = new Float32Array(nv * nv);
  const py = new Float32Array(nv * nv);
  const inland = new Float32Array(nv * nv);
  const surf = new Uint8Array(nv * nv); // 0 mainland, 1 rock, 2 ice
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nv; i++) {
      const k = j * nv + i;
      const x = -half + i * step + (hash2(i, j, seed + 3) - 0.5) * step * 0.62;
      const z = -half + j * step + (hash2(i, j, seed + 5) - 0.5) * step * 0.62;
      px[k] = x;
      pz[k] = z;
      const f = landField(x, z, seed);
      inland[k] = f;
      const crumple = (hash2(i, j, seed + 7) - 0.5) * 0.55;
      let h;
      if (f < 0) h = Math.max(-2.6, f * 0.8);
      else {
        const shore = 1.25 * sstep(0, 3.2, f);
        const reach = sstep(16, 64, f);
        const ridge = 1 - Math.abs(fbm(x * 0.017, z * 0.017, seed + 23, 3) * 2 - 1);
        h = shore + reach * Math.pow(ridge, 1.5) * 25 + crumple * sat(f / 3) * (0.6 + reach * 2.4);
      }
      // Level the town, softly blending out into the hills around it.
      const tx = Math.max(TOWN.x0 - x, x - TOWN.x1, 0);
      const tz = Math.max(TOWN.z0 - z, z - TOWN.z1, 0);
      const town = 1 - sstep(0, 22, Math.hypot(tx, tz));
      if (f > 1.5 && town > 0) h = mix(h, 1.45 + crumple * 0.3, town);

      const bw = breakwaterField(x, z);
      if (bw > 0 && bw > f) {
        h = Math.max(h, 1.15 + crumple);
        surf[k] = 1;
      } else if (f < 0) {
        h = Math.min(h, -0.5);
      }
      for (const fe of features) {
        const d = Math.hypot(x - fe.x, z - fe.z);
        if (d > fe.r * 1.5) continue;
        const wob = (fbm(x * 0.11, z * 0.11, fe.s, 2) - 0.5) * fe.r * 0.9;
        const inner = fe.r - d + wob;
        if (fe.kind === 'ice') {
          h = inner > 0 ? 0.42 + crumple * 0.14 : -1.2;
          surf[k] = 2;
        } else {
          h = inner > 0 ? 0.9 + Math.min(inner, fe.r * 0.6) * (0.45 + hash2(i, j, fe.s) * 0.3) : -1.6;
          surf[k] = 1;
        }
      }
      py[k] = h;
    }
  }

  // Rasterise those triangles into a fine height grid for lookups and the SDF.
  const cell = CFG.sdfCell;
  const n = Math.round(size / cell);
  const fine = new Float32Array(n * n).fill(-3);
  const fillTri = (a, b, c) => {
    const ax = px[a];
    const az = pz[a];
    const bx = px[b];
    const bz = pz[b];
    const cx = px[c];
    const cz = pz[c];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-6) return;
    const x0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) + half) / cell));
    const x1 = Math.min(n - 1, Math.floor((Math.max(ax, bx, cx) + half) / cell));
    const z0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) + half) / cell));
    const z1 = Math.min(n - 1, Math.floor((Math.max(az, bz, cz) + half) / cell));
    for (let gz = z0; gz <= z1; gz++) {
      const wz = gz * cell - half;
      for (let gx = x0; gx <= x1; gx++) {
        const wx = gx * cell - half;
        const u = ((bz - cz) * (wx - cx) + (cx - bx) * (wz - cz)) / det;
        const v = ((cz - az) * (wx - cx) + (ax - cx) * (wz - cz)) / det;
        const w = 1 - u - v;
        if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
        fine[gz * n + gx] = u * py[a] + v * py[b] + w * py[c];
      }
    }
  };
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nv - 1; i++) {
      const a = j * nv + i;
      const b = a + 1;
      const d = a + nv;
      const e = d + 1;
      if (Math.max(py[a], py[b], py[d], py[e]) < -0.01) continue;
      // Alternating diagonals keep the grid from showing through as stripes.
      if ((i + j) % 2) {
        fillTri(a, d, b);
        fillTri(b, d, e);
      } else {
        fillTri(a, d, e);
        fillTri(a, e, b);
      }
    }
  }
  const mask = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) mask[i] = fine[i] > 0 ? 1 : 0;
  const sdf = distanceTransform(mask, n, cell);

  const densitySeed = seed + 991;
  const density = (x, z) => {
    const v = fbm(x * 0.048 + 13.1, z * 0.048 - 7.7, densitySeed, 3);
    return sat((v - 0.3) / 0.42);
  };

  const bilinear = (grid, x, z, outside) => {
    const fx = (x + half) / cell;
    const fz = (z + half) / cell;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= n - 1 || iz >= n - 1) return outside;
    const u = fx - ix;
    const v = fz - iz;
    const a = grid[iz * n + ix];
    const b = grid[iz * n + ix + 1];
    const c = grid[(iz + 1) * n + ix];
    const d = grid[(iz + 1) * n + ix + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const shoreDistance = (x, z) => bilinear(sdf, x, z, CFG.sdfMax);
  const heightAt = (x, z) => bilinear(fine, x, z, -3);

  // Berth on the east side of the long pier. The pier is a real obstacle for the
  // ship, but not part of the shoreline, so it gets no foam line of its own.
  const pier = { x0: -1.7, x1: 1.7, z0: -26, z1: 0 };
  const port = { x: 6.2, z: -18.5, heading: Math.PI, pier };
  const navDistance = (x, z) => {
    const dx = Math.max(pier.x0 - x, x - pier.x1, 0);
    const dz = Math.max(pier.z0 - z, z - pier.z1, 0);
    return Math.min(shoreDistance(x, z), Math.hypot(dx, dz));
  };

  return {
    seed,
    size,
    half,
    n,
    cell,
    mask,
    sdf,
    fine,
    features,
    mesh: { nv, px, py, pz, inland, surf, step },
    density,
    shoreDistance,
    navDistance,
    heightAt,
    // Where the ship may sail. North of the mesh there is only open sea.
    bounds: { x0: -half + 6, x1: half - 6, z0: -595, z1: 34 },
    port,
  };
}
