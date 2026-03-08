import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini API client
// We use the environment variable provided by the platform
const apiKey = process.env.GEMINI_API_KEY;
export const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string; // base64 data URL
}

// Image Generation Function
export async function generateImage(prompt: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image generation failed:", error);
    return null;
  }
}

// Image Editing Function
export async function editImage(base64Image: string, prompt: string): Promise<string | null> {
  try {
    // Extract pure base64 data (remove data:image/png;base64, prefix)
    const base64Data = base64Image.split(',')[1];
    const mimeType = base64Image.substring(base64Image.indexOf(':') + 1, base64Image.indexOf(';'));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image editing failed:", error);
    return null;
  }
}

// Video Generation Function (Veo)
export async function generateVideo(prompt: string): Promise<string | null> {
  try {
    // Check for API key selection for Veo models
    if (typeof window !== 'undefined' && (window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
        return null; 
      }
    }

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p', 
        aspectRatio: '16:9'
      }
    });

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    
    if (downloadLink) {
        // Fetch the video content
        const response = await fetch(downloadLink, {
            method: 'GET',
            headers: {
                'x-goog-api-key': apiKey || '',
            },
        });
        
        if (response.ok) {
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        }
    }
    
    return null;

  } catch (error) {
    console.error("Video generation failed:", error);
    return null;
  }
}

export async function sendMessageToPanda(
  history: ChatMessage[],
  newMessage: string,
  newImage: string | null,
  onStream: (chunk: string) => void
) {
  if (!apiKey) {
    throw new Error("Gemini API Key is missing.");
  }

  try {
    // Check for image generation keywords
    const imageKeywords = ['generate image', 'create image', 'draw', 'make a picture', 'generate a picture'];
    const isImageRequest = imageKeywords.some(keyword => newMessage.toLowerCase().includes(keyword));

    // Check for image editing keywords (requires an input image)
    const editKeywords = ['edit', 'change background', 'remove background', 'replace', 'add to image', 'modify', 'change the background'];
    const isEditRequest = newImage && editKeywords.some(keyword => newMessage.toLowerCase().includes(keyword));

    // Check for video generation keywords
    const videoKeywords = ['generate video', 'create video', 'make a video'];
    const isVideoRequest = videoKeywords.some(keyword => newMessage.toLowerCase().includes(keyword));

    if (isEditRequest && newImage) {
      onStream("🎨 Editing image... please wait.");
      const editedImageUrl = await editImage(newImage, newMessage);
      if (editedImageUrl) {
        onStream(`\n\n![Edited Image](${editedImageUrl})`);
      } else {
        onStream("\n\nSorry, I couldn't edit the image at this time.");
      }
      return;
    }

    if (isImageRequest) {
      onStream("🎨 Generating image... please wait.");
      const imageUrl = await generateImage(newMessage);
      if (imageUrl) {
        onStream(`\n\n![Generated Image](${imageUrl})`);
      } else {
        onStream("\n\nSorry, I couldn't generate the image at this time.");
      }
      return;
    }

    if (isVideoRequest) {
      onStream("🎥 Generating video... this may take a minute.");
      const videoUrl = await generateVideo(newMessage);
      if (videoUrl) {
         onStream(`\n\nHere is your video:\n\n<video controls src="${videoUrl}" class="w-full rounded-lg max-h-96"></video>`);
      } else {
         onStream("\n\nSorry, I couldn't generate the video. Please ensure you have selected a paid API key for video generation.");
      }
      return;
    }

    const model = "gemini-3-flash-preview"; 
    
    console.log("Using model:", model);
    console.log("API Key present:", !!apiKey);
    
    // Construct history for the chat session
    // Note: For simplicity and robustness, we might only send text history 
    // and the current image, as maintaining image history can be heavy/complex 
    // depending on token limits, but Gemini handles it well.
    // We will try to include previous images if they exist.
    const formattedHistory = history.map(msg => {
      const parts: any[] = [{ text: msg.text }];
      if (msg.image) {
        // Extract base64 data and mime type
        const match = msg.image.match(/^data:(.+);base64,(.+)$/);
        if (match) {
           parts.push({
             inlineData: {
               mimeType: match[1],
               data: match[2]
             }
           });
        }
      }
      return {
        role: msg.role,
        parts: parts,
      };
    });

    const chat = ai.chats.create({
      model: model,
      config: {
        systemInstruction: "You are Panda.Ai, a helpful, minimalist, and intelligent AI assistant. Your persona is calm, friendly, and precise. You love bamboo and occasionally make subtle panda references. You answer questions clearly and concisely using Markdown formatting. You can also analyze images if provided.",
      },
      history: formattedHistory,
    });

    // Prepare current message parts
    const currentParts: any[] = [{ text: newMessage }];
    if (newImage) {
        const match = newImage.match(/^data:(.+);base64,(.+)$/);
        if (match) {
            currentParts.push({
                inlineData: {
                    mimeType: match[1],
                    data: match[2]
                }
            });
        }
    }

    // Use sendMessageStream with the parts
    // The SDK expects 'message' to be a string or parts. 
    // For @google/genai, chat.sendMessageStream takes { message: ... }
    // If we have multiple parts (text + image), we pass them as content.
    // Actually, looking at the SDK docs provided in context:
    // chat.sendMessageStream({ message: "..." })
    // It seems chat.sendMessageStream might strictly take a string 'message' in some versions, 
    // or we might need to use `contents` if it supports it, OR we might need to use `generateContentStream` 
    // if we want to be stateless, but we want state (chat).
    
    // Let's check the provided docs again.
    // "chat.sendMessageStream only accepts the message parameter, do not use contents."
    // This implies chat.sendMessageStream might NOT support multimodal inputs easily if it only takes a string.
    // However, usually 'message' can be a string or an array of parts.
    // Let's try passing the parts array as 'message' (casted if needed) or check if we should use `generateContentStream` with full history manually.
    
    // If chat.sendMessageStream only accepts string, we might be limited.
    // But the docs say: "Generate content with multiple parts... const response = await ai.models.generateContent..."
    // For Chat, it says: "let response = await chat.sendMessageStream({ message: "Tell me a long story." });"
    
    // If I cannot pass image to chat.sendMessageStream, I might have to use `ai.models.generateContentStream` 
    // and manage history manually (which I am already doing partially by mapping it).
    
    // Let's try to use `ai.models.generateContentStream` for the actual call, passing the full history + new message.
    
    const allContents = [
        ...formattedHistory,
        {
            role: 'user',
            parts: currentParts
        }
    ];

    const result = await ai.models.generateContentStream({
      model: model,
      contents: allContents as any, // Cast to avoid strict type issues if mismatch
      config: {
        systemInstruction: "You are Panda.Ai, a helpful, minimalist, and intelligent AI assistant. You are the user's smart and friendly AI companion. While your name is Panda, you are NOT a real animal. Do NOT make constant references to bamboo, eating leaves, or being a bear. Speak naturally, professionally, and warmly like a good friend. You answer questions clearly and concisely using Markdown formatting. You can also analyze images if provided. You have access to Google Search to provide real-time, up-to-date information when the user asks about current events or facts.",
        tools: [{ googleSearch: {} }],
      }
    });

    for await (const chunk of result) {
      const text = chunk.text;
      if (text) {
        onStream(text);
      }
    }
  } catch (error) {
    console.error("Error communicating with Panda.Ai:", error);
    throw error;
  }
}
