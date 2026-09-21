import 'dotenv/config';
import dns from 'dns';
import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/index.js';
import { startOfferTimeouts } from './jobs/offer-timeouts.js';
import { initSocket } from './realtime/socket.js';
import { startLocationStoreSweep } from './realtime/plumber-location-store.js';



dns.setDefaultResultOrder('ipv4first');

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
});

startOfferTimeouts();
startLocationStoreSweep();


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
