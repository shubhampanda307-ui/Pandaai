import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { User, Copy, Check } from 'lucide-react';
import { PandaIcon } from './PandaIcon';

interface MessageProps {
  role: 'user' | 'model';
  content: string;
  image?: string;
}

export function ChatMessage({ role, content, image }: MessageProps) {
  const isUser = role === 'user';
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      "flex w-full gap-4 p-6 text-base md:gap-6 md:max-w-3xl md:mx-auto",
      isUser ? "bg-white dark:bg-zinc-900" : "bg-zinc-50 dark:bg-zinc-950"
    )}>
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        isUser ? "bg-zinc-200 dark:bg-zinc-700" : "bg-black dark:bg-white"
      )}>
        {isUser ? (
          <User className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
        ) : (
          <PandaIcon className="w-5 h-5 text-white dark:text-black" />
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="font-semibold mb-1 opacity-90">
          {isUser ? 'You' : 'Panda.Ai'}
        </div>
        
        {image && (
          <div className="mb-4">
            <img 
              src={image} 
              alt="Uploaded content" 
              className="max-w-full sm:max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-700"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <div className="prose prose-zinc dark:prose-invert max-w-none leading-7">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <div className="relative group rounded-md overflow-hidden my-4">
                    <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 text-zinc-400 text-xs">
                      <span>{match[1]}</span>
                      <button
                        onClick={() => handleCopy(String(children).replace(/\n$/, ''))}
                        className="hover:text-white transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <SyntaxHighlighter
                      {...props}
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{ margin: 0, borderRadius: '0 0 0.375rem 0.375rem' }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code {...props} className={cn("bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm", className)}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
