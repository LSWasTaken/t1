'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import Combat from './components/Combat';
import ClickerGame from './components/ClickerGame';
import TanzaMode from './components/TanzaMode';
import JuluganMode from './components/JuluganMode';
import Leaderboard from './components/Leaderboard';

export default function GamePage() {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<'combat' | 'flappy' | 'tanza' | 'julugan' | 'leaderboard'>('combat');

  if (!user) {
    return (
      <div className="text-cyber-blue text-center">
        Please log in to play the game.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-black text-white p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Mode Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
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
          <button
            onClick={() => setActiveMode('leaderboard')}
            className={`px-4 py-2 rounded-lg font-press-start ${
              activeMode === 'leaderboard'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Leaderboard
          </button>
        </div>

        {/* Game Content */}
        <div className="bg-cyber-black rounded-lg p-4">
          {activeMode === 'combat' && <Combat />}
          {activeMode === 'flappy' && <ClickerGame />}
          {activeMode === 'tanza' && <TanzaMode />}
          {activeMode === 'julugan' && <JuluganMode />}
          {activeMode === 'leaderboard' && <Leaderboard />}
        </div>
      </div>
    </div>
  );
} 