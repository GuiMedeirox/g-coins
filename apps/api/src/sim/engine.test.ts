import { describe, it, expect } from 'vitest';
import { mulberry32, gaussian, nextPrice, seedFromSymbol } from './engine';

describe('mulberry32 (PRNG seedável)', () => {
  it('mesma seed produz a mesma sequência', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('valores no intervalo [0, 1)', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('gaussian (Box-Muller)', () => {
  it('produz números finitos e média próxima de zero', () => {
    const rng = mulberry32(123);
    let sum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const z = gaussian(rng);
      expect(Number.isFinite(z)).toBe(true);
      sum += z;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
  });
});

describe('nextPrice (GBM)', () => {
  const cfg = { mu: 0, sigma: 0.01, dt: 1 };

  it('com z=0 aplica apenas o drift (determinístico)', () => {
    const price = nextPrice(100, cfg, 0);
    expect(price).toBeCloseTo(100 * Math.exp(-0.5 * cfg.sigma ** 2 * cfg.dt), 10);
  });

  it('mantém o preço positivo para qualquer z', () => {
    for (const z of [-10, -1, 0, 1, 10, 100]) {
      expect(nextPrice(100, cfg, z)).toBeGreaterThan(0);
    }
  });

  it('z positivo sobe, z negativo cai (sigma > 0)', () => {
    expect(nextPrice(100, cfg, 1)).toBeGreaterThan(nextPrice(100, cfg, -1));
  });
});

describe('seedFromSymbol', () => {
  it('é estável e não-negativo', () => {
    expect(seedFromSymbol('GOLD-G')).toBe(seedFromSymbol('GOLD-G'));
    expect(seedFromSymbol('GOLD-G')).toBeGreaterThanOrEqual(0);
  });
});
