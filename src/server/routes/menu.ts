import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, redis, reddit } from '@devvit/web/server';
import { createPost } from '../core/post';

/** Redis key storing the persistent audit log post ID for this subreddit. */
const AUDIT_POST_KEY = 'audit:post:id';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

menu.post('/audit-log', async (c) => {
  try {
    // Reuse an existing audit post if one was already created for this subreddit.
    let postId = await redis.get(AUDIT_POST_KEY);

    if (!postId) {
      // Create the persistent audit log post (first time only).
      const post = await reddit.submitCustomPost({
        title: 'Context Guardian — Audit Log',
        entry: 'audit',
      });
      postId = post.id;
      // Persist so future clicks go to the same post.
      await redis.set(AUDIT_POST_KEY, postId);
    }

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${postId}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error opening audit log: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to open audit log',
      },
      400
    );
  }
});
