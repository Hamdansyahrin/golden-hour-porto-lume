// Porto Lume, built once from a fixed seed: a small connected open world of drivable
// loops around the original P0 district. Avenida do Farol (the wide east–west boulevard)
// and Rua das Flores (the side street crossing it) stay exactly where P0 put them; around
// them run Rua do Relógio to the north, Rua das Docas to the south, and the west and east
// streets that close the grid into loops, so every road joins another at both ends.
// Landmarks: the Farol lighthouse on its rocky rise at the west end (tall enough to read
// from most of the map), the clock tower on Praça do Relógio, the Docas dock edge with
// its crane and container stacks, and a dry canal strip at the east edge crossed by the
// boulevard on stone abutments (scenery only — no water mechanics). Rows of original
// low-poly buildings with lit windows, varied footprints, heights and rooflines (flat,
// pitched, terraced), palm trees, festival stalls and Dona Pilar's garage complete the
// city. This module owns the static geometry and the collision boxes; it knows nothing
// about actors.

import { MeshBuilder } from './engine.js';
import { createRng } from './random.js';

// Palette (linear-ish RGB triples, warm golden-hour key).
export const COL = {
  road: [0.23, 0.2, 0.21], roadLine: [0.95, 0.8, 0.45], kerb: [0.62, 0.55, 0.47],
  walk: [0.72, 0.6, 0.47], plaza: [0.78, 0.66, 0.5], grass: [0.36, 0.5, 0.26],
  rock: [0.45, 0.36, 0.3], sand: [0.9, 0.76, 0.52],
  walls: [[0.93, 0.85, 0.72], [0.88, 0.62, 0.45], [0.8, 0.52, 0.42], [0.92, 0.78, 0.6], [0.55, 0.68, 0.66], [0.85, 0.7, 0.52], [0.76, 0.58, 0.5]],
  roofs: [[0.62, 0.3, 0.2], [0.55, 0.26, 0.18], [0.4, 0.34, 0.3], [0.68, 0.38, 0.22]],
  windowLit: [1.0, 0.78, 0.4], windowDark: [0.16, 0.2, 0.28],
  palmTrunk: [0.42, 0.3, 0.2], palmLeaf: [0.25, 0.52, 0.28],
  lampPost: [0.2, 0.18, 0.2], lampGlow: [1.0, 0.8, 0.45],
  stallWood: [0.5, 0.33, 0.2], stallA: [0.85, 0.3, 0.24], stallB: [0.95, 0.62, 0.2], stallC: [0.3, 0.6, 0.62],
  garageWall: [0.6, 0.58, 0.55], garageDoor: [0.25, 0.45, 0.5],
  farolWhite: [0.95, 0.92, 0.86], farolBand: [0.82, 0.3, 0.22], farolLamp: [1.0, 0.85, 0.45],
  marker: [1.0, 0.75, 0.25],
  crane: [0.16, 0.15, 0.19], container: [[0.75, 0.32, 0.22], [0.25, 0.5, 0.62], [0.85, 0.62, 0.2], [0.4, 0.58, 0.4]],
};

export const WORLD = {
  boulevard: { zHalf: 7, walkHalf: 10.5, xMin: -95, xMax: 95 },
  sideStreet: { x: 20, xHalf: 4.5, walkHalf: 7.5, zMin: -62, zMax: 42 },
  northRoad: { z: -48, zHalf: 5, walkHalf: 8, xMin: -95, xMax: 95 },
  southRoad: { z: 38, zHalf: 5, walkHalf: 8, xMin: -95, xMax: 95 },
  westStreet: { x: -62, xHalf: 5, walkHalf: 8, zMin: -62, zMax: 52 },
  eastStreet: { x: 68, xHalf: 5, walkHalf: 8, zMin: -62, zMax: 52 },
  stall: { x: 25.6, z: 10 },
  garage: { x: 55, z: 13.5, halfX: 6, halfZ: 4.5 },
  farol: { x: -80, z: -34 },
  clockTower: { x: 38, z: -60 },
  docas: { x: -28, z: 58 },
  canal: { xMin: 92, xMax: 104 },
  spawn: { x: -34, z: 9 },
  playerCar: { x: -27, z: 4.6, heading: -Math.PI / 2 },
  policePark: { x: 74, z: -4.6, heading: -Math.PI / 2 },
};

/** Road bands for the minimap: every drivable street, centre + half width. */
export const ROAD_BANDS = {
  h: [
    { z: 0, half: WORLD.boulevard.zHalf },
    { z: WORLD.northRoad.z, half: WORLD.northRoad.zHalf },
    { z: WORLD.southRoad.z, half: WORLD.southRoad.zHalf },
  ],
  v: [
    { x: WORLD.sideStreet.x, half: WORLD.sideStreet.xHalf },
    { x: WORLD.westStreet.x, half: WORLD.westStreet.xHalf },
    { x: WORLD.eastStreet.x, half: WORLD.eastStreet.xHalf },
  ],
};

/** Heading convention for every actor: forward = (-sin h, cos h) in (x, z). */
export function headingTo(dx, dz) { return Math.atan2(-dx, dz); }
export function forwardOf(h) { return [-Math.sin(h), Math.cos(h)]; }
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createCity() {
  const rng = createRng(20261118);
  const b = new MeshBuilder();
  const colliders = []; // {minX, maxX, minZ, maxZ}
  const B = WORLD.boulevard, S = WORLD.sideStreet;
  const NR = WORLD.northRoad, SR = WORLD.southRoad, WS = WORLD.westStreet, ES = WORLD.eastStreet;

  // ---- ground base: warm earth under everything, then the street plates.
  b.groundQuad(-125, -85, 125, 86, -0.05, COL.grass);
  b.groundQuad(-120, -80, -60, -14, -0.02, COL.sand); // harbour apron by the Farol rise
  // Boulevard road + sidewalks.
  b.groundQuad(B.xMin, -B.zHalf, B.xMax, B.zHalf, 0, COL.road);
  b.groundQuad(B.xMin, -B.walkHalf, B.xMax, -B.zHalf, 0.02, COL.walk);
  b.groundQuad(B.xMin, B.zHalf, B.xMax, B.walkHalf, 0.02, COL.walk);
  // Side street road + sidewalks.
  b.groundQuad(S.x - S.xHalf, S.zMin, S.x + S.xHalf, S.zMax, 0.01, COL.road);
  b.groundQuad(S.x - S.walkHalf, S.zMin, S.x - S.xHalf, S.zMax, 0.03, COL.walk);
  b.groundQuad(S.x + S.xHalf, S.zMin, S.x + S.walkHalf, S.zMax, 0.03, COL.walk);
  // The P1-A road grid: two more east–west roads and two more north–south streets,
  // each joining the existing streets at both ends so the network is all loops.
  function hRoad(R) {
    b.groundQuad(R.xMin, R.z - R.zHalf, R.xMax, R.z + R.zHalf, 0, COL.road);
    b.groundQuad(R.xMin, R.z - R.walkHalf, R.xMax, R.z - R.zHalf, 0.02, COL.walk);
    b.groundQuad(R.xMin, R.z + R.zHalf, R.xMax, R.z + R.walkHalf, 0.02, COL.walk);
  }
  function vRoad(R) {
    b.groundQuad(R.x - R.xHalf, R.zMin, R.x + R.xHalf, R.zMax, 0.01, COL.road);
    b.groundQuad(R.x - R.walkHalf, R.zMin, R.x - R.xHalf, R.zMax, 0.03, COL.walk);
    b.groundQuad(R.x + R.xHalf, R.zMin, R.x + R.xHalf, R.zMax, 0.03, COL.walk);
  }
  hRoad(NR); hRoad(SR); vRoad(WS); vRoad(ES);
  // Junction plates where the new streets cross, so intersections read as one surface.
  for (const vx of [WS.x, S.x, ES.x]) for (const hz of [NR.z, 0, SR.z]) {
    if (vx === S.x && hz === 0) continue; // the P0 crossing below already paints it
    b.groundQuad(vx - 5, hz - 5, vx + 5, hz + 5, 0.035, COL.road);
  }
  // Centre lines (dashed, emissive paint catches the light).
  for (let x = B.xMin + 4; x < B.xMax - 2; x += 8) {
    if (Math.abs(x - S.x) < 8) continue;
    b.groundQuad(x, -0.35, x + 3.6, 0.35, 0.04, COL.roadLine, { emissive: true });
  }
  for (let z = S.zMin + 4; z < S.zMax - 2; z += 8) {
    if (Math.abs(z) < 10) continue;
    b.groundQuad(S.x - 0.3, z, S.x + 0.3, z + 3.4, 0.045, COL.roadLine, { emissive: true });
  }
  for (const R of [NR, SR]) {
    for (let x = R.xMin + 4; x < R.xMax - 2; x += 8) {
      if (Math.abs(x - S.x) < 8 || Math.abs(x - WS.x) < 8 || Math.abs(x - ES.x) < 8) continue;
      b.groundQuad(x, R.z - 0.3, x + 3.6, R.z + 0.3, 0.04, COL.roadLine, { emissive: true });
    }
  }
  for (const R of [WS, ES]) {
    for (let z = R.zMin + 4; z < R.zMax - 2; z += 8) {
      if (Math.abs(z) < 10 || Math.abs(z - NR.z) < 8 || Math.abs(z - SR.z) < 8) continue;
      b.groundQuad(R.x - 0.3, z, R.x + 0.3, z + 3.4, 0.045, COL.roadLine, { emissive: true });
    }
  }
  // Crossing at the junction.
  for (let i = 0; i < 5; i++) b.groundQuad(S.x - 3.4 + i * 1.5, -6.6, S.x - 2.2 + i * 1.5, 6.6, 0.04, [0.9, 0.88, 0.82]);

  // ---- a pitched roof drawn with raw triangles: two slopes and two gable ends, the
  // ridge running along the building's longer axis (callers pass w >= d).
  function pitchedRoof(cx, cz, w, d, baseY, roofCol, wallCol) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    if (w >= d) {
      const ridgeY = baseY + Math.min(2.3, d * 0.34);
      const nN = [0, 0.55, -0.83], nS = [0, 0.55, 0.83];
      b.tri([x0, baseY, z0], [x1, baseY, z0], [x1, ridgeY, cz], nN, roofCol, 0);
      b.tri([x0, baseY, z0], [x1, ridgeY, cz], [x0, ridgeY, cz], nN, roofCol, 0);
      b.tri([x0, baseY, z1], [x1, ridgeY, cz], [x1, baseY, z1], nS, roofCol, 0);
      b.tri([x0, baseY, z1], [x0, ridgeY, cz], [x1, ridgeY, cz], nS, roofCol, 0);
      b.tri([x0, baseY, z0], [x0, ridgeY, cz], [x0, baseY, z1], [-1, 0, 0], wallCol, 0);
      b.tri([x1, baseY, z0], [x1, baseY, z1], [x1, ridgeY, cz], [1, 0, 0], wallCol, 0);
    } else {
      // Ridge along z for a building deeper than it is wide (the transposed case).
      const ridgeY = baseY + Math.min(2.3, w * 0.34);
      const nW = [-0.83, 0.55, 0], nE = [0.83, 0.55, 0];
      b.tri([x0, baseY, z0], [cx, ridgeY, z0], [cx, ridgeY, z1], nW, roofCol, 0);
      b.tri([x0, baseY, z0], [cx, ridgeY, z1], [x0, baseY, z1], nW, roofCol, 0);
      b.tri([x1, baseY, z0], [x1, baseY, z1], [cx, ridgeY, z1], nE, roofCol, 0);
      b.tri([x1, baseY, z0], [cx, ridgeY, z1], [cx, ridgeY, z0], nE, roofCol, 0);
      b.tri([x0, baseY, z0], [x1, baseY, z0], [cx, ridgeY, z0], [0, 0, -1], wallCol, 0);
      b.tri([x0, baseY, z1], [cx, ridgeY, z1], [x1, baseY, z1], [0, 0, 1], wallCol, 0);
    }
  }
  // A pyramid cap (the clock tower) — four triangles to an apex.
  function pyramidRoof(cx, cz, half, baseY, apexY, col) {
    const a = [cx, apexY, cz];
    b.tri([cx - half, baseY, cz - half], [cx + half, baseY, cz - half], a, [0, 0.7, -0.7], col, 0);
    b.tri([cx + half, baseY, cz + half], [cx - half, baseY, cz + half], a, [0, 0.7, 0.7], col, 0);
    b.tri([cx + half, baseY, cz - half], [cx + half, baseY, cz + half], a, [0.7, 0.7, 0], col, 0);
    b.tri([cx - half, baseY, cz + half], [cx - half, baseY, cz - half], a, [-0.7, 0.7, 0], col, 0);
  }

  // ---- buildings: two rows on the boulevard, two rows up the side street (the P0
  // district, unchanged), then the expansion rows around the new roads below.
  // `face` picks the street-facing side for the window grid: 0 north (-z), 1 south (+z),
  // 2 east (+x), 3 west (-x); omitted, the P0 rule (face away from the boulevard) applies.
  // `roof` is 'flat' (slab), 'pitched' or 'terraced' (a stepped second tier).
  function building(cx, cz, w, d, floors, wallCol, roofCol, opts = {}) {
    const h = floors * 3.1;
    b.box(cx, h / 2, cz, w, h, d, 0, wallCol);
    if (opts.roof === 'pitched') pitchedRoof(cx, cz, w, d, h, roofCol, wallCol);
    else if (opts.roof === 'terraced') {
      b.box(cx, h + 0.35, cz, w + 0.7, 0.7, d + 0.7, 0, roofCol);
      b.box(cx, h + 1.15, cz, w * 0.58, 0.95, d * 0.58, 0, wallCol, { shade: 0.94 });
      b.box(cx, h + 1.8, cz, w * 0.58 + 0.5, 0.4, d * 0.58 + 0.5, 0, roofCol);
    } else {
      b.box(cx, h + 0.35, cz, w + 0.7, 0.7, d + 0.7, 0, roofCol);
    }
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    // Window grid on the street-facing side: some lit, some dark, all seeded.
    const face = opts.face ?? (cz < 0 ? 1 : 0);
    const alongX = face === 0 || face === 1;
    const span = alongX ? w : d;
    const rows = floors, cols = Math.max(2, Math.floor(span / 2.4));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const off = -span / 2 + (c + 0.5) * (span / cols);
      const wy = 1.7 + r * 3.1;
      const lit = rng.chance(0.55);
      const col = lit ? COL.windowLit : COL.windowDark;
      if (face === 1) b.wallQuad(cx + off, wy, cz + d / 2 + 0.06, 1.1, 1.5, 1, col, { emissive: lit });
      else if (face === 0) b.wallQuad(cx + off, wy, cz - d / 2 - 0.06, 1.1, 1.5, 0, col, { emissive: lit });
      else if (face === 2) b.wallQuad(cx + w / 2 + 0.06, wy, cz + off, 1.1, 1.5, 2, col, { emissive: lit });
      else b.wallQuad(cx - w / 2 - 0.06, wy, cz + off, 1.1, 1.5, 3, col, { emissive: lit });
    }
  }
  // The rows keep gaps where streets cross: Rua das Flores (P0) and, since P1-A, the
  // west and east streets — a gap of 13 leaves the road plate and its kerbs clear.
  const streetGap = (cx) => Math.abs(cx - S.x) > 12 && Math.abs(cx - WS.x) > 13 && Math.abs(cx - ES.x) > 13;
  let x = -88;
  while (x < 84) {
    const w = rng.range(9, 14);
    if (streetGap(x + w / 2)) building(x + w / 2, -17.5, w, 12, 2 + Math.floor(rng.range(0, 3.4)), rng.pick(COL.walls), rng.pick(COL.roofs));
    x += w + rng.range(1.5, 3.5);
  }
  x = -88;
  while (x < 84) {
    const w = rng.range(9, 14);
    const cx = x + w / 2;
    if (streetGap(cx) && Math.abs(cx - WORLD.garage.x) > 11) building(cx, 17.5, w, 12, 2 + Math.floor(rng.range(0, 3.4)), rng.pick(COL.walls), rng.pick(COL.roofs));
    x += w + rng.range(1.5, 3.5);
  }
  for (let z = -56; z < 34; z += rng.range(11, 15)) {
    if (Math.abs(z) < 13) continue;
    // Skip placements that would sit on the new north/south road corridors.
    if (Math.abs(z - NR.z) > 14 && Math.abs(z - SR.z) > 14) building(S.x - 13.5, z, 11, 9, 2 + Math.floor(rng.range(0, 3)), rng.pick(COL.walls), rng.pick(COL.roofs));
    if (z !== WORLD.stall.z && Math.abs(z + 4 - NR.z) > 14 && Math.abs(z + 4 - SR.z) > 14) building(S.x + 13.5, z + 4, 11, 9, 2 + Math.floor(rng.range(0, 3)), rng.pick(COL.walls), rng.pick(COL.roofs));
  }

  // ---- Dona Pilar's garage: a low wide shed on the south side, teal door, gold sign.
  const G = WORLD.garage;
  b.box(G.x, 2.2, G.z + 3.4, 13, 4.4, 3.4, 0, COL.garageWall);
  b.box(G.x, 4.7, G.z + 3.4, 13.8, 0.6, 4.4, 0, COL.roofs[2]);
  b.wallQuad(G.x, 1.9, G.z + 1.62, 8.6, 3.4, 0, COL.garageDoor, { emissive: false });
  b.wallQuad(G.x, 4.0, G.z + 1.66, 9.6, 0.8, 0, COL.marker, { emissive: true });
  colliders.push({ minX: G.x - 6.5, maxX: G.x + 6.5, minZ: G.z + 1.8, maxZ: G.z + 5.2 });
  // Delivery apron painted on the ground in front of the door.
  b.groundQuad(G.x - G.halfX, G.z - G.halfZ, G.x + G.halfX, G.z + G.halfZ, 0.05, [0.5, 0.46, 0.34]);

  // ---- festival stalls along the east sidewalk of Rua das Flores. The row starts at
  // the boulevard line itself (z = 0) so no stall stands inside the boulevard
  // crossing: the P0 row (starting at z = -2) put two stalls squarely across both
  // boulevard traffic lanes, which trapped boulevard cars against their west/east
  // faces forever — the P1-A traffic soak exposed it. The mission stall (the middle
  // one) now sits at z = 13 on the same sidewalk, beside the same keeper spot.
  const stallCols = [COL.stallA, COL.stallB, COL.stallC, COL.stallA, COL.stallB];
  WORLD.stallList = [];
  for (let i = 0; i < 5; i++) {
    const sz = 0 + i * 6.5;
    const sx = S.x + S.walkHalf - 1.1;
    b.box(sx, 0.55, sz, 2.2, 1.1, 3.4, 0, COL.stallWood);
    b.box(sx, 2.5, sz, 2.6, 0.18, 3.9, 0, stallCols[i]);
    b.box(sx - 0.9, 1.5, sz - 1.6, 0.16, 2.1, 0.16, 0, COL.stallWood);
    b.box(sx - 0.9, 1.5, sz + 1.6, 0.16, 2.1, 0.16, 0, COL.stallWood);
    b.box(sx, 1.15, sz, 1.6, 0.3, 2.6, 0, stallCols[i], { shade: 0.8 });
    colliders.push({ minX: sx - 1.1, maxX: sx + 1.1, minZ: sz - 1.7, maxZ: sz + 1.7 });
    WORLD.stallList.push({ x: sx, z: sz });
  }
  // The mission stall is the middle one: it carries the package crate.
  WORLD.stall.x = S.x + S.walkHalf - 1.1;
  WORLD.stall.z = 0 + 2 * 6.5;
  b.box(WORLD.stall.x, 1.35, WORLD.stall.z, 0.8, 0.5, 0.8, 0.4, COL.marker, { emissive: true });

  // ---- palms and lamps along the boulevard.
  for (let px = -90; px <= 90; px += 15) {
    for (const side of [-1, 1]) {
      const pz = side * (B.zHalf + 1.1);
      // No palm at a street crossing: its trunk collider would sit in the side
      // street's lane (the west-street lane passes 0.6 m from the px = -60 palm).
      if (Math.abs(px - S.x) < 6 || Math.abs(px - WS.x) < 6 || Math.abs(px - ES.x) < 6) continue;
      b.box(px, 2.2, pz, 0.42, 4.4, 0.42, 0, COL.palmTrunk);
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2 + px;
        b.box(px + Math.cos(a) * 1.05, 4.95 - Math.abs(Math.sin(a)) * 0.35, pz + Math.sin(a) * 1.05, 2.0, 0.13, 0.5, -a, COL.palmLeaf);
      }
      colliders.push({ minX: px - 0.3, maxX: px + 0.3, minZ: pz - 0.3, maxZ: pz + 0.3 });
    }
  }
  for (let px = -84; px <= 84; px += 21) {
    for (const side of [-1, 1]) {
      const pz = side * (B.walkHalf - 0.5);
      b.box(px, 1.9, pz, 0.14, 3.8, 0.14, 0, COL.lampPost);
      b.box(px, 3.95, pz, 0.5, 0.3, 0.5, 0, COL.lampGlow, { emissive: true });
    }
  }

  // ---- the Farol: rocky rise, striped shaft, lamp room, sweeping-gold cap. P1-A
  // raises the shaft well clear of every roofline so the lighthouse reads from the
  // boulevard and from most of the expanded map.
  const F = WORLD.farol;
  b.prism(F.x, 1.2, F.z, 13, 2.4, 9, COL.rock);
  b.prism(F.x, 3.4, F.z, 9.5, 2.2, 9, COL.rock, { shade: 0.9 });
  b.prism(F.x, 11.5, F.z, 2.9, 16.5, 10, COL.farolWhite);
  b.prism(F.x, 7.5, F.z, 2.96, 2.0, 10, COL.farolBand);
  b.prism(F.x, 14.5, F.z, 2.96, 2.0, 10, COL.farolBand);
  b.box(F.x, 20.9, F.z, 3.6, 1.9, 3.6, 0, COL.farolLamp, { emissive: true });
  b.prism(F.x, 22.6, F.z, 2.5, 1.6, 4, COL.farolBand);
  b.box(F.x + 6.5, 1.4, F.z + 5, 5, 2.8, 4, 0.3, COL.walls[4]); // keeper's hut
  b.box(F.x + 6.5, 3.1, F.z + 5, 5.6, 0.5, 4.6, 0.3, COL.roofs[0]);
  colliders.push({ minX: F.x - 4, maxX: F.x + 4, minZ: F.z - 4, maxZ: F.z + 4 });
  colliders.push({ minX: F.x - 13, maxX: F.x - 5, minZ: F.z - 13, maxZ: F.z + 13 });

  // ==================================================================
  // P1-A expansion — everything below is new geometry around the P0
  // district; it consumes the seeded RNG only after every P0 element
  // above has been placed, so the original district is byte-stable.
  // ==================================================================

  const ROOF_KINDS = ['flat', 'pitched', 'terraced', 'pitched', 'flat'];
  function expansionBuilding(cx, cz, w, d, face) {
    const floors = 2 + Math.floor(rng.range(0, 3.6));
    building(cx, cz, w, d, floors, rng.pick(COL.walls), rng.pick(COL.roofs), { face, roof: rng.pick(ROOF_KINDS) });
  }
  // Rows facing Rua do Relógio (north road), both sides.
  x = -88;
  while (x < 84) {
    const w = rng.range(9, 14);
    const cx = x + w / 2;
    if (Math.abs(cx - S.x) > 12 && Math.abs(cx - WS.x) > 13 && Math.abs(cx - ES.x) > 13) expansionBuilding(cx, -33.5, w, 11, 0);
    x += w + rng.range(1.5, 3.5);
  }
  x = -88;
  while (x < 84) {
    const w = rng.range(9, 14);
    const cx = x + w / 2;
    if (Math.abs(cx - S.x) > 12 && Math.abs(cx - WS.x) > 13 && Math.abs(cx - ES.x) > 13 && !(cx > 24 && cx < 52)) expansionBuilding(cx, -63, w, 10, 1);
    x += w + rng.range(1.5, 3.5);
  }
  // Row facing Rua das Docas (south road), south side — the Docas warehouses take the
  // western stretch instead (placed below), so houses start east of the docks.
  x = -88;
  while (x < 84) {
    const w = rng.range(9, 14);
    const cx = x + w / 2;
    if (cx > 4 && Math.abs(cx - S.x) > 12 && Math.abs(cx - WS.x) > 13 && Math.abs(cx - ES.x) > 13) expansionBuilding(cx, 53.5, w, 11, 0);
    x += w + rng.range(1.5, 3.5);
  }
  // The west and east streets need no rows of their own: the horizontal rows above
  // already line every block they pass, and their gaps (streetGap) are the crossings,
  // so the side streets read as cuts through the same dense fabric.

  // ---- Praça do Relógio: a paved square on the north-east corner of Rua do Relógio
  // and Rua das Flores, with the clock tower, a fountain and benches.
  const T = WORLD.clockTower;
  b.groundQuad(26, -66, 50, -52, 0.04, COL.plaza);
  b.box(T.x, 8, T.z, 5.5, 16, 5.5, 0, COL.walls[0]);
  b.box(T.x, 16.6, T.z, 6.4, 1.2, 6.4, 0, COL.roofs[2]);
  b.box(T.x, 18.6, T.z, 6.2, 3.2, 6.2, 0, COL.walls[0], { shade: 0.96 });
  for (const [fx, fz, dir] of [[T.x, T.z + 3.16, 1], [T.x, T.z - 3.16, 0], [T.x + 3.16, T.z, 2], [T.x - 3.16, T.z, 3]]) {
    b.wallQuad(fx, 18.6, fz, 2.7, 2.7, dir, COL.windowLit, { emissive: true });
  }
  pyramidRoof(T.x, T.z, 3.6, 20.2, 23.4, COL.roofs[0]);
  colliders.push({ minX: T.x - 3.2, maxX: T.x + 3.2, minZ: T.z - 3.2, maxZ: T.z + 3.2 });
  b.prism(31, 0.55, -56, 2.3, 1.1, 8, COL.stallC); // fountain basin
  b.prism(31, 1.15, -56, 0.5, 1.3, 6, COL.garageWall);
  colliders.push({ minX: 28.7, maxX: 33.3, minZ: -58.3, maxZ: -53.7 });
  for (const [bx, bz] of [[28, -63], [46, -55], [28, -53], [47, -63]]) {
    b.box(bx, 0.45, bz, 2.2, 0.5, 0.6, 0, COL.stallWood);
  }
  // Lamps around the square and along the new roads.
  for (const [lx, lz] of [[27, -53], [49, -53], [27, -65], [49, -65]]) {
    b.box(lx, 1.9, lz, 0.14, 3.8, 0.14, 0, COL.lampPost);
    b.box(lx, 3.95, lz, 0.5, 0.3, 0.5, 0, COL.lampGlow, { emissive: true });
    colliders.push({ minX: lx - 0.25, maxX: lx + 0.25, minZ: lz - 0.25, maxZ: lz + 0.25 });
  }
  for (let px = -84; px <= 84; px += 28) {
    for (const R of [NR, SR]) {
      if (Math.abs(px - S.x) < 7 || Math.abs(px - WS.x) < 7 || Math.abs(px - ES.x) < 7) continue;
      const pz = R.z + (R === NR ? R.walkHalf - 0.5 : -(R.walkHalf - 0.5));
      b.box(px, 1.9, pz, 0.14, 3.8, 0.14, 0, COL.lampPost);
      b.box(px, 3.95, pz, 0.5, 0.3, 0.5, 0, COL.lampGlow, { emissive: true });
    }
  }
  // Palms along the south road's dock side.
  for (let px = -52; px <= 84; px += 17) {
    if (Math.abs(px - S.x) < 6 || Math.abs(px - ES.x) < 6) continue;
    const pz = SR.z + SR.zHalf + 1.1;
    b.box(px, 2.2, pz, 0.42, 4.4, 0.42, 0, COL.palmTrunk);
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2 + px;
      b.box(px + Math.cos(a) * 1.05, 4.95 - Math.abs(Math.sin(a)) * 0.35, pz + Math.sin(a) * 1.05, 2.0, 0.13, 0.5, -a, COL.palmLeaf);
    }
    colliders.push({ minX: px - 0.3, maxX: px + 0.3, minZ: pz - 0.3, maxZ: pz + 0.3 });
  }

  // ---- the Docas: dock apron, two warehouses, container stacks and the crane
  // silhouette along the south edge, west of Rua das Flores.
  b.groundQuad(-58, 46, 14, 68, 0.015, [0.66, 0.56, 0.44]); // dock apron
  building(-40, 57, 20, 12, 2, COL.walls[4], COL.roofs[2], { face: 0, roof: 'flat' });
  building(-13, 58, 16, 11, 2, COL.garageWall, COL.roofs[2], { face: 0, roof: 'flat' });
  for (let i = 0; i < 8; i++) {
    const cx = -52 + (i % 4) * 7.5, cz = 48.5 + Math.floor(i / 4) * 3.4;
    const col = COL.container[i % COL.container.length];
    b.box(cx, 0.75, cz, 6, 1.5, 2.6, 0, col);
    if (i % 3 === 0) b.box(cx, 2.2, cz, 6, 1.4, 2.6, 0, COL.container[(i + 1) % COL.container.length]);
    colliders.push({ minX: cx - 3, maxX: cx + 3, minZ: cz - 1.3, maxZ: cz + 1.3 });
  }
  const C = WORLD.docas;
  b.box(C.x - 6, 6.5, C.z, 0.7, 13, 0.7, 0, COL.crane);
  b.box(C.x + 6, 6.5, C.z, 0.7, 13, 0.7, 0, COL.crane);
  b.box(C.x - 2, 13.4, C.z, 26, 1.1, 1.1, 0, COL.crane); // jib reaching over the apron
  b.box(C.x - 11.5, 12.6, C.z, 3.4, 2.2, 2.2, 0, COL.crane); // counterweight block
  b.box(C.x + 7.5, 9.5, C.z, 0.14, 7, 0.14, 0, COL.crane); // cable
  b.box(C.x + 7.5, 5.6, C.z, 1.2, 0.9, 1.2, 0, COL.crane); // hook block
  b.box(C.x + 10.5, 13.4, C.z, 0.6, 0.5, 0.6, 0, COL.lampGlow, { emissive: true });
  colliders.push({ minX: C.x - 6.4, maxX: C.x - 5.6, minZ: C.z - 0.4, maxZ: C.z + 0.4 });
  colliders.push({ minX: C.x + 5.6, maxX: C.x + 6.4, minZ: C.z - 0.4, maxZ: C.z + 0.4 });
  // Dock edge beam and the sea beyond it (a flat teal plane, scenery only).
  // P1-C grade: the water warms a step toward the sun, and a few fixed emissive
  // glint strips lie on it — the engine has no specular term, so these pale-gold
  // dashes are the cheap sun path on the harbour, placed once, always the same.
  b.box(-22, 0.5, 67.6, 76, 1.0, 0.8, 0, COL.rock);
  b.groundQuad(-125, 68, 125, 86, -0.35, [0.15, 0.47, 0.52]);
  for (const [gx, gz, gw] of [[-46, 71.5, 15], [-18, 74.5, 10], [8, 72, 18], [38, 76, 12], [-64, 78, 12], [62, 73, 14]]) {
    b.groundQuad(gx - gw / 2, gz, gx + gw / 2, gz + 0.55, -0.30, [1.0, 0.8, 0.48], { emissive: true });
  }

  // ---- the dry canal at the east edge: a sandy bed below street level, crossed by
  // the boulevard and the south road on stone abutments. Scenery only.
  b.groundQuad(WORLD.canal.xMin, -66, WORLD.canal.xMax, 54, -0.3, COL.sand, {});
  b.box(WORLD.canal.xMin - 1, 0.8, -9.5, 2.5, 2.6, 3, 0, COL.rock);
  b.box(WORLD.canal.xMin - 1, 0.8, 9.5, 2.5, 2.6, 3, 0, COL.rock);
  b.box(WORLD.canal.xMin - 1, 0.8, SR.z - 9.5, 2.5, 2.6, 3, 0, COL.rock);
  b.box(WORLD.canal.xMin - 1, 0.8, SR.z + 9.5, 2.5, 2.6, 3, 0, COL.rock);
  b.box(WORLD.canal.xMax + 1, 0.8, -9.5, 2.5, 2.6, 3, 0, COL.rock);
  b.box(WORLD.canal.xMax + 1, 0.8, 9.5, 2.5, 2.6, 3, 0, COL.rock);
  for (const az of [-9.5, 9.5, SR.z - 9.5, SR.z + 9.5]) {
    colliders.push({ minX: WORLD.canal.xMin - 2.2, maxX: WORLD.canal.xMin + 0.2, minZ: az - 1.5, maxZ: az + 1.5 });
  }

  // Sea hint at the far west: a teal plane beyond the apron, with the same
  // fixed glint strips running along it (long in z here, toward the Farol).
  b.groundQuad(-220, -90, -118, 80, -0.4, [0.15, 0.47, 0.52]);
  for (const [gx, gz, gl] of [[-150, -30, 16], [-168, 4, 11], [-138, 30, 19], [-185, -52, 13]]) {
    b.groundQuad(gx, gz - gl / 2, gx + 0.55, gz + gl / 2, -0.35, [1.0, 0.8, 0.48], { emissive: true });
  }

  return { builder: b, colliders };
}

/** Push a circle (x, z, radius) out of every building box; returns corrected [x, z]. */
export function collide(colliders, x, z, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * radius;
        z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: leave by the shallowest side.
        const left = x - c.minX, right = c.maxX - x, top = z - c.minZ, bot = c.maxZ - z;
        const m = Math.min(left, right, top, bot);
        if (m === left) x = c.minX - radius;
        else if (m === right) x = c.maxX + radius;
        else if (m === top) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  return [x, z];
}

/** Clamp any actor inside the playable ground. */
export function clampWorld(x, z) {
  return [Math.max(-116, Math.min(116, x)), Math.max(-74, Math.min(66, z))];
}

/**
 * Line-of-sight blockage (P1-B): is the 2D segment (x1, z1) → (x2, z2) cut by any
 * building-sized collider? Slab test per AABB against the segment's [0, 1] range.
 * Only colliders at least 2.5 m in both axes count as occluders — that is the
 * buildings, the garage, the warehouses and the container stacks; palms, lamps,
 * stalls and posts are too thin to hide a man or a car and are skipped. The first
 * and last 1.2 m of the segment are ignored, so standing flush against a wall
 * never blocks your own view (or a unit's view of a player at its bumper).
 */
export function losBlocked(colliders, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.001) return false;
  const tLo = 1.2 / len, tHi = 1 - 1.2 / len;
  for (const c of colliders) {
    if (c.maxX - c.minX < 2.5 || c.maxZ - c.minZ < 2.5) continue;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-9) { if (x1 < c.minX || x1 > c.maxX) continue; }
    else {
      let ta = (c.minX - x1) / dx, tb = (c.maxX - x1) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (z1 < c.minZ || z1 > c.maxZ) continue; }
    else {
      let ta = (c.minZ - z1) / dz, tb = (c.maxZ - z1) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
      if (tmin > tmax) continue;
    }
    if (tmax >= tLo && tmin <= tHi) return true;
  }
  return false;
}
