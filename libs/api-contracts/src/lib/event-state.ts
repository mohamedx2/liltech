import { z } from 'zod';

/**
 * Event lifecycle phases, from the LilTech specification.
 * The backend is the single source of truth for the current phase.
 */
export const EventPhase = {
  Registration: 'registration',
  Checkin: 'checkin',
  Live: 'live',
  SubmissionsClosed: 'submissions_closed',
  Pitching: 'pitching',
  Results: 'results',
} as const;

export type EventPhase = (typeof EventPhase)[keyof typeof EventPhase];

export const eventPhaseSchema = z.enum([
  EventPhase.Registration,
  EventPhase.Checkin,
  EventPhase.Live,
  EventPhase.SubmissionsClosed,
  EventPhase.Pitching,
  EventPhase.Results,
]);

/** Team progress through the event, from the LilTech specification. */
export const TeamProgressState = {
  Registered: 'registered',
  CheckedIn: 'checked_in',
  CtfUnlocked: 'ctf_unlocked',
  CtfSolved: 'ctf_solved',
  ChallengeUnlocked: 'challenge_unlocked',
  Submitted: 'submitted',
} as const;

export type TeamProgressState = (typeof TeamProgressState)[keyof typeof TeamProgressState];

export const teamProgressStateSchema = z.enum([
  TeamProgressState.Registered,
  TeamProgressState.CheckedIn,
  TeamProgressState.CtfUnlocked,
  TeamProgressState.CtfSolved,
  TeamProgressState.ChallengeUnlocked,
  TeamProgressState.Submitted,
]);

/** The two parallel challenge tracks (one per jury and per podium). */
export const ChallengeTrack = {
  TrackA: 'track_a',
  TrackB: 'track_b',
} as const;

export type ChallengeTrack = (typeof ChallengeTrack)[keyof typeof ChallengeTrack];

export const challengeTrackSchema = z.enum([ChallengeTrack.TrackA, ChallengeTrack.TrackB]);
