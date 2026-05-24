import { context, reddit } from '@devvit/web/server';
import type { OnCommentCreateRequest } from '@devvit/web/shared';
import { assertT1 } from '@devvit/shared';

// ---------------------------------------------------------------------------
// Runtime‑injected Devvit plugin types
// ---------------------------------------------------------------------------
// The `context` Proxy defined in @devvit/server/context.js dynamically injects
// plugin namespaces (settings, fetch, etc.) at runtime that are absent from
// the static `Context` type. These inline type declarations bridge the gap
// between the elevated TypeScript strictness used in this codebase and the
// runtime‑only existence of the properties.

type PluginSettings = {
  get<T = string | number | boolean | string[] | undefined>(
    name: string,
  ): Promise<T | undefined>;
};

type PluginFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

// Lazy typed accessors — must NOT touch the `context` Proxy at module load
// time because it throws "No context found" outside of a server request.
// Casting through `unknown` avoids polluting the global `Context` type.
function getSettings(): PluginSettings {
  return (context as unknown as Record<string, unknown>)
    .settings as PluginSettings;
}

function getFetch(): PluginFetch {
  return (context as unknown as Record<string, unknown>)
    .fetch as PluginFetch;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AIModerationResult = {
  violatesRules: boolean;
  reason: string;
};

type AuditLogPayload = {
  commentId: string;
  author: string;
  body: string;
  violatesRules: boolean;
  reason: string;
};

// ---------------------------------------------------------------------------
// System prompt — identical to the backend-agent for parity
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION =
  'You are an autonomous AI content moderator. Evaluate context. ' +
  'Respond strictly in valid JSON format with keys "violatesRules" (boolean) and "reason" (string, max 15 words). ' +
  'Do not output markdown backticks.';

// ---------------------------------------------------------------------------
// Settings key — moderators paste their OpenRouter key into the Reddit App
// Directory settings dashboard.  The key name must match what you pass to
// `npx devvit settings set <key>`.
// ---------------------------------------------------------------------------

const OPENROUTER_API_KEY_SETTING = 'openrouterApiKey';

// ---------------------------------------------------------------------------
// Optional MongoDB audit-log sidecar (Render endpoint — non‑blocking).
// ---------------------------------------------------------------------------

const AUDIT_LOG_ENDPOINT =
  'https://agentic-reddit-context-guardian.onrender.com/api/audit-log';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the OpenRouter API key from Devvit settings.
 * Falls back to an empty string so the caller can produce a clear error.
 */
async function getOpenRouterApiKey(): Promise<string> {
  try {
    const raw = await getSettings().get(OPENROUTER_API_KEY_SETTING);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  } catch {
    // Settings API unavailable — handled below
  }
  return '';
}

/**
 * Call the OpenRouter chat completions API via the Devvit‑sanctioned
 * `context.fetch` proxy.  This keeps the entire moderation pipeline inside
 * the Devvit serverless sandbox with zero external middleware dependency.
 */
async function analyzeWithAI(
  apiKey: string,
  commentBody: string,
): Promise<AIModerationResult> {
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const requestBody = {
    model: 'google/gemini-2.5-flash',
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: commentBody },
    ],
    response_format: { type: 'json_object' },
  };

  const response = await getFetch()(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter API returned status ${response.status}: ${response.statusText}`,
    );
  }

  // OpenRouter chat-completion response shape:
  // { choices: [{ message: { content: "..." } }] }
  const json = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  const rawText = json.choices?.[0]?.message?.content;

  if (!rawText) {
    throw new Error('OpenRouter returned an empty response body');
  }

  const parsed = JSON.parse(rawText) as AIModerationResult;

  if (typeof parsed.violatesRules !== 'boolean') {
    throw new Error('OpenRouter response missing "violatesRules" boolean field');
  }
  if (typeof parsed.reason !== 'string') {
    throw new Error('OpenRouter response missing "reason" string field');
  }

  // Normalize empty / whitespace-only reasons with sensible fallbacks
  const rawReason = parsed.reason.trim();
  const normalizedReason =
    rawReason.length > 0
      ? rawReason
      : parsed.violatesRules
        ? 'Content violates community guidelines'
        : 'Content complies with community guidelines';

  return { violatesRules: parsed.violatesRules, reason: normalizedReason };
}

/**
 * Fire-and-forget audit log → MongoDB via the optional Render sidecar.
 * Failures are silently swallowed so the moderation flow is never blocked.
 */
function logToAuditTrail(payload: AuditLogPayload): void {
  getFetch()(AUDIT_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      evaluatedAt: new Date().toISOString(),
    }),
  })
    .then((res: Response) => {
      if (!res.ok) {
        console.warn(
          `[Audit] Sidecar write returned ${res.status} for comment ${payload.commentId}`,
        );
      }
    })
    .catch((err: unknown) => {
      console.warn(
        `[Audit] Sidecar write failed for comment ${payload.commentId}: ${String(err)}`,
      );
    });
}

// ---------------------------------------------------------------------------
// Core trigger handler — exported as the entry point for the
// `onCommentCreate` trigger configured in devvit.json.
// ---------------------------------------------------------------------------

export async function handleCommentCreate(
  input: OnCommentCreateRequest,
): Promise<{ status: 'success' | 'error'; message: string }> {
  const comment = input.comment;

  if (!comment) {
    return {
      status: 'error',
      message: 'CommentCreate trigger received without comment data',
    };
  }

  const commentId: string = comment.id;
  const commentBody: string = comment.body;
  const authorUsername: string = comment.author;

  try {
    const openrouterKey = await getOpenRouterApiKey();

    if (!openrouterKey) {
      return {
        status: 'error',
        message:
          'OpenRouter API key is not configured. A subreddit moderator must set the key in the App Directory settings dashboard before the bot can evaluate comments.',
      };
    }

    const result = await analyzeWithAI(openrouterKey, commentBody);

    // Fire-and-forget audit log (never blocks the moderation action)
    logToAuditTrail({
      commentId,
      author: authorUsername,
      body: commentBody,
      violatesRules: result.violatesRules,
      reason: result.reason,
    });

    if (result.violatesRules) {
      assertT1(commentId);
      const commentModel = await reddit.getCommentById(commentId);

      await reddit.report(commentModel, {
        reason: `[Context Guardian Bot Warning]: ${result.reason}`,
      });

      return {
        status: 'success',
        message: `Comment ${commentId} by u/${authorUsername} reported for: ${result.reason}`,
      };
    }

    return {
      status: 'success',
      message: `Comment ${commentId} by u/${authorUsername} passed moderation check`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    console.error(
      `Context Guardian Bot error for comment ${commentId} by u/${authorUsername}: ${errorMessage}`,
    );

    return {
      status: 'error',
      message: `Failed to process comment ${commentId}: ${errorMessage}`,
    };
  }
}