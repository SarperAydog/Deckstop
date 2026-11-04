// Small geometry kit: every prop is painted vertex colours merged into one mesh,
// which keeps draw calls low and needs no textures at all.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();

export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  tmpColor.set(color);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = tmpColor.r;
    arr[i * 3 + 1] = tmpColor.g;
    arr[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Hard facets: each triangle gets its own flat normal.
export function facet(geo) {
  geo.computeVertexNormals();
  return geo;
}

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

export function place(geo, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  e.set(rx, ry, rz);
  q.setFromEuler(e);
  p.set(x, y, z);
  s.set(sx, sy, sz);
  m.compose(p, q, s);
  geo.applyMatrix4(m);
  return geo;
}

// Moves a whole list of parts at once.
export function placeAll(parts, x, y, z, ry = 0, scale = 1) {
  for (const g of parts) place(g, x, y, z, ry, scale);
  return parts;
}

export const box = (w, h, d, color) => paint(new THREE.BoxGeometry(w, h, d), color);
export const cyl = (rt, rb, h, seg, color) => facet(paint(new THREE.CylinderGeometry(rt, rb, h, seg), color));
export const cone = (r, h, seg, color) => facet(paint(new THREE.ConeGeometry(r, h, seg), color));

// Gable: a triangular prism lying along Z.
export function gable(w, h, d, color) {
  const hw = w / 2;
  const hd = d / 2;
  const a = [-hw, 0, -hd];
  const b = [hw, 0, -hd];
  const c = [0, h, -hd];
  const a2 = [-hw, 0, hd];
  const b2 = [hw, 0, hd];
  const c2 = [0, h, hd];
  const tris = [a, c, b, a2, b2, c2, a, a2, c2, a, c2, c, b, c, c2, b, c2, b2, a, b, b2, a, b2, a2].flat();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return paint(g, color);
}

// A boulder: a crumpled icosahedron, its upward faces under snow.
export function rock(r, seed, stone = '#8d9aaa', snow = '#eef2f5') {
  const g = new THREE.IcosahedronGeometry(r, 0);
  const pos = g.attributes.position;
  const seen = new Map();
  let rs = seed * 9301 + 49297;
  const rnd = () => {
    rs = (rs * 9301 + 49297) % 233280;
    return rs / 233280;
  };
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, [0.72 + rnd() * 0.55, 0.62 + rnd() * 0.5, 0.72 + rnd() * 0.55]);
    const k = seen.get(key);
    pos.setXYZ(i, pos.getX(i) * k[0], pos.getY(i) * k[1], pos.getZ(i) * k[2]);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(stone);
  const b = new THREE.Color(snow);
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i += 3) {
    const c = nor.getY(i) > 0.62 ? b : a;
    const v = 0.94 + rnd() * 0.12;
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = c.r * v;
      col[(i + j) * 3 + 1] = c.g * v;
      col[(i + j) * 3 + 2] = c.b * v;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function merged(parts) {
  return mergeGeometries(parts, false);
}
