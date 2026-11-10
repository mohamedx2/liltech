import { EventPhase, TeamProgressState } from 'api-contracts';
import { devMockState } from './dev-state';
import { ApiClientError } from '../../errors';
import type { SubmissionHistoryResponse, SubmissionItem } from '../../contracts/pending';

function isSubmissionWindowClosed(): boolean {
  return (
    devMockState.phase === EventPhase.SubmissionsClosed ||
    devMockState.phase === EventPhase.Pitching ||
    devMockState.phase === EventPhase.Results
  );
}

export function handleGetMySubmissions(): SubmissionHistoryResponse {
  const current = devMockState.submissions[devMockState.submissions.length - 1] ?? null;

  return {
    submissions: devMockState.submissions,
    current,
    isLocked: isSubmissionWindowClosed(),
    deadline: devMockState.phase === EventPhase.Live ? '2026-11-22T08:00:00.000Z' : null,
  };
}

export function handleCreateSubmission(body: unknown): SubmissionItem {
  if (isSubmissionWindowClosed()) {
    throw new ApiClientError({
      message: 'Submissions are closed. The deadline has passed.',
      status: 403,
      code: 'FORBIDDEN',
    });
  }

  let title = 'Final Project Deliverable';
  let description = '';
  let repoUrl = '';
  let fileName = 'deliverables.zip';
  let fileSizeBytes = 2048000;

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    title = (body.get('title') as string) || title;
    description = (body.get('description') as string) || description;
    repoUrl = (body.get('repoUrl') as string) || repoUrl;
    const file = body.get('file');
    if (file && typeof file === 'object' && 'name' in file) {
      fileName = (file as File).name;
      fileSizeBytes = (file as File).size;
    }
  } else if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.title === 'string') title = record.title;
    if (typeof record.description === 'string') description = record.description;
    if (typeof record.repoUrl === 'string') repoUrl = record.repoUrl;
  }

  const newSubmission: SubmissionItem = {
    id: `sub-${Date.now().toString(36)}`,
    teamId: devMockState.team.id,
    track: devMockState.team.track ?? 'track_a',
    title,
    description: description || undefined,
    repoUrl: repoUrl || undefined,
    fileName,
    fileSizeBytes,
    submittedAt: new Date().toISOString(),
    version: devMockState.submissions.length + 1,
  };

  devMockState.submissions.push(newSubmission);
  devMockState.team.progress = TeamProgressState.Submitted;

  return newSubmission;
}
