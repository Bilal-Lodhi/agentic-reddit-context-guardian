/**
 * ============================================================================
 * OpenRouter Configuration
 * ============================================================================
 *
 * This file lets you control which AI model and thinking mode the
 * Context Guardian moderation pipeline uses through OpenRouter.
 *
 * 🚀 HOW TO CHANGE THE MODEL
 * ─────────────────────────────
 *   Change the value of OPENROUTER_MODEL below to any model identifier from
 *   the OpenRouter model catalogue (https://openrouter.ai/models).
 *
 *   Examples:
 *     'google/gemini-2.5-flash'         ← Lightweight, fast, cheap
 *     'google/gemini-2.5-pro'           ← Stronger reasoning
 *     'google/gemini-3.1-flash'         ← Latest Gemini Flash variant
 *     'google/gemini-3.1-pro'           ← Latest Gemini Pro variant
 *     'anthropic/claude-3.5-haiku'      ← Fast Anthropic option
 *     'openai/gpt-4o'                   ← OpenAI alternative
 *
 * 🧠 HOW TO CHANGE THINKING / REASONING MODE
 * ─────────────────────────────────────────────
 *   Set OPENROUTER_THINKING to one of:
 *     - 'none'     No extra reasoning tokens (fastest, cheapest).
 *     - 'medium'   Balanced reasoning depth.
 *     - 'deep'     Maximum reasoning depth (best accuracy, slowest).
 *
 *   Not all models support reasoning/thinking.  OpenRouter will silently
 *   ignore the parameter for models that don't support it.
 *
 * ⚠️  The API key is NEVER stored in this file.
 *   It is read from the OPENROUTER_API_KEY environment variable at runtime
 *   (set it in the .env file next to this file).
 */

export type ThinkingMode = 'none' | 'medium' | 'deep';

// ── MODEL ─────────────────────────────────────────────────────────────────
// Paste any OpenRouter model ID here:
export const OPENROUTER_MODEL: string = 'google/gemini-2.5-flash';

// ── THINKING ───────────────────────────────────────────────────────────────
// Change this to 'none', 'medium', or 'deep':
export const OPENROUTER_THINKING: ThinkingMode = 'none';

// ── REASONING EFFORT MAPPING ───────────────────────────────────────────────
// Maps the human-readable ThinkingMode to the OpenRouter `reasoning.effort`
// parameter.  Most providers (including Google Gemini) honour this value.
export const REASONING_EFFORT_MAP: Record<ThinkingMode, string> = {
  none: 'low',
  medium: 'medium',
  deep: 'high',
};

/**
 * Builds the OpenRouter chat-completion request body for a single-turn
 * moderation evaluation.  Callers only supply the comment body; this
 * helper fills in system instructions, model, JSON output constraints,
 * and any reasoning/thinking configuration.
 */
export function buildOpenRouterRequestBody(
  systemInstruction: string,
  commentBody: string,
): {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  response_format: { type: 'json_object' };
  reasoning?: { effort: string };
} {
  const body: ReturnType<typeof buildOpenRouterRequestBody> = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: commentBody },
    ],
    response_format: { type: 'json_object' },
  };

  // Attach reasoning/thinking config only when a non-default effort is set.
  // `none` maps to 'low' which is the default — we still send it explicitly
  // so the behaviour is predictable across providers.
  body.reasoning = { effort: REASONING_EFFORT_MAP[OPENROUTER_THINKING] };

  return body;
}