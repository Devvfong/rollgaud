import { hashPassword } from '../apps/api/dist/src/auth/auth.service.js';
import { db } from '../packages/db/dist/src/index.js';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be provided at runtime.');
}

if (!email.includes('@') || password.length < 16) {
  throw new Error('ADMIN_EMAIL or ADMIN_PASSWORD does not meet the seed policy.');
}

await db.user.upsert({
  where: { email: email.toLowerCase() },
  create: { email: email.toLowerCase(), passwordHash: await hashPassword(password) },
  update: { passwordHash: await hashPassword(password), disabledAt: null },
});

await db.$disconnect();
