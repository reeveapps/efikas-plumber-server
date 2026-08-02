import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/index.js';
import { startMatchingCron } from './jobs/matching.cron.js';
import { initSocket } from './realtime/socket.js';


const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
});

startMatchingCron();


process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down...');
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});
