import React from 'react';
import { TeamProgressState } from 'api-contracts';
import styles from './stepper.module.css';

export interface ProgressStep {
  key: TeamProgressState;
  label: string;
  description: string;
}

export const PROGRESS_STEPS: ProgressStep[] = [
  {
    key: TeamProgressState.Registered,
    label: 'Registered',
    description: 'Team created & badge issued',
  },
  {
    key: TeamProgressState.CheckedIn,
    label: 'Checked In',
    description: 'Entrance badges verified',
  },
  {
    key: TeamProgressState.CtfUnlocked,
    label: 'Mini-CTF Open',
    description: 'Event live at 20:00',
  },
  { key: TeamProgressState.CtfSolved, label: 'Flag Solved', description: 'Mini-CTF passed' },
  {
    key: TeamProgressState.ChallengeUnlocked,
    label: 'Challenge Active',
    description: 'Track brief unlocked',
  },
  { key: TeamProgressState.Submitted, label: 'Submitted', description: 'Deliverables recorded' },
];

const STEP_ORDER: TeamProgressState[] = [
  TeamProgressState.Registered,
  TeamProgressState.CheckedIn,
  TeamProgressState.CtfUnlocked,
  TeamProgressState.CtfSolved,
  TeamProgressState.ChallengeUnlocked,
  TeamProgressState.Submitted,
];

export interface StepperProps {
  currentProgress: TeamProgressState;
  /**
   * Server-owned Mini-CTF result. When `false`, the `Flag Solved` step stays
   * unearned even for later progress states: a team reaches `submitted` by
   * delivering Challenge 01 through the 60-minute fallback too.
   */
  ctfSolved?: boolean;
  className?: string;
}

export function Stepper({ currentProgress, ctfSolved, className = '' }: StepperProps) {
  const currentIndex = STEP_ORDER.indexOf(currentProgress);

  return (
    <div className={[styles.stepperContainer, className].filter(Boolean).join(' ')}>
      <ol className={styles.stepperList} aria-label="Team Competition Progress">
        {PROGRESS_STEPS.map((step, idx) => {
          const skipped = ctfSolved === false && step.key === TeamProgressState.CtfSolved;
          const isCompleted = idx < currentIndex && !skipped;
          const isCurrent = idx === currentIndex;
          const isUpcoming = idx > currentIndex || skipped;

          return (
            <li
              key={step.key}
              className={[
                styles.stepItem,
                isCompleted && styles.completed,
                isCurrent && styles.current,
                isUpcoming && styles.upcoming,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div className={styles.indicatorWrapper}>
                <span className={styles.indicator} aria-hidden="true">
                  {isCompleted ? '✓' : idx + 1}
                </span>
                {idx < PROGRESS_STEPS.length - 1 && (
                  <span className={styles.connector} aria-hidden="true" />
                )}
              </div>
              <div className={styles.content}>
                <span className={styles.label}>{step.label}</span>
                <span className={styles.description}>{step.description}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
