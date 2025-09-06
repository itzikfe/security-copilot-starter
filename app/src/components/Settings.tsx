import React, { useMemo, useState } from 'react';
import type { Issue } from '../types';
import { deleteIssue, updateIssue, getIssues } from '../lib/api';

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

export default function Settings({ issues, onBack }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [busy, setBusy] = useState(false);
  const [localIssues, setLocalIssues] = useState<Issue[]>(issues);

  // keep table in sync if parent issues change
  useMemo(() => setLocalIssues(issues), [issues]);

  async function refreshFromServer() {
    const data = await getIssues();

    // minimal extractor (same as in App.tsx)
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
          const category: string | undefined = st.sem_category || undefined;

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
      await deleteIssue(issue.id); // id = sem_header
      await refreshFromServer();
    } catch (e: any) {
      alert(`Delete failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
      setOpenMenu(null);
    }
  }

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
              onClick={() => { setEditing(localIssues.find((i) => i.id === id) || null); setOpenMenu(null); }}
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

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Finding Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Severity Score</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {localIssues.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">{i.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{i.category || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{sevLabel(i.severityScore)}</td>
                  <td className="px-2 py-3 text-right">
                    <Kebab id={i.id} />
                  </td>
                </tr>
              ))}
              {localIssues.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                    No issues found.
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
          issue={editing}
          onClose={() => setEditing(null)}
          onSave={async (updated) => {
            try {
              setBusy(true);
              // PATCH the issue on the server (id is ORIGINAL title; name may change)
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
  const [category, setCategory] = useState(issue.category || 'configuration_changes');
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

        <div className="p-4 space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700">Title</span>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-700">Finding Category</span>
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
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
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-700">Description</span>
            <textarea
              className="mt-1 w-full border rounded px-3 py-2 h-24"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-700">Recommendations (one per line)</span>
            <textarea
              className="mt-1 w-full border rounded px-3 py-2 h-24"
              value={recs}
              onChange={(e) => setRecs(e.target.value)}
            />
          </label>
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded border text-sm">Cancel</button>
          <button
            onClick={() =>
              onSave({
                ...issue,
                name: name.trim(),
                category: category.trim(),
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
