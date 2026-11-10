import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Seed script — safe to run repeatedly (idempotent upserts).
 *
 * It only seeds platform metadata that is not a business decision.
 * Do NOT put CTF flags, challenge answers, or credentials in this file.
 *
 * Run with: pnpm nx run api:db-seed
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
