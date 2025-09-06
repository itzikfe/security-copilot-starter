import React from 'react';
import type { Issue } from '../types';

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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Finding Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Severity Score
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {issues.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">{i.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{i.category || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{sevLabel(i.severityScore)}</td>
                </tr>
              ))}
              {issues.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                    No issues found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
