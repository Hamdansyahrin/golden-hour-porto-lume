// The HUD: DOM panels driven by game state — the mission card (kicker, title and
// objectives come from missions.js's missionView, so the four-mission chain, the
// escort, the collect run and side runs all read correctly), the CALOR star
// meter with its sight state, the money purse, the vehicle card with its
// speedometer, the bust meter, prompts, dialogue and the card overlays for
// title / detained / job-done and the mission intro & fail card (screen
// 'card', filled from G.card; the job-done card is filled from G.lastDone).
// Text is only rewritten when it changes, so a frame allocates nothing in the
// steady state.

import { CALOR_LABEL, missionView } from './missions.js';
import { WORLD } from './city.js';

/** Format a live mission timer as m:ss for the objective line. */
function fmtTimer(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud() {
  const el = (id) => document.getElementById(id);
  const mKicker = el('mKicker'), mTitle = el('mTitle');
  const mObj = el('mObj'), mNext = el('mNext'), stars = el('stars'), sight = el('sightState');
  const money = el('money'), district = el('district'), prompt = el('prompt'), dialogue = el('dialogue');
  const vCard = el('vehicleCard'), vName = el('vName'), vSpeed = el('vSpeed');
  const bustBar = el('bustBar'), bustFill = el('bustFill'), bustLabel = el('bustLabel');
  const titleCard = el('titleCard'), bustedCard = el('bustedCard'), doneCard = el('doneCard');
  const introCard = el('introCard'), cardKicker = el('cardKicker'), cardTitle = el('cardTitle');
  const cardBody = el('cardBody'), cardGo = el('cardGo');
  const doneText = el('doneText'), donePay = el('donePay');
  const status = el('status');
  const cache = new Map();
  function set(elm, key, text) {
    if (!elm) return;
    if (cache.get(key) !== text) { cache.set(key, text); elm.textContent = text; }
  }
  function setHtml(elm, key, html) {
    if (!elm) return;
    if (cache.get(key) !== html) { cache.set(key, html); elm.innerHTML = html; }
  }
  function toggle(elm, key, show) {
    if (!elm) return;
    const v = show ? 'show' : 'hide';
    if (cache.get(key) !== v) { cache.set(key, v); elm.classList.toggle('hidden', !show); }
  }

  return {
    /** Push the current game state into the DOM. */
    update(G) {
      const view = missionView(G);
      set(mKicker, 'mkicker', view.kicker);
      set(mTitle, 'mtitle', view.title);
      const objText = G.timer != null ? `${view.obj} · ⏱ ${fmtTimer(G.timer)}` : view.obj;
      set(mObj, 'obj', objText);
      set(mNext, 'next', 'Seguinte: ' + view.next);
      // CALOR stars (P1-C polish): lit stars are filled red glyphs, unlit ones
      // are hollow outlines — the count reads at a glance (and at contact-sheet
      // scale) instead of five identical glyphs in two shades of brown/red.
      let starHtml = '';
      for (let i = 1; i <= 5; i++) starHtml += i <= G.wanted ? '<span class="on">★</span>' : '☆';
      setHtml(stars, 'stars', starHtml);
      // Sight state (real LOS since P1-B) + the response doctrine for this level,
      // so the escalation is readable at a glance: stars, À VISTA / FORA DE VISTA,
      // and what the PMPL does next at this CALOR.
      set(sight, 'sight', G.wanted === 0 ? '' : (G.cooldownT > 0 ? 'A ARREFECER…' : `${G.seen ? 'À VISTA' : 'FORA DE VISTA'} · ${CALOR_LABEL[G.wanted] ?? ''}`));
      set(money, 'money', `${G.money} lumes`);
      set(district, 'district', G.district ?? '');
      toggle(prompt, 'prompt', !!G.prompt && G.screen === 'play');
      if (G.prompt) setHtml(prompt, 'promptHtml', G.prompt);
      toggle(dialogue, 'dlg', !!G.dialogue && G.screen === 'play');
      if (G.dialogue) setHtml(dialogue, 'dlgHtml', `<span class="who">${G.dialogue.who}:</span> ${G.dialogue.text}`);
      const inCar = G.player.mode === 'car';
      toggle(vCard, 'vcard', inCar && G.screen === 'play');
      if (inCar) {
        set(vName, 'vname', G.playerCar.name + ' · Vela');
        set(vSpeed, 'vspeed', String(Math.round(Math.abs(G.playerCar.speed) * 3.6)));
      }
      const busting = G.bustMeter > 0.05 && G.screen === 'play';
      toggle(bustBar, 'bbar', busting);
      toggle(bustLabel, 'blabel', busting);
      if (busting) bustFill.style.width = `${Math.min(100, (G.bustMeter / 3) * 100)}%`;
      toggle(titleCard, 'title', G.screen === 'title');
      toggle(bustedCard, 'busted', G.screen === 'busted');
      toggle(doneCard, 'done', G.screen === 'done');
      // The completion card is dynamic (P1-D): story and payout of the
      // mission that just finished (G.lastDone), chain line included in M4's.
      if (G.screen === 'done' && G.lastDone) {
        set(doneText, 'doneText', G.lastDone.story);
        setHtml(donePay, 'donePay', `<b>+${G.lastDone.payout} lumes</b> · ${G.lastDone.payText}`);
      }
      // The intro / fail card (screen 'card'), filled from G.card.
      toggle(introCard, 'card', G.screen === 'card');
      if (G.screen === 'card' && G.card) {
        set(cardKicker, 'cardKicker', G.card.kicker);
        set(cardTitle, 'cardTitle', G.card.title);
        set(cardBody, 'cardBody', G.card.body);
        set(cardGo, 'cardGo', G.card.go);
      }
      set(status, 'status', G.screen === 'title' ? 'Golden Hour. Prime Enter para começar.'
        : G.screen === 'busted' ? 'Detido pela PMPL.'
        : G.screen === 'done' ? (G.lastDone ? `Trabalho feito. Mais ${G.lastDone.payout} lumes.` : 'Trabalho feito.')
        : G.screen === 'card' ? (G.card ? G.card.title : 'Novo trabalho.')
        : 'A jogar.');
      void WORLD;
    },
  };
}
