import 'dotenv/config';
import dns from 'dns';
import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/index.js';
import { startMatchingCron } from './jobs/matching.cron.js';
import { initSocket } from './realtime/socket.js';


// Some hosts (Railway's Docker containers among them) have no IPv6 egress,
// but Node's default DNS lookup order can still return/prefer an AAAA record
// for dual-stack hosts like smtp.gmail.com — that connects nowhere and hangs
// until ENETUNREACH. This forces every dns.lookup() in the process (not just
// nodemailer's) to try A/IPv4 records first, which is a more reliable fix
// than any single library's own `family` option — see utils/email.ts's
// transport config, which was insufficient by itself on Alpine/musl.
dns.setDefaultResultOrder('ipv4first');

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
