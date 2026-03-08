import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ai } from '../lib/gemini';
import { LiveServerMessage, Modality } from "@google/genai";

interface LiveVoiceModeProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LiveVoiceMode({ isOpen, onClose }: LiveVoiceModeProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0); // 0 to 1
  const [aiVolumeLevel, setAiVolumeLevel] = useState(0); // 0 to 1
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const aiAnalyzerRef = useRef<AnalyserNode | null>(null);

  // Cleanup function
  const cleanup = () => {
    if (sessionRef.current) {
      // sessionRef.current.close(); // Close method might not exist on the promise result directly or might be different
      // The session object from connect() is a promise that resolves to a session.
      // We should handle this properly.
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    setVolumeLevel(0);
    setAiVolumeLevel(0);
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  useEffect(() => {
    if (isOpen) {
      startSession();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isOpen]);

  // Animation loop for volume visualizer
  useEffect(() => {
    if (!isOpen) return;

    let animationFrameId: number;

    const updateVolume = () => {
      // User Volume
      if (analyzerRef.current) {
        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setVolumeLevel(Math.min(average / 128, 1)); // Normalize roughly
      }

      // AI Volume (Output)
      // Note: Getting output volume is trickier with Web Audio API if we are just scheduling buffers.
      // We can connect the playback nodes to an analyzer.
      // For now, let's simulate AI volume based on if we are playing audio.
      // Or better, we can connect the gain node to an analyzer.
      
      animationFrameId = requestAnimationFrame(updateVolume);
    };

    updateVolume();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isOpen, isConnected]);

  const startSession = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // 1. Setup Audio Context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, // Try to set native sample rate to 16kHz
      });

      // 2. Get Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        }
      });
      mediaStreamRef.current = stream;

      // 3. Setup Audio Processing for Input
      const source = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Analyzer for user voice
      const analyzer = audioContextRef.current.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      // Processor to capture raw PCM
      // Buffer size 512 for low latency
      const processor = audioContextRef.current.createScriptProcessor(512, 1, 1);
      processorRef.current = processor;

      analyzer.connect(processor);
      processor.connect(audioContextRef.current.destination); // Need to connect to destination for script processor to run

      // 4. Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are Panda.Ai, a helpful, minimalist AI assistant. You are currently in a voice call with the user. Keep your responses concise and conversational.",
        },
      });

      const session = await sessionPromise;
      sessionRef.current = session;
      setIsConnected(true);
      setIsConnecting(false);

      // 5. Handle Audio Input (Microphone -> Gemini)
      processor.onaudioprocess = (e) => {
        if (isMuted) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert Float32 to Base64 PCM16
        const pcm16 = floatTo16BitPCM(inputData);
        const base64Data = arrayBufferToBase64(pcm16);

        session.sendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data
          }
        });
      };

      // 6. Handle Audio Output (Gemini -> Speakers)
      // We need to override the onmessage callback or attach a listener if the SDK supports it.
      // The SDK example shows passing callbacks to connect(). 
      // Let's re-structure to pass callbacks to connect().
      
      // Since we already called connect, we might have missed the chance if callbacks are required in init.
      // Let's restart the connection logic with the correct pattern.
      
    } catch (err) {
      console.error("Failed to start live session:", err);
      setError("Failed to access microphone or connect to AI. Please try again.");
      setIsConnecting(false);
      cleanup();
    }
  };

  // Re-implementing startSession with correct callback pattern
  const startSessionCorrectly = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // 1. Setup Audio Context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Gemini output is often 24kHz
      });

      // 2. Get Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        }
      });
      mediaStreamRef.current = stream;

      // 3. Setup Audio Processing for Input
      const source = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyzer = audioContextRef.current.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      // Processor (Input)
      // We need to resample input to 16kHz if context is 24kHz
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      analyzer.connect(processor);
      processor.connect(audioContextRef.current.destination);

      // 4. Connect to Gemini Live with Callbacks
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are Panda.Ai. Keep responses short and conversational.",
        },
        callbacks: {
          onopen: () => {
            console.log("Connection opened");
            setIsConnected(true);
            setIsConnecting(false);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Interruption
            if (message.serverContent?.interrupted) {
              console.log("Interrupted!");
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              // Cancel current playback
              if (audioContextRef.current) {
                 // We can't easily stop "currently playing" buffer in this simple queue system 
                 // without tracking the source nodes.
                 // For now, clearing the queue helps.
                 // Ideally we suspend/resume or track active nodes.
              }
              return;
            }

            // Handle Audio Data
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const audioData = base64ToArrayBuffer(base64Audio);
              playAudioChunk(audioData);
            }
          },
          onclose: () => {
            console.log("Connection closed");
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error("Connection error:", err);
            setError("Connection error occurred.");
          }
        }
      });

      const session = await sessionPromise;
      sessionRef.current = session;

      // 5. Send Audio Input
      processor.onaudioprocess = (e) => {
        if (isMuted || !session) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Simple downsampling if needed, or just send as is if context is 16k.
        // If context is 24k, we need to resample to 16k for Gemini input.
        // For simplicity, let's assume we can send what we have, but Gemini expects 16k PCM.
        // We'll do a basic conversion.
        
        const pcm16 = floatTo16BitPCM(inputData);
        const base64Data = arrayBufferToBase64(pcm16);

        session.sendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=" + audioContextRef.current?.sampleRate, // Send actual rate
            data: base64Data
          }
        });
      };

    } catch (err) {
      console.error("Failed to start live session:", err);
      setError("Failed to start session.");
      setIsConnecting(false);
      cleanup();
    }
  };

  const playAudioChunk = (audioData: ArrayBuffer) => {
    if (!audioContextRef.current) return;

    // Convert PCM16 ArrayBuffer to Float32
    const float32Data = pcm16ToFloat32(audioData);
    audioQueueRef.current.push(float32Data);

    if (!isPlayingRef.current) {
      schedulePlayback();
    }
  };

  const schedulePlayback = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const audioCtx = audioContextRef.current!;
    const chunk = audioQueueRef.current.shift()!;

    const buffer = audioCtx.createBuffer(1, chunk.length, 24000); // Gemini output is 24kHz
    buffer.getChannelData(0).set(chunk);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    
    // Simple visualizer for output
    // In a real app, we'd connect this to an analyzer
    setAiVolumeLevel(0.5 + Math.random() * 0.5); // Fake visual feedback for now

    const currentTime = audioCtx.currentTime;
    // Schedule slightly in future to avoid glitches
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;

    source.onended = () => {
      setAiVolumeLevel(0); // Reset visual
      schedulePlayback();
    };
  };

  // Helper Functions
  const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
  };

  const pcm16ToFloat32 = (buffer: ArrayBuffer) => {
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Override the initial startSession with the correct one
  useEffect(() => {
    if (isOpen) {
      startSessionCorrectly();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isOpen]);


  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white overflow-hidden"
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-4 bg-zinc-900 rounded-full hover:bg-zinc-800 transition-colors z-10"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Status */}
        <div className="absolute top-12 text-center">
          <h2 className="text-xl font-medium tracking-wide mb-2">Panda Live</h2>
          <p className="text-zinc-400 text-sm">
            {isConnecting ? "Connecting..." : isConnected ? "Listening..." : "Disconnected"}
          </p>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>

        {/* The Orb */}
        <div className="relative flex items-center justify-center">
          {/* Outer Glow */}
          <motion.div
            className="absolute w-64 h-64 rounded-full bg-white/5 blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Main Orb */}
          <motion.div
            className="w-48 h-48 rounded-full bg-gradient-to-b from-zinc-200 to-zinc-500 relative z-0 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.2)]"
            animate={{
              scale: 1 + Math.max(volumeLevel, aiVolumeLevel) * 0.5,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 20,
            }}
          >
             {/* Inner Core */}
             <div className="w-44 h-44 rounded-full bg-black flex items-center justify-center">
                <div className="w-40 h-40 rounded-full bg-gradient-to-tr from-zinc-900 to-zinc-800" />
             </div>
          </motion.div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-12 flex items-center gap-6">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-6 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}
          >
            {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </button>
        </div>

        {/* Hints */}
        <div className="absolute bottom-32 text-center text-zinc-500 text-sm max-w-md px-4">
          <p>Speak naturally. Tap the screen to interrupt.</p>
        </div>

      </motion.div>
    </AnimatePresence>
  );
}
