/**
 * ============================================================================
 * OpenRouter Configuration (Shared — used by Devvit server code)
 * ============================================================================
 *
 * This is the shared copy of `backend-agent/openrouter-config.ts`.
 * Keep both files in sync when you change the model or thinking mode.
 *
 * 🚀 HOW TO CHANGE THE MODEL
 * ─────────────────────────────
 *   Change OPENROUTER_MODEL to any model ID from https://openrouter.ai/models.
 *
 *   Examples:
 *     'google/gemini-2.5-flash'         ← Lightweight, fast
 *     'google/gemini-2.5-pro'           ← Stronger reasoning
 *     'google/gemini-3.1-flash'         ← Latest Gemini Flash
 *     'google/gemini-3.1-pro'           ← Latest Gemini Pro
 *     'anthropic/claude-3.5-haiku'      ← Fast Anthropic
 *     'openai/gpt-4o'                   ← OpenAI
 *
 * 🧠 HOW TO CHANGE THINKING / REASONING MODE
 * ─────────────────────────────────────────────
 *   Set OPENROUTER_THINKING to 'none', 'medium', or 'deep'.
 *   Set to 'none' to disable thinking entirely.
 *
 * ⚠️  The API key is read from Devvit App settings (not hardcoded here).
 */

export type ThinkingMode = 'none' | 'medium' | 'deep';

// ── MODEL ─────────────────────────────────────────────────────────────────
export const OPENROUTER_MODEL: string = 'google/gemini-2.5-flash';

// ── THINKING ───────────────────────────────────────────────────────────────
export const OPENROUTER_THINKING: ThinkingMode = 'none';

// ── REASONING EFFORT MAPPING ───────────────────────────────────────────────
export const REASONING_EFFORT_MAP: Record<ThinkingMode, string> = {
  none: 'low',
  medium: 'medium',
  deep: 'high',
};

/**
 * Builds the OpenRouter chat-completion request body.
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
  return {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: commentBody },
    ],
    response_format: { type: 'json_object' },
    reasoning: { effort: REASONING_EFFORT_MAP[OPENROUTER_THINKING] },
  };
}