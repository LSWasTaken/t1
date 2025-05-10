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
  winStreak: number;
  inQueue: boolean;
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const q = query(
          collection(db, 'players'),
          orderBy('power', 'desc'),
          limit(10)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const playersData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Player));
          setPlayers(playersData);
          setLoading(false);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error fetching players:', error);
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-white">Leaderboard</h2>
      {loading ? (
        <div className="text-white">Loading...</div>
      ) : (
        <div className="space-y-4">
          {players.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <span className="text-lg font-bold text-white">
                  #{index + 1}
                </span>
                <div className="flex items-center space-x-2">
                  <span className={`font-bold ${player.winStreak >= 2 ? 'text-red-500' : 'text-white'}`}>
                    {player.username || player.email?.split('@')[0] || 'Anonymous'}
                  </span>
                  {player.winStreak >= 2 && (
                    <span className="text-yellow-400">👑</span>
                  )}
                  {player.inQueue && (
                    <span className="text-green-400 text-sm">(In Queue)</span>
                  )}
                </div>
              </div>
              <div className="text-white">
                Power: {player.power}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 