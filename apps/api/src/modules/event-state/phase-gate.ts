import type { EventPhase } from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { CTF_WINDOW_MS, ctfClosesAt } from '../ctf/ctf-scoring';
import { getEventState, type EventState } from './event-state.service';

/**
 * The single phase/time gate for every participant-facing module.
 *
 * The Mini-CTF, the challenges and the submissions modules all ask this helper
 * whether an action is allowed right now, so the rules cannot drift apart.
 * Everything here is derived from server state and server time only.
 *
 * Rules:
 * - the Mini-CTF is open only while the event is `live`, only after the launch
 *   instant was recorded, and only for `CTF_WINDOW_MINUTES`;
 * - challenges and submissions exist only while the event is `live`;
 * - once the event reaches `submissions_closed` (or later), nothing is accepted;
 * - the Challenge 01 fallback unlocks exactly at `ctfStartedAt + 60 min`.
 */

/** Phases in which no challenge work happens at all. */
const PRE_EVENT_PHASES: readonly EventPhase[] = ['registration', 'checkin'];

/** Phases after the submission window closed. */
const POST_SUBMISSION_PHASES: readonly EventPhase[] = ['submissions_closed', 'pitching', 'results'];

export interface ParticipantPhaseGate {
  phase: EventPhase;
  /** Server clock used for every decision and countdown. */
  serverTime: Date;
  ctfStartedAt: Date | null;
  ctfClosesAt: Date | null;
  /** True while the Mini-CTF accepts flags and hints. */
  ctfOpen: boolean;
  /** True once the CTF ran and is no longer open. */
  ctfClosed: boolean;
  /** True before the launch instant was recorded. */
  ctfNotLaunched: boolean;
  /** True at or after `ctfStartedAt + 60 min` (the Challenge 01 fallback). */
  ctfFallbackUnlocked: boolean;
  /** True while challenges and submissions are allowed. */
  submissionsOpen: boolean;
  /** True while the event is live (challenge content and submissions). */
  eventLive: boolean;
}

/** Pure gate derivation, exported for unit tests. */
export function phaseGateFor(
  phase: EventPhase,
  ctfStartedAt: Date | null,
  now: Date,
): ParticipantPhaseGate {
  const closesAt = ctfStartedAt ? ctfClosesAt(ctfStartedAt) : null;
  const elapsed = ctfStartedAt ? now.getTime() - ctfStartedAt.getTime() : null;
  const withinWindow = elapsed !== null && elapsed < CTF_WINDOW_MS;
  const eventLive = phase === 'live';
  const ctfOpen = eventLive && ctfStartedAt !== null && withinWindow;

  return {
    phase,
    serverTime: now,
    ctfStartedAt,
    ctfClosesAt: closesAt,
    ctfOpen,
    ctfClosed: ctfStartedAt !== null && !ctfOpen,
    ctfNotLaunched: ctfStartedAt === null,
    ctfFallbackUnlocked: ctfStartedAt !== null && elapsed !== null && elapsed >= CTF_WINDOW_MS,
    submissionsOpen: eventLive,
    eventLive,
  };
}

/** Reads the phase state and derives the participant gate. */
export async function loadPhaseGate(now: Date = new Date()): Promise<ParticipantPhaseGate> {
  const state: EventState = await getEventState();
  return phaseGateFor(state.phase, state.ctfStartedAt, now);
}

/** Throws the specific error for a closed/not-launched Mini-CTF. */
export function assertCtfOpen(gate: ParticipantPhaseGate): void {
  if (gate.ctfOpen) {
    return;
  }

  if (gate.ctfNotLaunched) {
    throw ApiError.ctfNotOpen();
  }

  throw ApiError.ctfClosed();
}

/** Throws `SUBMISSIONS_CLOSED` outside the `live` phase. */
export function assertSubmissionsOpen(gate: ParticipantPhaseGate): void {
  if (gate.submissionsOpen) {
    return;
  }

  throw ApiError.submissionsClosed(
    PRE_EVENT_PHASES.includes(gate.phase)
      ? 'Submissions open when the event goes live.'
      : POST_SUBMISSION_PHASES.includes(gate.phase)
        ? 'Submissions are closed for this event.'
        : 'Submissions are not open right now.',
  );
}

/** True for phases before the event starts. */
export function isPreEventPhase(phase: EventPhase): boolean {
  return PRE_EVENT_PHASES.includes(phase);
}
