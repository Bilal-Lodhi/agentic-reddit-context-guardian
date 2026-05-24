import { GoogleGenAI } from '@google/genai';
import express, { type Request, type Response } from 'express';
import { MongoClient, type Collection } from 'mongodb';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

if (!GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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

const SYSTEM_INSTRUCTION =
  'You are an autonomous AI content moderator. Evaluate context. ' +
  'Respond strictly in valid JSON format with keys "violatesRules" (boolean) and "reason" (string, max 15 words). ' +
  'Do not output markdown backticks.';

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

async function analyzeWithGemini(body: string): Promise<{ violatesRules: boolean; reason: string }> {
  const response = await genai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: body,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
    },
  });

  if (!response.candidates || response.candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }

  const candidate = response.candidates[0];
  if (!candidate.content?.parts || candidate.content.parts.length === 0) {
    throw new Error('Gemini returned no content parts');
  }

  const rawText = candidate.content.parts[0].text;
  if (!rawText) {
    throw new Error('Gemini returned empty text');
  }

  const parsed = JSON.parse(rawText) as { violatesRules: boolean; reason: string };

  if (typeof parsed.violatesRules !== 'boolean') {
    throw new Error('Gemini response missing "violatesRules" boolean field');
  }
  if (typeof parsed.reason !== 'string') {
    throw new Error('Gemini response missing "reason" string field');
  }

  return { violatesRules: parsed.violatesRules, reason: parsed.reason };
}

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

      const evaluation = await analyzeWithGemini(body);

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
  });
}

main().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});