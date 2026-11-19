/**
 * Best-effort GitHub commit pinning.
 *
 * At submission time we ask the GitHub API for the default-branch HEAD so the
 * jury can tell which revision was submitted. This is a convenience, never a
 * gate: a timeout, a rate limit, a private repository or a deleted repository
 * all resolve to `null` and the submission is still recorded.
 */

export interface GithubRepositoryRef {
  owner: string;
  repo: string;
}

const GITHUB_REPO_PATH = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const REQUEST_TIMEOUT_MS = 5000;
const GITHUB_API_BASE_URL = 'https://api.github.com';

/** Extracts `owner` and `repo` from a validated `https://github.com/...` URL. */
export function parseGithubRepository(url: string): GithubRepositoryRef | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    return null;
  }

  if (!GITHUB_REPO_PATH.test(parsed.pathname)) {
    return null;
  }

  const [owner, rawRepo] = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
  if (!owner || !rawRepo) {
    return null;
  }

  return { owner, repo: rawRepo.replace(/\.git$/, '') };
}

export type GithubCommitFetcher = (repository: GithubRepositoryRef) => Promise<string | null>;

async function fetchHeadCommit(repository: GithubRepositoryRef): Promise<string | null> {
  const url = `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(
    repository.repo,
  )}/commits?per_page=1`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'liltech-platform',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const first = payload[0] as { sha?: unknown } | null;
  const sha = typeof first?.sha === 'string' ? first.sha.toLowerCase() : '';

  return COMMIT_SHA.test(sha) ? sha : null;
}

let fetcher: GithubCommitFetcher = fetchHeadCommit;

/** Test seam: replaces the GitHub call (pass nothing to restore the real one). */
export function setGithubCommitFetcher(next?: GithubCommitFetcher): void {
  fetcher = next ?? fetchHeadCommit;
}

/** Never throws: any failure means "no SHA", and the submission proceeds. */
export async function fetchGithubHeadCommit(repositoryUrl: string): Promise<string | null> {
  const repository = parseGithubRepository(repositoryUrl);
  if (!repository) {
    return null;
  }

  try {
    return await fetcher(repository);
  } catch {
    return null;
  }
}
