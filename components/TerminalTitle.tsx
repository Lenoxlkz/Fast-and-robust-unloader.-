'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useI18n } from './I18nProvider';

export function TerminalTitle() {
  const { t } = useI18n();
  const text = t('appTitle');
  const [displayedLength, setDisplayedLength] = useState(0);

  useEffect(() => {
    let current = 0;
    const timer = setInterval(() => {
      current++;
      setDisplayedLength(current);
      if (current >= text.length) {
        clearInterval(timer);
      }
    }, 60);

    return () => {
      clearInterval(timer);
    };
  }, [text]);

  const displayedText = text.slice(0, displayedLength);

  return (
    <div className="flex items-center justify-center text-center whitespace-nowrap text-xl sm:text-2xl md:text-3xl font-bold font-mono tracking-tight text-white mb-2 select-none">
      <span className="text-emerald-500 mr-2 sm:mr-2.5 shrink-0">~</span>
      <span className="text-emerald-400 mr-1.5 sm:mr-2 shrink-0">/</span>
      <span className="bg-gradient-to-r from-white via-white/95 to-white/70 bg-clip-text text-transparent truncate">
        {displayedText}
      </span>
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        className="inline-block w-2 sm:w-2.5 h-5 sm:h-7 bg-emerald-400 ml-1.5 translate-y-0.5 shrink-0"
      />
    </div>
  );
}
