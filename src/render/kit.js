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

export const box = (w, h, d, color) => paint(new THREE.BoxGeometry(w, h, d), color);
export const cyl = (rt, rb, h, seg, color) => paint(new THREE.CylinderGeometry(rt, rb, h, seg), color);
export const cone = (r, h, seg, color) => paint(new THREE.ConeGeometry(r, h, seg), color);

// Soft blob with sphere normals: reads as the rounded dark tree masses.
export function blob(r, color, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return paint(g, color);
}

// Gable roof: a triangular prism lying along Z.
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

export function merged(parts) {
  return mergeGeometries(parts, false);
}
