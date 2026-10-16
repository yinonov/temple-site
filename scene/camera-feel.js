// How the visitor's eyes move: a critically damped follower of the walker's true position and heading, a small vertical bob
// tied to the distance walked, and a fixed step so uneven frames do not show as judder. The walker (controls.js) stays the
// truth: collision, sound, notes and tests read `walker.me`; only the camera takes the smoothed `eye`. Pure and
// deterministic: the same inputs at the same frame times give the same eye (no clock, no random).

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const KEYS = ["x", "y", "z", "yaw", "pitch"];

/**
 * `calm` is `prefers-reduced-motion` (no bob, and a shorter follow so the view never trails the visitor's own input).
 * `tau` is the follower's time constant in seconds (about 90 to 140 ms); `dt` the fixed step; `maxSteps` bounds the work a
 * long frame can cause (the rest of that frame's time is dropped, a stall never replays).
 */
export function createCameraFeel({ calm = false, tau = 0.11, dt = 1 / 120, maxSteps = 12, stride = 1.6, bob = 0.03, snapDistance = 6 } = {}) {
  const w = 1 / (calm ? Math.min(tau, 0.06) : tau); // natural frequency of the critically damped spring
  const cur = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, prev = { ...cur }, vel = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const eye = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  let acc = 0, started = false, last = null, walked = 0, bobNow = 0, bobPrev = 0, amp = 0, ampVel = 0;
  const target = { ...cur };

  function reset(t) {
    for (const k of KEYS) { cur[k] = prev[k] = target[k] = t[k]; vel[k] = 0; eye[k] = t[k]; }
    last = [t.x, t.z]; acc = 0; walked = 0; bobNow = bobPrev = 0; amp = ampVel = 0; started = true;
  }

  function fixedStep(moving) {
    for (const k of KEYS) {
      prev[k] = cur[k];
      vel[k] += (w * w * (target[k] - cur[k]) - 2 * w * vel[k]) * dt;
      cur[k] += vel[k] * dt;
    }
    // The bob's strength follows whether the visitor is walking, through the same kind of spring, so it fades rather than cuts.
    const want = calm || !moving ? 0 : 1;
    ampVel += (w * w * 0.6 * (want - amp) - 2 * w * 0.8 * ampVel) * dt;
    amp = Math.max(0, amp + ampVel * dt);
    bobPrev = bobNow;
    bobNow = calm ? 0 : Math.sin((walked / stride) * TAU) * bob * Math.min(1, amp);
  }

  return {
    eye,
    /** Put the eye exactly on `t` (arrival, a placed visitor, the end of a flight). */
    snap: reset,
    /** Advance by `frameDt` seconds toward `t` ({ x, y, z, yaw, pitch }, the walker's own); `eye` is then current. */
    step(frameDt, t) {
      if (!started || Math.hypot(t.x - cur.x, t.z - cur.z) > snapDistance) reset(t);
      const moved = Math.hypot(t.x - last[0], t.z - last[1]);
      last = [t.x, t.z];
      walked += moved;
      for (const k of ["x", "y", "z", "pitch"]) target[k] = t[k];
      target.yaw = cur.yaw + wrap(t.yaw - cur.yaw); // the short way round, never a spin across ±π
      const moving = moved / Math.max(frameDt, 1e-6) > 0.25;
      acc += Math.min(frameDt, maxSteps * dt);
      while (acc >= dt) { fixedStep(moving); acc -= dt; }
      const a = acc / dt; // the rest of a step: draw between the last two, so an uneven frame does not stutter
      for (const k of KEYS) eye[k] = prev[k] + (cur[k] - prev[k]) * a;
      eye.y += bobPrev + (bobNow - bobPrev) * a;
      return eye;
    },
  };
}
