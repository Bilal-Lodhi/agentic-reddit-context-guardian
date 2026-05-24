// Re-export the Context Guardian Bot handler from its canonical location.
// This file is referenced as the entry point for the `onCommentCreate` trigger
// configured in devvit.json.

// The rootDir of tsconfig.server.json is src/server, so the trigger body
// lives at src/server/context-guardian.ts. We re-export here so that the
// build toolchain can resolve the import configured in devvit.json without
// crossing rootDir boundaries.

export { handleCommentCreate } from './server/context-guardian';