import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';

console.log('Module loaded, starting app initialization...');

const app = express();
// Simple middleware to test
app.use((req, res, next) => {
  console.log(`[middleware] ${req.method} ${req.path}`);
  next();
});
app.use(cors());
app.use(express.json({ limit: '50mb' }));

console.log('Middleware setup complete');

// Simple test endpoint - this should DEFINITELY work
app.get('/test', (req, res) => {
  console.log('[test] endpoint hit');
  res.json({ message: 'test works', timestamp: Date.now() });
});

// Simple API endpoint
app.post('/api/identify', (req, res) => {
  console.log('[api/identify] endpoint hit');
  res.json({
    title: 'Test Movie',
    year: 2023,
    type: 'MOVIE',
    confidence: 'HIGH',
    reason: 'This is a test response',
    timestamp: Date.now()
  });
});

// Root path handler - let's handle this explicitly to test
app.get('/', (req, res) => {
  console.log('[root] endpoint hit');
  res.send('Hello from root!');
});

// Catch-all for unmatched routes - MUST come after all specific routes
app.use((req, res) => {
  console.log(`[unmatched] ${req.method} ${req.path} - sending 404`);
  res.status(404).json({ error: 'Not found' });
});

console.log('Routes defined');

const handler = serverless(app);
export default handler;