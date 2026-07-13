// Using callback style instead of async/await
console.log('[MODULE] Module execution started');

module.exports = (req, res) => {
  console.log('[HANDLER] Request received:', req.method, req.url);
  res.status(200).send('Hello from callback handler!');
  console.log('[HANDLER] Response sent');
};

console.log('[MODULE] Module execution completed');