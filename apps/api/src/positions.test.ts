import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { INITIAL_BALANCE } from '@g-coins/shared';
import { buildApp } from './app';
import { prisma } from './db';

// Integração: requer Postgres migrado (CI provê o serviço; local via docker compose).

const uniqueEmail = () => `pos-${randomUUID()}@test.dev`;

async function registerUser(app: FastifyInstance): Promise<{ token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: uniqueEmail(), password: 'secret123' },
  });
  return { token: res.json().token };
}

async function createAsset(price: number) {
  return prisma.asset.create({
    data: {
      symbol: `T-${randomUUID().slice(0, 8)}`,
      name: 'Test Asset',
      currentPrice: price,
      isActive: true,
      config: { basePrice: price, mu: 0, sigma: 0.001, dt: 1 },
    },
  });
}

describe('Trading & P&L (US-3..US-5)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('abrir LONG reserva o saldo (balance -= size, reserved += size)', async () => {
    const { token } = await registerUser(app);
    const asset = await createAsset(100);

    const open = await app.inject({
      method: 'POST',
      url: '/positions',
      headers: { authorization: `Bearer ${token}` },
      payload: { assetId: asset.id, side: 'LONG', size: 200 },
    });
    expect(open.statusCode).toBe(201);
    expect(open.json().status).toBe('OPEN');
    expect(Number(open.json().entryPrice)).toBe(100);

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(Number(me.json().wallet.balance)).toBe(INITIAL_BALANCE - 200);
    expect(Number(me.json().wallet.reserved)).toBe(200);
  });

  it('abrir com saldo insuficiente retorna 409', async () => {
    const { token } = await registerUser(app);
    const asset = await createAsset(100);

    const open = await app.inject({
      method: 'POST',
      url: '/positions',
      headers: { authorization: `Bearer ${token}` },
      payload: { assetId: asset.id, side: 'LONG', size: INITIAL_BALANCE + 1 },
    });
    expect(open.statusCode).toBe(409);
    expect(open.json().error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('fechar LONG com alta realiza lucro e credita a carteira', async () => {
    const { token } = await registerUser(app);
    const asset = await createAsset(100);

    const open = await app.inject({
      method: 'POST',
      url: '/positions',
      headers: { authorization: `Bearer ${token}` },
      payload: { assetId: asset.id, side: 'LONG', size: 100 },
    });
    const posId = open.json().id;

    // preço sobe 10% (sim não roda nos testes -> usa currentPrice do ativo)
    await prisma.asset.update({ where: { id: asset.id }, data: { currentPrice: 110 } });

    const close = await app.inject({
      method: 'POST',
      url: `/positions/${posId}/close`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().status).toBe('CLOSED');
    expect(Number(close.json().pnl)).toBeCloseTo(10, 6);

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(Number(me.json().wallet.balance)).toBeCloseTo(INITIAL_BALANCE + 10, 6);
    expect(Number(me.json().wallet.reserved)).toBe(0);
  });

  it('fechar SHORT com alta realiza prejuízo; saldo nunca fica negativo', async () => {
    const { token } = await registerUser(app);
    const asset = await createAsset(100);

    const open = await app.inject({
      method: 'POST',
      url: '/positions',
      headers: { authorization: `Bearer ${token}` },
      payload: { assetId: asset.id, side: 'SHORT', size: 100 },
    });
    const posId = open.json().id;

    await prisma.asset.update({ where: { id: asset.id }, data: { currentPrice: 110 } });

    const close = await app.inject({
      method: 'POST',
      url: `/positions/${posId}/close`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(Number(close.json().pnl)).toBeCloseTo(-10, 6);

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(Number(me.json().wallet.balance)).toBeCloseTo(INITIAL_BALANCE - 10, 6);
    expect(Number(me.json().wallet.balance)).toBeGreaterThanOrEqual(0);
  });

  it('fechar uma posição já fechada retorna 409', async () => {
    const { token } = await registerUser(app);
    const asset = await createAsset(100);

    const open = await app.inject({
      method: 'POST',
      url: '/positions',
      headers: { authorization: `Bearer ${token}` },
      payload: { assetId: asset.id, side: 'LONG', size: 50 },
    });
    const posId = open.json().id;

    await app.inject({
      method: 'POST',
      url: `/positions/${posId}/close`,
      headers: { authorization: `Bearer ${token}` },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/positions/${posId}/close`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('POSITION_CLOSED');
  });
});
