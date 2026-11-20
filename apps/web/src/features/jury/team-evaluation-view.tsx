'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import {
  JURY_EVALUATION_CRITERIA,
  type JuryCriterionKey,
  type JuryTeamEvaluationResponse,
} from '@/lib/api/contracts/pending';
import { getTrackLabel } from '@/lib/format';
import { Alert } from '@/components/feedback/alert';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button, buttonClassName } from '@/components/ui/button';
import styles from './team-evaluation-view.module.css';

interface TeamEvaluationViewProps {
  teamId: string;
}

type CriteriaScoresState = Record<JuryCriterionKey, number>;

const DEFAULT_SCORES: CriteriaScoresState = {
  technical_execution: 18,
  innovation_originality: 18,
  ui_ux_design: 18,
  pitch_presentation: 18,
};

export function TeamEvaluationView({ teamId }: TeamEvaluationViewProps) {
  const [data, setData] = useState<JuryTeamEvaluationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [scores, setScores] = useState<CriteriaScoresState>(DEFAULT_SCORES);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await api.jury.getTeamEvaluation(teamId);
      setData(result);

      if (result.evaluation) {
        setScores({
          technical_execution: result.evaluation.criteriaScores.technical_execution ?? 18,
          innovation_originality: result.evaluation.criteriaScores.innovation_originality ?? 18,
          ui_ux_design: result.evaluation.criteriaScores.ui_ux_design ?? 18,
          pitch_presentation: result.evaluation.criteriaScores.pitch_presentation ?? 18,
        });
        setNotes(result.evaluation.notes ?? '');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load team evaluation data. Please retry.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalScore = useMemo(() => {
    return Object.values(scores).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [scores]);

  const ratingBand = useMemo((): { label: string; tone: BadgeTone } => {
    if (totalScore >= 90) return { label: 'Outstanding (90–100)', tone: 'success' };
    if (totalScore >= 75) return { label: 'Strong / Competitive (75–89)', tone: 'info' };
    if (totalScore >= 50) return { label: 'Adequate (50–74)', tone: 'warning' };
    return { label: 'Needs Improvement (<50)', tone: 'danger' };
  }, [totalScore]);

  const handleScoreChange = (key: JuryCriterionKey, rawValue: number) => {
    const clamped = Math.max(0, Math.min(25, Number.isNaN(rawValue) ? 0 : rawValue));
    setScores((prev) => ({ ...prev, [key]: clamped }));
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);

    try {
      const response = await api.jury.submitEvaluation(teamId, {
        criteriaScores: scores,
        notes,
      });
      setSaveSuccessMessage(
        `Evaluation recorded successfully! Total Score: ${response.totalScore} / 100`,
      );
      // Reload evaluation data to update local team state
      loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSaveErrorMessage(err.message);
      } else {
        setSaveErrorMessage('Failed to submit evaluation. Please retry.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading team submission and evaluation workspace..." />;
  }

  if (errorMessage || !data) {
    return (
      <ErrorState
        title="Could Not Load Evaluation Workspace"
        message={errorMessage ?? 'The requested team evaluation could not be found.'}
        onRetry={loadData}
      />
    );
  }

  const { team, submission, members, scoringOpen } = data;
  const submissionLinks = submission
    ? [
        { label: 'GitHub repository', href: submission.githubUrl },
        { label: 'Google Drive folder', href: submission.driveUrl },
        { label: 'Technical report', href: submission.reportUrl },
        { label: 'Presentation', href: submission.presentationUrl },
      ].filter((link): link is { label: string; href: string } => Boolean(link.href))
    : [];

  return (
    <div className={styles.container}>
      {/* Breadcrumb Back Link */}
      <nav aria-label="Breadcrumb">
        <Link href="/jury" className={styles.backLink}>
          ← Back to Assigned Teams
        </Link>
      </nav>

      {/* Team Header */}
      <section className={styles.headerCard} aria-labelledby="evaluation-team-heading">
        <div className={styles.headerTop}>
          <div className={styles.teamMeta}>
            <Badge tone="info" showDot>
              {getTrackLabel(team.track)}
            </Badge>
            {team.evaluationStatus === 'graded' ? (
              <Badge tone="success" showDot>
                Graded: {team.myScore ?? totalScore} / 100
              </Badge>
            ) : (
              <Badge tone="warning" showDot>
                Pending Score
              </Badge>
            )}
          </div>
          <span className={styles.metaItem}>Team ID: {team.id}</span>
        </div>

        <h1 id="evaluation-team-heading" className={styles.teamHeading}>
          {team.name}
        </h1>

        <div className={styles.teamMeta}>
          <span className={styles.metaItem}>
            <strong>Roster:</strong> {members.map((m) => m.fullName).join(', ')} ({members.length}{' '}
            members)
          </span>
        </div>
      </section>

      {/* Deliverables Review Card */}
      <section className={styles.deliverablesCard} aria-labelledby="deliverables-heading">
        <h2 id="deliverables-heading" className={styles.cardTitle}>
          <span>Project Deliverables & Repository</span>
          {team.submitted ? (
            <Badge tone="success">Submitted</Badge>
          ) : (
            <Badge tone="warning">Pending Upload</Badge>
          )}
        </h2>

        {submission ? (
          <div className={styles.deliverableDetails}>
            <span className={styles.deliverableTitle}>Latest submission (the one that counts)</span>
            <div className={styles.deliverablesActions}>
              {submissionLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.repoButton}
                  aria-label={`Open ${link.label} of ${team.name} in a new tab`}
                >
                  <span>{link.label} ↗</span>
                </a>
              ))}
              {submission.commitSha ? (
                <div className={styles.fileBadge}>
                  <span>Commit {submission.commitSha.slice(0, 7)}</span>
                </div>
              ) : null}
              <span className={styles.metaItem}>
                Version {submission.version} • Submitted on{' '}
                {new Date(submission.submittedAt).toLocaleString([], {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ) : (
          <Alert tone="warning" title="No deliverables submitted yet">
            This team has not uploaded deliverables before the deadline. You may proceed with
            evaluating their pitch and live demonstration.
          </Alert>
        )}
      </section>

      {!scoringOpen ? (
        <Alert tone="info" title="Scoring is not open">
          Scores can be saved from the moment submissions close until the end of the pitches. You
          can review the team now; the form unlocks automatically then.
        </Alert>
      ) : null}

      {/* Feedback Alerts */}
      {saveSuccessMessage ? (
        <Alert tone="success" title="Score Recorded">
          {saveSuccessMessage}
        </Alert>
      ) : null}

      {saveErrorMessage ? (
        <Alert tone="error" title="Submission Failed">
          {saveErrorMessage}
        </Alert>
      ) : null}

      {/* Scoring Form & Summary Layout */}
      <form onSubmit={handleSubmit} className={styles.scoringLayout}>
        {/* Left Column: Criteria Evaluation List & Notes */}
        <div className={styles.criteriaList}>
          {JURY_EVALUATION_CRITERIA.map((criterion) => {
            const currentScore = scores[criterion.key] ?? 0;
            const presets = [0, 10, 15, 20, 25];

            return (
              <div
                key={criterion.key}
                className={styles.criterionCard}
                role="group"
                aria-labelledby={`criterion-${criterion.key}-title`}
              >
                <div className={styles.criterionHeader}>
                  <div className={styles.criterionTitleGroup}>
                    <h3 id={`criterion-${criterion.key}-title`} className={styles.criterionTitle}>
                      {criterion.title}
                    </h3>
                    <p className={styles.criterionDescription}>{criterion.description}</p>
                  </div>
                  <Badge tone="neutral">Max {criterion.maxPoints} pts</Badge>
                </div>

                <div className={styles.scoreInputRow}>
                  <input
                    type="range"
                    min="0"
                    max={criterion.maxPoints}
                    step="1"
                    value={currentScore}
                    onChange={(e) => handleScoreChange(criterion.key, parseInt(e.target.value, 10))}
                    className={styles.slider}
                    aria-label={`Score for ${criterion.title}`}
                    aria-valuemin={0}
                    aria-valuemax={criterion.maxPoints}
                    aria-valuenow={currentScore}
                  />

                  <input
                    type="number"
                    min="0"
                    max={criterion.maxPoints}
                    value={currentScore}
                    onChange={(e) => handleScoreChange(criterion.key, parseInt(e.target.value, 10))}
                    className={styles.numberInput}
                    aria-label={`Score points for ${criterion.title}`}
                  />
                </div>

                {/* Fast Preset Buttons for Live Pitches */}
                <div className={styles.presetButtons} aria-label="Quick score presets">
                  {presets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleScoreChange(criterion.key, preset)}
                      className={styles.presetBtn}
                      data-active={currentScore === preset}
                      aria-label={`Set score to ${preset} for ${criterion.title}`}
                    >
                      {preset} pts
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Qualitative Notes / Deliberation Feedback */}
          <div className={styles.notesCard}>
            <label htmlFor="jury-notes" className={styles.cardTitle}>
              Private Jury Notes & Deliberation Feedback
            </label>
            <p className={styles.criterionDescription}>
              Confidential comments shared only with fellow jury members and organizers during final
              podium deliberations.
            </p>
            <textarea
              id="jury-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              placeholder="Record strengths, weaknesses, architectural considerations, or questions for deliberation..."
              className={styles.notesTextarea}
            />
            <span className={styles.charCount}>{notes.length} / 2000 characters</span>
          </div>
        </div>

        {/* Right Column: Sticky Summary & Action Card */}
        <aside className={styles.summarySidebar} aria-label="Score calculation summary">
          <div className={styles.summaryHeader}>
            <span className={styles.summaryTitle}>Total Evaluation Score</span>
            <div className={styles.totalScoreDisplay}>
              <span className={styles.scoreNumber}>{totalScore}</span>
              <span className={styles.scoreOutOf}>/ 100</span>
            </div>
            <div className={styles.ratingBand}>
              <Badge tone={ratingBand.tone} showDot>
                {ratingBand.label}
              </Badge>
            </div>
          </div>

          <div className={styles.breakdownList}>
            {JURY_EVALUATION_CRITERIA.map((criterion) => (
              <div key={criterion.key} className={styles.breakdownRow}>
                <span>{criterion.title.split('&')[0].trim()}</span>
                <span className={styles.breakdownScore}>
                  {scores[criterion.key] ?? 0} / {criterion.maxPoints}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.actionsCard}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              loadingLabel="Saving Evaluation..."
              disabled={!scoringOpen}
              fullWidth
            >
              {team.evaluationStatus === 'graded' ? 'Update Evaluation' : 'Submit Evaluation'}
            </Button>

            <Link
              href="/jury"
              className={buttonClassName({
                variant: 'ghost',
                size: 'md',
                fullWidth: true,
              })}
            >
              Cancel & Return
            </Link>
          </div>
        </aside>
      </form>
    </div>
  );
}
