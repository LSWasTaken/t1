'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

interface Player {
  id: string;
  email: string;
  power: number;
  clicks: number;
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'players'),
      orderBy('power', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const playerData: Player[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        playerData.push({
          id: doc.id,
          email: data.email || 'Anonymous',
          power: data.power || 0,
          clicks: data.clicks || 0,
        });
      });
      setPlayers(playerData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="text-center">
        <p className="text-cyber-blue">Loading leaderboard...</p>
      </div>
    );
  }

  return (
    <div className="bg-cyber-dark rounded-lg p-6">
      <h3 className="text-2xl font-press-start text-cyber-pink mb-6 text-center">
        Leaderboard
      </h3>
      <div className="space-y-4">
        {players.map((player, index) => (
          <div
            key={player.id}
            className="flex items-center justify-between p-4 bg-cyber-black rounded-lg"
          >
            <div className="flex items-center space-x-4">
              <span className="text-cyber-pink font-press-start">
                #{index + 1}
              </span>
              <span className="text-cyber-blue">{player.email}</span>
            </div>
            <div className="text-right">
              <p className="text-cyber-green font-press-start">
                Power: {player.power}
              </p>
              <p className="text-cyber-blue text-sm">
                Clicks: {player.clicks}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 