import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@g-coins/shared';
import { prisma } from '../db';
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
}
