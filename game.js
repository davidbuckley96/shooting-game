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

const castle = { x: CX, y: CY, hp: 300, maxHp: 300, r: 55 };
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
const archerStats = lvl => ({ dmg: 8 + 5 * (lvl - 1), rate: 0.85 - 0.12 * (lvl - 1), range: 185 + 18 * (lvl - 1), maxHp: 80 + 40 * (lvl - 1) });
const farmIncome  = lvl => 20 + 15 * (lvl - 1);
const barracksStats = lvl => ({ count: 1 + lvl, sHp: 34 + 12 * (lvl - 1), sDmg: 6 + 2 * (lvl - 1), maxHp: 100 + 40 * (lvl - 1) });
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
