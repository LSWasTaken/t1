'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Username: string;
  player2Username: string;
  winner: string | null;
  timestamp: Date;
  powerGain?: number;
}

export default function MatchHistory() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMatchHistory = async () => {
      if (!user) return;

      try {
        const matchesRef = collection(db, 'matches');
        const q = query(
          matchesRef,
          where('player1Id', '==', user.uid),
          orderBy('timestamp', 'desc'),
          limit(10)
        );
        
        const snapshot = await getDocs(q);
        const matchData: Match[] = [];
        
        for (const doc of snapshot.docs) {
          const match = doc.data();
          matchData.push({
            id: doc.id,
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            player1Username: match.player1Username || 'Unknown',
            player2Username: match.player2Username || 'Unknown',
            winner: match.winner,
            timestamp: match.timestamp.toDate(),
            powerGain: match.powerGain
          });
        }
        
        setMatches(matchData);
      } catch (err) {
        console.error('Error fetching match history:', err);
        setError('Failed to load match history');
      } finally {
        setLoading(false);
      }
    };

    fetchMatchHistory();
  }, [user]);

  if (loading) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-press-start animate-pulse">Loading match history...</h2>
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
      <h2 className="text-2xl font-press-start mb-4">Match History</h2>
      <div className="bg-cyber-dark rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-cyber-gray">
              <th className="p-4 text-left">Date</th>
              <th className="p-4 text-left">Opponent</th>
              <th className="p-4 text-center">Result</th>
              <th className="p-4 text-right">Power</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id} className="border-t border-cyber-gray">
                <td className="p-4">
                  {match.timestamp.toLocaleDateString()}
                </td>
                <td className="p-4">
                  {match.player2Username}
                </td>
                <td className="p-4 text-center">
                  <span className={`font-press-start ${
                    match.winner === user?.uid
                      ? 'text-cyber-green'
                      : match.winner === null
                      ? 'text-cyber-yellow'
                      : 'text-cyber-red'
                  }`}>
                    {match.winner === user?.uid
                      ? 'Victory'
                      : match.winner === null
                      ? 'Draw'
                      : 'Defeat'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <span className={match.powerGain && match.powerGain > 0 ? 'text-cyber-green' : ''}>
                    {match.powerGain ? (match.powerGain > 0 ? `+${match.powerGain}` : match.powerGain) : '-'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 