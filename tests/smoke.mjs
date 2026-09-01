// Teste de fumaça v2: TD direcional com rei em sprites.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const EXE = process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.GAME_URL || 'http://localhost:8123';
mkdirSync('shots', { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
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

console.log('▶ carregando…');
await page.goto(BASE, { waitUntil: 'load' });
await waitFor('__game.spritesReady', 20000);
check('sprites do rei carregados', true);
check('menu visível', await page.isVisible('#menu'));
await page.tap('#playBtn');
await page.waitForTimeout(300);
check('estado = prep', (await g('__game.state')) === 'prep');
await page.screenshot({ path: 'shots/v2-01-prep.png' });

console.log('▶ movimento…');
const x0 = (await g('__game.kingPos')).x;
await page.keyboard.down('d');
await page.waitForTimeout(500);
await page.keyboard.up('d');
check('rei se moveu (teclado)', (await g('__game.kingPos')).x > x0 + 40);
const y0 = (await g('__game.kingPos')).y;
await page.mouse.move(200, 600); await page.mouse.down();
await page.mouse.move(200, 660, { steps: 5 });
await page.waitForTimeout(400);
await page.mouse.up();
check('rei se moveu (joystick)', (await g('__game.kingPos')).y > y0 + 30);

console.log('▶ construção via painel…');
await g('__game.teleport(520, 610)'); // perto do canteiro 0
await page.waitForTimeout(400);
check('painel apareceu', await page.isVisible('#buildPanel'));
await page.tap('#buildPanel button[data-act="build"]');
await page.waitForTimeout(200);
check('torre construída via UI', (await g('__game.plotInfo'))[0].level === 1);

console.log('▶ defesa + nível 1 acelerado…');
await g('for (let i = 1; i < 7; i++) __game.buildAt(i)');
await g('__game.upgradeAt(0)');
check('7 torres em pé', (await g('__game.plotInfo')).filter(p => p.level > 0).length === 7);
const coins0 = await g('__game.coins');
await g('__game.timeScale = 6');
await g('__game.teleport(700, 660)'); // rei defende o gargalo
await g('__game.startWave()');
await page.waitForTimeout(300);
check('estado = wave', (await g('__game.state')) === 'wave');
await waitFor('__game.enemyCount > 0', 20000);
check('horda surgiu', true);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/v2-02-wave.png' });
await waitFor('__game.state !== "wave"', 120000);
check('nível 1 vencido', (await g('__game.state')) === 'prep' && (await g('__game.level')) === 2);
check('abates > 0', (await g('__game.kills')) > 0);
check('ganhou moedas (bônus)', (await g('__game.coins')) > coins0);
await page.screenshot({ path: 'shots/v2-03-prep2.png' });

console.log('▶ níveis 2 e 3 (direções diferentes)…');
await g('__game.addCoins(600); __game.buildAt(7); __game.buildAt(8); __game.upgradeAt(1); __game.upgradeAt(4)');
await g('__game.teleport(700, 660)');
await g('__game.startWave()');
await waitFor('__game.state !== "wave"', 120000);
check('nível 2 vencido (horda do OESTE)', (await g('__game.level')) === 3);
await g('__game.upgradeAt(5); __game.upgradeAt(3); __game.upgradeAt(7)');
await g('__game.teleport(700, 660)');
await g('__game.startWave()');
await waitFor('__game.state !== "wave"', 120000);
check('nível 3 vencido (horda do LESTE)', (await g('__game.level')) === 4);

console.log('▶ derrota e reinício…');
await g('__game.hurtManor(9999)');
await g('__game.startWave()');
await waitFor('__game.state === "gameover"', 30000);
check('game over quando o casarão cai', true);
await page.screenshot({ path: 'shots/v2-04-gameover.png' });
await page.tap('#retryBtn');
await page.waitForTimeout(300);
check('reinício (prep, nível 1)', (await g('__game.state')) === 'prep' && (await g('__game.level')) === 1);

const realErrors = errors.filter(e => !/favicon|sw\.js|net::ERR/i.test(e));
if (realErrors.length) {
  console.log('\n❌ ERROS:');
  for (const e of realErrors) console.log('  - ' + e);
  await browser.close();
  process.exit(1);
}
console.log(`\n✅ TODOS OS ${passed} TESTES PASSARAM, sem erros de console.`);
await browser.close();
