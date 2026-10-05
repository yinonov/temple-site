// Presentation-style materials and environment (TASK-6-56; ADR-004 Decisions 1-2). Browser-only (imports three).
// Everything is procedural: no texture or image is downloaded. Stone variation is world-space value noise in the
// fragment shader (octaves fade out with screen-space derivatives, so distant surfaces never shimmer). The sky is a
// vertical gradient with no sun disc; the ground has a soft radial contact shade (not a cast shadow, no direction).

import * as THREE from "three";
import { FILL_POLYGON_OFFSET, GROUND_POLYGON_OFFSET, PRESENTATION_ENVIRONMENT as ENV } from "./geometry/styles.js";

const NOISE_GLSL = `
varying vec3 sceneWorld;
float sceneHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.11, 0.21, 0.31)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sceneNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sceneHash(i), sceneHash(i + vec3(1,0,0)), f.x), mix(sceneHash(i + vec3(0,1,0)), sceneHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sceneHash(i + vec3(0,0,1)), sceneHash(i + vec3(1,0,1)), f.x), mix(sceneHash(i + vec3(0,1,1)), sceneHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// One octave, faded out when its feature size drops below ~2 pixels.
float sceneOctave(vec3 p, float freq, float px) { return (sceneNoise(p * freq) - 0.5) * (1.0 - smoothstep(0.18, 0.55, px * freq)); }
`;

/** Stone-tone material for one piece kind and basis. `sceneNoiseStrength` uniform is shared (tone variation amount). */
export function presentationFill({ tone, opacity, selected = false, selectedColor = 0x1f5fbf, access = null, accessDim = null, accessTint = null, groundColor = 0xd6d3cc }) {
  const translucent = opacity < 1;
  const material = new THREE.MeshStandardMaterial({
    color: tone, roughness: 0.95, metalness: 0, transparent: translucent, opacity, depthWrite: !translucent, side: THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: FILL_POLYGON_OFFSET.factor, polygonOffsetUnits: FILL_POLYGON_OFFSET.units
  });
  if (access === "allowed" && accessTint) material.color.lerp(new THREE.Color(accessTint.color), accessTint.mix);
  if (accessDim) {
    material.color.lerp(new THREE.Color(groundColor), accessDim.mix);
    material.transparent = true;
    material.opacity = opacity * accessDim.opacity;
    material.depthWrite = false;
  }
  if (selected) {
    material.emissive = new THREE.Color(selectedColor);
    material.emissiveIntensity = 0.35;
  }
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 sceneWorld;")
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
        { vec4 sceneP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          sceneP = instanceMatrix * sceneP;
        #endif
          sceneWorld = (modelMatrix * sceneP).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${NOISE_GLSL}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float scenePx = length(fwidth(sceneWorld));
        float sceneV = (sceneOctave(sceneWorld, 0.02, scenePx) * 0.22 + sceneOctave(sceneWorld, 0.11, scenePx) * 0.3
                     + sceneOctave(sceneWorld, 0.55, scenePx) * 0.22 + sceneOctave(sceneWorld, 2.6, scenePx) * 0.12) * 0.4;
        diffuseColor.rgb *= vec3(1.0 + sceneV, 1.0 + sceneV * 0.92, 1.0 + sceneV * 0.78);`);
  };
  material.customProgramCacheKey = () => "scene3d-presentation-stone";
  return material;
}

/** Ground: warm stone tone with a soft radial contact shade around the scene's footprint, fading into the horizon haze. */
export function createGroundMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNear: { value: new THREE.Color(ENV.groundNear) }, uFar: { value: new THREE.Color(ENV.groundFar) }, uShade: { value: new THREE.Color(ENV.contactShade) },
      uBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uExtent: { value: 1 }
    },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform vec3 uNear; uniform vec3 uFar; uniform vec3 uShade; uniform vec4 uBox; uniform float uExtent; varying vec3 vW;
      void main() {
        vec2 d = abs(vW.xz - uBox.xy) - uBox.zw;
        float outside = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        float contact = exp(-max(outside, 0.0) / (uExtent * 0.07)) * 0.42;
        float haze = smoothstep(uExtent * 0.35, uExtent * 2.6, length(vW.xz - uBox.xy));
        vec3 c = mix(uNear, uFar, haze);
        c = mix(c, uShade, contact * (1.0 - haze));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    polygonOffset: true, polygonOffsetFactor: GROUND_POLYGON_OFFSET.factor, polygonOffsetUnits: GROUND_POLYGON_OFFSET.units
  });
}

/** Sky dome: vertical gradient, no sun disc. Drawn first, ignores depth; follow the camera with `followCamera`. */
export function createSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uZenith: { value: new THREE.Color(ENV.skyZenith) }, uHorizon: { value: new THREE.Color(ENV.skyHorizon) } },
    vertexShader: `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uZenith; uniform vec3 uHorizon; varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.8, h), 0.75));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = "sky";
  mesh.followCamera = (camera) => {
    mesh.position.copy(camera.position);
    mesh.scale.setScalar(Math.max((camera.near + camera.far) / 2, 1));
  };
  return mesh;
}
