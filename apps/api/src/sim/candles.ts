// Agregação de ticks em candles OHLC — ver SPEC §6.

export interface Candle {
  /** Início do intervalo em epoch ms. */
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Início do bucket (alinhado ao intervalo) para um timestamp. */
export function bucketStart(tsMs: number, intervalMs: number): number {
  return Math.floor(tsMs / intervalMs) * intervalMs;
}

/**
 * Constrói candles a partir de ticks. `add` retorna o candle FECHADO quando o
 * tick entra num novo bucket; caso contrário retorna null e atualiza o corrente.
 */
export class CandleBuilder {
  private current: Candle | null = null;

  constructor(private readonly intervalMs: number) {}

  add(price: number, tsMs: number): Candle | null {
    const start = bucketStart(tsMs, this.intervalMs);

    if (!this.current) {
      this.current = { openTime: start, open: price, high: price, low: price, close: price };
      return null;
    }

    if (start !== this.current.openTime) {
      const closed = this.current;
      this.current = { openTime: start, open: price, high: price, low: price, close: price };
      return closed;
    }

    this.current.high = Math.max(this.current.high, price);
    this.current.low = Math.min(this.current.low, price);
    this.current.close = price;
    return null;
  }

  get currentCandle(): Candle | null {
    return this.current;
  }
}
