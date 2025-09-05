// app/src/lib/api.ts
// Frontend helpers that talk to your server. The server base URL comes from Vite env:
//   - local dev:  VITE_API_BASE=http://localhost:5050
//   - production: VITE_API_BASE=https://<your-render-service>.onrender.com

const API_BASE = import.meta.env.VITE_API_BASE || '';

function url(p: string) {
  // Handles both absolute and relative when API_BASE is empty (same-origin)
  return API_BASE ? `${API_BASE}${p}` : p;
}

export async function scrape(links: string[]) {
  const r = await fetch(url('/api/scrape'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: links })
  });
  if (!r.ok) {
    throw new Error(`scrape failed: ${r.status} ${r.statusText}`);
  }
  return r.json() as Promise<{
    results: Array<{ url: string; ok: boolean; status?: number; text?: string }>;
  }>;
}

/**
 * Sends a raw chat to the server’s /api/chat. Use this for “ChatGPT mode”.
 * @param body shape: { messages: [{role, content}], sources?: [{url, text}] }
 */
export async function rawChat(body: any) {
  const r = await fetch(url('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error || `${r.status} ${r.statusText}`;
    throw new Error(msg);
  }
  return data as { reply: string };
}

/**
 * Legacy helper (if any code still calls copilot()). You can keep it as an alias
 * or remove it once all call sites use rawChat().
 */
export async function copilot(body: any) {
  return rawChat(body);
}
