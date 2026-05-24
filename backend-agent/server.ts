import express, { type Request, type Response } from 'express';
import { MongoClient, type Collection } from 'mongodb';
import {
  buildOpenRouterRequestBody,
  OPENROUTER_MODEL,
  OPENROUTER_THINKING,
} from './openrouter-config.js';

// ============================================================================
// Environment
// ============================================================================

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

if (!OPENROUTER_API_KEY) {
  console.error('FATAL: OPENROUTER_API_KEY environment variable is not set');
  process.exit(1);
}

// ============================================================================
// Types
// ============================================================================

type AnalyzeCommentPayload = {
  commentId: string;
  author: string;
  body: string;
};

type ModerationLogDocument = AnalyzeCommentPayload & {
  violatesRules: boolean;
  reason: string;
  evaluatedAt: Date;
};

// ============================================================================
// Constants
// ============================================================================

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_INSTRUCTION =
  'You are an autonomous AI content moderator. Evaluate context. ' +
  'Respond strictly in valid JSON format with keys "violatesRules" (boolean) and "reason" (string, max 15 words). ' +
  'Do not output markdown backticks.';

// ============================================================================
// MongoDB
// ============================================================================

let moderationLogs: Collection<ModerationLogDocument> | null = null;

async function connectMongo(): Promise<void> {
  if (!MONGO_URI) {
    console.warn('MONGO_URI not set. MongoDB logging is disabled.');
    return;
  }

  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db('context_guardian_db');
    moderationLogs = db.collection<ModerationLogDocument>('moderation_logs');
    console.log('Connected to MongoDB Atlas — context_guardian_db.moderation_logs ready');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
  }
}

// ============================================================================
// AI Moderation (OpenRouter)
// ============================================================================

/**
 * Sends the comment body to OpenRouter for moderation evaluation.
 *
 * The model and reasoning/thinking depth are controlled by the
 * `openrouter-config.ts` file.  The API key is read from the
 * OPENROUTER_API_KEY environment variable (set in .env).
 */
async function analyzeWithAI(body: string): Promise<{ violatesRules: boolean; reason: string }> {
  const requestBody = buildOpenRouterRequestBody(SYSTEM_INSTRUCTION, body);

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenRouter API returned status ${response.status}: ${errorText}`);
  }

  // OpenRouter chat-completion response shape:
  // { choices: [{ message: { content: "..." } }] }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const rawText = json.choices?.[0]?.message?.content;

  if (!rawText) {
    throw new Error('OpenRouter returned an empty response body');
  }

  const parsed = JSON.parse(rawText) as { violatesRules: boolean; reason: string };

  if (typeof parsed.violatesRules !== 'boolean') {
    throw new Error('OpenRouter response missing "violatesRules" boolean field');
  }
  if (typeof parsed.reason !== 'string') {
    throw new Error('OpenRouter response missing "reason" string field');
  }

  // Normalize empty or whitespace-only reasons with a sensible fallback.
  const reason = parsed.reason.trim();
  const normalizedReason =
    reason.length > 0
      ? reason
      : parsed.violatesRules
        ? 'Content violates community guidelines'
        : 'Content complies with community guidelines';

  return { violatesRules: parsed.violatesRules, reason: normalizedReason };
}

// ============================================================================
// MongoDB audit logging
// ============================================================================

async function logToMongo(document: ModerationLogDocument): Promise<void> {
  if (!moderationLogs) {
    return;
  }
  try {
    await moderationLogs.insertOne(document);
  } catch (err) {
    console.error('Failed to insert moderation log into MongoDB:', err);
  }
}

// ============================================================================
// Express server
// ============================================================================

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());

  await connectMongo();

  app.post('/api/analyze-comment', async (req: Request, res: Response): Promise<void> => {
    try {
      const { commentId, author, body } = req.body as AnalyzeCommentPayload;

      if (!commentId || !author || !body) {
        res.status(400).json({
          error: 'Missing required fields: commentId, author, body',
        });
        return;
      }

      const evaluation = await analyzeWithAI(body);

      const logDocument: ModerationLogDocument = {
        commentId,
        author,
        body,
        violatesRules: evaluation.violatesRules,
        reason: evaluation.reason,
        evaluatedAt: new Date(),
      };

      await logToMongo(logDocument);

      console.log(
        `[MODERATION] commentId=${commentId} author=${author} violatesRules=${evaluation.violatesRules} reason="${evaluation.reason}"`,
      );

      res.status(200).json({
        violatesRules: evaluation.violatesRules,
        reason: evaluation.reason,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('POST /api/analyze-comment error:', message);
      res.status(500).json({ error: 'Internal moderation analysis failed' });
    }
  });

  app.listen(PORT, () => {
    console.log(`Context Guardian Backend listening on port ${PORT}`);
    console.log(`  → AI Provider : OpenRouter`);
    console.log(`  → Model       : ${OPENROUTER_MODEL}`);
    console.log(`  → Thinking    : ${OPENROUTER_THINKING}`);
  });
}

main().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});