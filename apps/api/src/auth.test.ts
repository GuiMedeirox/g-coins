import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { INITIAL_BALANCE } from '@g-coins/shared';
import { buildApp } from './app';
import { prisma } from './db';

// Estes testes exercitam o banco (Prisma). Requerem DATABASE_URL apontando para um
// Postgres migrado (docker compose up -d + prisma migrate). O CI provê um serviço Postgres.

const uniqueEmail = () => `user-${randomUUID()}@test.dev`;

describe('Auth & Wallet (US-1)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('register cria usuário com carteira de saldo inicial e retorna token', async () => {
    const email = uniqueEmail();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'secret123' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTypeOf('string');
    expect(body.user.email).toBe(email);

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(Number(me.json().wallet.balance)).toBe(INITIAL_BALANCE);
    expect(Number(me.json().wallet.reserved)).toBe(0);
  });

  it('register com e-mail repetido retorna 409', async () => {
    const email = uniqueEmail();
    const payload = { email, password: 'secret123' };
    await app.inject({ method: 'POST', url: '/auth/register', payload });
    const dup = await app.inject({ method: 'POST', url: '/auth/register', payload });
    expect(dup.statusCode).toBe(409);
  });

  it('login com credenciais corretas retorna token; senha errada retorna 401', async () => {
    const email = uniqueEmail();
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'secret123' },
    });

    const ok = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'secret123' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTypeOf('string');

    const bad = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'wrongpass' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('/me sem token retorna 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });
});
