'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface LeaderboardPlayer {
  id: string;
  username: string;
  power: number;
  wins: number;
  losses: number;
  avatar: string;
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const playersRef = collection(db, 'players');
        const q = query(playersRef, orderBy('power', 'desc'), limit(10));
        const snapshot = await getDocs(q);
        
        const leaderboardData: LeaderboardPlayer[] = [];
        
        for (const doc of snapshot.docs) {
          const playerData = doc.data();
          leaderboardData.push({
            id: doc.id,
            username: playerData.username || 'Unknown Player',
            power: playerData.power || 0,
            wins: playerData.wins || 0,
            losses: playerData.losses || 0,
            avatar: playerData.avatar || '/default-avatar.svg'
          });
        }
        
        setPlayers(leaderboardData);
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
        setError('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-press-start animate-pulse">Loading leaderboard...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-press-start text-cyber-red mb-4">{error}</h2>
        <button
          onClick={() => window.location.reload()}
          className="cyber-button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-press-start mb-4">Leaderboard</h2>
      <div className="bg-cyber-dark rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-cyber-gray">
              <th className="p-4 text-left">Rank</th>
              <th className="p-4 text-left">Player</th>
              <th className="p-4 text-right">Power</th>
              <th className="p-4 text-right">W/L</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.id} className="border-t border-cyber-gray">
                <td className="p-4">#{index + 1}</td>
                <td className="p-4">
                  <div className="flex items-center space-x-3">
                    <img
                      src={player.avatar}
                      alt={player.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <span>{player.username}</span>
                  </div>
                </td>
                <td className="p-4 text-right text-cyber-green">{player.power}</td>
                <td className="p-4 text-right">
                  {player.wins}/{player.losses}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 