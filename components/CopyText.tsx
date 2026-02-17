"use client";

import { useState, useCallback } from "react";

interface CopyTextProps {
  text: string;
  display?: string;
  className?: string;
}

export function CopyText({ text, display, className = "" }: CopyTextProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.warn("Failed to copy to clipboard");
      }
    },
    [text]
  );

  return (
    <button
      onClick={handleCopy}
      className={`text-left underline decoration-foreground/20 hover:opacity-70 cursor-pointer ${className}`}
      title={text}
    >
      {copied ? "copied!" : (display ?? text)}
    </button>
  );
}
