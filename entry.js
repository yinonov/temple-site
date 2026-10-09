// Chooses what to load: the 3D Mount where WebGL works, a text page of what is going on now where it does not.
const hasWebGL = (() => {
  try {
    const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // give the probe's context back
    return Boolean(gl);
  } catch { return false; }
})();
await import(hasWebGL ? "./main.js" : "./fallback.js");
