'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, onSnapshot, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface Player {
  uid: string;
  username: string;
  avatar: string;
  power: number;
  inQueue: boolean;
  lastActive: any;
  status?: string;
}

const DEFAULT_AVATAR = '/default-avatar.svg';

export default function Queue() {
  const { user } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [searching, setSearching] = useState(false);
  const [queueTime, setQueueTime] = useState(0);

  // Create or update player document
  const ensurePlayerDocument = async () => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);

      if (!playerDoc.exists()) {
        // Create new player document
        await setDoc(playerRef, {
          uid: user.uid,
          username: user.displayName || 'Anonymous',
          avatar: user.photoURL || DEFAULT_AVATAR,
          power: 0,
          inQueue: false,
          lastActive: serverTimestamp(),
          status: 'online'
        });
      }
    } catch (error) {
      console.error('Error ensuring player document:', error);
      setError('Failed to initialize player data');
    }
  };

  // Check for available matches
  const checkForMatches = async () => {
    if (!user || !inQueue) return;

    try {
      // Query for players in queue
      const q = query(
        collection(db, 'players'),
        where('inQueue', '==', true)
      );

      const querySnapshot = await getDocs(q);
      const availablePlayers = querySnapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as Player))
        .filter(player => player.uid !== user.uid && player.status !== 'in_match');

      if (availablePlayers.length > 0) {
        const opponent = availablePlayers[0];
        await startMatch(opponent.uid);
      }
    } catch (error) {
      console.error('Error checking for matches:', error);
      setError('Failed to find opponent');
    }
  };

  useEffect(() => {
    if (!user) return;

    // Ensure player document exists
    ensurePlayerDocument();

    // Update user's last active timestamp
    const updateLastActive = async () => {
      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        
        if (playerDoc.exists()) {
          await updateDoc(playerRef, {
            lastActive: serverTimestamp(),
            inQueue: inQueue,
            status: inQueue ? 'searching' : 'online'
          });
        } else {
          // If document doesn't exist, create it
          await ensurePlayerDocument();
        }
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

  // Queue timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (searching) {
      timer = setInterval(() => {
        setQueueTime(prev => prev + 1);
      }, 1000);
    } else {
      setQueueTime(0);
    }
    return () => clearInterval(timer);
  }, [searching]);

  // Check for matches periodically while in queue
  useEffect(() => {
    let matchCheckInterval: NodeJS.Timeout;
    if (inQueue && searching) {
      matchCheckInterval = setInterval(checkForMatches, 2000); // Check every 2 seconds
    }
    return () => {
      if (matchCheckInterval) clearInterval(matchCheckInterval);
    };
  }, [inQueue, searching, user]);

  const toggleQueue = async () => {
    if (!user) return;

    try {
      const newQueueState = !inQueue;
      setInQueue(newQueueState);
      setSearching(newQueueState);

      // Update queue status
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: newQueueState,
        lastActive: serverTimestamp(),
        status: newQueueState ? 'searching' : 'online'
      });

      // If joining queue, check for available matches immediately
      if (newQueueState) {
        await checkForMatches();
      }
    } catch (error) {
      console.error('Error toggling queue:', error);
      setError('Failed to update queue status');
      setInQueue(false);
      setSearching(false);
    }
  };

  const startMatch = async (opponentId: string) => {
    if (!user) return;

    try {
      // Create match document
      const matchRef = doc(collection(db, 'matches'));
      await setDoc(matchRef, {
        player1Id: user.uid,
        player2Id: opponentId,
        status: 'in_progress',
        createdAt: serverTimestamp(),
        winner: null,
        moves: [],
        lastMove: null
      });

      // Update both players' status
      const batch = [
        updateDoc(doc(db, 'players', user.uid), {
          inQueue: false,
          currentMatch: matchRef.id,
          status: 'in_match'
        }),
        updateDoc(doc(db, 'players', opponentId), {
          inQueue: false,
          currentMatch: matchRef.id,
          status: 'in_match'
        })
      ];

      await Promise.all(batch);

      setSearching(false);
      setInQueue(false);
      // Redirect to combat page
      router.push(`/combat?match=${matchRef.id}`);
    } catch (error) {
      console.error('Error starting match:', error);
      setError('Failed to start match');
      setInQueue(false);
      setSearching(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center p-4"
      >
        <p className="text-cyber-red">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setInQueue(false);
            setSearching(false);
          }}
          className="mt-2 px-4 py-2 bg-cyber-pink text-white rounded-lg hover:bg-pink-700 transition-colors"
        >
          Retry
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-cyber-dark rounded-lg p-6"
      >
        <h2 className="text-2xl font-press-start text-cyber-pink mb-4">Matchmaking</h2>
        
        <div className="relative">
          <button
            onClick={toggleQueue}
            disabled={searching}
            className={`w-full px-6 py-3 rounded-lg font-press-start transition-all duration-300 ${
              inQueue
                ? 'bg-cyber-red text-white hover:bg-red-700'
                : 'bg-cyber-pink text-white hover:bg-pink-700'
            } ${searching ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {searching ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Searching... {formatTime(queueTime)}</span>
              </div>
            ) : (
              inQueue ? 'Leave Queue' : 'Join Queue'
            )}
          </button>
        </div>

        <div className="mt-6">
          <h3 className="text-xl font-press-start text-cyber-blue mb-4">Online Players</h3>
          <div className="space-y-2">
            <AnimatePresence>
              {players.map((player) => (
                <motion.div
                  key={player.uid}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center justify-between p-3 bg-cyber-black rounded-lg hover:bg-cyber-dark transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <img
                        src={player.avatar || DEFAULT_AVATAR}
                        alt={player.username}
                        className="w-10 h-10 rounded-full border-2 border-cyber-pink"
                      />
                      <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${
                        player.status === 'searching' ? 'bg-cyber-yellow animate-pulse' :
                        player.status === 'in_match' ? 'bg-cyber-red' :
                        'bg-cyber-green'
                      }`}></div>
                    </div>
                    <div>
                      <p className="text-cyber-pink font-press-start">{player.username}</p>
                      <p className="text-cyber-blue text-sm">Power: {player.power}</p>
                    </div>
                  </div>
                  {player.inQueue && (
                    <span className="px-2 py-1 bg-cyber-green text-white text-sm rounded animate-pulse">
                      In Queue
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {players.length === 0 && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-cyber-blue text-center"
              >
                No players online
              </motion.p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
