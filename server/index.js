// server/index.js
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ---------- JSON body parsing (must be before routes) ---------- */
app.use(express.json({ limit: '2mb' }));

/* ---------- CORS (allow your Netlify + localhost) ---------- */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',                        // Vite dev
  'https://joyful-crumble-5eafce.netlify.app',   // your Netlify site
  // 'https://your-custom-domain.com',            // add if/when you use one
  // 'https://www.your-custom-domain.com',
]);

function corsOrigin(origin, cb) {
  // allow server-to-server/no-origin (curl/health) and listed origins
  if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
  return cb(new Error('CORS blocked: ' + origin));
}

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  })
);
// Preflight for all routes
app.options('*', cors({ origin: corsOrigin }));

/* ---------- Data locations (supports Render Disk via DATA_DIR) ---------- */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'issues.json');
const SEED_FILE = path.join(__dirname, 'seed', 'issues.seed.json');

/* ---------- Seed helpers ---------- */
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function seedIfEmpty(obj) {
  const empty = !obj || !Array.isArray(obj.sections) || obj.sections.length === 0;
  if (!empty) return obj;

  if (fs.existsSync(SEED_FILE)) {
    try {
      const raw = fs.readFileSync(SEED_FILE, 'utf8');
      const seed = JSON.parse(raw);
      if (Array.isArray(seed.sections) && seed.sections.length > 0) {
        ensureDir();
        fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
        return seed;
      }
    } catch (e) {
      console.error('Failed to load seed file:', e);
    }
  }
  return { sections: [] };
}

function readJson() {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) {
    return seedIfEmpty({ sections: [] });
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return seedIfEmpty(parsed);
  } catch (e) {
    console.error('Failed to parse data file, attempting seed:', e);
    return seedIfEmpty({ sections: [] });
  }
}

function writeJson(obj) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

/* ---------- Health ---------- */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dataDir: DATA_DIR });
});

/* ---------- Issues (CRUD) ---------- */
// GET all (nested shape)
app.get('/api/issues', (req, res) => {
  const data = readJson();
  res.json(data);
});

// POST create new finding
app.post('/api/issues', (req, res) => {
  const p = req.body || {};
  if (!p.sem_header || typeof p.sem_header !== 'string') {
    return res.status(400).json({ error: 'sem_header (Title) is required' });
  }

  const data = readJson();

  // Ensure base structure
  if (!Array.isArray(data.sections)) data.sections = [];
  if (data.sections.length === 0) data.sections.push({ title: 'Default Section', sub_sections: [] });
  const section = data.sections[0];
  if (!Array.isArray(section.sub_sections)) section.sub_sections = [];
  if (section.sub_sections.length === 0)
    section.sub_sections.push({ title: 'Default Subsection', finding_templates: [] });
  const sub = section.sub_sections[0];
  if (!Array.isArray(sub.finding_templates)) sub.finding_templates = [];

  // Unique by sem_header
  const exists = sub.finding_templates.some((ft) => ft?.sem_template?.sem_header === p.sem_header);
  if (exists) return res.status(409).json({ error: 'An issue with this sem_header already exists' });

  const sem_template = {
    sem_header: String(p.sem_header).trim(),
    sem_category: p.sem_category || 'Configuration Changes',
    severity_score:
      typeof p.severity_score === 'number' ? p.severity_score : Number(p.severity_score || 0),
    sem_long_description: p.sem_long_description || '',
    sem_recommendations: Array.isArray(p.sem_recommendations) ? p.sem_recommendations : [],
    sem_resolution_instruction: Array.isArray(p.sem_resolution_instruction)
      ? p.sem_resolution_instruction
      : p.sem_resolution_instruction
      ? [p.sem_resolution_instruction]
      : [],
  };

  sub.finding_templates.push({ sem_template });
  writeJson(data);
  return res.status(201).json({ ok: true, created: sem_template });
});

// PUT update by id (id = original sem_header)
app.put('/api/issues/:id', (req, res) => {
  const id = req.params.id;
  const p = req.body || {};
  const data = readJson();

  for (const sec of data.sections || []) {
    for (const sub of sec.sub_sections || []) {
      for (const ft of sub.finding_templates || []) {
        const st = ft.sem_template || {};
        if (st.sem_header === id) {
          if (p.sem_header != null) st.sem_header = String(p.sem_header);
          if (p.sem_category != null) st.sem_category = String(p.sem_category);
          if (p.severity_score != null) st.severity_score = Number(p.severity_score);
          if (p.sem_long_description != null) st.sem_long_description = String(p.sem_long_description);
          if (p.sem_recommendations != null)
            st.sem_recommendations = Array.isArray(p.sem_recommendations) ? p.sem_recommendations : [];
          if (p.sem_resolution_instruction != null) {
            st.sem_resolution_instruction = Array.isArray(p.sem_resolution_instruction)
              ? p.sem_resolution_instruction
              : p.sem_resolution_instruction
              ? [p.sem_resolution_instruction]
              : [];
          }
          writeJson(data);
          return res.json({ ok: true, updated: st });
        }
      }
    }
  }
  return res.status(404).json({ error: 'Not found' });
});

// DELETE by id (id = sem_header)
app.delete('/api/issues/:id', (req, res) => {
  const id = req.params.id;
  const data = readJson();

  for (const sec of data.sections || []) {
    for (const sub of sec.sub_sections || []) {
      const before = (sub.finding_templates || []).length;
      sub.finding_templates = (sub.finding_templates || []).filter(
        (ft) => ft?.sem_template?.sem_header !== id
      );
      if (sub.finding_templates.length !== before) {
        writeJson(data);
        return res.json({ ok: true, deleted: id });
      }
    }
  }
  return res.status(404).json({ error: 'Not found' });
});

/* ---------- Scrape ---------- */
// POST /api/scrape -> { urls: string[] } -> { results: [{url, ok, text?, status?}] }
app.post('/api/scrape', async (req, res) => {
  try {
    const { urls } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls must be a non-empty array of strings' });
    }

    const out = await Promise.all(
      urls.map(async (u) => {
        const url = String(u || '').trim();
        if (!url) return { url, ok: false, status: 400 };
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 15000);
          const r = await fetch(url, { signal: controller.signal, redirect: 'follow' });
          clearTimeout(t);
          if (!r.ok) return { url, ok: false, status: r.status };

          const html = await r.text();
          const $ = cheerio.load(html);
          $('script, style, noscript').remove();
          $('[aria-hidden="true"], [style*="display:none"]').remove();

          const text = $('body').text().replace(/\s+/g, ' ').trim();
          const MAX = 15000;
          const clipped = text.length > MAX ? text.slice(0, MAX) : text;

          return { url, ok: true, text: clipped };
        } catch (e) {
          return { url, ok: false, status: 0 };
        }
      })
    );

    res.json({ results: out });
  } catch (e) {
    console.error('scrape error:', e);
    res.status(500).json({ error: 'scrape failed' });
  }
});

/* ---------- Chat (OpenAI) ---------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /api/chat -> { messages: [...], sources?: [{url,text}] } -> { reply }
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, sources } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(401).json({ error: 'Missing OPENAI_API_KEY on server' });
    }

    const sourceBlock =
      Array.isArray(sources) && sources.length
        ? `\n\nUse these references when helpful:\n${sources
            .map((s, i) => `(${i + 1}) ${s.url}\n${(s.text || '').slice(0, 1200)}\n`)
            .join('\n')}`
        : '';

    const systemMsg = {
      role: 'system',
      content:
        'You are a security remediation copilot. Be concise, step-by-step, and cite references when possible.' +
        sourceBlock,
    };

    const msgPayload = [systemMsg, ...messages];

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // choose a model available on your account
      temperature: 0.2,
      messages: msgPayload,
    });

    const reply = resp.choices?.[0]?.message?.content || '';
    res.json({ reply });
  } catch (e) {
    console.error('chat error:', e);
    const msg =
      e?.response?.data?.error?.message ||
      e?.error?.message ||
      e?.message ||
      'chat failed';
    res.status(500).json({ error: msg });
  }
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
