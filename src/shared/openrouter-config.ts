/**
 * ============================================================================
 * Google Gemini Configuration (Shared — used by Devvit server code)
 * ============================================================================
 *
 * Calls the Google Gemini native REST API via the globally-approved Devvit
 * domain `generativelanguage.googleapis.com`.
 *
 * 🚀 HOW TO CHANGE THE MODEL
 * ─────────────────────────────
 *   Change GEMINI_MODEL to any Gemini model ID.
 *
 *   Examples:
 *     'gemini-2.0-flash'     ← Fast, lightweight
 *     'gemini-2.5-flash'     ← Lightweight current-gen
 *     'gemini-2.5-pro'       ← Stronger reasoning
 *
 * ⚠️  The API key is read from Devvit App settings (not hardcoded here).
 *     OpenRouter keys route through Google's native endpoint when the
 *     payload matches Google's schema.
 */

// ── MODEL ─────────────────────────────────────────────────────────────────
export const GEMINI_MODEL: string = 'gemini-2.5-flash';

/**
 * Builds a Google Gemini native generateContent request body.
 *
 * Ref: https://ai.google.dev/api/generate-content#request-body
 */
export function buildGeminiRequestBody(
  systemInstruction: string,
  commentBody: string,
): {
  contents: Array<{
    role: 'user';
    parts: Array<{ text: string }>;
  }>;
  systemInstruction: {
    parts: Array<{ text: string }>;
  };
  generationConfig: {
    responseMimeType: 'application/json';
    responseSchema: {
      type: 'object';
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };
  };
} {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: commentBody }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          violatesRules: {
            type: 'boolean',
            description: 'Whether the content violates community guidelines',
          },
          reason: {
            type: 'string',
            description: 'Brief explanation of the moderation decision (max 15 words)',
          },
        },
        required: ['violatesRules', 'reason'],
      },
    },
  };
}
