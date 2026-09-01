# 🗺️ ROADMAP — Tiny King: Defesa do Reino

> **Documento-mestre do projeto.** Toda sessão de desenvolvimento começa lendo este arquivo
> e termina atualizando-o. Nada é considerado "feito" sem estar marcado aqui.
>
> **Legenda:** ✅ concluído · 🔨 em andamento · ⬜ não iniciado · ❌ descartado

---

## 🎯 Visão do jogo

Réplica jogável do gameplay mostrado nos famosos **anúncios "falsos" do Kingshot**
(estilo Thronefall): um reizinho a cavalo galopa pelo mapa, constrói defesas de dia
e enfrenta hordas de inimigos à noite. O jogo que os anúncios prometeram — de verdade.

- **Gênero:** defesa de reino / tower defense ativo, partidas rápidas, dificuldade crescente
- **Plataforma-alvo:** **Android (APK instalável)**, jogado em retrato, controles de toque
- **Tecnologia:** HTML5/Canvas puro (zero dependências) + Capacitor para empacotar como app
- **Arte/som:** 100% originais e procedurais (formas no canvas + síntese WebAudio) — nada de assets do Kingshot/Thronefall
- **Nome provisório:** *Tiny King — Defesa do Reino* (aberto a mudança)

### Pilares de design
1. **Pega-e-joga:** entender em 10 segundos, como num anúncio
2. **Ciclo dia/noite:** planejar de dia (construir/melhorar), sobreviver à noite (ação)
3. **"Só mais uma noite":** progressão infinita com recorde de noites sobrevividas
4. **Game feel:** partículas, tremor de tela, números de dano, sons — tudo tem que ser gostoso

### Loop principal
```
DIA: coletar moedas → construir/melhorar torres, fazendas, quartéis → iniciar a noite
NOITE: hordas atacam → torres atiram, soldados lutam, rei combate → sobreviver
AMANHECER: renda das fazendas → dificuldade sobe → repete até o castelo cair
```

---

## FASE 0 — Fundação 🔨

Infraestrutura do projeto e do ambiente de desenvolvimento/teste.

- [x] Repositório criado e acessível (`davidbuckley96/shooting-game`)
- [x] Pesquisa de referência: arquétipos dos anúncios do Kingshot documentados
- [x] Decisão de tecnologia (HTML5/Canvas + Capacitor/APK) — ver Decisões, abaixo
- [x] Esqueleto do projeto: `index.html`, UI base (overlays, painéis), `manifest.json`, `sw.js`, `icon.svg`
- [ ] Pipeline de teste automatizado (Playwright + Chromium headless: erros de console, screenshots, bot que joga sozinho)
- [ ] Primeiro commit/push e estrutura de branches definida

## FASE 1 — Protótipo jogável (vertical slice) 🔨

O núcleo do jogo funcionando de ponta a ponta, ainda sem polimento.

- [ ] Loop de jogo (game loop, câmera que segue o rei, mundo maior que a tela)
- [ ] Controle do rei por joystick virtual de toque (+ teclado no desktop p/ testes)
- [ ] Castelo central com HP; derrota quando cai
- [ ] Canteiros de construção + painel de construir (torre 🏹, fazenda 🌾, quartel ⛺)
- [ ] Ciclo dia/noite com transição visual (escurecer, iluminação ao redor de torres/rei)
- [ ] Inimigos com IA simples (avançar, atacar estruturas/rei) e waves noturnas
- [ ] Combate: torres atiram flechas, soldados lutam, rei ataca de perto
- [ ] Economia: moedas por abate + renda de fazendas ao amanhecer
- [ ] Game over + reinício + contagem de noites sobrevividas
- [ ] **Marco: dá para jogar 3+ noites seguidas sem bugs** (validado por teste automatizado)

## FASE 2 — Conteúdo & profundidade ⬜

Transformar o protótipo em jogo com decisões interessantes.

- [ ] Upgrades de estruturas (níveis 1→3, custos e efeitos crescentes)
- [ ] Reparo de estruturas danificadas
- [ ] 3+ tipos de inimigos (rápido/fraco, lento/tanque, à distância?) + **chefão** a cada 5 noites
- [ ] Curva de dificuldade e balanceamento da economia (planilha de tuning + simulações automáticas)
- [ ] Variedade de mapa (obstáculos, pontos de spawn variados)
- [ ] Habilidade especial do rei (ex.: investida da cavalaria com cooldown)
- [ ] Recorde persistente (localStorage) e estatísticas de fim de partida

## FASE 3 — Polimento (game feel, arte e som) ⬜

- [ ] Arte procedural caprichada: rei/cavalo animados, inimigos com personalidade, castelo bonito
- [ ] Partículas, tremor de tela, números de dano, knockback, flashes de acerto
- [ ] Efeitos sonoros sintetizados (moeda, construção, corneta da noite, amanhecer, derrota)
- [ ] Música simples de fundo (dia calmo / noite tensa) com botão de mudo
- [ ] Tutorial integrado na primeira partida (dicas contextuais, sem parede de texto)
- [ ] Menus e telas com identidade visual (título, game over, pausa)
- [ ] Sensação de anúncio: mensagens tipo "Consegue fazer melhor?" no game over 😏

## FASE 4 — Qualidade & compatibilidade ⬜

- [ ] Suíte de testes automatizados completa (fluxos de UI, partida acelerada, regressões)
- [ ] Performance: 60fps com 80+ inimigos em tela (throttle de partículas, pooling se preciso)
- [ ] Telas variadas: proporções 16:9 → 21:9, notch/safe-area, densidades de pixel
- [ ] Pausa automática ao sair do app; retomada limpa
- [ ] Revisão de bugs conhecidos (manter lista na seção Bugs, abaixo)

## FASE 5 — Empacotamento Android (APK) ⬜

- [ ] Projeto Capacitor configurado (`android/`), ícone e splash screen nativos
- [ ] Tentativa de build local do APK no ambiente de desenvolvimento (Android SDK + Gradle)
- [ ] **Plano B garantido:** workflow GitHub Actions que compila APK a cada push e publica em Releases
- [ ] APK debug assinado, instalável ("fontes desconhecidas") — testado no aparelho do David
- [ ] Ajustes específicos de dispositivo com base no feedback real (toque, performance, tela)
- [ ] **Marco: APK v1.0 baixável na aba Releases do GitHub**

## FASE 6 — Iteração pós-v1.0 ⬜

Backlog aberto — priorizar com feedback de quem jogar.

- [ ] Balanceamento fino com dados de partidas reais
- [ ] Novas construções (muralhas? torre de gelo? mina de ouro?)
- [ ] Modos extras (o "modo anúncio": IA joga mal de propósito com mãozinha na tela 😅)
- [ ] Vibração (haptics) via Capacitor
- [ ] (Se desejado) preparação para Play Store: AAB, assinatura de release, conta de dev

---

## 📌 Decisões registradas

| Data | Decisão | Motivo |
|---|---|---|
| 2026-09-01 | Gameplay: defesa de reino estilo Thronefall | Arquétipo mais icônico dos anúncios do Kingshot (escolha do David) |
| 2026-09-01 | HTML5/Canvas puro, sem engine | Único caminho onde a IA desenvolve, testa e debuga 100% sozinha (Chromium headless) |
| 2026-09-01 | Distribuição: APK baixável, fora da App Store | Celular do David é Android; sem necessidade de lojas |
| 2026-09-01 | Capacitor como empacotador | Gera app Android nativo a partir do jogo web; caminho p/ Play Store fica aberto |
| 2026-09-01 | Arte e sons 100% originais/procedurais | Evitar qualquer uso de marca/assets do Kingshot ou Thronefall |

## 🐞 Bugs conhecidos

*(vazio — registrar aqui todo bug encontrado e não corrigido na hora)*

## 📓 Diário de desenvolvimento

- **2026-09-01** — Pesquisa dos anúncios concluída; tecnologia e distribuição decididas;
  esqueleto do projeto criado (HTML/UI/PWA); início do código do jogo (`game.js` **WIP —
  incompleto, ainda não roda**); criação deste roadmap.
