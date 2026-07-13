// Using correct Node.js http response methods
console.log('[MODULE] Module execution started');

module.exports = (req, res) => {
  console.log('[HANDLER] Request received:', req.method, req.url);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
  console.log('[HANDLER] Response sent');
};

console.log('[MODULE] Module execution completed');