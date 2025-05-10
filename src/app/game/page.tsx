'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import Combat from './components/Combat';
import ClickerGame from './components/ClickerGame';
import TanzaMode from './components/TanzaMode';
import JuluganMode from './components/JuluganMode';
import Leaderboard from './components/Leaderboard';
import Queue from './components/Queue';

export default function GamePage() {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<'combat' | 'flappy' | 'tanza' | 'julugan' | 'leaderboard'>('combat');
  const [opponent, setOpponent] = useState<any>(null);

  const handleMatchFound = (opponent: any) => {
    setOpponent(opponent);
  };

  const handleQueueUpdate = (isInQueue: boolean) => {
    // Handle queue status updates if needed
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-cyber-black text-white p-4">
        <div className="flex flex-col items-center justify-center min-h-screen">
          <h1 className="text-4xl font-press-start text-cyber-pink mb-8">
            Please log in to play the game.
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-black text-white p-4">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Game Title */}
        <div className="text-center">
          <h1 className="text-4xl font-press-start text-cyber-pink mb-4">
            Cyberpunk Game Hub
          </h1>
          <p className="text-cyber-blue font-press-start">
            Welcome, {user.displayName || 'Cyber Warrior'}!
          </p>
        </div>

        {/* Mode Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button
            onClick={() => setActiveMode('combat')}
            className={`p-6 rounded-lg font-press-start text-xl transition-all transform hover:scale-105 ${
              activeMode === 'combat'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Combat Arena
          </button>
          <button
            onClick={() => setActiveMode('flappy')}
            className={`p-6 rounded-lg font-press-start text-xl transition-all transform hover:scale-105 ${
              activeMode === 'flappy'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Flappy Bird
          </button>
          <button
            onClick={() => setActiveMode('tanza')}
            className={`p-6 rounded-lg font-press-start text-xl transition-all transform hover:scale-105 ${
              activeMode === 'tanza'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Tanza
          </button>
          <button
            onClick={() => setActiveMode('julugan')}
            className={`p-6 rounded-lg font-press-start text-xl transition-all transform hover:scale-105 ${
              activeMode === 'julugan'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Julugan
          </button>
          <button
            onClick={() => setActiveMode('leaderboard')}
            className={`p-6 rounded-lg font-press-start text-xl transition-all transform hover:scale-105 ${
              activeMode === 'leaderboard'
                ? 'bg-cyber-pink text-white'
                : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
            }`}
          >
            Leaderboard
          </button>
        </div>

        {/* Game Content */}
        <div className="bg-cyber-black rounded-lg p-6">
          {activeMode === 'combat' && (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1">
                <Combat />
              </div>
              <div className="w-full lg:w-80">
                <Queue onMatchFound={handleMatchFound} onQueueUpdate={handleQueueUpdate} />
              </div>
            </div>
          )}
          {activeMode === 'flappy' && (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1">
                <ClickerGame />
              </div>
              <div className="w-full lg:w-80">
                <Queue onMatchFound={handleMatchFound} onQueueUpdate={handleQueueUpdate} />
              </div>
            </div>
          )}
          {activeMode === 'tanza' && <TanzaMode />}
          {activeMode === 'julugan' && <JuluganMode />}
          {activeMode === 'leaderboard' && <Leaderboard />}
        </div>
      </div>
    </div>
  );
} 