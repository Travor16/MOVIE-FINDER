const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async (event, context) => {
  // Handle CORS preflight requests cleanly
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
        body: JSON.stringify({ error: { message: "Invalid request payload structure." } }) 
      };
    }

    // Direct vision analysis
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
    // Log the true error to your internal Netlify console so you can audit it privately
    console.error('Core backend execution failure:', error);

    // Hardened Error Firewall: Determine the error nature without leaking text strings
    let clientMessage = "Scene analysis failed. Please try again with a different screenshot.";
    
    const errorStr = (error.message || "").toLowerCase();
    if (error.status === 429 || errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("exhausted")) {
      clientMessage = "Our verification channels are currently packed with traffic! Please wait a few seconds and try again.";
    }

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: JSON.stringify({ 
        error: { 
          message: clientMessage 
        } 
      })
    };
  }
};