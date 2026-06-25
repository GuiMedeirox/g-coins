# G Coins — Spec (SDD)

> Simulador **educacional** de mercado. O usuário aprende a operar (long/short, gestão de risco,
> leitura de gráfico) usando uma moeda fictícia — **G Coins** — sem dinheiro real e sem cadastro de pagamento.
> Os preços são **100% simulados no servidor** (nenhum feed externo, nenhuma corretora real).

Este documento é a **fonte de verdade** do projeto. Toda mudança de comportamento começa aqui:
edita-se a spec, depois o código. Serve também como contexto base para o fluxo IA-first
(ver [`GUARDRAILS`](#11-guardrails-ia-first) — vira o `CLAUDE.md`/`AGENTS.md` do repo).

---

## 1. Posicionamento e propósito

- **O que é:** um sandbox de trading. Você recebe um saldo inicial de G Coins, escolhe um ativo
  fictício, abre posições long/short e acompanha o P&L em tempo real.
- **O que NÃO é:** não é corretora, não é opção binária, não envolve dinheiro real, não promete retorno.
  A narrativa é **aprender mecânica de mercado sem risco** — não apostar.
- **Por que existe:** projeto-vitrine fullstack (Node + React + tempo real + AWS) construído via SDD
  para demonstrar método IA-first com guardrails.

---

## 2. Objetivos e não-objetivos

### Objetivos (MVP)
1. Cadastro/login simples e carteira de G Coins por usuário.
2. 1–3 ativos fictícios com preço simulado no servidor, atualizando em tempo real.
3. Abrir e fechar posições **long** e **short**, com cálculo de P&L correto.
4. Gráfico de candlestick + histórico de trades do usuário.
5. Deploy na AWS, observável e estável.

### Não-objetivos (fora do MVP — anti over-engineering)
- Alavancagem complexa, margem composta, ordens limit/stop avançadas, derivativos.
- Feed de preço real / integração com corretora.
- Social trading, ranking global, chat, gamificação pesada.
- App mobile nativo (a web é responsiva; React Native fica como evolução futura).
- Multi-moeda, KYC, qualquer fluxo de pagamento real.

> Regra de escopo: se um item não está em "Objetivos", ele **não entra no MVP**. Mudança de escopo
> exige editar esta seção primeiro.

---

## 3. Personas e histórias de usuário

- **Aprendiz:** quer entender como funciona long/short sem arriscar dinheiro.
  - "Como aprendiz, quero abrir uma posição com G Coins e ver meu lucro/prejuízo mudar em tempo real."
  - "Como aprendiz, quero ver meu histórico de trades pra entender meus acertos e erros."
  - "Como aprendiz, quero resetar minha carteira pro saldo inicial pra recomeçar."

### Histórias mapeadas para o MVP
| ID | História | Critério de pronto resumido |
|----|----------|------------------------------|
| US-1 | Criar conta e logar | Recebe carteira com saldo inicial (10.000 G Coins) |
| US-2 | Ver lista de ativos e preço ao vivo | Preço atualiza via WebSocket sem refresh |
| US-3 | Abrir posição long/short | Saldo é reservado; posição aparece como "aberta" |
| US-4 | Acompanhar P&L em tempo real | P&L recalcula a cada tick de preço |
| US-5 | Fechar posição | P&L é realizado e creditado/debitado na carteira |
| US-6 | Ver gráfico candlestick | Mostra histórico + atualiza o candle corrente |
| US-7 | Ver histórico de trades | Lista trades fechados com resultado |
| US-8 | Resetar carteira | Volta ao saldo inicial; fecha posições abertas |

---

## 4. Glossário de domínio

- **G Coin:** unidade de saldo fictícia. Inteiro ou 2 casas decimais (decidido: `decimal(18,2)`).
- **Asset (ativo):** instrumento simulado (ex.: `GOLD-G`, `TECH-G`, `OIL-G`). Tem preço corrente.
- **Tick:** uma atualização de preço gerada pelo servidor (intervalo fixo, ex. 1s).
- **Candle:** agregação OHLC dos ticks num intervalo (ex. 1 minuto).
- **Position (posição):** uma operação aberta. `LONG` ganha quando o preço sobe; `SHORT` quando cai.
- **Entry price:** preço no momento da abertura. **Exit price:** preço no fechamento.
- **P&L (Profit & Loss):** resultado. Não realizado (posição aberta) vs realizado (fechada).
- **Wallet (carteira):** saldo de G Coins do usuário + saldo reservado em posições abertas.

---

## 5. Modelo de dados

Banco relacional (PostgreSQL via Prisma). Esquema lógico:

```
User
  id            uuid (pk)
  email         text unique
  passwordHash  text
  createdAt     timestamptz

Wallet
  id            uuid (pk)
  userId        uuid (fk User, unique)   -- 1:1
  balance       decimal(18,2)            -- G Coins livres
  reserved      decimal(18,2)            -- G Coins travados em posições abertas
  updatedAt     timestamptz

Asset
  id            uuid (pk)
  symbol        text unique              -- ex. "GOLD-G"
  name          text
  currentPrice  decimal(18,8)            -- atualizado a cada tick
  config        jsonb                    -- params da simulação (mu, sigma, basePrice...)
  isActive      boolean

Position
  id            uuid (pk)
  userId        uuid (fk User)
  assetId       uuid (fk Asset)
  side          enum('LONG','SHORT')
  status        enum('OPEN','CLOSED')
  size          decimal(18,2)            -- G Coins alocados (stake)
  entryPrice    decimal(18,8)
  exitPrice     decimal(18,8) null
  pnl           decimal(18,2) null       -- realizado, preenchido no fechamento
  openedAt      timestamptz
  closedAt      timestamptz null

Candle                                   -- série temporal para o gráfico
  id            uuid (pk)
  assetId       uuid (fk Asset)
  interval      text                     -- "1m"
  openTime      timestamptz
  open, high, low, close   decimal(18,8)
  index (assetId, interval, openTime)    -- consulta por janela de tempo
```

**Invariantes (não podem ser violadas):**
- `Wallet.balance >= 0` sempre.
- `size <= Wallet.balance` no momento de abrir (não se opera o que não se tem).
- Ao abrir: `balance -= size`, `reserved += size`.
- Ao fechar: `reserved -= size`, `balance += size + pnl` (pode ser negativo, mas nunca deixa `balance < 0`
  — `pnl` mínimo é limitado a `-size`, ou seja, o usuário só pode perder o que apostou no MVP).

---

## 6. Motor de simulação de preço (server-authoritative)

O servidor é a **única** fonte de preço. O cliente nunca calcula nem envia preço.

- **Modelo:** Movimento Browniano Geométrico (GBM) discreto por tick:

  ```
  S(t+1) = S(t) * exp( (mu - 0.5 * sigma^2) * dt  +  sigma * sqrt(dt) * Z )
  ```
  onde `Z ~ N(0,1)`, `dt = intervalo do tick em fração de "dia"`, `mu` = drift, `sigma` = volatilidade.
  Parâmetros por ativo ficam em `Asset.config` (ex.: `GOLD-G` baixa vol, `TECH-G` alta vol).

- **Tick interval:** 1s (configurável). Um loop no servidor gera um tick por ativo ativo.
- **Limites de sanidade:** preço nunca <= 0 (GBM garante > 0); clamp opcional pra evitar explosões.
- **Determinismo/testes:** o gerador de ruído `Z` é injetável (seedável) pra testar o motor sem aleatoriedade.
- **Agregação:** cada tick atualiza `Asset.currentPrice` e o candle aberto do intervalo (`1m`).
  No fim do intervalo, fecha-se o candle e persiste-se.
- **Broadcast:** cada tick é publicado no WebSocket para os clientes inscritos naquele ativo.

> Decisão: GBM em vez de random walk puro porque produz séries realistas (sempre positivas, com
> volatilidade controlável por ativo) com matemática simples e testável. Trade-off aceito: não modela
> eventos/notícias — fora do escopo.

---

## 7. Mecânica de trading e cálculo de P&L

Posição é um **stake** em G Coins (sem alavancagem no MVP). O P&L é proporcional à variação percentual
do preço:

```
LONG:   pnl = size * ( (priceAtual / entryPrice) - 1 )
SHORT:  pnl = size * ( 1 - (priceAtual / entryPrice) )
```

- **P&L não realizado:** calculado no servidor a cada tick para posições abertas e enviado ao cliente.
- **P&L realizado:** no fechamento, `priceAtual = exitPrice`, grava-se `pnl` e atualiza a carteira.
- **Proteção de saldo (MVP):** perda máxima por posição = `size` (clamp em `pnl >= -size`). Sem dívida.
- **Concorrência:** abrir/fechar posição roda em transação no banco, lendo a carteira com lock
  (`SELECT ... FOR UPDATE` / transação serializável) pra evitar gastar o mesmo saldo duas vezes.

> Não-objetivo confirmado: alavancagem e liquidação por margem ficam pra uma v2.

---

## 8. Contrato de API

### REST (autenticado via JWT, exceto auth)
```
POST   /auth/register        { email, password }            -> { token, user }
POST   /auth/login           { email, password }            -> { token, user }
GET    /me                                                   -> { user, wallet }
POST   /me/reset                                             -> { wallet }        # US-8

GET    /assets                                               -> Asset[]           # com currentPrice
GET    /assets/:symbol/candles?interval=1m&from&to           -> Candle[]          # histórico do gráfico

GET    /positions?status=OPEN|CLOSED                         -> Position[]
POST   /positions            { assetId, side, size }         -> Position          # US-3, transação
POST   /positions/:id/close                                  -> Position          # US-5, transação
```

Erros padronizados: `{ error: { code, message } }`. Validação de input com JSON Schema (Fastify nativo).
Casos cobertos: saldo insuficiente (`INSUFFICIENT_BALANCE`), posição já fechada (`POSITION_CLOSED`),
ativo inativo (`ASSET_INACTIVE`), tamanho inválido (`INVALID_SIZE`).

### WebSocket (`/ws`)
- Cliente envia: `{ type: "subscribe", symbols: ["GOLD-G"] }` / `{ type: "unsubscribe", ... }`
- Servidor envia:
  - `{ type: "tick", symbol, price, ts }` — a cada tick do ativo inscrito.
  - `{ type: "candle", symbol, candle }` — quando um candle fecha.
  - `{ type: "pnl", positions: [{ id, unrealizedPnl }] }` — P&L não realizado do usuário (autenticado).

> Decisão: tick e candle por ativo (broadcast); P&L é por usuário (canal autenticado). Mantém o payload
> pequeno e o cálculo no servidor.

---

## 9. Arquitetura

Monorepo (pnpm workspaces), espelhando o padrão que já uso em outros projetos:

```
g-coins/
├─ apps/
│  ├─ api/        # Fastify + TypeScript: REST, WebSocket, motor de simulação, Prisma
│  └─ web/        # React + Vite + TypeScript: UI, gráfico, conexão WS
├─ packages/
│  └─ shared/     # tipos e contratos compartilhados (DTOs, enums, schemas) — single source of truth
├─ specs/         # este documento e specs de features (SDD)
├─ docker-compose.yml   # Postgres local
└─ ...
```

- **Backend:** Node.js + **Fastify** + TypeScript. Prisma + PostgreSQL. WebSocket nativo (`@fastify/websocket`).
  Motor de simulação roda como um serviço interno (loop por intervalo) que publica no barramento de WS.
- **Frontend:** **React + Vite** + TypeScript. Gráfico com **lightweight-charts** (TradingView, leve).
  Estado de servidor com TanStack Query; conexão WS num provider/hook dedicado.
- **Shared:** DTOs e enums (`Side`, `PositionStatus`), schemas de validação — importados por api e web
  pra não duplicar contrato (encosta em design system / contrato unificado).
- **Auth:** JWT stateless. Senha com hash (argon2/bcrypt).

### Deploy (AWS — diferencial da vaga)
- API em container (ECS Fargate **ou** EC2 pequena) atrás de ALB; ou Lambda se o WebSocket couber em
  API Gateway WebSocket (decisão registrada em ADR no próprio repo).
- PostgreSQL no **RDS**. Estáticos do front no **S3 + CloudFront**.
- Secrets em SSM Parameter Store. CI/CD via GitHub Actions.
- *(Escolha exata de serviços vira um ADR — manter pragmático, sem infra que o projeto não precisa.)*

---

## 10. Stack e decisões (resumo)

| Área | Escolha | Motivo |
|------|---------|--------|
| Linguagem | TypeScript (100%) | Tipagem ponta a ponta, contrato compartilhado |
| Backend | Fastify | Performance, schema/validação nativos, já domino |
| ORM/DB | Prisma + PostgreSQL | Modelagem relacional clara, migrations |
| Tempo real | WebSocket | Ticks e P&L ao vivo |
| Front | React + Vite | Core da vaga, build rápido |
| Gráfico | lightweight-charts | Candlestick performático e leve |
| Monorepo | pnpm workspaces | Compartilhar tipos/contratos |
| Auth | JWT + hash de senha | Simples, stateless |
| Testes | Vitest | Motor de preço e cálculo de P&L com gerador seedável |
| Deploy | AWS | Diferencial citado na vaga |

---

## 11. Guardrails (IA-first)

> Esta seção é o contrato com a IA. Vira o `CLAUDE.md`/`AGENTS.md` do repo. A IA acelera; o humano
> garante que o output fique dentro do padrão — rápido e de primeira, sem alucinação nem vício.

**Princípios**
1. **A spec manda.** Comportamento novo? Edita `specs/` primeiro, depois implementa. Nada de inventar regra.
2. **Sem over-engineering.** Só o que está em "Objetivos". Em dúvida, escolher a solução mais simples
   que atende ao critério de pronto.
3. **Server-authoritative.** Preço, P&L e saldo são calculados e validados no servidor. O cliente nunca
   é fonte de verdade financeira.
4. **Contrato único.** Tipos/DTOs vivem em `packages/shared`. Proibido duplicar tipo de request/response.

**Regras de código**
- TypeScript estrito (`strict: true`), sem `any` não justificado.
- Toda rota tem schema de validação de input/output (Fastify JSON Schema).
- Toda operação financeira (abrir/fechar/reset) roda em transação; invariantes da seção 5 são testadas.
- Dinheiro como `decimal` (nunca `float` em saldo/P&L persistido).
- Teste obrigatório para: motor de simulação (com seed), cálculo de P&L (long/short, ganho/perda),
  e proteção de saldo (não pode ficar negativo / não pode abrir sem saldo).
- Commits pequenos e descritivos; cada feature referencia a história (US-x) que atende.

**O que a IA NÃO deve fazer**
- Não adicionar libs/serviços fora do que a spec lista sem registrar um ADR e pedir revisão.
- Não implementar alavancagem, feed externo, pagamentos ou qualquer não-objetivo.
- Não "consertar" números de saldo no cliente; reportar divergência ao servidor.
- Não silenciar erro de transação financeira; falha de saldo é erro explícito.

**Fluxo de trabalho IA-first**
1. Escrever/atualizar a spec da feature em `specs/`.
2. Gerar implementação com a IA usando esta spec como contexto.
3. Revisar criticamente o output: bate com a intenção? respeita invariantes? tem teste?
4. Rodar testes + lint. Só então commit, referenciando a história.

---

## 12. Roadmap / marcos

| Marco | Entrega | Histórias |
|-------|---------|-----------|
| M0 — Esqueleto | Monorepo, Prisma, docker-compose, CI, healthcheck | infra |
| M1 — Auth & carteira | Register/login, `/me`, saldo inicial | US-1 |
| M2 — Motor de preço | Simulação GBM, ticks via WS, candles | US-2, US-6 |
| M3 — Trading | Abrir/fechar long/short, P&L em tempo real, transações | US-3, US-4, US-5 |
| M4 — Histórico & reset | Lista de trades, reset de carteira | US-7, US-8 |
| M5 — Deploy AWS | Subir api+web+db, observabilidade básica, ADR de infra | — |

> Cada marco é deployável e demonstrável. Se o tempo apertar, M5 pode usar a infra mais simples que
> funcione; o valor de portfólio já está em M1–M4 + o método SDD documentado.

---

## 13. Critérios de aceite (Definition of Done do MVP)

- [ ] Usuário cria conta, loga e recebe 10.000 G Coins.
- [ ] Preços de 1–3 ativos atualizam ao vivo no servidor e no gráfico, sem refresh.
- [ ] Abrir long e short reserva saldo corretamente; saldo nunca fica negativo.
- [ ] P&L não realizado bate com a fórmula da seção 7 a cada tick.
- [ ] Fechar posição realiza o P&L e atualiza a carteira corretamente (testado long e short, lucro e perda).
- [ ] Histórico de trades fechados visível e correto.
- [ ] Reset volta ao saldo inicial e fecha posições abertas.
- [ ] Testes cobrem motor de simulação (seed), cálculo de P&L e invariantes de carteira.
- [ ] App no ar na AWS, com README explicando arquitetura e o fluxo IA-first.

---

## 14. Riscos e trade-offs

- **Óptica de "aposta":** mitigado pelo enquadramento educacional, moeda fictícia e ausência de
  qualquer fluxo de dinheiro real. Comunicar isso no README e na UI.
- **Escopo inflar:** mitigado pela seção 2 (não-objetivos) como contrato rígido.
- **WebSocket na AWS:** se API Gateway WS complicar, cai pra ECS/EC2 com ALB. Decisão num ADR.
- **Precisão monetária:** uso de `decimal` e testes de invariante; nunca `float` em saldo.
- **Concorrência de carteira:** transações com lock; teste de corrida (abrir duas posições "ao mesmo tempo").
