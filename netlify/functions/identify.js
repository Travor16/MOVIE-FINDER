import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateWithRetry(payload, retries = 3, initialDelay = 3000) {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent({
        ...payload,
        config: {
          tools: [{ googleSearch: {} }],
          ...payload.config
        }
      });
    } catch (searchError) {
      const isRateLimit = searchError.status === 429 || searchError.statusCode === 429 ||
                          searchError.message?.includes('429') || searchError.message?.includes('Quota exceeded') ||
                          searchError.message?.includes('ResourceExhausted') || searchError.message?.includes('rate-limits');

      if (isRateLimit && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      try {
        return await ai.models.generateContent(payload);
      } catch (fallbackError) {
        const isFallbackRateLimit = fallbackError.status === 429 || fallbackError.statusCode === 429 ||
                                    fallbackError.message?.includes('429') || fallbackError.message?.includes('Quota exceeded') ||
                                    fallbackError.message?.includes('ResourceExhausted') || fallbackError.message?.includes('rate-limits');

        if (isFallbackRateLimit && i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        throw fallbackError;
      }
    }
  }
}

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const reqBody = JSON.parse(event.body || "{}");
    const parts = reqBody.contents?.[0]?.parts || [];
    const textPart = parts.find(p => p.text);
    const imagePart = parts.find(p => p.inline_data);

    if (!textPart || !imagePart) {
      return { statusCode: 400, body: JSON.stringify({ error: { message: "Invalid payload structure" } }) };
    }

    const payload = {
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: imagePart.inline_data.mime_type,
            data: imagePart.inline_data.data
          }
        },
        textPart.text
      ],
      config: {
        temperature: reqBody.generationConfig?.temperature ?? 0.1,
        maxOutputTokens: reqBody.generationConfig?.maxOutputTokens ?? 300
      }
    };

    const response = await generateWithRetry(payload);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: response.text
                }
              ]
            }
          }
        ]
      })
    };
  } catch (error) {
    let userFriendlyMessage = error.message;
    if (error.status === 429 || error.message?.includes('Quota exceeded')) {
      userFriendlyMessage = 'The server is currently busy. Please wait a few seconds and try again.';
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: userFriendlyMessage } })
    };
  }
};