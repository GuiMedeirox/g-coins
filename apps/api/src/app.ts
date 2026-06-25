import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Prisma } from '@prisma/client';
import { authPlugin } from './plugins/auth';
import { SimulationService } from './sim/service';
import { AppError } from './lib/errors';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { assetRoutes } from './routes/assets';
import { positionRoutes } from './routes/positions';
import { wsRoutes } from './ws/socket';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    // Logger silenciado em testes para output limpo.
    logger: process.env.NODE_ENV !== 'test',
  });

  // Tradução de erros para o formato { error: { code, message } } (ver SPEC §8).
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      return reply
        .code(409)
        .send({ error: { code: 'CONFLICT', message: 'Conflito de concorrência, tente novamente' } });
    }
    if (err.validation) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: err.message } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Erro interno' } });
  });

  app.register(cors, { origin: true });
  app.register(websocket);
  app.register(authPlugin);

  // Serviço de simulação disponível para as rotas. O loop só inicia via sim.start()
  // (chamado em server.ts), nunca durante os testes.
  app.decorate('sim', new SimulationService());

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(meRoutes);
  app.register(assetRoutes);
  app.register(positionRoutes);
  app.register(wsRoutes);

  return app;
}
