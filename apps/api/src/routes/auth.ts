import type { FastifyInstance } from 'fastify';
import { INITIAL_BALANCE, type AuthResponse, type LoginRequest, type RegisterRequest } from '@g-coins/shared';
import { prisma } from '../db';
import { hashPassword, verifyPassword } from '../lib/password';
import { toUserDTO } from '../lib/mappers';

const credentialsSchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
    password: { type: 'string', minLength: 6, maxLength: 200 },
  },
} as const;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // US-1: criar conta -> cria carteira com saldo inicial e retorna token.
  app.post<{ Body: RegisterRequest }>(
    '/auth/register',
    { schema: { body: credentialsSchema } },
    async (req, reply) => {
      const { email, password } = req.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply
          .code(409)
          .send({ error: { code: 'EMAIL_TAKEN', message: 'E-mail já cadastrado' } });
      }

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashPassword(password),
          wallet: { create: { balance: INITIAL_BALANCE } },
        },
      });

      const token = app.jwt.sign({ sub: user.id });
      const body: AuthResponse = { token, user: toUserDTO(user) };
      return reply.code(201).send(body);
    },
  );

  // US-1: login -> valida credenciais e retorna token.
  app.post<{ Body: LoginRequest }>(
    '/auth/login',
    { schema: { body: credentialsSchema } },
    async (req, reply) => {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return reply
          .code(401)
          .send({ error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos' } });
      }

      const token = app.jwt.sign({ sub: user.id });
      const body: AuthResponse = { token, user: toUserDTO(user) };
      return reply.send(body);
    },
  );
}
