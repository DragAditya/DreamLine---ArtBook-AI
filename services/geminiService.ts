import { GoogleGenAI, Type } from "@google/genai";

/**
 * Uses Gemini 3 Pro with Thinking Mode to generate a cohesive story outline.
 */
export const generateStoryScenes = async (
  childName: string,
  theme: string,
  pageCount: number,
  apiKey: string
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    You are a professional children's book author and illustrator. 
    Create a ${pageCount}-page outline for a coloring book for a child named "${childName}" based on the theme: "${theme}".
    
    The output must be a list of ${pageCount} distinct visual scene descriptions. 
    Each description must be optimized for an image generator to create a black and white coloring page.
    Focus on clear subjects, thick lines, and fun details.
    
    Example description: "A friendly dragon roasting a marshmallow, clear outline, simple background, coloring book style."
  `;

  try {
    // Attempt 1: Gemini 3 Pro with Thinking
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16000 }, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    });
    
    // Safety check for JSON parsing in case the model wraps it in markdown blocks
    const cleanText = (response.text || "[]").replace(/```json|```/g, '').trim();
    return JSON.parse(cleanText) as string[];

  } catch (error: any) {
    console.warn("Gemini 3 Pro Story Gen failed, falling back to Flash:", error);

    try {
      // Attempt 2: Gemini 2.5 Flash
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt + "\n Return ONLY a JSON array of strings.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      });

      const cleanText = (response.text || "[]").replace(/```json|```/g, '').trim();
      return JSON.parse(cleanText) as string[];
    } catch (fallbackError) {
      console.error("Story generation fallback failed:", fallbackError);
      return [];
    }
  }
};

/**
 * Uses Gemini 3 Pro Image Preview to generate the coloring pages.
 */
export const generateColoringPage = async (
  sceneDescription: string,
  artStyle: string,
  ageGroup: 'toddler' | 'kids' | 'expert' = 'kids',
  aspectRatio: string = "3:4",
  imageSize: '1K' | '2K' | '4K' = "1K",
  apiKey: string
): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey });

  let complexityPrompt = "";
  switch (ageGroup) {
    case 'toddler':
      complexityPrompt = "very simple outlines, large shapes, low detail, easy to color, thick bold lines, minimal background clutter, toddler friendly";
      break;
    case 'expert':
      complexityPrompt = "highly intricate details, fine lines, complex patterns, advanced composition, detailed background, mandala-like precision, adult coloring book style";
      break;
    case 'kids':
    default:
      complexityPrompt = "standard coloring book complexity, balanced detail, clear lines, engaging scene, suitable for ages 5-9";
      break;
  }

  // Inject the user-selected style and age complexity into the prompt
  const finalPrompt = `
    coloring book page, black and white line art, ${sceneDescription}.
    Style: ${artStyle}.
    Complexity Level: ${complexityPrompt}.
    Thick clean lines, white background, no shading, no grayscale, no color, 
    vector style, high contrast, ink drawing.
  `;

  // Helper to extract image
  const extractImage = (response: any) => {
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  };

  try {
    // Attempt 1: Gemini 3 Pro Image (High Quality)
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [{ text: finalPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: imageSize,
        },
      },
    });

    return extractImage(response);

  } catch (error: any) {
    console.warn("Gemini 3 Pro Image Gen failed, falling back to Flash:", error);
    
    try {
      // Attempt 2: Gemini 2.5 Flash Image
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [{ text: finalPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio, 
            // imageSize ignored
          },
        },
      });
      return extractImage(response);

    } catch (fallbackError) {
      console.error("Image generation fallback failed:", fallbackError);
      return null;
    }
  }
};

/**
 * Generates a random fun theme.
 */
export const generateRandomTheme = async (apiKey: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  try {
    const seed = Math.floor(Math.random() * 10000);
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate ONE creative, fun, and unique coloring book theme for a child. 
      Examples: "Space Dinosaurs", "Underwater Castle", "Robot Circus".
      Make it random and different every time. Seed: ${seed}.
      Return ONLY the theme title (max 5 words). Do not use quotes.`,
    });
    return response.text?.trim().replace(/^"|"$/g, '') || "Magical Forest Adventure";
  } catch (e) {
    return "Magical Forest Adventure";
  }
};

/**
 * Gets a list of creative suggestions.
 */
export const getThemeSuggestions = async (apiKey: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate 5 creative, distinct, and fun coloring book themes for children. 
      Return them as a JSON array of strings. 
      Example: ["Space Cats", "Jungle Party"].
      Return ONLY the JSON.`,
      config: { responseMimeType: "application/json" }
    });
    const cleanText = (response.text || "[]").replace(/```json|```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (e) {
    return ["Space Dinosaurs", "Underwater Kingdom", "Robot Olympics", "Magical Castle", "Super Hero Pets"];
  }
};

/**
 * Enhances an existing short prompt into something more descriptive.
 */
export const enhanceTheme = async (currentTheme: string, apiKey: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Enhance this coloring book theme to be more exciting and descriptive for a generative AI prompt. Keep it under 10 words. Theme: "${currentTheme}". Return ONLY the new text.`,
    });
    return response.text?.trim().replace(/^"|"$/g, '') || currentTheme;
  } catch (e) {
    return currentTheme;
  }
};

export const chatWithAssistant = async (
  history: { role: string; parts: { text: string }[] }[],
  newMessage: string,
  apiKey: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = "You are a helpful creative assistant for a coloring book app. Help users brainstorm themes and ideas for their children's books.";

  try {
    const chat = ai.chats.create({
      model: "gemini-2.5-flash", // Use Flash for chat to be snappy and cheap
      history: history,
      config: { systemInstruction }
    });
    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "";
  } catch (err) {
    console.error("Chat error:", err);
    return "Sorry, I'm having trouble connecting right now.";
  }
};