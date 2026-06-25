import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { authPlugin } from './plugins/auth';
import { SimulationService } from './sim/service';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { assetRoutes } from './routes/assets';
import { wsRoutes } from './ws/socket';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    // Logger silenciado em testes para output limpo.
    logger: process.env.NODE_ENV !== 'test',
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
  app.register(wsRoutes);

  return app;
}
