import { assertT1 } from '@devvit/shared';
import { reddit, settings } from '@devvit/web/server';
import type { OnCommentCreateRequest } from '@devvit/web/shared';
import { GEMINI_MODEL, buildGeminiRequestBody } from '../shared/openrouter-config';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETTINGS_KEY = 'openrouterApiKey';

const SYSTEM_INSTRUCTION =
  'You are an autonomous AI content moderator. Evaluate content. ' +
  'Respond strictly in valid JSON format with keys "violatesRules" (boolean) and "reason" (string, max 15 words). ' +
  'Do not output markdown backticks.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the Gemini native generateContent URL with API key as query parameter.
 */
function geminiUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

/**
 * Resolve the API key from Devvit App Directory settings.
 */
async function getApiKey(): Promise<string> {
  try {
    const raw = await settings.get(SETTINGS_KEY);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  } catch (err) {
    console.warn(`[Settings] Failed to read ${SETTINGS_KEY}:`, String(err));
  }
  return '';
}

/**
 * Call the Google Gemini API via Devvit's sanctioned `fetch`.
 * `generativelanguage.googleapis.com` is on the global Devvit allowlist.
 */
async function analyzeWithAI(
  commentBody: string,
): Promise<{ violatesRules: boolean; reason: string }> {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error(
      'API key is not configured. A subreddit moderator must set ' +
      'the key in the App Directory settings dashboard before the bot can ' +
      'evaluate comments.',
    );
  }

  const requestBody = buildGeminiRequestBody(SYSTEM_INSTRUCTION, commentBody);

  const response = await fetch(geminiUrl(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Gemini API returned status ${response.status}: ${errorText}`,
    );
  }

  // Gemini generateContent response shape:
  // { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  const json = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('Gemini returned an empty response body');
  }

  const parsed = JSON.parse(rawText) as {
    violatesRules: boolean;
    reason: string;
  };

  if (typeof parsed.violatesRules !== 'boolean') {
    throw new Error(
      'Gemini response missing "violatesRules" boolean field',
    );
  }
  if (typeof parsed.reason !== 'string') {
    throw new Error('Gemini response missing "reason" string field');
  }

  const reason = parsed.reason.trim();
  const normalizedReason =
    reason.length > 0
      ? reason
      : parsed.violatesRules
        ? 'Content violates community guidelines'
        : 'Content complies with community guidelines';

  return { violatesRules: parsed.violatesRules, reason: normalizedReason };
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
    const result = await analyzeWithAI(commentBody);

    console.log(
      `[MODERATION] commentId=${commentId} author=${authorUsername} ` +
        `violatesRules=${result.violatesRules} reason="${result.reason}"`,
    );

    if (result.violatesRules) {
      assertT1(commentId);
      const commentModel = await reddit.getCommentById(commentId);

      const prefix = '[Context Guardian Bot]: ';
      const maxReasonLen = prefix.length > 99 ? 0 : 99 - prefix.length;
      const trimmedReason =
        result.reason.length > maxReasonLen
          ? result.reason.slice(0, maxReasonLen - 3) + '...'
          : result.reason;

      await reddit.report(commentModel, {
        reason: `${prefix}${trimmedReason}`,
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