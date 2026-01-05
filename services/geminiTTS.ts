
import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";

export class GeminiTTSService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateSpeech(text: string, voice: VoiceName, rate: number = 1.0): Promise<string> {
    try {
      // Prompt based speed control as native speechConfig speed is not supported in the SDK prebuilt voice config
      const prompt = `Speak at ${rate}x speed: ${text}`;
      
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("No audio data received from Gemini API");
      }

      return base64Audio;
    } catch (error) {
      console.error("Gemini TTS Error:", error);
      throw error;
    }
  }
}
