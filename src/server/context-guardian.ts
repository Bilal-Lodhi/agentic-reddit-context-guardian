import { assertT1 } from '@devvit/shared';
import { reddit } from '@devvit/web/server';
import type { OnCommentCreateRequest } from '@devvit/web/shared';

type ModerationApiResponse = {
  violatesRules: boolean;
  reason: string;
};

const MODERATION_API_ENDPOINT = 'https://api.example.com/moderation/check';

async function checkCommentForViolations(
  commentBody: string,
): Promise<ModerationApiResponse> {
  const response = await fetch(MODERATION_API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: commentBody }),
  });

  if (!response.ok) {
    throw new Error(
      `Moderation API returned status ${response.status}: ${response.statusText}`,
    );
  }

  const data: ModerationApiResponse = await response.json();

  if (typeof data.violatesRules !== 'boolean') {
    throw new Error(
      'Moderation API response missing required field: violatesRules',
    );
  }
  if (typeof data.reason !== 'string') {
    throw new Error(
      'Moderation API response missing required field: reason',
    );
  }

  return data;
}

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
    const result = await checkCommentForViolations(commentBody);

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