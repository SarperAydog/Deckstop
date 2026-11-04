// Portraits are little photographs of real low-poly models: the same ships you sail
// and matching busts of the crew, shot once at startup and kept as images.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { box, cone, cyl, facet, merged, paint, place } from './kit.js';
import { buildShipGeometry } from './ship.js';

function head(skin) {
  const g = new THREE.IcosahedronGeometry(0.62, 1);
  g.scale(0.92, 1.06, 0.94);
  return facet(paint(g, skin));
}

function deckhandBust() {
  const coat = '#e3662e';
  const skin = '#e4b394';
  const parts = [
    // Oilskin coat with bib, high collar and a white shirt peeking through.
    place(facet(paint(new THREE.CylinderGeometry(0.72, 1.16, 1.5, 8), coat)), 0, -0.1, 0),
    place(facet(paint(new THREE.SphereGeometry(0.42, 7, 5), coat)), -1, 0.32, 0, 0, 1, 1.1, 1),
    place(facet(paint(new THREE.SphereGeometry(0.42, 7, 5), coat)), 1, 0.32, 0, 0, 1, 1.1, 1),
    place(box(0.72, 0.9, 0.1, '#c9531f'), 0, -0.1, 0.92, 0, 1, 1, 1, -0.2),
    place(box(0.1, 0.8, 0.06, '#26343c'), -0.3, 0.3, 0.72, 0, 1, 1, 1, -0.16),
    place(box(0.1, 0.8, 0.06, '#26343c'), 0.3, 0.3, 0.72, 0, 1, 1, 1, -0.16),
    place(cyl(0.34, 0.42, 0.34, 7, skin), 0, 0.72, 0),
    place(head(skin), 0, 1.38, 0),
    place(cone(0.1, 0.26, 5, '#d39b7c'), 0, 1.36, 0.62, 0, 1, 1, 1, Math.PI / 2),
    place(box(0.11, 0.08, 0.04, '#1f2a30'), -0.22, 1.54, 0.54),
    place(box(0.11, 0.08, 0.04, '#1f2a30'), 0.22, 1.54, 0.54),
    place(box(0.2, 0.05, 0.04, '#7a4a2e'), -0.22, 1.66, 0.55),
    place(box(0.2, 0.05, 0.04, '#7a4a2e'), 0.22, 1.66, 0.55),
    // Short ginger beard.
    place(facet(paint(new THREE.IcosahedronGeometry(0.44, 1), '#a85f2e')), 0, 1.03, 0.2, 0, 1.2, 0.72, 1),
    place(box(0.32, 0.05, 0.04, '#7a3d20'), 0, 1.18, 0.6),
    // Knitted beanie.
    place(facet(paint(new THREE.SphereGeometry(0.66, 8, 5, 0, 6.3, 0, 1.5), '#2e6a72')), 0, 1.68, -0.02),
    place(cyl(0.68, 0.66, 0.24, 9, '#245760'), 0, 1.74, -0.02),
    place(cone(0.08, 0.1, 5, '#e9ecec'), 0, 2.36, -0.02, 0, 1.6),
  ];
  return merged(parts);
}

function captainBust() {
  const coat = '#27425a';
  const skin = '#eec5a8';
  const parts = [
    place(facet(paint(new THREE.CylinderGeometry(0.68, 1.1, 1.5, 8), coat)), 0, -0.1, 0),
    place(facet(paint(new THREE.SphereGeometry(0.4, 7, 5), coat)), -0.94, 0.32, 0, 0, 1, 1.1, 1),
    place(facet(paint(new THREE.SphereGeometry(0.4, 7, 5), coat)), 0.94, 0.32, 0, 0, 1, 1.1, 1),
    // Roll-neck jumper and brass buttons.
    place(cyl(0.42, 0.5, 0.34, 8, '#eceee9'), 0, 0.72, 0),
    place(box(0.5, 1, 0.08, '#1d3447'), 0, -0.05, 0.88, 0, 1, 1, 1, -0.17),
    place(cyl(0.06, 0.06, 0.05, 6, '#d7a436'), -0.15, 0.1, 0.92, 0, 1, 1, 1, Math.PI / 2 - 0.17),
    place(cyl(0.06, 0.06, 0.05, 6, '#d7a436'), 0.15, 0.1, 0.92, 0, 1, 1, 1, Math.PI / 2 - 0.17),
    place(cyl(0.06, 0.06, 0.05, 6, '#d7a436'), -0.15, -0.3, 0.98, 0, 1, 1, 1, Math.PI / 2 - 0.17),
    place(cyl(0.06, 0.06, 0.05, 6, '#d7a436'), 0.15, -0.3, 0.98, 0, 1, 1, 1, Math.PI / 2 - 0.17),
    place(head(skin), 0, 1.36, 0),
    place(cone(0.09, 0.22, 5, '#dfae90'), 0, 1.34, 0.61, 0, 1, 1, 1, Math.PI / 2),
    place(box(0.1, 0.08, 0.04, '#1f2a30'), -0.22, 1.52, 0.54),
    place(box(0.1, 0.08, 0.04, '#1f2a30'), 0.22, 1.52, 0.54),
    place(box(0.2, 0.04, 0.04, '#c9ccc9'), -0.22, 1.63, 0.56),
    place(box(0.2, 0.04, 0.04, '#c9ccc9'), 0.22, 1.63, 0.56),
    place(box(0.26, 0.04, 0.04, '#b5745c'), 0, 1.08, 0.57),
    // Silver hair in a low knot, and a skipper's cap.
    place(facet(paint(new THREE.IcosahedronGeometry(0.64, 1), '#c6cbcd')), 0, 1.42, -0.16, 0, 1, 1, 0.96),
    place(facet(paint(new THREE.IcosahedronGeometry(0.24, 0), '#b4babd')), 0, 1.16, -0.68),
    place(cyl(0.72, 0.6, 0.3, 10, '#f2f3f1'), 0, 1.98, 0),
    place(cyl(0.62, 0.62, 0.14, 10, '#26343c'), 0, 1.8, 0),
    place(box(0.82, 0.05, 0.36, '#1a262e'), 0, 1.73, 0.6, 0, 1, 1, 1, 0.2),
    place(cyl(0.09, 0.09, 0.03, 6, '#d7a436'), 0, 1.86, 0.63, 0, 1, 1, 1, Math.PI / 2),
  ];
  return merged(parts);
}

function shoot(renderer, scene, camera, w, h, background) {
  const target = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  const prevClear = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(target);
  renderer.clear();
  const prevOutput = renderer.outputColorSpace;
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, prevClear);
  renderer.outputColorSpace = prevOutput;
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  target.dispose();

  const fg = document.createElement('canvas');
  fg.width = w;
  fg.height = h;
  const fgc = fg.getContext('2d');
  const img = fgc.createImageData(w, h);
  const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = ((h - 1 - y) * w + x) * 4;
      const a = px[i + 3] / 255;
      // The target holds linear colour premultiplied against nothing: encode it here.
      for (let c = 0; c < 3; c++) img.data[o + c] = Math.round(toSrgb(px[i + c] / 255 / Math.max(a, 1e-3)) * 255);
      img.data[o + 3] = px[i + 3];
    }
  }
  fgc.putImageData(img, 0, 0);

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  background(g, w, h);
  g.drawImage(fg, 0, 0);
  return c.toDataURL('image/png');
}

function seaBackdrop(g, w, h) {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#3f9aa3');
  grad.addColorStop(1, '#2f8791');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    const y = ((i * 71) % h) + 4;
    const x = (i * 137) % w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 26 + (i % 3) * 14, y - 10);
    g.stroke();
  }
}

function coldBackdrop(top, bottom) {
  return (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // A snowy hill and a distant shore behind the sitter.
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.moveTo(0, h * 0.72);
    g.lineTo(w * 0.28, h * 0.56);
    g.lineTo(w * 0.52, h * 0.68);
    g.lineTo(w * 0.8, h * 0.5);
    g.lineTo(w, h * 0.62);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.fill();
  };
}

export function renderPortraits(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c8da, 2.3));
  const sun = new THREE.DirectionalLight(0xfff4e2, 1.6);
  sun.position.set(-3, 4, 4);
  scene.add(sun);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const out = { crew: {}, ships: {} };

  const bust = (geo, bg) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = -0.34;
    scene.add(mesh);
    const cam = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 40);
    cam.position.set(0, 1.5, 14);
    cam.lookAt(0, 0.92, 0);
    const url = shoot(renderer, scene, cam, 256, 256, bg);
    scene.remove(mesh);
    return url;
  };
  out.crew.deckhand = bust(deckhandBust(), coldBackdrop('#a9cbd0', '#7fb0b6'));
  out.crew.captain = bust(captainBust(), coldBackdrop('#d3dfe2', '#a8c0c9'));

  for (const [id, cls] of Object.entries(CFG.ships)) {
    const geo = buildShipGeometry(cls.model);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = Math.PI * 0.72;
    scene.add(mesh);
    const span = cls.model.length * 0.47;
    const aspect = 1.7;
    const cam = new THREE.OrthographicCamera(-span * aspect, span * aspect, span, -span, 0.1, 200);
    cam.position.set(30, 22, 30);
    cam.lookAt(0, cls.model.length * 0.14, 0);
    out.ships[id] = shoot(renderer, scene, cam, 408, 240, seaBackdrop);
    scene.remove(mesh);
  }
  return out;
}
