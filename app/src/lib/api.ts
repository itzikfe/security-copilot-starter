// app/src/lib/api.ts
/* Centralized API client with debug logging, timeouts, and clear errors */

export type Issue = {
  id: string;
  name: string;
  category?: string;
  severityScore?: number;
  reference?: string;
  description?: string;
  recommendations?: string[];
};

type IssuesFileShape = {
  sections: Array<{
    title?: string;
    sub_sections?: Array<{
      title?: string;
      finding_templates?: Array<{
        sem_template?: {
          sem_header?: string;
          sem_category?: string;
          severity_score?: number;
          sem_long_description?: string;
          sem_recommendations?: string[] | string | null;
          sem_resolution_instruction?: string[] | string | null;
        };
      }>;
    }>;
  }>;
};

type ScrapeInput = string[];
type ScrapeResultItem = { url: string; ok: boolean; text?: string; status?: number };
type ScrapeResult = { results: ScrapeResultItem[] };

type RawChatInput = {
  messages: { role: 'user' | 'system' | 'assistant'; content: string }[];
  sources?: { url: string; text: string }[];
};
type RawChatResult = { reply?: string };

/* ---------- Config ---------- */

const BASE = import.meta.env.VITE_API_BASE || '';

function url(p: string) {
  const full = `${BASE}${p}`;
  // DEBUG: see exactly where we call
  console.log('fetch ->', full);
  return full;
}

// Default timeout for requests (ms)
const DEFAULT_TIMEOUT = 20000;

/* ---------- Core request helper ---------- */

async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT, ...init } = options;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url(path), { ...init, signal: ctrl.signal });

    // Non-2xx → include status + any server text to help debug quickly
    if (!res.ok) {
      const text = await safeReadText(res);
      throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` – ${text}` : ''}`);
    }

    // Try JSON first; if fails, return text as any
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await res.json()) as T;
    }
    const text = await res.text();
    // @ts-expect-error dynamic
    return text as T;
  } catch (err: any) {
    // Classify common failure modes with clearer messages
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    if (err?.message?.includes('Failed to fetch')) {
      throw new Error(
        'Failed to fetch. Check that the API base URL is reachable (VITE_API_BASE), CORS is allowed, and the server is running.'
      );
    }
    throw new Error(err?.message || String(err));
  } finally {
    clearTimeout(id);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    // Truncate very long HTML error pages
    return t.length > 300 ? `${t.slice(0, 300)}…` : t;
  } catch {
    return '';
  }
}

/* ---------- Public API: Issues ---------- */

/** Get the raw issues.json structure from the server */
export async function getIssuesFile(): Promise<IssuesFileShape> {
  return request<IssuesFileShape>('/api/issues', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
}

/**
 * Convenience: parse the server JSON into flat Issue[]
 * Use when you need a normalized list on the client.
 */
export async function getIssues(): Promise<IssuesFileShape> {
  // Keep the original nested shape; your UI already parses it elsewhere.
  // If you want a flat list here, you could map it — but most of your code
  // expects the nested shape from the server, so we return it as-is.
  return getIssuesFile();
}

/** Create a new issue (POST) — payload is server’s sem_template-like shape */
export async function createIssue(payload: any) {
  return request('/api/issues', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Update issue by id (id is the original sem_header) */
export async function updateIssue(id: string, payload: any) {
  return request(`/api/issues/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Delete issue by id (id is the sem_header) */
export async function deleteIssue(id: string) {
  return request(`/api/issues/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ---------- Public API: Scrape & Chat ---------- */

/** Scrape a set of URLs on the server so Chat can use real page text */
export async function scrape(urls: ScrapeInput): Promise<ScrapeResult> {
  if (!Array.isArray(urls)) throw new Error('scrape: urls must be an array of strings');
  return request<ScrapeResult>('/api/scrape', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
}

/**
 * Raw Chat (ChatGPT-like): send messages + optional sources.
 * Server should proxy to OpenAI (or similar) using your API key.
 */
export async function rawChat(input: RawChatInput): Promise<RawChatResult> {
  return request<RawChatResult>('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/* ---------- Legacy helper (optional): Copilot wrapper ---------- */
/**
 * If you still use an older “copilot” endpoint on your server that expects
 * issueName / userQuestion / sources, keep this helper. Otherwise, you can
 * delete it and update callers to use rawChat().
 */
export async function copilot(payload: {
  issueName: string;
  userQuestion?: string;
  sources: { url: string; text: string }[];
}): Promise<{ reply?: string }> {
  return request<{ reply?: string }>('/api/copilot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
