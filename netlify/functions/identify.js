const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const reqBody = JSON.parse(event.body || "{}");
    const parts = reqBody.contents?.[0]?.parts || [];
    const textPart = parts.find(p => p.text);
    const imagePart = parts.find(p => p.inline_data);

    if (!textPart || !imagePart) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: { message: "Invalid request payload structure" } }) 
      };
    }

    // Direct, high-speed vision generation to bypass search grounding quota limits completely
    const response = await ai.models.generateContent({
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
    });

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type"
      },
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
    console.error('Identity core execution error:', error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: JSON.stringify({ error: { message: error.message || "Internal Analysis Error" } })
    };
  }
};