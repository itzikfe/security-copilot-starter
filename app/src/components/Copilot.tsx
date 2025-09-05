import React, { useEffect, useState, KeyboardEvent } from 'react';
import type { Issue } from '../types';
import { scrape, rawChat } from '../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = { issue?: Issue | null };
type ScrapedSource = { url: string; text: string };

export default function Copilot({ issue }: Props) {
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState<string>('');
  const [question, setQuestion] = useState<string>('');
  const [justSwitched, setJustSwitched] = useState<boolean>(false);

  useEffect(() => {
    setReply('');
    setQuestion('');
    setLoading(false);
    if (issue) setJustSwitched(true);
  }, [issue?.id]);

  function promptFor(kind: 'about' | 'resolve'): string {
    const name = issue?.name || 'this issue';
    return kind === 'about'
      ? `Tell me more about this issue: "${name}".`
      : `How to resolve this issue: "${name}".`;
  }

  async function run(userQuestion?: string) {
    const q = ((userQuestion ?? question) || '').trim();
    if (!q) return;

    setJustSwitched(false);
    setLoading(true);
    setReply('');

    try {
      let sources: ScrapedSource[] = [];
      const refUrl = issue?.reference;
      if (refUrl) {
        const { results } = await scrape([refUrl]);
        sources = results
          .filter((r) => r.ok && r.text)
          .map((r) => ({ url: r.url, text: r.text as string }));
      }

      const r = await rawChat({
        messages: [{ role: 'user', content: q }],
        sources,
      });

      setReply(r.reply || 'No response.');
    } catch (e: any) {
      setReply(`Error: ${e.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      run();
    }
  }

  const optionBtn =
    'px-3 py-2 rounded-lg border border-blue-600 text-blue-600 bg-white hover:bg-blue-50 ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 text-sm';

  return (
    <div className="h-full flex flex-col px-20">
      {/* Issue title */}
     {issue?.name ? (
  <div className="pt-6 pb-4 flex items-center gap-2">
    {issue.severityScore != null && (
      <img
        src={
          issue.severityScore <= 0.6
            ? "/icons/moderate.png"
            : issue.severityScore <= 0.89
            ? "/icons/important.png"
            : "/icons/critical.png"
        }
        alt="Severity"
        className="w-5 h-5"
      />
    )}
    <h1 className="text-lg font-bold text-slate-900">{issue.name}</h1>
  </div>
) : null}


      {/* Description */}
      {issue?.description ? (
        <div className="pb-4 space-y-2">
          <div className="text-sm font-semibold text-slate-800">
            Security Finding Description
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {issue.description}
          </p>
        </div>
      ) : null}

      {/* Recommendations */}
      {issue?.recommendations && issue.recommendations.length > 0 ? (
        <div className="pb-4 space-y-2">
          <div className="text-sm font-semibold text-slate-800">Recommendations</div>
          <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
            {issue.recommendations.map((rec, idx) => (
              <li key={idx} className="whitespace-pre-wrap">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Reference */}
      {issue?.reference ? (
        <div className="pb-4 space-y-2">
          <div className="text-sm font-semibold text-slate-800">Reference</div>
          <a
            href={issue.reference}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-words"
          >
            {issue.reference}
          </a>
        </div>
      ) : null}

      {/* Ask Copilot */}
{issue ? (
  <div className="py-4 space-y-3">
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <img
        src="/icons/copilot.png"
        alt="Copilot Icon"
        className="w-4 h-4"
      />
      Ask Stance Copilot
    </div>

    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={optionBtn}
        disabled={loading}
        onClick={() => run(promptFor('about'))}
      >
        Tell me more about this issue
      </button>
      <button
        type="button"
        className={optionBtn}
        disabled={loading}
        onClick={() => run(promptFor('resolve'))}
      >
        How to resolve this issue
      </button>
    </div>

    <input
      className="w-full border rounded-lg px-3 py-2"
      placeholder="Type your question and press Enter…"
      value={question}
      onChange={(e) => setQuestion(e.target.value)}
      onKeyDown={handleKeyDown}
    />
  </div>
) : null}

      {/* Chat area */}
      <div className="py-6">
        <div className="w-full rounded-lg bg-gray-50 p-4">
          {loading ? (
            <Placeholder
              title="Thinking…"
              subtitle="Chatting with the model and considering the reference."
              spinner
            />
          ) : reply ? (
            <article className="prose prose-sm max-w-none leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{reply}</ReactMarkdown>
            </article>
          ) : !issue ? (
            <Placeholder
              title="Select an issue to start"
              subtitle="Pick one from the left panel to see guidance here."
            />
          ) : justSwitched ? (
            <Placeholder
              title="..." // "Switched issue"
              subtitle="Choose one of the fixed options or type your question."
            />
          ) : (
            <Placeholder
              title="Ready when you are"
              subtitle="Click a fixed option above or type your question and press Enter."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Placeholder({
  title,
  subtitle,
  spinner,
}: {
  title: string;
  subtitle?: string;
  spinner?: boolean;
}) {
  return (
    <div
      className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-2"
      aria-live="polite"
    >
      {spinner ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
      ) : null}
      <div className="text-sm font-medium text-gray-700">{title}</div>
      {subtitle ? <div className="text-xs">{subtitle}</div> : null}
    </div>
  );
}
