'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, onSnapshot, serverTimestamp, setDoc, getDoc, runTransaction, writeBatch } from 'firebase/firestore';
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
  currentMatch?: string | null;
  lastQueueUpdate?: any;
}

const DEFAULT_AVATAR = '/default-avatar.svg';
const MIN_QUEUE_TIME = 60; // Minimum queue time in seconds
const MAX_QUEUE_TIME = 300; // Maximum queue time in seconds
const QUEUE_CHECK_INTERVAL = 5000; // Check for matches every 5 seconds
const LAST_ACTIVE_THRESHOLD = 30000; // 30 seconds

export default function Queue() {
  const { user } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [searching, setSearching] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [queueStartTime, setQueueStartTime] = useState<number | null>(null);
  const [matchmakingStatus, setMatchmakingStatus] = useState<string>('');
  const lastUpdateRef = useRef<number>(0);
  const queueTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create or update player document atomically
  const ensurePlayerDocument = useCallback(async () => {
    if (!user) return;

    try {
      const result = await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await transaction.get(playerRef);

        if (!playerDoc.exists()) {
          const newPlayerData = {
            uid: user.uid,
            username: user.displayName || 'Anonymous',
            avatar: user.photoURL || DEFAULT_AVATAR,
            power: 0,
            inQueue: false,
            lastActive: serverTimestamp(),
            status: 'online',
            currentMatch: null,
            lastQueueUpdate: serverTimestamp()
          };
          transaction.set(playerRef, newPlayerData);
          return { success: true, isNew: true };
        }

        return { success: true, isNew: false };
      });

      if (!result.success) {
        throw new Error('Failed to ensure player document');
      }
    } catch (error) {
      console.error('Error ensuring player document:', error);
      setError('Failed to initialize player data');
    }
  }, [user]);

  // Update player status atomically
  const updatePlayerStatus = useCallback(async (status: string, inQueue: boolean) => {
    if (!user) return;

    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await transaction.get(playerRef);

        if (!playerDoc.exists()) {
          throw new Error('Player document not found');
        }

        const lastUpdate = playerDoc.data().lastQueueUpdate?.toMillis() || 0;
        if (Date.now() - lastUpdate < LAST_ACTIVE_THRESHOLD) {
          throw new Error('Too many status updates');
        }

        transaction.update(playerRef, {
          status,
          inQueue,
          lastActive: serverTimestamp(),
          lastQueueUpdate: serverTimestamp()
        });
      });
    } catch (error) {
      console.error('Error updating player status:', error);
      throw error;
    }
  }, [user]);

  // Check for available matches with atomic transaction
  const checkForMatches = useCallback(async () => {
    if (!user || !inQueue) return;

    try {
      const result = await runTransaction(db, async (transaction) => {
        // Query for players in queue
        const q = query(
          collection(db, 'players'),
          where('inQueue', '==', true),
          where('status', '==', 'searching'),
          where('lastQueueUpdate', '>', new Date(Date.now() - LAST_ACTIVE_THRESHOLD))
        );

        const querySnapshot = await getDocs(q);
        const availablePlayers = querySnapshot.docs
          .map(doc => ({ uid: doc.id, ...doc.data() } as Player))
          .filter(player => 
            player.uid !== user.uid && 
            player.status !== 'in_match' &&
            !player.currentMatch
          );

        if (availablePlayers.length > 0) {
          const opponent = availablePlayers[0];
          
          // Verify both players are still available
          const player1Ref = doc(db, 'players', user.uid);
          const player2Ref = doc(db, 'players', opponent.uid);
          
          const [player1Doc, player2Doc] = await Promise.all([
            transaction.get(player1Ref),
            transaction.get(player2Ref)
          ]);

          // Verify both players are still in queue and available
          if (!player1Doc.exists() || !player2Doc.exists()) {
            throw new Error('One or both players no longer exist');
          }

          const player1Data = player1Doc.data();
          const player2Data = player2Doc.data();

          if (!player1Data.inQueue || !player2Data.inQueue ||
              player1Data.status !== 'searching' || player2Data.status !== 'searching' ||
              player1Data.currentMatch || player2Data.currentMatch) {
            throw new Error('One or both players are no longer available');
          }

          // Create match document
          const matchRef = doc(collection(db, 'matches'));
          const matchData = {
            player1Id: user.uid,
            player2Id: opponent.uid,
            player1Username: player1Data.username,
            player2Username: player2Data.username,
            status: 'in_progress',
            createdAt: serverTimestamp(),
            winner: null,
            moves: [],
            lastMove: null,
            lastUpdate: serverTimestamp()
          };

          // Update both players' status atomically
          transaction.set(matchRef, matchData);
          transaction.update(player1Ref, {
            inQueue: false,
            currentMatch: matchRef.id,
            status: 'in_match',
            lastQueueUpdate: serverTimestamp()
          });
          transaction.update(player2Ref, {
            inQueue: false,
            currentMatch: matchRef.id,
            status: 'in_match',
            lastQueueUpdate: serverTimestamp()
          });

          return { matchId: matchRef.id, success: true };
        }

        return { success: false };
      });

      if (result.success) {
        setSearching(false);
        setInQueue(false);
        setQueueTime(0);
        setQueueStartTime(null);
        if (queueTimeoutRef.current) {
          clearTimeout(queueTimeoutRef.current);
        }
        router.push(`/combat?match=${result.matchId}`);
      }
    } catch (error: any) {
      console.error('Error checking for matches:', error);
      if (error.code === 'permission-denied') {
        setError('Permission denied. Please try again.');
      } else if (error.message === 'One or both players are no longer available') {
        // This is expected sometimes, just continue searching
        return;
      } else {
        setError('Failed to find opponent. Please try again.');
      }
      // Reset queue state on error
      setInQueue(false);
      setSearching(false);
      setQueueStartTime(null);
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current);
      }
    }
  }, [user, inQueue, router]);

  // Real-time player updates
  useEffect(() => {
    if (!user) return;

    ensurePlayerDocument();

    // Update user's last active timestamp
    const updateLastActive = async () => {
      try {
        if (Date.now() - lastUpdateRef.current < LAST_ACTIVE_THRESHOLD) {
          return;
        }
        await updatePlayerStatus(inQueue ? 'searching' : 'online', inQueue);
        lastUpdateRef.current = Date.now();
      } catch (error) {
        console.error('Error updating last active:', error);
      }
    };

    const interval = setInterval(updateLastActive, LAST_ACTIVE_THRESHOLD);
    updateLastActive();

    // Listen for online players with real-time updates
    const q = query(
      collection(db, 'players'),
      where('lastActive', '>', new Date(Date.now() - LAST_ACTIVE_THRESHOLD)),
      orderBy('lastActive', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const onlinePlayers = snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as Player))
        .filter(player => 
          player.uid !== user.uid && 
          player.lastActive?.toMillis() > Date.now() - LAST_ACTIVE_THRESHOLD
        );
      setPlayers(onlinePlayers);
      setLoading(false);
    });
    
    return () => {
      clearInterval(interval);
      unsubscribe();
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current);
      }
    };
  }, [user, inQueue, ensurePlayerDocument, updatePlayerStatus]);

  // Queue timer effect with atomic updates
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (searching && queueStartTime) {
      timer = setInterval(async () => {
        const elapsedTime = Math.floor((Date.now() - queueStartTime) / 1000);
        setQueueTime(elapsedTime);

        // Update matchmaking status based on time
        if (elapsedTime < MIN_QUEUE_TIME) {
          setMatchmakingStatus('Finding optimal opponent...');
        } else if (elapsedTime < MAX_QUEUE_TIME) {
          setMatchmakingStatus('Expanding search parameters...');
        } else {
          setMatchmakingStatus('Searching in all regions...');
        }

        // Ensure player is still in queue
        try {
          await updatePlayerStatus('searching', true);
        } catch (error) {
          console.error('Error updating queue status:', error);
          setInQueue(false);
          setSearching(false);
          setQueueStartTime(null);
        }
      }, 1000);
    } else {
      setQueueTime(0);
      setQueueStartTime(null);
      setMatchmakingStatus('');
    }
    return () => clearInterval(timer);
  }, [searching, queueStartTime, updatePlayerStatus]);

  // Check for matches periodically with atomic updates
  useEffect(() => {
    let matchCheckInterval: NodeJS.Timeout;
    if (inQueue && searching) {
      matchCheckInterval = setInterval(checkForMatches, QUEUE_CHECK_INTERVAL);
    }
    return () => {
      if (matchCheckInterval) clearInterval(matchCheckInterval);
    };
  }, [inQueue, searching, checkForMatches]);

  const toggleQueue = async () => {
    if (!user) return;

    try {
      const newQueueState = !inQueue;
      
      // Update local state
      setInQueue(newQueueState);
      setSearching(newQueueState);
      
      if (newQueueState) {
        setQueueStartTime(Date.now());
        setMatchmakingStatus('Finding optimal opponent...');
      }

      // Update Firestore atomically
      await updatePlayerStatus(newQueueState ? 'searching' : 'online', newQueueState);

      if (newQueueState) {
        await checkForMatches();
      }
    } catch (error) {
      console.error('Error toggling queue:', error);
      setError('Failed to update queue status');
      setInQueue(false);
      setSearching(false);
      setQueueStartTime(null);
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
            setQueueStartTime(null);
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
          {searching && matchmakingStatus && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-cyber-blue text-sm mt-2 text-center"
            >
              {matchmakingStatus}
            </motion.p>
          )}
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
