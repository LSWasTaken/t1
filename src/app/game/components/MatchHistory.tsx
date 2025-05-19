'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, DocumentData } from 'firebase/firestore';

interface Player {
  username?: string;
  email?: string;
}

interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Power: number;
  player2Power: number;
  winner: string;
  powerGained: number;
  timestamp: any;
  player1Name?: string;
  player2Name?: string;
}

export default function MatchHistory() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');

  useEffect(() => {
    if (!user) return;

    // Query for matches involving the current user
    const q = query(
      collection(db, 'matches'),
      where('player1Id', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const q2 = query(
      collection(db, 'matches'),
      where('player2Id', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    // Set up real-time listeners
    const unsubscribe1 = onSnapshot(q, async (snapshot) => {
      const matchesData = await Promise.all(
        snapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          // Get player names
          const player2Doc = await getDoc(doc(db, 'players', data.player2Id));
          const player2Data = player2Doc.data() as Player;
          
          return {
            id: docSnapshot.id,
            ...data,
            player1Name: user.email?.split('@')[0] || 'You',
            player2Name: player2Data?.username || player2Data?.email?.split('@')[0] || 'Anonymous'
          } as Match;
        })
      );
      setMatches(prev => [...matchesData, ...prev.filter(m => m.player2Id === user.uid)]);
      setLoading(false);
    });

    const unsubscribe2 = onSnapshot(q2, async (snapshot) => {
      const matchesData = await Promise.all(
        snapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          // Get player names
          const player1Doc = await getDoc(doc(db, 'players', data.player1Id));
          const player1Data = player1Doc.data() as Player;
          
          return {
            id: docSnapshot.id,
            ...data,
            player1Name: player1Data?.username || player1Data?.email?.split('@')[0] || 'Anonymous',
            player2Name: user.email?.split('@')[0] || 'You'
          } as Match;
        })
      );
      setMatches(prev => [...matchesData, ...prev.filter(m => m.player1Id === user.uid)]);
      setLoading(false);
    });

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [user]);

  const filteredMatches = matches.filter(match => {
    if (filter === 'all') return true;
    if (filter === 'wins') return match.winner === user?.uid;
    if (filter === 'losses') return match.winner !== user?.uid;
    return true;
  });

  if (loading) {
    return (
      <div className="bg-cyber-dark rounded-lg p-6">
        <h3 className="text-2xl font-press-start text-cyber-pink mb-6 text-center">
          Battle History
        </h3>
        <div className="text-cyber-blue text-center">Loading matches...</div>
      </div>
    );
  }

  return (
    <div className="bg-cyber-dark rounded-lg p-6">
      <h3 className="text-2xl font-press-start text-cyber-pink mb-6 text-center">
        Battle History
      </h3>

      <div className="flex justify-center space-x-4 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-press-start transition-colors ${
            filter === 'all'
              ? 'bg-cyber-pink text-white'
              : 'bg-cyber-black text-cyber-blue hover:bg-cyber-purple'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('wins')}
          className={`px-4 py-2 rounded-lg font-press-start transition-colors ${
            filter === 'wins'
              ? 'bg-cyber-green text-white'
              : 'bg-cyber-black text-cyber-green hover:bg-cyber-purple'
          }`}
        >
          Wins
        </button>
        <button
          onClick={() => setFilter('losses')}
          className={`px-4 py-2 rounded-lg font-press-start transition-colors ${
            filter === 'losses'
              ? 'bg-cyber-red text-white'
              : 'bg-cyber-black text-cyber-red hover:bg-cyber-purple'
          }`}
        >
          Losses
        </button>
      </div>

      <div className="space-y-4">
        {filteredMatches.length === 0 ? (
          <div className="text-cyber-blue text-center">No matches found</div>
        ) : (
          filteredMatches.map((match) => {
            const isWinner = match.winner === user?.uid;
            const isPlayer1 = match.player1Id === user?.uid;
            const opponentName = isPlayer1 ? match.player2Name : match.player1Name;
            const opponentPower = isPlayer1 ? match.player2Power : match.player1Power;
            const yourPower = isPlayer1 ? match.player1Power : match.player2Power;

            return (
              <div
                key={match.id}
                className={`bg-cyber-black rounded-lg p-4 ${
                  isWinner ? 'border-l-4 border-cyber-green' : 'border-l-4 border-cyber-red'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-press-start ${isWinner ? 'text-cyber-green' : 'text-cyber-red'}`}>
                    {isWinner ? 'Victory' : 'Defeat'}
                  </span>
                  <span className="text-cyber-blue text-sm">
                    {new Date(match.timestamp?.toDate()).toLocaleDateString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-cyber-pink">You</p>
                    <p className="text-cyber-blue">Power: {yourPower}</p>
                  </div>
                  <div>
                    <p className="text-cyber-purple">vs {opponentName}</p>
                    <p className="text-cyber-blue">Power: {opponentPower}</p>
                  </div>
                </div>
                {isWinner && (
                  <p className="text-cyber-green mt-2">
                    Power Gained: +{match.powerGained}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
} 