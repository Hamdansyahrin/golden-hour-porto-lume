// Rui Tavares: on-foot movement, entering and leaving the Vela Sprint, arcade driving,
// and the third-person chase camera that follows both. The camera eases toward its anchor
// instead of snapping and never dips under the ground, so staged screenshots taken
// through it still read as gameplay.

import { collide, clampWorld, forwardOf, headingTo, wrapAngle } from './city.js';
import { moveCar } from './actors.js';

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

function easeCamera(G, ax, ay, az, tx, ty, tz, dt, rate) {
  const k = Math.min(1, rate * dt);
  setCameraLook(G,
    G.camera.x + (ax - G.camera.x) * k,
    G.camera.y + (ay - G.camera.y) * k,
    G.camera.z + (az - G.camera.z) * k,
    tx, ty, tz);
}

/**
 * Advance Rui (and the Vela, when he is in it) by one step. Reads G.interactPressed, the
 * E press main latched for this frame; returns true when it was spent on the car.
 */
export function updatePlayer(G, input, dt) {
  const p = G.player;
  let spent = false;
  G.camYaw += input.takeOrbit();

  if (p.mode === 'foot') {
    const car = G.playerCar;
    const nearCar = Math.hypot(car.x - p.x, car.z - p.z) < 3.2;
    G.nearCar = nearCar;
    if (G.interactPressed && nearCar) {
      p.mode = 'car';
      car.speed = 0;
      spent = true;
    }
  }

  if (p.mode === 'foot') {
    // Movement is relative to the camera's ground facing.
    const cy = G.camYaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = -fz, rz = fx;
    let mx = fx * input.throttle() + rx * input.steer();
    let mz = fz * input.throttle() + rz * input.steer();
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
    // When Rui moves, the camera slowly settles in behind his heading.
    if (speed > 0.2) G.camYaw = smoothAngle(G.camYaw, Math.PI - p.heading, 1.7, dt);
    return spent;
  }

  // Driving the Vela Sprint.
  const car = G.playerCar;
  p.x = car.x; p.z = car.z; p.heading = car.heading;
  if (G.interactPressed && Math.abs(car.speed) < 1.2) {
    p.mode = 'foot';
    p.x = car.x - Math.cos(car.heading) * 1.7;
    p.z = car.z - Math.sin(car.heading) * 1.7;
    const [nx, nz] = collide(G.colliders, p.x, p.z, 0.45);
    p.x = nx; p.z = nz;
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
  const sf = Math.max(-1, Math.min(1, car.speed / 7));
  if (Math.abs(car.speed) > 0.05) car.heading = wrapAngle(car.heading + steer * 1.75 * sf * dt);
  moveCar(car, dt);
  p.speed = Math.abs(car.speed);
  const [fx, fz] = forwardOf(car.heading);
  easeCamera(G, car.x - fx * 10.2, 3.6, car.z - fz * 10.2, car.x, 1.3, car.z, dt, 5.2);
  G.camYaw = Math.PI - car.heading;
  return spent;
}
