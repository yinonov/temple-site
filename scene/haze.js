// Aerial haze: three.js's exponential fog thickens with distance only. This swaps its fog chunks for one that also thins
// with height (the courtyard sits in the thick of the air, the wall tops above it), by integrating the density along the
// view ray in closed form. It needs nothing but the fog uniforms three.js already feeds; the fall-off is a constant, and
// the warming toward the sun is done by tinting the fog colour from the camera's heading (world-scene.js).
// Install once, before any material compiles.
import * as THREE from "three";
import { HAZE_FALLOFF } from "./atmosphere.js";

export function installHaze() {
  const chunk = THREE.ShaderChunk;
  chunk.fog_pars_vertex = "#ifdef USE_FOG\n varying float vFogDepth;\n varying float vFogHeight;\n#endif";
  chunk.fog_vertex = "#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogHeight = cameraPosition.y + dot( viewMatrix[ 1 ].xyz, mvPosition.xyz );\n#endif";
  chunk.fog_pars_fragment = `#ifdef USE_FOG
 uniform vec3 fogColor;
 varying float vFogDepth;
 varying float vFogHeight;
 #ifdef FOG_EXP2
  uniform float fogDensity;
 #else
  uniform float fogNear;
  uniform float fogFar;
 #endif
#endif`;
  chunk.fog_fragment = `#ifdef USE_FOG
 #ifdef FOG_EXP2
  // Optical depth of density * exp(-b * height) along the ray from the eye to this fragment.
  float hazeB = ${HAZE_FALLOFF.toFixed(4)};
  float hazeY0 = max( cameraPosition.y, -20.0 ), hazeY1 = max( vFogHeight, -20.0 ), hazeDy = hazeY1 - hazeY0;
  float hazeK = abs( hazeDy ) < 0.05 ? exp( - hazeB * hazeY0 ) : ( exp( - hazeB * hazeY0 ) - exp( - hazeB * hazeY1 ) ) / ( hazeB * hazeDy );
  float fogFactor = 1.0 - exp( - fogDensity * vFogDepth * hazeK );
 #else
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
 #endif
 gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}
