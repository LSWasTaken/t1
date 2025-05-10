'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

export default function Leaderboard() {
  const [players, setPlayers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'players'),
      orderBy('power', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const playerData = snapshot.docs.map((doc, index) => ({
        id: doc.id,
        rank: index + 1,
        ...doc.data(),
      }));
      setPlayers(playerData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-cyber-dark rounded-lg p-4">
        <h2 className="text-xl font-press-start text-cyber-pink mb-4">Loading Leaderboard...</h2>
      </div>
    );
  }

  return (
    <div className="bg-cyber-dark rounded-lg p-4">
      <h2 className="text-xl font-press-start text-cyber-pink mb-4">Top Fighters</h2>
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.id}
            className="flex items-center justify-between bg-cyber-black p-3 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <span className="text-cyber-pink font-press-start w-8">
                #{player.rank}
              </span>
              <span className="text-cyber-blue">
                {player.username || player.email?.split('@')[0] || 'Anonymous'}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-cyber-green">
                Power: {player.power}
              </span>
              <span className="text-cyber-purple">
                Wins: {player.wins || 0}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 