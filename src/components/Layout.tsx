import React, { useState, useRef, useEffect } from 'react';
import { Send, Menu, Plus, MessageSquare, Settings, User as UserIcon, StopCircle, Image as ImageIcon, X, Trash2, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ChatMessage } from './ChatMessage';
import { sendMessageToPanda, type ChatMessage as ChatMessageType } from '../lib/gemini';
import { ThemeToggle } from './ThemeToggle';
import { PandaIcon } from './PandaIcon';

import { LiveVoiceMode } from './LiveVoiceMode';

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isLiveModeOpen, setIsLiveModeOpen] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
        setVoiceError(null);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setVoiceError('Microphone access denied. Please enable permissions.');
        } else if (event.error === 'no-speech') {
          setVoiceError('No speech detected. Please try again.');
        } else {
          setVoiceError('Voice input error. Please try again.');
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleVoiceInput = () => {
    setVoiceError(null);
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, selectedImage]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (messages.length === 0) return;
    
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      setMessages([]);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMessage: ChatMessageType = { 
      role: 'user', 
      text: input,
      image: selectedImage || undefined
    };
    
    setMessages(prev => [...prev, userMessage]);
    const currentImage = selectedImage;
    
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const controller = new AbortController();
    setAbortController(controller);

    try {
      let fullResponse = '';
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      await sendMessageToPanda(messages, input, currentImage, (chunk) => {
        if (controller.signal.aborted) return;
        fullResponse += chunk;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].text = fullResponse;
          return newMessages;
        });
      });
    } catch (error) {
      if (controller.signal.aborted) {
        console.log("Generation stopped by user");
      } else {
        console.error("Failed to send message", error);
      }
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        className={cn(
          "fixed md:relative z-30 h-full bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-all duration-300 ease-in-out",
          isSidebarOpen ? "w-[260px] translate-x-0" : "w-0 -translate-x-full md:w-0 md:-translate-x-0 overflow-hidden"
        )}
        initial={false}
      >
        <div className="p-4 flex-shrink-0">
          <button 
            onClick={() => setMessages([])}
            className="w-full flex items-center gap-2 px-4 py-3 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          <div className="px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Today
          </div>
          {/* Placeholder History Items */}
          {[1, 2, 3].map((i) => (
            <button key={i} className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-sm truncate flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <MessageSquare className="w-4 h-4 opacity-50" />
              Previous Conversation {i}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-sm">
            {userAvatar ? (
              <img src={userAvatar} alt="User" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                <UserIcon className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
              </div>
            )}
            <span>User Profile</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-sm">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative w-full">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-lg tracking-tight">Panda.Ai</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLiveModeOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-full text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Start Live Call
            </button>
            <button
              onClick={handleClearChat}
              className={cn(
                "p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors",
                messages.length > 0 ? "text-zinc-500 hover:text-red-500" : "text-zinc-300 dark:text-zinc-700 cursor-not-allowed"
              )}
              disabled={messages.length === 0}
              title="Clear Chat"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <ThemeToggle />
            {/* Model Selector Placeholder */}
            <div className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full text-xs font-medium">
              <span className="text-zinc-500">Model:</span>
              <span>Gemini Flash</span>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
                <PandaIcon className="w-12 h-12 text-zinc-900 dark:text-zinc-100" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Welcome to Panda.Ai</h1>
              <p className="text-zinc-500 max-w-md mb-8">
                Your minimalist AI assistant with <strong>Real-time Web Search</strong>. Ask me about current events, bamboo, or code.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full">
                {['What is the latest news today?', 'Stock price of Apple', 'Explain quantum physics like I am a panda', 'Write a Python script to sort a list'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      // Optional: auto-send
                    }}
                    className="p-4 text-left bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col pb-32 pt-4">
              {messages.map((msg, idx) => (
                <ChatMessage key={idx} role={msg.role} content={msg.text} image={msg.image} />
              ))}
              {isLoading && (
                <div className="flex w-full gap-4 p-6 max-w-3xl mx-auto">
                   <div className="w-8 h-8 bg-black dark:bg-white rounded-full flex items-center justify-center">
                      <PandaIcon className="w-5 h-5 text-white dark:text-black" />
                   </div>
                   <div className="flex items-center gap-1 h-8">
                      <motion.div
                        className="w-2 h-2 bg-zinc-400 rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                      />
                      <motion.div
                        className="w-2 h-2 bg-zinc-400 rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                      />
                      <motion.div
                        className="w-2 h-2 bg-zinc-400 rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                      />
                   </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent dark:from-zinc-950 dark:via-zinc-950 dark:to-transparent pt-10">
          <div className="max-w-3xl mx-auto relative">
            {isLoading && (
               <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                 <button 
                   onClick={handleStop}
                   className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full text-xs font-medium shadow-md hover:opacity-90 transition-opacity"
                 >
                   <StopCircle className="w-3.5 h-3.5" />
                   Stop generating
                 </button>
               </div>
            )}
            
            <div className="relative flex items-end gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg p-2 focus-within:ring-2 focus-within:ring-zinc-500/20 transition-shadow">
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 mb-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                title="Upload image"
                aria-label="Upload image"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              
              <button
                onClick={toggleVoiceInput}
                className={cn(
                  "p-3 mb-1 transition-colors",
                  isListening 
                    ? "text-red-500 animate-pulse" 
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
                title={isListening ? "Stop listening" : "Start voice input"}
                aria-label={isListening ? "Stop listening" : "Start voice input"}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              
              <div className="flex-1 min-w-0 flex flex-col">
                {selectedImage && (
                  <div className="relative w-fit mt-2 mb-1">
                    <img src={selectedImage} alt="Preview" className="h-20 w-auto rounded-lg border border-zinc-200 dark:border-zinc-700" />
                    <button 
                      onClick={removeImage}
                      className="absolute -top-2 -right-2 p-1 bg-black text-white rounded-full hover:bg-zinc-800 shadow-sm"
                      title="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Panda.Ai..."
                  className="w-full max-h-[200px] py-3 px-2 bg-transparent border-none focus:ring-0 resize-none text-base scrollbar-hide"
                  rows={1}
                />
              </div>

              <button
                onClick={handleSend}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className="p-2 mb-1 bg-black dark:bg-white text-white dark:text-black rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div className="text-center mt-2 h-5">
              {voiceError ? (
                <p className="text-xs text-red-500 animate-pulse">{voiceError}</p>
              ) : isListening ? (
                <p className="text-xs text-zinc-500 animate-pulse">Listening...</p>
              ) : (
                <p className="text-[10px] text-zinc-400">
                  Panda.Ai can make mistakes. Consider checking important information.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
