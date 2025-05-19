'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface TanzaPlayer {
  id: string;
  username: string;
  power: number;
  tanzaPoints: number;
  lastTanzaMatch: Date | null;
}

export default function TanzaMode() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<TanzaPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [challenging, setChallenging] = useState(false);

  useEffect(() => {
    const fetchTanzaPlayers = async () => {
      if (!user) return;

      try {
        const playersRef = collection(db, 'users');
        const q = query(
          playersRef,
          where('tanzaPoints', '>', 0)
        );
        
        const snapshot = await getDocs(q);
        const playersData: TanzaPlayer[] = [];
        
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (doc.id !== user.uid) { // Exclude current user
            playersData.push({
              id: doc.id,
              username: data.username || 'Anonymous',
              power: data.power || 0,
              tanzaPoints: data.tanzaPoints || 0,
              lastTanzaMatch: data.lastTanzaMatch?.toDate() || null
            });
          }
        }
        
        // Sort by tanza points
        playersData.sort((a, b) => b.tanzaPoints - a.tanzaPoints);
        setPlayers(playersData);
      } catch (err) {
        console.error('Error fetching tanza players:', err);
        setError('Failed to load tanza players');
      } finally {
        setLoading(false);
      }
    };

    fetchTanzaPlayers();
  }, [user]);

  const handleChallenge = async (opponentId: string) => {
    if (!user) return;

    try {
      setChallenging(true);
      setSelectedPlayer(opponentId);

      // Update both players' status
      await updateDoc(doc(db, 'users', user.uid), {
        status: 'in_tanza_match',
        currentOpponent: opponentId
      });

      await updateDoc(doc(db, 'users', opponentId), {
        status: 'in_tanza_match',
        currentOpponent: user.uid
      });

      // Redirect to combat page
      window.location.href = `/game/combat?mode=tanza&opponent=${opponentId}`;
    } catch (err) {
      console.error('Error challenging player:', err);
      setError('Failed to challenge player');
      setChallenging(false);
      setSelectedPlayer(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-press-start animate-pulse">Loading Tanza players...</h2>
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
      <div className="mb-6">
        <h2 className="text-2xl font-press-start mb-2">Tanza Mode</h2>
        <p className="text-cyber-blue">
          Challenge other players in this special game mode. Win matches to earn Tanza Points and climb the ranks!
        </p>
      </div>

      <div className="bg-cyber-dark rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-cyber-gray">
              <th className="p-4 text-left">Rank</th>
              <th className="p-4 text-left">Player</th>
              <th className="p-4 text-center">Power</th>
              <th className="p-4 text-center">Tanza Points</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.id} className="border-t border-cyber-gray">
                <td className="p-4">
                  #{index + 1}
                </td>
                <td className="p-4">
                  {player.username}
                </td>
                <td className="p-4 text-center">
                  {player.power}
                </td>
                <td className="p-4 text-center">
                  <span className="text-cyber-yellow">{player.tanzaPoints}</span>
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => handleChallenge(player.id)}
                    disabled={challenging && selectedPlayer === player.id}
                    className={`cyber-button ${
                      challenging && selectedPlayer === player.id
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    {challenging && selectedPlayer === player.id
                      ? 'Challenging...'
                      : 'Challenge'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 