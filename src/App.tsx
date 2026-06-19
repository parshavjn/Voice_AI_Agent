import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  Play, 
  Volume2, 
  Copy, 
  Check, 
  RotateCcw, 
  FileText, 
  Flame, 
  VolumeX, 
  AlertCircle,
  HelpCircle,
  Settings
} from 'lucide-react';

export default function App() {
  const [topic, setTopic] = useState('');
  const [writeup, setWriteup] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedVoice] = useState<'Samar'>('Samar');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isMockResponse, setIsMockResponse] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [murfApiKey, setMurfApiKey] = useState(() => localStorage.getItem('murf_api_key') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [murfVoiceId, setMurfVoiceId] = useState(() => localStorage.getItem('murf_voice_id') || 'Samar');
  const [murfStyle, setMurfStyle] = useState(() => localStorage.getItem('murf_style') || 'Conversational');
  const [murfModel, setMurfModel] = useState(() => localStorage.getItem('murf_model') || 'Falcon');
  
  const [recentGenerations, setRecentGenerations] = useState<Array<{ topic: string, writeup: string, date: string }>>([
    {
      topic: 'CRED vs Zerodha',
      writeup: "Zerodha spent zero rupees on TV commercials last year. CRED probably spent half their series funding renting out retired cricketers to behave badly on screen. Yaar, that is the difference between a high-fructose buzz and a real cash engine. \n\nAt the end of the day, product managers obsess about user signups and viral loops. But so what? If your customer acquisition cost is higher than your lifetime value, you are not running a tech startup—you are just funding an expensive creative agency at the customer's expense. Look at the balance sheet; aur suno, numbers never lie.",
      date: 'Just now'
    }
  ]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Run generation
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setIsLoading(true);
    setWriteup('');
    setAudioError(null);
    setIsListening(false);
    
    if (audioRef.current) {
      audioRef.current.pause();
    }

    try {
      const response = await fetch('/api/writeup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(geminiApiKey ? { 'x-gemini-api-key': geminiApiKey } : {}),
        },
        body: JSON.stringify({
          topic: topic,
          customInstructions: '',
        }),
      });

      if (!response.ok) {
        throw new Error('Server returned an error. Make sure your GEMINI_API_KEY is configured.');
      }

      const data = await response.json();
      setWriteup(data.writeup);
      setIsMockResponse(!!data.isMock);
      
      // Save to recent list
      setRecentGenerations(prev => [
        { topic: topic, writeup: data.writeup, date: 'New' },
        ...prev.slice(0, 4)
      ]);
    } catch (error: any) {
      console.error(error);
      setWriteup(`Error generating write-up: ${error.message}. Please configure your GEMINI_API_KEY secret and try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Play output text using Gemini TTS Synthesis API
  const handleHearInVoice = async () => {
    if (!writeup || isListening) return;
    setIsListening(true);
    setAudioError(null);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(murfApiKey ? { 'x-murf-api-key': murfApiKey } : {}),
        },
        body: JSON.stringify({
          text: writeup,
          voiceName: selectedVoice,
          voiceId: murfVoiceId,
          style: murfStyle,
          model: murfModel,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned error status: ${response.status}`);
      }

      const runBrowserSpeechFallback = (textToSpeak: string, specificError?: string) => {
        if ('speechSynthesis' in window) {
          console.log('Running Web Speech API local fallback...');
          window.speechSynthesis.cancel();
          
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 1.05; 
          utterance.pitch = 0.95; 

          const voices = window.speechSynthesis.getVoices();
          const preferredVoice = voices.find(v => v.lang.startsWith('en-IN')) || 
                                 voices.find(v => v.lang.startsWith('en')) || 
                                 voices[0];
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }

          utterance.onend = () => {
             setIsListening(false);
          };
          utterance.onerror = () => {
            setIsListening(false);
          };

          window.speechSynthesis.speak(utterance);
          
          audioRef.current = {
            pause: () => window.speechSynthesis.cancel()
          } as any;
          
          setAudioError(specificError ? `TTS Fallback: ${specificError}` : "Playing via local Browser Text-to-Speech fallback.");
        } else {
          setAudioError(specificError ? `TTS Failed: ${specificError}` : 'Speech synthesis failed. Please try on Google Chrome/Safari or check your API Key.');
          setIsListening(false);
        }
      };

      const data = await response.json();
      const playUrl = data.audioUrl || (data.base64Audio ? `data:audio/mp3;base64,${data.base64Audio}` : null);
      
      if (playUrl) {
        // Clear any prior local speech synthesizer
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }

        if (audioRef.current && typeof audioRef.current.pause === 'function') {
          try {
            audioRef.current.pause();
          } catch {}
        }

        const audio = new Audio(playUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsListening(false);
        };

        audio.onerror = (e) => {
          console.error("Audio playback/decode failed:", e);
          runBrowserSpeechFallback(writeup, "Audio playback/decode failed");
        };

        audio.play().catch((playErr) => {
          console.warn("Direct play blocked by browser autoplay rules. Running local TTS fallback.", playErr);
          runBrowserSpeechFallback(writeup, "Direct play blocked by browser");
        });
      } else {
        runBrowserSpeechFallback(writeup, "No audio URL or base64 data returned from server");
      }
    } catch (error: any) {
      console.error("TTS Synthesis Error:", error);
      const errMsg = error.message || "Failed to load audio resource.";
      
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(writeup);
        utterance.rate = 1.05; 
        utterance.pitch = 0.95; 

        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith('en-IN')) || 
                               voices.find(v => v.lang.startsWith('en')) || 
                               voices[0];
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        utterance.onend = () => {
          setIsListening(false);
        };
        utterance.onerror = () => {
          setIsListening(false);
        };

        window.speechSynthesis.speak(utterance);
        
        audioRef.current = {
          pause: () => window.speechSynthesis.cancel()
        } as any;
        
        setAudioError(`TTS Error: ${errMsg}. Running local fallback.`);
      } else {
        setAudioError(`TTS Failed: ${errMsg}`);
        setIsListening(false);
      }
    }
  };

  // Pause speech
  const handleStopVoice = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsListening(false);
    }
  };

  // Copy plain text write-up
  const copyToClipboard = () => {
    if (!writeup) return;
    navigator.clipboard.writeText(writeup);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-rose-100 selection:text-rose-900 antialiased">
      {/* Decorative colored bar top */}
      <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500"></div>

      {/* Hero Header Area */}
      <header id="header-section" className="bg-white border-b border-slate-200 py-5 px-6 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Identity info as per style rules */}
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black tracking-tight text-xl shadow-md border border-slate-800">
              P
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-display text-slate-900 tracking-tight">Parshav's Voice Skill</h1>
                <span className="text-[10px] bg-rose-50 border border-rose-200 text-rose-600 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                  AI Personal Clone
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition shadow-2xs bg-white cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>⚙️ API Keys Setup</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Grid Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Controls, inputs (7 cols) */}
        <section id="control-column" className="lg:col-span-7 flex flex-col gap-6">

          {/* Generation Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex-1 flex flex-col justify-between">
            
            <form onSubmit={handleGenerate} className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                    <Flame className="h-4 w-4" />
                  </div>
                  <label htmlFor="topic-input" className="font-semibold text-slate-800 text-sm">Topic:</label>
                </div>
                {topic.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTopic('');
                      setWriteup('');
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Clear text
                  </button>
                )}
              </div>

              <textarea
                id="topic-input"
                className="w-full h-44 p-3.5 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent placeholder:text-slate-400 bg-slate-50 font-medium"
                placeholder="eg. Why CRED's advertising is brilliant art but absolute waste of money compared to Zerodha..."
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                }}
                required
              />

              <button
                type="submit"
                disabled={isLoading || !topic.trim()}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Channels opening, simulating Parshav's PM brain...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-400 fill-amber-400 animate-pulse" />
                    <span>Clone My Voice Draft Now</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <HelpCircle className="h-3 w-3" /> Uses original Gemini LLM system prompts configuration
              </span>
              <span>UTC Time: 2026-06-19</span>
            </div>

          </div>

        </section>

        {/* RIGHT COLUMN: Output display & Parshav Voice Model (5 cols) */}
        <section id="output-column" className="lg:col-span-5 flex flex-col gap-6">
          
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-full overflow-hidden">
            
            {/* Header */}
            <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 px-2.5 rounded-md bg-slate-900 text-white font-mono text-[10px] font-bold">
                  OUTPUT
                </div>
              </div>

              {writeup && (
                <button
                  onClick={copyToClipboard}
                  className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-2xs hover:bg-slate-50 transition"
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600 animate-scale" />
                      <span className="text-emerald-700 font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Draft</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Output Content */}
            <div className="p-6 flex-1 flex flex-col justify-between min-h-[300px]">
              {writeup ? (
                <div className="space-y-4">
                  
                  {/* Plain Text Wrapper as per instruction rule: NO MARKDOWN, NO HEADERS */}
                  <div className="text-slate-800 font-medium text-[15px] leading-relaxed whitespace-pre-line tracking-normal select-text">
                    {writeup}
                  </div>

                  {isMockResponse && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2 mt-4">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Offline Mock Notice:</span> Your Gemini API Key is waiting to be configured in your Secrets panel. We have simulated Parshav's exact voice utilizing pre-built heuristics for you.
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto text-slate-400">
                  <p className="text-xs leading-relaxed">
                    Enter a topic on the left to generate the draft.
                  </p>
                </div>
              )}

              {/* Synthesis Section using gemini-3.1-flash-tts-preview */}
              {writeup && (
                <div className="mt-8 pt-6 border-t border-slate-100 bg-slate-50/70 -mx-6 -mb-6 p-6">
                  <div className="flex flex-col gap-3">
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Volume2 className="h-4 w-4 text-slate-700" />
                        <h4 className="font-bold text-slate-800 text-xs text-rose-600 animate-pulse">🔥 Murf.ai Samar Voice Model Active</h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isListening ? (
                        <button
                          onClick={handleStopVoice}
                          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition duration-200 flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <VolumeX className="h-3.5 w-3.5" />
                          <span>Stop Voice Synthesis</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleHearInVoice}
                          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition duration-200 flex items-center justify-center gap-1.5 shadow-md"
                        >
                          <Play className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
                          <span>Hear in My AI Voice</span>
                        </button>
                      )}
                    </div>

                    {/* Speaking spectrum visualization helper */}
                    {isListening && (
                      <div className="flex items-center justify-center gap-1 py-1 bg-slate-900 text-white rounded-lg mt-1 h-8 animate-pulse text-[10px] font-mono tracking-wider">
                        <div className="h-2 w-1 bg-rose-500 rounded animate-bounce delay-100"></div>
                        <div className="h-4.5 w-1 bg-rose-400 rounded animate-bounce delay-150"></div>
                        <div className="h-3 w-1 bg-amber-400 rounded animate-bounce delay-200"></div>
                        <div className="h-5 w-1 bg-emerald-400 rounded animate-bounce delay-75"></div>
                        <div className="h-2 w-1 bg-rose-400 rounded animate-bounce delay-300"></div>
                        <span className="ml-2 uppercase text-xs text-slate-300 scale-95">SPEAKING WITH VOICE: SAMAR...</span>
                      </div>
                    )}

                    {audioError && (
                      <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 p-2 rounded-lg mt-1 font-semibold leading-relaxed">
                        TTS Hint: {audioError}
                      </div>
                    )}

                  </div>
                </div>
              )}

            </div>

          </div>

          {/* Recent/History Items */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h3 className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-3.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400"></span>
              Recent Draft History
            </h3>
            <div className="space-y-3">
              {recentGenerations.map((item, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setTopic(item.topic);
                    setWriteup(item.writeup);
                  }}
                  className="w-full text-left p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition flex items-start justify-between gap-3 bg-slate-50/20"
                >
                  <div className="overflow-hidden">
                    <span className="text-xs font-bold text-slate-800 block truncate">{item.topic}</span>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 leading-snug">{item.writeup}</p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0 self-center">
                    {item.date}
                  </span>
                </button>
              ))}
            </div>
          </div>

        </section>

      </main>

      {/* Elegant minimalist footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-6 mt-12 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto">
          <span>© 2026 Parshav Jain AI Voice Assistant — All rights preserved.</span>
        </div>
      </footer>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-2xl p-6 relative animate-scale-up">
            <h3 className="text-sm font-bold text-slate-950 mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-700" />
              ⚙️ API Configuration Settings
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  placeholder="Enter Gemini API Key"
                  value={geminiApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGeminiApiKey(val);
                    localStorage.setItem('gemini_api_key', val);
                  }}
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  Provide your own Gemini API Key to enable live queries (Google Search grounding is enabled for factual questions).
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Murf.ai API Key
                </label>
                <input
                  type="password"
                  placeholder="Enter Murf.ai API Key"
                  value={murfApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMurfApiKey(val);
                    localStorage.setItem('murf_api_key', val);
                  }}
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  Provide your Murf API Key to generate speech using the authentic, premium voice.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-2">
                <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1">
                  <span>Voice Settings</span>
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Voice ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Samar"
                      value={murfVoiceId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMurfVoiceId(val);
                        localStorage.setItem('murf_voice_id', val);
                      }}
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Voice Model
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Falcon"
                      value={murfModel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMurfModel(val);
                        localStorage.setItem('murf_model', val);
                      }}
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent font-medium"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Voice Style
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Conversational"
                      value={murfStyle}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMurfStyle(val);
                        localStorage.setItem('murf_style', val);
                      }}
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-all cursor-pointer"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
