import { assertT1 } from '@devvit/shared';
import { context, reddit } from '@devvit/web/server';
import type { OnCommentCreateRequest } from '@devvit/web/shared';

// ---------------------------------------------------------------------------
// Runtime‑injected Devvit plugin types
// ---------------------------------------------------------------------------

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

type GeminiModerationResult = {
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
// Settings key — moderators paste their Gemini key into the Reddit App
// Directory settings dashboard.
// ---------------------------------------------------------------------------

const GEMINI_API_KEY_SETTING = 'geminiApiKey';

// ---------------------------------------------------------------------------
// Optional MongoDB audit-log sidecar (Render endpoint — non‑blocking).
// ---------------------------------------------------------------------------

const AUDIT_LOG_ENDPOINT =
  'https://agentic-reddit-context-guardian.onrender.com/api/audit-log';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the Gemini API key from Devvit settings.
 * Falls back to an empty string so the caller can produce a clear error.
 */
async function getGeminiApiKey(): Promise<string> {
  try {
    const raw = await getSettings().get(GEMINI_API_KEY_SETTING);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  } catch {
    // Settings API unavailable — handled below
  }
  return '';
}

/**
 * Call the Gemini 2.5 Flash API directly via the Devvit‑sanctioned
 * `context.fetch` proxy.  This keeps the entire moderation pipeline inside
 * the Devvit serverless sandbox with zero external middleware dependency.
 */
async function analyzeWithGemini(
  apiKey: string,
  commentBody: string,
): Promise<GeminiModerationResult> {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
    encodeURIComponent(apiKey);

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        parts: [{ text: commentBody }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  const response = await getFetch()(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(
      `Gemini API returned status ${response.status}: ${response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const parts = json.candidates?.[0]?.content?.parts;
  const rawText = parts?.[0]?.text;

  if (!rawText) {
    throw new Error('Gemini returned an empty response body');
  }

  const parsed = JSON.parse(rawText) as GeminiModerationResult;

  if (typeof parsed.violatesRules !== 'boolean') {
    throw new Error('Gemini response missing "violatesRules" boolean field');
  }
  if (typeof parsed.reason !== 'string') {
    throw new Error('Gemini response missing "reason" string field');
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
// Core trigger handler
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
    const geminiKey = await getGeminiApiKey();

    if (!geminiKey) {
      return {
        status: 'error',
        message:
          'Gemini API key is not configured. A subreddit moderator must set the key in the App Directory settings dashboard before the bot can evaluate comments.',
      };
    }

    const result = await analyzeWithGemini(geminiKey, commentBody);

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