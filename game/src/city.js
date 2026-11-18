// Porto Lume, built once from a fixed seed: one wide boulevard (Avenida do Farol) running
// east–west, one side street (Rua das Flores) crossing it, rows of original low-poly
// buildings with lit windows, palm trees, the festival stalls, Dona Pilar's garage, and the
// Farol lighthouse on its rocky rise at the west end — the city's focal point. This module
// owns the static geometry and the collision boxes; it knows nothing about actors.

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
};

export const WORLD = {
  boulevard: { zHalf: 7, walkHalf: 10.5, xMin: -95, xMax: 95 },
  sideStreet: { x: 20, xHalf: 4.5, walkHalf: 7.5, zMin: -62, zMax: 42 },
  stall: { x: 25.6, z: 10 },
  garage: { x: 55, z: 13.5, halfX: 6, halfZ: 4.5 },
  farol: { x: -80, z: -34 },
  spawn: { x: -34, z: 9 },
  playerCar: { x: -27, z: 4.6, heading: -Math.PI / 2 },
  policePark: { x: 74, z: -4.6, heading: -Math.PI / 2 },
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

  // ---- ground base: warm earth under everything, then the street plates.
  b.groundQuad(-120, -80, 120, 70, -0.05, COL.grass);
  b.groundQuad(-120, -80, -60, -14, -0.02, COL.sand); // harbour apron by the Farol rise
  // Boulevard road + sidewalks.
  b.groundQuad(B.xMin, -B.zHalf, B.xMax, B.zHalf, 0, COL.road);
  b.groundQuad(B.xMin, -B.walkHalf, B.xMax, -B.zHalf, 0.02, COL.walk);
  b.groundQuad(B.xMin, B.zHalf, B.xMax, B.walkHalf, 0.02, COL.walk);
  // Side street road + sidewalks.
  b.groundQuad(S.x - S.xHalf, S.zMin, S.x + S.xHalf, S.zMax, 0.01, COL.road);
  b.groundQuad(S.x - S.walkHalf, S.zMin, S.x - S.xHalf, S.zMax, 0.03, COL.walk);
  b.groundQuad(S.x + S.xHalf, S.zMin, S.x + S.walkHalf, S.zMax, 0.03, COL.walk);
  // Centre lines (dashed, emissive paint catches the light).
  for (let x = B.xMin + 4; x < B.xMax - 2; x += 8) {
    if (Math.abs(x - S.x) < 8) continue;
    b.groundQuad(x, -0.35, x + 3.6, 0.35, 0.04, COL.roadLine, { emissive: true });
  }
  for (let z = S.zMin + 4; z < S.zMax - 2; z += 8) {
    if (Math.abs(z) < 10) continue;
    b.groundQuad(S.x - 0.3, z, S.x + 0.3, z + 3.4, 0.045, COL.roadLine, { emissive: true });
  }
  // Crossing at the junction.
  for (let i = 0; i < 5; i++) b.groundQuad(S.x - 3.4 + i * 1.5, -6.6, S.x - 2.2 + i * 1.5, 6.6, 0.04, [0.9, 0.88, 0.82]);

  // ---- buildings: two rows on the boulevard, two rows up the side street.
  function building(cx, cz, w, d, floors, wallCol, roofCol) {
    const h = floors * 3.1;
    b.box(cx, h / 2, cz, w, h, d, 0, wallCol);
    b.box(cx, h + 0.35, cz, w + 0.7, 0.7, d + 0.7, 0, roofCol);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    // Window grid on the street-facing side(s): some lit, some dark, all seeded.
    const rows = floors, cols = Math.max(2, Math.floor(w / 2.4));
    const faceZ = cz < 0 ? cz + d / 2 + 0.06 : cz - d / 2 - 0.06;
    const dir = cz < 0 ? 1 : 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = cx - w / 2 + (c + 0.5) * (w / cols);
      const wy = 1.7 + r * 3.1;
      const lit = rng.chance(0.55);
      b.wallQuad(wx, wy, faceZ, 1.1, 1.5, dir, lit ? COL.windowLit : COL.windowDark, { emissive: lit });
    }
  }
  let x = -88;
  while (x < 84) {
    const w = rng.range(9, 14);
    if (Math.abs(x + w / 2 - S.x) > 12) building(x + w / 2, -17.5, w, 12, 2 + Math.floor(rng.range(0, 3.4)), rng.pick(COL.walls), rng.pick(COL.roofs));
    x += w + rng.range(1.5, 3.5);
  }
  x = -88;
  while (x < 84) {
    const w = rng.range(9, 14);
    const cx = x + w / 2;
    if (Math.abs(cx - S.x) > 12 && Math.abs(cx - WORLD.garage.x) > 11) building(cx, 17.5, w, 12, 2 + Math.floor(rng.range(0, 3.4)), rng.pick(COL.walls), rng.pick(COL.roofs));
    x += w + rng.range(1.5, 3.5);
  }
  for (let z = -56; z < 34; z += rng.range(11, 15)) {
    if (Math.abs(z) < 13) continue;
    building(S.x - 13.5, z, 11, 9, 2 + Math.floor(rng.range(0, 3)), rng.pick(COL.walls), rng.pick(COL.roofs));
    if (z !== WORLD.stall.z) building(S.x + 13.5, z + 4, 11, 9, 2 + Math.floor(rng.range(0, 3)), rng.pick(COL.walls), rng.pick(COL.roofs));
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

  // ---- festival stalls along the east sidewalk of Rua das Flores.
  const stallCols = [COL.stallA, COL.stallB, COL.stallC, COL.stallA, COL.stallB];
  WORLD.stallList = [];
  for (let i = 0; i < 5; i++) {
    const sz = -2 + i * 6.5;
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
  WORLD.stall.z = -2 + 2 * 6.5;
  b.box(WORLD.stall.x, 1.35, WORLD.stall.z, 0.8, 0.5, 0.8, 0.4, COL.marker, { emissive: true });

  // ---- palms and lamps along the boulevard.
  for (let px = -90; px <= 90; px += 15) {
    for (const side of [-1, 1]) {
      const pz = side * (B.zHalf + 1.1);
      if (Math.abs(px - S.x) < 6) continue;
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

  // ---- the Farol: rocky rise, striped shaft, lamp room, sweeping-gold cap.
  const F = WORLD.farol;
  b.prism(F.x, 1.2, F.z, 13, 2.4, 9, COL.rock);
  b.prism(F.x, 3.4, F.z, 9.5, 2.2, 9, COL.rock, { shade: 0.9 });
  b.prism(F.x, 8.6, F.z, 2.5, 8.4, 10, COL.farolWhite);
  b.prism(F.x, 8.6, F.z, 2.56, 1.7, 10, COL.farolBand);
  b.prism(F.x, 13.6, F.z, 3.1, 1.6, 10, COL.farolBand);
  b.box(F.x, 15.1, F.z, 3.4, 1.6, 3.4, 0, COL.farolLamp, { emissive: true });
  b.prism(F.x, 16.4, F.z, 2.4, 1.2, 4, COL.farolBand);
  b.box(F.x + 6.5, 1.4, F.z + 5, 5, 2.8, 4, 0.3, COL.walls[4]); // keeper's hut
  b.box(F.x + 6.5, 3.1, F.z + 5, 5.6, 0.5, 4.6, 0.3, COL.roofs[0]);
  colliders.push({ minX: F.x - 4, maxX: F.x + 4, minZ: F.z - 4, maxZ: F.z + 4 });
  colliders.push({ minX: F.x - 13, maxX: F.x - 5, minZ: F.z - 13, maxZ: F.z + 13 });

  // Sea hint at the far west: a teal plane beyond the apron.
  b.groundQuad(-220, -90, -118, 80, -0.4, [0.16, 0.45, 0.5]);

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
  return [Math.max(-112, Math.min(112, x)), Math.max(-72, Math.min(64, z))];
}
