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
const REGION_PRIORITY = 0.7; // Weight for region matching (0-1)
const SKILL_PRIORITY = 0.3; // Weight for skill matching (0-1)
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // Start with 1 second
const MAX_RECONNECT_DELAY = 10000; // Max 10 seconds

type FirebaseErrorCode = 
  | 'permission-denied'
  | 'resource-exhausted'
  | 'unavailable'
  | 'deadline-exceeded'
  | 'failed-precondition'
  | 'aborted'
  | 'already-exists'
  | 'not-found'
  | 'internal'
  | 'unimplemented'
  | 'unauthenticated'
  | 'invalid-argument';

const STATUS_MESSAGES = {
  // Connection States
  CONNECTING: 'Connecting to game server...',
  CONNECTED: 'Connected to game server',
  DISCONNECTED: 'Disconnected from game server',
  RECONNECTING: 'Reconnecting to game server...',
  RECONNECT_ATTEMPT: (attempt: number) => `Reconnection attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}...`,
  
  // Queue States
  QUEUE_SEARCHING: 'Searching for opponents...',
  QUEUE_EXPANDING: 'Expanding search parameters...',
  QUEUE_WAITING: 'Waiting for more players...',
  QUEUE_SKILL_EXPAND: (diff: number) => `Expanding skill range to ±${diff} points...`,
  QUEUE_REGION_EXPAND: 'Searching in all regions...',
  
  // Error Messages
  ERROR_CONNECTION: 'Connection error. Attempting to reconnect...',
  ERROR_PERMISSION: 'Permission denied. Please check your account.',
  ERROR_RATE_LIMIT: 'Too many requests. Please wait a moment.',
  ERROR_UNKNOWN: 'An unexpected error occurred. Please try again.',
  ERROR_FIREBASE: {
    'permission-denied': 'Access denied. Please check your account permissions.',
    'resource-exhausted': 'Rate limit exceeded. Please wait a moment.',
    'unavailable': 'Service temporarily unavailable. Retrying...',
    'deadline-exceeded': 'Request timed out. Retrying...',
    'failed-precondition': 'Invalid operation state. Please refresh.',
    'aborted': 'Operation aborted. Retrying...',
    'already-exists': 'Resource already exists. Please refresh.',
    'not-found': 'Resource not found. Please refresh.',
    'internal': 'Internal server error. Please try again.',
    'unimplemented': 'Feature not implemented. Please contact support.',
    'unauthenticated': 'Please sign in to continue.',
    'invalid-argument': 'Invalid request. Please refresh.',
  } as const,
  
  // Success Messages
  SUCCESS_CONNECTED: 'Successfully connected to game server',
  SUCCESS_QUEUE_JOINED: 'Successfully joined matchmaking queue',
  SUCCESS_QUEUE_LEFT: 'Successfully left matchmaking queue',
  
  // Loading States
  LOADING_PLAYERS: 'Loading player data...',
  LOADING_MATCH: 'Finding match...',
  LOADING_UPDATE: 'Updating status...',
};

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
  const [connectionStatus, setConnectionStatus] = useState<string>(STATUS_MESSAGES.CONNECTING);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastError, setLastError] = useState<{message: string; code?: string} | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setInQueue(false);
    setSearching(false);
    setQueueStartTime(null);
    setQueueTime(0);
    setRetryCount(0);
    setMatchmakingStatus('');
    setReconnectAttempts(0);
    setIsReconnecting(false);
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
      } else {
        // Update last active timestamp
        await updateDoc(playerRef, {
          lastActive: serverTimestamp(),
          status: 'online'
        });
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

  // Find best match based on skill rating and region with weighted scoring
  const findBestMatch = useCallback((availablePlayers: Player[], currentPlayer: Player) => {
    return availablePlayers
      .filter(player => {
        const skillDiff = Math.abs((player.skillRating || 1000) - (currentPlayer.skillRating || 1000));
        return skillDiff <= MAX_SKILL_RATING_DIFF;
      })
      .map(player => {
        const skillDiff = Math.abs((player.skillRating || 1000) - (currentPlayer.skillRating || 1000));
        const sameRegion = player.region === currentPlayer.region;
        
        // Calculate match score (lower is better)
        const skillScore = skillDiff / MAX_SKILL_RATING_DIFF;
        const regionScore = sameRegion ? 0 : 1;
        
        const totalScore = (skillScore * SKILL_PRIORITY) + (regionScore * REGION_PRIORITY);
        
        return {
          player,
          score: totalScore
        };
      })
      .sort((a, b) => a.score - b.score)[0]?.player;
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
            const opponent = findBestMatch(availablePlayers, currentPlayer);
            
            if (!opponent) {
              // No suitable match found within skill range
              return { success: false, reason: 'no_suitable_match' };
            }
            
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

          return { success: false, reason: 'no_players' };
        });
      });

      if (result.success) {
        cleanup();
        router.push(`/combat?match=${result.matchId}`);
      } else if (result.reason === 'no_suitable_match') {
        // Increase skill rating difference threshold if no suitable match found
        MAX_SKILL_RATING_DIFF = Math.min(2000, MAX_SKILL_RATING_DIFF + 100);
        setMatchmakingStatus('Expanding search parameters...');
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

  // Enhanced reconnection mechanism with exponential backoff
  const attemptReconnect = useCallback(async () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setError('Failed to connect after multiple attempts. Please refresh the page.');
      setIsReconnecting(false);
      return;
    }

    setIsReconnecting(true);
    const currentAttempt = reconnectAttempts + 1;
    setReconnectAttempts(currentAttempt);
    setConnectionStatus(STATUS_MESSAGES.RECONNECT_ATTEMPT(currentAttempt));

    try {
      await ensurePlayerDocument();
      setConnectionStatus(STATUS_MESSAGES.SUCCESS_CONNECTED);
      setIsReconnecting(false);
      setReconnectAttempts(0);
      setLastError(null);
    } catch (error) {
      console.error('Reconnection attempt failed:', error);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY * Math.pow(2, currentAttempt) + Math.random() * 1000,
        MAX_RECONNECT_DELAY
      );
      
      reconnectTimeoutRef.current = setTimeout(attemptReconnect, delay);
    }
  }, [reconnectAttempts, ensurePlayerDocument]);

  // Enhanced error handling with specific messages
  const handleError = useCallback((error: any, context: string) => {
    console.error(`Error in ${context}:`, error);
    
    const errorCode = error.code as FirebaseErrorCode;
    const errorMessage = errorCode && STATUS_MESSAGES.ERROR_FIREBASE[errorCode]
      ? STATUS_MESSAGES.ERROR_FIREBASE[errorCode]
      : STATUS_MESSAGES.ERROR_UNKNOWN;
    
    setLastError({ message: errorMessage, code: errorCode });
    
    if (errorCode === 'permission-denied') {
      setError(errorMessage);
    } else if (errorCode === 'resource-exhausted') {
      setError(errorMessage);
    } else if (errorCode === 'unavailable' || errorCode === 'deadline-exceeded') {
      setConnectionStatus(STATUS_MESSAGES.ERROR_CONNECTION);
      attemptReconnect();
    } else {
      setError(errorMessage);
    }
  }, [attemptReconnect]);

  // Enhanced real-time updates with reconnection
  useEffect(() => {
    if (!user) return;

    let unsubscribe: (() => void) | undefined;

    const setupRealtimeUpdates = async () => {
      try {
        await ensurePlayerDocument();
        setConnectionStatus(STATUS_MESSAGES.CONNECTED);

        const updateLastActive = async () => {
          try {
            if (Date.now() - lastUpdateRef.current < LAST_ACTIVE_THRESHOLD) {
              return;
            }
            await updatePlayerStatus(inQueue ? 'searching' : 'online', inQueue);
            lastUpdateRef.current = Date.now();
          } catch (error) {
            handleError(error, 'updateLastActive');
          }
        };

        const interval = setInterval(updateLastActive, LAST_ACTIVE_THRESHOLD);
        updateLastActive();

        const q = query(
          collection(db, 'players'),
          where('lastActive', '>', new Date(Date.now() - LAST_ACTIVE_THRESHOLD)),
          orderBy('lastActive', 'desc'),
          limit(50)
        );

        unsubscribe = onSnapshot(q, 
          (snapshot) => {
            const onlinePlayers = snapshot.docs
              .map(doc => ({ uid: doc.id, ...doc.data() } as Player))
              .filter(player => 
                player.uid !== user.uid && 
                player.lastActive?.toMillis() > Date.now() - LAST_ACTIVE_THRESHOLD
              );
            setPlayers(onlinePlayers);
            setLoading(false);
            setConnectionStatus(STATUS_MESSAGES.CONNECTED);
          },
          (error) => {
            handleError(error, 'realtime-updates');
          }
        );
        
        return () => {
          clearInterval(interval);
          if (unsubscribe) unsubscribe();
          cleanup();
        };
      } catch (error) {
        handleError(error, 'setup-realtime-updates');
      }
    };

    setupRealtimeUpdates();

    return () => {
      if (unsubscribe) unsubscribe();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      cleanup();
    };
  }, [user, inQueue, ensurePlayerDocument, updatePlayerStatus, cleanup, handleError]);

  // Enhanced queue status messages with more detail
  useEffect(() => {
    if (searching && queueStartTime) {
      const elapsedTime = Math.floor((Date.now() - queueStartTime) / 1000);
      
      if (elapsedTime < MIN_QUEUE_TIME) {
        setMatchmakingStatus(STATUS_MESSAGES.QUEUE_SEARCHING);
      } else if (elapsedTime < MAX_QUEUE_TIME) {
        const newSkillDiff = Math.min(1000, MAX_SKILL_RATING_DIFF + 100);
        setMatchmakingStatus(STATUS_MESSAGES.QUEUE_SKILL_EXPAND(newSkillDiff));
        MAX_SKILL_RATING_DIFF = newSkillDiff;
      } else {
        setMatchmakingStatus(STATUS_MESSAGES.QUEUE_REGION_EXPAND);
        MAX_SKILL_RATING_DIFF = 2000;
      }
    }
  }, [searching, queueStartTime]);

  // Enhanced toggle queue with better feedback
  const toggleQueue = async () => {
    if (!user) return;

    try {
      const newQueueState = !inQueue;
      
      setInQueue(newQueueState);
      setSearching(newQueueState);
      
      if (newQueueState) {
        setQueueStartTime(Date.now());
        setMatchmakingStatus(STATUS_MESSAGES.QUEUE_SEARCHING);
        MAX_SKILL_RATING_DIFF = 500;
      }

      await updatePlayerStatus(newQueueState ? 'searching' : 'online', newQueueState);
      setConnectionStatus(newQueueState ? STATUS_MESSAGES.SUCCESS_QUEUE_JOINED : STATUS_MESSAGES.SUCCESS_QUEUE_LEFT);

      if (newQueueState) {
        await checkForMatches();
      } else {
        cleanup();
      }
    } catch (error) {
      handleError(error, 'toggle-queue');
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

  // Enhanced loading state UI with more detail
  if (loading) {
    return (
      <div className="text-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-pink mx-auto"></div>
        <p className="text-cyber-blue mt-2">{connectionStatus}</p>
        {lastError && (
          <p className="text-cyber-red text-sm mt-2">
            Last error: {lastError.message}
          </p>
        )}
      </div>
    );
  }

  // Enhanced error state UI with more options
  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center p-4"
      >
        <p className="text-cyber-red">{error}</p>
        {lastError?.code && (
          <p className="text-cyber-blue text-sm mt-1">
            Error code: {lastError.code}
          </p>
        )}
        <div className="mt-4 space-x-4">
          <button
            onClick={() => {
              setError(null);
              attemptReconnect();
            }}
            className="px-4 py-2 bg-cyber-pink text-white rounded-lg hover:bg-pink-700 transition-colors"
          >
            Retry Connection
          </button>
          <button
            onClick={() => {
              setError(null);
              cleanup();
            }}
            className="px-4 py-2 bg-cyber-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-cyber-yellow text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
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
          <div className="mb-2 text-sm text-cyber-blue">
            {connectionStatus}
          </div>
          {lastError && !error && (
            <div className="mb-2 text-sm text-cyber-yellow">
              Last error: {lastError.message}
            </div>
          )}
          <button
            onClick={toggleQueue}
            disabled={searching || isReconnecting}
            className={`w-full px-6 py-3 rounded-lg font-press-start transition-all duration-300 ${
              inQueue
                ? 'bg-cyber-red text-white hover:bg-red-700'
                : 'bg-cyber-pink text-white hover:bg-pink-700'
            } ${(searching || isReconnecting) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {searching ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Searching... {formatTime(queueTime)}</span>
              </div>
            ) : isReconnecting ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Reconnecting... ({reconnectAttempts}/{MAX_RECONNECT_ATTEMPTS})</span>
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
                      {player.skillRating && (
                        <p className="text-cyber-blue text-sm">Skill: {player.skillRating}</p>
                      )}
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