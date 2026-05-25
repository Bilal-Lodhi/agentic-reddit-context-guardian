import './index.css';

import { Fragment, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuditEntry, AuditLogResponse } from '../shared/api';

function AuditLog() {
  const [entries, setEntries] = useState<Array<AuditEntry>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchEntries = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/audit-entries');
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
        const { entries: data } = (await response.json()) as AuditLogResponse;
        if (!cancelled) setEntries(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchEntries();

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const toggleBody = (commentId: string) => {
    setExpanded((prev) => {
      const copy = new Set(prev);
      if (copy.has(commentId)) copy.delete(commentId);
      else copy.add(commentId);
      return copy;
    });
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        Loading audit log…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 px-4">
        <p className="text-red-500 font-semibold">Failed to load audit log</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          onClick={() => setRetryKey((k) => k + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        No moderation activity yet. Audit entries will appear here once the bot evaluates comments.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto min-h-screen bg-white dark:bg-gray-950">
      <h1 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
        Context Guardian — Audit Log ({entries.length} entries)
      </h1>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 uppercase text-xs">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Author</th>
              <th className="px-3 py-2">Verdict</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {entries.map((entry) => (
              <Fragment key={entry.commentId}>
                <tr
                  className="cursor-pointer bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => toggleBody(entry.commentId)}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                    {formatDate(entry.evaluatedAt)}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                    u/{entry.author}
                  </td>
                  <td className="px-3 py-2">
                    {entry.violatesRules ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        Violation
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Safe
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[300px] truncate">
                    {entry.reason}
                  </td>
                </tr>
                {expanded.has(entry.commentId) && (
                  <tr key={`${entry.commentId}-body`}>
                    <td colSpan={4} className="px-3 py-2 bg-gray-50 dark:bg-gray-900">
                      <p className="text-xs text-gray-500 mb-1">Comment body:</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                        {entry.body}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        Comment ID: {entry.commentId}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuditLog />
  </StrictMode>
);