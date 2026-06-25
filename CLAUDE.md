# CLAUDE.md — Contexto e guardrails do G Coins

> Este arquivo é o contrato com qualquer IA (Claude Code, Cursor, etc.) que trabalhe neste repo.
> A IA acelera; o humano garante que o output fique dentro do padrão — rápido e de primeira, sem
> alucinação nem vício. **`AGENTS.md` aponta para cá: esta é a fonte única.**

## O que é o projeto

G Coins é um **simulador educacional de mercado**: o usuário opera com uma moeda fictícia (G Coins),
sem dinheiro real. Preços são **100% simulados no servidor**. A especificação completa e canônica está
em [`specs/SPEC.md`](specs/SPEC.md) — **leia antes de implementar qualquer coisa**.

## Princípios (inegociáveis)

1. **A spec manda.** Comportamento novo começa editando `specs/`, depois o código. Não inventar regra
   de negócio que não esteja na spec.
2. **Sem over-engineering.** Implementar só o que está em "Objetivos" da spec. Em dúvida, a solução mais
   simples que atende ao critério de pronto.
3. **Server-authoritative.** Preço, P&L e saldo são calculados e validados no **servidor**. O cliente
   nunca é fonte de verdade financeira.
4. **Contrato único.** Tipos/DTOs/enums compartilhados vivem em `packages/shared`. Proibido duplicar
   tipo de request/response entre api e web.

## Regras de código

- **TypeScript estrito** (`strict: true`). Sem `any` não justificado.
- Toda rota Fastify tem **schema de validação** de input/output (JSON Schema nativo).
- Toda operação financeira (abrir/fechar/reset) roda em **transação**; as invariantes de carteira
  (seção 5 da spec) têm teste.
- **Dinheiro como `Decimal`** — nunca `float` em saldo ou P&L persistido.
- **Testes obrigatórios** para: motor de simulação (com gerador de ruído seedável), cálculo de P&L
  (long/short, ganho/perda) e proteção de saldo (não fica negativo / não abre sem saldo).
- Commits pequenos e descritivos; cada feature referencia a história (`US-x`) que atende.

## O que a IA NÃO deve fazer

- Não adicionar libs/serviços fora do que a spec lista sem registrar um **ADR** (`specs/adr/`) e pedir revisão.
- Não implementar não-objetivos: alavancagem, feed externo de preço, pagamentos, mobile nativo.
- Não "consertar" números de saldo/P&L no cliente; divergência é reportada ao servidor.
- Não silenciar erro de transação financeira; falha de saldo é erro **explícito** (`INSUFFICIENT_BALANCE`).

## Fluxo de trabalho IA-first

1. Escrever/atualizar a spec da feature em `specs/`.
2. Gerar a implementação com a IA usando a spec como contexto.
3. **Revisar criticamente** o output: bate com a intenção? respeita as invariantes? tem teste?
4. Rodar `pnpm typecheck && pnpm lint && pnpm test`. Só então commitar, referenciando a história.

## Estrutura do repo

```
g-coins/
├─ apps/
│  ├─ api/        # Fastify + TS: REST, WebSocket, motor de simulação, Prisma
│  └─ web/        # React + Vite + TS: UI, gráfico, conexão WS
├─ packages/
│  └─ shared/     # tipos/contratos compartilhados (DTOs, enums, mensagens WS)
├─ specs/         # SPEC.md (fonte de verdade) + specs de feature + ADRs
└─ docker-compose.yml   # Postgres local
```

## Comandos

```bash
pnpm install                                  # instala tudo (workspace)
docker compose up -d                          # sobe o Postgres local
pnpm --filter @g-coins/api prisma generate    # gera o Prisma Client
pnpm --filter @g-coins/api prisma migrate dev # roda migrations (precisa do DB no ar)
pnpm dev                                       # api + web em paralelo
pnpm typecheck                                # checagem de tipos (todos os pacotes)
pnpm lint                                      # lint (todos os pacotes)
pnpm test                                      # testes (Vitest)
```

## Stack

TypeScript ponta a ponta · Node.js + Fastify · Prisma + PostgreSQL · WebSocket · React + Vite ·
lightweight-charts · pnpm workspaces · Vitest · deploy AWS (decisão de infra fica em `specs/adr/`).
