// The visitor's body: walking on the floors of the Mount at eye height, turning and looking, stopped by walls and by
// anything more than a step high. Input comes from keys, mouse, or touch (see main.js).
import { floorY, blocked, zoneOf } from "./world/places.js";

export const EYE = 1.6;
const STEP = 0.6;
const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; // no head-bob

/** `gateOpen()` says whether the great gate stands open: the Sanctuary is entered only then (and always left). */
export function createWalker({ x = 0, z = -30, yaw = Math.PI / 2, pitch = -0.05 } = {}, { gateOpen = () => true } = {}) {
  const me = { x, z, yaw, pitch, y: floorY(x, z) + EYE, speed: 0 };
  const shut = (nx, nz) => zoneOf(nx, nz) === "heichal" && zoneOf(me.x, me.z) !== "heichal" && !gateOpen();
  const canStand = (nx, nz) => !blocked(nx, nz) && !shut(nx, nz) && floorY(nx, nz) - floorY(me.x, me.z) <= STEP;
  return {
    me,
    /** Advance by dt seconds. `move` is { forward, right } in −1…1; `run` doubles the pace. */
    step(dt, move, run = false) {
      const pace = (run ? 3.2 : 1.6) * dt;
      const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
      const dx = (fx * move.forward - fz * move.right) * pace, dz = (fz * move.forward + fx * move.right) * pace;
      if (dx || dz) {
        if (canStand(me.x + dx, me.z + dz)) { me.x += dx; me.z += dz; }
        else if (canStand(me.x + dx, me.z)) me.x += dx; // slide along walls
        else if (canStand(me.x, me.z + dz)) me.z += dz;
      }
      me.speed = Math.hypot(dx, dz) / Math.max(dt, 1e-6);
      const target = floorY(me.x, me.z) + EYE + (!calm && me.speed > 0.2 ? Math.sin(performance.now() / 160) * 0.03 : 0);
      me.y += (target - me.y) * Math.min(1, dt * 10);
    },
    look(dYaw, dPitch) {
      me.yaw += dYaw;
      me.pitch = Math.max(-1.2, Math.min(1.2, me.pitch + dPitch));
    },
    place(nx, nz, nyaw = me.yaw) { me.x = nx; me.z = nz; me.yaw = nyaw; me.y = floorY(nx, nz) + EYE; },
  };
}
