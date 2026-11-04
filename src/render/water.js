// The sea does most of the art direction: dusty teal fading to pale mist, thin
// white contour lines hugging every shore, soft silhouette reflections of the
// land, rain rings, and the underwater radar heatmap.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { mistUniforms } from './mist.js';

const VERT = /* glsl */ `
  uniform vec2 uOrigin;
  uniform float uScale;
  uniform float uWave;
  uniform float uTime;
  uniform sampler2D uSdf;
  uniform float uWorld;
  uniform float uSdfTexels;
  uniform float uSdfMax;
  varying vec2 vW;
  void main() {
    vec2 w = position.xy * uScale + uOrigin;
    float y = 0.0;
    if (uWave > 0.001) {
      y = sin(w.x * 0.33 + uTime * 1.3) * 0.5 + sin(w.y * 0.27 - uTime * 1.05) * 0.5
        + sin((w.x + w.y) * 0.61 + uTime * 1.9) * 0.22;
      float shoreD = texture2D(uSdf, (w + uWorld * 0.5) / uWorld + 0.5 / uSdfTexels).r * uSdfMax;
      y *= uWave * smoothstep(1.0, 12.0, shoreD);
    }
    vW = w;
    gl_Position = projectionMatrix * viewMatrix * vec4(w.x, y, w.y, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uSdf;
  uniform sampler2D uDensity;
  uniform float uWorld;
  uniform float uSdfTexels;
  uniform float uSdfMax;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uReflect;
  uniform vec2 uViewDir;
  uniform float uStorm;
  uniform float uRain;
  uniform vec2 uShip;
  uniform vec2 uShipDir;
  uniform float uRadar;
  uniform float uRadarR;
  uniform vec3 uMistColor;
  uniform vec2 uFocus;
  uniform float uMistNear;
  uniform float uMistFar;
  varying vec2 vW;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  vec2 sdfUv(vec2 w) {
    return (w + uWorld * 0.5) / uWorld + 0.5 / uSdfTexels;
  }
  float shore(vec2 w) {
    return texture2D(uSdf, sdfUv(w)).r * uSdfMax;
  }
  float line(float x, float c, float w) {
    return 1.0 - smoothstep(w * 0.5, w * 1.6, abs(x - c));
  }
  vec3 heat(float v) {
    vec3 a = vec3(0.09, 0.25, 0.42);
    vec3 b = vec3(0.10, 0.62, 0.60);
    vec3 c = vec3(0.98, 0.72, 0.22);
    vec3 d = vec3(0.93, 0.20, 0.27);
    if (v < 0.4) return mix(a, b, v / 0.4);
    if (v < 0.7) return mix(b, c, (v - 0.4) / 0.3);
    return mix(c, d, (v - 0.7) / 0.3);
  }

  void main() {
    vec2 w = vW;
    float d = shore(w);
    float aa = max(0.07, fwidth(d));

    float big = noise(w * 0.018 + uTime * 0.006);
    vec3 col = mix(uDeep, uDeep * 1.09 + 0.01, big);

    // Pale shallow shelf, then the thin contour lines around each island.
    col = mix(col, uShallow, exp(-d * 0.55) * 0.85);
    float wob = (noise(w * 0.075 + uTime * 0.03) - 0.5);
    float breathe = sin(uTime * 0.42 + d * 0.15) * 0.3;
    float l1 = line(d + wob * 0.5, 1.5 + breathe * 0.4, aa);
    float l2 = line(d + wob * 1.3, 3.4 + breathe, aa) * 0.6;
    float l3 = line(d + wob * 2.4, 6.0 + breathe * 1.6, aa) * 0.22;
    float near = step(0.001, d);
    col = mix(col, uFoam, clamp(l1 + l2 + l3, 0.0, 1.0) * near * 0.85);

    // Soft patches that drift on the surface, like wind on still water.
    float patch1 = smoothstep(0.66, 0.78, noise(w * 0.09 + vec2(uTime * 0.018, -uTime * 0.012)));
    float patch2 = smoothstep(0.42, 0.75, noise(w * 0.031 - uTime * 0.008));
    col = mix(col, uFoam, patch1 * patch2 * 0.1);

    // Silhouette reflection of the land, offset away from the viewer.
    float refl = 0.0;
    for (int i = 1; i <= 5; i++) {
      float k = float(i) * 1.6;
      float s = shore(w + uViewDir * k);
      refl += (1.0 - smoothstep(0.0, 1.8, s)) * (1.0 - float(i) * 0.14);
    }
    col = mix(col, uReflect, clamp(refl / 3.2, 0.0, 1.0) * 0.42);

    // Contact shade under the hull.
    vec2 rel = w - uShip - vec2(0.5, 0.35);
    vec2 axis = uShipDir;
    float along = dot(rel, axis);
    float across = dot(rel, vec2(-axis.y, axis.x));
    float hull = 1.0 - smoothstep(0.55, 1.15, length(vec2(along / 3.6, across / 1.5)));
    col = mix(col, uReflect, hull * 0.45);

    // Radar heatmap: density seen through the water, fading out at the edge.
    if (uRadar > 0.001) {
      float rd = distance(w, uShip);
      if (rd < uRadarR * 1.1) {
        float dens = texture2D(uDensity, (w + uWorld * 0.5) / uWorld).r;
        float fadeOut = 1.0 - smoothstep(uRadarR * 0.45, uRadarR, rd);
        float bands = floor(dens * 7.0) / 7.0;
        vec3 h = heat(mix(dens, bands, 0.55));
        col = mix(col, h, fadeOut * 0.72 * uRadar);
        col = mix(col, uFoam, line(rd, uRadarR, max(0.1, fwidth(rd))) * 0.45 * uRadar);
        float sweep = fract(uTime * 0.14 - atan(w.y - uShip.y, w.x - uShip.x) / 6.28318);
        col = mix(col, uFoam, pow(sweep, 22.0) * fadeOut * 0.3 * uRadar);
      }
    }

    // Storm: bands of whitecaps and a heavier sea.
    if (uStorm > 0.001) {
      vec2 q = vec2(w.x * 0.7071 + w.y * 0.7071, w.y * 0.7071 - w.x * 0.7071);
      q += 1.8 * vec2(noise(w * 0.07 + uTime * 0.1), noise(w * 0.07 - uTime * 0.08));
      float crest = noise(vec2(q.x * 0.34 + uTime * 0.55, q.y * 1.15)) * 0.65 + noise(vec2(q.x * 0.8 - uTime * 0.3, q.y * 2.6)) * 0.35;
      float gust = smoothstep(0.35, 0.65, noise(w * 0.035 + uTime * 0.05));
      float caps = smoothstep(0.7 - uStorm * 0.05, 0.74, crest) * gust;
      col = mix(col, uFoam, caps * uStorm * 0.42);
    }

    // Rain: expanding white rings scattered over the surface.
    if (uRain > 0.001) {
      for (int j = 0; j < 2; j++) {
        float size = 3.2 + float(j) * 2.3;
        vec2 p = w / size + float(j) * 7.7;
        vec2 id = floor(p);
        vec2 cellP = fract(p) - 0.5;
        float h1 = hash(id);
        if (h1 < uRain * 0.42) {
          vec2 off = (vec2(hash(id + 3.1), hash(id + 9.7)) - 0.5) * 0.55;
          float phase = fract(uTime * (0.55 + h1 * 0.6) + h1 * 19.0);
          float r = phase * 0.32;
          float ring = line(length(cellP - off), r, 0.03) * (1.0 - phase);
          col = mix(col, uFoam, ring * 0.85);
        }
      }
    }

    float mist = smoothstep(uMistNear, uMistFar, distance(w, uFocus));
    col = mix(col, uMistColor, mist);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function sdfTexture(world) {
  const { n, sdf } = world;
  const data = new Uint8Array(n * n);
  const max = CFG.sdfMax;
  for (let i = 0; i < n * n; i++) data[i] = Math.min(255, (sdf[i] / max) * 255);
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function densityTexture(world) {
  const n = 256;
  const data = new Uint8Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const wx = (x / n) * world.size - world.half;
      const wz = (z / n) * world.size - world.half;
      data[z * n + x] = world.density(wx, wz) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildWater(world) {
  const geo = new THREE.PlaneGeometry(1, 1, 160, 160);
  const uniforms = {
    ...mistUniforms,
    uSdf: { value: sdfTexture(world) },
    uDensity: { value: densityTexture(world) },
    uWorld: { value: world.size },
    uSdfTexels: { value: world.n },
    uSdfMax: { value: CFG.sdfMax },
    uTime: { value: 0 },
    uOrigin: { value: new THREE.Vector2() },
    uScale: { value: 400 },
    uWave: { value: 0 },
    uDeep: { value: new THREE.Color('#6f9ba5') },
    uShallow: { value: new THREE.Color('#c6dfdb') },
    uFoam: { value: new THREE.Color('#f4f7f4') },
    uReflect: { value: new THREE.Color('#47707c') },
    uViewDir: { value: new THREE.Vector2(0, -1) },
    uStorm: { value: 0 },
    uRain: { value: 0 },
    uShip: { value: new THREE.Vector2() },
    uShipDir: { value: new THREE.Vector2(0, 1) },
    uRadar: { value: 0 },
    uRadarR: { value: 16 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}
