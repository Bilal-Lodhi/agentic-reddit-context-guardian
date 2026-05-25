// This file is the Devvit plugin entry point.
// All moderation logic lives in src/server/context-guardian.ts and is reached
// via Google Gemini 2.5 Flash (direct native API).
//
// Re-export the trigger handler so Devvit picks it up at build time.
export { handleCommentCreate } from './server/context-guardian';
