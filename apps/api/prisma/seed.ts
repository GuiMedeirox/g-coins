import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Ativos fictícios. mu/sigma são por tick (dt=1). sigma maior => mais volátil.
const ASSETS = [
  { symbol: 'GOLD-G', name: 'G Gold', basePrice: 2000, mu: 0, sigma: 0.002, dt: 1 },
  { symbol: 'OIL-G', name: 'G Oil', basePrice: 80, mu: 0, sigma: 0.004, dt: 1 },
  { symbol: 'TECH-G', name: 'G Tech Index', basePrice: 150, mu: 0.0001, sigma: 0.006, dt: 1 },
];

async function main() {
  for (const a of ASSETS) {
    await prisma.asset.upsert({
      where: { symbol: a.symbol },
      update: {
        name: a.name,
        config: { basePrice: a.basePrice, mu: a.mu, sigma: a.sigma, dt: a.dt },
      },
      create: {
        symbol: a.symbol,
        name: a.name,
        currentPrice: a.basePrice,
        isActive: true,
        config: { basePrice: a.basePrice, mu: a.mu, sigma: a.sigma, dt: a.dt },
      },
    });
    console.log(`seeded ${a.symbol}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
