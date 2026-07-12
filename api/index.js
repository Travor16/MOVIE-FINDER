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

const handler = serverless(app);
export default handler;