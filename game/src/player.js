// Rui Tavares: on-foot movement, entering and leaving the Vela Sprint, arcade driving,
// and the third-person chase camera that follows both.
//
// P1-A controls pass (the P0 playtest failure was a controls problem, not a world
// problem): movement is camera-relative, but the follow camera is now STABLE. It only
// turns toward the heading Rui is actually moving in, at a capped rate, with a small
// deadband — and it never turns at all while he stands still or runs straight. So W
// always walks away from the camera, A/D always strafe the same way, and keyboard-only
// play (human or scripted) can predict where a held key will go. Mouse-drag orbit
// still works on top. Entering the Vela is forgiving: a wide 4.6 m radius around the
// car, the prompt shows as soon as he is inside it, and E just works; leaving the car
// places him at the first clear spot beside it instead of inside a wall or a wheel.

import { collide, clampWorld, forwardOf, headingTo, wrapAngle } from './city.js';
import { moveCar } from './actors.js';

/** How close Rui must be to an enterable car for the prompt and the E press. */
export const ENTER_RADIUS = 4.6;
/** Follow-camera turn cap (rad/s) and the angle it ignores around the target. */
const CAM_TURN_RATE = 1.15;
const CAM_DEADBAND = 0.06;

/** P1-A chase framing (in-vehicle): distance behind the Vela, camera height, look height. */
const CHASE_DIST = 10.2;
const CHASE_CAM_Y = 3.6;
const CHASE_LOOK_Y = 1.3;
/**
 * Pulled-back framing used while ÁGUIA-1 is up (P1-B fix #2, 5★ only): the
 * camera backs off to 12.5 m and its height scales with that distance —
 * 3.6 × 12.5 / 10.2 gives 4.41 m — while the pitch eases to −5°. Together
 * those moves bring the heli, holding 24 m ahead of Rui at 18 m, into the
 * top of the frame. There is deliberately no fixed heli look height: the
 * look height in updatePlayer is worked out from the eased pitch, so the
 * view genuinely tilts upward instead of just sliding its anchor higher.
 */
const HELI_CHASE_DIST = 12.5;
const HELI_CHASE_CAM_Y = 4.41;
const HELI_CHASE_PITCH = -5 * Math.PI / 180;
/** How fast (per second) the 5★ framing blends in and back out — same rate both ways. */
const HELI_CAM_EASE_RATE = 1.9;

/** Aim the camera from a position toward a target point. */
export function setCameraLook(G, px, py, pz, tx, ty, tz) {
  const dx = tx - px, dy = ty - py, dz = tz - pz;
  const len = Math.hypot(dx, dy, dz) || 1;
  G.camera.x = px; G.camera.y = Math.max(0.7, py); G.camera.z = pz;
  G.camera.yaw = Math.atan2(-dx, -dz);
  G.camera.pitch = Math.asin(Math.max(-0.9, Math.min(0.9, dy / len)));
}

function smoothAngle(cur, target, rate, dt) {
  return cur + wrapAngle(target - cur) * Math.min(1, rate * dt);
}

/** Turn `cur` toward `target` by at most maxStep radians (the stable-camera rule). */
function turnToward(cur, target, maxStep) {
  const diff = wrapAngle(target - cur);
  if (Math.abs(diff) <= maxStep) return target;
  return cur + Math.sign(diff) * maxStep;
}

function easeCamera(G, ax, ay, az, tx, ty, tz, dt, rate) {
  const k = Math.min(1, rate * dt);
  setCameraLook(G,
    G.camera.x + (ax - G.camera.x) * k,
    G.camera.y + (ay - G.camera.y) * k,
    G.camera.z + (az - G.camera.z) * k,
    tx, ty, tz);
}

/** The nearest car Rui may enter (only the Vela is enterable), or null outside radius. */
export function nearestEnterable(G) {
  let best = null, bestD = ENTER_RADIUS;
  for (const car of [G.playerCar]) {
    const d = Math.hypot(car.x - G.player.x, car.z - G.player.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

/** First spot beside the car that is clear of buildings and other cars for Rui. */
function findExitSpot(G, car) {
  const [fx, fz] = forwardOf(car.heading);
  const rx = Math.cos(car.heading), rz = Math.sin(car.heading);
  const tries = [
    [car.x - rx * 1.9, car.z - rz * 1.9], // driver's side (the P0 exit side)
    [car.x + rx * 1.9, car.z + rz * 1.9], // passenger side
    [car.x - fx * 2.7, car.z - fz * 2.7], // behind the car
    [car.x + fx * 2.7, car.z + fz * 2.7], // in front of the car
  ];
  for (const [tx, tz] of tries) {
    const [cx, cz] = collide(G.colliders, tx, tz, 0.45);
    if (Math.hypot(cx - tx, cz - tz) > 0.01) continue; // a building would shove him
    let clear = true;
    for (const other of [G.playerCar, ...G.traffic, ...G.policeUnits]) {
      if (other !== car && Math.hypot(other.x - tx, other.z - tz) < 2.2) { clear = false; break; }
    }
    if (clear) return [tx, tz];
  }
  return collide(G.colliders, tries[0][0], tries[0][1], 0.45);
}

/**
 * Advance Rui (and the Vela, when he is in it) by one step. Reads G.interactPressed, the
 * E press main latched for this frame; returns true when it was spent on the car.
 */
export function updatePlayer(G, input, dt) {
  const p = G.player;
  let spent = false;
  G.camYaw += input.takeOrbit();
  // Was Rui already driving when this step began? The exit check below requires it:
  // without the guard, the same E press that enters the car (speed set to 0) would
  // satisfy the exit condition in the very same step and throw him straight back
  // out — a latent P0 bug the scripted playtest never reached far enough to meet.
  const wasInCar = p.mode === 'car';

  if (p.mode === 'foot') {
    const near = nearestEnterable(G);
    G.nearCar = !!near;
    if (G.interactPressed && near) {
      p.mode = 'car';
      near.speed = 0;
      spent = true;
      // Fall through to the driving branch below in this same step, so the first
      // driving input after entering is answered immediately — no dead frames.
    }
  }

  if (p.mode === 'foot') {
    // Movement is relative to the camera's ground facing — anchored. The anchor is
    // the camera yaw at the moment the current key combination was first held, and
    // it does not move while that combination is held. Without the anchor, a held
    // strafe or diagonal curves into a circle: the movement direction is defined by
    // the camera, the follow camera turns toward the movement, and the direction
    // rotates with it (the feedback loop behind the P0 playtest failure). With the
    // anchor, any held combination is a straight line in the world, and the camera
    // eases in behind it and settles. Changing keys (or releasing them) re-anchors.
    const thIn = input.throttle(), stIn = input.steer();
    const sig = thIn * 4 + stIn;
    if (sig !== 0 && (sig !== p.moveSig || !p.moving)) G.moveYaw = G.camYaw;
    p.moveSig = sig;
    p.moving = sig !== 0;
    const cy = sig !== 0 ? G.moveYaw : G.camYaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = -fz, rz = fx;
    let mx = fx * thIn + rx * stIn;
    let mz = fz * thIn + rz * stIn;
    const ml = Math.hypot(mx, mz);
    const running = input.run();
    const speed = ml > 0.01 ? (running ? 6.1 : 3.3) : 0;
    if (ml > 0.01) {
      mx /= ml; mz /= ml;
      p.heading = smoothAngle(p.heading, headingTo(mx, mz), 10, dt);
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      p.walkPhase += dt * (running ? 11 : 7.5);
    }
    p.speed = speed;
    const [nx, nz] = collide(G.colliders, p.x, p.z, 0.45);
    p.x = nx; p.z = nz;
    const [cx, cz] = clampWorld(p.x, p.z);
    p.x = cx; p.z = cz;
    // Chase camera on foot: behind Rui, at shoulder height.
    const back = 6.4;
    const anchorX = p.x + Math.sin(G.camYaw) * back;
    const anchorZ = p.z + Math.cos(G.camYaw) * back;
    easeCamera(G, anchorX, 3.1, anchorZ, p.x, 1.55, p.z, dt, 7);
    // The follow rule: only while Rui actually moves, ease the camera heading toward
    // behind his movement heading, capped and deadbanded. Standing still or running
    // straight, the heading — and therefore every key's meaning — holds exactly.
    if (speed > 0.2) {
      const target = Math.PI - p.heading;
      if (Math.abs(wrapAngle(target - G.camYaw)) > CAM_DEADBAND) {
        G.camYaw = turnToward(G.camYaw, target, CAM_TURN_RATE * dt);
      }
    }
    return spent;
  }

  // Driving the Vela Sprint.
  const car = G.playerCar;
  p.x = car.x; p.z = car.z; p.heading = car.heading;
  if (wasInCar && G.interactPressed && Math.abs(car.speed) < 1.2) {
    p.mode = 'foot';
    const [ex, ez] = findExitSpot(G, car);
    p.x = ex; p.z = ez;
    car.speed = 0;
    spent = true;
    return spent;
  }
  const th = input.throttle();
  const steer = input.steer();
  if (th > 0) car.speed += 10.5 * dt * (1 - Math.max(0, car.speed) / 27);
  else if (th < 0) {
    if (car.speed > 0.4) car.speed -= 22 * dt;
    else car.speed = Math.max(-8.5, car.speed - 6.5 * dt);
  }
  car.speed -= car.speed * 0.32 * dt;
  if (th === 0 && Math.abs(car.speed) < 0.25) car.speed = 0;
  // Steering: full bite at cruising speed (the P0 feel), but at least half bite as
  // soon as the car is rolling, so it can still be threaded through Rua das Flores'
  // narrow lane and out of parking spots at a crawl. P0 scaled bite purely with
  // speed/7, which made low-speed manoeuvring nearly impossible.
  const spd = Math.abs(car.speed);
  const sf = spd < 0.05 ? 0 : Math.sign(car.speed) * (0.5 + 0.5 * Math.min(1, spd / 7));
  if (spd > 0.05) car.heading = wrapAngle(car.heading + steer * 1.8 * sf * dt);
  moveCar(car, dt);
  p.speed = Math.abs(car.speed);
  const [fx, fz] = forwardOf(car.heading);
  // 5★ chase-camera ease (P1-B fix #2). This branch is in-vehicle only; the
  // on-foot camera further up is not touched. Whenever ÁGUIA-1 is airborne —
  // heli state 'active', which covers its climb as well as time on station —
  // blend the framing from the P1-A values toward the HELI_CHASE_* values,
  // and blend it back when the heli stands down. G.heliCamEase holds the
  // 0..1 blend; it moves at HELI_CAM_EASE_RATE in either direction so
  // neither transition snaps, and it snaps onto the exact endpoint once it
  // gets within 0.002, which is what restores the P1-A framing bit-for-bit
  // at ease 0.
  if (G.heliCamEase === undefined) G.heliCamEase = 0;
  const easeTarget = G.heli && G.heli.state === 'active' ? 1 : 0;
  G.heliCamEase += (easeTarget - G.heliCamEase) * Math.min(1, HELI_CAM_EASE_RATE * dt);
  if (Math.abs(easeTarget - G.heliCamEase) < 0.002) G.heliCamEase = easeTarget;
  const ce = G.heliCamEase;
  const camDist = CHASE_DIST + (HELI_CHASE_DIST - CHASE_DIST) * ce;
  const camY = CHASE_CAM_Y + (HELI_CHASE_CAM_Y - CHASE_CAM_Y) * ce;
  // Derive the look height from the eased pitch rather than easing the look
  // height itself. Pitch runs from the P1-A angle up to HELI_CHASE_PITCH;
  // raising only the camera anchor would steepen the view, whereas this
  // tilts it up so the heli enters the top of the frame.
  const pitch0 = Math.atan2(CHASE_LOOK_Y - CHASE_CAM_Y, CHASE_DIST);
  const camPitch = pitch0 + (HELI_CHASE_PITCH - pitch0) * ce;
  const lookY = ce === 0 ? CHASE_LOOK_Y : camY + camDist * Math.tan(camPitch);
  easeCamera(G, car.x - fx * camDist, camY, car.z - fz * camDist, car.x, lookY, car.z, dt, 5.2);
  G.camYaw = Math.PI - car.heading;
  return spent;
}
