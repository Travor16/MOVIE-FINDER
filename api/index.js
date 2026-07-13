import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';

console.log('Module loaded');

const app = express();
// Minimal middleware - just what we need for testing
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Simple test endpoint
app.get('/hello', (req, res) => {
  res.send('Hello World');
  return;
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('Hello from root');
  return;
});

// Catch-all for 404s
app.use((req, res) => {
  res.status(404).send('Not Found');
  return;
});

console.log('Routes defined');

const handler = serverless(app);
export default handler;