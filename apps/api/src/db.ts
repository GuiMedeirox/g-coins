import { PrismaClient } from '@prisma/client';

// Cliente Prisma único para a aplicação. Conecta de forma preguiçosa (na primeira query).
export const prisma = new PrismaClient();
