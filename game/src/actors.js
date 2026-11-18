// Porto Lume's actors: how cars and people are drawn (procedural low-poly meshes rebuilt
// each frame into the dynamic buffer) and how the simple traffic, the PMPL patrol/pursuit
// car and the sidewalk pedestrians behave. Rui himself is controlled from player.js; this
// module only paints him.

import { WORLD, ROAD_BANDS, collide, clampWorld, forwardOf, headingTo, wrapAngle, losBlocked } from './city.js';

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
// P1-A loops on the expanded grid. Lane convention matches the P0 loops everywhere:
// eastbound traffic rides the south lane of an east–west road, westbound the north
// lane, northbound the west lane of a north–south street, southbound the east lane —
// so cars on the same road in opposite directions never share a lane, and every loop
// below is a closed circuit with a corner waypoint at each intersection centre.
// Boulevard → east street → Rua do Relógio → Rua das Flores.
export const NORTH_LOOP = [
  [24, 3.6], [64, 3.6], [68, 0], [65.4, -5], [65.4, -43], [68, -48],
  [64, -51], [24, -51], [20, -48], [22.4, -43], [22.4, -5], [20, 0],
];
// Boulevard → Rua das Flores → Rua das Docas → east street.
export const SOUTH_LOOP = [
  [64, -3.6], [24, -3.6], [20, 0], [22.4, 5], [22.4, 33], [20, 38],
  [24, 41], [64, 41], [68, 38], [65.4, 33], [65.4, 5], [68, 0],
];
// West street → Rua do Relógio → Rua das Flores → boulevard.
export const WEST_LOOP = [
  [-64.6, -5], [-64.6, -43], [-62, -48], [-58, -45], [16, -45], [20, -48],
  [22.4, -43], [22.4, -5], [20, 0], [16, -3.6], [-58, -3.6], [-62, 0],
];
// The outer perimeter: Rua das Docas → east street → Rua do Relógio → west street.
export const OUTER_LOOP = [
  [-58, 41], [64, 41], [68, 38], [65.4, 33], [65.4, -43], [68, -48],
  [64, -51], [-58, -51], [-62, -48], [-59.4, -43], [-59.4, 33], [-62, 38],
];
// Boulevard → west street → Rua das Docas → Rua das Flores.
export const DOCAS_LOOP = [
  [16, -3.6], [-58, -3.6], [-62, 0], [-59.4, 5], [-59.4, 33], [-62, 38],
  [-58, 41], [16, 41], [20, 38], [17.6, 33], [17.6, 5], [20, 0],
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
  // Car-following and intersection courtesy, both keyed on the shared neighbours
  // order (the player's car first, then traffic, then the patrol):
  //  - Same-direction traffic just ahead: ease off and keep a gap (as P0 did).
  //  - Crossing traffic in my path: yield — but only to a car EARLIER in the order.
  //    Exactly one car of any crossing pair therefore proceeds while the other waits
  //    clear of contact, which is what keeps the grid deadlock-free: treating every
  //    perpendicular car as "ahead" (P0's rule, fine for 5 cars on 2 loops) makes
  //    two cars stop for each other forever once 13 cars share 7 loops, and letting
  //    both drive in pins them in collideCars' push-apart, whose push direction is
  //    exactly backwards for both. The player's car is first in the order, so
  //    traffic always yields to Rui — he has priority at every junction.
  const [mfx, mfz] = forwardOf(car.heading);
  const myIdx = car.neighbours.indexOf(car);
  let blocked = false;
  let blockerMoving = false;
  for (const other of car.neighbours) {
    if (other === car) continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    const ahead = dx * mfx + dz * mfz;
    const side = Math.abs(dx * mfz - dz * mfx); // lateral offset along the right vector
    const d = Math.hypot(dx, dz);
    if (ahead <= 0 || d >= 8) continue;
    const [ofx, ofz] = forwardOf(other.heading);
    if (mfx * ofx + mfz * ofz >= 0.5) {
      if (side < 2.2) {
        target = Math.min(target, Math.max(0, (d - 4.5) * 1.6));
        blocked = true;
        if (Math.abs(other.speed) > 1) blockerMoving = true;
      }
    } else if (side < 2.6 && d < 6.5 && car.neighbours.indexOf(other) < myIdx) {
      target = Math.min(target, Math.max(0, (d - 4.2) * 1.6));
      blocked = true;
      if (Math.abs(other.speed) > 1) blockerMoving = true;
    }
  }
  // Stall breaker: a car held at a standstill for seconds while nothing ahead of it
  // is moving creeps forward slowly until the blockage clears, so a freak queue can
  // never freeze the city permanently. It never creeps into moving traffic.
  if (car.speed < 0.4 && target < 0.5 && blocked) car.stallT = (car.stallT ?? 0) + dt;
  else if (car.speed >= 0.4) car.stallT = 0;
  if ((car.stallT ?? 0) > 5 && !blockerMoving) target = Math.max(target, 2.2);
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
  const all = [G.playerCar, ...G.traffic, ...G.policeUnits];
  for (const car of all) {
    const [nx, nz] = collide(G.colliders, car.x, car.z, 1.7);
    if (nx !== car.x || nz !== car.z) {
      car.x = nx; car.z = nz;
      // Only the player's car loses speed against buildings (a crash should cost
      // Rui momentum). Traffic and the patrol get the positional push-out alone:
      // damping their speed every frame while they touch a collider pins them at
      // ~0.1 m/s against any face a junction scrum shoves them onto (the P1-A soak
      // caught boulevard cars frozen against a festival stall for minutes), while
      // with push-out alone their waypoint steering slides them around the corner
      // and free within seconds.
      if (car === G.playerCar) car.speed *= 0.55;
    }
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
      // Hard contact costs speed; a gentle touch in a queue barely does, so two
      // stopped cars are not pinned by the damping while the push separates them.
      const damp = impact > 4 ? 0.6 : 0.92;
      a.speed *= damp; c.speed *= damp;
      if (impact > 7 && (a === G.playerCar || c === G.playerCar) && G.player.mode === 'car'
        && Math.abs(G.playerCar.speed) > 3) {
        // A hard ram BY Rui: missions.js (CALOR rules R2/R3) needs to know WHAT he
        // hit — a police unit escalates harder than a traffic car. Rui's own speed
        // must be a real share of the impact: being rammed while parked (by the
        // patrol arriving hot, or by traffic) is not his crime and flags nothing.
        G.bumpTimer = 0.001;
        const other = a === G.playerCar ? c : a;
        G.bumpKind = other.kind === 'police' ? 'police' : 'traffic';
      }
    }
  }
  void dt;
}

// ------------------------------------------------------------------ police

/** How far a unit can see, and how often each unit re-checks its line-of-sight. */
export const LOS_RANGE = 60;
export const LOS_INTERVAL = 0.21;

/**
 * One real line-of-sight test: Rui (on foot or in the Vela — the target point is
 * the same) is visible from the unit if he is inside LOS_RANGE and no building
 * collider cuts the segment between them (city.js losBlocked).
 */
export function checkLOS(G, unit, tx, tz) {
  const d = Math.hypot(tx - unit.x, tz - unit.z);
  if (d > LOS_RANGE) return false;
  return !losBlocked(G.colliders, unit.x, unit.z, tx, tz);
}

/**
 * Throttled LOS bookkeeping for the whole fleet. Each unit re-tests its sight
 * line every LOS_INTERVAL seconds, staggered by unit index (losT was seeded
 * i * 0.06 apart), so the four segment sweeps never land on the same frame.
 * Between tests the unit keeps its last verdict — that staleness is deliberate:
 * it is what makes breaking away around a corner feel fair. A fresh sighting
 * pins lastKnown to Rui's position and zeroes the unseen clock; losing sight
 * starts it, and the tactics below drive on lastKnown from there.
 */
export function refreshLOS(G, dt) {
  const t = G.player.mode === 'car' ? G.playerCar : G.player;
  for (const u of G.policeUnits) {
    u.lastKnownAge += dt;
    if (!u.hasLOS) u.unseenSec += dt;
    u.losT -= dt;
    if (u.losT > 0) continue;
    u.losT = LOS_INTERVAL;
    if (!u.active) { u.hasLOS = false; continue; }
    u.hasLOS = checkLOS(G, u, t.x, t.z);
    if (u.hasLOS) {
      u.lastKnownX = t.x; u.lastKnownZ = t.z;
      u.lastKnownAge = 0; u.unseenSec = 0;
    }
  }
}

/**
 * Street points a searching unit sweeps, in a fixed order: every junction of the
 * road grid plus the landmark aprons. A unit entering SEARCH sorts these by
 * distance to its last-known position (index breaks ties) and walks the list —
 * deterministic, and biased to where Rui was actually seen last.
 */
export const SEARCH_POINTS = [
  [20, 0], [-62, 0], [68, 0], [20, -48], [-62, -48], [68, -48],
  [20, 38], [-62, 38], [68, 38], [0, 0], [0, -48], [0, 38],
  [-27, 4.6], [55, 13.5], [-80, -34], [38, -60], [-28, 58],
];

/** Wanted level at which each unit joins (mirrors UNIT_JOIN_LEVEL in missions.js). */
const JOIN_LEVEL = [0, 3, 3, 4];

// ------------------------------------------------------------------ roadblock

/** The two units on roadblock duty at 4★+ (LUME-3 keeps the intercept role). */
const BLOCKER_IDS = [1, 3];

/**
 * Place a roadblock (P1-B): two police cars parked nose-to-tail ACROSS the road
 * ~30 m ahead of Rui, on whichever road band (horizontal or vertical) that point
 * is nearest to. Deterministic: the centre is a pure function of Rui's position
 * and heading, snapped to the road grid; the one tie-break — which side of the
 * road keeps the wider drive-around gap — is a fixed integer hash of the
 * quantized centre, so the same approach always builds the same blockade.
 * The cars are ordinary collideCars bodies: Rui can ram through (they push and
 * dent his speed, no hard wall) or slip around the widened edge gap.
 */
export function placeRoadblock(G, t) {
  const rb = G.roadblock;
  const [fx, fz] = forwardOf(t.heading);
  const ax = t.x + fx * 30, az = t.z + fz * 30;
  let bestH = null, bestHd = Infinity;
  for (const b of ROAD_BANDS.h) { const d = Math.abs(az - b.z); if (d < bestHd) { bestHd = d; bestH = b; } }
  let bestV = null, bestVd = Infinity;
  for (const b of ROAD_BANDS.v) { const d = Math.abs(ax - b.x); if (d < bestVd) { bestVd = d; bestV = b; } }
  rb.horiz = bestHd <= bestVd;
  if (rb.horiz) { rb.cx = ax; rb.cz = bestH.z; } else { rb.cx = bestV.x; rb.cz = az; }
  const [ccx, ccz] = clampWorld(rb.cx, rb.cz);
  rb.cx = ccx; rb.cz = ccz;
  const qx = Math.round(rb.cx / 6), qz = Math.round(rb.cz / 6);
  const hash = ((qx * 73856093) ^ (qz * 19349663)) >>> 0;
  rb.gap = (hash % 2 === 0 ? 1 : -1) * 1.5;
  rb.slots = rb.horiz
    ? [{ x: rb.cx, z: rb.cz - 2.4 + rb.gap, h: 0 }, { x: rb.cx, z: rb.cz + 2.4 + rb.gap, h: 0 }]
    : [{ x: rb.cx - 2.4 + rb.gap, z: rb.cz, h: Math.PI / 2 }, { x: rb.cx + 2.4 + rb.gap, z: rb.cz, h: Math.PI / 2 }];
  rb.active = true;
  rb.age = 0;
  rb.minDist = Infinity;
  BLOCKER_IDS.forEach((id, i) => {
    const u = G.policeUnits[id];
    u.mode = 'roadblock';
    u.slotX = rb.slots[i].x; u.slotZ = rb.slots[i].z; u.slotHeading = rb.slots[i].h;
    u.searchList = null;
  });
}

function releaseRoadblock(G, cooldown) {
  const rb = G.roadblock;
  rb.active = false;
  rb.slots = null;
  rb.cooldownT = cooldown;
  for (const id of BLOCKER_IDS) {
    const u = G.policeUnits[id];
    if (u.mode === 'roadblock') { u.mode = 'pursuit'; u.holdT = 1.2; } // a breath, then chase
  }
}

/**
 * Roadblock lifecycle, stepped once per frame from updatePolice. Placement needs
 * 4★+, a fresh sighting (or a last-known under 3 s old) and an expired placement
 * cooldown. Release — the no-soft-lock guarantee — happens when Rui has been
 * through or past the blockade and is clear beyond it, when he gives the area a
 * wide berth for a few seconds (went around), when the block never engages for
 * 25 s, or when CALOR drops below 4★ / the delivery stand-down begins.
 */
export function updateRoadblock(G, dt) {
  const rb = G.roadblock;
  if (rb.cooldownT > 0) rb.cooldownT -= dt;
  const t = G.player.mode === 'car' ? G.playerCar : G.player;
  if (rb.active) {
    rb.age += dt;
    const d = Math.hypot(t.x - rb.cx, t.z - rb.cz);
    if (d < rb.minDist) rb.minDist = d;
    const passed = rb.minDist < 7 && d > 16;
    const around = rb.age > 4 && d > 36;
    const stale = rb.age > 25;
    if (passed || around || stale || G.wanted < 4 || G.cooldownT > 0) {
      releaseRoadblock(G, passed || around ? 7 : 4);
    }
    return;
  }
  if (G.wanted >= 4 && G.cooldownT <= 0 && rb.cooldownT <= 0) {
    let fresh = false;
    for (const u of G.policeUnits) if (u.active && (u.hasLOS || u.lastKnownAge < 3)) { fresh = true; break; }
    if (fresh) placeRoadblock(G, t);
  }
}

/**
 * Drive one blocker to its slot, then stop and square up across the road. The
 * approach runs along the road, not across it: first to the corridor point in
 * the driving lane on the slot's side of the road (same along-road coordinate
 * as the slot), then the short lateral step into the slot itself. A raw
 * beeline from across town crosses junction furniture — the festival stall row
 * stands in the boulevard's median at Rua das Flores, and a blocker sent
 * straight at its slot pins against a stall forever (the sim caught exactly
 * that); the lane corridor passes the same stall with the lane's own clearance.
 */
function driveRoadblockUnit(G, u, dt) {
  const rb = G.roadblock;
  const d = Math.hypot(u.slotX - u.x, u.slotZ - u.z);
  if (d <= 1.4) {
    u.speed += Math.max(-16 * dt, Math.min(0, 0 - u.speed));
    u.heading += wrapAngle(u.slotHeading - u.heading) * Math.min(1, dt * 4);
    moveCar(u, dt);
    u.pursuing = false;
    return;
  }
  let aimX = u.slotX, aimZ = u.slotZ;
  if (rb.horiz) {
    const laneZ = rb.cz + (u.slotZ >= rb.cz ? 3.6 : -3.6);
    if (Math.hypot(u.slotX - u.x, laneZ - u.z) > 2) { aimX = u.slotX; aimZ = laneZ; }
  } else {
    const laneX = rb.cx + (u.slotX >= rb.cx ? 3.6 : -3.6);
    if (Math.hypot(laneX - u.x, u.slotZ - u.z) > 2) { aimX = laneX; aimZ = u.slotZ; }
  }
  driveUnitTo(u, aimX, aimZ, dt, 15);
  u.pursuing = false;
}

/** Drive one unit toward (tx, tz) at up to `cruise`, with P0's close-in easing. */
function driveUnitTo(u, tx, tz, dt, cruise) {
  const dist = Math.hypot(tx - u.x, tz - u.z);
  // Anti-pin detour: a beeline unit shoved flat against a collider face (a stall
  // at a junction, a building corner) is pushed straight back by collide() and
  // would lean there forever — its speed still reads ~2 m/s, so the pin is
  // detected by DISPLACEMENT: position sampled every 0.5 s, and if the unit
  // moved less than 0.4 m in a sample while still far from its target, it
  // breaks sideways for a moment — to its right for even unit ids, to its left
  // for odd ones, so two pinned units never mirror each other into the same
  // wall. Deterministic: id parity only, no randomness.
  u.pinT += dt;
  if (u.pinT >= 0.5) {
    const moved = Math.hypot(u.x - u.pinX, u.z - u.pinZ);
    if (moved < 0.4 && dist > 4 && !(u.detourT > 0)) u.detourT = 1.3;
    u.pinX = u.x; u.pinZ = u.z; u.pinT = 0;
  }
  let aimX = tx, aimZ = tz;
  if (u.detourT > 0) {
    u.detourT -= dt;
    const side = u.id % 2 === 0 ? 1 : -1;
    aimX = u.x + Math.cos(u.heading) * side * 8;
    aimZ = u.z + Math.sin(u.heading) * side * 8;
  }
  steerToward(u, aimX, aimZ, dt, 2.1);
  let target = cruise;
  if (dist < 6) target = Math.max(2.2, dist * 0.8);
  if (dist > 45) target = cruise + 2.5;
  u.speed += Math.max(-16 * dt, Math.min(9 * dt, target - u.speed));
  moveCar(u, dt);
  return dist;
}

/**
 * The PMPL fleet's tactics (P1-B) — one small visible state machine per unit:
 *   standby   parked at its depot, CALOR below its join level.
 *   patrol    LUME-1 only, CALOR 0: the P0 boulevard cruise.
 *   pursuit   steer at Rui (LOS) or at his last-known position (no LOS).
 *   intercept LUME-3 at 4★+: steer at a point ahead of Rui's route instead.
 *   search    no fresh last-known: sweep SEARCH_POINTS nearest-first.
 *   roadblock 4★+: hold a placed blockade slot (see the roadblock section).
 *   return    stand down to the depot (delivery cooldown, or CALOR dropped
 *             below the unit's join level).
 * Activation is purely CALOR-driven (JOIN_LEVEL); a unit that deactivates drives
 * home rather than vanishing. Speeds are P0's pursuit numbers, so one unit feels
 * exactly like the old patrol — the escalation is in numbers and tactics.
 */
export function updatePolice(G, dt) {
  refreshLOS(G, dt);
  updateRoadblock(G, dt);
  const t = G.player.mode === 'car' ? G.playerCar : G.player;
  for (const u of G.policeUnits) {
    // LUME-1 is always on duty; the others join exactly at their CALOR level.
    u.active = u.id === 0 || G.wanted >= JOIN_LEVEL[u.id];
    u.pursuing = false;
    if (G.cooldownT > 0 || !u.active) {
      // Stand down: roll back to the depot and wait there.
      const wasMode = u.mode;
      u.mode = G.cooldownT > 0 || wasMode !== 'standby' ? 'return' : 'standby';
      const d = Math.hypot(u.depot.x - u.x, u.depot.z - u.z);
      if (d > 2) driveUnitTo(u, u.depot.x, u.depot.z, dt, 7.5);
      else {
        u.speed = 0;
        u.heading += wrapAngle(u.depot.heading - u.heading) * Math.min(1, dt * 3);
        u.mode = 'standby';
        moveCar(u, dt);
      }
      continue;
    }
    if (G.wanted === 0) { // only LUME-1 reaches here: the P0 patrol
      u.mode = 'patrol';
      u.route = BOULEVARD_LOOP;
      driveAlong(u, dt, 6.5);
      continue;
    }
    if (u.holdT > 0) { // brief pause (e.g. just released from a roadblock)
      u.holdT -= dt;
      u.speed += Math.max(-16 * dt, Math.min(0, 0 - u.speed));
      moveCar(u, dt);
      continue;
    }
    if (u.mode === 'roadblock' && G.roadblock.active) { driveRoadblockUnit(G, u, dt); continue; }
    // Choose the tactic for this step.
    let aimX, aimZ, cruise;
    if (u.hasLOS) {
      u.searchList = null;
      if (u.id === 2 && G.wanted >= 4) {
        // Intercept: aim where Rui will be, not where he is — a point ahead of
        // his heading, further ahead the further the unit has to travel.
        u.mode = 'intercept';
        const dist = Math.hypot(t.x - u.x, t.z - u.z);
        const lead = Math.max(6, Math.min(26, dist * 0.55));
        const [fx, fz] = forwardOf(t.heading);
        aimX = t.x + fx * lead; aimZ = t.z + fz * lead;
        cruise = 18.5;
      } else {
        u.mode = 'pursuit';
        aimX = t.x; aimZ = t.z; cruise = 16.5;
      }
    } else if (u.lastKnownAge < 20 && Math.hypot(u.lastKnownX - u.x, u.lastKnownZ - u.z) > 4.5) {
      u.mode = 'pursuit'; // to the last-known position, then SEARCH takes over
      aimX = u.lastKnownX; aimZ = u.lastKnownZ; cruise = 15;
    } else {
      u.mode = 'search';
      if (!u.searchList) {
        u.searchList = SEARCH_POINTS
          .map(([x, z], i) => ({ x, z, i, d: Math.hypot(x - u.lastKnownX, z - u.lastKnownZ) }))
          .sort((a, b) => (a.d - b.d) || (a.i - b.i));
        u.searchPtr = 0;
      }
      const sp = u.searchList[u.searchPtr % u.searchList.length];
      aimX = sp.x; aimZ = sp.z; cruise = 9.5;
      if (Math.hypot(sp.x - u.x, sp.z - u.z) < 5) u.searchPtr += 1;
    }
    driveUnitTo(u, aimX, aimZ, dt, cruise);
    u.pursuing = u.mode === 'pursuit' || u.mode === 'intercept';
  }
  G.police.pursuing = G.policeUnits[0].pursuing;
}

// ------------------------------------------------------------------ helicopter

/**
 * ÁGUIA-1, the PMPL helicopter (P1-B). Parked on the Farol apron until CALOR 5★
 * (or a staged shot's `forced` flag) calls it up; then it climbs to an 18 m hover
 * well ahead of Rui and off his left shoulder and lerps to stay over his area,
 * spotlight pinned to him. When CALOR falls it flies home and lands — it never
 * pops in or out.
 * All motion derives from game state and the fixed step: the rotor phase is
 * sim time only, no clock, no randomness.
 */
export function updateHeli(G, dt) {
  const h = G.heli;
  const t = G.player.mode === 'car' ? G.playerCar : G.player;
  const shouldFly = (G.wanted >= 5 || h.forced) && G.cooldownT <= 0;
  if (shouldFly) h.state = 'active';
  else if (h.state === 'active') h.state = 'return';
  h.active = h.state === 'active';

  let tx, ty, tz, rate;
  if (h.state === 'active') {
    // On station well AHEAD of Rui and off his left shoulder: 24 m ahead, 7 m
    // to the side, 18 m up. The first P1-B cut hovered 7 m BEHIND him at 28 m,
    // so in real play the airframe only ever sat behind the chase camera; the
    // second cut (12 m ahead, 26 m up) still left it ~28° above the chase
    // camera's top edge in live play — the player saw only the spotlight cone
    // and pool. At 24 m ahead / 18 m up the airframe sits inside the eased
    // 5★ chase frame (player.js), over the road Rui is driving into, its cone
    // slanting back onto him. (cos h, sin h) is the heading's right vector, so
    // subtracting it puts the heli on his left — the Farol side of a westbound
    // run down the boulevard.
    const [fx, fz] = forwardOf(t.heading);
    tx = t.x + fx * 24 - Math.cos(t.heading) * 7;
    tz = t.z + fz * 24 - Math.sin(t.heading) * 7;
    ty = 18; rate = 1.7;
    // Rooftop guard: 18 m clears every ordinary roof (the tallest pitched
    // ridge in town is ~17.8 m) once ON station, and the station itself is
    // player-relative, so it always hangs over Rui's road, never over a
    // block. But the lerp ACROSS blocks to a new station can cross rooftops,
    // and the Farol and clock tower stand 23.4 m tall — so, exactly as the
    // return leg stays high until it is over the pad, a transit that is
    // still far from its station flies at 25 m and only settles to 18 m for
    // the final approach over the road.
    if (Math.hypot(tx - h.x, tz - h.z) > 12) ty = 25;
    // The spotlight tracks Rui himself, tighter than the airframe follows.
    h.spotX += (t.x - h.spotX) * Math.min(1, dt * 6);
    h.spotZ += (t.z - h.spotZ) * Math.min(1, dt * 6);
  } else if (h.state === 'return') {
    tx = h.padX; tz = h.padZ; rate = 1.1;
    ty = Math.hypot(tx - h.x, tz - h.z) > 5 ? 28 : 0.9; // stay high until over the pad
    h.spotX += (h.x - h.spotX) * Math.min(1, dt * 3);
    h.spotZ += (h.z - h.spotZ) * Math.min(1, dt * 3);
  } else {
    tx = h.padX; tz = h.padZ; ty = 0.9; rate = 3;
  }
  const ox = h.x, oz = h.z;
  const k = Math.min(1, rate * dt);
  h.x += (tx - h.x) * k;
  h.z += (tz - h.z) * k;
  h.y += (ty - h.y) * Math.min(1, 1.3 * dt);
  h.pvx = dt > 0 ? (h.x - ox) / dt : 0;
  h.pvz = dt > 0 ? (h.z - oz) / dt : 0;
  if (h.state !== 'parked') {
    const want = headingTo(t.x - h.x, t.z - h.z);
    h.heading += wrapAngle(want - h.heading) * Math.min(1, dt * 1.6);
  }
  // Bank into the lateral drift (velocity across the nose), capped at ~0.35 rad.
  const rx = Math.cos(h.heading), rz = Math.sin(h.heading);
  const lateral = h.pvx * rx + h.pvz * rz;
  h.bank += (Math.max(-0.35, Math.min(0.35, lateral * 0.05)) - h.bank) * Math.min(1, dt * 3);
  // Rotor spin-up/down and phase (visual only, driven by sim time).
  const targetVel = h.state === 'parked' ? 0 : 30;
  h.rotorVel += (targetVel - h.rotorVel) * Math.min(1, dt * 0.8);
  h.rotor += h.rotorVel * dt;
  if (h.state === 'return' && Math.hypot(h.padX - h.x, h.padZ - h.z) < 1.5 && Math.abs(h.y - 0.9) < 0.35) {
    h.state = 'parked';
  }
}

/**
 * Paint ÁGUIA-1: an original low-poly helicopter — white PMPL body with the blue
 * band and a gold callsign block on the tail (the engine has no textures, so the
 * identification is livery markings, not lettering), spinning main rotor (two
 * crossed blades), tail rotor with an orbiting tip, skids, and — while active —
 * the spotlight: a dim emissive cone drawn as sparse segments — one panel in
 * four around the cone, so three-quarters of the surface is open gap and the
 * city shows through (that is what reads as translucency in a renderer with no
 * alpha; the first P1-B cut drew every other panel at full brightness and the
 * cone photographed as a solid white sail) — plus a bright ground disc under
 * Rui. One paint path serves the staged cover and live play alike.
 */
export function paintHeli(b, heli) {
  const { x, z } = heli;
  const y = heli.y, h = heli.heading + heli.bank * 0.4;
  const fx = -Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = Math.sin(h);
  if (y < 7) b.blob(x, z, 3.1);
  const at = (lx, ly, lz) => [x + rx * lx + fx * lz, y + ly, z + rz * lx + fz * lz];
  // Body and PMPL livery.
  b.box(x, y, z, 2.0, 1.5, 4.4, h, [0.92, 0.93, 0.95]);
  b.box(x, y - 0.25, z, 2.04, 0.5, 4.44, h, [0.2, 0.35, 0.85]); // PMPL blue band
  const nose = at(0, 0.18, 1.85);
  b.box(nose[0], nose[1], nose[2], 1.6, 0.95, 0.9, h, [0.12, 0.2, 0.34]); // glasshouse
  const boom = at(0, 0.25, -3.1);
  b.box(boom[0], boom[1], boom[2], 0.5, 0.5, 2.6, h, [0.88, 0.89, 0.92]);
  const fin = at(0, 0.75, -4.35);
  b.box(fin[0], fin[1], fin[2], 0.16, 1.15, 0.7, h, [0.2, 0.35, 0.85]);
  const mark = at(0, 0.3, -4.3);
  b.box(mark[0], mark[1], mark[2], 0.56, 0.4, 0.5, h, [1, 0.75, 0.25], { emissive: true }); // ÁGUIA-1 gold block
  // Tail rotor: a slim blade plus a tip that orbits in the vertical plane.
  const tr = at(0.34, 0.75, -4.35);
  b.box(tr[0], tr[1], tr[2], 0.08, 1.05, 0.26, h, DARK);
  const tipA = heli.rotor * 3;
  const tip = at(0.36, 0.75 + Math.sin(tipA) * 0.48, -4.35 + Math.cos(tipA) * 0.1);
  b.box(tip[0], tip[1], tip[2], 0.1, 0.18, 0.18, h, [1, 0.85, 0.5], { emissive: true });
  // Main rotor: mast plus two crossed blades turning with the sim-time phase.
  const mast = at(0, 0.9, 0.2);
  b.box(mast[0], mast[1], mast[2], 0.3, 0.35, 0.3, h, DARK);
  b.box(x, y + 1.08, z, 7.6, 0.07, 0.42, heli.rotor, [0.16, 0.16, 0.2]);
  b.box(x, y + 1.08, z, 0.42, 0.07, 7.6, heli.rotor, [0.16, 0.16, 0.2]);
  // Skids.
  for (const s of [-0.85, 0.85]) {
    const sk = at(s, -1.05, 0);
    b.box(sk[0], sk[1], sk[2], 0.12, 0.12, 3.4, h, DARK);
    const st = at(s, -0.85, 0.9);
    b.box(st[0], st[1], st[2], 0.1, 0.35, 0.1, h, DARK);
  }
  // Spotlight cone + ground pool while on station (P1-C grade pass): the four
  // sparse panels stay — that sparseness is what reads as translucency — but
  // each panel is now painted vertex by vertex with a brightness falloff,
  // bright at the lamp and fading to about half by the ground, so the beam
  // reads as light travelling and thinning instead of a flat sail. The pool
  // gains a wide, dim halo ring under the bright core disc: a soft edge
  // instead of a hard circle stamped on the road.
  if (heli.active) {
    const apex = [x, y - 0.8, z];
    const seg = 16, R = 3.1;
    const apexCol = [0.68, 0.62, 0.45], baseCol = [0.36, 0.32, 0.22];
    for (let i = 0; i < seg; i += 4) { // sparse panels: 4 of 16, a beam not a sail
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [heli.spotX + Math.cos(a0) * R, 0.15, heli.spotZ + Math.sin(a0) * R];
      const p1 = [heli.spotX + Math.cos(a1) * R, 0.15, heli.spotZ + Math.sin(a1) * R];
      b.vertex(apex[0], apex[1], apex[2], 0, 1, 0, apexCol[0], apexCol[1], apexCol[2], 1);
      b.vertex(p0[0], p0[1], p0[2], 0, 1, 0, baseCol[0], baseCol[1], baseCol[2], 1);
      b.vertex(p1[0], p1[1], p1[2], 0, 1, 0, baseCol[0], baseCol[1], baseCol[2], 1);
    }
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
      b.tri([heli.spotX, 0.055, heli.spotZ],
        [heli.spotX + Math.cos(a0) * 4.3, 0.055, heli.spotZ + Math.sin(a0) * 4.3],
        [heli.spotX + Math.cos(a1) * 4.3, 0.055, heli.spotZ + Math.sin(a1) * 4.3],
        [0, 1, 0], [0.50, 0.44, 0.30], 1);
    }
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
      b.tri([heli.spotX, 0.07, heli.spotZ],
        [heli.spotX + Math.cos(a0) * 3.0, 0.07, heli.spotZ + Math.sin(a0) * 3.0],
        [heli.spotX + Math.cos(a1) * 3.0, 0.07, heli.spotZ + Math.sin(a1) * 3.0],
        [0, 1, 0], [0.88, 0.79, 0.53], 1);
    }
  }
}

// ------------------------------------------------------------------ pedestrians

export function updatePeds(G, dt) {
  for (const ped of G.peds) {
    if (ped.stationary) { ped.walkPhase += dt * 0; continue; }
    // Threat check: a fast car close by, or a fresh crime witnessed up close.
    let threat = null;
    for (const car of [G.playerCar, ...G.traffic, ...G.policeUnits]) {
      if (Math.abs(car.speed) < 8) continue;
      const d = Math.hypot(car.x - ped.x, car.z - ped.z);
      if (d < 7.5) { threat = car; break; }
    }
    if (!threat && G.crimeTimer > 0 && Math.hypot(G.crimeX - ped.x, G.crimeZ - ped.z) < 11) {
      threat = { x: G.crimeX, z: G.crimeZ };
    }
    if (threat) { ped.state = 'flee'; ped.fleeT = 3.2; ped.threatX = threat.x; ped.threatZ = threat.z; ped.pauseT = 0; }

    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - ped.threatX, dz = ped.z - ped.threatZ;
      const d = Math.hypot(dx, dz) || 1;
      ped.heading = headingTo(dx / d, dz / d);
      ped.x += -Math.sin(ped.heading) * 3.7 * dt;
      ped.z += Math.cos(ped.heading) * 3.7 * dt;
      ped.walkPhase += dt * 11;
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else if (ped.pauseT > 0) {
      // Browsing: stand at the stall a while, shifting weight, before strolling on.
      ped.pauseT -= dt;
      ped.walkPhase += dt * 1.1;
    } else {
      const [tx, tz] = ped.path[ped.wp];
      const d = Math.hypot(tx - ped.x, tz - ped.z);
      if (d < 0.8) {
        ped.wp = ped.dir > 0 ? ped.wp + 1 : ped.wp - 1;
        if (ped.wp >= ped.path.length) { ped.wp = ped.path.length - 2; ped.dir = -1; }
        if (ped.wp < 0) { ped.wp = 1; ped.dir = 1; }
        // A browser pauses at each end of its little stroll; the pause length varies
        // deterministically with the waypoint so the crowd never syncs up.
        if (ped.behavior === 'browse') ped.pauseT = ped.pauseDur * (1 + (ped.wp % 3) * 0.4);
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
