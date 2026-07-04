import pkg from '@prisma/client';
import bcrypt from 'bcryptjs';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  try {
    const adminUsername = process.env.SEED_ADMIN_USERNAME || 'sanc';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@sanc.com';
    const adminName = process.env.SEED_ADMIN_NAME || 'Admin User';

    if (!adminPassword) {
      throw new Error('SEED_ADMIN_PASSWORD is required when RUN_DB_SEED=true.');
    }

    // Create or update the default application user.
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const sancUser = await prisma.user.findUnique({
      where: { username: adminUsername }
    });
    const legacyUser = sancUser
      ? null
      : await prisma.user.findFirst({
          where: {
            OR: [
              { username: 'admin' },
              { email: adminEmail }
            ]
          }
        });

    const defaultUserData = {
      username: adminUsername,
      password: hashedPassword,
      email: adminEmail,
      fullName: adminName,
      role: 'admin'
    };

    const user = sancUser
      ? await prisma.user.update({
          where: { id: sancUser.id },
          data: {
            password: hashedPassword,
            email: adminEmail,
            fullName: adminName,
            role: 'admin'
          }
        })
      : legacyUser
      ? await prisma.user.update({
          where: { id: legacyUser.id },
          data: defaultUserData
        })
      : await prisma.user.create({ data: defaultUserData });

    console.log('Default user ready:', user.username);

    console.log('\nDatabase seeded successfully!');
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exitCode = 1;
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
