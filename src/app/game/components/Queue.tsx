'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Player {
  uid: string;
  username: string;
  avatar: string;
  power: number;
  inQueue: boolean;
  lastActive: any;
}

export default function Queue() {
  const { user } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inQueue, setInQueue] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Update user's last active timestamp
    const updateLastActive = async () => {
      try {
        await updateDoc(doc(db, 'players', user.uid), {
          lastActive: new Date(),
          inQueue: inQueue
        });
      } catch (error) {
        console.error('Error updating last active:', error);
      }
    };

    // Update every 30 seconds
    const interval = setInterval(updateLastActive, 30000);
    updateLastActive(); // Initial update

    // Listen for online players
    const q = query(
      collection(db, 'players'),
      where('lastActive', '>', new Date(Date.now() - 60000)), // Active in last minute
      orderBy('lastActive', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const onlinePlayers = snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as Player))
        .filter(player => player.uid !== user.uid); // Exclude current user
      setPlayers(onlinePlayers);
      setLoading(false);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [user, inQueue]);

  const toggleQueue = async () => {
    if (!user) return;

    try {
      const newQueueState = !inQueue;
      setInQueue(newQueueState);

      // Update queue status
      await updateDoc(doc(db, 'players', user.uid), {
        inQueue: newQueueState,
        lastActive: new Date()
      });

      // If joining queue, check for available matches
      if (newQueueState) {
        const availablePlayers = players.filter(p => p.inQueue && p.uid !== user.uid);
        if (availablePlayers.length > 0) {
          const opponent = availablePlayers[0];
          await startMatch(opponent.uid);
        }
      }
    } catch (error) {
      console.error('Error toggling queue:', error);
      setError('Failed to update queue status');
    }
  };

  const startMatch = async (opponentId: string) => {
    if (!user) return;

    try {
      // Create match document
      const matchRef = doc(collection(db, 'matches'));
      await updateDoc(matchRef, {
        player1Id: user.uid,
        player2Id: opponentId,
        status: 'in_progress',
        createdAt: new Date(),
        winner: null,
        moves: []
      });

      // Update both players' status
      await updateDoc(doc(db, 'players', user.uid), {
        inQueue: false,
        currentMatch: matchRef.id
      });
      await updateDoc(doc(db, 'players', opponentId), {
        inQueue: false,
        currentMatch: matchRef.id
      });

      // Redirect to combat page
      router.push(`/combat?match=${matchRef.id}`);
    } catch (error) {
      console.error('Error starting match:', error);
      setError('Failed to start match');
    }
  };

  if (loading) {
    return (
      <div className="text-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-pink mx-auto"></div>
        <p className="text-cyber-blue mt-2">Loading players...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4">
        <p className="text-cyber-red">{error}</p>
        <button
          onClick={() => setError(null)}
          className="mt-2 px-4 py-2 bg-cyber-pink text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-cyber-dark rounded-lg p-6">
        <h2 className="text-2xl font-press-start text-cyber-pink mb-4">Matchmaking</h2>
        
        <button
          onClick={toggleQueue}
          className={`w-full px-6 py-3 rounded-lg font-press-start transition-all duration-300 ${
            inQueue
              ? 'bg-cyber-red text-white hover:bg-red-700'
              : 'bg-cyber-pink text-white hover:bg-pink-700'
          }`}
        >
          {inQueue ? 'Leave Queue' : 'Join Queue'}
        </button>

        <div className="mt-6">
          <h3 className="text-xl font-press-start text-cyber-blue mb-4">Online Players</h3>
          <div className="space-y-2">
            {players.map((player) => (
              <div
                key={player.uid}
                className="flex items-center justify-between p-3 bg-cyber-black rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={player.avatar || '/default-avatar.svg'}
                    alt={player.username}
                    className="w-10 h-10 rounded-full border-2 border-cyber-pink"
                  />
                  <div>
                    <p className="text-cyber-pink font-press-start">{player.username}</p>
                    <p className="text-cyber-blue text-sm">Power: {player.power}</p>
                  </div>
                </div>
                {player.inQueue && (
                  <span className="px-2 py-1 bg-cyber-green text-white text-sm rounded">
                    In Queue
                  </span>
                )}
              </div>
            ))}
            {players.length === 0 && (
              <p className="text-cyber-blue text-center">No players online</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
