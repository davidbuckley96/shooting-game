'use strict';
/* ============================================================
   Tiny King — Defesa do Reino
   Jogo de defesa de reino inspirado no gênero mostrado nos
   famosos "anúncios falsos" de jogos mobile. Arte procedural,
   sem dependências. Mobile-first (toque) + teclado no desktop.
   ============================================================ */

// ---------------- Canvas & viewport ----------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.round(VW * DPR);
  canvas.height = Math.round(VH * DPR);
  lightCanvas.width = canvas.width;
  lightCanvas.height = canvas.height;
}
const lightCanvas = document.createElement('canvas');
const lctx = lightCanvas.getContext('2d');
addEventListener('resize', resize);

// ---------------- Helpers ----------------
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

// ---------------- Áudio (síntese WebAudio) ----------------
let actx = null, muted = false;
function audioCtx() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
  return actx;
}
function beep(freq, dur = 0.08, type = 'square', vol = 0.14, slide = 0, delay = 0) {
  if (muted) return; const ac = audioCtx(); if (!ac) return;
  try {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}
const sfx = {
  coin:  () => beep(920, .07, 'square', .10, 400),
  build: () => { beep(280, .09, 'triangle', .2, 160); beep(470, .12, 'triangle', .2, 200, .08); },
  hit:   () => beep(170, .05, 'sawtooth', .09, -70),
  swing: () => beep(500, .05, 'triangle', .07, -250),
  hurt:  () => beep(120, .12, 'sawtooth', .16, -60),
  die:   () => beep(300, .2, 'square', .12, -240),
  horn:  () => { beep(196, .35, 'sawtooth', .18, 0); beep(147, .5, 'sawtooth', .18, 0, .3); },
  dawn:  () => { beep(392, .15, 'triangle', .14, 0); beep(523, .25, 'triangle', .14, 0, .14); },
  boss:  () => { beep(98, .5, 'sawtooth', .22, -30); beep(73, .7, 'sawtooth', .22, 0, .4); },
  lose:  () => { beep(220, .3, 'sawtooth', .18, -60); beep(165, .4, 'sawtooth', .18, -60, .25); beep(110, .8, 'sawtooth', .18, -50, .55); },
  upgrade: () => { beep(392, .08, 'square', .12, 0); beep(523, .08, 'square', .12, 0, .08); beep(659, .12, 'square', .12, 0, .16); },
};

// ---------------- Mundo & estado ----------------
const WORLD = { w: 1400, h: 1400 };
const CX = WORLD.w / 2, CY = WORLD.h / 2;

let state = 'menu';            // menu | day | night | gameover
let night = 1;
let coins = 90;
let timeScale = 1;
let darkness = 0;
let shake = 0;
let stats = { kills: 0 };
let best = 0;
try { best = parseInt(localStorage.getItem('tinyking.best') || '0', 10) || 0; } catch (e) {}

const castle = { x: CX, y: CY, hp: 400, maxHp: 400, r: 55 };
const king = { x: CX, y: CY + 100, hp: 70, maxHp: 70, dead: false, respawn: 0, face: 1, swing: 0, swingA: 0, cd: 0, bob: 0, vx: 0, vy: 0 };
const cam = { x: CX, y: CY };

// Canteiros de construção (2 anéis ao redor do castelo)
const plots = [];
for (let i = 0; i < 6; i++) {
  const a = i * TAU / 6 + 0.28;
  plots.push({ x: CX + Math.cos(a) * 175, y: CY + Math.sin(a) * 175, type: null, level: 0, hp: 0, maxHp: 0, cd: 0 });
}
for (let i = 0; i < 8; i++) {
  const a = i * TAU / 8;
  plots.push({ x: CX + Math.cos(a) * 315, y: CY + Math.sin(a) * 315, type: null, level: 0, hp: 0, maxHp: 0, cd: 0 });
}

// Decoração (árvores, pedras, manchas de grama)
const decor = { trees: [], rocks: [], patches: [] };
(function genDecor() {
  const clearOf = (x, y, r) => {
    if (dist(x, y, CX, CY) < 400) return false;
    for (const p of plots) if (dist(x, y, p.x, p.y) < 70) return false;
    return true;
  };
  let guard = 0;
  while (decor.trees.length < 52 && guard++ < 3000) {
    const x = rand(40, WORLD.w - 40), y = rand(40, WORLD.h - 40);
    if (clearOf(x, y)) decor.trees.push({ x, y, s: rand(0.75, 1.35), h: rand(-12, 12) });
  }
  guard = 0;
  while (decor.rocks.length < 14 && guard++ < 2000) {
    const x = rand(60, WORLD.w - 60), y = rand(60, WORLD.h - 60);
    if (clearOf(x, y)) decor.rocks.push({ x, y, s: rand(0.7, 1.5) });
  }
  for (let i = 0; i < 70; i++) {
    decor.patches.push({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), r: rand(18, 60), a: rand(0.04, 0.1) });
  }
})();

// Entidades dinâmicas
let enemies = [], soldiers = [], arrows = [], coinDrops = [], parts = [], floats = [];
let nightPlan = { queue: [], t: 0 };

// ---------------- Definições de construções ----------------
const BUILD = {
  archer:   { name: 'Torre', emoji: '🏹', cost: 50 },
  farm:     { name: 'Fazenda', emoji: '🌾', cost: 40 },
  barracks: { name: 'Quartel', emoji: '⛺', cost: 80 },
};
const archerStats = lvl => ({ dmg: 10 + 6 * (lvl - 1), rate: 0.7 - 0.1 * (lvl - 1), range: 200 + 20 * (lvl - 1), maxHp: 80 + 40 * (lvl - 1) });
const farmIncome  = lvl => 20 + 15 * (lvl - 1);
const barracksStats = lvl => ({ count: 1 + lvl, sHp: 46 + 14 * (lvl - 1), sDmg: 8 + 2 * (lvl - 1), maxHp: 100 + 40 * (lvl - 1) });
const upgradeCost = (type, lvl) => Math.round(BUILD[type].cost * 1.1 * lvl);
const MAX_LEVEL = 3;

// ---------------- Entrada: joystick virtual + teclado ----------------
const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
const keys = {};
canvas.addEventListener('pointerdown', e => {
  audioCtx();
  if (joy.active) return;
  joy.active = true; joy.id = e.pointerId;
  joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
  joy.dx = joy.dy = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!joy.active || e.pointerId !== joy.id) return;
  joy.x = e.clientX; joy.y = e.clientY;
  let dx = joy.x - joy.ox, dy = joy.y - joy.oy;
  const len = Math.hypot(dx, dy), max = 56;
  if (len > max) {
    // a base do joystick segue o dedo (estilo "floating")
    joy.ox = joy.x - dx / len * max;
    joy.oy = joy.y - dy / len * max;
    dx = dx / len * max; dy = dy / len * max;
  }
  const dead = 6;
  if (len < dead) { joy.dx = 0; joy.dy = 0; }
  else { joy.dx = dx / max; joy.dy = dy / max; }
});
const joyEnd = e => {
  if (joy.active && e.pointerId === joy.id) { joy.active = false; joy.dx = joy.dy = 0; }
};
canvas.addEventListener('pointerup', joyEnd);
canvas.addEventListener('pointercancel', joyEnd);
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if ((e.key === 'n' || e.key === 'N') && state === 'day') startNight();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
function inputVector() {
  let dx = joy.dx, dy = joy.dy;
  if (keys['arrowleft'] || keys['a']) dx -= 1;
  if (keys['arrowright'] || keys['d']) dx += 1;
  if (keys['arrowup'] || keys['w']) dy -= 1;
  if (keys['arrowdown'] || keys['s']) dy += 1;
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  return { dx, dy };
}

// ---------------- Referências de UI ----------------
const $ = id => document.getElementById(id);
const uiCoins = $('uiCoins'), uiNight = $('uiNight'), uiCastle = $('uiCastle');
const nightBtn = $('nightBtn'), buildPanel = $('buildPanel'), hintEl = $('hint');
const menuEl = $('menu'), overEl = $('over'), overText = $('overText'), menuBest = $('menuBest');
$('playBtn').addEventListener('click', () => { audioCtx(); startGame(); });
$('retryBtn').addEventListener('click', () => { audioCtx(); startGame(); });
nightBtn.addEventListener('click', () => { if (state === 'day') startNight(); });
$('muteBtn').addEventListener('click', () => {
  muted = !muted;
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
});
if (best > 0) menuBest.textContent = `🏆 Recorde: ${best} noite${best > 1 ? 's' : ''} sobrevividas`;

// ---------------- Fluxo de jogo ----------------
let hintT = 0;
function showHint(txt, secs = 3) { hintEl.textContent = txt; hintEl.classList.remove('hidden'); hintT = secs; }

function resetGame() {
  night = 1; coins = 90; stats = { kills: 0 };
  castle.hp = castle.maxHp = 400;
  king.x = CX; king.y = CY + 110; king.hp = king.maxHp = 70;
  king.dead = false; king.respawn = 0; king.cd = 0; king.swing = 0; king.face = 1;
  for (const p of plots) { p.type = null; p.level = 0; p.hp = 0; p.maxHp = 0; p.cd = 0; }
  enemies = []; soldiers = []; arrows = []; coinDrops = []; parts = []; floats = [];
  nightPlan = { queue: [], t: 0 };
  darkness = 0; shake = 0;
  cam.x = CX; cam.y = CY + 60;
}
function startGame() {
  resetGame(); state = 'day';
  menuEl.classList.add('hidden'); overEl.classList.add('hidden');
  showHint('Aproxime-se de um canteiro ⭕ para construir', 5);
}
function startNight() {
  if (state !== 'day') return;
  buildNightPlan(night);
  state = 'night';
  sfx.horn();
  showHint(`🌙 Noite ${night} — as hordas chegaram!`, 3);
}
function endNight() {
  sfx.dawn();
  let income = 0;
  for (const p of plots) if (p.type === 'farm') income += farmIncome(p.level);
  if (income > 0) { coins += income; addFloat(castle.x, castle.y - 90, `+${income} 🌾`, '#ffe066'); }
  night++;
  const survived = night - 1;
  if (survived > best) { best = survived; try { localStorage.setItem('tinyking.best', String(best)); } catch (e) {} }
  // amanhecer: rei revive/cura, soldados repostos
  king.dead = false; king.respawn = 0; king.hp = king.maxHp;
  for (const p of plots) if (p.type === 'barracks') replenishSoldiers(p);
  for (const s of soldiers) s.hp = s.maxHp;
  state = 'day';
  showHint(`☀️ Amanheceu! Prepare-se para a noite ${night}`, 4);
}
function gameOver() {
  state = 'gameover';
  sfx.lose();
  const survived = night - 1;
  if (survived > best) { best = survived; try { localStorage.setItem('tinyking.best', String(best)); } catch (e) {} }
  overText.innerHTML =
    `Você sobreviveu a <b>${survived}</b> noite${survived === 1 ? '' : 's'} e derrotou <b>${stats.kills}</b> inimigos.<br>` +
    `🏆 Recorde: <b>${best}</b> noite${best === 1 ? '' : 's'}<br><br>` +
    `<i>O "jogador" daqueles anúncios teria ido bem pior. 😏</i>`;
  overEl.classList.remove('hidden');
}

// ---------------- Waves noturnas ----------------
function buildNightPlan(n) {
  const pool = [];
  const goblins = 3 + Math.ceil(n * 1.8);
  const brutes = n >= 3 ? (n - 2) : 0;
  for (let i = 0; i < goblins; i++) pool.push('goblin');
  for (let i = 0; i < brutes; i++) pool.push('brute');
  for (let i = pool.length - 1; i > 0; i--) { const j = randi(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const evts = [];
  let t = 2.0;
  while (pool.length) {
    evts.push({ t, types: pool.splice(0, randi(2, 4)) });
    t += Math.max(0.9, rand(1.8, 2.6) - n * 0.05);
  }
  if (n % 5 === 0) evts.push({ t: t + 2, types: Array(Math.max(1, Math.floor(n / 5))).fill('boss') });
  nightPlan = { queue: evts, t: 0 };
}
function edgeSpawnPoint() {
  const m = 30, side = randi(0, 3);
  if (side === 0) return { x: rand(m, WORLD.w - m), y: m };
  if (side === 1) return { x: rand(m, WORLD.w - m), y: WORLD.h - m };
  if (side === 2) return { x: m, y: rand(m, WORLD.h - m) };
  return { x: WORLD.w - m, y: rand(m, WORLD.h - m) };
}
function makeEnemy(type, n, x, y) {
  if (type === 'brute') return { type, x, y, r: 16, hp: 55 + 12 * n, maxHp: 55 + 12 * n, spd: 42, dmg: 14 + 2 * n, coin: 12 + n, cd: rand(0, 0.6), face: 1, bob: rand(0, TAU) };
  if (type === 'boss')  return { type, x, y, r: 30, hp: 320 + 120 * n, maxHp: 320 + 120 * n, spd: 32, dmg: 30 + 3 * n, coin: 120, cd: rand(0, 0.6), face: 1, bob: rand(0, TAU) };
  return { type: 'goblin', x, y, r: 11, hp: 16 + 3 * n, maxHp: 16 + 3 * n, spd: 75 + n * 1.5, dmg: 5 + n, coin: 4 + Math.floor(n / 2), cd: rand(0, 0.6), face: 1, bob: rand(0, TAU) };
}
function spawnGroup(types) {
  const p = edgeSpawnPoint();
  for (const t of types) {
    enemies.push(makeEnemy(t, night, p.x + rand(-34, 34), p.y + rand(-34, 34)));
    if (t === 'boss') { sfx.boss(); showHint('⚠️ Um CHEFÃO se aproxima!', 3); }
  }
}

// ---------------- Construção ----------------
function plotMaxHp(p) {
  if (p.type === 'archer') return archerStats(p.level).maxHp;
  if (p.type === 'barracks') return barracksStats(p.level).maxHp;
  if (p.type === 'farm') return 60 + 30 * (p.level - 1);
  return 0;
}
function tryBuild(p, type) {
  if (p.type || !BUILD[type] || coins < BUILD[type].cost) return false;
  coins -= BUILD[type].cost;
  p.type = type; p.level = 1; p.maxHp = plotMaxHp(p); p.hp = p.maxHp; p.cd = 0;
  sfx.build();
  addParts(p.x, p.y - 10, '#e8d8a0', 12, 90, 0.5, 3);
  if (type === 'barracks') replenishSoldiers(p);
  panelSig = '';
  return true;
}
function tryUpgrade(p) {
  if (!p.type || p.level >= MAX_LEVEL) return false;
  const cost = upgradeCost(p.type, p.level);
  if (coins < cost) return false;
  coins -= cost;
  const oldMax = p.maxHp;
  p.level++; p.maxHp = plotMaxHp(p); p.hp += p.maxHp - oldMax;
  sfx.upgrade();
  addParts(p.x, p.y - 20, '#ffd23e', 14, 100, 0.6, 3);
  if (p.type === 'barracks') replenishSoldiers(p);
  panelSig = '';
  return true;
}
function tryRepair(p) {
  const missing = p.maxHp - p.hp;
  if (missing <= 0.5) return false;
  const cost = Math.ceil(missing * 0.35);
  if (coins < cost) return false;
  coins -= cost; p.hp = p.maxHp;
  sfx.build();
  addParts(p.x, p.y - 10, '#9adcff', 10, 80, 0.5, 3);
  panelSig = '';
  return true;
}
function destroyPlot(p) {
  addParts(p.x, p.y - 10, '#5a4632', 22, 140, 0.8, 4);
  addFloat(p.x, p.y - 30, '💥', '#ff7043');
  soldiers = soldiers.filter(s => s.plot !== p);
  p.type = null; p.level = 0; p.hp = 0; p.maxHp = 0;
  sfx.hurt();
  panelSig = '';
}
function replenishSoldiers(p) {
  const st = barracksStats(p.level);
  const mine = soldiers.filter(s => s.plot === p);
  for (const s of mine) { s.maxHp = st.sHp; s.dmg = st.sDmg; }
  for (let i = mine.length; i < st.count; i++) {
    const a = rand(0, TAU);
    soldiers.push({
      plot: p, x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30,
      home: { x: p.x + Math.cos(i * 2.4) * 34, y: p.y + Math.sin(i * 2.4) * 34 },
      r: 10, hp: st.sHp, maxHp: st.sHp, dmg: st.sDmg, cd: rand(0, 0.5), face: 1, bob: rand(0, TAU),
    });
  }
}

// ---------------- Efeitos ----------------
function addParts(x, y, col, n, spd, life, r) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(spd * 0.3, spd);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.35, t: 0, life: rand(life * 0.5, life), col, r: rand(r * 0.5, r) });
  }
  if (parts.length > 400) parts.splice(0, parts.length - 400);
}
function addFloat(x, y, txt, col = '#fff') {
  floats.push({ x, y, txt, col, t: 0 });
  if (floats.length > 50) floats.splice(0, floats.length - 50);
}
function dropCoins(x, y, val) {
  const n = clamp(Math.round(val / 5), 1, 4);
  const each = Math.max(1, Math.round(val / n));
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    coinDrops.push({ x, y, vx: Math.cos(a) * rand(30, 90), vy: -rand(60, 140), val: each, t: 0 });
  }
}

// ---------------- Atualização ----------------
function enemyTargets() {
  const list = [{ o: castle, r: castle.r, kind: 'castle' }];
  for (const p of plots) if (p.type) list.push({ o: p, r: 26, kind: 'plot' });
  for (const s of soldiers) list.push({ o: s, r: 10, kind: 'soldier' });
  if (!king.dead) list.push({ o: king, r: 14, kind: 'king' });
  return list;
}
function nearestEnemy(x, y, maxR) {
  let bd = maxR * maxR, e = null;
  for (const en of enemies) {
    const d = dist2(x, y, en.x, en.y);
    if (d < bd) { bd = d; e = en; }
  }
  return e;
}

function update(dt) {
  const now = performance.now() / 1000;

  // derrota: checagem central (qualquer fonte de dano ao castelo)
  if (castle.hp <= 0) { castle.hp = 0; gameOver(); return; }

  // --- rei ---
  if (king.dead) {
    king.respawn -= dt;
    if (king.respawn <= 0) {
      king.dead = false; king.hp = king.maxHp;
      king.x = castle.x; king.y = castle.y + 80;
      addParts(king.x, king.y, '#ffd23e', 16, 120, 0.6, 3);
    }
  } else {
    const v = inputVector();
    king.x = clamp(king.x + v.dx * 235 * dt, 24, WORLD.w - 24);
    king.y = clamp(king.y + v.dy * 235 * dt, 24, WORLD.h - 24);
    king.moving = (v.dx !== 0 || v.dy !== 0);
    if (v.dx !== 0) king.face = v.dx > 0 ? 1 : -1;
    king.bob += dt * (king.moving ? 14 : 5);
    if (state === 'day') king.hp = Math.min(king.maxHp, king.hp + 12 * dt);
    king.cd -= dt; king.swing = Math.max(0, king.swing - dt);
    const t = nearestEnemy(king.x, king.y, 52);
    if (t && king.cd <= 0) {
      king.cd = 0.45; king.swing = 0.18;
      king.swingA = Math.atan2(t.y - king.y, t.x - king.x);
      t.hp -= 13;
      const kb = 10, d = Math.max(1, dist(king.x, king.y, t.x, t.y));
      t.x += (t.x - king.x) / d * kb; t.y += (t.y - king.y) / d * kb;
      addParts(t.x, t.y, '#fff', 4, 90, 0.25, 2);
      sfx.swing();
    }
  }

  // --- waves ---
  if (state === 'night') {
    nightPlan.t += dt;
    while (nightPlan.queue.length && nightPlan.queue[0].t <= nightPlan.t) {
      spawnGroup(nightPlan.queue.shift().types);
    }
    if (!nightPlan.queue.length && enemies.length === 0) endNight();
  }

  // --- inimigos ---
  const targets = enemyTargets();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp <= 0) {
      stats.kills++;
      dropCoins(e.x, e.y, e.coin);
      addParts(e.x, e.y, e.type === 'boss' ? '#c586ff' : '#7fbf5f', e.type === 'boss' ? 30 : 10, 130, 0.6, 3);
      sfx.die();
      enemies.splice(i, 1);
      continue;
    }
    e.bob += dt * 10; e.cd -= dt;
    // alvo mais próximo
    let bt = null, bd = Infinity;
    for (const t of targets) {
      if (t.o.hp <= 0 || (t.kind === 'king' && king.dead)) continue;
      const d = dist2(e.x, e.y, t.o.x, t.o.y);
      if (d < bd) { bd = d; bt = t; }
    }
    if (!bt) continue;
    const gap = Math.sqrt(bd) - (e.r + bt.r);
    if (gap > 4) {
      const d = Math.sqrt(bd);
      e.x += (bt.o.x - e.x) / d * e.spd * dt;
      e.y += (bt.o.y - e.y) / d * e.spd * dt;
      e.face = bt.o.x > e.x ? 1 : -1;
    } else if (e.cd <= 0) {
      e.cd = 1.0;
      bt.o.hp -= e.dmg;
      addParts(bt.o.x, bt.o.y - 10, '#ff7043', 5, 90, 0.3, 2);
      if (bt.kind === 'castle') {
        shake = 7; sfx.hurt();
      } else if (bt.kind === 'plot') {
        if (bt.o.hp <= 0) destroyPlot(bt.o);
      } else if (bt.kind === 'king') {
        sfx.hurt(); shake = Math.max(shake, 3);
        if (king.hp <= 0) {
          king.dead = true; king.respawn = 5;
          addParts(king.x, king.y, '#ffd23e', 20, 150, 0.8, 3);
          showHint('👑 O rei caiu! Voltando ao castelo…', 3);
        }
      }
    }
  }

  // --- soldados ---
  for (let i = soldiers.length - 1; i >= 0; i--) {
    const s = soldiers[i];
    if (s.hp <= 0) {
      addParts(s.x, s.y, '#7fa8ff', 8, 100, 0.5, 2);
      soldiers.splice(i, 1);
      continue;
    }
    s.bob += dt * 10; s.cd -= dt;
    const e = nearestEnemy(s.home.x, s.home.y, 280);
    if (e) {
      const d = dist(s.x, s.y, e.x, e.y);
      if (d > s.r + e.r + 4) {
        s.x += (e.x - s.x) / d * 88 * dt;
        s.y += (e.y - s.y) / d * 88 * dt;
        s.face = e.x > s.x ? 1 : -1;
      } else if (s.cd <= 0) {
        s.cd = 0.9; e.hp -= s.dmg;
        addParts(e.x, e.y, '#fff', 3, 70, 0.2, 1.5);
      }
    } else {
      const d = dist(s.x, s.y, s.home.x, s.home.y);
      if (d > 6) {
        s.x += (s.home.x - s.x) / d * 70 * dt;
        s.y += (s.home.y - s.y) / d * 70 * dt;
      }
      if (state === 'day') s.hp = Math.min(s.maxHp, s.hp + 6 * dt);
    }
  }

  // --- torres ---
  for (const p of plots) {
    if (p.type !== 'archer') continue;
    p.cd -= dt;
    if (p.cd > 0) continue;
    const st = archerStats(p.level);
    const e = nearestEnemy(p.x, p.y, st.range);
    if (e) {
      p.cd = st.rate;
      arrows.push({ x: p.x, y: p.y - 42, tx: e.x, ty: e.y, target: e, spd: 430, dmg: st.dmg, t: 0 });
      beep(700 + p.level * 100, .04, 'square', .05, -200);
    }
  }

  // --- flechas ---
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.t += dt;
    if (a.target && a.target.hp > 0) { a.tx = a.target.x; a.ty = a.target.y; }
    const d = dist(a.x, a.y, a.tx, a.ty);
    const hitR = (a.target && a.target.hp > 0) ? a.target.r : 6;
    if (d <= Math.max(hitR, a.spd * dt) || a.t > 3) {
      if (a.target && a.target.hp > 0 && d < hitR + 14) {
        a.target.hp -= a.dmg;
        addFloat(a.target.x, a.target.y - a.target.r - 6, String(a.dmg), '#ffe9a8');
        addParts(a.target.x, a.target.y, '#fff', 3, 80, 0.2, 1.5);
        sfx.hit();
      }
      arrows.splice(i, 1);
      continue;
    }
    a.x += (a.tx - a.x) / d * a.spd * dt;
    a.y += (a.ty - a.y) / d * a.spd * dt;
  }

  // --- moedas ---
  for (let i = coinDrops.length - 1; i >= 0; i--) {
    const c = coinDrops[i];
    c.t += dt;
    if (c.t < 0.5) {
      c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 500 * dt;
      c.vx *= 0.96;
    } else if (!king.dead) {
      const d = dist(c.x, c.y, king.x, king.y);
      if (d < 26) {
        coins += c.val;
        addFloat(king.x, king.y - 40, `+${c.val}`, '#ffd23e');
        sfx.coin();
        coinDrops.splice(i, 1);
        continue;
      }
      if (d < 110) {
        const sp = 380 * (1 - d / 130);
        c.x += (king.x - c.x) / d * sp * dt;
        c.y += (king.y - c.y) / d * sp * dt;
      }
    }
    if (c.t > 25) coinDrops.splice(i, 1);
  }

  // --- partículas / textos ---
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy = p.vy * 0.92 + 60 * dt;
    if (p.t > p.life) parts.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt; f.y -= 30 * dt;
    if (f.t > 1.1) floats.splice(i, 1);
  }

  // --- ambiente ---
  const dTarget = state === 'night' ? 0.55 : 0;
  darkness += (dTarget - darkness) * Math.min(1, dt * 1.6);
  shake = Math.max(0, shake - dt * 22);

  // --- câmera ---
  const fx = king.dead ? castle.x : king.x;
  const fy = king.dead ? castle.y : king.y;
  const k = Math.min(1, dt * 5);
  cam.x = lerp(cam.x, fx, k);
  cam.y = lerp(cam.y, fy, k);
  cam.x = WORLD.w <= VW ? WORLD.w / 2 : clamp(cam.x, VW / 2, WORLD.w - VW / 2);
  cam.y = WORLD.h <= VH ? WORLD.h / 2 : clamp(cam.y, VH / 2, WORLD.h - VH / 2);
}

// ---------------- Painel de construção & HUD ----------------
let panelSig = '';
function nearPlot() {
  if (king.dead) return null;
  let bp = null, bd = 72 * 72;
  for (const p of plots) {
    const d = dist2(king.x, king.y, p.x, p.y);
    if (d < bd) { bd = d; bp = p; }
  }
  return bp;
}
function refreshPanel() {
  const p = (state === 'day' || state === 'night') ? nearPlot() : null;
  if (!p) {
    if (panelSig !== 'off') { panelSig = 'off'; buildPanel.classList.add('hidden'); }
    return;
  }
  const idx = plots.indexOf(p);
  let sig, html;
  if (!p.type) {
    const parts2 = Object.entries(BUILD).map(([k, b]) => [k, b, coins >= b.cost]);
    sig = `e${idx}|` + parts2.map(x => x[2] ? 1 : 0).join('');
    if (sig !== panelSig) {
      panelSig = sig;
      buildPanel.innerHTML = '<span class="lbl">Construir:</span>' + parts2.map(([k, b, ok]) =>
        `<button data-act="build" data-type="${k}" ${ok ? '' : 'disabled'}>${b.emoji} ${b.name}<br>🪙${b.cost}</button>`).join('');
      buildPanel.classList.remove('hidden');
    }
  } else {
    const canUp = p.level < MAX_LEVEL;
    const upCost = canUp ? upgradeCost(p.type, p.level) : 0;
    const missing = p.maxHp - p.hp;
    const repCost = Math.ceil(missing * 0.35);
    sig = `b${idx}|${p.type}|${p.level}|${canUp && coins >= upCost ? 1 : 0}|${missing > 0.5 ? (coins >= repCost ? 'r' : 'x') : 0}`;
    if (sig !== panelSig) {
      panelSig = sig;
      let html2 = `<span class="lbl">${BUILD[p.type].emoji} ${BUILD[p.type].name} Nv.${p.level}</span>`;
      html2 += canUp
        ? `<button data-act="up" ${coins >= upCost ? '' : 'disabled'}>⬆️ Melhorar<br>🪙${upCost}</button>`
        : `<span class="lbl">⭐ Máx</span>`;
      if (missing > 0.5) html2 += `<button data-act="rep" ${coins >= repCost ? '' : 'disabled'}>🔨 Reparar<br>🪙${repCost}</button>`;
      buildPanel.innerHTML = html2;
      buildPanel.classList.remove('hidden');
    }
  }
}
buildPanel.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const p = nearPlot();
  if (!p) return;
  const act = btn.dataset.act;
  if (act === 'build') tryBuild(p, btn.dataset.type);
  else if (act === 'up') tryUpgrade(p);
  else if (act === 'rep') tryRepair(p);
});
function updateUI(dt) {
  uiCoins.textContent = coins;
  uiNight.textContent = night;
  uiCastle.textContent = Math.max(0, Math.round(castle.hp / castle.maxHp * 100)) + '%';
  const showNightBtn = state === 'day';
  nightBtn.classList.toggle('hidden', !showNightBtn);
  if (showNightBtn) nightBtn.textContent = `⚔️ Iniciar a Noite ${night}`;
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) hintEl.classList.add('hidden'); }
  refreshPanel();
}

// ---------------- Renderização ----------------
function rr(x, y, w, h, r) { // rounded rect path
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function hpBar(x, y, w, frac, col = '#6f6') {
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(x - w / 2, y, w, 5);
  ctx.fillStyle = frac > 0.4 ? col : '#ff5544';
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * clamp(frac, 0, 1), 3);
}

function drawTree(t) {
  const { x, y, s } = t;
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(x - 3 * s, y - 8 * s, 6 * s, 12 * s);
  ctx.fillStyle = '#3e8a35';
  ctx.beginPath(); ctx.arc(x, y - 22 * s, 15 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4da043';
  ctx.beginPath(); ctx.arc(x - 7 * s, y - 14 * s, 10 * s, 0, TAU); ctx.arc(x + 8 * s, y - 15 * s, 9 * s, 0, TAU); ctx.fill();
}
function drawRock(r0) {
  const { x, y, s } = r0;
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.moveTo(x - 12 * s, y + 5 * s); ctx.lineTo(x - 7 * s, y - 8 * s); ctx.lineTo(x + 3 * s, y - 10 * s);
  ctx.lineTo(x + 12 * s, y - 1 * s); ctx.lineTo(x + 9 * s, y + 6 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b7bdc4';
  ctx.beginPath(); ctx.moveTo(x - 7 * s, y - 8 * s); ctx.lineTo(x + 3 * s, y - 10 * s); ctx.lineTo(x + 4 * s, y - 3 * s); ctx.closePath(); ctx.fill();
}
function drawCastle() {
  const { x, y } = castle;
  // torres laterais
  for (const dx of [-44, 44]) {
    ctx.fillStyle = '#a8a8b6';
    ctx.fillRect(x + dx - 13, y - 48, 26, 62);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.moveTo(x + dx - 17, y - 48); ctx.lineTo(x + dx, y - 74); ctx.lineTo(x + dx + 17, y - 48); ctx.closePath(); ctx.fill();
  }
  // corpo
  ctx.fillStyle = '#b9b9c8';
  ctx.fillRect(x - 48, y - 34, 96, 52);
  // ameias
  ctx.fillStyle = '#a0a0b0';
  for (let i = -4; i <= 4; i += 2) ctx.fillRect(x + i * 11 - 5, y - 42, 10, 9);
  // porta
  ctx.fillStyle = '#6b4a2b';
  ctx.beginPath(); ctx.arc(x, y + 6, 13, Math.PI, 0); ctx.rect(x - 13, y + 6, 26, 12); ctx.fill();
  // bandeira
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x, y - 62); ctx.stroke();
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath(); ctx.moveTo(x, y - 62); ctx.lineTo(x + 18, y - 56); ctx.lineTo(x, y - 50); ctx.closePath(); ctx.fill();
  if (castle.hp < castle.maxHp) hpBar(x, y - 88, 76, castle.hp / castle.maxHp);
}
function drawPlotBase(p) {
  ctx.fillStyle = 'rgba(160,130,80,.35)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 28, 17, 0, 0, TAU); ctx.fill();
  if (!p.type) {
    ctx.strokeStyle = 'rgba(60,50,20,.4)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 28, 17, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(60,50,20,.5)';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('+', p.x, p.y + 11);
  }
}
function drawStructure(p) {
  const { x, y } = p;
  const flagCol = ['#eee', '#4da3ff', '#ffd23e'][p.level - 1] || '#eee';
  if (p.type === 'archer') {
    const h = 44 + 9 * p.level;
    ctx.fillStyle = '#a8a8b6';
    ctx.beginPath();
    ctx.moveTo(x - 15, y + 8); ctx.lineTo(x - 11, y - h); ctx.lineTo(x + 11, y - h); ctx.lineTo(x + 15, y + 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8f8f9e'; ctx.fillRect(x - 16, y - h - 6, 32, 8);
    ctx.fillStyle = '#a0a0b0';
    for (const dx of [-14, -3, 8]) ctx.fillRect(x + dx, y - h - 12, 7, 7);
    // arqueirinho
    ctx.fillStyle = '#3d6b2f'; ctx.beginPath(); ctx.arc(x, y - h - 12, 5, 0, TAU); ctx.fill();
    // bandeira de nível
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 14, y - h - 6); ctx.lineTo(x + 14, y - h - 24); ctx.stroke();
    ctx.fillStyle = flagCol;
    ctx.beginPath(); ctx.moveTo(x + 14, y - h - 24); ctx.lineTo(x + 26, y - h - 20); ctx.lineTo(x + 14, y - h - 16); ctx.closePath(); ctx.fill();
  } else if (p.type === 'farm') {
    ctx.fillStyle = '#8a6b3d'; ctx.fillRect(x - 26, y - 18, 52, 30);
    ctx.strokeStyle = '#6f5530'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(x - 24, y - 12 + i * 7); ctx.lineTo(x + 24, y - 12 + i * 7); ctx.stroke();
    }
    ctx.fillStyle = '#e8c04a';
    for (let i = 0; i < 5 + p.level * 3; i++) {
      const gx = x - 22 + (i * 37) % 44, gy = y - 14 + ((i * 23) % 26);
      ctx.fillRect(gx, gy, 2, 5);
    }
    ctx.fillStyle = '#c65b3a'; // casinha
    ctx.beginPath(); ctx.moveTo(x - 26, y - 18); ctx.lineTo(x - 16, y - 30); ctx.lineTo(x - 6, y - 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0d6b8'; ctx.fillRect(x - 22, y - 18, 12, 10);
    ctx.fillStyle = flagCol; ctx.fillRect(x + 18, y - 26, 8, 5);
  } else if (p.type === 'barracks') {
    ctx.fillStyle = '#4a6fa5';
    ctx.beginPath(); ctx.moveTo(x - 24, y + 10); ctx.lineTo(x, y - 32); ctx.lineTo(x + 24, y + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a5a88';
    ctx.beginPath(); ctx.moveTo(x - 8, y + 10); ctx.lineTo(x, y - 6); ctx.lineTo(x + 8, y + 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 32); ctx.lineTo(x, y - 48); ctx.stroke();
    ctx.fillStyle = flagCol;
    ctx.beginPath(); ctx.moveTo(x, y - 48); ctx.lineTo(x + 12, y - 44); ctx.lineTo(x, y - 40); ctx.closePath(); ctx.fill();
  }
  if (p.hp < p.maxHp) hpBar(x, y - 60, 44, p.hp / p.maxHp);
}
function drawSoldier(s) {
  const b = Math.sin(s.bob) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(s.x, s.y + 8, 8, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a6fa5';
  ctx.beginPath(); ctx.arc(s.x, s.y + b, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd9b0';
  ctx.beginPath(); ctx.arc(s.x, s.y - 8 + b, 5.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath(); ctx.arc(s.x, s.y - 9.5 + b, 5.5, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = '#8a6b3d'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(s.x + 7 * s.face, s.y + 4 + b); ctx.lineTo(s.x + 13 * s.face, s.y - 14 + b); ctx.stroke();
  if (s.hp < s.maxHp) hpBar(s.x, s.y - 22, 20, s.hp / s.maxHp);
}
function drawEnemy(e) {
  const b = Math.sin(e.bob) * 2;
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.8, e.r * 0.9, e.r * 0.4, 0, 0, TAU); ctx.fill();
  if (e.type === 'goblin') {
    ctx.fillStyle = '#5da24b';
    ctx.beginPath(); ctx.arc(e.x, e.y + b, e.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4c8a3c'; // orelhas
    ctx.beginPath();
    ctx.moveTo(e.x - e.r, e.y - 2 + b); ctx.lineTo(e.x - e.r - 7, e.y - 8 + b); ctx.lineTo(e.x - e.r + 3, e.y - 8 + b);
    ctx.moveTo(e.x + e.r, e.y - 2 + b); ctx.lineTo(e.x + e.r + 7, e.y - 8 + b); ctx.lineTo(e.x + e.r - 3, e.y - 8 + b);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(e.x - 4, e.y - 3 + b, 3, 0, TAU); ctx.arc(e.x + 4, e.y - 3 + b, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.arc(e.x - 4 + e.face, e.y - 3 + b, 1.5, 0, TAU); ctx.arc(e.x + 4 + e.face, e.y - 3 + b, 1.5, 0, TAU); ctx.fill();
  } else if (e.type === 'brute') {
    ctx.fillStyle = '#a04a3a';
    ctx.beginPath(); ctx.arc(e.x, e.y + b, e.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8d8a0'; // chifres
    ctx.beginPath();
    ctx.moveTo(e.x - e.r + 2, e.y - 8 + b); ctx.lineTo(e.x - e.r - 6, e.y - 18 + b); ctx.lineTo(e.x - e.r + 8, e.y - 12 + b);
    ctx.moveTo(e.x + e.r - 2, e.y - 8 + b); ctx.lineTo(e.x + e.r + 6, e.y - 18 + b); ctx.lineTo(e.x + e.r - 8, e.y - 12 + b);
    ctx.fill();
    ctx.fillStyle = '#ffdd55';
    ctx.beginPath(); ctx.arc(e.x - 5, e.y - 4 + b, 3, 0, TAU); ctx.arc(e.x + 5, e.y - 4 + b, 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5f2a20'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(e.x - 7, e.y - 9 + b); ctx.lineTo(e.x - 2, e.y - 6 + b);
    ctx.moveTo(e.x + 7, e.y - 9 + b); ctx.lineTo(e.x + 2, e.y - 6 + b); ctx.stroke();
  } else { // boss
    ctx.fillStyle = '#6b3f8f';
    ctx.beginPath(); ctx.arc(e.x, e.y + b, e.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#54307a';
    ctx.beginPath(); ctx.arc(e.x, e.y + b, e.r * 0.72, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2b2b'; // coroa sombria
    for (const dx of [-14, 0, 14]) {
      ctx.beginPath(); ctx.moveTo(e.x + dx - 7, e.y - e.r + 2 + b); ctx.lineTo(e.x + dx, e.y - e.r - 14 + b); ctx.lineTo(e.x + dx + 7, e.y - e.r + 2 + b); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#ff5544';
    ctx.beginPath(); ctx.arc(e.x - 9, e.y - 6 + b, 4.5, 0, TAU); ctx.arc(e.x + 9, e.y - 6 + b, 4.5, 0, TAU); ctx.fill();
  }
  if (e.hp < e.maxHp) hpBar(e.x, e.y - e.r - 12, e.r * 2.4, e.hp / e.maxHp, '#f66');
}
function drawKing() {
  if (king.dead) {
    ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(`👑 ${Math.ceil(king.respawn)}s…`, castle.x, castle.y - 100);
    return;
  }
  const { x, y } = king;
  const b = Math.sin(king.bob) * (king.moving ? 2.4 : 0.8);
  const f = king.face;
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 14, 20, 7, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(x, y); ctx.scale(f, 1);
  // pernas do cavalo
  ctx.strokeStyle = '#6e4527'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  const lp = king.moving ? Math.sin(king.bob) * 5 : 0;
  ctx.beginPath();
  ctx.moveTo(-12, 4 + b * .4); ctx.lineTo(-13 - lp * .5, 15);
  ctx.moveTo(-5, 5 + b * .4);  ctx.lineTo(-4 + lp, 15);
  ctx.moveTo(6, 5 + b * .4);   ctx.lineTo(7 - lp, 15);
  ctx.moveTo(12, 4 + b * .4);  ctx.lineTo(14 + lp * .5, 15);
  ctx.stroke();
  // corpo do cavalo
  ctx.fillStyle = '#8a5a33';
  ctx.beginPath(); ctx.ellipse(0, b * .4, 18, 9, 0, 0, TAU); ctx.fill();
  // pescoço + cabeça
  ctx.beginPath();
  ctx.moveTo(12, -2 + b * .4); ctx.lineTo(22, -14 + b * .4); ctx.lineTo(27, -12 + b * .4); ctx.lineTo(18, 2 + b * .4);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(26, -14 + b * .4, 7, 4.5, -0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5f3d20'; // crina
  ctx.beginPath(); ctx.ellipse(18, -10 + b * .4, 4, 7, 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(28, -15 + b * .4, 1.4, 0, TAU); ctx.fill();
  // cauda
  ctx.strokeStyle = '#5f3d20'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-17, -2 + b * .4); ctx.quadraticCurveTo(-24, 4, -21, 12); ctx.stroke();
  // rei
  ctx.fillStyle = '#c0392b';
  rr(-6, -22 + b, 12, 15, 4); ctx.fill();
  ctx.fillStyle = '#ffd9b0';
  ctx.beginPath(); ctx.arc(0, -28 + b, 6.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd23e'; // coroa
  ctx.beginPath();
  ctx.moveTo(-6, -33 + b); ctx.lineTo(-6, -40 + b); ctx.lineTo(-2.5, -35.5 + b); ctx.lineTo(0, -41 + b);
  ctx.lineTo(2.5, -35.5 + b); ctx.lineTo(6, -40 + b); ctx.lineTo(6, -33 + b);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // espada (golpe)
  if (king.swing > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${king.swing / 0.18})`;
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y - 8, 34, king.swingA - 0.9, king.swingA + 0.9);
    ctx.stroke();
  }
  if (king.hp < king.maxHp) hpBar(x, y - 52, 34, king.hp / king.maxHp, '#ffd23e');
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // fundo fora do mundo
  ctx.fillStyle = '#4b8a3e';
  ctx.fillRect(0, 0, VW, VH);
  const shx = shake > 0 ? rand(-shake, shake) : 0;
  const shy = shake > 0 ? rand(-shake, shake) : 0;
  const ox = Math.round(VW / 2 - cam.x + shx), oy = Math.round(VH / 2 - cam.y + shy);
  ctx.save();
  ctx.translate(ox, oy);
  // chão
  ctx.fillStyle = '#6db84c';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  for (const pa of decor.patches) {
    ctx.fillStyle = `rgba(46,110,40,${pa.a})`;
    ctx.beginPath(); ctx.ellipse(pa.x, pa.y, pa.r, pa.r * 0.6, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#3c6e30'; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, WORLD.w - 6, WORLD.h - 6);
  // bases dos canteiros
  for (const p of plots) drawPlotBase(p);
  // moedas
  for (const c of coinDrops) {
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#b8860b';
    ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, TAU); ctx.stroke();
  }
  // sprites ordenados por Y (profundidade)
  const drawables = [];
  drawables.push({ y: castle.y + 18, fn: drawCastle });
  for (const p of plots) if (p.type) drawables.push({ y: p.y + 10, fn: () => drawStructure(p) });
  for (const t of decor.trees) drawables.push({ y: t.y + 4, fn: () => drawTree(t) });
  for (const r0 of decor.rocks) drawables.push({ y: r0.y + 6, fn: () => drawRock(r0) });
  for (const s of soldiers) drawables.push({ y: s.y + 8, fn: () => drawSoldier(s) });
  for (const e of enemies) drawables.push({ y: e.y + e.r, fn: () => drawEnemy(e) });
  if (state !== 'menu') drawables.push({ y: king.dead ? -9999 : king.y + 15, fn: drawKing });
  drawables.sort((a, b2) => a.y - b2.y);
  for (const d of drawables) d.fn();
  // flechas
  ctx.strokeStyle = '#e8d8a0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (const a of arrows) {
    const d = Math.max(1, dist(a.x, a.y, a.tx, a.ty));
    const ux = (a.tx - a.x) / d, uy = (a.ty - a.y) / d;
    ctx.beginPath(); ctx.moveTo(a.x - ux * 7, a.y - uy * 7); ctx.lineTo(a.x + ux * 7, a.y + uy * 7); ctx.stroke();
  }
  // partículas
  for (const p of parts) {
    ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // textos flutuantes
  ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
  for (const f of floats) {
    ctx.globalAlpha = clamp(1.3 - f.t, 0, 1);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.col;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ---- iluminação noturna ----
  if (darkness > 0.01) {
    lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    lctx.clearRect(0, 0, VW, VH);
    lctx.fillStyle = `rgba(12,16,48,${darkness})`;
    lctx.fillRect(0, 0, VW, VH);
    lctx.globalCompositeOperation = 'destination-out';
    const light = (wx, wy, r) => {
      const sx = wx - cam.x + VW / 2, sy = wy - cam.y + VH / 2;
      if (sx < -r || sy < -r || sx > VW + r || sy > VH + r) return;
      const g = lctx.createRadialGradient(sx, sy, r * 0.15, sx, sy, r);
      g.addColorStop(0, 'rgba(0,0,0,0.95)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.beginPath(); lctx.arc(sx, sy, r, 0, TAU); lctx.fill();
    };
    light(castle.x, castle.y, 240);
    if (!king.dead) light(king.x, king.y, 175);
    for (const p of plots) {
      if (p.type === 'archer') light(p.x, p.y, 200 + 15 * p.level);
      else if (p.type) light(p.x, p.y, 120);
    }
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCanvas, 0, 0, VW, VH);
    // lua
    ctx.globalAlpha = darkness / 0.55;
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath(); ctx.arc(VW - 52, 78, 20, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9d5bd';
    ctx.beginPath(); ctx.arc(VW - 58, 72, 4, 0, TAU); ctx.arc(VW - 46, 84, 3, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- joystick ----
  if (joy.active) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 44, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.beginPath(); ctx.arc(joy.ox + joy.dx * 44, joy.oy + joy.dy * 44, 20, 0, TAU); ctx.fill();
  }
}

// ---------------- Loop principal ----------------
let last = performance.now();
function frame(now) {
  let dt = Math.min((now - last) / 1000, 0.05) * timeScale;
  last = now;
  if (state === 'day' || state === 'night') {
    const steps = Math.max(1, Math.ceil(dt / 0.033));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      update(h);
      if (state === 'gameover') break;
    }
  }
  updateUI(dt);
  render();
  requestAnimationFrame(frame);
}
resize();
requestAnimationFrame(frame);

// evitar zoom/scroll acidental no mobile
document.addEventListener('gesturestart', e => e.preventDefault());
canvas.addEventListener('contextmenu', e => e.preventDefault());

// service worker (apenas em produção/https)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------------- API de debug/testes ----------------
window.__game = {
  get state() { return state; },
  get night() { return night; },
  get coins() { return coins; },
  get enemyCount() { return enemies.length; },
  get soldierCount() { return soldiers.length; },
  get castleHp() { return castle.hp; },
  get kingPos() { return { x: king.x, y: king.y }; },
  get kills() { return stats.kills; },
  get plotInfo() { return plots.map(p => ({ type: p.type, level: p.level })); },
  get timeScale() { return timeScale; },
  set timeScale(v) { timeScale = clamp(v, 0.1, 20); },
  addCoins(n) { coins += n; },
  buildAt(i, type) { const p = plots[i]; if (p && !p.type && BUILD[type]) { coins += BUILD[type].cost; return tryBuild(p, type); } return false; },
  teleport(x, y) { king.x = x; king.y = y; },
  forceNight() { if (state === 'day') startNight(); },
  upgradeAt(i) { const p = plots[i]; if (p && p.type) { coins += upgradeCost(p.type, p.level); return tryUpgrade(p); } return false; },
  repairAll() { for (const p of plots) if (p.type && p.hp < p.maxHp) { coins += Math.ceil((p.maxHp - p.hp) * 0.35); tryRepair(p); } },
  killAll() { for (const e of enemies) e.hp = 0; },
  hurtCastle(n) { castle.hp -= n; },
};
