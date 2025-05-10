'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import ClickerGame from '@/app/game/components/ClickerGame';
import Combat from '@/app/game/components/Combat';
import Queue from '@/app/game/components/Queue';
import Leaderboard from '@/app/game/components/Leaderboard';
import Profile from '@/app/game/components/Profile';
import MatchHistory from '@/app/game/components/MatchHistory';
import JuluganMode from '@/app/game/components/JuluganMode';
import TanzaMode from '@/app/game/components/TanzaMode';
import FlappyBird from '@/app/game/components/FlappyBird';

export default function Game() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('clicker');
  const [opponent, setOpponent] = useState<any>(null);

  const handleGameOver = (score: number) => {
    // Handle game over logic
    console.log('Game over with score:', score);
  };

  const tabs = [
    { id: 'clicker', label: 'Clicker' },
    { id: 'combat', label: 'Combat' },
    { id: 'julugan', label: 'Julugan' },
    { id: 'tanza', label: 'Tanza' },
    { id: 'flappy', label: 'Flappy' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'profile', label: 'Profile' },
    { id: 'history', label: 'History' },
  ];

  const getTabClasses = (tabId: string) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-press-start transition-colors';
    return activeTab === tabId
      ? `${baseClasses} bg-cyber-gray text-cyber-white`
      : `${baseClasses} bg-cyber-black text-cyber-light-gray hover:bg-cyber-gray hover:text-cyber-white`;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-cyber-black text-cyber-white p-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-press-start">Please log in to play</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-black text-cyber-white p-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Left Sidebar */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-cyber-gray rounded-lg p-4">
              <h2 className="text-xl font-press-start mb-4">Game Modes</h2>
              <div className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={getTabClasses(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="md:col-span-3">
            <div className="bg-cyber-gray rounded-lg p-4">
              {activeTab === 'clicker' && <ClickerGame />}
              {activeTab === 'combat' && (
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1">
                    <Combat />
                  </div>
                  <div className="w-full lg:w-80">
                    <Queue onMatchFound={setOpponent} onQueueUpdate={() => {}} />
                  </div>
                </div>
              )}
              {activeTab === 'julugan' && <JuluganMode />}
              {activeTab === 'tanza' && <TanzaMode />}
              {activeTab === 'flappy' && <FlappyBird onGameOver={handleGameOver} />}
              {activeTab === 'leaderboard' && <Leaderboard />}
              {activeTab === 'profile' && <Profile />}
              {activeTab === 'history' && <MatchHistory />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 