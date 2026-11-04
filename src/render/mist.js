// Shared "diorama" fade: everything dissolves into pale sea mist around the focus
// point, so the world always reads as a small model floating in nothing.
import * as THREE from 'three';

export const mistUniforms = {
  uMistColor: { value: new THREE.Color('#dfe0da') },
  uFocus: { value: new THREE.Vector2() },
  uMistNear: { value: 50 },
  uMistFar: { value: 100 },
};

export function withMist(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mistUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMistPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vMistPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vMistPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMistPos;
        uniform vec3 uMistColor;
        uniform vec2 uFocus;
        uniform float uMistNear;
        uniform float uMistFar;`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor,
          smoothstep(uMistNear, uMistFar, distance(vMistPos.xz, uFocus)));
        #include <tonemapping_fragment>`,
      );
  };
  return material;
}
