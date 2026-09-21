// One-off: creates the first ADMIN user together with a super-admin
// AdminProfile (isSuperAdmin: true bypasses permission checks entirely, so
// no `permissions` need to be listed). Run with:
//   npx tsx scripts/create-admin.ts <email> <password> <name>
// Delete this file once you no longer need it.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../src/db/index.js';

async function main() {
  const [email, password, name] = process.argv.slice(2);
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
    data: {
      email,
      name,
      passwordHash,
      role: Role.ADMIN,
      emailVerifiedAt: new Date(),
      adminProfile: { create: { isSuperAdmin: true } },
    },
  });

  console.log(`Created super admin ${user.email} (id: ${user.id})`);
}

main().finally(() => prisma.$disconnect());
