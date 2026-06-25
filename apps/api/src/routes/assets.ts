import type { FastifyInstance } from 'fastify';
import type { AssetDTO, CandleDTO } from '@g-coins/shared';
import { prisma } from '../db';

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  // US-2: lista de ativos com preço corrente (live do serviço, fallback no DB).
  app.get('/assets', async () => {
    const assets = await prisma.asset.findMany({
      where: { isActive: true },
      orderBy: { symbol: 'asc' },
    });

    return assets.map(
      (a): AssetDTO => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        currentPrice: (app.sim.getAssetPrice(a.symbol) ?? Number(a.currentPrice)).toString(),
        isActive: a.isActive,
      }),
    );
  });

  // US-6: histórico de candles para o gráfico.
  app.get<{
    Params: { symbol: string };
    Querystring: { interval?: string };
  }>('/assets/:symbol/candles', async (req, reply) => {
    const { symbol } = req.params;
    const interval = req.query.interval ?? '1m';

    const asset = await prisma.asset.findUnique({ where: { symbol } });
    if (!asset) {
      return reply
        .code(404)
        .send({ error: { code: 'ASSET_NOT_FOUND', message: 'Ativo não encontrado' } });
    }

    const candles = await prisma.candle.findMany({
      where: { assetId: asset.id, interval },
      orderBy: { openTime: 'asc' },
      take: 500,
    });

    return candles.map(
      (c): CandleDTO => ({
        openTime: c.openTime.toISOString(),
        open: c.open.toString(),
        high: c.high.toString(),
        low: c.low.toString(),
        close: c.close.toString(),
      }),
    );
  });
}
