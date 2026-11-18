// The circular minimap: a canvas dial, north up, that projects Porto Lume's two streets,
// the Farol, and a blip for every actor — Rui (white arrow), the PMPL patrol (flashing
// blue/red), traffic (pale dots), pedestrians (tiny sand dots) and the gold mission
// target. A search ring pulses around Rui while the CALOR is up and he is out of sight.

const RANGE = 105; // world metres shown from centre to rim

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const C = S / 2;
  const scale = (C - 6) / RANGE;
  const px = (wx, cx) => C + (wx - cx) * scale;
  const pz = (wz, cz) => C + (wz - cz) * scale;

  function dot(x, y, r, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    draw(G) {
      const cx = G.player.x, cz = G.player.z;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(C, C, C - 2, 0, Math.PI * 2);
      ctx.clip();
      // Ground and streets.
      ctx.fillStyle = '#31483a';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#3d3a40';
      ctx.fillRect(0, pz(7, cz), S, 14 * scale); // boulevard band
      ctx.fillRect(px(15.5, cx), 0, 9 * scale, S); // side street band
      ctx.fillStyle = '#57707e';
      dot(px(-80, cx), pz(-34, cz), 4, '#57707e');
      // Search ring while wanted and unseen.
      if (G.wanted > 0 && !G.seen && G.cooldownT <= 0) {
        ctx.strokeStyle = 'rgba(255,90,60,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(C, C, 16 + Math.sin(G.time * 3) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Mission target.
      if (G.markerX !== null && G.markerX !== undefined) {
        const mx = px(G.markerX, cx), mz = pz(G.markerZ, cz);
        const d = Math.hypot(mx - C, mz - C);
        const rim = C - 12;
        const kx = d > rim ? C + ((mx - C) / d) * rim : mx;
        const kz = d > rim ? C + ((mz - C) / d) * rim : mz;
        ctx.fillStyle = '#ffbe3c';
        ctx.beginPath();
        ctx.moveTo(kx, kz - 6); ctx.lineTo(kx + 5, kz + 4); ctx.lineTo(kx - 5, kz + 4);
        ctx.closePath(); ctx.fill();
      }
      for (const ped of G.peds) dot(px(ped.x, cx), pz(ped.z, cz), 1.6, '#d8b98a');
      for (const car of G.traffic) dot(px(car.x, cx), pz(car.z, cz), 2.6, '#cfd4d8');
      // The player's own car, when he is out of it.
      if (G.player.mode === 'foot') dot(px(G.playerCar.x, cx), pz(G.playerCar.z, cz), 3, '#37c8d8');
      // Police: alternating blue/red like its light bar.
      const cop = G.police;
      dot(px(cop.x, cx), pz(cop.z, cz), 4, Math.floor(G.time * 2.4) % 2 ? '#3f7dff' : '#ff4030');
      dot(px(cop.x, cx), pz(cop.z, cz), 1.8, '#ffffff');
      // Rui: a white arrow on his heading.
      ctx.translate(C, C);
      ctx.rotate(headingAngle(G.player.heading));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // Rim and north tick.
      ctx.strokeStyle = 'rgba(255,210,130,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd98f';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.fillText('N', C - 3, 13);
    },
  };
}

/** Canvas rotation for an actor heading: north (-z) is up, heading 0 faces +z (south). */
function headingAngle(h) {
  // Forward is (-sin h, cos h); on the dial that vector is (x, +z-down) so the arrow
  // rotation from straight-up (-z) is atan2(fx, -fz).
  const fx = -Math.sin(h), fz = Math.cos(h);
  return Math.atan2(fx, -fz);
}
