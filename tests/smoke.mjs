// Teste v4: colocação livre de torres, lane fixa por nível, inventário, mercado.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const EXE = process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.GAME_URL || 'http://localhost:8123';
mkdirSync('shots', { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx2.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
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

console.log('▶ menu, mercado e inventário…');
await page.goto(BASE, { waitUntil: 'load' });
await waitFor('__game.spritesReady', 20000);
check('menu visível', await page.isVisible('#menu'));
check('mercado com 7 itens', (await page.$$('#shop .shopItem')).length === 7);
await page.tap('#invBtn');
await page.waitForTimeout(300);
check('inventário abriu', await g('__game.inventoryOpen'));
check('equipamento listado (espada + escudo)', (await page.$$('#invList .invItem')).length >= 4);
await page.screenshot({ path: 'shots/v4-01-inventario.png' });
await page.tap('#invCloseBtn');
await page.waitForTimeout(200);
check('inventário fechou', !(await g('__game.inventoryOpen')));

console.log('▶ nível 1: colocação livre na lane SUL…');
await page.tap('#playBtn');
await page.waitForTimeout(300);
check('estado = play', (await g('__game.state')) === 'play');
// construção via painel: rei num ponto válido fora da lane
await g('__game.teleport(560, 950)');
await page.waitForTimeout(400);
check('painel oferece construir aqui', await page.isVisible('#buildPanel button[data-act="build"]'));
const coinsAntes = await g('__game.coins');
await page.tap('#buildPanel button[data-act="build"]');
await page.waitForTimeout(200);
check('torre erguida onde o rei estava', (await g('__game.builds')).length === 1);
check('moedas debitadas', (await g('__game.coins')) === coinsAntes - 60);
// bloqueio em cima da lane
await g('__game.teleport(700, 950)');
await page.waitForTimeout(400);
check('lane bloqueia construção', !(await page.isVisible('#buildPanel button[data-act="build"]')));
// resto da defesa flanqueando a lane sul
await g(`for (const [x,y] of [[820,700],[580,700],[820,950],[560,1150],[840,1150],[600,540]]) __game.buildAtPos(x,y)`);
await g('__game.upgradeAt(0)');
check('7 torres em campo', (await g('__game.builds')).length === 7);
const dir0 = await g('JSON.stringify(__game.wave)');
await g('__game.teleport(700, 660); __game.timeScale = 8; __game.skipCountdown()');
await waitFor('__game.enemyCount > 0', 20000);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/v4-02-wave.png' });
await waitFor('__game.state === "levelend" || __game.state === "gameover"', 240000);
check('nível 1 completo (lane fixa nas 4 waves)', (await g('__game.state')) === 'levelend');
await page.tap('#menuBtn');
await page.waitForTimeout(300);
const m1 = await g('__game.meta');
check('ouro guardado e missão 2', m1.gold > 0 && m1.mission === 2);

console.log('▶ mercado + nível 2 (lane OESTE): lama, consumíveis, reparo…');
await g('__game.addGold(500)');
await page.click('#shop .shopItem[data-id="atk"]');
await page.waitForTimeout(200);
check('golpe comprado no clique', (await g('__game.meta')).atk === 1);
await g('__game.giveItems()');
await page.tap('#playBtn');
await page.waitForTimeout(300);
check('nível 2 iniciado', (await g('__game.level')) === 2);
await g(`for (const [x,y] of [[260,660],[460,660],[260,900],[460,900],[620,650],[620,900]]) __game.buildAtPos(x,y)`);
await g('__game.buildAtPos(350, 660, "mud")');
check('lama posicionada livremente', (await g('__game.builds')).some(b => b.kind === 'mud'));
await g('__game.teleport(560, 770); __game.timeScale = 8; __game.skipCountdown()');
await waitFor('__game.enemyCount > 3', 30000);
await g('__game.useFreeze()');
check('congelamento ativo', (await g('__game.freezeT')) > 0);
const k0 = await g('__game.kills');
await g('__game.useBomb()');
await page.waitForTimeout(600);
check('bomba causou abates', (await g('__game.kills')) > k0);
await g('__game.hurtManor(300); __game.addCoins(400)');
await g('__game.teleport(700, 620)');
await page.waitForTimeout(500);
const hpBefore = await g('__game.manorHp');
await page.tap('#buildPanel button[data-act="repair"]');
await page.waitForTimeout(300);
check('reparo funcionou', (await g('__game.manorHp')) > hpBefore);

console.log('▶ pausa e abandono (anti-farm)…');
await page.tap('#pauseBtn');
await page.waitForTimeout(200);
check('pausou', await g('__game.paused'));
await page.tap('#resumeBtn');
await page.waitForTimeout(200);
check('retomou', !(await g('__game.paused')));
const goldPreAband = (await g('__game.meta')).gold;
await g('__game.addCoins(500)');
await page.tap('#pauseBtn');
await page.tap('#abandonBtn');
await page.waitForTimeout(300);
check('abandonou para o menu SEM guardar as moedas', (await g('__game.state')) === 'menu' && (await g('__game.meta')).gold === goldPreAband);
await page.tap('#playBtn');
await page.waitForTimeout(300);
await g('__game.timeScale = 8; __game.skipCountdown()');
await waitFor('__game.enemyCount > 0', 30000);

console.log('▶ derrota mantém o ouro…');
const goldBefore = (await g('__game.meta')).gold;
await g('__game.addCoins(50); __game.hurtManor(9999)');
await waitFor('__game.state === "gameover"', 30000);
await page.tap('#retryBtn');
await page.waitForTimeout(300);
check('menu após derrota, ouro guardado', (await g('__game.state')) === 'menu' && (await g('__game.meta')).gold > goldBefore);

const realErrors = errors.filter(e => !/favicon|sw\.js|net::ERR/i.test(e));
if (realErrors.length) {
  console.log('\n❌ ERROS:');
  for (const e of realErrors) console.log('  - ' + e);
  await browser.close();
  process.exit(1);
}
console.log(`\n✅ TODOS OS ${passed} TESTES PASSARAM, sem erros de console.`);
await browser.close();
