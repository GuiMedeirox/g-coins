import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import type { OpenPositionRequest } from '@g-coins/shared';
import { prisma } from '../db';
import { AppError } from '../lib/errors';
import { computePnl } from '../lib/pnl';
import { toPositionDTO } from '../lib/mappers';

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

const openSchema = {
  type: 'object',
  required: ['assetId', 'side', 'size'],
  additionalProperties: false,
  properties: {
    assetId: { type: 'string', minLength: 1 },
    side: { type: 'string', enum: ['LONG', 'SHORT'] },
    size: { type: 'number', exclusiveMinimum: 0 },
  },
} as const;

export async function positionRoutes(app: FastifyInstance): Promise<void> {
  // US-3: lista de posições do usuário (opcionalmente filtrada por status).
  app.get<{ Querystring: { status?: string } }>(
    '/positions',
    { preHandler: [app.authenticate] },
    async (req) => {
      const userId = req.user.sub;
      const status =
        req.query.status === 'OPEN' || req.query.status === 'CLOSED' ? req.query.status : undefined;

      const positions = await prisma.position.findMany({
        where: { userId, ...(status ? { status } : {}) },
        orderBy: { openedAt: 'desc' },
      });
      return positions.map(toPositionDTO);
    },
  );

  // US-3: abrir posição. Transação serializável: reserva o saldo sem permitir gasto duplo.
  app.post<{ Body: OpenPositionRequest }>(
    '/positions',
    { preHandler: [app.authenticate], schema: { body: openSchema } },
    async (req, reply) => {
      const userId = req.user.sub;
      const { assetId, side, size } = req.body;
      const sizeD = new Prisma.Decimal(size);

      const position = await prisma.$transaction(async (tx) => {
        const asset = await tx.asset.findUnique({ where: { id: assetId } });
        if (!asset || !asset.isActive) {
          throw new AppError(409, 'ASSET_INACTIVE', 'Ativo indisponível');
        }

        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new AppError(404, 'USER_NOT_FOUND', 'Carteira não encontrada');
        if (wallet.balance.lt(sizeD)) {
          throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Saldo insuficiente');
        }

        const live = app.sim.getAssetPrice(asset.symbol);
        const entry = live !== undefined ? new Prisma.Decimal(live) : asset.currentPrice;

        await tx.wallet.update({
          where: { userId },
          data: { balance: { decrement: sizeD }, reserved: { increment: sizeD } },
        });

        return tx.position.create({
          data: { userId, assetId, side, size: sizeD, entryPrice: entry, status: 'OPEN' },
        });
      }, SERIALIZABLE);

      return reply.code(201).send(toPositionDTO(position));
    },
  );

  // US-5: fechar posição. Realiza o P&L e atualiza a carteira numa transação.
  app.post<{ Params: { id: string } }>(
    '/positions/:id/close',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const { id } = req.params;

      const updated = await prisma.$transaction(async (tx) => {
        const pos = await tx.position.findUnique({ where: { id }, include: { asset: true } });
        if (!pos || pos.userId !== userId) {
          throw new AppError(404, 'POSITION_NOT_FOUND', 'Posição não encontrada');
        }
        if (pos.status === 'CLOSED') {
          throw new AppError(409, 'POSITION_CLOSED', 'Posição já fechada');
        }

        const live = app.sim.getAssetPrice(pos.asset.symbol);
        const exit = live !== undefined ? new Prisma.Decimal(live) : pos.asset.currentPrice;
        const pnl = computePnl(pos.side, pos.size, pos.entryPrice, exit);

        // reserved -= size ; balance += size + pnl  (size+pnl >= 0 pois pnl >= -size)
        await tx.wallet.update({
          where: { userId },
          data: { reserved: { decrement: pos.size }, balance: { increment: pos.size.add(pnl) } },
        });

        return tx.position.update({
          where: { id },
          data: { status: 'CLOSED', exitPrice: exit, pnl, closedAt: new Date() },
        });
      }, SERIALIZABLE);

      return reply.send(toPositionDTO(updated));
    },
  );
}
