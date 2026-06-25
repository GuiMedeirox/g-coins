# G Coins 🪙

**Simulador educacional de mercado.** Opere com uma moeda fictícia (G Coins) — sem dinheiro real,
sem cadastro de pagamento. Aprenda mecânica de mercado (long/short, P&L, leitura de gráfico) num
sandbox onde os **preços são 100% simulados no servidor**.

> Projeto fullstack TypeScript (Node.js + React + tempo real + AWS) construído com **metodologia
> IA-first / SDD**. O processo é parte do produto: a especificação e os guardrails da IA vivem no repo.

## Como foi construído (IA-first / SDD)

Este projeto é desenvolvido com IA (Claude Code) sob um contrato explícito:

- [`specs/SPEC.md`](specs/SPEC.md) — **fonte de verdade**: escopo, modelo de dados, motor de preço,
  contrato de API, critérios de aceite. Comportamento novo começa aqui.
- [`CLAUDE.md`](CLAUDE.md) — **guardrails da IA**: o que ela deve e não deve fazer, regras de código,
  e o fluxo *spec → gera → revisa criticamente → testa → commit*.

A IA entrega velocidade; o humano garante padrão, correção e ausência de alucinação — rápido e de
primeira, sem retrabalho.

## Stack

TypeScript ponta a ponta · Node.js + Fastify · Prisma + PostgreSQL · WebSocket (tempo real) ·
React + Vite · pnpm workspaces · Vitest · deploy AWS.

## Estrutura

```
apps/api      Fastify + TS — REST, WebSocket, motor de simulação, Prisma
apps/web      React + Vite + TS — UI, gráfico, conexão WS
packages/shared   tipos/contratos compartilhados (DTOs, enums, mensagens WS)
specs/        SPEC.md (canônico), specs de feature e ADRs
```

## Rodando localmente

Pré-requisitos: Node 20+, pnpm 9+, Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d                            # Postgres
pnpm --filter @g-coins/api prisma generate      # Prisma Client
pnpm --filter @g-coins/api prisma migrate dev   # cria o schema no banco
pnpm dev                                         # api (:3333) + web (:5173)
```

A web mostra o status da API consumindo `GET /health`.

## Scripts

```bash
pnpm dev         # api + web em paralelo
pnpm typecheck   # checagem de tipos (todos os pacotes)
pnpm lint        # lint
pnpm test        # testes (Vitest)
pnpm build       # build de produção
```

## Roadmap

| Marco | Entrega |
|-------|---------|
| **M0** | Esqueleto: monorepo, Prisma, docker-compose, CI, healthcheck ✅ |
| **M1** | Auth e carteira de G Coins (register/login JWT, `GET /me`) ✅ |
| **M2** | Motor de preço (GBM) + ticks via WebSocket + candles + preço ao vivo no front ✅ |
| M3 | Abrir/fechar long/short + P&L em tempo real |
| M4 | Histórico de trades + reset de carteira |
| M5 | Deploy AWS |

Detalhes e critérios de aceite em [`specs/SPEC.md`](specs/SPEC.md).
