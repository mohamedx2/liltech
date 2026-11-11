'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { SubmissionHistoryResponse } from '@/lib/api/contracts/pending';
import { formatUtcTimestamp } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, TextInput, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/feedback/alert';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { ServerCountdown } from '@/components/events/server-countdown';
import styles from './submissions-view.module.css';

/** Matches the documented server-side upload limit (see docs/api). */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export function SubmissionsView() {
  const [history, setHistory] = useState<SubmissionHistoryResponse | null>(null);
  const [serverTime, setServerTime] = useState<string>(new Date().toISOString());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSubmissions = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [historyData, eventData] = await Promise.all([
        api.submissions.getMyTeamSubmissions(),
        api.events.getEventState(),
      ]);
      setHistory(historyData);
      setServerTime(eventData.serverTime);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load submission history.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    if (selectedFile && selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage('The selected file exceeds the 50MB limit. Please compress it and retry.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (repoUrl.trim()) formData.append('repoUrl', repoUrl.trim());
      if (selectedFile) formData.append('file', selectedFile);

      const newSubmission = await api.submissions.createSubmission(formData);
      setSuccessMessage(`Deliverable submission v${newSubmission.version} recorded successfully!`);

      // Reset form
      setTitle('');
      setDescription('');
      setRepoUrl('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Reload list
      const updated = await api.submissions.getMyTeamSubmissions();
      setHistory(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to upload submission. Please check connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Retrieving submission history..." />;
  }

  if (errorMessage && !history) {
    return (
      <ErrorState
        title="Submissions Unavailable"
        message={errorMessage}
        onRetry={() => {
          loadSubmissions();
        }}
      />
    );
  }

  const isLocked = history?.isLocked ?? false;
  const currentSubmission = history?.current;
  const submissionsList = history?.submissions ?? [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <span className={styles.subHeading}>Deliverable Portal</span>
          <h1 className={styles.title}>Project Submissions</h1>
          <p className={styles.description}>
            Upload your project deliverables, codebase repository, and presentation assets. All
            submissions are versioned and timestamped on the server.
          </p>
        </div>

        {history?.deadline && !isLocked && (
          <div className={styles.countdownBox}>
            <ServerCountdown
              serverTime={serverTime}
              targetTime={history.deadline}
              label="Submission Window Closes In"
            />
          </div>
        )}
      </header>

      {/* Lock Notice if Closed */}
      {isLocked && (
        <Alert tone="warning" title="Submissions Closed">
          The 08:00 UTC submission deadline has passed. Deliverables are locked for jury review and
          scoring.
        </Alert>
      )}

      {/* Success Notification */}
      {successMessage && (
        <Alert tone="success" title="Submission Confirmed">
          {successMessage}
        </Alert>
      )}

      {/* Current Active Submission Receipt */}
      {currentSubmission && (
        <Card surface="raised" className={styles.receiptCard}>
          <CardHeader>
            <div className={styles.receiptHeaderRow}>
              <div>
                <CardTitle as="h2">
                  Current Active Submission (Version {currentSubmission.version})
                </CardTitle>
                <CardDescription>
                  Submitted on {formatUtcTimestamp(currentSubmission.submittedAt)}
                </CardDescription>
              </div>
              <Badge tone="success" showDot>
                Recorded by Server
              </Badge>
            </div>
          </CardHeader>
          <CardContent className={styles.receiptContent}>
            <div className={styles.receiptGrid}>
              <div className={styles.receiptItem}>
                <span className={styles.receiptLabel}>Title</span>
                <span className={styles.receiptValue}>{currentSubmission.title}</span>
              </div>
              {currentSubmission.repoUrl && (
                <div className={styles.receiptItem}>
                  <span className={styles.receiptLabel}>Repository</span>
                  <a
                    href={currentSubmission.repoUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={styles.repoLink}
                  >
                    {currentSubmission.repoUrl} ↗
                  </a>
                </div>
              )}
              {currentSubmission.fileName && (
                <div className={styles.receiptItem}>
                  <span className={styles.receiptLabel}>Uploaded File</span>
                  <span className={styles.receiptValue}>
                    📄 {currentSubmission.fileName} (
                    {Math.round((currentSubmission.fileSizeBytes ?? 0) / 1024)} KB)
                  </span>
                </div>
              )}
              {currentSubmission.description && (
                <div className={styles.receiptItemFull}>
                  <span className={styles.receiptLabel}>Notes / Description</span>
                  <p className={styles.receiptNotes}>{currentSubmission.description}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submission Form (Only if not locked) */}
      {!isLocked && (
        <Card surface="default" className={styles.formCard}>
          <CardHeader>
            <CardTitle as="h2">
              {currentSubmission ? 'Submit Updated Deliverables' : 'New Deliverable Submission'}
            </CardTitle>
            <CardDescription>
              Submitting again creates a new version while archiving previous versions. Only the
              latest version is judged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage && (
              <Alert tone="error" title="Submission Error">
                {errorMessage}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <FormField label="Deliverable Title" required hint="e.g. LilTech Dispatcher v1.0">
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="LilTech Project Solution"
                    disabled={isSubmitting}
                    aria-describedby={describedBy}
                    required
                  />
                )}
              </FormField>

              <FormField
                label="Git Repository URL"
                hint="Public or shared GitHub / GitLab repository URL"
              >
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/organization/repo"
                    disabled={isSubmitting}
                    aria-describedby={describedBy}
                  />
                )}
              </FormField>

              <FormField
                label="Project Archive / Slide Deck (.zip, .pdf, .tar.gz)"
                hint="Upload code bundle or presentation deck (maximum 50MB)"
              >
                {({ id, describedBy }) => (
                  <input
                    ref={fileInputRef}
                    id={id}
                    type="file"
                    className={styles.fileInput}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    disabled={isSubmitting}
                    aria-describedby={describedBy}
                    accept=".zip,.tar.gz,.pdf,.tgz"
                  />
                )}
              </FormField>

              <FormField
                label="Technical Notes / Setup Instructions"
                hint="Provide instructions for the jury to execute or test your prototype"
              >
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Docker compose up command, demo credentials, or architecture overview..."
                    disabled={isSubmitting}
                    aria-describedby={describedBy}
                  />
                )}
              </FormField>

              <div className={styles.submitRow}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  disabled={!title.trim()}
                >
                  {isSubmitting ? 'Uploading Deliverable...' : 'Submit Deliverables'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Submission Version History Table */}
      {submissionsList.length > 0 ? (
        <Card surface="default" className={styles.historyCard}>
          <CardHeader>
            <CardTitle as="h2">Submission History</CardTitle>
            <CardDescription>Server-timestamped record of all team iterations</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              caption="List of past submissions by your team"
              columns={[
                {
                  key: 'version',
                  header: 'Version',
                  render: (sub) => (
                    <Badge tone={sub.version === currentSubmission?.version ? 'info' : 'neutral'}>
                      v{sub.version}
                    </Badge>
                  ),
                },
                {
                  key: 'title',
                  header: 'Title',
                  render: (sub) => <strong>{sub.title}</strong>,
                },
                { key: 'fileName', header: 'File', render: (sub) => sub.fileName ?? '—' },
                {
                  key: 'repoUrl',
                  header: 'Repository',
                  render: (sub) =>
                    sub.repoUrl ? (
                      <a
                        href={sub.repoUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={styles.repoLink}
                      >
                        Repository ↗
                      </a>
                    ) : (
                      '—'
                    ),
                },
                {
                  key: 'submittedAt',
                  header: 'Submitted At (UTC)',
                  render: (sub) => formatUtcTimestamp(sub.submittedAt),
                },
              ]}
              rows={submissionsList}
              getRowKey={(sub) => sub.id}
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="No Deliverables Yet"
          message="Your team has not submitted anything so far. Use the form above to record your first deliverable before the 08:00 UTC deadline."
        />
      )}
    </div>
  );
}
