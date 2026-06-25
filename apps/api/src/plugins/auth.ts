import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

// Plugin de autenticação JWT. Registra @fastify/jwt e expõe `app.authenticate`
// como preHandler para rotas protegidas.
export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      await reply
        .code(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Token inválido ou ausente' } });
    }
  });
});
