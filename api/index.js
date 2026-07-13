// Minimal response - just send text without status
console.log('[MODULE] Module execution started');

module.exports = (req, res) => {
  console.log('[HANDLER] Request received:', req.method, req.url);
  res.send('OK');
  console.log('[HANDLER] Response sent');
};

console.log('[MODULE] Module execution completed');