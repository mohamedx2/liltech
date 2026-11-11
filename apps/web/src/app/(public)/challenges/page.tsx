import type { Metadata } from 'next';
import Link from 'next/link';
import { ChallengeTrack } from 'api-contracts';
import { Alert } from '@/components/feedback/alert';
import { PageContainer } from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import styles from '../public.module.css';

export const metadata: Metadata = {
  title: 'Challenge Tracks & Gate Rules',
};

const tracks = [
  {
    id: ChallengeTrack.TrackA,
    name: 'Track A',
    juryLabel: 'Isolated Jury A',
    podiumLabel: 'Track A Podium',
    summary:
      'One of two parallel hackathon challenges hosted during LilTech 2026. Briefs, starter materials, and evaluation rubrics stay sealed on the server until launch and Mini-CTF unlock.',
  },
  {
    id: ChallengeTrack.TrackB,
    name: 'Track B',
    juryLabel: 'Isolated Jury B',
    podiumLabel: 'Track B Podium',
    summary:
      'Second parallel challenge track evaluated by an independent jury. Track-scoped API authorization prevents cross-track jury access.',
  },
] as const;

export default function ChallengesPage() {
  return (
    <PageContainer>
      <div className={styles.stack}>
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>Two challenges · Two juries · Two podiums</p>
          <h1 className={styles.pageTitle}>Challenge tracks &amp; Mini-CTF unlock gate</h1>
          <p className={styles.sectionLead}>
            LilTech runs two parallel challenge tracks during the night. Challenge details never
            ship in public frontend bundles — the backend releases a track brief only after a team
            is checked in and solves the Mini-CTF.
          </p>
        </header>

        <section aria-labelledby="tracks-list-heading" className={styles.section}>
          <h2 id="tracks-list-heading" className={styles.sectionTitle}>
            Competition tracks
          </h2>
          <div className={styles.twoColGrid}>
            {tracks.map((track) => (
              <Card key={track.id} surface="raised">
                <CardHeader>
                  <div className={styles.badgeRow}>
                    <Badge tone="neutral">{track.juryLabel}</Badge>
                    <Badge tone="info">{track.podiumLabel}</Badge>
                  </div>
                  <CardTitle as="h3">{track.name}</CardTitle>
                  <CardDescription>
                    Canonical track key: <code className={styles.codeTag}>{track.id}</code>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p>{track.summary}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="gate-heading" className={styles.section}>
          <h2 id="gate-heading" className={styles.sectionTitle}>
            How unlocking &amp; security work
          </h2>
          <ul className={styles.bulletList}>
            <li>
              <strong>Check-in required:</strong> Participants must have their personal QR badge
              scanned at Campus EPI entrance before accessing competition challenges.
            </li>
            <li>
              <strong>Server-side Mini-CTF validation:</strong> At 20:00 the Mini-CTF gate opens.
              Flags are validated exclusively on the backend with rate-limited, timestamped attempt
              logging.
            </li>
            <li>
              <strong>Hard 08:00 deliverable cutoff:</strong> Team submission timestamps and upload
              permissions are enforced server-side according to the authoritative event clock.
            </li>
            <li>
              <strong>Isolated jury scoring:</strong> Each jury member signs in to review and score
              only submissions assigned to their own track.
            </li>
          </ul>
        </section>

        <Alert tone="info" title="Open organizer specifications">
          Several competition rules remain marked pending in the project specification (
          <code>docs/decisions/OPEN_QUESTIONS.md</code>): how teams are assigned to Track A vs Track
          B, whether the Mini-CTF is shared or per-track, live leaderboard visibility, and jury
          score aggregation / tie-break formulas. No client-side rule assumptions are hardcoded
          here.
        </Alert>

        <div className={styles.ctaRow}>
          <Link href="/register" className={buttonClassName({ variant: 'primary', size: 'md' })}>
            Register a team
          </Link>
          <Link href="/login" className={buttonClassName({ variant: 'outline', size: 'md' })}>
            Team / Jury sign in
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
