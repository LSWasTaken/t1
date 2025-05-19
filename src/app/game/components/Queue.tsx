'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Player {
  id: string;
  username: string;
  power: number;
  avatar: string;
}

// Base64 encoded default avatar (a simple gray circle)
const DEFAULT_AVATAR = '/default-avatar.svg';

export default function Queue() {
  const router = useRouter();
  const { user } = useAuth();
  const [inQueue, setInQueue] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch online players
  useEffect(() => {
    if (!user) return;

    const playersRef = collection(db, 'players');
    const q = query(playersRef, where('status', '==', 'online'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const players: Player[] = [];
      
      for (const playerDoc of snapshot.docs) {
        if (playerDoc.id !== user.uid) { // Exclude current user
          try {
            const userDoc = await getDoc(doc(db, 'users', playerDoc.id));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              players.push({
                id: playerDoc.id,
                username: userData.username || 'Unknown Player',
                power: userData.power || 0,
                avatar: userData.avatar || '/default-avatar.svg'
              });
            }
          } catch (err) {
            console.error('Error fetching user data:', err);
            // Add player with default data if we can't fetch their details
            players.push({
              id: playerDoc.id,
              username: 'Unknown Player',
              power: 0,
              avatar: '/default-avatar.svg'
            });
          }
        }
      }
      
      setOnlinePlayers(players);
      setLoading(false);
    }, (err) => {
      console.error('Error in online players listener:', err);
      setError('Failed to load online players');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle joining queue
  const handleJoinQueue = useCallback(async () => {
    if (!user) return;
    
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        status: 'in_queue',
        inQueue: true,
        currentOpponent: null
      });
      setInQueue(true);
    } catch (err) {
      console.error('Error joining queue:', err);
    }
  }, [user]);

  // Handle leaving queue
  const handleLeaveQueue = useCallback(async () => {
    if (!user) return;
    
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        status: 'online',
        inQueue: false,
        currentOpponent: null
      });
      setInQueue(false);
    } catch (err) {
      console.error('Error leaving queue:', err);
    }
  }, [user]);

  // Handle challenging a player
  const handleChallenge = useCallback(async (opponentId: string) => {
    if (!user) return;
    
    try {
      // Update both players' status
      const playerRef = doc(db, 'players', user.uid);
      const opponentRef = doc(db, 'players', opponentId);
      
      await updateDoc(playerRef, {
        status: 'in_combat',
        inQueue: false,
        currentOpponent: opponentId
      });
      
      await updateDoc(opponentRef, {
        status: 'in_combat',
        inQueue: false,
        currentOpponent: user.uid
      });
      
      // Navigate to combat page
      router.push(`/game/combat?opponent=${opponentId}`);
    } catch (err) {
      console.error('Error challenging player:', err);
    }
  }, [user, router]);

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

  if (loading) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-press-start animate-pulse">Loading players...</h2>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-press-start mb-4">Battle Arena</h2>
        {!inQueue ? (
          <button
            onClick={handleJoinQueue}
            className="cyber-button"
          >
            Join Queue
          </button>
        ) : (
          <button
            onClick={handleLeaveQueue}
            className="cyber-button"
          >
            Leave Queue
          </button>
        )}
      </div>

      <div>
        <h3 className="text-xl font-press-start mb-4">Online Players</h3>
        {onlinePlayers.length === 0 ? (
          <p className="text-cyber-gray">No players online</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {onlinePlayers.map((player) => (
              <div
                key={player.id}
                className="bg-cyber-dark p-4 rounded-lg flex items-center justify-between"
              >
                <div className="flex items-center space-x-4">
                  <img
                    src={player.avatar}
                    alt={player.username}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <h4 className="font-press-start">{player.username}</h4>
                    <p className="text-cyber-green">Power: {player.power}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChallenge(player.id)}
                  className="cyber-button-small"
                >
                  Challenge
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
