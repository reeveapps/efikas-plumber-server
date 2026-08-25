/* // One-off: creates the first ADMIN account. Run with:
//   npx tsx scripts/create-admin.ts <email> <password> <name>
// Delete this file once you no longer need it.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../src/db/index.js';

async function main() {
  const {email, password, name} = {
    email:"admin@plumbers.com",
    password:"11111111",
    name:"Plumbers Admin"
  };
  if (!email || !password || !name) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password> <name>');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`A user with email ${email} already exists (role: ${existing.role}).`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role: Role.ADMIN, emailVerifiedAt: new Date() },
  });

  console.log(`Created ADMIN user ${user.email} (id: ${user.id})`);
}

main().finally(() => prisma.$disconnect());
 */