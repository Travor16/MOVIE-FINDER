// Handler with error catching to see what's going wrong
console.log('[MODULE] Module execution started');

module.exports = (req, res) => {
  console.log('[HANDLER] Request received:', req.method, req.url);
  try {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    console.log('[HANDLER] Response sent');
  } catch (err) {
    console.log('[HANDLER] Error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message, stack: err.stack }));
  }
};

console.log('[MODULE] Module execution completed');