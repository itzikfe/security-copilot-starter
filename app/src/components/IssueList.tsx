import React from 'react';
import type { Issue } from '../types';

type Props = {
  issues: Issue[];
  selectedId: string | null;
  onSelect: (issue: Issue) => void;
  className?: string;
};

export default function IssueList({ issues, selectedId, onSelect, className }: Props) {
  return (
    <div className={['divide-y divide-gray-200', className].join(' ')}>
      {issues.map((issue) => {
        const active = issue.id === selectedId;

        // Pick severity icon
        let icon: string | null = null;
        if (issue.severityScore != null) {
          if (issue.severityScore <= 0.6) {
            icon = '/icons/moderate.png';
          } else if (issue.severityScore <= 0.89) {
            icon = '/icons/important.png';
          } else {
            icon = '/icons/critical.png';
          }
        }

        return (
          <button
            key={issue.id}
            type="button"
            onClick={() => onSelect(issue)}
            className={[
              'w-full text-left px-4 py-3 flex items-center gap-2',
              active ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'
            ].join(' ')}
          >
            {icon ? (
              <img src={icon} alt="Severity" className="w-4 h-4 flex-shrink-0" />
            ) : null}
            <span className="truncate">{issue.name}</span>
          </button>
        );
      })}
    </div>
  );
}
