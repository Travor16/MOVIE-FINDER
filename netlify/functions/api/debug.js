export const handler = async (event, context) => {
  // Return non-sensitive env info for debugging
  const safeEnv = {
    NODE_ENV: process.env.NODE_ENV,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasGeminiKeys: !!process.env.GEMINI_KEYS,
    hasTmdbToken: !!process.env.TMDB_READ_TOKEN,
    hasWatchmodeKey: !!process.env.WATCHMODE_API_KEY,
    // Do NOT return actual values
  };
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safeEnv),
  };
};