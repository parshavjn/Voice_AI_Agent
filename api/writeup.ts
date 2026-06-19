import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Setup CORS Headers for API-friendliness
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed.' });
  }

  try {
    const { topic, customInstructions } = req.body || {};
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Topic parameter is required.' });
    }

    const wordCount = topic.trim().split(/\s+/).length;
    const isShortTopic = wordCount <= 4 || topic.length < 22;
    const isObj = isObjectiveTopic(topic);

    // Try reading from headers first (UI key inputs), then environment variables
    const headerKey = req.headers['x-gemini-api-key'] || req.headers['authorization'];
    let apiKey = typeof headerKey === 'string' ? headerKey.replace('Bearer ', '').trim() : '';
    
    if (!apiKey) {
      apiKey = (process.env.GEMINI_API_KEY || '').trim();
    }

    const hasValidKey = (() => {
      if (!apiKey) return false;
      const k = apiKey.toLowerCase();
      return (
        k !== "" &&
        k !== "my_gemini_api_key" &&
        k !== "your_gemini_api_key" &&
        k !== "mock_key" &&
        k !== "undefined" &&
        k !== "null" &&
        !k.includes("placeholder")
      );
    })();

    if (!hasValidKey) {
      return res.status(200).json({
        writeup: getMockWriteup(topic, isObj, isShortTopic),
        isMock: true
      });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-vercel',
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
      response = await ai.models.generateContent({
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
        console.warn("gemini-2.5-flash is temporarily overloaded. Retrying on gemini-2.0-flash...");
        try {
          response = await ai.models.generateContent({
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
    return res.status(200).json({ writeup, isMock: false });

  } catch (err: any) {
    console.error('Vercel serverless writeup error:', err);
    return res.status(200).json({
      writeup: getMockWriteup(topic, isObj, isShortTopic),
      isMock: true,
      apiError: err.message || 'Generation failed'
    });
  }
}
