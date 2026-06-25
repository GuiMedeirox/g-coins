import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { INITIAL_BALANCE } from '@g-coins/shared';
import { buildApp } from './app';
import { prisma } from './db';

const uniqueEmail = () => `reset-${randomUUID()}@test.dev`;

describe('Wallet reset (US-8)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('reset fecha posições abertas e volta ao saldo inicial', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: uniqueEmail(), password: 'secret123' },
    });
    const token = reg.json().token;

    const asset = await prisma.asset.create({
      data: {
        symbol: `R-${randomUUID().slice(0, 8)}`,
        name: 'Reset Asset',
        currentPrice: 100,
        isActive: true,
        config: { basePrice: 100, mu: 0, sigma: 0.001, dt: 1 },
      },
    });

    await app.inject({
      method: 'POST',
      url: '/positions',
      headers: { authorization: `Bearer ${token}` },
      payload: { assetId: asset.id, side: 'LONG', size: 300 },
    });

    const reset = await app.inject({
      method: 'POST',
      url: '/me/reset',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(reset.statusCode).toBe(200);
    expect(Number(reset.json().wallet.balance)).toBe(INITIAL_BALANCE);
    expect(Number(reset.json().wallet.reserved)).toBe(0);

    const open = await app.inject({
      method: 'GET',
      url: '/positions?status=OPEN',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(open.json()).toHaveLength(0);

    const closed = await app.inject({
      method: 'GET',
      url: '/positions?status=CLOSED',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(closed.json().length).toBeGreaterThanOrEqual(1);
  });
});
