// Scene orchestration: isometric camera, weather palette, miniature post effect.
import * as THREE from 'three';
import { buildFloes, buildWorldMeshes } from './terrain.js';
import { buildWater } from './water.js';
import { buildShip, BuoyField, updateShip, makeBoatMaterial } from './ship.js';
import { Flecks, Rain, Snow, Wake } from './fx.js';
import { box, cyl, merged, place } from './kit.js';
import { mistUniforms } from './mist.js';

// Three weather moods. They blend continuously from sim weather values.
const MOODS = {
  clear: { mist: '#e0e1da', deep: '#6d9aa5', shallow: '#c6dfdb', reflect: '#49727e', sky: '#f7f3e8', ground: '#a9bfc0', sun: '#fff1da', sunI: 2.2, skyI: 1.7 },
  overcast: { mist: '#c8cdcb', deep: '#7c9a9f', shallow: '#c3d3d0', reflect: '#5c7880', sky: '#e2e6e4', ground: '#a2b0b2', sun: '#eef0ee', sunI: 1.25, skyI: 2.2 },
  storm: { mist: '#8d989c', deep: '#465f6a', shallow: '#8ea3a6', reflect: '#2f434c', sky: '#a9b4b8', ground: '#6a7a80', sun: '#c7d0d4', sunI: 0.8, skyI: 1.9 },
};
for (const m of Object.values(MOODS)) {
  for (const k of ['mist', 'deep', 'shallow', 'reflect', 'sky', 'ground', 'sun']) m[k] = new THREE.Color(m[k]);
}

const POST_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const POST_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uTexel;
  uniform vec3 uVignette;
  varying vec2 vUv;
  void main() {
    // Tilt-shift: sharp across the middle band, softly out of focus above and below.
    float band = smoothstep(0.26, 0.5, abs(vUv.y - 0.52));
    vec3 col = texture2D(tScene, vUv).rgb;
    if (band > 0.001) {
      vec3 sum = col;
      float r = band * 2.6;
      const int N = 8;
      for (int i = 0; i < N; i++) {
        float a = float(i) / float(N) * 6.28318;
        sum += texture2D(tScene, vUv + vec2(cos(a), sin(a)) * uTexel * r).rgb;
        sum += texture2D(tScene, vUv + vec2(cos(a + 0.4), sin(a + 0.4)) * uTexel * r * 0.5).rgb;
      }
      col = sum / float(1 + N * 2);
    }
    float v = smoothstep(0.42, 0.95, length((vUv - 0.5) * vec2(1.05, 1.15)));
    col = mix(col, uVignette, v * 0.6);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function buildTug() {
  const mat = makeBoatMaterial();
  const g = new THREE.Mesh(
    merged([
      place(box(1.6, 0.8, 3.6, '#2f4f6a'), 0, 0.3, 0),
      place(box(1.1, 0.8, 1.3, '#f3eee3'), 0, 1.1, -0.3),
      place(box(1.22, 0.1, 1.42, '#e0a93c'), 0, 1.55, -0.3),
      place(cyl(0.15, 0.17, 0.6, 7, '#2f2b35'), 0, 1.85, -0.7),
    ]),
    mat,
  );
  g.castShadow = true;
  return g;
}

export class View {
  constructor(canvas, world) {
    this.world = world;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = mistUniforms.uMistColor.value;

    this.yaw = Math.PI * 0.25;
    this.pitch = 0.62;
    this.zoom = 38;
    this.zoomTarget = 38;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    this.focus = new THREE.Vector3(world.port.x - 3, 0, world.port.z - 7);
    this.lookAhead = new THREE.Vector2();
    this.time = 0;
    this.quality = 'high';
    this.width = 1;
    this.height = 1;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 5;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.scene.add(buildWorldMeshes(world));
    this.scene.add(buildFloes(world));
    const water = buildWater(world);
    this.water = water;
    this.scene.add(water.mesh);
    this.ship = buildShip();
    this.scene.add(this.ship);
    this.buoys = new BuoyField(this.scene);
    this.flecks = new Flecks(this.scene);
    this.wake = new Wake(this.flecks);
    this.rain = new Rain(this.scene);
    this.snow = new Snow(this.scene);

    this.tug = buildTug();
    this.tug.visible = false;
    this.scene.add(this.tug);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.towLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#2a2a30' }));
    this.towLine.frustumCulled = false;
    this.towLine.visible = false;
    this.scene.add(this.towLine);

    this.setupPost();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmpV = new THREE.Vector3();
  }

  setupPost() {
    this.target = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType });
    this.postUniforms = {
      tScene: { value: this.target.texture },
      uTexel: { value: new THREE.Vector2(1 / 4, 1 / 4) },
      uVignette: { value: mistUniforms.uMistColor.value },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: this.postUniforms,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(quad);
    this.postCam = new THREE.Camera();
  }

  setQuality(q) {
    this.quality = q;
    this.sun.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.applySize();
  }

  resize(w, h) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.applySize();
  }

  applySize() {
    const dpr = this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.25);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    const pw = Math.floor(this.width * dpr);
    const ph = Math.floor(this.height * dpr);
    this.target.setSize(pw, ph);
    this.postUniforms.uTexel.value.set(1 / pw, 1 / ph);
  }

  addYaw(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.003, 0.42, 1.05);
  }

  addZoom(delta) {
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * Math.exp(delta * 0.0012), 16, 90);
  }

  // Screen pixels to a point on the sea surface.
  pick(px, py) {
    const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
  }

  // World point to screen pixels: drives the DOM labels over cages.
  project(x, y, z) {
    this.tmpV.set(x, y, z).project(this.camera);
    return { x: (this.tmpV.x + 1) * 0.5 * this.width, y: (1 - this.tmpV.y) * 0.5 * this.height };
  }

  handleEvent(e) {
    if (e.type === 'cageDropped') this.flecks.splash(e.x, e.z);
    if (e.type === 'cageCollected') this.flecks.splash(e.x, e.z, 34, 3.8);
  }

  frame(game, dt) {
    this.time += dt;
    const t = this.time;
    const s = game.s;
    const w = s.weather;

    this.applyWeather(w);

    // Camera follows the ship loosely, peeking ahead of where it is going.
    const shipRoot = this.ship;
    updateShip(shipRoot, game, t, dt);
    const sp = s.ship.speed;
    const lookK = 1 - Math.exp(-dt * 0.9);
    this.lookAhead.x += (Math.sin(s.ship.heading) * sp * 0.9 - this.lookAhead.x) * lookK;
    this.lookAhead.y += (Math.cos(s.ship.heading) * sp * 0.9 - this.lookAhead.y) * lookK;
    const k = 1 - Math.exp(-dt * 2.2);
    const docked = s.ship.docked;
    const fx = shipRoot.position.x + this.lookAhead.x - (docked ? 3 : 0);
    const fz = shipRoot.position.z + this.lookAhead.y - (docked ? 7 : 0);
    this.focus.x += (fx - this.focus.x) * k;
    this.focus.z += (fz - this.focus.z) * k;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 6));

    const aspect = this.width / this.height;
    const halfH = this.zoom * Math.max(1, 1.5 / aspect); // narrow windows pull back to keep the framing
    const halfW = halfH * aspect;
    const cam = this.camera;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    const dist = 320;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * dist,
      Math.sin(this.pitch) * dist,
      this.focus.z + Math.cos(this.yaw) * cp * dist,
    );
    cam.lookAt(this.focus);
    cam.updateProjectionMatrix();

    // Mist radius scales with zoom so the diorama framing holds at any distance.
    const reach = Math.max(halfW, halfH / Math.sin(this.pitch));
    mistUniforms.uFocus.value.set(this.focus.x, this.focus.z);
    mistUniforms.uMistNear.value = reach * 0.6;
    mistUniforms.uMistFar.value = reach * 1.2;

    const sunDist = 180;
    this.sun.position.set(this.focus.x - sunDist * 0.5, sunDist, this.focus.z + sunDist * 0.28);
    this.sun.target.position.set(this.focus.x, 0, this.focus.z);
    const sc = this.sun.shadow.camera;
    const ext = Math.min(120, reach * 1.25);
    if (sc.right !== ext) {
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.near = 10;
      sc.far = 480;
      sc.updateProjectionMatrix();
    }

    const u = this.water.uniforms;
    u.uTime.value = t;
    u.uOrigin.value.set(this.focus.x, this.focus.z);
    u.uScale.value = reach * 3.4;
    u.uWave.value = w.storm * 0.55;
    u.uStorm.value = w.storm;
    u.uRain.value = Math.max(w.storm, w.overcast * 0.12);
    u.uViewDir.value.set(-Math.sin(this.yaw), -Math.cos(this.yaw));
    u.uShip.value.set(shipRoot.position.x, shipRoot.position.z);
    u.uShipDir.value.set(Math.sin(shipRoot.rotation.y), Math.cos(shipRoot.rotation.y));
    const radarWant = s.radarOn ? 1 : 0;
    u.uRadar.value += (radarWant - u.uRadar.value) * (1 - Math.exp(-dt * 4));
    u.uRadarR.value = game.radarRange;

    this.buoys.update(game, t);
    this.wake.update(shipRoot.position.x, shipRoot.position.z, shipRoot.rotation.y, sp, dt);
    this.flecks.update(dt);
    this.rain.update(this.focus.x, this.focus.z, reach, w.storm + w.overcast * 0.08, t);
    this.snow.update(this.focus.x, this.focus.z, reach, Math.max(0, 0.75 - w.storm * 1.5), t);

    // Tow ship leads the way when called.
    this.tug.visible = s.towing;
    this.towLine.visible = s.towing;
    if (s.towing) {
      const h = shipRoot.rotation.y;
      const tx = shipRoot.position.x + Math.sin(h) * 11;
      const tz = shipRoot.position.z + Math.cos(h) * 11;
      this.tug.position.set(tx, 0.1, tz);
      this.tug.rotation.y = h;
      const lp = this.towLine.geometry.attributes.position;
      lp.setXYZ(0, tx - Math.sin(h) * 1.8, 0.8, tz - Math.cos(h) * 1.8);
      lp.setXYZ(1, shipRoot.position.x + Math.sin(h) * 3, 1, shipRoot.position.z + Math.cos(h) * 3);
      lp.needsUpdate = true;
      this.wake.update(tx, tz, h, sp, dt);
    }

    if (this.quality === 'high') {
      this.renderer.setRenderTarget(this.target);
      this.renderer.render(this.scene, cam);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.postScene, this.postCam);
    } else {
      this.renderer.render(this.scene, cam);
    }
  }

  applyWeather(w) {
    const A = MOODS.clear;
    const B = MOODS.overcast;
    const C = MOODS.storm;
    const a = Math.min(1, w.overcast);
    const b = w.storm;
    const blend = (key, out) => out.copy(A[key]).lerp(B[key], a).lerp(C[key], b);
    blend('mist', mistUniforms.uMistColor.value);
    const u = this.water.uniforms;
    blend('deep', u.uDeep.value);
    blend('shallow', u.uShallow.value);
    blend('reflect', u.uReflect.value);
    blend('sky', this.hemi.color);
    blend('ground', this.hemi.groundColor);
    blend('sun', this.sun.color);
    this.sun.intensity = A.sunI + (B.sunI - A.sunI) * a + (C.sunI - B.sunI) * b;
    this.hemi.intensity = A.skyI + (B.skyI - A.skyI) * a + (C.skyI - B.skyI) * b;
  }
}
