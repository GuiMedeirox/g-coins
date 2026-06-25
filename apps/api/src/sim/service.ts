import { EventEmitter } from 'node:events';
import type { CandleDTO } from '@g-coins/shared';
import { prisma } from '../db';
import { CandleBuilder } from './candles';
import { gaussian, mulberry32, nextPrice, seedFromSymbol, type EngineConfig } from './engine';

export interface TickEvent {
  symbol: string;
  price: number;
  ts: number;
}

export interface CandleEvent {
  symbol: string;
  candle: CandleDTO;
}

interface AssetState {
  id: string;
  symbol: string;
  price: number;
  cfg: EngineConfig;
  rng: () => number;
  builder: CandleBuilder;
}

interface StoredConfig extends EngineConfig {
  basePrice?: number;
  seed?: number;
}

const CANDLE_INTERVAL_MS = 60_000; // candles de 1m
const TICK_MS = 1_000;

// Serviço de simulação server-authoritative. Emite 'tick' e 'candle'.
// O loop NÃO inicia sozinho — chame start() (feito em server.ts), para que testes
// possam montar o app sem rodar o loop.
export class SimulationService extends EventEmitter {
  private readonly states = new Map<string, AssetState>();
  private timer: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (this.timer) return;
    const assets = await prisma.asset.findMany({ where: { isActive: true } });
    for (const a of assets) {
      const cfg = a.config as unknown as StoredConfig;
      this.states.set(a.symbol, {
        id: a.id,
        symbol: a.symbol,
        price: Number(a.currentPrice),
        cfg: { mu: cfg.mu, sigma: cfg.sigma, dt: cfg.dt },
        rng: mulberry32(cfg.seed ?? seedFromSymbol(a.symbol)),
        builder: new CandleBuilder(CANDLE_INTERVAL_MS),
      });
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getAssetPrice(symbol: string): number | undefined {
    return this.states.get(symbol)?.price;
  }

  private async tick(): Promise<void> {
    const ts = Date.now();
    for (const st of this.states.values()) {
      const z = gaussian(st.rng);
      st.price = nextPrice(st.price, st.cfg, z);
      this.emit('tick', { symbol: st.symbol, price: st.price, ts } satisfies TickEvent);

      // Persiste o preço corrente (fire-and-forget; o loop não bloqueia em I/O).
      void prisma.asset.update({ where: { id: st.id }, data: { currentPrice: st.price } }).catch(() => {});

      const closed = st.builder.add(st.price, ts);
      if (closed) {
        void prisma.candle
          .create({
            data: {
              assetId: st.id,
              interval: '1m',
              openTime: new Date(closed.openTime),
              open: closed.open,
              high: closed.high,
              low: closed.low,
              close: closed.close,
            },
          })
          .catch(() => {});

        const candle: CandleDTO = {
          openTime: new Date(closed.openTime).toISOString(),
          open: String(closed.open),
          high: String(closed.high),
          low: String(closed.low),
          close: String(closed.close),
        };
        this.emit('candle', { symbol: st.symbol, candle } satisfies CandleEvent);
      }
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    sim: SimulationService;
  }
}
