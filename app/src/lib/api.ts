// app/src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE || '';
const url = (p: string) => (API_BASE ? `${API_BASE}${p}` : p);

export async function getIssues(): Promise<any> {
  const r = await fetch(url('/api/issues'));
  if (!r.ok) throw new Error(`getIssues failed: ${r.status}`);
  return r.json();
}

export async function deleteIssue(id: string): Promise<void> {
  const r = await fetch(url(`/api/issues/${encodeURIComponent(id)}`), { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
}

export async function updateIssue(id: string, patch: any): Promise<void> {
  const r = await fetch(url(`/api/issues/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await r.text());
}

// existing calls
export async function scrape(links: string[]) {
  const r = await fetch(url('/api/scrape'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls: links })
  });
  if (!r.ok) throw new Error(`scrape failed: ${r.status}`);
  return r.json();
}

export async function rawChat(body: any) {
  const r = await fetch(url('/api/chat'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || `${r.status} ${r.statusText}`);
  return data as { reply: string };
}

export async function createIssue(payload: any) {
  const r = await fetch(url('/api/issues'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Create failed: ${r.status}`);
  return r.json();
}

export async function copilot(body: any) { return rawChat(body); }
