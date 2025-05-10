'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import Leaderboard from './components/Leaderboard';
import Combat from './components/Combat';
import MatchHistory from './components/MatchHistory';

export default function GamePage() {
  const { user } = useAuth();
  const [playerPower, setPlayerPower] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!user) return;

      try {
        const playerDoc = await getDoc(doc(db, 'players', user.uid));
        const playerData = playerDoc.data();
        setPlayerPower(playerData?.power || 0);
      } catch (error) {
        console.error('Error fetching player data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [user]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-cyber-blue text-center">Loading game data...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <Combat playerPower={playerPower} />
          <MatchHistory />
        </div>
        <div>
          <Leaderboard />
        </div>
      </div>
    </div>
  );
} 