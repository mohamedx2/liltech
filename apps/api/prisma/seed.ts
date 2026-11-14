import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ensureSeedAdmin, readSeedAdminConfig } from '../src/seed/seed-admin';

/**
 * Seed script — safe to run repeatedly (idempotent upserts).
 *
 * It only seeds platform metadata that is not a business decision, plus an
 * optional administrator account configured through the environment:
 *
 *   SEED_ADMIN_EMAIL      — login email of the administrator (optional)
 *   SEED_ADMIN_PASSWORD   — password (>= 12 characters, required with the email)
 *   SEED_ADMIN_NAME       — display name (optional, defaults to 'LilTech Admin')
 *
 * Do NOT put CTF flags, challenge answers, or hardcoded credentials in this
 * file. Run with: pnpm nx run api:db-seed
 */

const prisma = new PrismaClient();

const settings = [
  { key: 'event.name', value: 'LilTech 2026' },
  { key: 'event.location', value: 'Campus EPI, Sousse, Tunisia' },
  { key: 'event.startDate', value: '2026-11-21' },
  { key: 'event.endDate', value: '2026-11-22' },
] as const;

async function main(): Promise<void> {
  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }

  const adminConfig = readSeedAdminConfig(process.env);
  if (!adminConfig) {
    console.log(
      'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping administrator provisioning.',
    );
    return;
  }

  const result = await ensureSeedAdmin(prisma, adminConfig);
  switch (result.status) {
    case 'created':
      console.log(`Seeded administrator account: ${result.email}`);
      break;
    case 'password_updated':
      console.log(`Administrator password updated for: ${result.email}`);
      break;
    case 'unchanged':
      console.log(`Administrator account already up to date: ${result.email}`);
      break;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
