import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('Module loaded, starting app initialization...');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname); // one level up from api/

const app = express();
// Request logging middleware
app.use((req, res, next) => {
  console.log(`[middleware] ${req.method} ${req.path}`);
  next();
});
app.use(cors());
app.use(express.json({ limit: '50mb' }));

console.log('Middleware setup complete');

// Serve static files from project root (index.html, CSS, JS, images, etc.)
app.use(express.static(projectRoot, { dotfiles: 'ignore' }));
console.log('[middleware] Static file serving configured from:', projectRoot);

// Simple test endpoint
app.get('/test', (req, res) => {
  console.log('[test] endpoint hit');
  res.json({ message: 'test works' });
});

// Simple API endpoint to mirror your identify endpoint structure
app.post('/api/identify', (req, res) => {
  console.log('[api/identify] endpoint hit');
  res.json({
    title: 'Test Movie',
    year: 2023,
    type: 'MOVIE',
    confidence: 'HIGH',
    reason: 'This is a test response'
  });
});

console.log('Routes defined');

// SPA fallback: for any request that didn't match a static file or an API route, serve index.html
app.use((req, res) => {
  // If it's an API route that wasn't handled above, return 404
  if (req.path.startsWith('/api/')) {
    console.log(`[unmatched-API] ${req.method} ${req.path} - sending 404`);
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  // For all other routes, serve index.html (allows client-side routing)
  console.log(`[spa-fallback] ${req.method} ${req.path} - serving index.html`);
  res.sendFile(path.join(projectRoot, 'index.html'));
});

console.log('Routes defined');

const handler = serverless(app);
export default handler;