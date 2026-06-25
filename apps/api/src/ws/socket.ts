import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import type { ClientMessage, ServerMessage, Side } from '@g-coins/shared';
import type { CandleEvent, TickEvent } from '../sim/service';
import { prisma } from '../db';
import { computePnl } from '../lib/pnl';

interface CachedPosition {
  id: string;
  symbol: string;
  side: Side;
  size: Prisma.Decimal;
  entry: Prisma.Decimal;
}

const POSITIONS_REFRESH_MS = 3_000;

// WebSocket: assina símbolos e recebe ticks/candles ao vivo. Se a conexão trouxer um
// token (?token=...), também recebe P&L não realizado das posições abertas — ver SPEC §8.
export async function wsRoutes(app: FastifyInstance): Promise<void> {
  const sim = app.sim;

  app.get('/ws', { websocket: true }, (socket, req: FastifyRequest) => {
    const subs = new Set<string>();
    let userId: string | null = null;
    let positions: CachedPosition[] = [];
    let refreshTimer: NodeJS.Timeout | null = null;

    const token = (req.query as { token?: string }).token;
    if (token) {
      try {
        userId = app.jwt.verify<{ sub: string }>(token).sub;
      } catch {
        userId = null;
      }
    }

    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));

    const loadPositions = async (): Promise<void> => {
      if (!userId) return;
      const open = await prisma.position.findMany({
        where: { userId, status: 'OPEN' },
        include: { asset: true },
      });
      positions = open.map((p) => ({
        id: p.id,
        symbol: p.asset.symbol,
        side: p.side,
        size: p.size,
        entry: p.entryPrice,
      }));
    };

    const sendPnl = (): void => {
      if (!userId || positions.length === 0) return;
      const list = positions.map((p) => {
        const price = sim.getAssetPrice(p.symbol);
        const priceD = price !== undefined ? new Prisma.Decimal(price) : p.entry;
        return { id: p.id, unrealizedPnl: computePnl(p.side, p.size, p.entry, priceD).toString() };
      });
      send({ type: 'pnl', positions: list });
    };

    const onTick = (e: TickEvent): void => {
      if (subs.has(e.symbol)) {
        send({ type: 'tick', symbol: e.symbol, price: String(e.price), ts: new Date(e.ts).toISOString() });
      }
      if (userId && positions.some((p) => p.symbol === e.symbol)) sendPnl();
    };
    const onCandle = (e: CandleEvent): void => {
      if (subs.has(e.symbol)) send({ type: 'candle', symbol: e.symbol, candle: e.candle });
    };

    sim.on('tick', onTick);
    sim.on('candle', onCandle);

    if (userId) {
      void loadPositions();
      refreshTimer = setInterval(() => void loadPositions(), POSITIONS_REFRESH_MS);
    }

    socket.on('message', (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (msg.type === 'subscribe') {
        for (const s of msg.symbols) subs.add(s);
      } else if (msg.type === 'unsubscribe') {
        for (const s of msg.symbols) subs.delete(s);
      } else if (msg.type === 'refresh-positions') {
        void loadPositions().then(sendPnl);
      }
    });

    socket.on('close', () => {
      sim.off('tick', onTick);
      sim.off('candle', onCandle);
      if (refreshTimer) clearInterval(refreshTimer);
    });
  });
}
