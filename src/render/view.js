// Scene orchestration: isometric camera, weather palette, miniature post effect.
import * as THREE from 'three';
import { buildTerrainGeometry, Floes, terrainMaterial } from './terrain.js';
import { buildTown, relightTrees } from './town.js';
import { buildWater, waveState } from './water.js';
import { buildShip, BuoyField, updateShip, makeBoatMaterial } from './ship.js';
import { Flecks, Gulls, Rain, ShipWake, Snow, TownLife, Wake } from './fx.js';
import { box, cyl, merged, place } from './kit.js';
import { hullUniforms, mirrorMaterial, mistUniforms, outlineMaterial, stylize, voxUniforms } from './mist.js';
import { VoxelField } from './voxels.js';

// Three weather moods. They blend continuously from sim weather values.
const MOODS = {
  clear: { mist: '#dbe6e9', deep: '#3b8590', mid: '#3c97a0', shallow: '#66babb', reflect: '#2c6875', sky: '#ffffff', ground: '#c4d3e4', sun: '#fff6e6', ao: '#a2b3cc', sunI: 1.6, skyI: 1.95 },
  overcast: { mist: '#c6d0d4', deep: '#4c7f89', mid: '#558f96', shallow: '#7fb0b0', reflect: '#3f6a74', sky: '#e8edf0', ground: '#b4c1cd', sun: '#eef0ee', ao: '#808fa6', sunI: 0.6, skyI: 2.3 },
  storm: { mist: '#8d9aa0', deep: '#34545f', mid: '#3d5f69', shallow: '#6d8a8e', reflect: '#253b44', sky: '#b4bfc5', ground: '#74838c', sun: '#c7d0d4', ao: '#5f6d82', sunI: 0.35, skyI: 2 },
};
for (const m of Object.values(MOODS)) {
  for (const k of ['mist', 'deep', 'mid', 'shallow', 'reflect', 'sky', 'ground', 'sun', 'ao']) m[k] = new THREE.Color(m[k]);
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
  uniform float uTilt;
  void main() {
    // Tilt-shift: sharp through the middle, softly out of focus at top and bottom.
    float band = smoothstep(0.3, 0.52, abs(vUv.y - 0.5)) * uTilt;
    vec3 col = texture2D(tScene, vUv).rgb;
    if (band > 0.001) {
      vec3 sum = col;
      float r = band * 2.2;
      const int N = 8;
      for (int i = 0; i < N; i++) {
        float a = float(i) / float(N) * 6.28318;
        sum += texture2D(tScene, vUv + vec2(cos(a), sin(a)) * uTexel * r).rgb;
        sum += texture2D(tScene, vUv + vec2(cos(a + 0.4), sin(a + 0.4)) * uTexel * r * 0.5).rgb;
      }
      col = sum / float(1 + N * 2);
    }
    // Cold air lying over the distance, at the top of the frame.
    col = mix(col, uVignette, smoothstep(0.81, 1.025, vUv.y) * 0.415);
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
  return g;
}

export class View {
  constructor(canvas, world) {
    this.world = world;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.scene = new THREE.Scene();
    this.scene.background = mistUniforms.uMistColor.value;

    this.yaw = Math.PI * 0.25;
    this.pitch = 0.62;
    this.zoom = 21;
    this.zoomTarget = 21;
    this.userZoom = 1;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    this.focus = new THREE.Vector3(world.port.x - 3, 0, world.port.z + 22);
    this.lookAhead = new THREE.Vector2();
    this.time = 0;
    this.quality = 'high';
    this.settings = { tiltShift: true, snow: true, outlines: true };
    this.showcase = true; // the title screen's slow orbit around the harbour
    this.width = 1;
    this.height = 1;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 2);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    // Crisp cast shadows on land and ships. The water takes no shadows: it is lit its own way.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(3072, 3072);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 420;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // Light comes from the voxel field: build it from everything that stands.
    this.voxels = new VoxelField(world);
    const town = buildTown(world, this.voxels);
    this.voxels.bake();
    this.voxels.applyTo(voxUniforms);
    relightTrees(town.trees, this.voxels);

    const propMat = stylize(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.outlineMat = outlineMaterial();
    this.mirrorMat = mirrorMaterial();
    const terrainGeos = buildTerrainGeometry(world);
    const groundMat = terrainMaterial();
    for (const g of terrainGeos) {
      const ground = new THREE.Mesh(g, groundMat);
      ground.receiveShadow = true;
      ground.castShadow = true;
      this.scene.add(ground);
    }
    this.outlines = new THREE.Group();
    const chunks = [...town.props, ...town.trees];
    for (const g of chunks) {
      const m = new THREE.Mesh(g, propMat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      this.outlines.add(new THREE.Mesh(g, this.outlineMat));
    }
    this.scene.add(this.outlines);

    // Reflections: the same geometry, flipped below the water.
    this.mirrorScene = new THREE.Scene();
    this.mirrorRoot = new THREE.Group();
    this.mirrorRoot.scale.y = -1;
    for (const g of [...terrainGeos, ...chunks]) this.mirrorRoot.add(new THREE.Mesh(g, this.mirrorMat));
    this.mirrorScene.add(this.mirrorRoot);
    this.mirrorTarget = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });

    const water = buildWater(world);
    this.water = water;
    water.uniforms.uMirror.value = this.mirrorTarget.texture;
    this.scene.add(water.mesh);
    this.floes = new Floes(
      this.scene,
      world,
      stylize(new THREE.MeshLambertMaterial({ vertexColors: true })),
      stylize(
        new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          blending: THREE.CustomBlending,
          blendSrc: THREE.SrcAlphaFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
        }),
      ),
      (x, z, r) => {
        this.flecks.splash(x, z, Math.round(3 + r), 0.9);
        this.onIceBreak?.(r);
      },
    );
    this.ship = buildShip();
    this.scene.add(this.ship);
    this.shipHull = new THREE.Mesh(this.ship.userData.body.geometry, this.outlineMat);
    this.shipHull.matrixAutoUpdate = false;
    this.shipHull.frustumCulled = false;
    this.scene.add(this.shipHull);
    this.shipMirror = new THREE.Mesh(this.ship.userData.body.geometry, this.mirrorMat);
    this.shipMirror.matrixAutoUpdate = false;
    this.shipMirror.frustumCulled = false;
    this.mirrorScene.add(this.shipMirror);

    this.buoys = new BuoyField(this.scene);
    this.flecks = new Flecks(this.scene);
    this.wake = new Wake(this.flecks);
    this.shipWake = new ShipWake(this.scene);
    this.rain = new Rain(this.scene);
    this.snow = new Snow(this.scene);
    this.life = new TownLife(this.scene, stylize(new THREE.MeshLambertMaterial({ vertexColors: true })), town.smokes, world);
    this.gulls = new Gulls(this.scene, stylize(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

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
      uTilt: { value: 1 },
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
    const mirrorScale = this.quality === 'high' ? 0.5 : 0.34;
    this.mirrorTarget.setSize(Math.max(2, Math.floor(pw * mirrorScale)), Math.max(2, Math.floor(ph * mirrorScale)));
    this.water.uniforms.uResolution.value.set(pw, ph);
    hullUniforms.uPixel.value.set((2 * dpr) / pw, (2 * dpr) / ph);
  }

  addYaw(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.003, 0.42, 1.05);
  }

  addZoom(delta) {
    this.userZoom = THREE.MathUtils.clamp(this.userZoom * Math.exp(delta * 0.0012), 0.5, 3.2);
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
    const k = 1 - Math.exp(-dt * (this.showcase ? 0.9 : 1.6));
    const docked = s.ship.docked;
    let fx = shipRoot.position.x + this.lookAhead.x;
    let fz = shipRoot.position.z + this.lookAhead.y;
    const base = docked ? 21 : 31 * (this.seaZoom ?? 1);
    if (this.showcase) {
      this.yaw = Math.PI * 0.25 + Math.sin(t * 0.07) * 0.16;
    }
    this.zoomTarget = (this.showcase ? 23 : base) * (this.showcase ? 1 : this.userZoom);
    this.focus.x += (fx - this.focus.x) * k;
    this.focus.z += (fz - this.focus.z) * k;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 2.5));

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
    mistUniforms.uMistNear.value = reach * 1.05;
    mistUniforms.uMistFar.value = reach * 1.9;

    // Low sun from the left of the frame, so even small things throw a clear shadow.
    // Steps in whole units and fixed extents keep the shadow edges from crawling.
    const sunX = Math.round(this.focus.x);
    const sunZ = Math.round(this.focus.z);
    this.sun.position.set(sunX - 110, 118, sunZ + 74);
    this.sun.target.position.set(sunX, 0, sunZ);
    const wantExt = Math.ceil(reach * 1.3 / 10) * 10;
    const shadowCam = this.sun.shadow.camera;
    if (shadowCam.right !== wantExt) {
      shadowCam.left = -wantExt;
      shadowCam.right = wantExt;
      shadowCam.top = wantExt;
      shadowCam.bottom = -wantExt;
      shadowCam.updateProjectionMatrix();
    }
    this.sun.castShadow = this.quality === 'high' && this.settings.shadows !== false;

    const u = this.water.uniforms;
    u.uTime.value = t;
    // Snapped to the mesh's own grid, so its vertices do not swim through the waves
    // as the camera follows the ship.
    u.uScale.value = reach * 3.4;
    const meshCell = u.uScale.value / 160;
    u.uOrigin.value.set(Math.round(this.focus.x / meshCell) * meshCell, Math.round(this.focus.z / meshCell) * meshCell);
    // The water mesh really moves, a little, and hulls ride that very surface.
    u.uWave.value = 0.1 + w.storm * 0.25;
    waveState.geo = u.uWave.value;
    waveState.amp = u.uWave.value;
    u.uStorm.value = w.storm;
    u.uRain.value = Math.max(w.storm, w.overcast * 0.12);
    u.uHull.value.set(shipRoot.userData.length * 0.54, shipRoot.userData.beam * 0.62);
    u.uShip.value.set(shipRoot.position.x, shipRoot.position.z);
    u.uShipDir.value.set(Math.sin(shipRoot.rotation.y), Math.cos(shipRoot.rotation.y));
    const radarWant = s.radarOn ? 1 : 0;
    u.uRadar.value += (radarWant - u.uRadar.value) * (1 - Math.exp(-dt * 4));
    u.uRadarR.value = game.radarRange;

    this.buoys.update(game, t);
    this.shipWake.update(dt, shipRoot.position.x, shipRoot.position.z, shipRoot.rotation.y, sp, shipRoot.userData.length, shipRoot.userData.beam, game.topSpeed);
    this.floes.update(shipRoot.position.x, shipRoot.position.z, shipRoot.rotation.y, sp, shipRoot.userData.length, shipRoot.userData.beam, dt, t);
    this.gulls.update(t, dt, -2, -6, shipRoot.position.x, shipRoot.position.z);
    this.life.update(t, dt, shipRoot, sp, s.ship.docked, game, this.renderer.domElement.height / (2 * halfH), this.focus);
    this.flecks.update(dt);
    this.rain.update(this.focus.x, this.focus.z, reach, w.storm + w.overcast * 0.08, t);
    this.snow.update(this.focus.x, this.focus.z, reach, this.settings.snow ? Math.max(0, 0.75 - w.storm * 1.5) : 0, t);

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

    // The ship's hull and mirror copies follow it around.
    const body = shipRoot.userData.body;
    shipRoot.updateMatrixWorld(true);
    this.shipHull.geometry = body.geometry;
    this.shipHull.matrix.copy(body.matrixWorld);
    this.shipMirror.geometry = body.geometry;
    this.flip ??= new THREE.Matrix4().makeScale(1, -1, 1);
    this.shipMirror.matrix.multiplyMatrices(this.flip, body.matrixWorld);
    this.outlines.visible = this.settings.outlines;
    this.renderer.shadowMap.autoUpdate = this.sun.castShadow;
    this.shipHull.visible = this.settings.outlines;

    const r = this.renderer;
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.mirrorTarget);
    r.clear();
    r.render(this.mirrorScene, cam);
    r.setClearColor(0x000000, 1);
    if (this.quality === 'high') {
      this.postUniforms.uTilt.value = this.settings.tiltShift ? 1 : 0;
      r.setRenderTarget(this.target);
      r.render(this.scene, cam);
      r.setRenderTarget(null);
      r.render(this.postScene, this.postCam);
    } else {
      r.setRenderTarget(null);
      r.render(this.scene, cam);
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
    blend('mid', u.uMid.value);
    blend('ao', voxUniforms.uAoTint.value);
    blend('reflect', u.uReflect.value);
    blend('sky', this.hemi.color);
    blend('ground', this.hemi.groundColor);
    blend('sun', this.sun.color);
    this.sun.intensity = A.sunI + (B.sunI - A.sunI) * a + (C.sunI - B.sunI) * b;
    this.hemi.intensity = A.skyI + (B.skyI - A.skyI) * a + (C.skyI - B.skyI) * b;
  }
}
