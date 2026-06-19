import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

function isObjectiveTopic(topic: string): boolean {
  const t = topic.trim().toLowerCase();
  
  // starters for factual questions
  const starters = [
    'what is', 'what are', 'define', 'explain', 'where is', 'who is', 'who was',
    'how many', 'capital of', 'boiling point', 'scientific name', 'melting point',
    'formula of', 'when did', 'when was', 'formula for', 'how does', 'why is'
  ];
  
  if (starters.some(starter => t.startsWith(starter))) {
    return true;
  }
  
  // single words or short phrases that look like science/math/fact terms rather than a conversational post topic
  const factualKeywords = [
    'temperature', 'gravity', 'density', 'humidity', 'h2o', 'photosynthesis', 'speed of light', 'celsius', 'fahrenheit', 'kelvin'
  ];
  if (factualKeywords.some(kw => t.includes(kw)) && topic.length < 35) {
    return true;
  }
  
  // ends with question mark and starts with helping verb
  if (t.endsWith('?') && (t.startsWith('is ') || t.startsWith('are ') || t.startsWith('can ') || t.startsWith('does ') || t.startsWith('do '))) {
    return true;
  }
  
  return false;
}

function getMockWriteup(topic: string, isObj: boolean, isShortTopic: boolean): string {
  if (isObj) {
    if (topic.toLowerCase().includes('temperature')) {
      return "Temperature is a measure of standard hotness or coldness.";
    }
    return `Fact: ${topic.replace(/\?$/, '')} represents the standard physical measurement.`;
  }
  if (isShortTopic) {
    return `Honestly, ${topic} is one of those simple everyday things we over-complicate. Yaar, dekho, no need for fancy presentations here. Keep it real, keep it simple, and focus on execution. Why spend hours parsing theory? Let's just deal with it and move forward.`;
  }
  return `Most people treat ${topic} like some theoretical masterclass. Yaar, that's just laziness. If Nykaa or CRED waited for a perfect playbook, they'd still be in a PowerPoint slide. Let's build real things instead.\n\nCricket teaches you that you can't hit a six on a pitch you haven't stepped onto. You have to face the bouncers, play the shot, and learn on the fly. So what? Skip the jargon. Pick a metric that actually moves the needle, launch it by Tuesday, and let the market tell you if you're out or safe.\n\nThe clock is ticking, aur suno, are you ready to act or are we just play-acting?`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  const hasValidKey = typeof apiKey === 'string' && apiKey.trim().replace(/^['"]|['"]$/g, '').startsWith('AIzaSy');

  if (!hasValidKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not configured or is a placeholder. Rich mock offline models will be used automatically.");
  }

  const ai = new GoogleGenAI({
    apiKey: hasValidKey ? apiKey : "MOCK_KEY",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Route for Voice Pen-Writeup
  app.post("/api/writeup", async (req, res) => {
    try {
      const { topic, customInstructions } = req.body;
      if (!topic || typeof topic !== "string") {
        return res.status(400).json({ error: "Topic is required." });
      }

      const wordCount = topic.trim().split(/\s+/).length;
      const isShortTopic = wordCount <= 4 || topic.length < 22;
      const isObj = isObjectiveTopic(topic);

      const headerKey = req.headers['x-gemini-api-key'] || req.headers['authorization'];
      let activeApiKey = typeof headerKey === 'string' ? headerKey.replace('Bearer ', '').trim() : '';
      
      if (!activeApiKey) {
        activeApiKey = (process.env.GEMINI_API_KEY || '').trim();
      }

      const isKeyActive = typeof activeApiKey === 'string' && activeApiKey.trim().replace(/^['"]|['"]$/g, '').startsWith('AIzaSy');

      if (!isKeyActive) {
        return res.json({
          writeup: getMockWriteup(topic, isObj, isShortTopic),
          isMock: true
        });
      }

      const activeAi = new GoogleGenAI({
        apiKey: activeApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build-override',
          }
        }
      });

      let systemPrompt = "";

      if (isObj) {
        systemPrompt = `You are a helpful, extremely precise, and direct AI assistant.
The user is asking a purely objective, factual question.

Topic/Question: "${topic}"

STRICT FORMATTING REQUIREMENTS:
1. Answer the question completely point-to-point.
2. The entire response MUST be extremely crisp and direct.
3. It MUST consist of at least 5 words and at most 10 words total. No more, no less.
4. Output ONLY the plain text factual answer. Do NOT add any preamble, conversational greeting ("Sure!", "Yaar,"), surrounding quotes, markdown style like bold asterisks (**), lists, or bold label prefixes.

Answer:`;
      } else {
        const lengthGuideline = isShortTopic 
          ? `1. Exactly 1 short, single paragraph. No more, no less.\n2. Strictly under 75 words total.\n3. Make it highly crisp, direct, and focused. Avoid over-intellectualizing simple concepts.`
          : `1. Exactly 2 to 3 paragraphs. No more, no less.\n2. Strictly under 200 words total.`;

        systemPrompt = `You are Parshav Jain. Write a short personal, direct piece about the given topic. Use first-person pronoun ("I", "my") naturally.

Configure your output to strictly match Parshav's background and writing style constraints:

ABOUT PARSHAV (Your Profile):
- Product Manager with 10+ years of experience.
- Based in Ghaziabad, Delhi NCR.
- Focus areas: AI Product Management, OTT media, fintech.
- Always learning: Currently doing HelloPM's AI PM cohort.
- Passions: Cricket, Bollywood movie drama, stock markets.

WRITING STYLE RULES (Strictly Follow):
- Use short, punchy sentences. Followed by a longer sentence that adds depth or nuance.
- Always start directly with a bold opinion, provocative statement, or sharp observation.
- NEVER start with filler intros like "In today's world", "As a PM...", "In this era", etc.
- Use regional Indian examples where fitting: Zerodha, Zomato, CRED, Zee5, Nykaa.
- Mix in natural Hindi conversational markers: 'yaar', 'dekho', 'bilkul', 'aur suno'.
- Use cricket or Bollywood analogies to simplify or explain concepts (e.g., scoring a century, hitting a Yorker, dramatic movie dialogue, blockbuster hits vs flops).
- Ask "so what?" after an insight. Challenge the outcome: we want real impact, not high-level slide deck synergy.
- NEVER use corporate jargon: absolutely no "synergy", "leverage", "paradigm shift", "disruptive trajectory", "optimize customer delight". Keep it real, street-smart, and human.
- End with either a distinct provocative question OR a clear takeaway message, but never both in the same piece.

STRICT FORMATTING SPECIFICATION:
${lengthGuideline}
3. Plain text ONLY. Absolutely no markdown, no headings, no bold brackets or asterisks like **bold**, no numbers or bullet points.
4. Output ONLY the write-up message itself. Do not add any greeting, preamble ("Here is your piece:"), postscript, or surrounding quotes. 

Topic: ${topic}
${customInstructions ? `Additional Context/Vibe check: ${customInstructions}` : ""}`;
      }

      let response;
      try {
        response = await activeAi.models.generateContent({
          model: "gemini-2.5-flash",
          contents: systemPrompt,
          config: {
            temperature: 0.88,
            ...(isObj ? { tools: [{ googleSearch: {} }] } : {})
          }
        });
      } catch (err25: any) {
        const errMsg = String(err25?.message || '').toLowerCase();
        if (err25?.status === 503 || msgIsTransient(errMsg)) {
          console.warn("gemini-2.5-flash is temporarily overloaded or unavailable. Retrying with gemini-2.0-flash...");
          try {
            response = await activeAi.models.generateContent({
              model: "gemini-2.0-flash",
              contents: systemPrompt,
              config: {
                temperature: 0.88,
                ...(isObj ? { tools: [{ googleSearch: {} }] } : {})
              }
            });
          } catch (err20: any) {
            throw err20;
          }
        } else {
          throw err25;
        }
      }

      function msgIsTransient(str: string) {
        return str.includes("503") || 
               str.includes("unavailable") || 
               str.includes("rate limit") || 
               str.includes("high demand") || 
               str.includes("quota") ||
               str.includes("overloaded");
      }

      const writeup = (response.text || "").trim();
      res.json({ writeup, isMock: false });
    } catch (err: any) {
      console.error("Gemini writeup generation error:", err);
      // Fail gracefully to avoid hard crashes for the user
      return res.json({
        writeup: getMockWriteup(topic, isObj, isShortTopic),
        isMock: true,
        apiError: err.message || "Failed to generate text."
      });
    }
  });

  // API Route for Text-to-Speech using Murf AI
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceId, style, model } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text parameter is required for speech synthesis." });
      }

      const activeVoiceId = voiceId || 'Samar';
      const activeStyle = style || 'Conversational';
      const activeModel = model || 'GEN2';

      const finalVoiceId = activeVoiceId === 'Samar' ? 'en-IN-samar' : activeVoiceId;
      const isFalcon = activeModel.toLowerCase().includes('falcon') || finalVoiceId === 'en-IN-samar';
      const finalModel = isFalcon 
        ? (activeModel.toLowerCase().includes('falcon') 
            ? (activeModel.toLowerCase() === 'falcon' ? 'falcon-2' : activeModel) 
            : 'falcon-2')
        : activeModel;

      // Try reading Murf API Key from headers (UI key inputs), fallback to environment variables
      const headerMurfKey = req.headers['x-murf-api-key'];
      let murfApiKey = typeof headerMurfKey === 'string' ? headerMurfKey.trim() : '';
      
      if (!murfApiKey) {
        murfApiKey = (process.env.MURF_API_KEY || '').trim();
      }

      const hasValidKey = (() => {
        if (!murfApiKey) return false;
        const k = murfApiKey.toLowerCase();
        return (
          k !== "" &&
          k !== "my_murf_api_key" &&
          k !== "your_murf_api_key" &&
          k !== "mock_key" &&
          k !== "undefined" &&
          k !== "null" &&
          !k.includes("placeholder")
        );
      })();

      if (!hasValidKey) {
        return res.status(400).json({ error: "Murf API Key required for Text-to-Speech audio synthesis. Please configure it in your ⚙️ API Configuration." });
      }

      // 1. Authenticate and obtain short-lived session token
      const tokenResponse = await fetch('https://api.murf.ai/v1/auth/token', {
        method: 'GET',
        headers: {
          'api-key': murfApiKey,
        }
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        return res.status(tokenResponse.status).json({ 
          error: `Murf authentication failed: ${errBody || 'invalid API key'}` 
        });
      }

      const tokenData = await tokenResponse.json();
      const authToken = tokenData.token || tokenData.accessToken || tokenData.authToken;
      if (!authToken) {
        return res.status(502).json({ 
          error: `Could not fetch auth token from Murf session: ${JSON.stringify(tokenData)}` 
        });
      }

      // 2. Generate speech stream with specified voice parameters
      let audioChunks: string[] = [];
      let audioUrl = '';

      if (isFalcon) {
        const splitIntoSentences = (t: string): string[] => {
          const matches = t.match(/[^.!?]+([.!?]+|$)/g) || [t];
          return matches.map(s => s.trim()).filter(s => s.length > 2);
        };

        const sentences = splitIntoSentences(text);
        for (const sentence of sentences) {
          const res = await fetch('https://api.murf.ai/v1/speech/stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': authToken,
            },
            body: JSON.stringify({
              voiceId: finalVoiceId,
              text: sentence,
              model: finalModel
            })
          });

          if (!res.ok) {
            const errMsg = await res.text();
            throw new Error(errMsg || `Status ${res.status}`);
          }

          const buf = await res.arrayBuffer();
          audioChunks.push(Buffer.from(buf).toString('base64'));
        }
      } else {
        const generateResponse = await fetch('https://api.murf.ai/v1/speech/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': authToken,
          },
          body: JSON.stringify({
            voiceId: finalVoiceId,
            text: text,
            style: activeStyle,
            modelVersion: finalModel
          })
        });

        if (!generateResponse.ok) {
          const errBody = await generateResponse.text();
          return res.status(generateResponse.status).json({ 
            error: `Murf generation failed: ${errBody}` 
          });
        }

        const generateData = await generateResponse.json();
        audioUrl = generateData.audioUrl || generateData.audio_url || generateData.url;
        if (!audioUrl) {
          return res.status(502).json({ 
            error: `No audio URL returned from Murf speech synthesis.` 
          });
        }

        // Download the audio file and convert it into base64 to keep client compatibility
        const fileResponse = await fetch(audioUrl);
        if (!fileResponse.ok) {
          return res.status(502).json({ error: `Failed to download audio resource: ${audioUrl}` });
        }

        const arrayBuffer = await fileResponse.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString('base64');
        audioChunks = [base64Audio];
      }

      res.json({ audioChunks, base64Audio: audioChunks[0] || '', audioUrl });
    } catch (err: any) {
      console.error("Murf TTS generator error:", err);
      res.status(500).json({ error: err.message || "Speech synthesis failed." });
    }
  });

  // API Route to save keys to server .env
  app.post("/api/save-keys", async (req, res) => {
    try {
      const { geminiApiKey, murfApiKey } = req.body;
      const fs = await import("fs");
      const path = await import("path");
      
      let envContent = "";
      if (geminiApiKey) {
        envContent += `GEMINI_API_KEY="${geminiApiKey}"\n`;
        process.env.GEMINI_API_KEY = geminiApiKey;
      }
      if (murfApiKey) {
        envContent += `MURF_API_KEY="${murfApiKey}"\n`;
        process.env.MURF_API_KEY = murfApiKey;
      }
      
      fs.writeFileSync(path.join(process.cwd(), ".env"), envContent);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to save keys to .env:", err);
      res.status(500).json({ error: err.message || "Failed to save keys." });
    }
  });

  // API Route to retrieve server-configured keys on startup
  app.get("/api/get-keys", (req, res) => {
    res.json({
      geminiApiKey: process.env.GEMINI_API_KEY || "",
      murfApiKey: process.env.MURF_API_KEY || ""
    });
  });

  // Handle Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false 
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start full-stack server:", err);
});
