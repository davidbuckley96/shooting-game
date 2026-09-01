'use strict';
/* ============================================================
   Tiny King — Defesa do Reino  (v2: tower defense direcional)
   - Rei em SPRITES (arte do David), a pé, espada na mão direita
   - Inimigos vêm de UMA direção por nível, seguindo um caminho
   - Torres de besta INVULNERÁVEIS; alvo dos inimigos é o casarão
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
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
}
addEventListener('resize', resize);

// ---------------- Helpers ----------------
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
// aleatório determinístico p/ decoração
let dseed = 7;
const drnd = () => { dseed = (dseed * 1103515245 + 12345) & 0x7fffffff; return dseed / 0x7fffffff; };
function hxc(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function shade(h, f) {
  const [r, g, b] = hxc(h);
  const m = (v) => f >= 0 ? v + (255 - v) * f : v * (1 + f);
  return `rgba(${m(r) | 0},${m(g) | 0},${m(b) | 0},1)`;
}

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
// ---- música: jiga medieval alegre (sequenciador WebAudio) ----
const N = { D3: 146.83, A2: 110.00, C3: 130.81, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46 };
const MEL = [ // 8 compassos x 6 colcheias (0 = pausa)
  N.D4, N.F4, N.A4, N.D5, N.A4, N.F4,
  N.E4, N.G4, N.A4, N.C5, N.A4, N.G4,
  N.D4, N.F4, N.A4, N.D5, N.A4, N.F4,
  N.E4, N.C5, N.A4, N.G4, N.F4, N.E4,
  N.F4, N.A4, N.D5, N.F5, N.D5, N.A4,
  N.E4, N.G4, N.C5, N.E5, N.C5, N.G4,
  N.D5, N.A4, N.F4, N.D4, N.F4, N.A4,
  N.E4, N.G4, N.E4, N.D4, 0, 0,
];
const BASSO = [N.D3, N.C3, N.D3, N.A2, N.D3, N.C3, N.D3, N.D3]; // 1 por compasso
const STEP = 0.16; // duração da colcheia (s)
let musicGain = null, musicNext = 0, musicStep = 0, musicTimer = null;
function pluck(freq, t, dur = 0.22, vol = 0.07) {
  const ac = actx;
  const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle'; o.frequency.value = freq;
  o2.type = 'square'; o2.frequency.value = freq * 2; // brilho de alaúde
  const g2 = ac.createGain(); g2.gain.value = 0.18;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicGain);
  o.start(t); o.stop(t + dur + 0.02); o2.start(t); o2.stop(t + dur + 0.02);
}
function bordao(freq, t) {
  const ac = actx;
  for (const f of [freq, freq * 1.5]) { // raiz + quinta
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(f === freq ? 0.055 : 0.03, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.45);
  }
}
function tamborim(t, forte) {
  const ac = actx;
  const len = Math.floor(ac.sampleRate * 0.05);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ac.createBufferSource(); s.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2600;
  const g = ac.createGain(); g.gain.value = forte ? 0.05 : 0.028;
  s.connect(f); f.connect(g); g.connect(musicGain);
  s.start(t);
}
function startMusic() {
  const ac = audioCtx();
  if (!ac || musicTimer) return;
  musicGain = ac.createGain();
  musicGain.gain.value = muted ? 0 : 1;
  musicGain.connect(ac.destination);
  musicNext = ac.currentTime + 0.1;
  musicStep = 0;
  musicTimer = setInterval(() => {
    try {
      while (musicNext < ac.currentTime + 0.35) {
        const i = musicStep % MEL.length;
        if (MEL[i]) pluck(MEL[i], musicNext, i % 6 === 0 ? 0.3 : 0.2, i % 6 === 0 ? 0.085 : 0.06);
        if (i % 6 === 0) { bordao(BASSO[Math.floor(i / 6)], musicNext); tamborim(musicNext, true); }
        if (i % 6 === 3) tamborim(musicNext, false);
        musicNext += STEP;
        musicStep++;
      }
    } catch (e) {}
  }, 120);
}

const sfx = {
  coin:  () => beep(920, .07, 'square', .10, 400),
  build: () => { beep(280, .09, 'triangle', .2, 160); beep(470, .12, 'triangle', .2, 200, .08); },
  hit:   () => beep(170, .05, 'sawtooth', .09, -70),
  slash: () => beep(560, .07, 'triangle', .1, -350),
  hurt:  () => beep(120, .12, 'sawtooth', .16, -60),
  die:   () => beep(300, .18, 'square', .1, -240),
  horn:  () => { beep(196, .35, 'sawtooth', .18, 0); beep(147, .5, 'sawtooth', .18, 0, .3); },
  clear: () => { beep(392, .15, 'triangle', .14, 0); beep(523, .18, 'triangle', .14, 0, .14); beep(659, .25, 'triangle', .14, 0, .3); },
  boss:  () => { beep(98, .5, 'sawtooth', .22, -30); beep(73, .7, 'sawtooth', .22, 0, .4); },
  lose:  () => { beep(220, .3, 'sawtooth', .18, -60); beep(165, .4, 'sawtooth', .18, -60, .25); beep(110, .8, 'sawtooth', .18, -50, .55); },
  upgrade: () => { beep(392, .08, 'square', .12, 0); beep(523, .08, 'square', .12, 0, .08); beep(659, .12, 'square', .12, 0, .16); },
};

// ---------------- Sprites do rei ----------------
const SPRITE_NAMES = [
  'corre-frente-a-1','corre-frente-a-2','corre-frente-a-3',
  'corre-frente-b-1','corre-frente-b-2','corre-frente-b-3',
  'corre-direita-1','corre-direita-2','corre-direita-3',
  'corre-costas-1','corre-costas-2','corre-costas-3',
  'corre-costas-b-1','corre-costas-b-2','corre-costas-b-3',
  'corre-costas-diag-1','corre-costas-diag-2','corre-costas-diag-3',
  'ataque-1','ataque-2','ataque-3',
];
const sprites = {};
let spritesReady = false;
(function loadSprites() {
  let left = SPRITE_NAMES.length;
  for (const n of SPRITE_NAMES) {
    const img = new Image();
    img.onload = img.onerror = () => { if (--left === 0) spritesReady = true; };
    img.src = (window.SPRITE_DATA && window.SPRITE_DATA[n]) || ('assets/king/256/' + n + '.png');
    sprites[n] = img;
  }
})();
// animações: qual sequência usar por direção de movimento
const KING_ANIM = {
  frente:     ['corre-frente-a-1', 'corre-frente-a-2', 'corre-frente-a-3'],
  direita:    ['corre-direita-1', 'corre-direita-2', 'corre-direita-3'],
  costas:     ['corre-costas-1', 'corre-costas-2', 'corre-costas-3'],
  costasDiag: ['corre-costas-diag-1', 'corre-costas-diag-2', 'corre-costas-diag-3'],
  costasB:    ['corre-costas-b-1', 'corre-costas-b-2', 'corre-costas-b-3'],
  ataque:     ['ataque-1', 'ataque-2', 'ataque-3'],
};
const KING_IDLE = 'corre-frente-b-2';

// ---------------- Mundo & estado ----------------
const WORLD = { w: 1400, h: 1400 };
const ZOOM = 0.5;               // câmera afastada: visão tática p/ kiting
const vieww = () => VW / ZOOM;
const viewh = () => VH / ZOOM;
const MANOR = { x: 700, y: 600, hp: 400, maxHp: 400 };
const DOOR = { x: 700, y: 672 };

let state = 'menu';        // menu | play | levelend | gameover
let waveNum = 0, waveTotal = 4, waveTimer = 0, wavePhase = 'countdown';
let paused = false;
let freezeT = 0;
let level = 1;
let coins = 80;
let timeScale = 1;
let shake = 0;
let stats = { kills: 0 };
let best = 0;
try { best = parseInt(localStorage.getItem('tinyking.best') || '0', 10) || 0; } catch (e) {}

// ---- meta-progressão persistente (ouro e melhorias compradas no menu) ----
const META_DEFAULT = { gold: 0, mission: 1, atk: 0, hp: 0, tower3: false, mud: false, repair: false, bomb: 0, freeze: 0,
  equip: { arma: 'espada-real', escudo: 'escudo-coroa' } };
let meta = Object.assign({}, META_DEFAULT);
try { meta = Object.assign({}, META_DEFAULT, JSON.parse(localStorage.getItem('tinyking.meta') || '{}')); } catch (e) {}
function saveMeta() { try { localStorage.setItem('tinyking.meta', JSON.stringify(meta)); } catch (e) {} }
const kingDmg = () => 16 + 4 * meta.atk;

// ---- registro de itens do jogo (adicionar novos itens = novas entradas aqui) ----
const ITEMS = {
  'espada-real':  { icon: '🗡️', nome: 'Espada Real', tipo: 'Arma',
                    desc: () => `Golpe em área à frente. Dano ${kingDmg()}, alcance ${KING_RANGE}.` },
  'escudo-coroa': { icon: '🛡️', nome: 'Escudo da Coroa', tipo: 'Escudo',
                    desc: () => 'O brasão real protege o rei em combate.' },
  'arco-real':    { icon: '🏹', nome: 'Arco Real', tipo: 'Arma', locked: true,
                    desc: () => 'Ataque à distância. Será desbloqueado numa atualização futura.' },
  'poder-real':   { icon: '✨', nome: 'Poder Real', tipo: 'Habilidade', locked: true,
                    desc: () => 'Magias do trono. Em breve.' },
  'bomba':        { icon: '💣', nome: 'Bomba', tipo: 'Consumível', qty: () => meta.bomb,
                    desc: () => 'Explode ao redor do rei (70 de dano em área).' },
  'congelar':     { icon: '❄️', nome: 'Gelo Real', tipo: 'Consumível', qty: () => meta.freeze,
                    desc: () => 'Congela todos os inimigos por 5s.' },
  'lama':         { icon: '🟤', nome: 'Lama Pegajosa', tipo: 'Construção', owned: () => meta.mud,
                    desc: () => 'Área que atrasa inimigos. Construível na batalha.' },
  'reparo':       { icon: '🔨', nome: 'Kit de Reparo', tipo: 'Ferramenta', owned: () => meta.repair,
                    desc: () => 'Repara o casarão gastando moedas, perto da porta.' },
  'torre3':       { icon: '🏰', nome: 'Planta: Torre Nv.3', tipo: 'Conhecimento', owned: () => meta.tower3,
                    desc: () => 'Permite melhorar torres até o nível 3.' },
};
const KING_RANGE = 125;            // +30% sobre os 95 originais
const maxTowerLvl = () => meta.tower3 ? 3 : 2;

const king = {
  x: 700, y: 700, hp: 80, maxHp: 80, dead: false, respawn: 0,
  moving: false, dirKey: 'frente', animT: 0, attackT: 0, attackDir: 0, cd: 0, vx: 0, vy: 1,
};
const cam = { x: 700, y: 640 };

// direções de ataque por nível (de onde a horda vem)
const LEVEL_DIRS = [
  { key: 'S',  nome: 'SUL ⬇️',       path: [[700, 1370], [680, 1060], [712, 860], [700, 700]] },
  { key: 'O',  nome: 'OESTE ⬅️',     path: [[30, 830], [300, 805], [520, 765], [700, 700]] },
  { key: 'L',  nome: 'LESTE ➡️',     path: [[1370, 830], [1100, 805], [880, 765], [700, 700]] },
  { key: 'SO', nome: 'SUDOESTE ↙️',  path: [[170, 1370], [380, 1070], [560, 880], [700, 700]] },
  { key: 'SL', nome: 'SUDESTE ↘️',   path: [[1230, 1370], [1020, 1070], [840, 880], [700, 700]] },
  { key: 'N',  nome: 'NORTE ⬆️',     path: [[700, 30], [1130, 250], [1160, 660], [920, 830], [700, 700]] },
];
const levelDir = (n) => LEVEL_DIRS[(n - 1) % LEVEL_DIRS.length];

// construções livres: o jogador ergue torres/lama onde o rei estiver
let builds = [];
const BUILD_GAP = 115;      // distância mínima entre construções
const LANE_CLEAR = 75;      // não pode construir em cima da lane
function distToPath(x, y) {
  const path = levelDir(level).path;
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1];
    const vx = bx - ax, vy = by - ay;
    const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
    best = Math.min(best, dist(x, y, ax + vx * t, ay + vy * t));
  }
  return best;
}
function placeBlockReason(x, y) {
  if (x < 60 || y < 60 || x > WORLD.w - 60 || y > WORLD.h - 60) return 'longe da borda';
  if (dist(x, y, MANOR.x, MANOR.y) < 320) return 'longe do casarão';
  if (distToPath(x, y) < LANE_CLEAR) return 'fora da estrada';
  for (const b of builds) if (dist(x, y, b.x, b.y) < BUILD_GAP) return 'longe de outra construção';
  return null;
}

// decoração fixa
const decor = { pines: [], rocks: [], flowers: [] };
(function genDecor() {
  dseed = 12;
  const clear = (x, y) => {
    if (dist(x, y, MANOR.x, MANOR.y) < 260 || dist(x, y, king.x, 700) < 120) return false;
    for (const d of LEVEL_DIRS) for (const [px, py] of d.path) if (dist(x, y, px, py) < 110) return false;
    return true;
  };
  let g = 0;
  while (decor.pines.length < 26 && g++ < 3000) {
    const x = 50 + drnd() * 1300, y = 50 + drnd() * 1300;
    if (clear(x, y)) decor.pines.push({ x, y, s: .7 + drnd() * .7 });
  }
  g = 0;
  while (decor.rocks.length < 10 && g++ < 2000) {
    const x = 60 + drnd() * 1280, y = 60 + drnd() * 1280;
    if (clear(x, y)) decor.rocks.push({ x, y, s: .7 + drnd() * .8 });
  }
  for (let i = 0; i < 26; i++) decor.flowers.push({ x: drnd() * 1400, y: drnd() * 1400 });
})();

// entidades dinâmicas
let enemies = [], bolts = [], eshots = [], coinDrops = [], parts = [], floats = [];
let wavePlan = { queue: [], t: 0 };

// ---------------- Torres ----------------
const TOWER = {
  cost: 60,
  upCost: lvl => [0, 90, 140][lvl] || 999,
  stats: lvl => ({ dmg: 14 + 10 * (lvl - 1), rate: 0.72 - 0.1 * (lvl - 1), range: 260 + 40 * (lvl - 1) }),
};

// ---------------- Entrada: joystick + teclado ----------------
const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const keys = {};
canvas.addEventListener('pointerdown', e => {
  audioCtx(); startMusic();
  if (joy.active) return;
  joy.active = true; joy.id = e.pointerId;
  joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = joy.dy = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
  const len = Math.hypot(dx, dy), max = 56;
  if (len > max) {
    joy.ox = e.clientX - dx / len * max;
    joy.oy = e.clientY - dy / len * max;
    dx = dx / len * max; dy = dy / len * max;
  }
  if (len < 6) { joy.dx = 0; joy.dy = 0; }
  else { joy.dx = dx / max; joy.dy = dy / max; }
});
const joyEnd = e => { if (joy.active && e.pointerId === joy.id) { joy.active = false; joy.dx = joy.dy = 0; } };
canvas.addEventListener('pointerup', joyEnd);
canvas.addEventListener('pointercancel', joyEnd);
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if ((e.key === 'n' || e.key === 'N') && state === 'prep') startWave();
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
const uiCoins = $('uiCoins'), uiLevel = $('uiNight'), uiManor = $('uiCastle');
const waveBtn = $('nightBtn'), buildPanel = $('buildPanel'), hintEl = $('hint');
const menuEl = $('menu'), overEl = $('over'), overText = $('overText'), menuBest = $('menuBest');
const levelEndEl = $('levelEnd'), levelEndText = $('levelEndText');
const shopEl = $('shop'), uiGold = $('uiGold'), uiMission = $('uiMission');
const consEl = $('consumables');
$('playBtn').addEventListener('click', () => { audioCtx(); startMusic(); startLevel(); });
$('retryBtn').addEventListener('click', () => { audioCtx(); showMenu(); });
$('menuBtn').addEventListener('click', () => { audioCtx(); showMenu(); });
waveBtn.addEventListener('click', () => { if (state === 'play' && wavePhase === 'countdown') waveTimer = 0; });
$('bombBtn').addEventListener('click', () => { audioCtx(); useBomb(); });
$('freezeBtn').addEventListener('click', () => { audioCtx(); useFreeze(); });
const pauseOv = $('pauseOv'), pauseBtn = $('pauseBtn');
pauseBtn.addEventListener('click', () => { if (state === 'play') { paused = true; pauseOv.classList.remove('hidden'); if (musicGain) musicGain.gain.value = 0; } });
$('resumeBtn').addEventListener('click', () => { paused = false; pauseOv.classList.add('hidden'); if (musicGain) musicGain.gain.value = muted ? 0 : 1; });
$('abandonBtn').addEventListener('click', () => {
  // abandonar = perder as moedas coletadas nesta fase (anti-farm)
  paused = false; pauseOv.classList.add('hidden');
  if (musicGain) musicGain.gain.value = muted ? 0 : 1;
  coins = 0;
  showMenu();
});
const invEl = $('inventory'), invList = $('invList');
$('invBtn').addEventListener('click', () => { audioCtx(); renderInventory(); menuEl.classList.add('hidden'); invEl.classList.remove('hidden'); });
$('invCloseBtn').addEventListener('click', () => { invEl.classList.add('hidden'); menuEl.classList.remove('hidden'); });
function invCard(id, extra = '') {
  const it = ITEMS[id];
  if (!it) return '';
  const locked = it.locked;
  return `<div class="invItem${locked ? ' locked' : ''}">` +
    `<span class="si-ico">${locked ? '🔒' : it.icon}</span>` +
    `<span class="si-nome">${it.nome} ${extra}<br><small>${it.desc()}</small></span>` +
    `<span class="invTipo">${it.tipo}</span></div>`;
}
function renderInventory() {
  let html = '<h3>⚔️ Equipado</h3>';
  html += invCard(meta.equip.arma);
  html += invCard(meta.equip.escudo);
  html += '<h3>🎒 Mochila</h3>';
  let any = false;
  for (const [id, it] of Object.entries(ITEMS)) {
    if (id === meta.equip.arma || id === meta.equip.escudo || it.locked) continue;
    if (it.qty) { if (it.qty() > 0) { html += invCard(id, `<b>x${it.qty()}</b>`); any = true; } }
    else if (it.owned && it.owned()) { html += invCard(id); any = true; }
  }
  if (!any) html += '<p style="opacity:.7">Vazia — compre itens no Mercado do Reino.</p>';
  html += '<h3>🔮 Em breve</h3>';
  for (const [id, it] of Object.entries(ITEMS)) if (it.locked) html += invCard(id);
  invList.innerHTML = html;
}
$('muteBtn').addEventListener('click', () => {
  muted = !muted;
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
  if (musicGain) musicGain.gain.value = muted ? 0 : 1;
  if (!muted) startMusic();
});
if (best > 0) menuBest.textContent = `🏆 Recorde: nível ${best}`;

// ---- mercado do menu principal ----
function shopItems() {
  return [
    { id: 'atk', icon: '⚔️', nome: `Golpe +4 de dano`, extra: `Nv.${meta.atk}/5`, cost: 40 + 30 * meta.atk, ok: meta.atk < 5,
      buy: () => meta.atk++ },
    { id: 'hp', icon: '❤️', nome: `Vida do rei +20`, extra: `Nv.${meta.hp}/5`, cost: 35 + 25 * meta.hp, ok: meta.hp < 5,
      buy: () => meta.hp++ },
    { id: 'tower3', icon: '🏰', nome: 'Torre Nível 3', extra: meta.tower3 ? '✓ comprado' : 'permanente', cost: 150, ok: !meta.tower3,
      buy: () => meta.tower3 = true },
    { id: 'mud', icon: '🟤', nome: 'Lama pegajosa', extra: meta.mud ? '✓ comprado' : 'construível: atrasa inimigos', cost: 100, ok: !meta.mud,
      buy: () => meta.mud = true },
    { id: 'repair', icon: '🔨', nome: 'Reparo do casarão', extra: meta.repair ? '✓ comprado' : 'perto da porta, custa moedas', cost: 120, ok: !meta.repair,
      buy: () => meta.repair = true },
    { id: 'bomb', icon: '💣', nome: 'Bomba (consumível)', extra: `x${meta.bomb}/3`, cost: 30, ok: meta.bomb < 3,
      buy: () => meta.bomb++ },
    { id: 'freeze', icon: '❄️', nome: 'Congelar (consumível)', extra: `x${meta.freeze}/3`, cost: 35, ok: meta.freeze < 3,
      buy: () => meta.freeze++ },
  ];
}
function renderShop() {
  uiGold.textContent = meta.gold;
  uiMission.textContent = meta.mission;
  shopEl.innerHTML = shopItems().map(it =>
    `<button class="shopItem" data-id="${it.id}" ${it.ok && meta.gold >= it.cost ? '' : 'disabled'}>` +
    `<span class="si-ico">${it.icon}</span><span class="si-nome">${it.nome}<br><small>${it.extra}</small></span>` +
    `<span class="si-custo">${it.ok ? '💰' + it.cost : '✓'}</span></button>`).join('');
}
shopEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const it = shopItems().find(i => i.id === btn.dataset.id);
  if (!it || !it.ok || meta.gold < it.cost) return;
  meta.gold -= it.cost;
  it.buy();
  saveMeta();
  sfx.upgrade();
  renderShop();
});
function renderConsumables() {
  const show = state === 'play' && (meta.bomb > 0 || meta.freeze > 0);
  consEl.classList.toggle('hidden', !show);
  $('bombBtn').textContent = `💣 ${meta.bomb}`;
  $('bombBtn').disabled = meta.bomb < 1;
  $('freezeBtn').textContent = `❄️ ${meta.freeze}`;
  $('freezeBtn').disabled = meta.freeze < 1;
}
renderShop();

// ---------------- Fluxo de jogo ----------------
let hintT = 0;
function showHint(txt, secs = 3) { hintEl.textContent = txt; hintEl.classList.remove('hidden'); hintT = secs; }

function resetGame() {
  coins = 80; stats = { kills: 0 };
  MANOR.hp = MANOR.maxHp;
  king.maxHp = 80 + 20 * meta.hp;
  king.x = 700; king.y = 720; king.hp = king.maxHp;
  king.dead = false; king.respawn = 0; king.cd = 0; king.attackT = 0; king.dirKey = 'frente';
  builds = [];
  freezeT = 0;
  enemies = []; bolts = []; eshots = []; coinDrops = []; parts = []; floats = [];
  wavePlan = { queue: [], t: 0 };
  shake = 0;
  cam.x = 700; cam.y = 660;
  renderStatic();
}
function startLevel() {
  level = meta.mission;
  resetGame();
  state = 'play'; paused = false;
  wavePhase = 'countdown'; waveTimer = 8; waveNum = 0;
  waveTotal = 4 + (level >= 4 ? 1 : 0);
  menuEl.classList.add('hidden'); overEl.classList.add('hidden'); levelEndEl.classList.add('hidden');
  renderStatic();
  showHint(`⚔️ Nível ${level}: ${waveTotal} waves virão do ${levelDir(level).nome}. Prepare-se!`, 5);
}
function beginWave() {
  waveNum++;
  wavePhase = 'active';
  buildWavePlan(level, waveNum);
  sfx.horn();
  showHint(`🚨 Wave ${waveNum}/${waveTotal}!`, 2.5);
}
function levelComplete() {
  sfx.clear();
  const bonus = 30 + 10 * level;
  coins += bonus;
  meta.gold += coins;                       // moedas não gastas viram ouro
  if (level >= meta.mission) meta.mission = level + 1;
  if (level > best) { best = level; try { localStorage.setItem('tinyking.best', String(best)); } catch (e) {} }
  saveMeta();
  state = 'levelend';
  levelEndText.innerHTML =
    `Você defendeu o casarão nas <b>${waveTotal}</b> waves!<br>` +
    `Inimigos derrotados: <b>${stats.kills}</b><br>` +
    `💰 Ouro guardado: <b>+${coins}</b> (bônus de ${bonus} incluído)<br><br>` +
    `Gaste no mercado do menu para ficar mais forte. 💪`;
  levelEndEl.classList.remove('hidden');
}
function gameOver() {
  state = 'gameover';
  sfx.lose();
  meta.gold += coins;                       // o que coletou fica guardado
  saveMeta();
  overText.innerHTML =
    `O casarão caiu no nível <b>${level}</b>, wave <b>${waveNum}/${waveTotal}</b>.<br>` +
    `Inimigos derrotados: <b>${stats.kills}</b> · 💰 Ouro guardado: <b>+${coins}</b><br>` +
    `🏆 Recorde: nível <b>${best}</b><br><br>` +
    `<i>Melhore o rei no mercado e tente de novo!</i>`;
  overEl.classList.remove('hidden');
}
function showMenu() {
  state = 'menu';
  overEl.classList.add('hidden'); levelEndEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  renderShop();
}

// ---------------- Waves ----------------
// multiplicador de vida por nível: cresce cada vez mais rápido
const lvlMult = n => 1 + 0.30 * (n - 1) + 0.06 * (n - 1) * (n - 1);
// bestiário: stats base (vida escala com lvlMult; ouro é ESCASSO de propósito)
const BESTIARY = {
  soldado:  { r: 30, s: 5,    hp: 30,  spd: 66,  dmg: 9,  coin: 2, custo: 2 },
  assassino:{ r: 26, s: 4.2,  hp: 16,  spd: 132, dmg: 20, coin: 2, custo: 2 },
  atirador: { r: 30, s: 5,    hp: 26,  spd: 55,  dmg: 8,  coin: 3, custo: 3, alcance: 340 },
  blindado: { r: 34, s: 5.6,  hp: 95,  spd: 40,  dmg: 12, coin: 4, custo: 4, armadura: 0.4 },
  xama:     { r: 30, s: 5.2,  hp: 42,  spd: 50,  dmg: 4,  coin: 5, custo: 5, cura: true },
  gigante:  { r: 62, s: 11,   hp: 300, spd: 32,  dmg: 30, coin: 8, custo: 10, divideEm: 'medio' },
  medio:    { r: 32, s: 5.5,  hp: 55,  spd: 62,  dmg: 12, coin: 2, divideEm: 'mini' },
  mini:     { r: 18, s: 3,    hp: 16,  spd: 96,  dmg: 5,  coin: 1 },
  chefe:    { r: 78, s: 14,   hp: 750, spd: 36,  dmg: 40, coin: 60 },
};
// cada nível ESTREIA um tipo novo (o jogador sente a diferença)
function tiposDoNivel(n) {
  const t = ['soldado'];
  if (n >= 2) t.push('assassino');
  if (n >= 3) t.push('atirador');
  if (n >= 4) t.push('blindado');
  if (n >= 5) t.push('gigante');
  if (n >= 6) t.push('xama');
  return t;
}
function buildWavePlan(n, w) {
  // orçamento em pontos: mais inimigos, escalada real entre níveis
  let pontos = Math.round((9 + 3.5 * w) * (1 + 0.28 * (n - 1)));
  const tipos = tiposDoNivel(n);
  const novato = tipos[tipos.length - 1]; // tipo que estreia neste nível
  const pool = [];
  // garante presença do tipo novo a partir da wave 2
  if (w >= 2 && novato !== 'soldado') {
    const c = BESTIARY[novato].custo;
    const qtd = Math.max(1, Math.floor(pontos * 0.25 / c));
    for (let i = 0; i < qtd; i++) { pool.push(novato); pontos -= c; }
  }
  // wave 1 é a mais leve: sem unidades pesadas (custo 10+)
  const sorteaveis = w === 1 ? tipos.filter(t => (BESTIARY[t].custo || 2) < 10) : tipos;
  let guard = 0;
  while (pontos > 0 && guard++ < 200) {
    const t = sorteaveis[randi(0, sorteaveis.length - 1)];
    const c = BESTIARY[t].custo || 2;
    if (c > pontos && pontos >= 2) continue;
    pool.push(t); pontos -= c;
  }
  for (let i = pool.length - 1; i > 0; i--) { const j = randi(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const evts = [];
  let t = 0.8;
  while (pool.length) {
    evts.push({ t, types: pool.splice(0, randi(3, 5)) });
    t += Math.max(0.7, rand(1.2, 1.8) - (n + w) * 0.03);
  }
  if (w === waveTotal && n >= 3) evts.push({ t: t + 1.5, types: Array(Math.max(1, Math.floor(n / 4))).fill('chefe') });
  wavePlan = { queue: evts, t: 0 };
}
function makeEnemy(type, n, px, py) {
  const b = BESTIARY[type] || BESTIARY.soldado;
  let sx, sy;
  if (px !== undefined) { sx = px; sy = py; }
  else {
    const path = levelDir(n).path;
    sx = path[0][0] + rand(-50, 50); sy = path[0][1] + rand(-50, 50);
  }
  const e = {
    type, x: sx, y: sy,
    r: Math.round(b.r * 0.8), s: b.s * 0.8, spd: b.spd, dmg: Math.round(b.dmg * (1 + 0.08 * (n - 1))),
    hp: Math.round(b.hp * lvlMult(n)), coin: b.coin,
    armadura: b.armadura || 1, alcance: b.alcance || 0, cura: b.cura || false,
    divideEm: b.divideEm || null, nivel: n,
    wp: 1, cd: rand(0, .6), curaCd: rand(0, 1), bob: rand(0, TAU), face: 1, atDoor: false,
  };
  e.maxHp = e.hp;
  if (type === 'chefe') { sfx.boss(); showHint('⚠️ CHEFÃO à vista!', 3); }
  return e;
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
  const n = clamp(Math.round(val / 4), 1, 5);
  const each = Math.max(1, Math.round(val / n));
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    coinDrops.push({ x, y, vx: Math.cos(a) * rand(40, 110), vy: -rand(70, 150), val: each, t: 0 });
  }
}

// ---------------- Construção ----------------
const MUD_COST = 30;
function tryBuildHere(kind = 'tower') {
  if (king.dead || placeBlockReason(king.x, king.y)) return false;
  const cost = kind === 'mud' ? MUD_COST : TOWER.cost;
  if (coins < cost || (kind === 'mud' && !meta.mud)) return false;
  coins -= cost;
  builds.push({ x: king.x, y: king.y, kind, level: 1, cd: 0 });
  sfx.build();
  addParts(king.x, king.y - 20, kind === 'mud' ? '#8a6b42' : '#cfd4d8', 14, 100, 0.6, 3);
  renderStatic(); panelSig = '';
  return true;
}
function tryRepairManor() {
  const missing = MANOR.maxHp - MANOR.hp;
  if (!meta.repair || missing < 1) return false;
  const cost = Math.ceil(missing * 0.5);
  if (coins < cost) return false;
  coins -= cost; MANOR.hp = MANOR.maxHp;
  sfx.build();
  addParts(DOOR.x, DOOR.y - 30, '#9adcff', 16, 110, 0.6, 3);
  panelSig = '';
  return true;
}
// consumíveis
function useBomb() {
  if (meta.bomb < 1 || state !== 'play' || king.dead) return false;
  meta.bomb--; saveMeta();
  addParts(king.x, king.y, '#ffae42', 40, 260, 0.8, 5);
  addParts(king.x, king.y, '#fff', 20, 180, 0.5, 3);
  shake = 10;
  beep(60, .4, 'sawtooth', .3, -20);
  for (const e of enemies) if (dist(king.x, king.y, e.x, e.y) < 200) e.hp -= 70;
  renderConsumables();
  return true;
}
function useFreeze() {
  if (meta.freeze < 1 || state !== 'play') return false;
  meta.freeze--; saveMeta();
  freezeT = 5;
  addParts(king.x, king.y, '#9adcff', 30, 220, 0.7, 4);
  beep(1200, .3, 'triangle', .15, -600);
  showHint('❄️ Inimigos congelados!', 2);
  renderConsumables();
  return true;
}
function tryUpgrade(p) {
  if (p.kind !== 'tower' || p.level >= maxTowerLvl()) return false;
  const cost = TOWER.upCost(p.level);
  if (coins < cost) return false;
  coins -= cost; p.level++;
  sfx.upgrade();
  addParts(p.x, p.y - 30, '#ffd23e', 16, 110, 0.6, 3);
  renderStatic(); panelSig = '';
  return true;
}

// ---------------- Atualização ----------------
function nearestEnemy(x, y, maxR) {
  let bd = maxR * maxR, out = null;
  for (const e of enemies) {
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; out = e; }
  }
  return out;
}

function update(dt) {
  if (MANOR.hp <= 0) { MANOR.hp = 0; gameOver(); return; }

  // --- rei ---
  if (king.dead) {
    king.respawn -= dt;
    if (king.respawn <= 0) {
      king.dead = false; king.hp = king.maxHp;
      king.x = DOOR.x; king.y = DOOR.y + 90;
      addParts(king.x, king.y, '#ffd23e', 16, 120, 0.6, 3);
    }
  } else {
    const v = inputVector();
    king.moving = (v.dx !== 0 || v.dy !== 0);
    if (king.moving) {
      king.x = clamp(king.x + v.dx * 250 * dt, 26, WORLD.w - 26);
      king.y = clamp(king.y + v.dy * 250 * dt, 26, WORLD.h - 26);
      king.vx = v.dx; king.vy = v.dy;
      // escolhe a animação pela direção dominante
      if (Math.abs(v.dy) >= Math.abs(v.dx)) {
        king.dirKey = v.dy > 0 ? 'frente' : (v.dx > 0.3 ? 'costasDiag' : (v.dx < -0.3 ? 'costasB' : 'costas'));
      } else {
        king.dirKey = v.dx > 0 ? 'direita' : 'frente'; // esquerda: usa "frente" até termos a tira
      }
      king.animT += dt * 7;
    } else {
      king.animT = 0;
    }
    if (state === 'prep') king.hp = Math.min(king.maxHp, king.hp + 14 * dt);
    king.cd -= dt;
    king.attackT = Math.max(0, king.attackT - dt);
    // ataque em arco (cleave): acerta todos no alcance à frente
    const tgt = nearestEnemy(king.x, king.y, KING_RANGE);
    if (tgt && king.cd <= 0) {
      king.cd = 0.55; king.attackT = 0.38;
      king.attackDir = Math.atan2(tgt.y - king.y, tgt.x - king.x);
      let hits = 0;
      for (const e of enemies) {
        const d = dist(king.x, king.y, e.x, e.y);
        if (d > KING_RANGE + 8 + e.r) continue;
        const a = Math.atan2(e.y - king.y, e.x - king.x);
        let da = Math.abs(a - king.attackDir);
        if (da > Math.PI) da = TAU - da;
        if (da < 1.25) {
          e.hp -= kingDmg(); hits++;
          const kb = 16, dd = Math.max(1, d);
          e.x += (e.x - king.x) / dd * kb; e.y += (e.y - king.y) / dd * kb;
          addParts(e.x, e.y, '#fff', 3, 90, 0.25, 2);
        }
      }
      if (hits > 0) sfx.slash();
    }
  }

  // --- sistema de waves automáticas ---
  freezeT = Math.max(0, freezeT - dt);
  if (state === 'play') {
    if (wavePhase === 'countdown') {
      waveTimer -= dt;
      if (waveTimer <= 0) beginWave();
    } else {
      wavePlan.t += dt;
      while (wavePlan.queue.length && wavePlan.queue[0].t <= wavePlan.t) {
        for (const ty of wavePlan.queue.shift().types) enemies.push(makeEnemy(ty, level));
      }
      if (!wavePlan.queue.length && enemies.length === 0) {
        if (waveNum >= waveTotal) { levelComplete(); return; }
        wavePhase = 'countdown'; waveTimer = 6;
        const heal = Math.round(king.maxHp * .35);
        king.hp = Math.min(king.maxHp, king.hp + heal);
        showHint(`✅ Wave ${waveNum} vencida! Próxima em instantes…`, 2.5);
      }
    }
  }

  // --- inimigos: seguir caminho, bater no rei se ele encostar, bater no casarão na porta ---
  const path = levelDir(level).path;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp <= 0) {
      stats.kills++;
      dropCoins(e.x, e.y, e.coin);
      addParts(e.x, e.y, '#c62818', e.s > 8 ? 34 : 10, 130, 0.6, 3);
      sfx.die();
      enemies.splice(i, 1);
      if (e.divideEm) {
        // o tanque se parte em 4 pedaços que continuam a marcha
        for (let k = 0; k < 4; k++) {
          const a = k / 4 * TAU + rand(-.3, .3);
          const filho = makeEnemy(e.divideEm, e.nivel, e.x + Math.cos(a) * (e.r * .8), e.y + Math.sin(a) * (e.r * .8));
          filho.wp = e.wp; filho.atDoor = e.atDoor;
          enemies.push(filho);
        }
        addFloat(e.x, e.y - 30, '💥 dividiu!', '#ffb0a0');
      }
      continue;
    }
    e.bob += dt * 11; e.cd -= dt;
    // velocidade efetiva: congelamento e lama atrasam
    let spd = e.spd;
    if (freezeT > 0) spd *= 0.3;
    for (const b of builds) {
      if (b.kind === 'mud' && dist2(e.x, e.y, b.x, b.y) < 115 * 115) { spd *= 0.45; break; }
    }
    // xamã: cura aliados próximos
    if (e.cura) {
      e.curaCd -= dt;
      if (e.curaCd <= 0) {
        e.curaCd = 2.2;
        for (const al of enemies) {
          if (al !== e && al.hp > 0 && al.hp < al.maxHp && dist2(e.x, e.y, al.x, al.y) < 190 * 190) {
            al.hp = Math.min(al.maxHp, al.hp + 8 + 2 * e.nivel);
            addParts(al.x, al.y - 20, '#7fe088', 4, 60, 0.4, 3);
          }
        }
      }
    }
    // atirador: para e dispara lanças no rei ou no casarão
    if (e.alcance) {
      let tx = null, ty = null, alvo = null;
      if (!king.dead && dist2(e.x, e.y, king.x, king.y) < e.alcance * e.alcance) { tx = king.x; ty = king.y; alvo = 'rei'; }
      else if (dist2(e.x, e.y, DOOR.x, DOOR.y) < (e.alcance + 60) * (e.alcance + 60)) { tx = DOOR.x; ty = DOOR.y - 40; alvo = 'casarao'; }
      if (alvo) {
        e.face = tx > e.x ? 1 : -1;
        if (e.cd <= 0) {
          e.cd = 1.7;
          eshots.push({ x: e.x, y: e.y - 20, tx, ty, alvo, spd: 330, dmg: e.dmg, t: 0 });
          beep(240, .06, 'square', .07, -80);
        }
        continue; // parado atirando
      }
    }
    // rei por perto? PERSEGUE (nada de apanhar de graça à distância)
    if (!king.dead) {
      const dk = dist(king.x, king.y, e.x, e.y);
      if (dk < e.r + 32) {
        e.face = king.x > e.x ? 1 : -1;
        if (e.cd <= 0) {
          e.cd = 0.9;
          king.hp -= e.dmg;
          addParts(king.x, king.y - 20, '#ff7043', 5, 90, 0.3, 2);
          sfx.hurt(); shake = Math.max(shake, 3);
          if (king.hp <= 0) {
            king.dead = true; king.respawn = 5;
            addParts(king.x, king.y, '#ffd23e', 22, 150, 0.8, 3);
            showHint('👑 O rei caiu! Voltando ao casarão…', 3);
          }
        }
        continue; // encostado, brigando
      }
      if (dk < 185 && !e.atDoor) {
        e.x += (king.x - e.x) / dk * spd * dt;
        e.y += (king.y - e.y) / dk * spd * dt;
        e.face = king.x > e.x ? 1 : -1;
        continue; // caçando o rei
      }
    }
    if (e.atDoor) {
      if (e.cd <= 0) {
        e.cd = 0.8;
        MANOR.hp -= e.dmg;
        addParts(DOOR.x + rand(-20, 20), DOOR.y - 10, '#ff7043', 6, 100, 0.35, 2.5);
        sfx.hurt(); shake = 6;
      }
      continue;
    }
    // waypoint seguinte
    const [wx, wy] = path[Math.min(e.wp, path.length - 1)];
    const d = dist(e.x, e.y, wx, wy);
    if (d < 26) {
      e.wp++;
      if (e.wp >= path.length) e.atDoor = true;
    } else {
      e.x += (wx - e.x) / d * spd * dt;
      e.y += (wy - e.y) / d * spd * dt;
      e.face = wx > e.x ? 1 : -1;
    }
  }

  // --- torres ---
  for (const p of builds) {
    if (p.kind !== 'tower') continue;
    p.cd -= dt;
    if (p.cd > 0) continue;
    const st = TOWER.stats(p.level);
    const e = nearestEnemy(p.x, p.y, st.range);
    if (e) {
      p.cd = st.rate;
      bolts.push({ x: p.x, y: p.y - 112, target: e, tx: e.x, ty: e.y, spd: 480, dmg: st.dmg, t: 0 });
      beep(680 + p.level * 90, .05, 'square', .06, -250);
    }
  }

  // --- virotes ---
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.t += dt;
    if (b.target && b.target.hp > 0) { b.tx = b.target.x; b.ty = b.target.y; }
    const d = dist(b.x, b.y, b.tx, b.ty);
    const hitR = (b.target && b.target.hp > 0) ? b.target.r : 6;
    if (d <= Math.max(hitR, b.spd * dt) || b.t > 3) {
      if (b.target && b.target.hp > 0 && d < hitR + 16) {
        b.target.hp -= Math.round(b.dmg * (b.target.armadura || 1));
        addFloat(b.target.x, b.target.y - b.target.r - 10, String(b.dmg), '#ffe9a8');
        addParts(b.target.x, b.target.y, '#fff', 3, 80, 0.2, 1.5);
        sfx.hit();
      }
      bolts.splice(i, 1);
      continue;
    }
    b.x += (b.tx - b.x) / d * b.spd * dt;
    b.y += (b.ty - b.y) / d * b.spd * dt;
  }

  // --- lanças dos atiradores ---
  for (let i = eshots.length - 1; i >= 0; i--) {
    const s2 = eshots[i];
    s2.t += dt;
    const d = dist(s2.x, s2.y, s2.tx, s2.ty);
    if (d <= Math.max(14, s2.spd * dt) || s2.t > 3) {
      if (s2.alvo === 'rei' && !king.dead && dist(s2.tx, s2.ty, king.x, king.y) < 46) {
        king.hp -= s2.dmg;
        addParts(king.x, king.y - 20, '#ff7043', 5, 90, 0.3, 2);
        sfx.hurt();
        if (king.hp <= 0 && !king.dead) {
          king.dead = true; king.respawn = 5;
          addParts(king.x, king.y, '#ffd23e', 22, 150, 0.8, 3);
          showHint('👑 O rei caiu! Voltando ao casarão…', 3);
        }
      } else if (s2.alvo === 'casarao' && dist(s2.tx, s2.ty, DOOR.x, DOOR.y - 40) < 90) {
        MANOR.hp -= s2.dmg;
        addParts(s2.tx, s2.ty, '#ff7043', 5, 90, 0.3, 2.5);
        shake = Math.max(shake, 4);
      }
      eshots.splice(i, 1);
      continue;
    }
    s2.x += (s2.tx - s2.x) / d * s2.spd * dt;
    s2.y += (s2.ty - s2.y) / d * s2.spd * dt;
  }

  // --- moedas ---
  for (let i = coinDrops.length - 1; i >= 0; i--) {
    const c = coinDrops[i];
    c.t += dt;
    if (c.t < 0.5) {
      c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 500 * dt; c.vx *= 0.96;
    } else if (!king.dead) {
      const d = dist(c.x, c.y, king.x, king.y);
      if (d < 58) {
        coins += c.val;
        addFloat(king.x, king.y - 60, `+${c.val}`, '#ffd23e');
        sfx.coin();
        coinDrops.splice(i, 1);
        continue;
      }
      if (d < 160) {
        const sp = 420 * (1 - d / 190);
        c.x += (king.x - c.x) / d * sp * dt;
        c.y += (king.y - c.y) / d * sp * dt;
      }
    }
    if (c.t > 30) coinDrops.splice(i, 1);
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

  shake = Math.max(0, shake - dt * 22);

  // --- câmera ---
  const fx = king.dead ? MANOR.x : king.x;
  const fy = king.dead ? MANOR.y + 120 : king.y;
  const k = Math.min(1, dt * 5);
  cam.x = lerp(cam.x, fx, k);
  cam.y = lerp(cam.y, fy, k);
  const vw2 = vieww(), vh2 = viewh();
  cam.x = WORLD.w <= vw2 ? WORLD.w / 2 : clamp(cam.x, vw2 / 2, WORLD.w - vw2 / 2);
  cam.y = WORLD.h <= vh2 ? WORLD.h / 2 : clamp(cam.y, vh2 / 2, WORLD.h - vh2 / 2);
}

// ---------------- Painel de construção & HUD ----------------
let panelSig = '';
function nearBuild() {
  if (king.dead) return null;
  let bp = null, bd = 80 * 80;
  for (const p of builds) {
    const d = dist2(king.x, king.y, p.x, p.y);
    if (d < bd) { bd = d; bp = p; }
  }
  return bp;
}
function refreshPanel() {
  if (state !== 'play' || king.dead) {
    if (panelSig !== 'off') { panelSig = 'off'; buildPanel.classList.add('hidden'); }
    return;
  }
  // perto da porta do casarão: reparo (se comprado)
  const nearDoor = dist(king.x, king.y, DOOR.x, DOOR.y) < 200;
  const missing = MANOR.maxHp - MANOR.hp;
  if (nearDoor && meta.repair && missing >= 1) {
    const cost = Math.ceil(missing * 0.5);
    const sig2 = `rep|${cost}|${coins >= cost ? 1 : 0}`;
    if (sig2 !== panelSig) {
      panelSig = sig2;
      buildPanel.innerHTML = `<span class="lbl">🏠 Casarão</span>` +
        `<button data-act="repair" ${coins >= cost ? '' : 'disabled'}>🔨 Reparar<br>🪙${cost}</button>`;
      buildPanel.classList.remove('hidden');
    }
    return;
  }
  const p = nearBuild();
  if (!p) {
    // sem construção por perto: oferecer construir AQUI (colocação livre)
    const reason = placeBlockReason(king.x, king.y);
    const okT = !reason && coins >= TOWER.cost;
    const okM = !reason && meta.mud && coins >= MUD_COST;
    const sig0 = `place|${reason || ''}|${okT ? 1 : 0}|${okM ? 1 : 0}|${meta.mud ? 1 : 0}`;
    if (sig0 !== panelSig) {
      panelSig = sig0;
      buildPanel.innerHTML = reason
        ? `<span class="lbl">⛔ Para construir: ${reason}</span>`
        : `<span class="lbl">Construir aqui:</span>` +
          `<button data-act="build" ${okT ? '' : 'disabled'}>🏰 Torre<br>🪙${TOWER.cost}</button>` +
          (meta.mud ? `<button data-act="mud" ${okM ? '' : 'disabled'}>🟤 Lama<br>🪙${MUD_COST}</button>` : '');
      buildPanel.classList.remove('hidden');
    }
    return;
  }
  const idx = builds.indexOf(p);
  let sig;
  if (p.kind === 'mud') {
    sig = `m${idx}`;
    if (sig !== panelSig) {
      panelSig = sig;
      buildPanel.innerHTML = `<span class="lbl">🟤 Lama pegajosa</span>`;
      buildPanel.classList.remove('hidden');
    }
  } else {
    const canUp = p.level < maxTowerLvl();
    const cost = TOWER.upCost(p.level);
    sig = `b${idx}|${p.level}|${canUp && coins >= cost ? 1 : 0}|${maxTowerLvl()}`;
    if (sig !== panelSig) {
      panelSig = sig;
      buildPanel.innerHTML = `<span class="lbl">🏰 Torre Nv.${p.level}</span>` +
        (canUp
          ? `<button data-act="up" ${coins >= cost ? '' : 'disabled'}>⬆️ Melhorar<br>🪙${cost}</button>`
          : `<span class="lbl">${meta.tower3 ? '⭐ Máx' : '🔒 Nv.3 no mercado'}</span>`);
      buildPanel.classList.remove('hidden');
    }
  }
}
buildPanel.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.act === 'repair') { tryRepairManor(); return; }
  if (btn.dataset.act === 'build') { tryBuildHere('tower'); return; }
  if (btn.dataset.act === 'mud') { tryBuildHere('mud'); return; }
  const p = nearBuild();
  if (p && btn.dataset.act === 'up') tryUpgrade(p);
});
function updateUI(dt) {
  uiCoins.textContent = coins;
  uiManor.textContent = Math.max(0, Math.round(MANOR.hp / MANOR.maxHp * 100)) + '%';
  uiLevel.textContent = `${level} · W${Math.max(waveNum, 1)}/${waveTotal}`;
  pauseBtn.classList.toggle('hidden', state !== 'play');
  const showBtn = state === 'play' && wavePhase === 'countdown' && !paused;
  waveBtn.classList.toggle('hidden', !showBtn);
  if (showBtn) waveBtn.textContent = `⏩ Wave ${waveNum + 1}/${waveTotal} em ${Math.ceil(waveTimer)}s (${levelDir(level).nome}) — pular`;
  renderConsumables();
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) hintEl.classList.add('hidden'); }
  refreshPanel();
}

// ---------------- Desenho: primitivas ----------------
function contact(g, x, y, rx, ry, a = 0.35) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, `rgba(20,40,12,${a})`); gr.addColorStop(1, 'rgba(20,40,12,0)');
  g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill(); g.restore();
}
function drawPine(g, x, y, s) {
  contact(g, x, y + 6 * s, 16 * s, 6 * s, .4);
  const tg = g.createLinearGradient(x - 4 * s, 0, x + 4 * s, 0);
  tg.addColorStop(0, '#9c6a3a'); tg.addColorStop(1, '#6b4322');
  g.fillStyle = tg; g.fillRect(x - 3.5 * s, y - 6 * s, 7 * s, 12 * s);
  for (let i = 0; i < 3; i++) {
    const w = (24 - i * 6) * s, yy = y - (4 + i * 14) * s, h = 18 * s;
    g.fillStyle = '#3f8c33';
    g.beginPath(); g.moveTo(x - w / 2, yy); g.lineTo(x, yy - h); g.lineTo(x, yy + 2 * s); g.closePath(); g.fill();
    g.fillStyle = '#2c6b24';
    g.beginPath(); g.moveTo(x + w / 2, yy); g.lineTo(x, yy - h); g.lineTo(x, yy + 2 * s); g.closePath(); g.fill();
  }
}
function drawRock(g, r0) {
  const { x, y, s } = r0;
  contact(g, x + 2, y + 6 * s, 15 * s, 5 * s, .32);
  g.fillStyle = '#a8b0b8';
  g.beginPath(); g.moveTo(x - 13 * s, y + 6 * s); g.lineTo(x - 7 * s, y - 9 * s); g.lineTo(x + 6 * s, y - 10 * s); g.lineTo(x + 13 * s, y + 1 * s); g.lineTo(x + 9 * s, y + 7 * s); g.closePath(); g.fill();
  g.fillStyle = '#c9ced3';
  g.beginPath(); g.moveTo(x - 7 * s, y - 9 * s); g.lineTo(x + 6 * s, y - 10 * s); g.lineTo(x + 3 * s, y - 2 * s); g.closePath(); g.fill();
}
function drawTower(g, x, y, lvl) {
  const s = 2.1 * (1 + 0.12 * (lvl - 1));
  contact(g, x, y + 30 * s, 36 * s, 13 * s, .45);
  const W = 46 * s, H = 64 * s;
  g.fillStyle = '#6f767d';
  g.beginPath(); g.roundRect(x - W / 2, y + 28 * s - H, W, H, 4 * s); g.fill();
  g.save();
  g.beginPath(); g.roundRect(x - W / 2, y + 28 * s - H, W, H, 4 * s); g.clip();
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
    const bw = W / 3, bh = H / 5;
    const bx = x - W / 2 + c * bw - (r % 2 ? bw * .3 : 0), by = y + 28 * s - H + r * bh;
    g.fillStyle = shade('#a8adb4', .06 + drnd() * .16 - (c > 1 ? .18 : 0));
    g.beginPath(); g.roundRect(bx + 1, by + 1, bw - 2, bh - 2, 3 * s); g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.roundRect(bx + 2, by + 2, bw - 4, 2.5 * s, 2 * s); g.fill();
  }
  g.restore();
  const cg = g.createLinearGradient(x - W / 2 - 5 * s, 0, x + W / 2 + 5 * s, 0);
  cg.addColorStop(0, '#cfd4d8'); cg.addColorStop(.5, '#b8bec4'); cg.addColorStop(1, '#8f979e');
  g.fillStyle = cg; g.beginPath(); g.roundRect(x - W / 2 - 5 * s, y + 28 * s - H - 9 * s, W + 10 * s, 11 * s, 3 * s); g.fill();
  for (const dx of [-1, 0, 1]) {
    g.fillStyle = dx === 1 ? '#8f979e' : '#c4c9ce';
    g.fillRect(x + dx * (W / 2 - 4 * s) - 4.5 * s, y + 28 * s - H - 16 * s, 9 * s, 8 * s);
  }
  // estandarte com coroa (nível: azul → roxo → dourado)
  const bcol = ['#4a8ae0', '#8a5ae0', '#e0a02a'][lvl - 1] || '#4a8ae0';
  const bg = g.createLinearGradient(x - 9 * s, 0, x + 9 * s, 0);
  bg.addColorStop(0, bcol); bg.addColorStop(1, shade(bcol, -.35));
  g.fillStyle = bg;
  g.beginPath(); g.moveTo(x - 8 * s, y - 2 * s); g.lineTo(x + 8 * s, y - 2 * s); g.lineTo(x + 8 * s, y + 22 * s); g.lineTo(x, y + 16 * s); g.lineTo(x - 8 * s, y + 22 * s); g.closePath(); g.fill();
  g.fillStyle = '#f5f8ff';
  g.beginPath(); g.moveTo(x - 4.5 * s, y + 9 * s); g.lineTo(x - 4.5 * s, y + 3.5 * s); g.lineTo(x - 1.8 * s, y + 6.5 * s); g.lineTo(x, y + 3 * s); g.lineTo(x + 1.8 * s, y + 6.5 * s); g.lineTo(x + 4.5 * s, y + 3.5 * s); g.lineTo(x + 4.5 * s, y + 9 * s); g.closePath(); g.fill();
  // besta
  g.save();
  g.translate(x, y + 28 * s - H - 20 * s); g.rotate(-.12);
  const wg = g.createLinearGradient(0, -4 * s, 0, 4 * s);
  wg.addColorStop(0, '#c89858'); wg.addColorStop(.5, '#a8763e'); wg.addColorStop(1, '#7a5228');
  g.fillStyle = wg; g.beginPath(); g.roundRect(-26 * s, -3.5 * s, 52 * s, 7 * s, 3.5 * s); g.fill();
  g.strokeStyle = '#8a5f30'; g.lineWidth = 5 * s; g.lineCap = 'round';
  g.beginPath(); g.moveTo(14 * s, -20 * s); g.quadraticCurveTo(30 * s, 0, 14 * s, 20 * s); g.stroke();
  g.strokeStyle = '#d8c8a8'; g.lineWidth = 1.6 * s;
  g.beginPath(); g.moveTo(15 * s, -19 * s); g.lineTo(-20 * s, 0); g.lineTo(15 * s, 19 * s); g.stroke();
  g.fillStyle = '#5a80b8'; g.beginPath(); g.roundRect(-7 * s, -6 * s, 14 * s, 12 * s, 3 * s); g.fill();
  g.fillStyle = '#88aede'; g.beginPath(); g.roundRect(-7 * s, -6 * s, 14 * s, 4 * s, 3 * s); g.fill();
  g.strokeStyle = '#e8dcc0'; g.lineWidth = 2.4 * s;
  g.beginPath(); g.moveTo(-18 * s, 0); g.lineTo(20 * s, 0); g.stroke();
  g.fillStyle = '#e8dcc0'; g.beginPath(); g.moveTo(24 * s, 0); g.lineTo(17 * s, -3.5 * s); g.lineTo(17 * s, 3.5 * s); g.closePath(); g.fill();
  g.restore();
}
function drawManor(g) {
  const px = MANOR.x, py = MANOR.y + 67;   // pivô: base do casarão
  g.save(); g.translate(px, py); g.scale(2, 2); g.translate(-px, -py);
  drawManorBase(g);
  g.restore();
}
function drawManorBase(g) {
  const x = MANOR.x, y = MANOR.y, s = 1.15;
  contact(g, x + 6, y + 62 * s, 95 * s, 26 * s, .45);
  const W = 120 * s, H = 68 * s;
  g.fillStyle = '#a89f8e'; g.fillRect(x - W / 2, y - H, W, H);
  g.save(); g.beginPath(); g.rect(x - W / 2, y - H, W, H); g.clip();
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const bw = W / 6, bh = H / 4;
    const bx = x - W / 2 + c * bw - (r % 2 ? bw * .25 : 0), by = y - H + r * bh;
    g.fillStyle = shade('#c9c2b2', .04 + drnd() * .14 - (c > 3 ? .14 : 0));
    g.beginPath(); g.roundRect(bx + 1, by + 1, bw - 2, bh - 2, 3); g.fill();
  }
  g.restore();
  g.strokeStyle = '#7a5228'; g.lineWidth = 5;
  g.beginPath();
  g.moveTo(x - W / 2 + 6, y - H + 4); g.lineTo(x - W / 2 + 6, y + 58 * s);
  g.moveTo(x + W / 2 - 6, y - H + 4); g.lineTo(x + W / 2 - 6, y + 58 * s);
  g.moveTo(x - W / 2, y - H / 2 + 6); g.lineTo(x + W / 2, y - H / 2 + 6);
  g.stroke();
  g.fillStyle = '#b8b0a0'; g.fillRect(x - W / 2, y, W, 58 * s);
  g.fillStyle = 'rgba(60,40,20,.14)'; g.fillRect(x - W / 2, y + 44 * s, W, 14 * s);
  g.strokeStyle = '#7a5228'; g.lineWidth = 5;
  for (const dx of [-W / 2 + 6, -W / 6, W / 6, W / 2 - 6]) { g.beginPath(); g.moveTo(x + dx, y); g.lineTo(x + dx, y + 58 * s); g.stroke(); }
  const dg = g.createLinearGradient(x - 16, 0, x + 16, 0);
  dg.addColorStop(0, '#9c6a3a'); dg.addColorStop(.5, '#b8834a'); dg.addColorStop(1, '#7a5228');
  g.fillStyle = 'rgba(40,20,5,.3)'; g.beginPath(); g.arc(x, y + 26 * s, 19, Math.PI, 0); g.rect(x - 19, y + 26 * s, 38, 32 * s); g.fill();
  g.fillStyle = dg; g.beginPath(); g.arc(x, y + 27 * s, 15, Math.PI, 0); g.rect(x - 15, y + 27 * s, 30, 31 * s); g.fill();
  g.strokeStyle = 'rgba(60,32,10,.55)'; g.lineWidth = 1.6;
  for (const ddx of [-8, 0, 8]) { g.beginPath(); g.moveTo(x + ddx, y + 14 * s); g.lineTo(x + ddx, y + 58 * s); g.stroke(); }
  g.fillStyle = '#5a4a28'; g.beginPath(); g.roundRect(x - 38, y - H + 16, 26, 22, 4); g.fill();
  const wg2 = g.createRadialGradient(x - 25, y - H + 26, 2, x - 25, y - H + 26, 14);
  wg2.addColorStop(0, '#ffe89a'); wg2.addColorStop(1, '#e8a83e');
  g.fillStyle = wg2; g.beginPath(); g.roundRect(x - 35, y - H + 19, 20, 16, 3); g.fill();
  g.strokeStyle = '#5a4a28'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 25, y - H + 19); g.lineTo(x - 25, y - H + 35); g.moveTo(x - 35, y - H + 27); g.lineTo(x - 15, y - H + 27); g.stroke();
  // telhado azul de telhas
  const RY = y - H - 2, RH = 58 * s, ROV = 16;
  const rg = g.createLinearGradient(x - W / 2 - ROV, 0, x + W / 2 + ROV, 0);
  rg.addColorStop(0, '#4a8ae0'); rg.addColorStop(.45, '#3a6fd0'); rg.addColorStop(1, '#24488f');
  g.fillStyle = rg;
  g.beginPath();
  g.moveTo(x - W / 2 - ROV, RY); g.lineTo(x - 14, RY - RH); g.lineTo(x + 14, RY - RH); g.lineTo(x + W / 2 + ROV, RY);
  g.lineTo(x + W / 2 + ROV - 8, RY + 7); g.lineTo(x - W / 2 - ROV + 8, RY + 7); g.closePath(); g.fill();
  g.save();
  g.beginPath(); g.moveTo(x - W / 2 - ROV, RY); g.lineTo(x - 14, RY - RH); g.lineTo(x + 14, RY - RH); g.lineTo(x + W / 2 + ROV, RY); g.closePath(); g.clip();
  for (let r2 = 0; r2 < 6; r2++) {
    const t = r2 / 6, yy = RY - RH * t, half = (W / 2 + ROV) * (1 - t * .72);
    g.strokeStyle = 'rgba(10,25,70,.4)'; g.lineWidth = 2.2;
    g.beginPath();
    const n2 = Math.max(3, 10 - r2);
    for (let i = 0; i < n2; i++) {
      const tx = x - half + (2 * half) * (i / (n2 - 1));
      g.moveTo(tx - 6, yy); g.arc(tx, yy, 6, Math.PI, 0, true);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - half, yy - 3); g.lineTo(x + half, yy - 3); g.stroke();
  }
  g.restore();
  g.fillStyle = '#6aa2ec'; g.beginPath(); g.roundRect(x - 18, RY - RH - 5, 36, 7, 3.5); g.fill();
  g.fillStyle = '#9aa0a6'; g.fillRect(x + 26, RY - RH + 2, 15, 24);
  g.fillStyle = '#7d848a'; g.fillRect(x + 36, RY - RH + 2, 5, 24);
  g.fillStyle = '#b8bec4'; g.beginPath(); g.roundRect(x + 23, RY - RH - 4, 21, 8, 2); g.fill();
  // mastro com estandarte
  const fx = x + 62 * s, fy = RY - 8;
  g.strokeStyle = '#7a5228'; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(fx, fy + 40); g.lineTo(fx, fy - 52); g.stroke();
  g.fillStyle = '#f2c14e'; g.beginPath(); g.moveTo(fx, fy - 60); g.lineTo(fx + 4, fy - 52); g.lineTo(fx - 4, fy - 52); g.closePath(); g.fill();
  const bg2 = g.createLinearGradient(fx, 0, fx + 26, 0);
  bg2.addColorStop(0, '#4a8ae0'); bg2.addColorStop(1, '#2a5cb0');
  g.fillStyle = bg2;
  g.beginPath(); g.moveTo(fx + 2, fy - 50); g.lineTo(fx + 26, fy - 50); g.lineTo(fx + 26, fy - 6); g.lineTo(fx + 14, fy - 14); g.lineTo(fx + 2, fy - 6); g.closePath(); g.fill();
  g.fillStyle = '#f5f8ff';
  g.beginPath(); g.moveTo(fx + 8, fy - 30); g.lineTo(fx + 8, fy - 38); g.lineTo(fx + 11.5, fy - 33.5); g.lineTo(fx + 14, fy - 39); g.lineTo(fx + 16.5, fy - 33.5); g.lineTo(fx + 20, fy - 38); g.lineTo(fx + 20, fy - 30); g.closePath(); g.fill();
}
const EPAL = {
  soldado:   ['#e86048', '#c62818', '#8a1408', '#a01c0e', '#ffdd55'],
  assassino: ['#f2a052', '#e67e22', '#a04a08', '#b85e10', '#fff2c0'],
  atirador:  ['#a678d8', '#7a4ac2', '#4a2a80', '#5c3a9e', '#ffdd55'],
  blindado:  ['#8a97a8', '#5e6c80', '#3a4452', '#4a5668', '#ffdd55'],
  xama:      ['#8fd08a', '#4a9e50', '#2a6b32', '#3a8040', '#f5f8ff'],
  gigante:   ['#e8a048', '#c87828', '#8a4a12', '#a05e1a', '#ffdd55'],
  medio:     ['#e8a048', '#c87828', '#8a4a12', '#a05e1a', '#ffdd55'],
  mini:      ['#e8a048', '#c87828', '#8a4a12', '#a05e1a', '#ffdd55'],
  chefe:     ['#8a5ad8', '#6b3f8f', '#3a1e58', '#4a1408', '#ff4444'],
};
function drawEnemy(g, e) {
  const s = e.s, x = e.x, y = e.y + Math.sin(e.bob) * 2;
  const P = EPAL[e.type] || EPAL.soldado;
  contact(g, e.x, e.y + 9 * s, 10 * s, 4 * s, .4);
  g.save();
  g.translate(x, y); g.scale(e.face * (e.type === 'assassino' ? .82 : 1), 1); g.translate(-x, -y);
  // corpo
  const grd = g.createRadialGradient(x - 3 * s, y - 5 * s, 2, x, y, 12 * s);
  grd.addColorStop(0, P[0]); grd.addColorStop(.55, P[1]); grd.addColorStop(1, P[2]);
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(x - 9 * s, y + 8 * s); g.quadraticCurveTo(x - 11 * s, y - 10 * s, x, y - 11 * s); g.quadraticCurveTo(x + 11 * s, y - 10 * s, x + 9 * s, y + 8 * s); g.quadraticCurveTo(x, y + 11 * s, x - 9 * s, y + 8 * s); g.closePath(); g.fill();
  // barriga dos ogros (família do gigante)
  if (e.divideEm || e.type === 'mini') {
    g.fillStyle = 'rgba(255,230,180,.5)';
    g.beginPath(); g.ellipse(x, y + 3 * s, 6 * s, 5 * s, 0, 0, TAU); g.fill();
  }
  // elmo / capuz
  g.fillStyle = P[3];
  g.beginPath(); g.arc(x, y - 6 * s, 7.5 * s, Math.PI, 0); g.fill();
  if (e.type !== 'xama') { g.fillStyle = P[0]; g.beginPath(); g.arc(x, y - 12.5 * s, 1.8 * s, 0, TAU); g.fill(); }
  // visor / olhos
  g.fillStyle = '#2a1206';
  g.beginPath(); g.roundRect(x - 5 * s, y - 6 * s, 10 * s, 4 * s, 2 * s); g.fill();
  g.fillStyle = P[4];
  g.beginPath(); g.arc(x - 2.2 * s, y - 4 * s, 1.1 * s, 0, TAU); g.arc(x + 2.2 * s, y - 4 * s, 1.1 * s, 0, TAU); g.fill();
  // adornos por tipo
  if (e.type === 'atirador') {
    g.strokeStyle = '#5a3a1a'; g.lineWidth = 1.8 * s;
    g.beginPath(); g.arc(x + 10 * s, y - 2 * s, 7 * s, -1.2, 1.2); g.stroke();
    g.strokeStyle = '#e8dcc0'; g.lineWidth = .8 * s;
    g.beginPath(); g.moveTo(x + 12.5 * s, y - 8.5 * s); g.lineTo(x + 6 * s, y - 2 * s); g.lineTo(x + 12.5 * s, y + 4.5 * s); g.stroke();
  } else if (e.type === 'xama') {
    g.strokeStyle = '#6b4a2b'; g.lineWidth = 1.6 * s;
    g.beginPath(); g.moveTo(x + 9 * s, y + 6 * s); g.lineTo(x + 12 * s, y - 12 * s); g.stroke();
    g.fillStyle = '#7fe088';
    g.beginPath(); g.arc(x + 12.4 * s, y - 13 * s, 2.4 * s, 0, TAU); g.fill();
  } else if (e.type === 'blindado') {
    g.fillStyle = 'rgba(220,228,236,.85)';
    g.beginPath(); g.ellipse(x + 8.5 * s, y, 4 * s, 9 * s, 0, -1.4, 1.4); g.fill();
    g.fillStyle = '#5e6c80';
    for (const dy of [-4, 0, 4]) { g.beginPath(); g.arc(x + 10.5 * s, y + dy * s, .9 * s, 0, TAU); g.fill(); }
  } else if (e.type === 'assassino') {
    g.strokeStyle = '#d8dce0'; g.lineWidth = 1.8 * s; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + 8 * s, y + 2 * s); g.lineTo(x + 14 * s, y - 6 * s); g.stroke();
    g.beginPath(); g.moveTo(x - 8 * s, y + 2 * s); g.lineTo(x - 14 * s, y - 6 * s); g.stroke();
  } else if (e.divideEm && e.s > 8) {
    g.fillStyle = '#f5ead3'; // presas do gigante
    g.beginPath(); g.moveTo(x - 4 * s, y + 1 * s); g.lineTo(x - 5.5 * s, y - 2.5 * s); g.lineTo(x - 2.5 * s, y - .5 * s); g.closePath();
    g.moveTo(x + 4 * s, y + 1 * s); g.lineTo(x + 5.5 * s, y - 2.5 * s); g.lineTo(x + 2.5 * s, y - .5 * s); g.closePath(); g.fill();
  } else {
    g.strokeStyle = '#d8dce0'; g.lineWidth = 2.2 * s; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + 9 * s, y + 2 * s); g.lineTo(x + 15 * s, y - 8 * s); g.stroke();
    g.strokeStyle = '#7a5228'; g.lineWidth = 2.6 * s;
    g.beginPath(); g.moveTo(x + 8 * s, y + 4 * s); g.lineTo(x + 10.5 * s, y); g.stroke();
  }
  if (e.type === 'chefe') {
    g.fillStyle = '#2b2b2b';
    for (const dx of [-5, 0, 5]) {
      g.beginPath(); g.moveTo(x + dx * s - 2.4 * s, y - 12 * s); g.lineTo(x + dx * s, y - 17 * s); g.lineTo(x + dx * s + 2.4 * s, y - 12 * s); g.closePath(); g.fill();
    }
  }
  g.restore();
  if (e.hp < e.maxHp) {
    const bw = Math.min(28 * s, 130);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(e.x - bw / 2, e.y - 16 * s - 10, bw, 7);
    g.fillStyle = '#ff5544';
    g.fillRect(e.x - bw / 2 + 1, e.y - 16 * s - 9, (bw - 2) * clamp(e.hp / e.maxHp, 0, 1), 5);
  }
}
function drawKing(g) {
  if (king.dead) {
    g.font = 'bold 16px system-ui'; g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.fillText(`👑 ${Math.ceil(king.respawn)}s…`, MANOR.x, MANOR.y - 150);
    g.textAlign = 'left';
    return;
  }
  const KH = 120;
  contact(g, king.x, king.y + 12, 24, 9, .5);
  let name, flip = false;
  if (king.attackT > 0) {
    const ph = clamp(Math.floor((0.38 - king.attackT) / 0.38 * 3), 0, 2);
    name = KING_ANIM.ataque[ph];
    flip = Math.cos(king.attackDir) < 0;   // golpe para a esquerda: espelha a animação
  } else if (king.moving) {
    const seq = KING_ANIM[king.dirKey] || KING_ANIM.frente;
    name = seq[[0, 1, 2, 1][Math.floor(king.animT) % 4]];
  } else {
    name = KING_IDLE;
  }
  const img = sprites[name];
  if (img && img.complete && img.naturalWidth) {
    if (flip) {
      g.save(); g.translate(king.x, 0); g.scale(-1, 1); g.translate(-king.x, 0);
      g.drawImage(img, king.x - KH / 2, king.y - KH + 14, KH, KH);
      g.restore();
    } else {
      g.drawImage(img, king.x - KH / 2, king.y - KH + 14, KH, KH);
    }
  }
  if (king.hp < king.maxHp) {
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(king.x - 20, king.y - KH + 4, 40, 6);
    g.fillStyle = '#ffd23e'; g.fillRect(king.x - 19, king.y - KH + 5, 38 * clamp(king.hp / king.maxHp, 0, 1), 4);
  }
}

// ---------------- Camada estática do mundo ----------------
const worldC = document.createElement('canvas');
worldC.width = WORLD.w; worldC.height = WORLD.h;
const wctx = worldC.getContext('2d');
function renderStatic() {
  const g = wctx;
  dseed = 99;
  const grd = g.createRadialGradient(700, 620, 120, 700, 700, 950);
  grd.addColorStop(0, '#79bd45'); grd.addColorStop(.65, '#61a637'); grd.addColorStop(1, '#4a8c2a');
  g.fillStyle = grd; g.fillRect(0, 0, WORLD.w, WORLD.h);
  for (let i = 0; i < 1500; i++) {
    const x = drnd() * WORLD.w, y = drnd() * WORLD.h;
    g.fillStyle = `rgba(${drnd() > .5 ? '255,255,255' : '20,70,10'},${.04 + drnd() * .05})`;
    g.fillRect(x, y, 2 + drnd() * 2, 3 + drnd() * 5);
  }
  for (let i = 0; i < 12; i++) {
    const px = drnd() * WORLD.w, py = drnd() * WORLD.h, pr = 60 + drnd() * 90, l = drnd() > .5;
    const sg = g.createRadialGradient(px, py, 0, px, py, pr);
    sg.addColorStop(0, l ? 'rgba(200,255,140,.10)' : 'rgba(20,70,10,.12)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.beginPath(); g.ellipse(px, py, pr, pr * .6, 0, 0, TAU); g.fill();
  }
  // caminho do nível atual (suavizado por pontos médios)
  const path = levelDir(level).path;
  const P = new Path2D();
  P.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length - 1; i++) {
    const mx = (path[i][0] + path[i + 1][0]) / 2, my = (path[i][1] + path[i + 1][1]) / 2;
    P.quadraticCurveTo(path[i][0], path[i][1], mx, my);
  }
  P.lineTo(path[path.length - 1][0], path[path.length - 1][1]);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#ceb075'; g.lineWidth = 58; g.stroke(P);
  g.strokeStyle = '#c2a267'; g.lineWidth = 48; g.stroke(P);
  g.strokeStyle = '#b5945a'; g.lineWidth = 36; g.stroke(P);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(${drnd() > .5 ? '160,125,70' : '230,210,160'},${.5 + drnd() * .3})`;
    const t = drnd(), seg = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
    const tt = t * (path.length - 1) - seg;
    const sx0 = lerp(path[seg][0], path[seg + 1][0], tt), sy0 = lerp(path[seg][1], path[seg + 1][1], tt);
    g.beginPath(); g.ellipse(sx0 + (drnd() * 28 - 14), sy0 + (drnd() * 12 - 6), 3 + drnd() * 2, 2 + drnd(), drnd(), 0, TAU); g.fill();
  }
  // flores
  for (const f of decor.flowers) {
    for (let p2 = 0; p2 < 5; p2++) {
      const a = p2 / 5 * TAU;
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(f.x + Math.cos(a) * 3, f.y + Math.sin(a) * 3, 2, 1.4, a, 0, TAU); g.fill();
    }
    g.fillStyle = '#ffd23e'; g.beginPath(); g.arc(f.x, f.y, 1.8, 0, TAU); g.fill();
  }
  // pedras
  for (const r0 of decor.rocks) drawRock(g, r0);
  // lamas construídas
  for (const p of builds) {
    if (p.kind !== 'mud') continue;
    const mg = g.createRadialGradient(p.x, p.y + 8, 10, p.x, p.y + 8, 115);
    mg.addColorStop(0, 'rgba(110,80,45,.85)'); mg.addColorStop(.75, 'rgba(110,80,45,.5)'); mg.addColorStop(1, 'rgba(110,80,45,0)');
    g.fillStyle = mg; g.beginPath(); g.ellipse(p.x, p.y + 8, 115, 74, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(70,48,25,.5)';
    for (let i = 0; i < 7; i++) g.beginPath(), g.ellipse(p.x + (drnd() * 140 - 70), p.y + 8 + (drnd() * 80 - 40), 9 + drnd() * 8, 5 + drnd() * 4, drnd(), 0, TAU), g.fill();
  }
  // moldura do mundo
  g.strokeStyle = 'rgba(30,60,15,.5)'; g.lineWidth = 10;
  g.strokeRect(5, 5, WORLD.w - 10, WORLD.h - 10);
}

// ---------------- Render por quadro ----------------
function render() {
  ctx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, 0, 0);
  ctx.fillStyle = '#4a8c2a';
  ctx.fillRect(0, 0, vieww(), viewh());
  const shx = shake > 0 ? rand(-shake, shake) : 0;
  const shy = shake > 0 ? rand(-shake, shake) : 0;
  const ox = Math.round(vieww() / 2 - cam.x + shx), oy = Math.round(viewh() / 2 - cam.y + shy);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.drawImage(worldC, 0, 0);
  // moedas no chão (com coroa cunhada)
  for (const c of coinDrops) {
    contact(ctx, c.x, c.y + 15, 17, 6, .3);
    const gm = ctx.createRadialGradient(c.x - 6, c.y - 6, 2, c.x, c.y, 23);
    gm.addColorStop(0, '#ffe082'); gm.addColorStop(.6, '#f2c14e'); gm.addColorStop(1, '#c8901a');
    ctx.fillStyle = gm; ctx.beginPath(); ctx.arc(c.x, c.y, 20, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(150,100,10,.75)'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, 13.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#a8701a';
    ctx.beginPath();
    ctx.moveTo(c.x - 7, c.y + 6); ctx.lineTo(c.x - 7, c.y - 3); ctx.lineTo(c.x - 3, c.y + 1.5);
    ctx.lineTo(c.x, c.y - 5); ctx.lineTo(c.x + 3, c.y + 1.5); ctx.lineTo(c.x + 7, c.y - 3); ctx.lineTo(c.x + 7, c.y + 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.beginPath(); ctx.ellipse(c.x - 7, c.y - 8.5, 6, 3, -0.6, 0, TAU); ctx.fill();
  }
  // seta da direção do próximo nível (fase de preparação)
  if (state === 'play' && wavePhase === 'countdown') {
    const path = levelDir(level).path;
    const [ax, ay] = path[0];
    // seta perto do casarão apontando PARA a porta (mostra de onde a horda vem)
    const dd = Math.max(1, dist(ax, ay, DOOR.x, DOOR.y));
    const ux2 = (ax - DOOR.x) / dd, uy2 = (ay - DOOR.y) / dd;
    const px2 = DOOR.x + ux2 * 200, py2 = DOOR.y + uy2 * 200;
    const ang = Math.atan2(DOOR.y - py2, DOOR.x - px2);
    const puls = 1 + Math.sin(performance.now() / 240) * .15;
    ctx.save();
    ctx.translate(px2, py2); ctx.rotate(ang); ctx.scale(puls, puls);
    ctx.fillStyle = 'rgba(255,60,40,.9)';
    ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(-14, -22); ctx.lineTo(-4, 0); ctx.lineTo(-14, 22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  // sprites ordenados por profundidade
  dseed = 31;
  const drawables = [];
  drawables.push({ y: MANOR.y + 66, fn: () => drawManor(ctx) });
  for (const p of builds) if (p.kind === 'tower') drawables.push({ y: p.y + 28, fn: () => drawTower(ctx, p.x, p.y, p.level) });
  for (const t of decor.pines) drawables.push({ y: t.y + 6, fn: () => drawPine(ctx, t.x, t.y, t.s) });
  for (const e of enemies) drawables.push({ y: e.y + 9 * e.s, fn: () => drawEnemy(ctx, e) });
  if (state !== 'menu') drawables.push({ y: king.dead ? -9999 : king.y + 13, fn: () => drawKing(ctx) });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.fn();
  // indicador de local de construção (colocação livre)
  if (state === 'play' && !king.dead && !nearBuild() && !placeBlockReason(king.x, king.y)) {
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.ellipse(king.x, king.y + 10, 36, 21, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  // barra de HP do casarão
  if (MANOR.hp < MANOR.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.roundRect(MANOR.x - 90, 96, 180, 16, 8); ctx.fill();
    ctx.fillStyle = MANOR.hp / MANOR.maxHp > .4 ? '#6ddd55' : '#ff5544';
    ctx.beginPath(); ctx.roundRect(MANOR.x - 87, 99, 174 * clamp(MANOR.hp / MANOR.maxHp, 0, 1), 10, 5); ctx.fill();
  }
  // virotes das torres (grandes e visíveis)
  ctx.lineCap = 'round';
  for (const b of bolts) {
    const d = Math.max(1, dist(b.x, b.y, b.tx, b.ty));
    const ux = (b.tx - b.x) / d, uy = (b.ty - b.y) / d;
    ctx.strokeStyle = 'rgba(255,220,120,.35)'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(b.x - ux * 30, b.y - uy * 30); ctx.lineTo(b.x + ux * 26, b.y + uy * 26); ctx.stroke();
    ctx.strokeStyle = '#7a5228'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(b.x - ux * 26, b.y - uy * 26); ctx.lineTo(b.x + ux * 20, b.y + uy * 20); ctx.stroke();
    ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(b.x + ux * 8, b.y + uy * 8); ctx.lineTo(b.x + ux * 26, b.y + uy * 26); ctx.stroke();
    // penas
    ctx.strokeStyle = '#c62818'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(b.x - ux * 26 - uy * 7, b.y - uy * 26 + ux * 7); ctx.lineTo(b.x - ux * 16, b.y - uy * 16); ctx.moveTo(b.x - ux * 26 + uy * 7, b.y - uy * 26 - ux * 7); ctx.lineTo(b.x - ux * 16, b.y - uy * 16); ctx.stroke();
  }
  // lanças dos atiradores inimigos
  for (const s2 of eshots) {
    const d = Math.max(1, dist(s2.x, s2.y, s2.tx, s2.ty));
    const ux = (s2.tx - s2.x) / d, uy = (s2.ty - s2.y) / d;
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(s2.x - ux * 24, s2.y - uy * 24); ctx.lineTo(s2.x + ux * 18, s2.y + uy * 18); ctx.stroke();
    ctx.strokeStyle = '#b8bec4'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(s2.x + ux * 12, s2.y + uy * 12); ctx.lineTo(s2.x + ux * 24, s2.y + uy * 24); ctx.stroke();
  }
  // partículas
  for (const p of parts) {
    ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // textos flutuantes
  ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
  for (const f of floats) {
    ctx.globalAlpha = clamp(1.3 - f.t, 0, 1);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.col;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  ctx.restore();
  // joystick (espaço de tela, sem zoom)
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
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
  if (state === 'play' && !paused) {
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
renderStatic();
requestAnimationFrame(frame);

document.addEventListener('gesturestart', e => e.preventDefault());
canvas.addEventListener('contextmenu', e => e.preventDefault());
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.SPRITE_DATA) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------------- API de debug/testes ----------------
window.__game = {
  get state() { return state; },
  get level() { return level; },
  get coins() { return coins; },
  get enemyCount() { return enemies.length; },
  get manorHp() { return MANOR.hp; },
  get kingPos() { return { x: king.x, y: king.y }; },
  get kingHp() { return king.hp; },
  get kills() { return stats.kills; },
  get builds() { return builds.map(p => ({ x: p.x, y: p.y, level: p.level, kind: p.kind })); },
  get wave() { return { num: waveNum, total: waveTotal, phase: wavePhase, timer: waveTimer }; },
  get meta() { return JSON.parse(JSON.stringify(meta)); },
  get freezeT() { return freezeT; },
  get paused() { return paused; },
  get inventoryOpen() { return !invEl.classList.contains('hidden'); },
  get itemCount() { return Object.keys(ITEMS).length; },
  get spritesReady() { return spritesReady; },
  get cam() { return { x: cam.x, y: cam.y }; },
  get view() { return { vw: VW, vh: VH, dpr: DPR, cw: canvas.width, rect: canvas.getBoundingClientRect().width }; },
  get timeScale() { return timeScale; },
  set timeScale(v) { timeScale = clamp(v, 0.1, 20); },
  addCoins(n) { coins += n; },
  buildAtPos(x, y, kind = 'tower') { builds.push({ x, y, kind, level: 1, cd: 0 }); renderStatic(); return true; },
  buildHere(kind = 'tower') { coins += kind === 'mud' ? MUD_COST : TOWER.cost; return tryBuildHere(kind); },
  upgradeAt(i) { const p = builds[i]; if (p && p.kind === 'tower') { coins += TOWER.upCost(p.level); return tryUpgrade(p); } return false; },
  teleport(x, y) { king.x = x; king.y = y; },
  skipCountdown() { if (state === 'play' && wavePhase === 'countdown') waveTimer = 0; },
  addGold(n) { meta.gold += n; saveMeta(); renderShop(); },
  giveItems() { meta.bomb = 3; meta.freeze = 3; meta.mud = true; meta.repair = true; saveMeta(); renderConsumables(); },
  resetMeta() { meta = Object.assign({}, META_DEFAULT); saveMeta(); renderShop(); },
  useBomb, useFreeze,
  goMenu() { showMenu(); },
  killAll() { for (const e of enemies) e.hp = 0; },
  hurtManor(n) { MANOR.hp -= n; },
};
