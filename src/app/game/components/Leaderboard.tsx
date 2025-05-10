'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

interface Player {
  id: string;
  uid: string;
  email?: string;
  username?: string;
  power: number;
  wins?: number;
  losses?: number;
  rank?: number;
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Query for top 10 players by power
    const q = query(
      collection(db, 'players'),
      orderBy('power', 'desc'),
      limit(10)
    );

    // Set up real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const playersData = snapshot.docs.map((doc, index) => ({
        id: doc.id,
        ...doc.data(),
        rank: index + 1
      } as Player));
      
      setPlayers(playersData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching leaderboard:', error);
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="bg-cyber-dark rounded-lg p-6">
        <h3 className="text-2xl font-press-start text-cyber-pink mb-6 text-center">
          Leaderboard
        </h3>
        <div className="text-cyber-blue text-center">Loading rankings...</div>
      </div>
    );
  }

  return (
    <div className="bg-cyber-dark rounded-lg p-6">
      <h3 className="text-2xl font-press-start text-cyber-pink mb-6 text-center">
        Leaderboard
      </h3>
      
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.id}
            className="bg-cyber-black rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center space-x-4">
              <span className="text-cyber-pink font-press-start w-8">
                #{player.rank}
              </span>
              <div>
                <h4 className="text-cyber-blue font-press-start">
                  {player.username || player.email?.split('@')[0] || 'Anonymous'}
                </h4>
                <div className="flex space-x-4 text-sm">
                  <span className="text-cyber-green">Power: {player.power}</span>
                  <span className="text-cyber-purple">Wins: {player.wins || 0}</span>
                  <span className="text-cyber-red">Losses: {player.losses || 0}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 