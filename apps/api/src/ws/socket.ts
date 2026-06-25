import type { FastifyInstance } from 'fastify';
import type { ClientMessage, ServerMessage } from '@g-coins/shared';
import type { CandleEvent, TickEvent } from '../sim/service';

// WebSocket: cliente assina símbolos e recebe ticks/candles ao vivo — ver SPEC §8.
export async function wsRoutes(app: FastifyInstance): Promise<void> {
  const sim = app.sim;

  app.get('/ws', { websocket: true }, (socket) => {
    const subs = new Set<string>();

    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));

    const onTick = (e: TickEvent) => {
      if (subs.has(e.symbol)) {
        send({ type: 'tick', symbol: e.symbol, price: String(e.price), ts: new Date(e.ts).toISOString() });
      }
    };
    const onCandle = (e: CandleEvent) => {
      if (subs.has(e.symbol)) {
        send({ type: 'candle', symbol: e.symbol, candle: e.candle });
      }
    };

    sim.on('tick', onTick);
    sim.on('candle', onCandle);

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
      }
    });

    socket.on('close', () => {
      sim.off('tick', onTick);
      sim.off('candle', onCandle);
    });
  });
}
