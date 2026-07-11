// Vercel serverless function entry point.
// Wraps the existing Express app (server.js) with serverless-http so all the
// /api/* routes and static file serving work on Vercel's serverless runtime.
import serverless from 'serverless-http';
import { app } from '../server.js';

// dotenv is loaded inside server.js (import 'dotenv/config'); env vars set in
// the Vercel dashboard are injected into process.env and picked up there.
export const handler = serverless(app);
