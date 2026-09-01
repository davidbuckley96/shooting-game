// Teste de fumaça: abre o jogo num Chromium mobile headless, joga algumas
// noites em velocidade acelerada e verifica o estado. Gera screenshots em shots/.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const EXE = process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.GAME_URL || 'http://localhost:8123';
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `shots/${name}.png` });

const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  deviceScaleFactor: 2,
});
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const g = expr => page.evaluate(expr);
const waitFor = async (expr, timeout = 60000, poll = 200) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await g(expr)) return true;
    await page.waitForTimeout(poll);
  }
  throw new Error(`timeout esperando: ${expr}`);
};
let passed = 0;
const check = (name, ok) => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { errors.push(`FALHOU: ${name}`); console.log(`  ❌ ${name}`); }
};

console.log('▶ carregando o jogo…');
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(600);
check('menu visível', await page.isVisible('#menu'));
await shot(page, '01-menu');

console.log('▶ iniciando partida…');
await page.tap('#playBtn');
await page.waitForTimeout(300);
check('estado = day', (await g('__game.state')) === 'day');
check('moedas iniciais = 90', (await g('__game.coins')) === 90);

console.log('▶ movimento por teclado…');
const x0 = (await g('__game.kingPos')).x;
await page.keyboard.down('d');
await page.waitForTimeout(500);
await page.keyboard.up('d');
check('rei se moveu (teclado)', (await g('__game.kingPos')).x > x0 + 30);

console.log('▶ movimento por joystick (toque)…');
const y0 = (await g('__game.kingPos')).y;
await page.mouse.move(200, 600);
await page.mouse.down();
await page.mouse.move(200, 660, { steps: 5 });
await page.waitForTimeout(500);
await page.mouse.up();
check('rei se moveu (joystick)', (await g('__game.kingPos')).y > y0 + 30);

console.log('▶ construção via painel de UI…');
await g('__game.addCoins(60)'); // 90+60 = 150: dá pra torre(50) + fazenda(40)
await g('__game.teleport(' + JSON.stringify(0) + ',0)'); // será clampado
// aproxima do canteiro 0 de verdade:
const plot0 = await g('(() => { const p = __game.plotInfo; return 0; })()');
await page.evaluate(() => { const k = __game; k.teleport(700 + Math.cos(0.28) * 175, 700 + Math.sin(0.28) * 175 - 40); });
await page.waitForTimeout(400);
check('painel de construção apareceu', await page.isVisible('#buildPanel'));
await shot(page, '02-painel-construcao');
await page.tap('#buildPanel button[data-type="archer"]');
await page.waitForTimeout(200);
check('torre construída via UI', (await g('__game.plotInfo')).some(p => p.type === 'archer'));

console.log('▶ base de defesa via debug + noite 1 acelerada…');
await g('__game.addCoins(600)');
await g('__game.buildAt(2,"archer")');
await g('__game.buildAt(4,"archer")');
await g('__game.buildAt(1,"barracks")');
await g('__game.buildAt(6,"farm")');
await g('__game.buildAt(8,"farm")');
check('soldados criados pelo quartel', (await g('__game.soldierCount')) >= 2);
const coinsBeforeNight = await g('__game.coins');
await g('__game.timeScale = 6');
await g('__game.forceNight()');
await page.waitForTimeout(300);
check('estado = night', (await g('__game.state')) === 'night');
await waitFor('__game.enemyCount > 0', 20000);
check('inimigos surgiram', true);
await shot(page, '03-noite');
await waitFor('__game.state !== "night"', 90000);
check('noite 1 sobrevivida (voltou a ser dia)', (await g('__game.state')) === 'day');
check('contador de noites = 2', (await g('__game.night')) === 2);
check('abates registrados', (await g('__game.kills')) > 0);
check('renda das fazendas + moedas de abates', (await g('__game.coins')) > coinsBeforeNight);
await shot(page, '04-amanhecer');

console.log('▶ noites 2 e 3, reforçando a base entre elas (como um jogador)…');
await g('__game.repairAll(); __game.buildAt(7,"archer"); __game.buildAt(9,"archer"); __game.upgradeAt(0); __game.upgradeAt(2)');
await g('__game.forceNight()');
await waitFor('__game.state !== "night"', 90000);
check('noite 2 sobrevivida', (await g('__game.night')) === 3);
await g('__game.repairAll(); __game.buildAt(11,"archer"); __game.buildAt(13,"archer"); __game.upgradeAt(4); __game.upgradeAt(1)');
await g('__game.forceNight()');
await waitFor('__game.state !== "night"', 90000);
check('noite 3 sobrevivida', (await g('__game.night')) === 4);

console.log('▶ derrota e reinício…');
await g('__game.hurtCastle(9999)');
await g('__game.forceNight()');
await waitFor('__game.state === "gameover"', 30000);
check('game over ao castelo cair', true);
await shot(page, '05-gameover');
await page.tap('#retryBtn');
await page.waitForTimeout(300);
check('reinício funciona (day, noite 1)', (await g('__game.state')) === 'day' && (await g('__game.night')) === 1);

const realErrors = errors.filter(e => !/favicon|sw\.js|net::ERR/i.test(e));
if (realErrors.length) {
  console.log('\n❌ ERROS:');
  for (const e of realErrors) console.log('  - ' + e);
  await browser.close();
  process.exit(1);
}
console.log(`\n✅ TODOS OS ${passed} TESTES PASSARAM, sem erros de console.`);
await browser.close();
