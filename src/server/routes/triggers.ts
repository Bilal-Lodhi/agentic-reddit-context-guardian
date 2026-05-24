import { Hono } from 'hono';
import type { OnAppInstallRequest, OnCommentCreateRequest } from '@devvit/web/shared';
import type { TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
import { handleCommentCreate } from '../context-guardian';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();
    const { type } = await c.req.json<OnAppInstallRequest>();

    return c.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${type})`,
    } as TriggerResponse, 200);
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json({
      status: 'error',
      message: 'Failed to create post',
    } as TriggerResponse, 400);
  }
});

triggers.post('/on-comment-create', async (c) => {
  const input = await c.req.json<OnCommentCreateRequest>();
  const result = await handleCommentCreate(input);

  if (result.status === 'error') {
    return c.json(result as TriggerResponse, 400);
  }

  return c.json(result as TriggerResponse, 200);
});