'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, onSnapshot, serverTimestamp, setDoc, getDoc, runTransaction, writeBatch, Timestamp } from 'firebase/firestore';
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
  region?: string;
  skillRating?: number;
}

const DEFAULT_AVATAR = '/default-avatar.svg';
const MIN_QUEUE_TIME = 180; // Minimum queue time in seconds (3 minutes)
let MAX_QUEUE_TIME = 600; // Maximum queue time in seconds (10 minutes)
const QUEUE_CHECK_INTERVAL = 5000; // Check for matches every 5 seconds
const LAST_ACTIVE_THRESHOLD = 30000; // 30 seconds
let MAX_SKILL_RATING_DIFF = 500; // Maximum skill rating difference for matchmaking
const MAX_RETRY_ATTEMPTS = 3; // Maximum number of retry attempts for match creation

async function runWithRetries<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  baseDelay = 100
): Promise<T> {
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      return await fn();
    } catch (error: any) {
      attempts++;
      if (
        attempts >= maxAttempts ||
        (error.code && !['aborted', 'failed-precondition', 'unavailable'].includes(error.code))
      ) {
        throw error;
      }
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempts) + Math.floor(Math.random() * 100);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error('Transaction failed after maximum retries');
}

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
  const [retryCount, setRetryCount] = useState(0);
  const lastUpdateRef = useRef<number>(0);
  const queueTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const matchmakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoized query for better performance
  const queueQuery = useMemo(() => {
    return query(
      collection(db, 'players'),
      where('inQueue', '==', true),
      where('status', '==', 'searching'),
      where('lastQueueUpdate', '>', new Date(Date.now() - LAST_ACTIVE_THRESHOLD)),
      orderBy('lastQueueUpdate', 'desc')
    );
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (queueTimeoutRef.current) {
      clearTimeout(queueTimeoutRef.current);
      queueTimeoutRef.current = null;
    }
    if (matchmakingTimeoutRef.current) {
      clearTimeout(matchmakingTimeoutRef.current);
      matchmakingTimeoutRef.current = null;
    }
    setInQueue(false);
    setSearching(false);
    setQueueStartTime(null);
    setQueueTime(0);
    setRetryCount(0);
    setMatchmakingStatus('');
  }, []);

  // Create or update player document atomically
  const ensurePlayerDocument = useCallback(async () => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);

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
          lastQueueUpdate: serverTimestamp(),
          skillRating: 1000, // Default skill rating
          region: 'global' // Default region
        };
        await setDoc(playerRef, newPlayerData);
      }
    } catch (error) {
      console.error('Error ensuring player document:', error);
      setError('Failed to initialize player data');
    }
  }, [user]);

  // Update player status atomically with retry mechanism
  const updatePlayerStatus = useCallback(async (status: string, inQueue: boolean) => {
    if (!user) return;

    try {
      await runWithRetries(async () => {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);

        if (!playerDoc.exists()) {
          throw new Error('Player document not found');
        }

        const lastUpdate = playerDoc.data().lastQueueUpdate?.toMillis() || 0;
        if (Date.now() - lastUpdate < LAST_ACTIVE_THRESHOLD) {
          throw new Error('Too many status updates');
        }

        // Use updateDoc instead of transaction for simpler updates
        await updateDoc(playerRef, {
          status,
          inQueue,
          lastActive: serverTimestamp(),
          lastQueueUpdate: serverTimestamp()
        });
      }, 5, 1000); // Increased retry attempts and base delay
    } catch (error: any) {
      console.error('Error updating player status:', error);
      if (error.message === 'Too many status updates') {
        // Silently ignore rate limit errors
        return;
      }
      setError('Failed to update player status. Please try again.');
      cleanup();
    }
  }, [user, cleanup]);

  // Find best match based on skill rating and region
  const findBestMatch = useCallback((availablePlayers: Player[], currentPlayer: Player) => {
    return availablePlayers
      .filter(player => {
        const skillDiff = Math.abs((player.skillRating || 1000) - (currentPlayer.skillRating || 1000));
        const sameRegion = player.region === currentPlayer.region;
        return skillDiff <= MAX_SKILL_RATING_DIFF || sameRegion;
      })
      .sort((a, b) => {
        const aSkillDiff = Math.abs((a.skillRating || 1000) - (currentPlayer.skillRating || 1000));
        const bSkillDiff = Math.abs((b.skillRating || 1000) - (currentPlayer.skillRating || 1000));
        return aSkillDiff - bSkillDiff;
      })[0];
  }, []);

  // Check for available matches with atomic transaction and improved matching
  const checkForMatches = useCallback(async () => {
    if (!user || !inQueue) return;

    try {
      const result = await runWithRetries(async () => {
        return await runTransaction(db, async (transaction) => {
          // Get current player data
          const currentPlayerRef = doc(db, 'players', user.uid);
          const currentPlayerDoc = await transaction.get(currentPlayerRef);
          
          if (!currentPlayerDoc.exists()) {
            throw new Error('Current player not found');
          }

          const currentPlayer = { uid: currentPlayerDoc.id, ...currentPlayerDoc.data() } as Player;

          // Query for players in queue
          let querySnapshot;
          try {
            querySnapshot = await getDocs(queueQuery);
          } catch (error: any) {
            if (error.code === 'failed-precondition' && error.message?.includes('index')) {
              const fallbackQuery = query(
                collection(db, 'players'),
                where('inQueue', '==', true),
                where('status', '==', 'searching')
              );
              querySnapshot = await getDocs(fallbackQuery);
            } else {
              throw error;
            }
          }

          const availablePlayers = querySnapshot.docs
            .map(doc => ({ uid: doc.id, ...doc.data() } as Player))
            .filter(player => 
              player.uid !== user.uid && 
              player.status !== 'in_match' &&
              !player.currentMatch &&
              player.lastQueueUpdate?.toMillis() > Date.now() - LAST_ACTIVE_THRESHOLD
            );

          if (availablePlayers.length > 0) {
            const opponent = findBestMatch(availablePlayers, currentPlayer) || availablePlayers[0];
            
            // Verify both players are still available
            const player1Ref = doc(db, 'players', user.uid);
            const player2Ref = doc(db, 'players', opponent.uid);
            
            const [player1Doc, player2Doc] = await Promise.all([
              transaction.get(player1Ref),
              transaction.get(player2Ref)
            ]);

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

            // Create match document with enhanced data
            const matchRef = doc(collection(db, 'matches'));
            const matchData = {
              player1Id: user.uid,
              player2Id: opponent.uid,
              player1Username: player1Data.username,
              player2Username: player2Data.username,
              player1SkillRating: player1Data.skillRating || 1000,
              player2SkillRating: player2Data.skillRating || 1000,
              player1Region: player1Data.region || 'global',
              player2Region: player2Data.region || 'global',
              status: 'in_progress',
              createdAt: serverTimestamp(),
              winner: null,
              moves: [],
              lastMove: null,
              lastUpdate: serverTimestamp(),
              queueTime: queueTime,
              matchType: 'ranked'
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
      });

      if (result.success) {
        cleanup();
        router.push(`/combat?match=${result.matchId}`);
      }
    } catch (error: any) {
      console.error('Error checking for matches:', error);
      if (error.code === 'permission-denied') {
        setError('Permission denied. Please try again.');
        cleanup();
      } else if (error.code === 'failed-precondition' && error.message?.includes('index')) {
        setMatchmakingStatus('Preparing matchmaking system...');
        return;
      } else if (error.message === 'One or both players are no longer available') {
        return;
      } else {
        setError('Failed to find opponent. Please try again.');
        cleanup();
      }
    }
  }, [user, inQueue, router, queueQuery, findBestMatch, queueTime, cleanup]);

  // Real-time player updates with optimized query
  useEffect(() => {
    if (!user) return;

    ensurePlayerDocument();

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

    // Listen for online players with optimized query
    const q = query(
      collection(db, 'players'),
      where('lastActive', '>', new Date(Date.now() - LAST_ACTIVE_THRESHOLD)),
      orderBy('lastActive', 'desc'),
      limit(50) // Limit to 50 players for better performance
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
      cleanup();
    };
  }, [user, inQueue, ensurePlayerDocument, updatePlayerStatus, cleanup]);

  // Queue timer effect with atomic updates and progressive matchmaking
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (searching && queueStartTime) {
      timer = setInterval(async () => {
        const elapsedTime = Math.floor((Date.now() - queueStartTime) / 1000);
        setQueueTime(elapsedTime);

        // Progressive matchmaking status
        if (elapsedTime < MIN_QUEUE_TIME) {
          setMatchmakingStatus('Finding optimal opponent...');
        } else if (elapsedTime < MAX_QUEUE_TIME) {
          setMatchmakingStatus('Expanding search parameters...');
          // Increase skill rating difference threshold
          MAX_SKILL_RATING_DIFF = Math.min(1000, MAX_SKILL_RATING_DIFF + 100);
        } else {
          setMatchmakingStatus('Searching in all regions...');
          // Remove region restriction
          MAX_SKILL_RATING_DIFF = 2000;
        }

        try {
          await updatePlayerStatus('searching', true);
        } catch (error) {
          console.error('Error updating queue status:', error);
          cleanup();
        }
      }, 1000);
    } else {
      setQueueTime(0);
      setQueueStartTime(null);
      setMatchmakingStatus('');
    }
    return () => clearInterval(timer);
  }, [searching, queueStartTime, updatePlayerStatus, cleanup]);

  // Check for matches periodically with exponential backoff
  useEffect(() => {
    let matchCheckInterval: NodeJS.Timeout;
    if (inQueue && searching) {
      const checkInterval = Math.min(QUEUE_CHECK_INTERVAL * Math.pow(1.5, retryCount), 30000);
      matchCheckInterval = setInterval(checkForMatches, checkInterval);
    }
    return () => {
      if (matchCheckInterval) clearInterval(matchCheckInterval);
    };
  }, [inQueue, searching, checkForMatches, retryCount]);

  const toggleQueue = async () => {
    if (!user) return;

    try {
      const newQueueState = !inQueue;
      
      // Update local state first for immediate feedback
      setInQueue(newQueueState);
      setSearching(newQueueState);
      
      if (newQueueState) {
        setQueueStartTime(Date.now());
        setMatchmakingStatus('Finding optimal opponent...');
        // Reset skill rating difference threshold
        MAX_SKILL_RATING_DIFF = 500;
      }

      // Update Firestore status
      await updatePlayerStatus(newQueueState ? 'searching' : 'online', newQueueState);

      if (newQueueState) {
        // Start checking for matches
        await checkForMatches();
      } else {
        cleanup();
      }
    } catch (error) {
      console.error('Error toggling queue:', error);
      // Revert state on error
      setInQueue(false);
      setSearching(false);
      setQueueStartTime(null);
      setQueueTime(0);
      setMatchmakingStatus('');
      setError('Failed to update queue status. Please try again.');
      cleanup();
    }
  };

  // Add a useEffect to monitor queue state changes
  useEffect(() => {
    if (inQueue && !searching) {
      setSearching(true);
    }
  }, [inQueue]);

  // Add a useEffect to handle cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

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