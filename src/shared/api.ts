export type InitResponse = {
  type: 'init';
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: 'increment';
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: 'decrement';
  postId: string;
  count: number;
};

// ---------------------------------------------------------------------------
// Audit log types
// ---------------------------------------------------------------------------

export type AuditEntry = {
  commentId: string;
  author: string;
  body: string;
  violatesRules: boolean;
  reason: string;
  evaluatedAt: string;
};

export type AuditLogResponse = {
  entries: Array<AuditEntry>;
  total: number;
};
