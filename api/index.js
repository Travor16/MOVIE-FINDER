// Catch-all for unmatched routes - MUST come after all specific routes
app.use((req, res) => {
  console.log(`[unmatched] ${req.method} ${req.path} - sending 404`);
  res.status(404).json({ error: 'Not found' });
});