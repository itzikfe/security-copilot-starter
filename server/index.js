// server/index.js
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ----- basic express setup -----
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

// ----- locate data file (nested JSON structure: sections → sub_sections → finding_templates) -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const ISSUES_PATH = path.join(DATA_DIR, 'issues.json');

// minimal ensure
await fs.mkdir(DATA_DIR, { recursive: true });
async function readJson(p) {
  const txt = await fs.readFile(p, 'utf-8');
  return JSON.parse(txt);
}
async function writeJson(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2));
}

// ----- util: deep delete by sem_header (title) -----
function deleteByTitle(root, title) {
  if (!root?.sections) return false;
  let removed = false;
  for (const section of root.sections) {
    for (const sub of section.sub_sections || []) {
      if (!Array.isArray(sub.finding_templates)) continue;
      const before = sub.finding_templates.length;
      sub.finding_templates = sub.finding_templates.filter((ft) => {
        const h = ft?.sem_template?.sem_header;
        return h !== title;
      });
      if (sub.finding_templates.length !== before) removed = true;
    }
  }
  // also prune empty containers (optional)
  root.sections = root.sections
    .map((s) => ({
      ...s,
      sub_sections: (s.sub_sections || []).filter((ss) => (ss.finding_templates || []).length > 0),
    }))
    .filter((s) => (s.sub_sections || []).length > 0);
  return removed;
}

// ----- util: edit by title (replace sem_template fields) -----
function editByTitle(root, title, patch) {
  if (!root?.sections) return false;
  for (const section of root.sections) {
    for (const sub of section.sub_sections || []) {
      for (const ft of sub.finding_templates || []) {
        const st = ft?.sem_template;
        if (st?.sem_header === title) {
          // allow editing header, category, severity, description, recommendations, reference(s)
          if (typeof patch.sem_header === 'string' && patch.sem_header.trim()) {
            st.sem_header = patch.sem_header.trim();
          }
          if (typeof patch.sem_category === 'string') st.sem_category = patch.sem_category;
          if (typeof patch.severity_score !== 'undefined') st.severity_score = Number(patch.severity_score);
          if (typeof patch.sem_long_description === 'string') st.sem_long_description = patch.sem_long_description;
          if (Array.isArray(patch.sem_recommendations)) st.sem_recommendations = patch.sem_recommendations;
          if (Array.isArray(patch.sem_resolution_instruction) || typeof patch.sem_resolution_instruction === 'string') {
            st.sem_resolution_instruction = patch.sem_resolution_instruction;
          }
          return true;
        }
      }
    }
  }
  return false;
}

// ---------- HEALTH ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- ISSUES CRUD ----------
app.get('/api/issues', async (_req, res) => {
  try {
    const data = await readJson(ISSUES_PATH);
    res.json(data); // return the full nested JSON your client already knows to parse
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.delete('/api/issues/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id); // we use sem_header (title) as id
    const data = await readJson(ISSUES_PATH);
    const ok = deleteByTitle(data, id);
    if (!ok) return res.status(404).json({ error: 'Issue not found' });
    await writeJson(ISSUES_PATH, data);
    res.json({ ok: true, deleted: id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.put('/api/issues/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const patch = req.body || {};
    const data = await readJson(ISSUES_PATH);
    const ok = editByTitle(data, id, patch);
    if (!ok) return res.status(404).json({ error: 'Issue not found' });
    await writeJson(ISSUES_PATH, data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------- existing endpoints (scrape + chat) ----------
function htmlToText(html) {
  if (!html) return '';
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, '');
  const withNewlines = withoutStyles
    .replace(/<\/(p|div|h\d|li|br|tr|td)>/gi, '$&\n')
    .replace(/<(ul|ol|table|section|article)>/gi, '\n');
  const stripped = withNewlines.replace(/<[^>]+>/g, '');
  return stripped.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'StanceCopilot/1.0' } });
    const raw = await r.text();
    const ct = r.headers.get('content-type') || '';
    const text = ct.includes('html') || /<\/?[a-z]/i.test(raw) ? htmlToText(raw) : raw;
    return { url, ok: r.ok, status: r.status, text };
  } catch (e) {
    return { url, ok: false, status: 0, error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

app.post('/api/scrape', async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
  const unique = Array.from(new Set(urls)).slice(0, 10);
  const results = await Promise.all(unique.map((u) => fetchText(u)));
  res.json({ results });
});

app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];

    const perSourceLimit = 4000;
    const clipped = sources
      .slice(0, 8)
      .map((s, i) => {
        const body = (s.text || '').slice(0, perSourceLimit) + ((s.text || '').length > perSourceLimit ? '\n[truncated]' : '');
        return `Source #${i + 1}: ${s.url}\n${body}`;
      })
      .join('\n\n');

    const systemPrompt =
      'You are Stance Copilot, a helpful security assistant. Use provided sources. Be concise, actionable, and respect the user language.';
    const finalMessages = [
      { role: 'system', content: systemPrompt },
      clipped ? { role: 'system', content: 'Context:\n' + clipped } : null,
      ...messages,
    ].filter(Boolean);

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, messages: finalMessages }),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => '');
      return res.status(r.status).json({ error: err || r.statusText });
    }
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || '(no content)';
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ----- start -----
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
