// Golden Hour's game state and its one P0 story job, "O Pacote do Festival", plus the
// CALOR wanted system. Rui lifts a package from a festival stall on Rua das Flores — a
// crime, if anyone sees it — and delivers it to Dona Pilar's garage on the boulevard.
// The PMPL's CALOR meter (1–5 stars) rises on witnessed crime and on ramming under
// pursuit, and falls only while nobody can see Rui. If a patrol car holds contact
// with a slow Rui for three seconds, he is detained and the job resets to the stall.
//
// ============================================================================
// CALOR — the 5-star ladder (P1-B). The level is a response doctrine, not just
// a number; actors.js drives each unit's behaviour from it:
//   1★ RESPOSTA INICIAL   — the nearest unit alone responds (pursuit).
//   2★ PERSEGUIÇÃO ATIVA  — that unit pursues at full pressure.
//   3★ RESPOSTA MÚLTIPLA  — two more units (LUME-2, LUME-3) join the pursuit.
//   4★ INTERCEÇÃO         — LUME-3 cuts off a point ahead of Rui's route and
//                           LUME-4 + one other form a roadblock (BLOQUEIO).
//   5★ RESPOSTA MÁXIMA    — every unit plus the ÁGUIA-1 helicopter overhead.
//
// Exact event rules — CALOR changes ONLY on these real gameplay events, never
// on a timer alone and never scripted in live play:
//   RAISE
//   R1 Package lift witnessed (keeper/pedestrian within 15 m of the stall, or
//      any police unit within 34 m): wanted := max(wanted, 2).
//   R2 Hard ram (car-to-car impact > 7 with Rui himself moving faster than
//      3 m/s — being rammed while parked flags nothing — flagged by
//      collideCars) against a POLICE unit while wanted >= 1:
//      wanted := min(5, max(wanted + 1, 3)) — the first police ram therefore
//      always lands on at least 3★. Guarded by a 5 s ram cooldown, so one
//      crash cannot multi-trigger while the cars separate.
//   R3 Hard ram against a TRAFFIC car while wanted >= 2 and any unit has
//      line-of-sight on Rui (a witnessed second crime): wanted += 1 (max 5),
//      same 5 s cooldown as R2.
//   R4 Sustained flight in sight: while any unit has LOS and Rui's speed is
//      above 7 m/s, calorFlightT accumulates; at 12 s (3★ or below) or 16 s
//      (4★) of accumulated seen flight with wanted >= 2, wanted += 1 and the
//      accumulator resets. Out of sight or slow, it bleeds off at half rate.
//   DECAY
//   D1 Stars fall one at a time, only while Rui is UNSEEN (no police LOS and
//      no pedestrian within 10 m). The unseen time needed per star grows with
//      the level — 1★: 8 s, 2★: 9 s, 3★: 11 s, 4★: 13 s, 5★: 15 s
//      (DECAY_SECONDS below). Regaining sight resets the unseen clock to 0.
//   D2 Delivery stand-down (cooldownT) clears CALOR to 0 when it expires, as
//      in P0 — the one non-decay clear, and it belongs to the mission.
// ============================================================================

import { WORLD, headingTo } from './city.js';
import { createRng } from './random.js';
import { BOULEVARD_LOOP, SIDE_LOOP, NORTH_LOOP, SOUTH_LOOP, WEST_LOOP, OUTER_LOOP, DOCAS_LOOP } from './actors.js';

export const STAGE = { GO: 1, DELIVER: 2, FREE: 4 };
export const PAYMENT = 450;

/** Unseen seconds needed to shed one star, indexed by current CALOR level. */
export const DECAY_SECONDS = { 1: 8, 2: 9, 3: 11, 4: 13, 5: 15 };
/** HUD/response doctrine label per CALOR level (hud.js renders it under the stars). */
export const CALOR_LABEL = {
  0: '', 1: 'RESPOSTA INICIAL', 2: 'PERSEGUIÇÃO ATIVA', 3: 'RESPOSTA MÚLTIPLA',
  4: 'INTERCEÇÃO + BLOQUEIO', 5: 'ÁGUIA-1 NO AR · RESPOSTA MÁXIMA',
};
/** Wanted level at which each police unit (by index) joins the response. */
export const UNIT_JOIN_LEVEL = [0, 3, 3, 4];

const PED_TOPS = [[0.8, 0.35, 0.25], [0.3, 0.55, 0.6], [0.9, 0.7, 0.3], [0.45, 0.4, 0.7], [0.85, 0.85, 0.8], [0.6, 0.3, 0.45]];
const PED_BOTTOMS = [[0.25, 0.25, 0.35], [0.4, 0.3, 0.2], [0.3, 0.35, 0.3], [0.55, 0.45, 0.35]];
const SKIN = [[0.85, 0.62, 0.45], [0.62, 0.42, 0.3], [0.95, 0.75, 0.55], [0.5, 0.34, 0.24]];
const HAIR = [[0.15, 0.1, 0.08], [0.35, 0.22, 0.12], [0.6, 0.5, 0.4], [0.1, 0.1, 0.12]];
const TRAFFIC_PAINT = [
  { body: [0.75, 0.3, 0.22], name: 'Ondina' },
  { body: [0.3, 0.5, 0.75], name: 'Ondina' },
  { body: [0.92, 0.75, 0.25], name: 'Táxi Lume', taxi: true },
  { body: [0.85, 0.85, 0.82], name: 'Furgão Brisa', van: true },
  { body: [0.35, 0.6, 0.45], name: 'Ondina' },
  { body: [0.92, 0.75, 0.25], name: 'Táxi Lume', taxi: true },
  { body: [0.88, 0.82, 0.7], name: 'Ondina' },
  { body: [0.7, 0.72, 0.75], name: 'Furgão Brisa', van: true },
  { body: [0.2, 0.55, 0.6], name: 'Ondina' },
  { body: [0.92, 0.75, 0.25], name: 'Táxi Lume', taxi: true },
  { body: [0.55, 0.4, 0.65], name: 'Ondina' },
  { body: [0.8, 0.8, 0.78], name: 'Furgão Brisa', van: true },
  { body: [0.85, 0.5, 0.25], name: 'Ondina' },
];
// One route per car, in paint order: the P0 five keep their P0 routes, the P1-A cars
// take the new loops so every street in the grid carries traffic.
const TRAFFIC_ROUTES = [
  BOULEVARD_LOOP, BOULEVARD_LOOP, SIDE_LOOP, BOULEVARD_LOOP, SIDE_LOOP,
  NORTH_LOOP, NORTH_LOOP, SOUTH_LOOP, SOUTH_LOOP, WEST_LOOP,
  OUTER_LOOP, OUTER_LOOP, DOCAS_LOOP,
];

function makePed(rng, path, wp, opts = {}) {
  return {
    x: path[wp][0], z: path[wp][1], heading: 0, speed: rng.range(1.1, 1.6),
    path, wp, dir: 1, state: 'walk', fleeT: 0, threatX: 0, threatZ: 0,
    walkPhase: rng.range(0, 6), stationary: !!opts.stationary,
    // P1-A behaviours: 'walk' patrols its path, 'browse' pauses at each path end
    // (a shopper at a stall), stationary peds with a partner to face are chat pairs.
    behavior: opts.behavior ?? 'walk', pauseT: 0, pauseDur: opts.pauseDur ?? 0,
    top: opts.top ?? rng.pick(PED_TOPS), trousers: rng.pick(PED_BOTTOMS),
    skin: rng.pick(SKIN), hair: rng.pick(HAIR),
  };
}

/** Build the whole mutable game state. The layout seed is fixed: Porto Lume is one city. */
export function createGameState(colliders) {
  const rng = createRng(99173);
  const playerCar = {
    x: WORLD.playerCar.x, z: WORLD.playerCar.z, heading: WORLD.playerCar.heading, speed: 0,
    kind: 'player', name: 'Vela Sprint', body: [0.12, 0.55, 0.6], cabin: [0.1, 0.16, 0.22],
    route: BOULEVARD_LOOP, wp: 0, cruise: 0, neighbours: [],
  };
  // Hand-staggered start waypoints (index into each car's route): no two cars share a
  // start point, and cars sharing a route start far apart on it.
  const TRAFFIC_START_WP = [0, 3, 1, 4, 4, 1, 6, 2, 7, 1, 8, 3, 5];
  const traffic = [];
  for (let i = 0; i < TRAFFIC_ROUTES.length; i++) {
    const route = TRAFFIC_ROUTES[i];
    const wp = TRAFFIC_START_WP[i] % route.length;
    const paint = TRAFFIC_PAINT[i];
    const cruise = paint.van ? rng.range(6.5, 8.5) : paint.taxi ? rng.range(9, 11.5) : rng.range(7.5, 10.5);
    const next = route[(wp + 1) % route.length];
    traffic.push({
      x: route[wp][0], z: route[wp][1], heading: headingTo(next[0] - route[wp][0], next[1] - route[wp][1]), speed: 0, kind: 'traffic',
      name: paint.name, body: paint.body, taxi: !!paint.taxi, van: !!paint.van,
      route, wp: (wp + 1) % route.length, cruise, neighbours: [],
    });
  }
  // The PMPL response fleet (P1-B): four named cars, each with a depot it waits at
  // while its CALOR join level is not reached. LUME-1 keeps the P0 park spot and the
  // P0 boulevard patrol; the others wait on the south road, the north road and the
  // west street, so a join never pops in next to Rui — it drives in from its depot.
  const UNIT_NAMES = ['LUME-1', 'LUME-2', 'LUME-3', 'LUME-4'];
  const UNIT_DEPOTS = [
    { x: WORLD.policePark.x, z: WORLD.policePark.z, heading: WORLD.policePark.heading },
    { x: -58, z: 41, heading: -Math.PI / 2 },
    { x: 64, z: -51, heading: Math.PI / 2 },
    { x: -59.4, z: 33, heading: Math.PI },
  ];
  const policeUnits = UNIT_DEPOTS.map((d, i) => ({
    x: d.x, z: d.z, heading: d.heading, speed: 0,
    kind: 'police', name: UNIT_NAMES[i], body: [0.92, 0.93, 0.95], cabin: [0.12, 0.2, 0.34],
    route: BOULEVARD_LOOP, wp: 1, cruise: 6.5, neighbours: [], pursuing: false,
    // P1-B per-unit AI state (actors.js owns the behaviour; fields live here so the
    // whole fleet is created in one place). mode is one of standby / patrol /
    // pursuit / intercept / search / roadblock / return.
    id: i, depot: d, mode: i === 0 ? 'patrol' : 'standby', active: i === 0,
    hasLOS: false, losT: i * 0.06, unseenSec: 0,
    lastKnownX: d.x, lastKnownZ: d.z, lastKnownAge: 999,
    searchIdx: i, searchT: 0, holdT: 0, slotX: 0, slotZ: 0, slotHeading: 0,
  }));
  const police = policeUnits[0]; // legacy alias: LUME-1 is "the" patrol of P0/P1-A code
  const all = [playerCar, ...traffic, ...policeUnits];
  for (const c of all) c.neighbours = all;

  const southWalk = [[-86, 8.8], [86, 8.8]];
  const northWalk = [[86, -8.8], [-86, -8.8]];
  const eastWalk = [[24.7, 34], [24.7, -48]];
  const westWalk = [[13.9, -48], [13.9, 34]];
  const peds = [
    makePed(rng, southWalk, 0), makePed(rng, southWalk, 1), makePed(rng, southWalk, 0),
    makePed(rng, northWalk, 0), makePed(rng, northWalk, 1),
    makePed(rng, eastWalk, 0), makePed(rng, eastWalk, 1),
    makePed(rng, westWalk, 0),
  ];
  peds[2].x = 40; peds[5].z = -20; peds[6].z = 22;
  // The stall keeper never leaves his banca — and he always sees the lift.
  const keeper = makePed(rng, [[24.9, 14.6]], 0, { stationary: true, top: [0.85, 0.3, 0.24] });
  keeper.heading = Math.PI; // face the stall
  peds.push(keeper);

  // ---- P1-A crowd: 25 more Porto Lume residents (34 peds in total). The boulevard
  // and the festival street stay the densest, as they should at golden hour; the new
  // roads get lighter foot traffic. All seeded, all on sidewalk paths.
  // More boulevard strollers.
  const blvdExtra = [
    makePed(rng, southWalk, 0), makePed(rng, southWalk, 1),
    makePed(rng, northWalk, 0), makePed(rng, northWalk, 1),
  ];
  blvdExtra[0].x = -58; blvdExtra[1].x = 62; blvdExtra[2].x = -20; blvdExtra[3].x = 48;
  peds.push(...blvdExtra);
  // Festival browsers: short strolls along the stall sidewalk, pausing at each end
  // to look at the bancas.
  for (const [z0, z1] of [[1, 5.5], [8, 12], [14.5, 18.5], [20.5, 25]]) {
    peds.push(makePed(rng, [[24.7, z0], [24.7, z1]], 0, { behavior: 'browse', pauseDur: rng.range(2.5, 5) }));
  }
  // Two idle chat pairs, standing face to face: one on the boulevard's south
  // sidewalk, one on Praça do Relógio.
  function chatPair(x0, z0, x1, z1) {
    const a = makePed(rng, [[x0, z0]], 0, { stationary: true });
    const b = makePed(rng, [[x1, z1]], 0, { stationary: true });
    a.heading = headingTo(x1 - x0, z1 - z0);
    b.heading = headingTo(x0 - x1, z0 - z1);
    peds.push(a, b);
  }
  chatPair(-12, 9.3, -10.9, 8.5);
  chatPair(35, -54.2, 36.3, -55);
  // Walkers on the new roads' sidewalks.
  const northWalkS = [[-86, -41.8], [86, -41.8]];
  const northWalkN = [[86, -54.2], [-86, -54.2]];
  const southWalkN = [[-86, 31.8], [86, 31.8]];
  const southWalkS = [[86, 44.2], [-86, 44.2]];
  const westWalkE = [[-55.8, 44], [-55.8, -42]];
  const eastWalkW = [[61.8, -42], [61.8, 44]];
  const docasWalk = [[-50, 46.6], [8, 46.6]];
  const plazaWalk = [[28, -53.8], [46, -53.8]];
  const nw1 = makePed(rng, northWalkS, 0); nw1.x = -40;
  const nw2 = makePed(rng, northWalkS, 1); nw2.x = 55;
  const nw3 = makePed(rng, northWalkN, 0); nw3.x = 5;
  const nw4 = makePed(rng, northWalkN, 1); nw4.x = -70;
  const sw1 = makePed(rng, southWalkN, 0); sw1.x = -15;
  const sw2 = makePed(rng, southWalkN, 1); sw2.x = 75;
  const sw3 = makePed(rng, southWalkS, 0); sw3.x = 30;
  const ww1 = makePed(rng, westWalkE, 0); ww1.z = 10;
  const ww2 = makePed(rng, westWalkE, 1); ww2.z = -25;
  const ew1 = makePed(rng, eastWalkW, 0); ew1.z = -8;
  const ew2 = makePed(rng, eastWalkW, 1); ew2.z = 20;
  peds.push(nw1, nw2, nw3, nw4, sw1, sw2, sw3, ww1, ww2, ew1, ew2,
    makePed(rng, docasWalk, 0), makePed(rng, plazaWalk, 0));

  return {
    screen: 'title',
    time: 0,
    colliders,
    camera: { x: -52, y: 9, z: 30, yaw: 0.6, pitch: -0.12 },
    camYaw: Math.PI - WORLD.playerCar.heading,
    moveYaw: Math.PI - WORLD.playerCar.heading,
    interactPressed: false,
    player: {
      x: WORLD.spawn.x, z: WORLD.spawn.z, heading: -Math.PI / 2, speed: 0,
      mode: 'foot', walkPhase: 0, moveSig: 0, moving: false,
      top: [0.12, 0.5, 0.55], trousers: [0.2, 0.2, 0.26], skin: SKIN[0], hair: HAIR[0],
      state: 'walk',
    },
    playerCar, traffic, police, policeUnits, peds,
    // ÁGUIA-1, the PMPL helicopter (P1-B): parked by the Farol until 5★ (or a staged
    // shot) calls it up. state is parked / active / return; rotor is a sim-time phase.
    heli: {
      active: false, forced: false, state: 'parked',
      x: -72, y: 0.9, z: -26, heading: 0.6, rotor: 0,
      spotX: -72, spotZ: -26, padX: -72, padZ: -26,
    },
    // The current roadblock engagement (actors.js places and releases it).
    roadblock: {
      active: false, cx: 0, cz: 0, horiz: true, gap: 0, age: 0,
      cooldownT: 0, minDist: 999, slots: null,
    },
    wanted: 0, seenTimer: 0, decayClock: 0, bustMeter: 0, bumpTimer: 0,
    // P1-B CALOR bookkeeping: unseenT is the live decay clock (seconds with no LOS
    // and no close pedestrian), calorFlightT the R4 sustained-flight accumulator,
    // ramCooldownT the R2/R3 guard, bumpKind remembers what the last hard bump hit.
    unseenT: 0, calorFlightT: 0, ramCooldownT: 0, bumpKind: null, seen: false,
    crimeTimer: 0, crimeX: 0, crimeZ: 0, cooldownT: 0,
    money: 0, stage: STAGE.GO, carrying: false,
    prompt: null, dialogue: null, nearCar: false,
    markerX: WORLD.stall.x, markerZ: WORLD.stall.z,
  };
}

function say(G, who, text, seconds = 6) {
  G.dialogue = { who, text, until: G.time + seconds };
}

/** Did anyone see the crime at (x, z)? Pedestrians close by, or any unit within earshot of its radio. */
function witnessed(G, x, z) {
  for (const ped of G.peds) if (Math.hypot(ped.x - x, ped.z - z) < 15) return true;
  for (const u of G.policeUnits) if (Math.hypot(u.x - x, u.z - z) < 34) return true;
  return false;
}

/**
 * Is Rui currently visible to the law or to a reporting pedestrian? Since P1-B this
 * is the real line-of-sight state: any active unit whose throttled LOS check
 * (actors.js) currently holds, or a pedestrian within 10 m (a witness at arm's
 * length needs no LOS check — if he can touch Rui, he can see him).
 */
function isSeen(G) {
  const t = G.player;
  for (const u of G.policeUnits) if (u.active && u.hasLOS) return true;
  for (const ped of G.peds) if (Math.hypot(ped.x - t.x, ped.z - t.z) < 10) return true;
  return false;
}

/** Does any active unit currently have line-of-sight on Rui? (Pedestrians excluded.) */
export function anyPoliceLOS(G) {
  for (const u of G.policeUnits) if (u.active && u.hasLOS) return true;
  return false;
}

function resetAfterBust(G) {
  G.wanted = 0; G.bustMeter = 0; G.seenTimer = 0; G.decayClock = 0; G.cooldownT = 0;
  G.unseenT = 0; G.calorFlightT = 0; G.ramCooldownT = 0; G.bumpKind = null; G.seen = false;
  G.roadblock.active = false; G.roadblock.slots = null; G.roadblock.cooldownT = 0;
  G.heli.active = false; G.heli.state = 'return';
  G.carrying = false;
  if (G.stage === STAGE.DELIVER) G.stage = STAGE.GO;
  G.player.mode = 'foot';
  G.player.x = WORLD.spawn.x; G.player.z = WORLD.spawn.z; G.player.speed = 0;
  G.player.moveSig = 0; G.player.moving = false;
  G.playerCar.x = WORLD.playerCar.x; G.playerCar.z = WORLD.playerCar.z;
  G.playerCar.heading = WORLD.playerCar.heading; G.playerCar.speed = 0;
  for (const u of G.policeUnits) {
    u.x = u.depot.x; u.z = u.depot.z; u.heading = u.depot.heading; u.speed = 0;
    u.hasLOS = false; u.unseenSec = 0; u.lastKnownAge = 999;
    u.mode = u.id === 0 ? 'patrol' : 'standby'; u.holdT = 0;
  }
  G.markerX = WORLD.stall.x; G.markerZ = WORLD.stall.z;
}

/** The mission + wanted step. Runs after actors move; spends G.interactPressed if the stall takes it. */
export function updateMission(G, dt) {
  const p = G.player;
  if (G.crimeTimer > 0) G.crimeTimer -= dt;
  if (G.bumpTimer > 0) G.bumpTimer += dt;
  if (G.bumpTimer > 1.2) G.bumpTimer = 0;

  // --- the lift at the festival stall.
  if (G.stage === STAGE.GO) {
    G.markerX = WORLD.stall.x; G.markerZ = WORLD.stall.z;
    const near = Math.hypot(p.x - WORLD.stall.x, p.z - WORLD.stall.z) < 3.1 && p.mode === 'foot';
    G.prompt = near ? '<b>E</b> — levantar o pacote da banca' : null;
    if (near && G.interactPressed) {
      G.carrying = true;
      G.stage = STAGE.DELIVER;
      G.crimeTimer = 2.5; G.crimeX = WORLD.stall.x; G.crimeZ = WORLD.stall.z;
      if (witnessed(G, WORLD.stall.x, WORLD.stall.z)) {
        G.wanted = Math.max(G.wanted, 2);
        G.seenTimer = 0;
        say(G, 'Inspetora Quintela (rádio PMPL)', '“Central, aqui LUME-1: pacote levantado na Rua das Flores. A perseguir o Vela.”');
      } else {
        say(G, 'Rui', 'Ninguém viu. Agora é só entregar — devagar e sem dar nas vistas.');
      }
    }
  }

  // --- the delivery at Dona Pilar's garage.
  if (G.stage === STAGE.DELIVER) {
    G.markerX = WORLD.garage.x; G.markerZ = WORLD.garage.z;
    G.prompt = null;
    const inZone = Math.abs(p.x - WORLD.garage.x) < WORLD.garage.halfX && Math.abs(p.z - WORLD.garage.z) < WORLD.garage.halfZ + 1.5;
    if (inZone && G.carrying) {
      G.carrying = false;
      G.money += PAYMENT;
      G.stage = STAGE.FREE;
      G.screen = 'done';
      G.cooldownT = 5; // the CALOR cools while the patrol stands down
      say(G, 'Dona Pilar', '“Boa, Rui. Quatrocentos e cinquenta lumes. A dívida encolhe — e a luz ainda dura.”', 9);
    }
  }
  if (G.stage === STAGE.FREE) { G.markerX = null; G.prompt = G.prompt ?? null; }

  // --- CALOR: escalation, sight, decay (rules R1–R4 / D1–D2 in the header).
  if (G.ramCooldownT > 0) G.ramCooldownT -= dt;
  if (G.wanted > 0 && G.cooldownT <= 0) {
    const los = anyPoliceLOS(G);
    const seenNow = isSeen(G);
    const speedNow = p.mode === 'car' ? Math.abs(G.playerCar.speed) : Math.abs(p.speed);
    // D1: decay, one star per DECAY_SECONDS[level] of continuous unseen time.
    if (seenNow) { G.unseenT = 0; }
    else {
      G.unseenT += dt;
      if (G.unseenT >= (DECAY_SECONDS[G.wanted] ?? 9)) {
        G.wanted -= 1; G.unseenT = 0; G.calorFlightT = 0;
      }
    }
    // Legacy mirrors (older HUD/debug readers): seenTimer = time since last seen.
    G.seenTimer = seenNow ? 0 : G.unseenT;
    G.decayClock = G.unseenT;
    // R2 / R3: a hard ram, once per 5 s cooldown. bumpTimer is in its first frames
    // and bumpKind says what Rui hit (set by collideCars in actors.js).
    if (G.bumpTimer > 0 && G.bumpTimer < 0.05 && G.ramCooldownT <= 0) {
      if (G.bumpKind === 'police' && G.wanted >= 1) {
        G.wanted = Math.min(5, Math.max(G.wanted + 1, 3));
        G.ramCooldownT = 5; G.unseenT = 0;
      } else if (G.bumpKind === 'traffic' && G.wanted >= 2 && los) {
        G.wanted = Math.min(5, G.wanted + 1);
        G.ramCooldownT = 5; G.unseenT = 0;
      }
    }
    // R4: sustained flight in sight builds toward the next star.
    if (los && speedNow > 7 && G.wanted >= 2) {
      G.calorFlightT += dt;
      const need = G.wanted >= 4 ? 16 : 12;
      if (G.calorFlightT >= need && G.wanted < 5) { G.wanted += 1; G.calorFlightT = 0; G.unseenT = 0; }
    } else {
      G.calorFlightT = Math.max(0, G.calorFlightT - dt * 0.5);
    }
  }
  if (G.cooldownT > 0) {
    G.cooldownT -= dt;
    if (G.cooldownT <= 0) G.wanted = 0;
  }
  G.seen = G.wanted > 0 && isSeen(G);

  // --- being caught: any active unit holding contact with a slow Rui fills the meter.
  if (G.wanted > 0 && G.cooldownT <= 0 && G.screen === 'play') {
    const target = p.mode === 'car' ? G.playerCar : p;
    let d = Infinity;
    for (const u of G.policeUnits) if (u.active) d = Math.min(d, Math.hypot(u.x - target.x, u.z - target.z));
    const speed = p.mode === 'car' ? Math.abs(G.playerCar.speed) : p.speed;
    if (d < 3.8 && speed < 2.6) G.bustMeter += dt;
    else G.bustMeter = Math.max(0, G.bustMeter - dt * 1.6);
    if (G.bustMeter >= 3) {
      G.screen = 'busted';
      resetAfterBust(G);
    }
  } else if (G.screen === 'play') {
    G.bustMeter = Math.max(0, G.bustMeter - dt * 1.6);
  }

  // --- prompts that belong to the world, not the mission stage.
  if (G.screen === 'play' && !G.prompt) {
    if (p.mode === 'foot' && G.nearCar) G.prompt = '<b>E</b> — entrar no Vela Sprint';
    else if (p.mode === 'car' && Math.abs(G.playerCar.speed) < 1.2) G.prompt = '<b>E</b> — sair do Vela Sprint';
  }
  if (G.dialogue && G.time > G.dialogue.until) G.dialogue = null;

  // District name for the HUD corner.
  const nearFarol = Math.hypot(p.x - WORLD.farol.x, p.z - WORLD.farol.z) < 26;
  const nearClock = Math.hypot(p.x - WORLD.clockTower.x, p.z - WORLD.clockTower.z) < 20;
  if (nearFarol) G.district = 'FAROL DE PORTO LUME';
  else if (nearClock) G.district = 'PRAÇA DO RELÓGIO';
  else if (p.z > 44) G.district = 'DOCAS · PORTO LUME';
  else if (Math.abs(p.z - WORLD.northRoad.z) < 9) G.district = 'RUA DO RELÓGIO';
  else if (Math.abs(p.z - WORLD.southRoad.z) < 9) G.district = 'RUA DAS DOCAS';
  else if (Math.abs(p.x - WORLD.westStreet.x) < 9) G.district = 'RUA DO FAROL';
  else if (Math.abs(p.x - WORLD.eastStreet.x) < 9) G.district = 'AVENIDA LESTE';
  else if (Math.abs(p.x - WORLD.sideStreet.x) < 9) G.district = 'RUA DAS FLORES';
  else G.district = 'AVENIDA DO FAROL · PORTO LUME';
}
