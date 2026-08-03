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
// for a dual-stack hostname — that connects nowhere and hangs until
// ENETUNREACH. Forces every dns.lookup() in the process to try A/IPv4
// records first, as a general safety net for any outbound call (email now
// goes over Brevo's HTTPS API instead of SMTP, but Twilio/R2/Daraja calls
// could hit the same dual-stack issue).
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
