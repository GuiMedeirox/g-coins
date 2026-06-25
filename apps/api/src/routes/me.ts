import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { INITIAL_BALANCE, type MeResponse, type ResetResponse } from '@g-coins/shared';
import { prisma } from '../db';
import { computePnl } from '../lib/pnl';
import { toUserDTO, toWalletDTO } from '../lib/mappers';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  // US-1: dados do usuário autenticado + carteira.
  app.get('/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });

    if (!user || !user.wallet) {
      return reply
        .code(404)
        .send({ error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' } });
    }

    const body: MeResponse = { user: toUserDTO(user), wallet: toWalletDTO(user.wallet) };
    return reply.send(body);
  });

  // US-8: reset da carteira. Fecha as posições abertas (realizando o P&L no histórico)
  // e volta ao saldo inicial. Tudo numa transação.
  app.post('/me/reset', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;

    const wallet = await prisma.$transaction(async (tx) => {
      const open = await tx.position.findMany({
        where: { userId, status: 'OPEN' },
        include: { asset: true },
      });

      for (const pos of open) {
        const live = app.sim.getAssetPrice(pos.asset.symbol);
        const exit = live !== undefined ? new Prisma.Decimal(live) : pos.asset.currentPrice;
        const pnl = computePnl(pos.side, pos.size, pos.entryPrice, exit);
        await tx.position.update({
          where: { id: pos.id },
          data: { status: 'CLOSED', exitPrice: exit, pnl, closedAt: new Date() },
        });
      }

      return tx.wallet.update({
        where: { userId },
        data: { balance: INITIAL_BALANCE, reserved: 0 },
      });
    });

    const body: ResetResponse = { wallet: toWalletDTO(wallet) };
    return reply.send(body);
  });
}
