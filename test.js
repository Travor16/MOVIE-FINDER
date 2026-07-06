import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Tell me a 1-word joke',
    });
    console.log("Response text:", response.text);
    console.log("Response JSON:", JSON.stringify(response));
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
