import React, { useMemo, useState } from 'react';
import raw from './issues.json';
import type { Issue } from './types';
import IssueList from './components/IssueList';
import Copilot from './components/Copilot';
import RightDrawer from './components/RightDrawer';
import Settings from './components/Settings';

function normalizeUrl(u?: string | null): string | null {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(s)) return `https://${s}`;
  return null;
}

function normalizeRecommendations(val: unknown): string[] | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) {
    const arr = val.map((x) => String(x ?? '').trim()).filter(Boolean);
    return arr.length ? arr : undefined;
  }
  const str = String(val).trim();
  if (!str) return undefined;
  const parts = str
    .split(/\r?\n|•|- |\u2022/)
    .map((x) => x.trim())
    .filter(Boolean);
  return (parts.length ? parts : [str]) as string[];
}

function extractIssues(data: any): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();

  const sections = Array.isArray(data?.sections) ? data.sections : [];
  for (const section of sections) {
    const subSections = Array.isArray(section?.sub_sections) ? section.sub_sections : [];
    for (const sub of subSections) {
      const templates = Array.isArray(sub?.finding_templates) ? sub.finding_templates : [];
      for (const ft of templates) {
        const st = ft?.sem_template;
        const name: string | undefined = st?.sem_header;
        if (!name || seen.has(name)) continue;

        // Reference (first usable URL)
        const instr = st?.sem_resolution_instruction;
        let reference: string | undefined;
        if (Array.isArray(instr)) {
          for (const candidate of instr) {
            const norm = normalizeUrl(typeof candidate === 'string' ? candidate : String(candidate));
            if (norm) { reference = norm; break; }
          }
        } else {
          reference = normalizeUrl(instr) ?? undefined;
        }

        const description: string | undefined = st?.sem_long_description || undefined;
        const recommendations = normalizeRecommendations(st?.sem_recommendations);

        // Severity score
        const scoreRaw = st?.severity_score;
        const severityScore =
          typeof scoreRaw === 'number'
            ? scoreRaw
            : scoreRaw != null
            ? parseFloat(String(scoreRaw))
            : undefined;

        // New: category
        const category: string | undefined = st?.sem_category || undefined;

        const id: string =
          st?.uuid ||
          ft?.uuid ||
          ft?.identifier ||
          `${name}-${Math.random().toString(36).slice(2, 8)}`;

        out.push({ id, name, reference, description, recommendations, severityScore, category });
        seen.add(name);
      }
    }
  }
  return out;
}

type FilterKey = 'All' | 'Critical' | 'Important' | 'Moderate';
type SortKey = 'Severity' | 'A–Z';

function getSeverityLabel(score?: number): 'Critical' | 'Important' | 'Moderate' | 'Unknown' {
  if (score == null || Number.isNaN(score)) return 'Unknown';
  if (score >= 0.9) return 'Critical';
  if (score >= 0.61) return 'Important';
  return 'Moderate';
}

export default function App() {
  const allIssues = useMemo(() => extractIssues(raw), []);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('All');
  const [sortBy, setSortBy] = useState<SortKey>('Severity');
  const [view, setView] = useState<'main' | 'settings'>('main');

  const counts = useMemo(() => {
    let critical = 0, important = 0, moderate = 0;
    for (const i of allIssues) {
      const label = getSeverityLabel(i.severityScore);
      if (label === 'Critical') critical++;
      else if (label === 'Important') important++;
      else if (label === 'Moderate') moderate++;
    }
    return {
      All: allIssues.length,
      Critical: critical,
      Important: important,
      Moderate: moderate
    } as Record<FilterKey, number>;
  }, [allIssues]);

  const issues = useMemo(() => {
    let filtered =
      filter === 'All' ? allIssues : allIssues.filter((i) => getSeverityLabel(i.severityScore) === filter);
    if (sortBy === 'A–Z') {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'Severity') {
      filtered = [...filtered].sort((a, b) => (b.severityScore ?? 0) - (a.severityScore ?? 0));
    }
    return filtered;
  }, [allIssues, filter, sortBy]);

  const index = useMemo(
    () => (selected ? issues.findIndex((i) => i.id === selected.id) : -1),
    [issues, selected]
  );
  const total = issues.length;

  function handleSelect(issue: Issue) {
    setSelected(issue);
    setOpen(true);
  }

  function handlePrev() {
    if (index > 0) setSelected(issues[index - 1]);
  }
  function handleNext() {
    if (index >= 0 && index < total - 1) setSelected(issues[index + 1]);
  }

  function Pill({ name }: { name: FilterKey }) {
    const active = filter === name;
    return (
      <button
        type="button"
        onClick={() => {
          setFilter(name);
          setOpen(false);
          setSelected(null);
        }}
        className={[
          'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition',
          active
            ? 'bg-white text-blue-700 border-white'
            : 'bg-blue-700/30 text-white border-white/30 hover:bg-blue-600/40'
        ].join(' ')}
      >
        {name} ({counts[name]})
      </button>
    );
  }

  return view === 'settings' ? (
    <Settings
      issues={allIssues}
      onBack={() => {
        setView('main');
        setOpen(false);
        setSelected(null);
      }}
    />
  ) : (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      {/* Page-wide fixed header with sort + filters + settings */}
      <header className="flex items-center justify-between px-6 py-4 bg-blue-800 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-lg">Security Issues</div>

          {/* Sort dropdown styled as pill with SVG chevron */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-full border border-white/30 bg-blue-700/30 text-white text-xs font-medium px-3 py-1
                         hover:bg-blue-600/40 focus:outline-none focus:ring-2 focus:ring-white/50 pr-8 appearance-none"
            >
              <option value="Severity">Sort by Severity</option>
              <option value="A–Z">Sort A–Z</option>
            </select>
            {/* Chevron SVG */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <Pill name="All" />
            <Pill name="Critical" />
            <Pill name="Important" />
            <Pill name="Moderate" />
          </div>
        </div>

        {/* Settings button (right side) */}
        <button
          onClick={() => {
            setView('settings');
            setOpen(false);
            setSelected(null);
          }}
          className="rounded-full border border-white/30 bg-blue-700/30 text-white text-xs font-medium px-3 py-1 hover:bg-blue-600/40"
        >
          Settings
        </button>
      </header>

      {/* Content area below header */}
      <div className="flex flex-1 min-h-0">
        {/* Left: scrollable issues list */}
        <div className="w-1/2 border-r min-h-0">
          <IssueList
            issues={issues}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            className="h-full overflow-y-auto"
          />
        </div>

        {/* Right side placeholder (drawer overlays this) */}
        <div className="hidden md:block flex-1 min-h-0" />

        {/* Drawer under header */}
        <RightDrawer
          isOpen={open}
          onClose={() => setOpen(false)}
          widthClass="md:w-1/2 w-full"
          topOffsetPx={64}
          headerTitle={index >= 0 ? `Issues • ${index + 1} of ${total}` : 'Issues'}
          onPrev={handlePrev}
          onNext={handleNext}
          disablePrev={index <= 0}
          disableNext={index < 0 || index >= total - 1}
        >
          {selected ? <Copilot issue={selected} /> : null}
        </RightDrawer>
      </div>
    </div>
  );
}
