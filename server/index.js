// server/index.js
// ESM-style Express server ready for Render (PORT env), with CORS and two endpoints:
//  - POST /api/scrape  -> fetch & extract readable text from URLs
//  - POST /api/chat    -> call OpenAI Chat Completions using (optional) scraped sources
//
// Requirements in server/package.json:
//   "type": "module",
//   "dependencies": {
//     "cors": "^2.8.5",
//     "express": "^4.19.2"
//     // optional: "express-rate-limit": "^7"
//   }

import express from 'express';
import cors from 'cors';

const app = express();

// --- CORS ---
// During initial testing keep it permissive;
// after you know your Netlify hostname, set:
// app.use(cors({ origin: 'https://YOUR-SITE.netlify.app' }));
app.use(cors({ origin: true }));

app.use(express.json({ limit: '1mb' }));

// --- (Optional) light rate-limiting for public endpoints ---
// import rateLimit from 'express-rate-limit';
// const limiter = rateLimit({ windowMs: 60_000, max: 30 });
// app.use('/api/', limiter);

// --- Healthcheck ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: !!process.env.OPENAI_API_KEY ? 'ready' : 'no-key' });
});

// --- Utilities ---
function isValidHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// super-light HTML → text extraction (no extra deps)
function htmlToText(html) {
  if (!html) return '';
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, '');
  const withNewlines = withoutStyles
    .replace(/<\/(p|div|h\d|li|br|tr|td)>/gi, '$&\n')
    .replace(/<(ul|ol|table|section|article)>/gi, '\n');
  const stripped = withNewlines.replace(/<[^>]+>/g, '');
  // collapse spaces
  return stripped.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; StanceCopilot/1.0; +https://example.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const ok = resp.ok;
    const status = resp.status;
    const ct = resp.headers.get('content-type') || '';
    const raw = await resp.text();
    const text =
      ct.includes('html') || /<\/?[a-z][\s\S]*>/i.test(raw)
        ? htmlToText(raw)
        : raw;
    return { url, ok, status, text };
  } catch (e) {
    return { url, ok: false, status: 0, error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

// --- /api/scrape ---
// body: { urls: string[] }
app.post('/api/scrape', async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
  if (!urls.length) {
    return res.status(400).json({ error: 'urls[] required' });
  }
  // Safeguards for public use
  const unique = Array.from(new Set(urls)).filter(isValidHttpUrl).slice(0, 10);

  const results = await Promise.all(unique.map((u) => fetchText(u)));
  // trim long pages to avoid sending megabytes back to FE
  const MAX = 60_000;
  for (const r of results) {
    if (r.ok && r.text && r.text.length > MAX) {
      r.text = r.text.slice(0, MAX) + '\n\n[truncated]';
    }
  }
  res.json({ results });
});

// --- /api/chat ---
// body: { messages: [{role, content}], sources?: [{url, text}] }
app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: 'Missing OPENAI_API_KEY (server env)' });
    }

    const messages = Array.isArray(req.body?.messages)
      ? req.body.messages
      : [];
    const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];

    // Build a concise context from sources
    // (avoid dumping huge texts; clip per source)
    const perSourceLimit = 4000;
    const clipped = sources
      .slice(0, 8)
      .map((s, i) => {
        const body =
          (s.text || '').slice(0, perSourceLimit) +
          ((s.text || '').length > perSourceLimit ? '\n[truncated]' : '');
        return `Source #${i + 1}: ${s.url}\n${body}`;
      })
      .join('\n\n');

    const systemPrompt = [
      'You are Stance Copilot, a helpful security assistant.',
      'Use the provided sources when answering. If sources conflict, say so.',
      'Cite relevant steps clearly and keep responses concise and actionable.',
      'If user asks for a language (e.g., Hebrew), answer in that language.'
    ].join(' ');

    const finalMessages = [
      { role: 'system', content: systemPrompt },
      clipped
        ? {
            role: 'system',
            content:
              'Context from scraped sources (URLs included):\n\n' + clipped
          }
        : null,
      ...messages
    ].filter(Boolean);

    // OpenAI Chat Completions
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: finalMessages
      })
    });

    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      return res.status(r.status).json({
        error: `Upstream OpenAI error (${r.status}): ${errBody || r.statusText}`
      });
    }

    const data = await r.json();
    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      '(no content)';
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --- Start ---
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
