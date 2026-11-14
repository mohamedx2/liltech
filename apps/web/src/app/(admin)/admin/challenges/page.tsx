import type { Metadata } from 'next';
import { EmptyState } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Challenges · LilTech 2026 Admin',
  description: 'Challenge track overview and pending administrative decisions.',
};

/**
 * Read-only track overview. Challenge administration (track assignment,
 * unlocking, content management) is intentionally NOT implemented — it is
 * blocked on `docs/decisions/OPEN_QUESTIONS.md` questions 1–2 and must not be
 * invented. This page states exactly that instead of showing fake controls.
 */
export default function AdminChallengesPage() {
  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="challenges-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Challenge Tracks</span>
          <Badge tone="warning">Pending maintainer decision</Badge>
        </div>
        <h1 id="challenges-title" className={styles.title}>
          Challenges
        </h1>
        <p className={styles.description}>
          The event runs two parallel challenge tracks — one per jury and per podium. Administrative
          challenge management (track assignment, challenge content, unlocking) is not implemented
          yet: it is blocked on open decisions and must not be invented.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="tracks-heading">
        <h2 id="tracks-heading" className={styles.sectionTitle}>
          Event structure
        </h2>
        <ul className={styles.trackList}>
          <li className={styles.trackItem}>
            <div>
              <h3 className={styles.trackName}>Track A</h3>
              <p className={styles.trackDetail}>
                First parallel challenge with its own jury and podium.
              </p>
            </div>
            <Badge tone="neutral">Unassigned</Badge>
          </li>
          <li className={styles.trackItem}>
            <div>
              <h3 className={styles.trackName}>Track B</h3>
              <p className={styles.trackDetail}>
                Second parallel challenge with its own jury and podium.
              </p>
            </div>
            <Badge tone="neutral">Unassigned</Badge>
          </li>
        </ul>
      </section>

      <EmptyState
        title="Challenge administration pending"
        message="Track assignment (open question 1) and the Mini-CTF track structure (open question 2) must be confirmed before challenge management is built. See docs/decisions/OPEN_QUESTIONS.md."
      />
    </div>
  );
}
