'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import Combat from '@/app/game/combat/Combat';
import Queue from '@/app/game/components/Queue';
import Leaderboard from '@/app/leaderboard/page';
import Profile from '@/app/profile/Profile';
import MatchHistory from '@/app/game/components/MatchHistory';
import TanzaMode from '@/app/game/components/TanzaMode';

export default function Game() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('combat');
  const [opponent, setOpponent] = useState<any>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<any>(null);

  const handleQueueUpdate = (isInQueue: boolean) => {
    // Handle queue status updates if needed
    console.log('Queue status:', isInQueue);
  };

  const handleMatchFound = (opponent: any) => {
    setOpponent(opponent);
    // Generate a unique match ID using both player IDs
    const matchId = `${user?.uid}_${opponent.uid}`;
    setMatchId(matchId);
  };

  const handleExitMatch = () => {
    setOpponent(null);
    setMatchId(null);
    setMatchData(null);
  };

  const handleGameOver = (score: number) => {
    // Handle game over logic
    console.log('Game over with score:', score);
  };

  const tabs = [
    { id: 'combat', label: 'Combat' },
    { id: 'tanza', label: 'Tanza' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'profile', label: 'Profile' },
    { id: 'history', label: 'History' },
  ];

  const getTabClasses = (tabId: string) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-press-start transition-colors';
    return activeTab === tabId
      ? `${baseClasses} bg-cyber-accent text-cyber-white`
      : `${baseClasses} bg-cyber-gray text-cyber-white hover:bg-cyber-  hover`;
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
            <div className="bg-cyber-gray rounded-lg p-4 flex flex-col items-center">
              <h2 className="text-xl font-press-start mb-4 text-center">Game Modes</h2>
              <div className="flex flex-col items-center space-y-3 w-full">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={getTabClasses(tab.id) + ' w-full'}
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
              {activeTab === 'combat' && (
                <div className="flex flex-col gap-6 items-center">
                  {!opponent ? (
                    <div className="w-full max-w-2xl">
                      <Queue 
                        user={user} 
                        db={db} 
                        onQueueUpdate={handleQueueUpdate} 
                        onMatchFound={handleMatchFound} 
                      />
                    </div>
                  ) : (
                    <div className="w-full max-w-2xl">
                      <Combat 
                        opponent={opponent}
                        matchId={matchId}
                        onExit={handleExitMatch}
                        matchData={matchData}
                      />
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'tanza' && <TanzaMode />}
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