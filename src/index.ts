import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDatabase } from './config/database';
import { createApp } from './app';
import { registerSocketMiddleware } from './middleware/socket.middleware';
import config from './config/index';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.cors.origin, credentials: true },
  });

  app.set('io', io);
  registerSocketMiddleware(io);

  httpServer.listen(config.port, () => {
    console.log(`Server:  http://${config.host}:${config.port}`);
    console.log(`Swagger: http://${config.host}:${config.port}/api-docs`);
  });

  function shutdown(signal: string): void {
    console.log(`\nReceived ${signal} — shutting down gracefully`);
    httpServer.close(() => {
      io.close();
      process.exit(0);
    });

    // Force exit if connections don't close within 10 s
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { shutdown('SIGINT'); });
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
