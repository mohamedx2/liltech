import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Seeds the Mini-CTF gate stages (idempotent upserts).
 *
 * Only the SHA-256 hash of an answer belongs here — never the answer itself,
 * and never the ZIP password. Organizers can rotate the stage-one answer hash
 * without touching code by setting `CTF_STAGE_1_ANSWER_HASH` (64 hex chars)
 * in the environment before seeding.
 *
 * Run with: pnpm nx run api:db-seed-ctf
 */

const prisma = new PrismaClient();

const FALLBACK_STAGE_ONE_ANSWER_HASH =
  '050970fd8390326074eeb2224508c40333e372b54089d0618d77e9211a0b46a6';

const stageOneAnswerHash = process.env.CTF_STAGE_1_ANSWER_HASH ?? FALLBACK_STAGE_ONE_ANSWER_HASH;

if (!/^[0-9a-f]{64}$/.test(stageOneAnswerHash)) {
  throw new Error('CTF_STAGE_1_ANSWER_HASH must be a 64-character lowercase hex SHA-256 hash.');
}

const stageOne = {
  slug: 'louage-404',
  position: 1,
  title: 'Louage 404',
  // No published brief: the stage ships the archive and the photograph only.
  description: null,
  status: 'live' as const,
  answerHash: stageOneAnswerHash,
  assetImageUrl: '/ctf/step-1/louage.jpg',
  assetZipUrl: '/ctf/step-1/CTF.zip',
};

/** Organizer-approved hints, revealed one at a time from the player UI. */
const stageOneHints = [
  {
    position: 1,
    body: 'Password pattern: Manufacturer + Generation + TransportType, written without spaces. Capitalize the manufacturer and the transport type; the generation keeps its uppercase letter.',
  },
  {
    position: 2,
    body: 'Rakkaz 3la marque w génération mte3 el karhba. The model generation is T4 — follow the stated password pattern.',
  },
  {
    position: 3,
    body: 'Combine Volkswagen + T4 + Louage. Then submit the registration written inside the archive.',
  },
];

async function main(): Promise<void> {
  const stage = await prisma.ctfStage.upsert({
    where: { slug: stageOne.slug },
    update: {
      title: stageOne.title,
      description: stageOne.description,
      status: stageOne.status,
      answerHash: stageOne.answerHash,
      assetImageUrl: stageOne.assetImageUrl,
      assetZipUrl: stageOne.assetZipUrl,
    },
    create: stageOne,
  });

  for (const hint of stageOneHints) {
    await prisma.ctfHint.upsert({
      where: { stageId_position: { stageId: stage.id, position: hint.position } },
      update: { body: hint.body },
      create: { stageId: stage.id, position: hint.position, body: hint.body },
    });
  }

  console.log(`Seeded Mini-CTF stage ${stage.slug} with ${stageOneHints.length} hints.`);
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
