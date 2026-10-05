// WebGL2 feature probe (TASK-6-24, review 3D-19). Pure of Three.js: the UI imports this tiny module first and loads
// three-renderer.js (≈ 750 KB with Three.js) only when it returns true. No side effects beyond one throw-away canvas
// whose context is released immediately.

/**
 * True when a WebGL2 context can be created (Three.js r179 requires WebGL2).
 * @param {{ document?: Document, WebGL2RenderingContext?: unknown }} [env] defaults to the global browser objects;
 *   injectable for tests.
 * @returns {boolean}
 */
export function webglAvailable(env = globalThis) {
  try {
    const doc = env?.document;
    if (!doc || typeof doc.createElement !== "function" || !env.WebGL2RenderingContext) return false;
    const canvas = doc.createElement("canvas");
    const gl = canvas?.getContext?.("webgl2");
    if (!gl) return false;
    gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}
