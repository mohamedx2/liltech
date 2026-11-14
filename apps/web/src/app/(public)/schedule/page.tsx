import type { Metadata } from 'next';
import Link from 'next/link';
import { EventPhase, TeamProgressState } from 'api-contracts';
import { EventPhaseBanner } from '@/components/events/event-phase-banner';
import { PageContainer } from '@/components/layout/page-container';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { DataTable, type TableColumn } from '@/components/ui/table';
import { brandConfig } from '@/config/brand';
import styles from '../public.module.css';

export const metadata: Metadata = {
  title: 'Event Schedule & Phases',
};

interface TimelineEntry {
  readonly id: string;
  readonly timeWindow: string;
  readonly phase: EventPhase;
  readonly phaseTone: BadgeTone;
  readonly title: string;
  readonly description: string;
}

const timelineEntries: readonly TimelineEntry[] = [
  {
    id: 'registration',
    timeWindow: 'Pre-event · Nov 2026',
    phase: EventPhase.Registration,
    phaseTone: 'info',
    title: 'Team registration & badge issuance',
    description:
      'Team leaders submit 4–7 participant rosters. Every participant receives a unique personal QR badge by email.',
  },
  {
    id: 'checkin',
    timeWindow: 'Nov 21 · Doors open',
    phase: EventPhase.Checkin,
    phaseTone: 'warning',
    title: 'On-site QR check-in at Campus EPI',
    description:
      'Organizers scan personal QR codes at the entrance. Check-in confirms on-site attendance ahead of event launch.',
  },
  {
    id: 'launch-ctf',
    timeWindow: 'Nov 21 · 20:00',
    phase: EventPhase.Live,
    phaseTone: 'success',
    title: 'Official launch & Mini-CTF opens',
    description:
      'Administrators transition the event live. Checked-in teams submit Mini-CTF flags to unlock their main challenge.',
  },
  {
    id: 'submissions-close',
    timeWindow: 'Nov 22 · 08:00',
    phase: EventPhase.SubmissionsClosed,
    phaseTone: 'warning',
    title: 'Submission window closes',
    description:
      'File uploads and final deliverable links lock server-side at 08:00 so teams can prepare for morning pitches.',
  },
  {
    id: 'pitching',
    timeWindow: 'Nov 22 · 09:00',
    phase: EventPhase.Pitching,
    phaseTone: 'info',
    title: 'Team pitches & jury scoring',
    description:
      'Teams pitch to their assigned track jury. Each jury evaluates only its assigned challenge within server-enforced scoring rules.',
  },
  {
    id: 'results',
    timeWindow: 'Nov 22 · 11:00',
    phase: EventPhase.Results,
    phaseTone: 'success',
    title: 'Results & two track podiums published',
    description:
      'Final podiums and track rankings for Challenge Track A and Challenge Track B are published once verified by administrators.',
  },
];

interface ProgressStageRow {
  readonly state: TeamProgressState;
  readonly step: string;
  readonly trigger: string;
  readonly unlocks: string;
}

const teamProgressionRows: readonly ProgressStageRow[] = [
  {
    state: TeamProgressState.Registered,
    step: '1. Registered',
    trigger: 'Team leader completes team registration (4–7 members)',
    unlocks: 'Team account access & personal QR check-in badges',
  },
  {
    state: TeamProgressState.CheckedIn,
    step: '2. Checked in',
    trigger: 'Entrance staff verifies QR check-in at Campus EPI',
    unlocks: 'Eligibility for Mini-CTF once event phase becomes live',
  },
  {
    state: TeamProgressState.CtfUnlocked,
    step: '3. Mini-CTF unlocked',
    trigger: 'Administrators launch the event at 20:00',
    unlocks: 'Access to Mini-CTF prompt and server-verified flag submission',
  },
  {
    state: TeamProgressState.CtfSolved,
    step: '4. Mini-CTF solved',
    trigger: 'Server validates a correct Mini-CTF flag attempt',
    unlocks: 'Timestamped solve record and main challenge transition',
  },
  {
    state: TeamProgressState.ChallengeUnlocked,
    step: '5. Challenge unlocked',
    trigger: 'Main challenge assigned and opened on backend',
    unlocks: 'Full challenge brief, track resources, and submission portal',
  },
  {
    state: TeamProgressState.Submitted,
    step: '6. Submitted',
    trigger: 'Team uploads final deliverable before 08:00 deadline',
    unlocks: 'Deliverable queued for 09:00 jury evaluation',
  },
];

const progressionColumns: readonly TableColumn<ProgressStageRow>[] = [
  {
    key: 'step',
    header: 'Stage',
    render: (row) => <strong>{row.step}</strong>,
  },
  {
    key: 'state',
    header: 'Canonical state',
    render: (row) => <code className={styles.codeTag}>{row.state}</code>,
  },
  {
    key: 'trigger',
    header: 'Server trigger',
    render: (row) => row.trigger,
  },
  {
    key: 'unlocks',
    header: 'What it unlocks',
    render: (row) => row.unlocks,
  },
];

export default function SchedulePage() {
  return (
    <PageContainer>
      <div className={styles.stack}>
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>
            {brandConfig.eventDates} · {brandConfig.eventLocation}
          </p>
          <h1 className={styles.pageTitle}>Overnight schedule &amp; canonical phases</h1>
          <p className={styles.sectionLead}>
            All countdowns and phase transitions are controlled exclusively by the LilTech server
            clock so every team sees the exact same deadlines.
          </p>
        </header>

        <EventPhaseBanner />

        <section aria-labelledby="timeline-heading" className={styles.section}>
          <h2 id="timeline-heading" className={styles.sectionTitle}>
            Event timeline
          </h2>
          <ol className={styles.timelineList}>
            {timelineEntries.map((entry) => (
              <li key={entry.id} className={styles.timelineItem}>
                <div className={styles.timelineTime}>{entry.timeWindow}</div>
                <div className={styles.timelineBody}>
                  <div className={styles.badgeRow}>
                    <h3 className={styles.timelineHeading}>{entry.title}</h3>
                    <Badge tone={entry.phaseTone}>{entry.phase}</Badge>
                  </div>
                  <p className={styles.timelineDescription}>{entry.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="progression-heading" className={styles.section}>
          <h2 id="progression-heading" className={styles.sectionTitle}>
            Team progression lifecycle
          </h2>
          <p className={styles.sectionLead}>
            Each team moves through canonical progression states managed in{' '}
            <code className={styles.codeTag}>libs/api-contracts</code> and enforced server-side.
          </p>
          <DataTable
            caption="Canonical team progression states from registration to submission"
            columns={progressionColumns}
            rows={teamProgressionRows}
            getRowKey={(row) => row.state}
          />
        </section>

        <div className={styles.ctaRow}>
          <Link href="/register" className={buttonClassName({ variant: 'primary', size: 'md' })}>
            Register a team
          </Link>
          <Link href="/challenges" className={buttonClassName({ variant: 'outline', size: 'md' })}>
            Explore challenge tracks
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
