import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiStatus } from '@/components/api-status';
import { EventPhaseBanner } from '@/components/events/event-phase-banner';
import { HomeMotion } from '@/components/home/home-motion';
import { LockIcon } from '@/components/icons/lock-icon';
import { PageContainer } from '@/components/layout/page-container';
import { buttonClassName } from '@/components/ui/button';
import { brandConfig } from '@/config/brand';
import styles from './public.module.css';

export const metadata: Metadata = {
  title: `${brandConfig.productName} — Hackathon Platform`,
};

const nightStops = [
  {
    time: 'Arrival',
    title: 'Check-in',
    description: 'Staff scan your QR badge. Green means you’re in.',
  },
  {
    time: '20:00',
    title: 'Launch',
    description: 'Organizers start the night. Teams solve the Mini-CTF.',
  },
  {
    time: '08:00',
    title: 'Submissions close',
    description: 'Late deliveries are flagged for the juries.',
  },
  {
    time: '09:00',
    title: 'Pitches',
    description: 'Each jury scores its teams live on the platform.',
  },
  {
    time: '11:00',
    title: 'Awards',
    description: 'Scoring closes and both podiums are published.',
  },
] as const;

const teamPath = [
  { title: 'Register.', text: 'The team leader signs up 3 to 5 members in one form.' },
  { title: 'Get your badge.', text: 'Every member receives a personal QR code by email.' },
  { title: 'Check in.', text: 'Staff scan the code at the entrance.' },
  {
    title: 'Launch at 20:00.',
    text: 'The Mini-CTF opens for teams with a checked-in member.',
  },
  {
    title: 'Solve the Mini-CTF.',
    text: 'Submit a flag formatted like LILTECH{…}. A correct flag unlocks your challenge.',
  },
  {
    title: 'Start the challenge.',
    text: 'Read the brief, rules, resources and criteria.',
  },
  {
    title: 'Submit until 08:00.',
    text: 'Send links or files and update them freely. Each one is timestamped.',
  },
  {
    title: 'Pitch at 09:00.',
    text: 'Present to your jury and watch the scores land live.',
  },
] as const;

const roles = [
  {
    title: 'Participants',
    description:
      'Team dashboard, offline QR badge, Mini-CTF, challenge brief, submissions and live announcements.',
  },
  {
    title: 'Juries',
    description:
      'Challenge criteria, team deliverables, pitch order, and real-time scoring for one challenge only.',
  },
  {
    title: 'Organizers',
    description:
      'QR check-in, team management, launch control, live submissions, jury accounts and results.',
  },
] as const;

/** Dot positions sampled from the swoosh path, as percentages of its box. */
const curveDots = [
  { left: '0%', top: '78%' },
  { left: '19.8%', top: '81.8%' },
  { left: '41.8%', top: '59%' },
  { left: '75.1%', top: '35.8%' },
  { left: '100%', top: '34%' },
] as const;

export default function HomePage() {
  const { logos } = brandConfig;

  return (
    <PageContainer>
      <div className={styles.stack} data-home-root>
        <HomeMotion />
        <header className={styles.hero} id="top" data-motion="hero">
          <div className={styles.heroCopy} data-motion="hero-copy">
            <p className={styles.phase}>
              <span className={styles.phaseDot} aria-hidden="true" />
              Registration is open
            </p>
            <h1 className={styles.heroTitle} data-motion="hero-title">
              <span>One night.</span> <span className={styles.heroTitleGold}>Two challenges.</span>{' '}
              <span className={styles.heroTitleMuted}>One platform to run it all.</span>
            </h1>
            <p className={styles.lede} data-motion="hero-lede">
              A night-long tech competition at <b>Campus EPI, Sousse</b>, November 21–22. Register
              your team, check in with a QR badge, solve the Mini-CTF, and submit before 08:00.
            </p>
            <div className={styles.ctaRow} data-motion="hero-cta">
              <Link
                href="/register"
                className={buttonClassName({ variant: 'primary', size: 'md' })}
              >
                Register a team
              </Link>
              <Link href="/schedule" className={buttonClassName({ variant: 'ghost', size: 'md' })}>
                View event schedule
              </Link>
            </div>
          </div>

          <figure className={styles.heroLogo} data-motion="hero-logo">
            {logos.default ? (
              <img
                src={logos.default}
                alt={logos.alt}
                width={logos.width}
                height={logos.height}
                className={styles.heroLogoImg}
              />
            ) : null}
          </figure>
        </header>

        <div data-motion="clock">
          <EventPhaseBanner />
        </div>

        <div className={styles.apiLine}>
          <ApiStatus />
        </div>

        <section id="night" className={styles.band}>
          <h2 className={styles.sectionTitle}>The night runs on one clock</h2>
          <p className={styles.sub}>
            Every unlock and every deadline follows the server clock, so no team gets a head start.
          </p>

          <div className={styles.curve} aria-hidden="true" data-motion="night-curve">
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="night-swoosh" x1="0" x2="1">
                  <stop offset="0" stopColor="#7A0C0C" />
                  <stop offset=".45" stopColor="#FF2A1F" />
                  <stop offset="1" stopColor="#EBC27A" />
                </linearGradient>
              </defs>
              <path
                d="M0,78 C260,112 520,8 1000,34"
                fill="none"
                stroke="url(#night-swoosh)"
                strokeWidth="4"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {curveDots.map((dot, index) => (
              <span
                key={dot.left}
                className={
                  index === 1 ? `${styles.curveDot} ${styles.curveDotHot}` : styles.curveDot
                }
                style={{ left: dot.left, top: dot.top }}
              />
            ))}
          </div>

          <ul className={styles.stops}>
            {nightStops.map((stop) => (
              <li key={stop.time} data-motion="night-stop">
                <b className={styles.stopTime}>{stop.time}</b>
                <h3 className={styles.stopTitle}>{stop.title}</h3>
                <p className={styles.stopText}>{stop.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="challenges" className={styles.band}>
          <h2 className={styles.sectionTitle}>Two challenges, two juries, two podiums</h2>
          <p className={styles.sub}>The two run in parallel. A jury sees only its own challenge.</p>

          <div className={styles.duo} data-motion-group="challenges">
            <article
              className={`${styles.challenge} ${styles.challengeFeatured}`}
              data-motion="challenge"
            >
              <div>
                <p className={styles.challengeLabel}>Challenge Track A</p>
                <h3 className={styles.challengeTitle}>Challenge 01</h3>
                <p className={styles.challengeText}>
                  Presented by a partner to be announced. Brief, rules, resources and criteria
                  appear once your team opens it.
                </p>
              </div>
              <p className={styles.lock}>
                <LockIcon size={20} />
                Locked until your team solves the Mini-CTF
              </p>
            </article>

            <article
              className={`${styles.challenge} ${styles.challengeAsymmetric}`}
              data-motion="challenge"
            >
              <div>
                <p className={styles.challengeLabel}>Challenge Track B</p>
                <h3 className={styles.challengeTitle}>Challenge 02</h3>
                <p className={styles.challengeText}>
                  Its own brief, its own jury, its own podium. Same night, same clock.
                </p>
              </div>
              <p className={styles.lock}>
                <LockIcon size={20} />
                Locked until your team solves the Mini-CTF
              </p>
            </article>
          </div>
        </section>

        <section id="path" className={styles.path}>
          <div>
            <h2 className={styles.sectionTitle}>Your team’s path through the night</h2>
            <p className={styles.sub}>Eight steps, from sign-up to the live pitch.</p>
          </div>
          <ol className={styles.pathList} data-motion="path-line">
            {teamPath.map((step) => (
              <li key={step.title} data-motion="path-step">
                <b>{step.title}</b> <span>{step.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.band}>
          <h2 className={styles.sectionTitle}>One platform for everyone in the room</h2>
          <p className={styles.sub}>Each role signs in once and lands on its own screens.</p>

          <div className={styles.roles}>
            {roles.map((role) => (
              <div key={role.title} className={styles.role} data-motion="role">
                <h3 className={styles.roleTitle}>{role.title}</h3>
                <p className={styles.roleText}>{role.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.final} id="login" data-motion="final">
          <h2 className={styles.sectionTitle}>Teams of 3 to 5. One form to enter.</h2>
          <p className={styles.sub}>
            Registration takes a few minutes. Your badges arrive by email.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/register" className={buttonClassName({ variant: 'primary', size: 'md' })}>
              Register your team
            </Link>
            <Link href="/login" className={buttonClassName({ variant: 'ghost', size: 'md' })}>
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
