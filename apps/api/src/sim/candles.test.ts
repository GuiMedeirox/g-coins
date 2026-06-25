import { describe, it, expect } from 'vitest';
import { bucketStart, CandleBuilder } from './candles';

const MIN = 60_000;

describe('bucketStart', () => {
  it('alinha o timestamp ao início do intervalo', () => {
    expect(bucketStart(90_000, MIN)).toBe(60_000);
    expect(bucketStart(60_000, MIN)).toBe(60_000);
    expect(bucketStart(119_999, MIN)).toBe(60_000);
    expect(bucketStart(120_000, MIN)).toBe(120_000);
  });
});

describe('CandleBuilder', () => {
  it('agrega OHLC enquanto está no mesmo bucket', () => {
    const b = new CandleBuilder(MIN);
    expect(b.add(100, 60_000)).toBeNull(); // open
    expect(b.add(105, 60_500)).toBeNull(); // high
    expect(b.add(98, 60_900)).toBeNull(); // low
    expect(b.add(102, 60_950)).toBeNull(); // close

    const c = b.currentCandle;
    expect(c).not.toBeNull();
    expect(c).toMatchObject({ openTime: 60_000, open: 100, high: 105, low: 98, close: 102 });
  });

  it('fecha o candle ao cruzar para um novo bucket', () => {
    const b = new CandleBuilder(MIN);
    b.add(100, 60_000);
    b.add(110, 60_500);
    const closed = b.add(108, 120_001); // novo bucket -> fecha o anterior

    expect(closed).toMatchObject({ openTime: 60_000, open: 100, high: 110, low: 100, close: 110 });
    expect(b.currentCandle).toMatchObject({ openTime: 120_000, open: 108, close: 108 });
  });
});
