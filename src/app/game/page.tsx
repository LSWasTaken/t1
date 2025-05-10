'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import Combat from './components/Combat';
import ClickerGame from './components/ClickerGame';
import Leaderboard from './components/Leaderboard';
import MatchHistory from './components/MatchHistory';
import TanzaMode from './components/TanzaMode';
import JuluganMode from './components/JuluganMode';

export default function GamePage() {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<'combat' | 'flappy' | 'tanza' | 'julugan'>('combat');

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-cyber-pink text-xl">Please log in to play</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-black text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-center space-x-4 mb-8">
          <button
            onClick={() => setActiveMode('combat')}
            className={`px-4 py-2 rounded-lg font-press-start ${
              activeMode === 'combat'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Combat
          </button>
          <button
            onClick={() => setActiveMode('flappy')}
            className={`px-4 py-2 rounded-lg font-press-start ${
              activeMode === 'flappy'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Flappy Bird
          </button>
          <button
            onClick={() => setActiveMode('tanza')}
            className={`px-4 py-2 rounded-lg font-press-start ${
              activeMode === 'tanza'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Tanza Mode
          </button>
          <button
            onClick={() => setActiveMode('julugan')}
            className={`px-4 py-2 rounded-lg font-press-start ${
              activeMode === 'julugan'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Julugan Mode
          </button>
        </div>

        {activeMode === 'combat' && <Combat />}
        {activeMode === 'flappy' && <ClickerGame />}
        {activeMode === 'tanza' && <TanzaMode />}
        {activeMode === 'julugan' && <JuluganMode />}
      </div>
    </div>
  );
} 