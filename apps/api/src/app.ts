import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { authPlugin } from './plugins/auth';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    // Logger silenciado em testes para output limpo.
    logger: process.env.NODE_ENV !== 'test',
  });

  app.register(cors, { origin: true });
  app.register(authPlugin);

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(meRoutes);

  return app;
}
