import type { Metadata } from 'next';
import { EmptyState } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Results · LilTech 2026 Admin',
  description: 'Results and podium publication status.',
};

/**
 * Results administration placeholder. Scoring aggregation, leaderboard
 * visibility, tie-break rules, and podium publication are blocked on
 * `docs/decisions/OPEN_QUESTIONS.md` questions 3–5 and must not be invented.
 */
export default function AdminResultsPage() {
  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="results-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Results & Podiums</span>
          <Badge tone="warning">Pending maintainer decision</Badge>
        </div>
        <h1 id="results-title" className={styles.title}>
          Results
        </h1>
        <p className={styles.description}>
          Two podiums will be published at 11:00 — one per challenge track. Score aggregation and
          publication controls are not implemented yet: they depend on scoring decisions that are
          still open and must not be invented.
        </p>
      </section>

      <EmptyState
        title="Results administration pending"
        message="Leaderboard tie-break rules (open question 3), live visibility (question 4), and jury score aggregation (question 5) must be confirmed before results can be computed or published. See docs/decisions/OPEN_QUESTIONS.md."
      />
    </div>
  );
}
