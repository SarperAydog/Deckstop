// The sea follows Bad North's rule of borders, not textures: open water is almost
// flat colour, and all the detail happens where something meets it. A bright aqua
// shelf, a thin foam line, slow contour ripples, and real mirrored geometry rendered
// to a texture and rippled here. Rain rings and the radar heatmap sit on top.
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
  void main() {
    vec2 w = position.xy * uScale + uOrigin;
    float y = 0.0;
    if (uWave > 0.001) {
      vec2 q = w + 3.0 * vec2(noise(w * 0.03 + uTime * 0.02), noise(w * 0.03 - uTime * 0.017));
      y = cos(dot(q, vec2(0.045, 0.2)) - 0.6 * uTime) * 0.5
        + sin(dot(q, vec2(-0.09, 0.23)) - 0.702 * uTime + 1.3) * 0.32
        + sin(dot(q, vec2(0.2, 0.34)) - 0.96 * uTime + 2.1) * 0.16;
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
  uniform sampler2D uWaveField;
  uniform vec2 uDensMin;
  uniform vec2 uDensSize;
  uniform float uWorld;
  uniform float uSdfTexels;
  uniform float uSdfMax;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uReflect;
  uniform vec3 uMid;
  uniform sampler2D uMirror;
  uniform vec2 uResolution;
  uniform vec2 uHull;
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
  uniform float uMistAmount;
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

    // Depth ramp: shelf aqua, clear teal, then the slightly dustier open sea.
    float big = noise(w * 0.012 + uTime * 0.004);
    vec3 col = mix(uDeep, uDeep * 1.07 + 0.006, big);
    col = mix(col, uMid, exp(-d * 0.085));
    col = mix(col, uShallow, exp(-d * 0.42) * 0.9);

    // Soft patches drifting on the surface, like wind on still water.
    float patch1 = smoothstep(0.62, 0.8, noise(w * 0.07 + vec2(uTime * 0.018, -uTime * 0.012)));
    float patch2 = smoothstep(0.42, 0.75, noise(w * 0.024 - uTime * 0.008));
    col = mix(col, uShallow, patch1 * patch2 * 0.1);

    // Waves, one system from open sea to beach. A long swell travels south. What it
    // knows about the coast comes from a smooth baked field, so the surface has no
    // creases: how open the water is to the swell, whether this shore faces it, and a
    // blurred depth. Crests slow and bunch up as that depth falls, as in shallow water.
    float omega = 0.6;
    vec2 q = w + 3.0 * vec2(noise(w * 0.03 + uTime * 0.02), noise(w * 0.03 - uTime * 0.017));
    vec2 k1 = vec2(0.045, 0.2);
    vec2 k2 = vec2(-0.09, 0.23);
    vec2 k3 = vec2(0.2, 0.34);
    float p2 = dot(q, k2) - omega * 1.17 * uTime + 1.3;
    float p3 = dot(q, k3) - omega * 1.6 * uTime + 2.1;

    vec2 fieldUv = (w + uWorld * 0.5) / uWorld;
    vec4 field = texture2D(uWaveField, fieldUv);
    float open = field.r;
    float exposure = field.g;
    float depth = field.b;
    float texel = 2.5 / uWorld;
    vec2 depthGrad = vec2(
      texture2D(uWaveField, fieldUv + vec2(texel, 0.0)).b - texture2D(uWaveField, fieldUv - vec2(texel, 0.0)).b,
      texture2D(uWaveField, fieldUv + vec2(0.0, texel)).b - texture2D(uWaveField, fieldUv - vec2(0.0, texel)).b
    ) / 5.0;
    float shallow = 1.0 - clamp(depth / 24.0, 0.0, 1.0);
    float crestPhase = -dot(q, k1) - 9.0 * shallow * shallow + omega * uTime;
    vec2 gradPhase = -k1 + 0.75 * shallow * depthGrad;
    float kShore = max(length(gradPhase), 0.05);
    float inShallows = (1.0 - smoothstep(7.0, 20.0, depth)) * exposure;

    float chop = 1.0 - inShallows;
    float swell = (cos(crestPhase) * 0.5 + sin(p2) * 0.32 * chop + sin(p3) * 0.16 * chop) * open;
    vec2 slope = (-sin(crestPhase) * gradPhase * 0.5 + cos(p2) * k2 * 0.32 * chop + cos(p3) * k3 * 0.16 * chop) * open;
    float calm = smoothstep(0.2, 1.8, d) * (1.0 + uStorm * 1.4);
    col *= 1.0 + dot(slope, vec2(0.62, -0.78)) * 0.95 * calm;
    col = mix(col, uShallow * 1.25, smoothstep(0.5, 0.95, swell) * 0.11 * calm);

    // Mirror image of the world, with its edges shivering in the ripples.
    vec2 suv = gl_FragCoord.xy / uResolution + slope * 0.006 * calm;
    float rip = sin(w.y * 2.1 + uTime * 1.5 + noise(w * 0.6) * 5.0) * 0.5 + (noise(w * vec2(0.5, 1.6) + uTime * 0.5) - 0.5);
    vec4 mir = texture2D(uMirror, suv + vec2(rip * 0.0016, rip * 0.0006));
    vec3 tinted = mix(uReflect, mir.rgb * uReflect * 2.2, 0.42);
    col = mix(col, tinted, mir.a * 0.72 * smoothstep(0.0, 1.0, d + 1.0));

    // Foam: one thin bright line at the waterline, and two fading ripples.
    float wob = noise(w * 0.09 + uTime * 0.05) - 0.5;

    // The crest as a ragged ridge of foam: its path wanders, its width swells and
    // thins, gaps open along it, and the edge is eaten away by lacy noise.
    float lace = noise(w * vec2(1.3, 1.1) + vec2(uTime * 0.12, -uTime * 0.09)) * 0.65 + noise(w * 3.1 - uTime * 0.2) * 0.35;
    float wander = (noise(w * 0.16 + vec2(uTime * 0.06, -uTime * 0.04)) - 0.5) * 2.2 + (noise(w * 0.55 - uTime * 0.08) - 0.5) * 0.9;
    float wrapped = mod(crestPhase + wob * 0.5 + wander * kShore + 3.14159, 6.28318) - 3.14159;
    float crestDist = abs(wrapped) / kShore;
    float shoal = smoothstep(12.0, 3.5, d);
    float ridgeW = 0.3 + 1.5 * noise(w * 0.1 + vec2(3.0, uTime * 0.03)) * (0.5 + 0.8 * smoothstep(8.0, 1.5, d));
    float ridge = 1.0 - smoothstep(ridgeW * 0.25, ridgeW, crestDist);
    float gaps = smoothstep(0.28, 0.56, noise(w * 0.05 + vec2(11.0, uTime * 0.012)));
    float threshold = mix(0.78, 0.4, ridge);
    float crestFoam = ridge * smoothstep(threshold, threshold + 0.13, lace) * gaps * shoal * (0.4 + 0.5 * smoothstep(7.0, 1.5, d)) * exposure;

    // Foam has an age: how long ago a crest passed this spot, as a share of the wave
    // period. It is born where the crest goes by and is left behind in the water.
    float age = mod(wrapped, 6.28318) / 6.28318;
    float born = smoothstep(0.0, 0.035, age);

    // Left on the shore: a dense lacy sheet that holds for a moment, then dissolves. Its
    // holes open wider and wider and what remains fades, with no hard end.
    float sheetEdge = d + (lace - 0.5) * 1.3 + wob * 0.4;
    float sheetZone = 1.0 - smoothstep(1.2, 4.6, sheetEdge);
    float eaten = mix(0.36, 0.98, smoothstep(0.08, 0.82, age));
    float shoreFoam = sheetZone * born * smoothstep(eaten - 0.04, eaten + 0.2, lace)
      * (1.0 - smoothstep(0.5, 0.92, age)) * exposure;

    // In the wake of a wave. Near land it follows the crest. Out at sea each drifting
    // patch of water keeps its own timing, and only some patches foam at all, so from
    // high up there are scattered flecks and no lines to read.
    float scatterPhase = (noise(w * 0.021 + 7.0) * 3.0 + noise(w * 0.058 - 3.0) * 1.6 + noise(w * 0.16 + 1.5) * 0.7) * 6.28318;
    float offshore = 1.0 - shoal * exposure;
    float trailAge = mod(wrapped + scatterPhase * offshore, 6.28318) / 6.28318;
    float patches = mix(1.0, smoothstep(0.5, 0.72, noise(w * 0.034 + vec2(uTime * 0.012, 21.0))) * smoothstep(0.34, 0.6, noise(w * 0.11 + vec2(-5.0, uTime * 0.02))), offshore);
    float trailBorn = smoothstep(0.0, 0.05, trailAge);
    float trailCut = mix(0.6, 0.86, smoothstep(0.0, 0.26, trailAge));
    float trail = trailBorn * (1.0 - smoothstep(0.12, 0.3, trailAge)) * smoothstep(trailCut, trailCut + 0.14, lace) * patches * gaps * open
      * mix(0.14, 0.42, shoal * exposure);

    float near = step(0.001, d);
    col = mix(col, uFoam, clamp(shoreFoam * 0.9 + crestFoam + trail, 0.0, 1.0) * near);

    // Contact shade under the hull.
    vec2 rel = w - uShip;
    vec2 axis = uShipDir;
    float along = dot(rel, axis);
    float across = dot(rel, vec2(-axis.y, axis.x));
    float hull = 1.0 - smoothstep(0.6, 1.1, length(vec2(along / uHull.x, across / uHull.y)));
    col = mix(col, uReflect * 0.8, hull * 0.5);

    // Radar heatmap: density seen through the water, fading out at the edge.
    if (uRadar > 0.001) {
      float rd = distance(w, uShip);
      if (rd < uRadarR * 1.1) {
        float dens = texture2D(uDensity, (w - uDensMin) / uDensSize).r;
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
      vec2 qs = vec2(w.x * 0.7071 + w.y * 0.7071, w.y * 0.7071 - w.x * 0.7071);
      qs += 1.8 * vec2(noise(w * 0.07 + uTime * 0.1), noise(w * 0.07 - uTime * 0.08));
      float crest = noise(vec2(qs.x * 0.9 + uTime * 0.55, qs.y * 2.6)) * 0.62 + noise(vec2(qs.x * 2.3 - uTime * 0.3, qs.y * 5.8)) * 0.38;
      // Whitecaps only tear off the top of a wave, in fine flecks.
      float caps = smoothstep(0.66, 0.74, crest) * smoothstep(0.1, 0.75, swell);
      col = mix(col, uFoam, caps * uStorm * 0.5);
    }

    // Rain: expanding white rings scattered over the surface.
    if (uRain > 0.001) {
      for (int j = 0; j < 2; j++) {
        float size = 1.05 + float(j) * 0.7;
        vec2 p = w / size + float(j) * 7.7;
        vec2 id = floor(p);
        vec2 cellP = fract(p) - 0.5;
        float h1 = hash(id);
        if (h1 < uRain * 0.22) {
          vec2 off = (vec2(hash(id + 3.1), hash(id + 9.7)) - 0.5) * 0.55;
          float phase = fract(uTime * (0.55 + h1 * 0.6) + h1 * 19.0);
          float r = phase * 0.32;
          float ring = line(length(cellP - off), r, 0.045) * (1.0 - phase);
          col = mix(col, uFoam, ring * 0.6);
        }
      }
    }

    float mist = smoothstep(uMistNear, uMistFar, distance(w, uFocus)) * uMistAmount;
    col = mix(col, uMistColor, mist);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function sdfTexture(world) {
  const { n, sdf } = world;
  const data = new Uint16Array(n * n);
  const max = CFG.sdfMax;
  for (let i = 0; i < n * n; i++) data[i] = THREE.DataUtils.toHalfFloat(Math.min(1, sdf[i] / max));
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Baked once: how the swell meets the coast. R is how open the water is (islands cast
// a wave shadow downwind), G whether a shore faces the swell, B a blurred depth. All of
// it is blurred, because a crease in any of these would show as a line on the sea.
const SWELL_DIR = (() => {
  const l = Math.hypot(0.045, 0.2);
  return [0.045 / l, 0.2 / l];
})();

function waveFieldTexture(world) {
  const n = Math.round(world.size / 2);
  const cell = world.size / n;
  const sstep = (a, b, v) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const blur = (src, radius, passes) => {
    let a = src;
    let b = new Float32Array(n * n);
    for (let p = 0; p < passes; p++) {
      for (let z = 0; z < n; z++) {
        let sum = 0;
        for (let x = -radius; x <= radius; x++) sum += a[z * n + Math.max(0, Math.min(n - 1, x))];
        for (let x = 0; x < n; x++) {
          b[z * n + x] = sum / (radius * 2 + 1);
          sum += a[z * n + Math.min(n - 1, x + radius + 1)] - a[z * n + Math.max(0, x - radius)];
        }
      }
      for (let x = 0; x < n; x++) {
        let sum = 0;
        for (let z = -radius; z <= radius; z++) sum += b[Math.max(0, Math.min(n - 1, z)) * n + x];
        for (let z = 0; z < n; z++) {
          a[z * n + x] = sum / (radius * 2 + 1);
          sum += b[Math.min(n - 1, z + radius + 1) * n + x] - b[Math.max(0, z - radius) * n + x];
        }
      }
    }
    return a;
  };
  const dist = new Float32Array(n * n);
  const shade = new Float32Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const wx = (x + 0.5) * cell - world.half;
      const wz = (z + 0.5) * cell - world.half;
      dist[z * n + x] = Math.min(CFG.sdfMax, world.shoreDistance(wx, wz));
      let shadow = 0;
      for (let t = 4; t <= 48; t += 4) {
        const up = world.shoreDistance(wx - SWELL_DIR[0] * t, wz - SWELL_DIR[1] * t);
        shadow = Math.max(shadow, (1 - sstep(0.5, 5, up)) * (1 - t / 56));
      }
      shade[z * n + x] = 1 - shadow * 0.92;
    }
  }
  const depth = blur(dist, 2, 2);
  const open = blur(shade, 2, 2);
  const facing = new Float32Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const gx = depth[z * n + Math.min(n - 1, x + 1)] - depth[z * n + Math.max(0, x - 1)];
      const gz = depth[Math.min(n - 1, z + 1) * n + x] - depth[Math.max(0, z - 1) * n + x];
      const len = Math.hypot(gx, gz);
      const f = len > 1e-4 ? -(gx * SWELL_DIR[0] + gz * SWELL_DIR[1]) / len : 0;
      facing[z * n + x] = sstep(-0.05, 0.45, f) * open[z * n + x];
    }
  }
  const exposure = blur(facing, 2, 2);
  const data = new Uint16Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = THREE.DataUtils.toHalfFloat(open[i]);
    data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(exposure[i]);
    data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(depth[i]);
    data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function densityDomain(world) {
  const pad = 40;
  return {
    min: new THREE.Vector2(world.bounds.x0 - pad, world.bounds.z0 - pad),
    size: new THREE.Vector2(world.bounds.x1 - world.bounds.x0 + pad * 2, world.bounds.z1 - world.bounds.z0 + pad * 2),
  };
}

function densityTexture(world) {
  const { min, size } = densityDomain(world);
  const nx = 256;
  const nz = Math.round((nx * size.y) / size.x);
  const data = new Uint8Array(nx * nz);
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      data[z * nx + x] = world.density(min.x + (x / nx) * size.x, min.y + (z / nz) * size.y) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// The same swell on the CPU, so anything afloat rides the surface the player sees.
const fract = (v) => v - Math.floor(v);
function hashJs(x, y) {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const dt = px * (px + 45.32) + py * (py + 45.32);
  px += dt;
  py += dt;
  return fract(px * py);
}
function noiseJs(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hashJs(ix, iy);
  const b = hashJs(ix + 1, iy);
  const c = hashJs(ix, iy + 1);
  const d = hashJs(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
}
// amp is what a hull feels; geo is how far the water mesh itself moves (storms only,
// since a flat calm surface stays perfectly clean).
export const waveState = { amp: 0.09, geo: 0 };

export function waveHeight(world, x, z, t, amp = waveState.amp) {
  const qx = x + 3 * noiseJs(x * 0.03 + t * 0.02, z * 0.03 + t * 0.02);
  const qz = z + 3 * noiseJs(x * 0.03 - t * 0.017, z * 0.03 - t * 0.017);
  const y =
    Math.cos(qx * 0.045 + qz * 0.2 - 0.6 * t) * 0.5 +
    Math.sin(qx * -0.09 + qz * 0.23 - 0.702 * t + 1.3) * 0.32 +
    Math.sin(qx * 0.2 + qz * 0.34 - 0.96 * t + 2.1) * 0.16;
  const k = Math.min(1, Math.max(0, (world.shoreDistance(x, z) - 1) / 11));
  return y * amp * k * k * (3 - 2 * k);
}

export function buildWater(world) {
  const geo = new THREE.PlaneGeometry(1, 1, 160, 160);
  const uniforms = {
    ...mistUniforms,
    uSdf: { value: sdfTexture(world) },
    uWaveField: { value: waveFieldTexture(world) },
    uDensity: { value: densityTexture(world) },
    uDensMin: { value: densityDomain(world).min },
    uDensSize: { value: densityDomain(world).size },
    uWorld: { value: world.size },
    uSdfTexels: { value: world.n },
    uSdfMax: { value: CFG.sdfMax },
    uTime: { value: 0 },
    uOrigin: { value: new THREE.Vector2() },
    uScale: { value: 400 },
    uWave: { value: 0 },
    uDeep: { value: new THREE.Color('#3b8590') },
    uMid: { value: new THREE.Color('#3c97a0') },
    uShallow: { value: new THREE.Color('#62b6b6') },
    uFoam: { value: new THREE.Color('#f4f8f7') },
    uReflect: { value: new THREE.Color('#2d6a78') },
    uMirror: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uHull: { value: new THREE.Vector2(4, 1.4) },
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
