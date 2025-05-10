'use client';

import { useState } from 'react';
import Combat from './components/Combat';
import Leaderboard from './components/Leaderboard';
import MatchHistory from './components/MatchHistory';
import TanzaMode from './components/TanzaMode';

export default function GamePage() {
  const [activeTab, setActiveTab] = useState('combat');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-center space-x-4 mb-8">
        <button
          onClick={() => setActiveTab('combat')}
          className={`px-6 py-2 rounded-lg font-press-start transition-colors ${
            activeTab === 'combat'
              ? 'bg-cyber-pink text-white'
              : 'bg-cyber-black text-cyber-blue hover:bg-cyber-purple'
          }`}
        >
          Combat
        </button>
        <button
          onClick={() => setActiveTab('tanza')}
          className={`px-6 py-2 rounded-lg font-press-start transition-colors ${
            activeTab === 'tanza'
              ? 'bg-cyber-pink text-white'
              : 'bg-cyber-black text-cyber-blue hover:bg-cyber-purple'
          }`}
        >
          Tanza Mode
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-6 py-2 rounded-lg font-press-start transition-colors ${
            activeTab === 'leaderboard'
              ? 'bg-cyber-pink text-white'
              : 'bg-cyber-black text-cyber-blue hover:bg-cyber-purple'
          }`}
        >
          Leaderboard
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2 rounded-lg font-press-start transition-colors ${
            activeTab === 'history'
              ? 'bg-cyber-pink text-white'
              : 'bg-cyber-black text-cyber-blue hover:bg-cyber-purple'
          }`}
        >
          History
        </button>
      </div>

      <div className="bg-cyber-dark rounded-lg p-6">
        {activeTab === 'combat' && <Combat />}
        {activeTab === 'tanza' && <TanzaMode />}
        {activeTab === 'leaderboard' && <Leaderboard />}
        {activeTab === 'history' && <MatchHistory />}
      </div>
    </div>
  );
} 