import { useEffect, useState } from 'react';

import type { FC } from 'react';

import orbitDark from '@/assets/logo/orbit-dark.png';
import orbitLight from '@/assets/logo/orbit-light.png';

const GREETINGS = [
  'What are you working on?',
  'How can I help you today?',
  'Ready to build something?',
  'What would you like to create?',
  'Let\'s write some code',
];

export const WelcomeGreeting: FC = () => {
  // Pick random greeting on mount
  const [greetingIndex, setGreetingIndex] = useState(() =>
    Math.floor(Math.random() * GREETINGS.length)
  );
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setGreetingIndex((prev) => (prev + 1) % GREETINGS.length);
        setIsAnimating(false);
      }, 300);
    }, 12000);

    return () => { clearInterval(interval); };
  }, []);

  return (
    <div className="flex items-center justify-center gap-4 mb-8 select-none opacity-50">
      {/* Logo */}
      <div className="w-10 h-10 shrink-0">
        <img
          src={orbitLight}
          alt="Orbit"
          className="w-full h-full object-contain hidden dark:block"
        />
        <img
          src={orbitDark}
          alt="Orbit"
          className="w-full h-full object-contain dark:hidden"
        />
      </div>

      {/* Rotating Text */}
      <div className="h-10 overflow-hidden flex items-center">
        <p
          className={`text-3xl font-medium text-foreground transition-all duration-300 ease-out ${
            isAnimating
              ? 'opacity-0 translate-y-full'
              : 'opacity-100 translate-y-0'
          }`}
        >
          {GREETINGS[greetingIndex]}
        </p>
      </div>
    </div>
  );
};
