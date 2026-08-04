'use client';

import * as React from 'react';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

// react-syntax-highlighter is the heaviest client dependency on docs pages —
// load it lazily so pages without code render nothing extra. This wrapper is
// the ONLY sanctioned way to render code; do not import the highlighter
// directly (it used to be imported ad hoc in 20 files).
const SyntaxHighlighter = dynamic(
  async () => {
    const [{ Prism }, { vscDarkPlus }] = await Promise.all([
      import('react-syntax-highlighter'),
      import('react-syntax-highlighter/dist/esm/styles/prism'),
    ]);
    function Highlighter({ language, code }: { language: string; code: string }) {
      return (
        <Prism
          language={language}
          style={vscDarkPlus}
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8125rem', background: '#0d0d15' }}
        >
          {code}
        </Prism>
      );
    }
    return Highlighter;
  },
  {
    loading: () => <pre className="m-0 overflow-x-auto p-4 font-mono text-[0.8125rem] text-zinc-300">…</pre>,
    ssr: false,
  },
);

export interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  /** Optional label shown in the header bar (filename, shell, endpoint…). */
  filename?: string;
}

export function CodeBlock({ code, language = 'bash', filename, className, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className={cn('overflow-hidden rounded-lg border border-border bg-[#0d0d15]', className)}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-xs text-zinc-400">{filename ?? language}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {
              /* clipboard unavailable */
            }
          }}
          className="rounded px-2 py-0.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100 cursor-pointer"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter language={language} code={code} />
      </div>
    </div>
  );
}
