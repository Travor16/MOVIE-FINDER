// Most basic possible handler - plain Node.js
module.exports = async (req, res) => {
  console.log('[handler] Request received:', req.method, req.url);
  res.status(200).send('Hello from basic handler!');
};