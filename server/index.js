// server/index.js
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));

// Allow dev + your production frontend (add your Netlify URL)
app.use(
  cors({
    origin: [
      'http://localhost:5173',               // Vite dev
      'http://localhost:5050',               // (optional) local checks
      'https://joyful-crumble-5eafce.netlify.app', // <-- replace with your real Netlify URL
      'https://<your-custom-domain>'              // <-- optional: your custom domain
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
  })
);

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'issues.json');

// --- helpers ---
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ sections: [] }, null, 2), 'utf8');
  }
}

function readJson() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    return { sections: [] };
  }
}

function writeJson(obj) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// --- routes ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/issues', (req, res) => {
  const data = readJson();
  res.json(data);
});

// Create new issue (sem_header must be unique)
app.post('/api/issues', (req, res) => {
  const p = req.body || {};
  if (!p.sem_header || typeof p.sem_header !== 'string') {
    return res.status(400).json({ error: 'sem_header (Title) is required' });
  }

  const data = readJson();

  // where to insert: first section/subsection, create defaults if missing
  if (!Array.isArray(data.sections)) data.sections = [];
  if (data.sections.length === 0) data.sections.push({ title: 'Default Section', sub_sections: [] });
  const section = data.sections[0];
  if (!Array.isArray(section.sub_sections)) section.sub_sections = [];
  if (section.sub_sections.length === 0)
    section.sub_sections.push({ title: 'Default Subsection', finding_templates: [] });
  const sub = section.sub_sections[0];
  if (!Array.isArray(sub.finding_templates)) sub.finding_templates = [];

  // no duplicates by sem_header
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

// Update existing issue by id (id is the original sem_header)
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

// Delete by id (id is sem_header)
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

// --- start ---
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
