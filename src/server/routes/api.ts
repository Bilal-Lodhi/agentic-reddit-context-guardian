import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  AuditEntry,
  AuditLogResponse,
  DecrementResponse,
  IncrementResponse,
  InitResponse,
} from '../../shared/api';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

api.post('/increment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', 1);
  return c.json<IncrementResponse>({
    count,
    postId,
    type: 'increment',
  });
});

api.get('/audit-entries', async (c) => {
  try {
    // Fetch the 100 most recent audit key names via the sorted set index,
    // ordered by score descending (newest first).
    const members = await redis.zRange('audit:index', 0, 99, {
      by: 'rank',
      reverse: true,
    });

    if (!members || members.length === 0) {
      return c.json<AuditLogResponse>({ entries: [], total: 0 });
    }

    const keys = members.map((m) => m.member);
    const entries: Array<AuditEntry> = [];

    // Fetch each entry. Devvit does not expose mget, so we loop.
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        try {
          entries.push(JSON.parse(raw) as AuditEntry);
        } catch {
          // skip malformed entries
        }
      }
    }

    return c.json<AuditLogResponse>({ entries, total: entries.length });
  } catch (err) {
    console.error('[Audit API] Error fetching entries:', String(err));
    return c.json<AuditLogResponse>({ entries: [], total: 0 }, 500);
  }
});

api.post('/decrement', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', -1);
  return c.json<DecrementResponse>({
    count,
    postId,
    type: 'decrement',
  });
});