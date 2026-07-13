// Test if module loads at all
console.log('[MODULE] Module execution started');

// Most basic possible handler
module.exports = async (req, res) => {
  console.log('[HANDLER] Request received:', req.method, req.url);
  try {
    res.status(200).send('Hello from basic handler!');
    console.log('[HANDLER] Response sent');
  } catch (err) {
    console.log('[HANDLER] Error sending response:', err.message);
    res.status(500).send('Internal Server Error');
  }
};

console.log('[MODULE] Module execution completed');