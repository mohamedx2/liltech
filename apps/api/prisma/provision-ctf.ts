import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashAnswer, getAnswerPepper, CTF_PEPPER_ENV } from '../src/modules/ctf/ctf-answer';
import { assertCtfDriveUrl } from '../src/modules/ctf/ctf-drive-url';
import { LOUAGE_404_STAGES } from './ctf/stages.content';

/**
 * Organizer provisioning for the LOUAGE 404 Mini-CTF.
 *
 * Reads authoritative answers and Google Drive folder URLs from a private,
 * untracked JSON file, hashes answers with the server-only pepper, and upserts
 * the stage/hint records. It is idempotent: re-running it never duplicates a
 * stage, a hint or a solve.
 *
 *   CTF_PROVISION_FILE=../../ctf-assests/ctf-answers.json \
 *     pnpm nx run api:db-provision-ctf
 *
 * File shape (never commit this file):
 * {
 *   "stages": {
 *     "louage-404-01": {
 *       "answer": "L404{...}",
 *       "assetDriveUrl": "https://drive.google.com/drive/folders/..."
 *     }
 *   }
 * }
 *
 * Plaintext answers are read, hashed, and then dropped: nothing logs them, and
 * nothing writes them to the database or to disk.
 */

interface ProvisionStageEntry {
  answer?: string;
  assetDriveUrl?: string | null;
  status?: 'draft' | 'live' | 'closed';
}

interface ProvisionFile {
  stages?: Record<string, ProvisionStageEntry>;
}

const DEFAULT_PROVISION_FILE = path.resolve(__dirname, 'ctf-answers.json');

const prisma = new PrismaClient();

/** Only https URLs on approved Google hosts may reach the participant UI. */
function assertDriveUrl(slug: string, raw: string): string {
  try {
    return assertCtfDriveUrl(slug, raw);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

function readAnswer(entry: ProvisionStageEntry | undefined): string | undefined {
  const answer = entry?.answer?.trim();
  return answer ? answer : undefined;
}

async function loadProvisionFile(): Promise<ProvisionFile> {
  const file = process.env.CTF_PROVISION_FILE
    ? path.resolve(process.cwd(), process.env.CTF_PROVISION_FILE)
    : DEFAULT_PROVISION_FILE;

  if (!existsSync(file)) {
    console.log(`No provisioning file at ${file}. Seeding content only (no answers).`);
    return {};
  }

  const parsed = JSON.parse(await readFile(file, 'utf8')) as ProvisionFile;

  if (parsed.stages && typeof parsed.stages !== 'object') {
    throw new Error('Provisioning file: "stages" must be an object keyed by stage slug.');
  }

  return parsed;
}

async function main(): Promise<void> {
  const provision = await loadProvisionFile();
  const provided = provision.stages ?? {};

  const unknown = Object.keys(provided).filter(
    (slug) => !LOUAGE_404_STAGES.some((stage) => stage.slug === slug),
  );

  if (unknown.length > 0) {
    throw new Error(`Provisioning file references unknown stages: ${unknown.join(', ')}`);
  }

  const answersToHash = LOUAGE_404_STAGES.map((stage) => ({
    slug: stage.slug,
    answer: readAnswer(provided[stage.slug]),
  })).filter((entry) => entry.answer !== undefined);

  // Fail before writing anything if answers exist but the pepper does not.
  const pepper = answersToHash.length > 0 ? getAnswerPepper() : null;

  const report: string[] = [];

  for (const stage of LOUAGE_404_STAGES) {
    const entry = provided[stage.slug];
    const answer = readAnswer(entry);
    const status = entry?.status ?? stage.status;
    const driveUrl =
      entry?.assetDriveUrl === undefined || entry?.assetDriveUrl === null
        ? undefined
        : assertDriveUrl(stage.slug, entry.assetDriveUrl);

    const answerHash = answer && pepper ? hashAnswer(answer, pepper) : undefined;

    if (status === 'live' && !answerHash) {
      throw new Error(
        `${stage.slug}: refusing to publish a live stage without an answer. ` +
          `Provide an answer in the provisioning file or keep the stage in draft.`,
      );
    }

    const data = {
      position: stage.position,
      title: stage.title,
      description: stage.description,
      status,
      requiredForUnlock: stage.requiredForUnlock,
      ...(driveUrl !== undefined ? { assetDriveUrl: driveUrl } : {}),
      ...(answerHash !== undefined ? { answerHash } : {}),
      // Assets are hosted externally now; clear the legacy in-app paths.
      assetImageUrl: null,
      assetZipUrl: null,
    };

    const saved = await prisma.ctfStage.upsert({
      where: { slug: stage.slug },
      update: data,
      create: { slug: stage.slug, ...data, answerHash: answerHash ?? null },
    });

    for (const [index, body] of stage.hints.entries()) {
      await prisma.ctfHint.upsert({
        where: { stageId_position: { stageId: saved.id, position: index + 1 } },
        update: { body },
        create: { stageId: saved.id, position: index + 1, body },
      });
    }

    await prisma.ctfHint.deleteMany({
      where: { stageId: saved.id, position: { gt: stage.hints.length } },
    });

    report.push(
      `${stage.slug} [${status}] answerConfigured=${answerHash ? 'yes' : 'no'} ` +
        `driveUrl=${driveUrl ? 'set' : 'missing'} hints=${stage.hints.length}`,
    );
  }

  console.log(`Provisioned ${LOUAGE_404_STAGES.length} LOUAGE 404 stages:`);
  for (const line of report) {
    console.log(`  ${line}`);
  }

  const missingAnswers = LOUAGE_404_STAGES.filter((stage) => stage.status === 'live').filter(
    (stage) => !answersToHash.some((entry) => entry.slug === stage.slug),
  );

  if (missingAnswers.length > 0) {
    console.log(
      `Stages without a supplied answer (provision them before launch): ` +
        missingAnswers.map((stage) => stage.slug).join(', '),
    );
  }

  console.log(
    `Pepper: ${pepper ? 'present' : `absent (${CTF_PEPPER_ENV} not needed, no answers supplied)`}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(`Provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
    await prisma.$disconnect();
    process.exit(1);
  });
