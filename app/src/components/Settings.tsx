import React, { useMemo, useState } from 'react';
import type { Issue } from '../types';
import { deleteIssue, updateIssue, getIssues, createIssue } from '../lib/api';

type Props = {
  issues: Issue[];
  onBack: () => void;
};

function sevLabel(score?: number): string {
  if (score == null || Number.isNaN(score)) return 'Unknown';
  if (score >= 0.9) return `Critical (${score.toFixed(2)})`;
  if (score >= 0.61) return `Important (${score.toFixed(2)})`;
  return `Moderate (${score.toFixed(2)})`;
}

function sevBucket(score?: number): 'Critical' | 'Important' | 'Moderate' | 'Unknown' {
  if (score == null || Number.isNaN(score)) return 'Unknown';
  if (score >= 0.9) return 'Critical';
  if (score >= 0.61) return 'Important';
  return 'Moderate';
}

// standard categories
const CATEGORY_OPTIONS = [
  'Software Updates',
  'Configuration Changes',
  'Network Exposures',
  'Security Controls',
  'Email Threats',
] as const;
type CategoryOption = (typeof CATEGORY_OPTIONS)[number] | 'Other';

function normalizeCategoryLabel(raw?: string): CategoryOption {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'Other';
  if (s.includes('software')) return 'Software Updates';
  if (s.includes('config')) return 'Configuration Changes';
  if (s.includes('network')) return 'Network Exposures';
  if (s.includes('control')) return 'Security Controls';
  if (s.includes('email')) return 'Email Threats';
  for (const opt of CATEGORY_OPTIONS) if (opt.toLowerCase() === s) return opt;
  return 'Other';
}

export default function Settings({ issues, onBack }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [localIssues, setLocalIssues] = useState<Issue[]>(issues);

  // controls
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<CategoryOption | 'All'>('All');
  const [filterSeverity, setFilterSeverity] = useState<'All' | 'Critical' | 'Important' | 'Moderate'>('All');
  const [sortBy, setSortBy] = useState<'Title' | 'Severity'>('Title');

  useMemo(() => setLocalIssues(issues), [issues]);

  async function refreshFromServer() {
    const data = await getIssues();

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
      const parts = str.split(/\r?\n|•|- |\u2022/).map((x) => x.trim()).filter(Boolean);
      return (parts.length ? parts : [str]) as string[];
    }

    const out: Issue[] = [];
    const seen = new Set<string>();
    for (const section of data.sections || []) {
      for (const sub of section.sub_sections || []) {
        for (const ft of sub.finding_templates || []) {
          const st = ft?.sem_template || {};
          const name = st.sem_header as string | undefined;
          if (!name || seen.has(name)) continue;

          let reference: string | undefined;
          const instr = st.sem_resolution_instruction;
          if (Array.isArray(instr)) {
            for (const c of instr) {
              const norm = normalizeUrl(typeof c === 'string' ? c : String(c));
              if (norm) { reference = norm; break; }
            }
          } else {
            reference = normalizeUrl(instr) ?? undefined;
          }

          const description: string | undefined = st.sem_long_description || undefined;
          const recommendations = normalizeRecommendations(st.sem_recommendations);
          const severityScore = st.severity_score != null ? Number(st.severity_score) : undefined;
          const categoryRaw: string | undefined = st.sem_category || undefined;
          const category = normalizeCategoryLabel(categoryRaw);

          out.push({ id: name, name, reference, description, recommendations, severityScore, category });
          seen.add(name);
        }
      }
    }
    setLocalIssues(out);
  }

  async function handleDelete(issue: Issue) {
    if (!window.confirm(`Delete issue "${issue.name}"? This cannot be undone.`)) return;
    try {
      setBusy(true);
      await deleteIssue(issue.id);
      await refreshFromServer();
    } catch (e: any) {
      alert(`Delete failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
      setOpenMenu(null);
    }
  }

  // derived list
  const visibleIssues = useMemo(() => {
    let rows = localIssues.map((i) => ({
      ...i,
      category: normalizeCategoryLabel(i.category as string | undefined),
    }));

    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((i) => i.name.toLowerCase().includes(q));

    if (filterCategory !== 'All') rows = rows.filter((i) => i.category === filterCategory);
    if (filterSeverity !== 'All') rows = rows.filter((i) => sevBucket(i.severityScore) === filterSeverity);

    if (sortBy === 'Title') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    else rows = [...rows].sort((a, b) => (b.severityScore ?? 0) - (a.severityScore ?? 0));

    return rows;
  }, [localIssues, search, filterCategory, filterSeverity, sortBy]);

  function Kebab({ id }: { id: string }) {
    const open = openMenu === id;
    return (
      <div className="relative">
        <button
          onClick={() => setOpenMenu(open ? null : id)}
          className="px-2 py-1 rounded hover:bg-gray-100"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Row menu"
        >
          ⋮
        </button>
        {open ? (
          <div
            className="absolute right-0 mt-1 w-40 rounded-md border border-gray-200 bg-white shadow-lg z-10"
            role="menu"
          >
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                const row = localIssues.find((i) => i.id === id) || null;
                setEditing(row);
                setOpenMenu(null);
              }}
            >
              Edit
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                const issue = localIssues.find((i) => i.id === id);
                if (issue) handleDelete(issue);
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-blue-800 text-white shadow-md">
        <div className="font-semibold text-lg">Settings</div>
        <button
          onClick={onBack}
          className="rounded-full border border-white/30 bg-blue-700/30 text-white text-xs font-medium px-3 py-1 hover:bg-blue-600/40"
        >
          ← Back to Security Issues
        </button>
      </header>

      {/* Search + Create button bar */}
      <div className="px-6 pt-4 flex items-center gap-3">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          placeholder="Search title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
          onClick={() => setCreating(true)}
        >
          + Create New Finding
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                {/* TITLE header with inline SORT control */}
                <th className="px-4 py-2 text-left align-top">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Title
                    </div>
                    <select
                      className="text-xs border rounded px-2 py-1 bg-white"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      title="Sort"
                    >
                      <option value="Title">A–Z</option>
                      <option value="Severity">Severity (high→low)</option>
                    </select>
                  </div>
                </th>

                {/* CATEGORY header with inline FILTER */}
                <th className="px-4 py-2 text-left align-top">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Finding Category
                    </div>
                    <select
                      className="text-xs border rounded px-2 py-1 bg-white"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value as CategoryOption | 'All')}
                      title="Filter category"
                    >
                      <option value="All">All</option>
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </th>

                {/* SEVERITY header with inline FILTER */}
                <th className="px-4 py-2 text-left align-top">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Severity Score
                    </div>
                    <select
                      className="text-xs border rounded px-2 py-1 bg-white"
                      value={filterSeverity}
                      onChange={(e) => setFilterSeverity(e.target.value as any)}
                      title="Filter severity"
                    >
                      <option value="All">All</option>
                      <option value="Critical">Critical</option>
                      <option value="Important">Important</option>
                      <option value="Moderate">Moderate</option>
                    </select>
                  </div>
                </th>

                <th className="w-12" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {visibleIssues.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">{i.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{normalizeCategoryLabel(i.category as string)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{sevLabel(i.severityScore)}</td>
                  <td className="px-2 py-3 text-right">
                    <Kebab id={i.id} />
                  </td>
                </tr>
              ))}
              {visibleIssues.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                    No issues match the current criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {busy && <div className="mt-3 text-xs text-gray-500">Working…</div>}
      </div>

      {/* Edit modal */}
      {editing && (
        <EditDialog
          issue={{
            ...editing,
            category: normalizeCategoryLabel(editing.category as string),
          }}
          onClose={() => setEditing(null)}
          onSave={async (updated) => {
            try {
              setBusy(true);
              await updateIssue(editing.id, {
                sem_header: updated.name,
                sem_category: updated.category,
                severity_score: updated.severityScore,
                sem_long_description: updated.description,
                sem_recommendations: updated.recommendations,
                sem_resolution_instruction: updated.reference ? [updated.reference] : [],
              });
              await refreshFromServer();
              setEditing(null);
            } catch (e: any) {
              alert(`Update failed: ${e?.message || String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <CreateDialog
          existingNames={new Set(localIssues.map((i) => i.name))}
          onClose={() => setCreating(false)}
          onSave={async (draft) => {
            try {
              setBusy(true);
              // basic validation
              if (!draft.name.trim()) throw new Error('Title is required.');
              if (draft.severityScore == null || draft.severityScore < 0 || draft.severityScore > 1) {
                throw new Error('Severity Score must be between 0 and 1.');
              }
              // POST new issue
              await createIssue({
                sem_header: draft.name,
                sem_category: draft.category,
                severity_score: draft.severityScore,
                sem_long_description: draft.description,
                sem_recommendations: draft.recommendations,
                sem_resolution_instruction: draft.reference ? [draft.reference] : [],
              });
              await refreshFromServer();
              setCreating(false);
            } catch (e: any) {
              alert(`Create failed: ${e?.message || String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  issue, onClose, onSave
}: {
  issue: Issue;
  onClose: () => void;
  onSave: (i: Issue) => void | Promise<void>;
}) {
  const [name, setName] = useState(issue.name);
  const [category, setCategory] = useState<CategoryOption | 'Other'>(
    (issue.category as CategoryOption) || 'Configuration Changes'
  );
  const [severity, setSeverity] = useState(issue.severityScore ?? 0.5);
  const [reference, setReference] = useState(issue.reference || '');
  const [description, setDescription] = useState(issue.description || '');
  const [recs, setRecs] = useState((issue.recommendations || []).join('\n'));

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-lg">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">Edit Issue</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <FormFields
          name={name} setName={setName}
          category={category} setCategory={setCategory}
          severity={severity} setSeverity={setSeverity}
          reference={reference} setReference={setReference}
          description={description} setDescription={setDescription}
          recs={recs} setRecs={setRecs}
        />

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded border text-sm">Cancel</button>
          <button
            onClick={() =>
              onSave({
                ...issue,
                name: name.trim(),
                category,
                severityScore: severity,
                reference: reference.trim(),
                description,
                recommendations: recs.split('\n').map((x) => x.trim()).filter(Boolean),
              })
            }
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateDialog({
  existingNames, onClose, onSave
}: {
  existingNames: Set<string>;
  onClose: () => void;
  onSave: (i: Issue) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryOption | 'Other'>('Configuration Changes');
  const [severity, setSeverity] = useState<number>(0.5);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [recs, setRecs] = useState('');

  function trySave() {
    const title = name.trim();
    if (!title) return alert('Title is required.');
    if (existingNames.has(title)) {
      return alert('An issue with this Title already exists. Please choose a different Title.');
    }
    onSave({
      id: title,
      name: title,
      category,
      severityScore: severity,
      reference: reference.trim(),
      description,
      recommendations: recs.split('\n').map((x) => x.trim()).filter(Boolean),
    });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-lg">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">Create New Finding</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <FormFields
          name={name} setName={setName}
          category={category} setCategory={setCategory}
          severity={severity} setSeverity={setSeverity}
          reference={reference} setReference={setReference}
          description={description} setDescription={setDescription}
          recs={recs} setRecs={setRecs}
        />

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded border text-sm">Cancel</button>
          <button onClick={trySave} className="px-3 py-2 rounded bg-blue-600 text-white text-sm">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function FormFields(props: {
  name: string; setName: (v: string) => void;
  category: CategoryOption | 'Other'; setCategory: (v: CategoryOption | 'Other') => void;
  severity: number; setSeverity: (v: number) => void;
  reference: string; setReference: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  recs: string; setRecs: (v: string) => void;
}) {
  const {
    name, setName,
    category, setCategory,
    severity, setSeverity,
    reference, setReference,
    description, setDescription,
    recs, setRecs,
  } = props;

  return (
    <div className="p-4 space-y-3">
      <label className="block text-sm">
        <span className="text-gray-700">Title</span>
        <input
          className="mt-1 w-full border rounded px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Disable basic authentication for IMAP/POP/SMTP"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-gray-700">Finding Category</span>
          <select
            className="mt-1 w-full border rounded px-3 py-2"
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="Other">Other</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-gray-700">Severity Score (0–1)</span>
          <input
            type="number" step="0.01" min="0" max="1"
            className="mt-1 w-full border rounded px-3 py-2"
            value={severity}
            onChange={(e) => setSeverity(parseFloat(e.target.value))}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-gray-700">Reference (single URL)</span>
        <input
          className="mt-1 w-full border rounded px-3 py-2"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="https://example.com/how-to-fix"
        />
      </label>

      <label className="block text-sm">
        <span className="text-gray-700">Description</span>
        <textarea
          className="mt-1 w-full border rounded px-3 py-2 h-24"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Briefly describe the finding and its impact…"
        />
      </label>

      <label className="block text-sm">
        <span className="text-gray-700">Recommendations (one per line)</span>
        <textarea
          className="mt-1 w-full border rounded px-3 py-2 h-24"
          value={recs}
          onChange={(e) => setRecs(e.target.value)}
          placeholder={`Use MFA for admin accounts\nDisable legacy protocols\nEnable DKIM/DMARC`}
        />
      </label>
    </div>
  );
}
