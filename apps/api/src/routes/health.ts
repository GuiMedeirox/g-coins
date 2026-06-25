import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@g-coins/shared';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['status', 'service', 'ts'],
            properties: {
              status: { type: 'string', enum: ['ok'] },
              service: { type: 'string' },
              ts: { type: 'string' },
            },
          },
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      service: 'g-coins-api',
      ts: new Date().toISOString(),
    }),
  );
}
