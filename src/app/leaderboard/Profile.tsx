'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface LeaderboardEntry {
  uid: string;
  username: string;
  email: string;
  power: number;
  wins: number;
  losses: number;
  winStreak: number;
  highestWinStreak: number;
  inQueue: boolean;
  lastMatch?: any;
}

interface ProfileProps {
  selectedPlayer: LeaderboardEntry;
}

export default function Profile({ selectedPlayer }: ProfileProps) {
  const { user } = useAuth();
  const [isChallenging, setIsChallenging] = useState(false);

  const handleChallenge = async () => {
    if (!user) return;

    try {
      setIsChallenging(true);
      // Update both players' status
      await updateDoc(doc(db, 'players', user.uid), {
        challengeFrom: selectedPlayer.uid,
        inQueue: false
      });

      await updateDoc(doc(db, 'players', selectedPlayer.uid), {
        challengeFrom: user.uid,
        inQueue: false
      });

      // Redirect to combat page
      window.location.href = `/combat?opponent=${selectedPlayer.uid}`;
    } catch (error) {
      console.error('Error challenging player:', error);
    } finally {
      setIsChallenging(false);
    }
  };

  return (
    <div className="bg-cyber-dark rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-press-start text-cyber-pink">
          {selectedPlayer.username || 'Anonymous'}
        </h3>
        {user && user.uid !== selectedPlayer.uid && (
          <button
            onClick={handleChallenge}
            disabled={isChallenging}
            className="px-4 py-2 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50"
          >
            {isChallenging ? 'Challenging...' : 'Challenge'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-cyber-black rounded p-4">
          <p className="text-cyber-blue">Power</p>
          <p className="text-2xl text-cyber-pink">{selectedPlayer.power}</p>
        </div>
        <div className="bg-cyber-black rounded p-4">
          <p className="text-cyber-blue">Wins</p>
          <p className="text-2xl text-cyber-pink">{selectedPlayer.wins}</p>
        </div>
        <div className="bg-cyber-black rounded p-4">
          <p className="text-cyber-blue">Losses</p>
          <p className="text-2xl text-cyber-pink">{selectedPlayer.losses}</p>
        </div>
        <div className="bg-cyber-black rounded p-4">
          <p className="text-cyber-blue">Win Streak</p>
          <p className="text-2xl text-cyber-pink">{selectedPlayer.winStreak}</p>
        </div>
      </div>
    </div>
  );
} 