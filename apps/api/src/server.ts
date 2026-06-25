import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3333);

const app = buildApp();

app
  .listen({ port, host: '0.0.0.0' })
  .then(async (address) => {
    await app.sim.start();
    app.log.info(`G Coins API ready at ${address} (simulation running)`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
