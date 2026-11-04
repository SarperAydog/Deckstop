// The shared look. Every lit surface in the world goes through stylize():
//  - soft ambient occlusion read from a low-res voxel volume, tinted cold blue,
//    the way Bad North gets its soft gradients without any sharp cast shadows
//  - a pale haze that dissolves the far edges of the world
import * as THREE from 'three';

export const mistUniforms = {
  uMistColor: { value: new THREE.Color('#dfe7ea') },
  uFocus: { value: new THREE.Vector2() },
  uMistNear: { value: 50 },
  uMistFar: { value: 100 },
  uMistAmount: { value: 0.67 },
};

export const voxUniforms = {
  uVox: { value: null },
  uVoxMin: { value: new THREE.Vector3() },
  uVoxSize: { value: new THREE.Vector3(1, 1, 1) },
  uAoTint: { value: new THREE.Color('#7f93b4') },
};

const VERT_HEAD = /* glsl */ `
  varying vec3 vMistPos;
  varying vec3 vWorldN;
`;
const VERT_BODY = /* glsl */ `
  #ifdef USE_INSTANCING
    vMistPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    vWorldN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
  #else
    vMistPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vWorldN = normalize(mat3(modelMatrix) * objectNormal);
  #endif
`;
const FRAG_HEAD = /* glsl */ `
  precision highp sampler3D;
  varying vec3 vMistPos;
  varying vec3 vWorldN;
  uniform vec3 uMistColor;
  uniform vec2 uFocus;
  uniform float uMistNear;
  uniform float uMistFar;
  uniform float uMistAmount;
  uniform sampler3D uVox;
  uniform vec3 uVoxMin;
  uniform vec3 uVoxSize;
  uniform vec3 uAoTint;
`;
const FRAG_BODY = /* glsl */ `
  {
    vec3 voxP = (vMistPos + vWorldN * 0.8 - uVoxMin) / uVoxSize;
    float ao = texture(uVox, voxP.xzy).r;
    ao = smoothstep(0.08, 0.92, ao);
    gl_FragColor.rgb *= mix(uAoTint, vec3(1.0), ao);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor,
      smoothstep(uMistNear, uMistFar, distance(vMistPos.xz, uFocus)) * uMistAmount);
  }
`;

// extra: optional { vert, vertBody, frag, fragColor, uniforms } hooks for custom surfaces.
export function stylize(material, extra = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mistUniforms, voxUniforms, extra.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}\n${extra.vert ?? ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}\n${extra.vertBody ?? ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}\n${extra.frag ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${extra.fragColor ?? ''}`)
      .replace('#include <tonemapping_fragment>', `${FRAG_BODY}\n#include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => `stylize:${extra.key ?? 'base'}`;
  return material;
}

// Old name, used by small props.
export const withMist = stylize;

// Inverted hull: the mesh again, inside out, pushed out one screen pixel in a darker
// shade of its own colour. Nearby objects merge into one crisp silhouette.
const hullVert = /* glsl */ `
  attribute vec3 color;
  uniform vec2 uPixel;
  varying vec3 vC;
  varying vec3 vP;
  void main() {
    vC = color;
    #ifdef USE_INSTANCING
      mat4 m = modelMatrix * instanceMatrix;
    #else
      mat4 m = modelMatrix;
    #endif
    vec4 w = m * vec4(position, 1.0);
    vP = w.xyz;
    vec4 clip = projectionMatrix * viewMatrix * w;
    vec3 vn = mat3(viewMatrix) * mat3(m) * normal;
    vec2 dir = normalize(vn.xy + 1e-5);
    clip.xy += dir * uPixel * clip.w;
    clip.z += 0.0004 * clip.w;
    gl_Position = clip;
  }
`;
const hullFrag = /* glsl */ `
  uniform vec3 uMistColor;
  uniform vec2 uFocus;
  uniform float uMistNear;
  uniform float uMistFar;
  uniform float uMistAmount;
  uniform vec3 uInk;
  varying vec3 vC;
  varying vec3 vP;
  void main() {
    vec3 c = mix(vC * 0.5, uInk, 0.42);
    c = mix(c, uMistColor, smoothstep(uMistNear, uMistFar, distance(vP.xz, uFocus)) * uMistAmount);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

export const hullUniforms = {
  uPixel: { value: new THREE.Vector2(0.002, 0.002) },
  uInk: { value: new THREE.Color('#33475a') },
};

export function outlineMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: hullVert,
    fragmentShader: hullFrag,
    uniforms: { ...mistUniforms, ...hullUniforms },
    side: THREE.BackSide,
  });
}

// Reflections: the same meshes flipped under the water plane, drawn to an offscreen
// target in a nearly uniform colour. The water shader then ripples that image.
const mirrorVert = /* glsl */ `
  attribute vec3 color;
  varying vec3 vC;
  varying float vY;
  void main() {
    vC = color;
    #ifdef USE_INSTANCING
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    #else
      vec4 w = modelMatrix * vec4(position, 1.0);
    #endif
    vY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const mirrorFrag = /* glsl */ `
  varying vec3 vC;
  varying float vY;
  void main() {
    if (vY > 0.0) discard;
    gl_FragColor = vec4(vC, exp(vY * 0.075));
  }
`;

export function mirrorMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: mirrorVert, fragmentShader: mirrorFrag, side: THREE.DoubleSide });
}
