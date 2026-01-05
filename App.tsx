
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import Button from './components/Button';
import VoiceSelector from './components/VoiceSelector';
import { GeminiTTSService } from './services/geminiTTS';
import { VoiceName, AudioState, AppTab } from './types';
import { MAX_CHUNK_SIZE, SAMPLE_RATE, VOICE_OPTIONS } from './constants';
import { decode, decodeAudioData, splitTextIntoChunks, createBlob } from './utils/audioUtils';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('tts');
  const [text, setText] = useState('');
  const [speechRate, setSpeechRate] = useState(1.0);
  const [voice, setVoice] = useState<VoiceName>(VoiceName.ZEPHYR);
  
  // Audio Playback State
  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    progress: 0,
    currentChunk: 0,
    totalChunks: 0,
    status: 'idle'
  });

  // Transcription State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');

  // Live Chat State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState<string[]>([]);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Refs for Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isStoppingRef = useRef(false);

  const initAudioContexts = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    }
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    if (outputAudioContextRef.current.state === 'suspended') outputAudioContextRef.current.resume();
  };

  const stopPlayback = useCallback(() => {
    isStoppingRef.current = true;
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {}
    }
    setAudioState(prev => ({ ...prev, isPlaying: false, status: 'idle', progress: 0 }));
  }, []);

  // --- TTS LOGIC ---
  const playChunk = async (chunkText: string, chunkIndex: number, total: number) => {
    if (isStoppingRef.current) return;
    setAudioState(prev => ({ ...prev, status: 'processing', currentChunk: chunkIndex + 1, totalChunks: total, progress: (chunkIndex / total) * 100 }));
    try {
      const service = new GeminiTTSService(process.env.API_KEY || '');
      const base64Data = await service.generateSpeech(chunkText, voice, speechRate);
      if (isStoppingRef.current) return;
      initAudioContexts();
      const ctx = audioContextRef.current!;
      const bytes = decode(base64Data);
      const audioBuffer = await decodeAudioData(bytes, ctx, SAMPLE_RATE, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      currentSourceRef.current = source;
      setAudioState(prev => ({ ...prev, status: 'playing', isPlaying: true }));
      return new Promise<void>((resolve) => {
        source.onended = () => {
          currentSourceRef.current = null;
          resolve();
        };
        source.start(0);
      });
    } catch (error) {
      setAudioState(prev => ({ ...prev, status: 'error', isPlaying: false }));
      throw error;
    }
  };

  const handleGenerateTTS = async () => {
    if (!text.trim()) return;
    isStoppingRef.current = false;
    const chunks = splitTextIntoChunks(text, MAX_CHUNK_SIZE);
    setAudioState({ isPlaying: true, progress: 0, currentChunk: 0, totalChunks: chunks.length, status: 'processing' });
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (isStoppingRef.current) break;
        await playChunk(chunks[i], i, chunks.length);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isStoppingRef.current) setAudioState(prev => ({ ...prev, isPlaying: false, status: 'idle', progress: 100 }));
    }
  };

  // --- TRANSCRIPTION LOGIC ---
  const handleTranscribe = async () => {
    if (isTranscribing) {
      setIsTranscribing(false);
      return;
    }
    
    try {
      setIsTranscribing(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
              parts: [
                { inlineData: { data: base64Audio, mimeType: 'audio/wav' } },
                { text: "Transcribe this audio accurately. If it's silent, say 'No speech detected'." }
              ]
            }
          });
          setTranscriptionResult(response.text || "No transcription available.");
          setIsTranscribing(false);
        };
      };

      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), 5000); // Record for 5 seconds
    } catch (err) {
      console.error(err);
      setIsTranscribing(false);
    }
  };

  // --- LIVE CHAT LOGIC ---
  const startLiveChat = async () => {
    try {
      initAudioContexts();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outCtx = outputAudioContextRef.current!;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: 'You are a helpful and charismatic AI assistant with a professional tone.',
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsLiveActive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg) => {
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outCtx.destination);
              source.addEventListener('ended', () => liveSourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              liveSourcesRef.current.add(source);
            }
            if (msg.serverContent?.interrupted) {
              liveSourcesRef.current.forEach(s => s.stop());
              liveSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
            if (msg.serverContent?.turnComplete) {
               // Optional: trigger state updates for transcription history
            }
          },
          onclose: () => setIsLiveActive(false),
          onerror: (e) => console.error(e),
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
    }
  };

  const stopLiveChat = () => {
    if (liveSessionRef.current) liveSessionRef.current.close();
    setIsLiveActive(false);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center bg-slate-50">
      <div className="w-full max-w-4xl space-y-8">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-xl mb-4">
            <i className="fa-solid fa-microphone-lines text-3xl"></i>
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight">Gemini Voice Studio</h1>
          <p className="text-slate-500 max-w-lg mx-auto text-lg">
            A comprehensive suite for pro-grade voice generation, transcription, and real-time interaction.
          </p>
        </header>

        {/* Tab Selection */}
        <div className="flex justify-center p-1 bg-slate-200/50 rounded-2xl w-fit mx-auto backdrop-blur-sm">
          <button 
            onClick={() => setActiveTab('tts')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'tts' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <i className="fa-solid fa-font mr-2"></i> Text to Speech
          </button>
          <button 
            onClick={() => setActiveTab('transcribe')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'transcribe' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <i className="fa-solid fa-ear-listen mr-2"></i> Transcription
          </button>
          <button 
            onClick={() => setActiveTab('live')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'live' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <i className="fa-solid fa-headset mr-2"></i> Live Chat
          </button>
        </div>

        <main className="bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden min-h-[500px]">
          {activeTab === 'tts' && (
            <div className="p-6 md:p-8 space-y-8">
              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <i className="fa-solid fa-user-tie text-blue-500"></i> Select Voice
                </label>
                <VoiceSelector selectedVoice={voice} onSelect={setVoice} disabled={audioState.isPlaying} />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <i className="fa-solid fa-gauge-high text-blue-500"></i> Speaking Rate ({speechRate}x)
                  </label>
                  <input 
                    type="range" min="0.5" max="2.0" step="0.1" 
                    value={speechRate} 
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    className="w-48 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    disabled={audioState.isPlaying}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <i className="fa-solid fa-keyboard text-blue-500"></i> Document Text
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste long text for processing..."
                  className="w-full h-48 p-5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all resize-none bg-slate-50 text-slate-700"
                  disabled={audioState.isPlaying}
                />
              </div>

              <div className="flex flex-col md:flex-row items-center gap-4">
                {audioState.isPlaying ? (
                  <Button variant="danger" onClick={stopPlayback} icon="fa-stop" className="w-full md:w-auto">Stop</Button>
                ) : (
                  <Button variant="primary" onClick={handleGenerateTTS} disabled={!text.trim()} icon="fa-play" className="w-full md:w-auto">Speak Now</Button>
                )}
                <div className="flex-1 w-full bg-slate-100 rounded-2xl p-4 flex items-center gap-4 h-14">
                  <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all shadow-[0_0_8px_rgba(59,130,246,0.6)]" style={{ width: `${audioState.progress}%` }} />
                  </div>
                  <span className="text-xs font-black text-slate-600 uppercase tracking-widest">{audioState.status === 'idle' ? 'Ready' : audioState.status}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transcribe' && (
            <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500">
              <div className="text-center space-y-4 p-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <div className={`w-24 h-24 mx-auto flex items-center justify-center rounded-full transition-all ${isTranscribing ? 'bg-red-500 animate-pulse text-white shadow-lg shadow-red-200' : 'bg-blue-600 text-white'}`}>
                  <i className={`fa-solid ${isTranscribing ? 'fa-microphone' : 'fa-microphone-slash'} text-4xl`}></i>
                </div>
                <h2 className="text-2xl font-bold text-slate-800">5s Rapid Transcription</h2>
                <p className="text-slate-500">Click to record. We'll capture your speech and use Gemini 3 Flash to convert it to text.</p>
                <Button 
                  variant={isTranscribing ? 'danger' : 'primary'} 
                  onClick={handleTranscribe} 
                  className="mx-auto"
                >
                  {isTranscribing ? "Recording..." : "Start Capturing"}
                </Button>
              </div>
              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-700">Output Result</label>
                <div className="w-full min-h-[150px] p-6 bg-slate-900 text-green-400 font-mono rounded-2xl border border-slate-800 shadow-inner overflow-y-auto">
                  {transcriptionResult || "// Waiting for input..."}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'live' && (
            <div className="p-6 md:p-8 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-800">Live API Conversation</h2>
                  <p className="text-slate-500">Engage in real-time, low-latency audio dialogue.</p>
                </div>
                {isLiveActive ? (
                  <Button variant="danger" onClick={stopLiveChat} icon="fa-phone-slash">End Session</Button>
                ) : (
                  <Button variant="primary" onClick={startLiveChat} icon="fa-phone">Start Calling</Button>
                )}
              </div>
              
              <div className="relative group">
                <div className={`w-full aspect-video rounded-3xl bg-slate-900 flex flex-col items-center justify-center overflow-hidden transition-all border-4 ${isLiveActive ? 'border-green-500 shadow-2xl shadow-green-200' : 'border-slate-800'}`}>
                   {isLiveActive ? (
                     <div className="flex gap-1 items-end h-24">
                        {[1,2,3,4,5,6,7,8].map(i => (
                          <div key={i} className="w-4 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s`, height: `${Math.random() * 80 + 20}%` }}></div>
                        ))}
                     </div>
                   ) : (
                     <i className="fa-solid fa-signal text-slate-700 text-6xl opacity-20"></i>
                   )}
                   <div className="mt-8 text-slate-400 font-mono text-sm tracking-widest uppercase">
                     {isLiveActive ? "Session Active - Zephyr Connected" : "Connection Idle"}
                   </div>
                </div>
              </div>

              <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl text-blue-800 text-sm">
                <i className="fa-solid fa-circle-info mr-2"></i>
                The Live API combines audio generation and reasoning for human-like conversational experiences.
              </div>
            </div>
          )}
        </main>

        <footer className="text-center text-slate-400 text-xs py-8">
          © 2025 Gemini Voice Studio • High Performance Voice Computation • Fully Responsive
        </footer>
      </div>
    </div>
  );
};

export default App;
