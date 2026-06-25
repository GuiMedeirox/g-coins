import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { computePnl } from './pnl';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('computePnl (SPEC §7)', () => {
  it('LONG com alta gera lucro proporcional', () => {
    expect(computePnl('LONG', D(100), D(100), D(110)).toNumber()).toBeCloseTo(10, 8);
  });

  it('LONG com queda gera prejuízo', () => {
    expect(computePnl('LONG', D(100), D(100), D(90)).toNumber()).toBeCloseTo(-10, 8);
  });

  it('SHORT com queda gera lucro', () => {
    expect(computePnl('SHORT', D(100), D(100), D(90)).toNumber()).toBeCloseTo(10, 8);
  });

  it('SHORT com alta gera prejuízo', () => {
    expect(computePnl('SHORT', D(100), D(100), D(110)).toNumber()).toBeCloseTo(-10, 8);
  });

  it('limita a perda ao tamanho da posição (clamp em -size)', () => {
    // SHORT com preço 3x o de entrada: raw = 100*(1-3) = -200 -> clamp -100.
    expect(computePnl('SHORT', D(100), D(100), D(300)).toNumber()).toBe(-100);
  });

  it('preço igual ao de entrada => P&L zero', () => {
    expect(computePnl('LONG', D(100), D(100), D(100)).toNumber()).toBe(0);
    expect(computePnl('SHORT', D(100), D(100), D(100)).toNumber()).toBe(0);
  });
});
