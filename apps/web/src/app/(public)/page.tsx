import type { Metadata } from 'next';
import Link from 'next/link';
import { ChallengeTrack } from 'api-contracts';
import { ApiStatus } from '@/components/api-status';
import { EventPhaseBanner } from '@/components/events/event-phase-banner';
import { PageContainer } from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { brandConfig } from '@/config/brand';
import styles from './public.module.css';

export const metadata: Metadata = {
  title: `${brandConfig.productName} — Hackathon Platform`,
};

const eventFacts = [
  { label: 'Dates', value: brandConfig.eventDates },
  { label: 'Location', value: brandConfig.eventLocation },
  { label: 'Team size', value: '3–5 participants' },
  { label: 'Structure', value: '2 parallel tracks · 2 juries · 2 podiums' },
] as const;

const workflowSteps = [
  {
    step: '01 · Pre-event',
    title: 'Team registration & QR badges',
    description:
      'Team leaders register teams of 3–5 members. Every participant receives a personal QR check-in badge by email.',
  },
  {
    step: '02 · Doors open',
    title: 'On-site QR check-in',
    description:
      'Staff scan participant QR badges at Campus EPI entrance. Checked-in teams become eligible when the event launches.',
  },
  {
    step: '03 · 20:00 launch',
    title: 'Mini-CTF unlock gate',
    description:
      'Administrators launch the event at 20:00. Solving a valid Mini-CTF flag server-side unlocks the team main challenge.',
  },
  {
    step: '04 · 08:00–11:00',
    title: 'Deliverables, pitches & podiums',
    description:
      'Teams submit before 08:00, pitch at 09:00 to challenge-scoped juries, and view final track podiums at 11:00.',
  },
] as const;

const trackSummaries = [
  {
    id: ChallengeTrack.TrackA,
    title: 'Challenge Track A',
    subtitle: 'Parallel Track 1 · Dedicated Jury A · Podium A',
    description:
      'Full challenge brief unlocks on the server only after the event launches and your checked-in team passes the Mini-CTF gate.',
  },
  {
    id: ChallengeTrack.TrackB,
    title: 'Challenge Track B',
    subtitle: 'Parallel Track 2 · Dedicated Jury B · Podium B',
    description:
      'Evaluated independently by Track B jury members using challenge-scoped permissions and server-validated score bounds.',
  },
] as const;

export default function HomePage() {
  return (
    <PageContainer>
      <div className={styles.stack}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <p className={styles.eyebrow}>
            {brandConfig.eventDates} · {brandConfig.eventLocation}
          </p>
          <h1 id="hero-heading" className={styles.heroTitle}>
            {brandConfig.tagline}
          </h1>
          <p className={styles.lead}>
            The {brandConfig.productName} platform connects participant registration, entrance QR
            check-in, the overnight Mini-CTF gate, team deliverable submissions, jury scoring, and
            results publication for {brandConfig.organizers.join(' and ')}.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/register" className={buttonClassName({ variant: 'primary', size: 'lg' })}>
              Register a team
            </Link>
            <Link
              href="/schedule"
              className={buttonClassName({ variant: 'secondary', size: 'lg' })}
            >
              View event schedule
            </Link>
            <Link href="/login" className={buttonClassName({ variant: 'outline', size: 'lg' })}>
              Sign in
            </Link>
          </div>
        </section>

        <div className={styles.statusCluster}>
          <EventPhaseBanner />
          <ApiStatus />
        </div>

        <section aria-labelledby="facts-heading" className={styles.section}>
          <h2 id="facts-heading" className="visually-hidden">
            Key event facts
          </h2>
          <dl className={styles.factsGrid}>
            {eventFacts.map((fact) => (
              <div key={fact.label} className={styles.factCard}>
                <dt className={styles.factLabel}>{fact.label}</dt>
                <dd className={styles.factValue}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="workflow-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="workflow-heading" className={styles.sectionTitle}>
              How the overnight flow works
            </h2>
            <p className={styles.sectionLead}>
              Server-authoritative phase transitions coordinate teams, entrance check-in staff,
              juries, and administrators across the competition night.
            </p>
          </div>

          <div className={styles.cardGrid}>
            {workflowSteps.map((item) => (
              <Card key={item.step} surface="raised">
                <CardHeader>
                  <div className={styles.badgeRow}>
                    <Badge tone="neutral">{item.step}</Badge>
                  </div>
                  <CardTitle as="h3">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{item.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="tracks-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="tracks-heading" className={styles.sectionTitle}>
              Two parallel challenge tracks
            </h2>
            <p className={styles.sectionLead}>
              Each track has its own challenge statement, isolated jury evaluation workspace, and
              dedicated podium.
            </p>
          </div>

          <div className={styles.twoColGrid}>
            {trackSummaries.map((track) => (
              <Card key={track.id}>
                <CardHeader>
                  <CardTitle as="h3">{track.title}</CardTitle>
                  <CardDescription>{track.subtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>{track.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className={styles.ctaRow}>
            <Link
              href="/challenges"
              className={buttonClassName({ variant: 'outline', size: 'md' })}
            >
              Read track rules &amp; unlock flow
            </Link>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
