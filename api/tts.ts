import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Setup CORS Headers for API-friendliness
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key, x-murf-api-key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed.' });
  }

  try {
    const { text, voiceId, style, model } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text parameter is required for TTS.' });
    }

    const activeVoiceId = voiceId || 'Samar';
    const activeStyle = style || 'Conversational';
    const activeModel = model || 'GEN2';

    const isFalcon = activeModel.toLowerCase().includes('falcon');
    const finalVoiceId = (!isFalcon && activeVoiceId === 'Samar') ? 'en-IN-samar' : activeVoiceId;

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
      return res.status(400).json({ error: 'Murf API Key required for Text-to-Speech audio synthesis. Please configure it in your ⚙️ API Configuration.' });
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
    let generateResponse;

    // 2. Generate speech stream with specified voice parameters
    let audioChunks: string[] = [];
    let audioUrl = '';

    if (isFalcon) {
      const splitIntoSentences = (t: string): string[] => {
        const matches = t.match(/[^.!?]+([.!?]+|$)/g) || [t];
        return matches.map(s => s.trim()).filter(s => s.length > 2);
      };

      const sentences = splitIntoSentences(text);
      const promises = sentences.map(async (sentence) => {
        const res = await fetch('https://api.murf.ai/v1/speech/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': authToken,
          },
          body: JSON.stringify({
            voiceId: finalVoiceId,
            text: sentence,
            model: activeModel.toLowerCase() === 'falcon' ? 'falcon-2' : activeModel
          })
        });

        if (!res.ok) {
          const errMsg = await res.text();
          throw new Error(errMsg || `Status ${res.status}`);
        }

        const buf = await res.arrayBuffer();
        return Buffer.from(buf).toString('base64');
      });

      audioChunks = await Promise.all(promises);
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
          modelVersion: activeModel
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

    return res.status(200).json({ audioChunks, base64Audio: audioChunks[0] || '', audioUrl });

  } catch (err: any) {
    console.error('Vercel serverless tts error:', err);
    return res.status(500).json({ error: err.message || 'TTS Synthesis failed.' });
  }
}
