// Super simple handler - no try/catch, just send response
console.log('[MODULE] Module execution started');

module.exports = async (req, res) => {
  console.log('[HANDLER] Request received:', req.method, req.url);
  res.status(200).send('Hello from basic handler!');
  console.log('[HANDLER] Response sent');
};

console.log('[MODULE] Module execution completed');