// Teste v3: waves automáticas, fim de nível -> menu, mercado, consumíveis.
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

console.log('▶ menu e mercado…');
await page.goto(BASE, { waitUntil: 'load' });
await waitFor('__game.spritesReady', 20000);
check('menu visível', await page.isVisible('#menu'));
check('mercado com 7 itens', (await page.$$('#shop .shopItem')).length === 7);
check('ouro inicial = 0', (await g('__game.meta')).gold === 0);
await page.screenshot({ path: 'shots/v3-01-menu.png' });

console.log('▶ nível 1: waves automáticas…');
await page.tap('#playBtn');
await page.waitForTimeout(300);
check('estado = play (contagem)', (await g('__game.state')) === 'play' && (await g('__game.wave')).phase === 'countdown');
check('botão de pular visível', await page.isVisible('#nightBtn'));
await g('for (let i = 0; i < 7; i++) __game.buildAt(i)');
await g('__game.teleport(700, 660); __game.timeScale = 8; __game.skipCountdown()');
await waitFor('__game.enemyCount > 0', 20000);
check('wave 1 começou sozinha após pular contagem', (await g('__game.wave')).num === 1);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/v3-02-wave.png' });
await waitFor('__game.state === "levelend" || __game.state === "gameover"', 240000);
check('nível 1 completo (4 waves automáticas)', (await g('__game.state')) === 'levelend');
await page.screenshot({ path: 'shots/v3-03-levelend.png' });

console.log('▶ volta ao menu com ouro…');
await page.tap('#menuBtn');
await page.waitForTimeout(300);
check('voltou ao menu', (await g('__game.state')) === 'menu');
const m1 = await g('__game.meta');
check('ouro guardado > 0', m1.gold > 0);
check('missão avançou para 2', m1.mission === 2);

console.log('▶ compra no mercado (clique real)…');
await g('__game.addGold(500)');
await page.click('#shop .shopItem[data-id="atk"]');
await page.waitForTimeout(200);
const m2 = await g('__game.meta');
check('golpe +4 comprado', m2.atk === 1);
check('ouro debitado', m2.gold < m1.gold + 500);
await page.screenshot({ path: 'shots/v3-04-loja.png' });

console.log('▶ nível 2: lama, congelar, bomba, reparo…');
await g('__game.giveItems()');
await page.tap('#playBtn');
await page.waitForTimeout(300);
check('nível 2 iniciado', (await g('__game.level')) === 2);
await g('for (let i = 0; i < 6; i++) __game.buildAt(i)');
await g('__game.buildAt(6, "mud")');
check('lama construída', (await g('__game.plotInfo'))[6].kind === 'mud');
check('consumíveis visíveis', await page.isVisible('#consumables'));
await g('__game.teleport(700, 660); __game.timeScale = 8; __game.skipCountdown()');
await waitFor('__game.enemyCount > 3', 30000);
await g('__game.useFreeze()');
check('congelamento ativo', (await g('__game.freezeT')) > 0);
const k0 = await g('__game.kills');
await g('__game.useBomb()');
await page.waitForTimeout(600);
check('bomba causou abates', (await g('__game.kills')) > k0);
await g('__game.hurtManor(300)'); await g('__game.addCoins(400)');
await g('__game.teleport(700, 620)');  // perto da porta
await page.waitForTimeout(500);
const hpBefore = await g('__game.manorHp');
await page.tap('#buildPanel button[data-act="repair"]');
await page.waitForTimeout(300);
check('reparo do casarão funcionou', (await g('__game.manorHp')) > hpBefore);

console.log('▶ derrota mantém o ouro…');
const goldBefore = (await g('__game.meta')).gold;
await g('__game.addCoins(50); __game.hurtManor(9999)');
await waitFor('__game.state === "gameover"', 30000);
check('game over', true);
await page.tap('#retryBtn');
await page.waitForTimeout(300);
check('voltou ao menu após derrota', (await g('__game.state')) === 'menu');
check('ouro da derrota foi guardado', (await g('__game.meta')).gold > goldBefore);

const realErrors = errors.filter(e => !/favicon|sw\.js|net::ERR/i.test(e));
if (realErrors.length) {
  console.log('\n❌ ERROS:');
  for (const e of realErrors) console.log('  - ' + e);
  await browser.close();
  process.exit(1);
}
console.log(`\n✅ TODOS OS ${passed} TESTES PASSARAM, sem erros de console.`);
await browser.close();
