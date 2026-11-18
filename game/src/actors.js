// Porto Lume's actors: how cars and people are drawn (procedural low-poly meshes rebuilt
// each frame into the dynamic buffer) and how the simple traffic, the PMPL patrol/pursuit
// car and the sidewalk pedestrians behave. Rui himself is controlled from player.js; this
// module only paints him.

import { WORLD, collide, clampWorld, forwardOf, headingTo, wrapAngle } from './city.js';

const DARK = [0.1, 0.1, 0.12];
const GLASS = [0.13, 0.2, 0.3];
const SKIN = [[0.85, 0.62, 0.45], [0.62, 0.42, 0.3], [0.95, 0.75, 0.55], [0.5, 0.34, 0.24]];
export const CAR_MODELS = [
  { name: 'Vela Sprint', marque: 'Vela' },
  { name: 'Ondina', marque: 'Lume Motors' },
  { name: 'Furgão Brisa', marque: 'Brisa' },
  { name: 'Táxi Lume', marque: 'Lume Motors' },
];

// ------------------------------------------------------------------ painting

/** Paint one car. `flash` picks which half of the police light bar glows. */
export function paintCar(b, car, flash) {
  const { x, z, heading: h } = car;
  b.blob(x, z, 2.6);
  const body = car.body, cabin = car.cabin ?? GLASS;
  if (car.van) {
    b.box(x, 0.95, z, 1.9, 1.5, 4.4, h, body);
    b.box(x, 0.75, z + 0, 1.86, 0.5, 4.44, h, body, { shade: 0.85 });
  } else {
    b.box(x, 0.58, z, 1.8, 0.62, 4.3, h, body);
    b.box(x, 0.5, z, 1.86, 0.3, 4.36, h, body, { shade: 0.8 });
    const back = -Math.sin(h) * -0.25, backZ = Math.cos(h) * -0.25;
    b.box(x + back, 1.08, z + backZ, 1.58, 0.55, 1.9, h, cabin);
  }
  // Wheels.
  const fx = -Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = Math.sin(h);
  for (const [sx, sz] of [[-0.88, 1.35], [0.88, 1.35], [-0.88, -1.35], [0.88, -1.35]]) {
    b.box(x + rx * sx + fx * sz, 0.33, z + rz * sx + fz * sz, 0.3, 0.66, 0.66, h, DARK);
  }
  // Lights: warm headlights at the nose (+forward), red at the tail.
  for (const s of [-0.58, 0.58]) {
    b.box(x + rx * s + fx * 2.16, 0.62, z + rz * s + fz * 2.16, 0.42, 0.2, 0.1, h, [1, 0.85, 0.5], { emissive: true });
    b.box(x + rx * s - fx * 2.16, 0.66, z + rz * s - fz * 2.16, 0.42, 0.18, 0.1, h, [0.9, 0.15, 0.1], { emissive: true });
  }
  if (car.kind === 'police') {
    b.box(x, 0.6, z, 1.84, 0.34, 4.34, h, [0.2, 0.35, 0.85]); // PMPL blue band
    const lx = x - fx * 0.25, lz = z - fz * 0.25;
    b.box(lx, 1.48, lz, 1.1, 0.16, 0.5, h, DARK);
    b.box(lx + rx * -0.3, 1.5, lz + rz * -0.3, 0.45, 0.2, 0.44, h, flash ? [1, 0.1, 0.1] : [0.4, 0.05, 0.05], { emissive: true });
    b.box(lx + rx * 0.3, 1.5, lz + rz * 0.3, 0.45, 0.2, 0.44, h, flash ? [0.1, 0.2, 0.5] : [0.2, 0.4, 1], { emissive: true });
  }
  if (car.taxi) b.box(x, 1.42, z, 0.9, 0.22, 0.4, h, [1, 0.8, 0.3], { emissive: true });
}

/** Paint one person: legs swing with walkPhase, arms up when fleeing. */
export function paintPerson(b, p) {
  const { x, z, heading: h } = p;
  b.blob(x, z, 0.55);
  const fx = -Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = Math.sin(h);
  const swing = Math.sin(p.walkPhase) * 0.22;
  const flee = p.state === 'flee';
  for (const s of [-1, 1]) {
    const off = s * swing * (flee ? 1.5 : 1);
    b.box(x + rx * s * 0.11 + fx * off, 0.38, z + rz * s * 0.11 + fz * off, 0.17, 0.76, 0.19, h, p.trousers);
  }
  b.box(x, 1.06, z, 0.52, 0.62, 0.3, h, p.top);
  for (const s of [-1, 1]) {
    const ay = flee ? 1.78 : 1.05;
    const aOff = flee ? 0.1 : Math.sin(p.walkPhase + (s > 0 ? Math.PI : 0)) * 0.14;
    b.box(x + rx * s * 0.36 + fx * aOff, ay, z + rz * s * 0.36 + fz * aOff, 0.13, 0.55, 0.15, h, p.top, { shade: 0.85 });
  }
  b.box(x, 1.58, z, 0.34, 0.36, 0.34, h, p.skin);
  b.box(x, 1.79, z, 0.37, 0.09, 0.37, h, p.hair);
}

/** A floating gold marker over a world point: the mission beacon, visible across town. */
export function paintMarker(b, x, z, t) {
  const y = 3.4 + Math.sin(t * 2.2) * 0.35;
  b.box(x, y, z, 0.55, 0.55, 0.55, t * 1.4, [1, 0.75, 0.25], { emissive: true });
  b.box(x, y - 1.1, z, 0.16, 1.4, 0.16, 0, [1, 0.75, 0.25], { emissive: true });
}

// ------------------------------------------------------------------ traffic

export const BOULEVARD_LOOP = [
  [-86, 3.6], [86, 3.6], [90, 0], [86, -3.6], [-86, -3.6], [-90, 0],
];
export const SIDE_LOOP = [
  [17.6, 34], [17.6, -52], [20, -56], [22.4, -52], [22.4, 34], [20, 38],
];

function steerToward(car, tx, tz, dt, turnRate) {
  const want = headingTo(tx - car.x, tz - car.z);
  const diff = wrapAngle(want - car.heading);
  const turn = Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
  car.heading = wrapAngle(car.heading + turn);
  return Math.abs(diff);
}

function driveAlong(car, dt, cruise) {
  const [tx, tz] = car.route[car.wp];
  const dist = Math.hypot(tx - car.x, tz - car.z);
  if (dist < 4) { car.wp = (car.wp + 1) % car.route.length; return; }
  const diff = steerToward(car, tx, tz, dt, 1.6);
  let target = cruise * Math.max(0.35, 1 - diff * 0.55);
  // Crude car-following: ease off when something is just ahead.
  for (const other of car.neighbours) {
    if (other === car) continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    const ahead = dx * -Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = Math.abs(dx * Math.cos(car.heading) + dz * Math.sin(car.heading));
    const d = Math.hypot(dx, dz);
    if (ahead > 0 && side < 2.2 && d < 8) target = Math.min(target, Math.max(0, (d - 4.5) * 1.6));
  }
  car.speed += Math.max(-14 * dt, Math.min(7 * dt, target - car.speed));
  moveCar(car, dt);
}

export function moveCar(car, dt) {
  const [fx, fz] = forwardOf(car.heading);
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;
  const [cx, cz] = clampWorld(car.x, car.z);
  car.x = cx; car.z = cz;
}

export function updateTraffic(G, dt) {
  for (const car of G.traffic) driveAlong(car, dt, car.cruise);
}

/** Resolve car-vs-car and car-vs-building bumps; flags hard hits by the player's car. */
export function collideCars(G, dt) {
  const all = [G.playerCar, ...G.traffic, G.police];
  for (const car of all) {
    const [nx, nz] = collide(G.colliders, car.x, car.z, 1.7);
    if (nx !== car.x || nz !== car.z) { car.x = nx; car.z = nz; car.speed *= 0.55; }
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], c = all[j];
    const dx = c.x - a.x, dz = c.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 3.4) {
      const push = (3.4 - d) / 2;
      const ux = dx / d, uz = dz / d;
      a.x -= ux * push; a.z -= uz * push;
      c.x += ux * push; c.z += uz * push;
      const impact = Math.abs(a.speed) + Math.abs(c.speed);
      a.speed *= 0.6; c.speed *= 0.6;
      if (impact > 7 && (a === G.playerCar || c === G.playerCar) && G.player.mode === 'car') G.bumpTimer = 0.001;
    }
  }
  void dt;
}

// ------------------------------------------------------------------ police

/**
 * The PMPL patrol car. Wanted 0: it cruises the boulevard loop (or waits at its park spot
 * before the mission starts). Wanted > 0: it steers at the player and keeps the pressure
 * on — fast on straights, patient in turns, never quite teleporting onto the player.
 */
export function updatePolice(G, dt) {
  const cop = G.police;
  if (G.cooldownT > 0) {
    // Standing down after a delivery: roll back to the park spot and wait.
    const P = WORLD.policePark;
    const d = Math.hypot(P.x - cop.x, P.z - cop.z);
    if (d > 2) { steerToward(cop, P.x, P.z, dt, 1.8); cop.speed += Math.max(-12 * dt, Math.min(6 * dt, 7 - cop.speed)); }
    else { cop.speed = 0; cop.heading += wrapAngle(P.heading - cop.heading) * Math.min(1, dt * 3); }
    moveCar(cop, dt);
    return;
  }
  if (G.wanted > 0) {
    const t = G.player.mode === 'car' ? G.playerCar : G.player;
    const dist = Math.hypot(t.x - cop.x, t.z - cop.z);
    steerToward(cop, t.x, t.z, dt, 2.1);
    let target = 16.5;
    if (dist < 6) target = Math.max(2.5, dist * 0.8); // close in, then hold contact range
    if (dist > 45) target = 19;
    cop.speed += Math.max(-16 * dt, Math.min(9 * dt, target - cop.speed));
    moveCar(cop, dt);
    cop.pursuing = true;
  } else {
    cop.pursuing = false;
    cop.route = BOULEVARD_LOOP;
    driveAlong(cop, dt, 6.5);
  }
}

// ------------------------------------------------------------------ pedestrians

export function updatePeds(G, dt) {
  for (const ped of G.peds) {
    if (ped.stationary) { ped.walkPhase += dt * 0; continue; }
    // Threat check: a fast car close by, or a fresh crime witnessed up close.
    let threat = null;
    for (const car of [G.playerCar, ...G.traffic, G.police]) {
      if (Math.abs(car.speed) < 8) continue;
      const d = Math.hypot(car.x - ped.x, car.z - ped.z);
      if (d < 7.5) { threat = car; break; }
    }
    if (!threat && G.crimeTimer > 0 && Math.hypot(G.crimeX - ped.x, G.crimeZ - ped.z) < 11) {
      threat = { x: G.crimeX, z: G.crimeZ };
    }
    if (threat) { ped.state = 'flee'; ped.fleeT = 3.2; ped.threatX = threat.x; ped.threatZ = threat.z; }

    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - ped.threatX, dz = ped.z - ped.threatZ;
      const d = Math.hypot(dx, dz) || 1;
      ped.heading = headingTo(dx / d, dz / d);
      ped.x += -Math.sin(ped.heading) * 3.7 * dt;
      ped.z += Math.cos(ped.heading) * 3.7 * dt;
      ped.walkPhase += dt * 11;
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else {
      const [tx, tz] = ped.path[ped.wp];
      const d = Math.hypot(tx - ped.x, tz - ped.z);
      if (d < 0.8) {
        ped.wp = ped.dir > 0 ? ped.wp + 1 : ped.wp - 1;
        if (ped.wp >= ped.path.length) { ped.wp = ped.path.length - 2; ped.dir = -1; }
        if (ped.wp < 0) { ped.wp = 1; ped.dir = 1; }
      } else {
        const want = headingTo(tx - ped.x, tz - ped.z);
        ped.heading += wrapAngle(want - ped.heading) * Math.min(1, dt * 6);
        ped.x += -Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
        ped.walkPhase += dt * 6.4;
      }
    }
    const [nx, nz] = collide(G.colliders, ped.x, ped.z, 0.42);
    ped.x = nx; ped.z = nz;
    const [cx, cz] = clampWorld(ped.x, ped.z);
    ped.x = cx; ped.z = cz;
  }
}

/** Can this observer currently see the target? Distance + a loose facing test for peds. */
export function canSee(obs, tx, tz, range) {
  const d = Math.hypot(tx - obs.x, tz - obs.z);
  return d < range;
}
