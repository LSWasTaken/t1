'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

interface Player {
  id: string;
  username?: string;
  email?: string;
  power: number;
  wins: number;
  losses: number;
  winStreak: number;
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const q = query(
          collection(db, 'players'),
          orderBy('power', 'desc'),
          limit(100)
        );

        const querySnapshot = await getDocs(q);
        const leaderboardData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Player));

        setPlayers(leaderboardData);
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const getPlayerName = (player: Player) => {
    return player.username || player.email?.split('@')[0] || 'Anonymous';
  };

  const getPlayerStyle = (player: Player, index: number) => {
    let style = '';
    
    // Top player gets crown
    if (index === 0) {
      style += 'font-bold ';
    }
    
    // Win streak effects
    if (player.winStreak >= 25) {
      style += 'animate-rainbow ';
    } else if (player.winStreak >= 5) {
      style += 'text-red-500 ';
    }

    return style;
  };

  if (loading) {
    return (
      <div className="text-cyber-blue text-center">Loading leaderboard...</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-press-start text-cyber-pink mb-8 text-center">Leaderboard</h1>
      
      <div className="bg-cyber-black rounded-lg p-4">
        <div className="space-y-4">
          {players.map((player, index) => (
            <div 
              key={player.id}
              className="flex items-center justify-between p-3 bg-cyber-black border-2 border-cyber-blue rounded-lg"
            >
              <div className="flex items-center gap-4">
                <span className="text-cyber-yellow w-8">#{index + 1}</span>
                <span className={`${getPlayerStyle(player, index)}`}>
                  {index === 0 && '👑 '}
                  {getPlayerName(player)}
                </span>
              </div>
              <div className="text-cyber-pink">
                Power: {player.power}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 