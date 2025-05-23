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

const MATCHMAKING_CONFIG = {
  MIN_QUEUE_TIME: 30, // 30 seconds minimum queue time
  MAX_QUEUE_TIME: 300, // 5 minutes maximum queue time
  CHECK_INTERVAL: 5000, // Check for matches every 5 seconds
  MAX_SKILL_DIFF: 500, // Maximum skill rating difference
  MAX_PLAYERS_PER_QUERY: 50, // Maximum players to fetch at once
  REGIONS: ['global', 'na', 'eu', 'asia'] as const,
  DEFAULT_SKILL: 1000,
  DEFAULT_REGION: 'global',
  ONLINE_UPDATE_INTERVAL: 10000, // Update online players every 10 seconds
  LAST_ACTIVE_THRESHOLD: 30000 // 30 seconds
} as const;

type Region = typeof MATCHMAKING_CONFIG.REGIONS[number];

interface MatchmakingPlayer {
  uid: string;
  username: string;
  avatar: string;
  skillRating: number;
  region: Region;
  inQueue: boolean;
  lastActive: any;
  status: 'online' | 'searching' | 'in_match';
  currentMatch?: string | null;
  power: number;
  pendingChallenge?: string | null;
}

export default function Queue() {
  const { user } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<MatchmakingPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [queueStartTime, setQueueStartTime] = useState<number | null>(null);
  const [matchmakingStatus, setMatchmakingStatus] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<string>(STATUS_MESSAGES.CONNECTING);
  const [lastError, setLastError] = useState<{message: string; code?: string} | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [lastOnlineUpdate, setLastOnlineUpdate] = useState(0);
  
  const queueTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const matchCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const onlineUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (queueTimeoutRef.current) {
      clearTimeout(queueTimeoutRef.current);
      queueTimeoutRef.current = null;
    }
    if (matchCheckIntervalRef.current) {
      clearInterval(matchCheckIntervalRef.current);
      matchCheckIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setInQueue(false);
    setQueueStartTime(null);
    setQueueTime(0);
    setMatchmakingStatus('');
    setReconnectAttempts(0);
    setIsReconnecting(false);
  }, []);

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize player document
  const initializePlayer = useCallback(async (): Promise<void> => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);

      if (!playerDoc.exists()) {
        const newPlayerData: MatchmakingPlayer = {
          uid: user.uid,
          username: user.displayName || user.email?.split('@')[0] || 'Anonymous',
          avatar: user.photoURL || DEFAULT_AVATAR,
          skillRating: MATCHMAKING_CONFIG.DEFAULT_SKILL,
          region: MATCHMAKING_CONFIG.DEFAULT_REGION,
          inQueue: false,
          lastActive: serverTimestamp(),
          status: 'online',
          currentMatch: null,
          power: 0
        };
        await setDoc(playerRef, newPlayerData);
        setPlayers([newPlayerData]);
      } else {
        // Update lastActive and status for existing players
        await updateDoc(playerRef, {
          lastActive: serverTimestamp(),
          status: 'online',
          inQueue: false,
          currentMatch: null
        });
      }
    } catch (error) {
      handleError(error, 'initialize-player');
    }
  }, [user]);

  // Enhanced reconnection mechanism with exponential backoff
  const attemptReconnect = useCallback(async (): Promise<void> => {
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
      await initializePlayer();
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
      
      reconnectTimeoutRef.current = setTimeout(() => attemptReconnect(), delay);
    }
  }, [reconnectAttempts, initializePlayer]);

  // Enhanced error handling with specific messages
  const handleError = useCallback((error: any, context: string): void => {
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

  // Toggle queue
  const toggleQueue = async (): Promise<void> => {
    if (!user) return;

    try {
      const newQueueState = !inQueue;
      setInQueue(newQueueState);
      setSearching(newQueueState);
      
      if (newQueueState) {
        setQueueStartTime(Date.now());
        setMatchmakingStatus('Finding optimal opponent...');
      }

      await updatePlayerStatus(newQueueState ? 'searching' : 'online', newQueueState);

      if (!newQueueState) {
        cleanup();
      }
    } catch (error) {
      handleError(error, 'toggle-queue');
      cleanup();
    }
  };

  // Update player status
  const updatePlayerStatus = useCallback(async (status: MatchmakingPlayer['status'], inQueue: boolean) => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        status,
        inQueue,
        lastActive: serverTimestamp()
      });
    } catch (error) {
      handleError(error, 'update-status');
    }
  }, [user]);

  // Optimized real-time player updates with rate limiting
  useEffect(() => {
    if (!user) return;

    const setupRealtimeUpdates = async () => {
      try {
        await initializePlayer();
        setConnectionStatus(STATUS_MESSAGES.CONNECTED);

        // Initial fetch
        await updateOnlinePlayers();

        // Set up periodic updates
        onlineUpdateTimeoutRef.current = setInterval(updateOnlinePlayers, MATCHMAKING_CONFIG.ONLINE_UPDATE_INTERVAL);

        return () => {
          if (onlineUpdateTimeoutRef.current) {
            clearInterval(onlineUpdateTimeoutRef.current);
          }
        };
      } catch (error) {
        handleError(error, 'setup-realtime-updates');
        return () => {};
      }
    };

    const updateOnlinePlayers = async () => {
      const now = Date.now();
      if (now - lastOnlineUpdate < MATCHMAKING_CONFIG.ONLINE_UPDATE_INTERVAL) {
        return; // Skip if not enough time has passed
      }

      try {
        // Update current player's lastActive and status
        if (user) {
          const playerRef = doc(db, 'players', user.uid);
          await updateDoc(playerRef, {
            lastActive: serverTimestamp(),
            status: 'online'
          });
        }

        // Query for online players
        const q = query(
          collection(db, 'players'),
          where('lastActive', '>', new Date(now - MATCHMAKING_CONFIG.LAST_ACTIVE_THRESHOLD)),
          where('status', '==', 'online'),
          orderBy('lastActive', 'desc'),
          limit(MATCHMAKING_CONFIG.MAX_PLAYERS_PER_QUERY)
        );

        const snapshot = await getDocs(q);
        const onlinePlayers = snapshot.docs
          .map(doc => ({ uid: doc.id, ...doc.data() } as MatchmakingPlayer))
          .filter(player => player.uid !== user.uid);
        
        setPlayers(onlinePlayers);
        setOnlineCount(onlinePlayers.length);
        setLastOnlineUpdate(now);
        setLoading(false);
      } catch (error) {
        handleError(error, 'update-online-players');
      }
    };

    const unsubscribe = setupRealtimeUpdates();
    return () => {
      unsubscribe.then(unsub => unsub());
      if (onlineUpdateTimeoutRef.current) {
        clearInterval(onlineUpdateTimeoutRef.current);
      }
    };
  }, [user, initializePlayer, lastOnlineUpdate]);

  // Add cleanup effect for when component unmounts
  useEffect(() => {
    return () => {
      if (user) {
        const playerRef = doc(db, 'players', user.uid);
        updateDoc(playerRef, {
          status: 'offline',
          lastActive: serverTimestamp()
        }).catch(error => {
          console.error('Error updating player status on unmount:', error);
        });
      }
    };
  }, [user]);

  // Optimized match finding with caching
  const findMatch = useCallback(async () => {
    if (!user || !inQueue) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      
      if (!playerDoc.exists()) {
        throw new Error('Player not found');
      }

      const currentPlayer = playerDoc.data() as MatchmakingPlayer;

      // Use existing online players list first
      const availablePlayers = players
        .filter(player => 
          player.inQueue && 
          player.status === 'searching' &&
          !player.currentMatch &&
          Math.abs(player.skillRating - currentPlayer.skillRating) <= MATCHMAKING_CONFIG.MAX_SKILL_DIFF
        );

      if (availablePlayers.length === 0) {
        // Only query Firestore if no matches found in cached list
        const q = query(
          collection(db, 'players'),
          where('inQueue', '==', true),
          where('status', '==', 'searching'),
          limit(MATCHMAKING_CONFIG.MAX_PLAYERS_PER_QUERY)
        );

        const snapshot = await getDocs(q);
        const firestorePlayers = snapshot.docs
          .map(doc => ({ uid: doc.id, ...doc.data() } as MatchmakingPlayer))
          .filter(player => 
            player.uid !== user.uid && 
            !player.currentMatch &&
            Math.abs(player.skillRating - currentPlayer.skillRating) <= MATCHMAKING_CONFIG.MAX_SKILL_DIFF
          );

        if (firestorePlayers.length === 0) {
          setMatchmakingStatus('No suitable matches found. Expanding search...');
          return;
        }

        // Use the best match from Firestore results
        const bestMatch = firestorePlayers.reduce((best, current) => {
          const currentDiff = Math.abs(current.skillRating - currentPlayer.skillRating);
          const bestDiff = Math.abs(best.skillRating - currentPlayer.skillRating);
          return currentDiff < bestDiff ? current : best;
        });

        await createMatch(currentPlayer, bestMatch);
      } else {
        // Use the best match from cached results
        const bestMatch = availablePlayers.reduce((best, current) => {
          const currentDiff = Math.abs(current.skillRating - currentPlayer.skillRating);
          const bestDiff = Math.abs(best.skillRating - currentPlayer.skillRating);
          return currentDiff < bestDiff ? current : best;
        });

        await createMatch(currentPlayer, bestMatch);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('left the queue')) {
        setMatchmakingStatus('Opponent left the queue, searching for a new match...');
        // Optionally, add a short delay before retrying
        setTimeout(() => findMatch(), 2000);
      } else if (error.code === 'failed-precondition') {
        setError('Matchmaking system is being updated. Please try again in a moment.');
        setLastError({ 
          message: 'The matchmaking system requires an update. Please try again.', 
          code: error.code 
        });
        cleanup();
      } else {
        handleError(error, 'find-match');
      }
    }
  }, [user, inQueue, cleanup, router, players]);

  // Helper function to create match
  const createMatch = async (currentPlayer: MatchmakingPlayer, bestMatch: MatchmakingPlayer) => {
    const matchRef = doc(collection(db, 'matches'));
    const matchData = {
      player1Id: user!.uid,
      player2Id: bestMatch.uid,
      player1Username: currentPlayer.username,
      player2Username: bestMatch.username,
      player1SkillRating: currentPlayer.skillRating,
      player2SkillRating: bestMatch.skillRating,
      status: 'in_progress',
      createdAt: serverTimestamp(),
      winner: null,
      moves: [],
      lastMove: null,
      lastUpdate: serverTimestamp()
    };

    await runTransaction(db, async (transaction) => {
      const player1Doc = await transaction.get(doc(db, 'players', user!.uid));
      const player2Doc = await transaction.get(doc(db, 'players', bestMatch.uid));

      if (!player1Doc.exists() || !player2Doc.exists()) {
        throw new Error('One or both players no longer available');
      }

      const player1Data = player1Doc.data() as MatchmakingPlayer;
      const player2Data = player2Doc.data() as MatchmakingPlayer;

      if (!player1Data.inQueue || !player2Data.inQueue) {
        throw new Error('One or both players left the queue');
      }

      transaction.set(matchRef, matchData);
      transaction.update(doc(db, 'players', user!.uid), {
        inQueue: false,
        currentMatch: matchRef.id,
        status: 'in_match',
        lastActive: serverTimestamp()
      });
      transaction.update(doc(db, 'players', bestMatch.uid), {
        inQueue: false,
        currentMatch: matchRef.id,
        status: 'in_match',
        lastActive: serverTimestamp()
      });
    });

    cleanup();
    router.push(`/combat?match=${matchRef.id}`);
  };

  // Queue timer effect
  useEffect(() => {
    if (inQueue && queueStartTime) {
      queueTimeoutRef.current = setInterval(() => {
        const elapsedTime = Math.floor((Date.now() - queueStartTime) / 1000);
        setQueueTime(elapsedTime);

        if (elapsedTime < MATCHMAKING_CONFIG.MIN_QUEUE_TIME) {
          setMatchmakingStatus('Finding optimal opponent...');
        } else if (elapsedTime < MATCHMAKING_CONFIG.MAX_QUEUE_TIME) {
          setMatchmakingStatus('Expanding search parameters...');
        } else {
          setMatchmakingStatus('Searching in all regions...');
        }
      }, 1000);
    }

    return () => {
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current);
      }
    };
  }, [inQueue, queueStartTime]);

  // Match checking effect
  useEffect(() => {
    if (inQueue) {
      matchCheckIntervalRef.current = setInterval(findMatch, MATCHMAKING_CONFIG.CHECK_INTERVAL);
    }

    return () => {
      if (matchCheckIntervalRef.current) {
        clearInterval(matchCheckIntervalRef.current);
      }
    };
  }, [inQueue, findMatch]);

  // Add challenge function
  const challengePlayer = async (opponentId: string): Promise<void> => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const opponentRef = doc(db, 'players', opponentId);
      
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        const opponentDoc = await transaction.get(opponentRef);

        if (!playerDoc.exists() || !opponentDoc.exists()) {
          throw new Error('One or both players not found');
        }

        const playerData = playerDoc.data() as MatchmakingPlayer;
        const opponentData = opponentDoc.data() as MatchmakingPlayer;

        if (opponentData.status !== 'online' || opponentData.inQueue || opponentData.currentMatch) {
          throw new Error('Opponent is not available for challenge');
        }

        // Set pending challenge
        transaction.update(opponentRef, {
          pendingChallenge: user.uid
        });

        setMatchmakingStatus(`Challenge sent to ${opponentData.username}`);
      });
    } catch (error) {
      handleError(error, 'challenge-player');
    }
  };

  // Add accept challenge function
  const acceptChallenge = async (challengerId: string): Promise<void> => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const challengerRef = doc(db, 'players', challengerId);
      const matchRef = doc(collection(db, 'matches'));
      const matchId = matchRef.id;
      
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        const challengerDoc = await transaction.get(challengerRef);

        if (!playerDoc.exists() || !challengerDoc.exists()) {
          throw new Error('One or both players not found');
        }

        const playerData = playerDoc.data() as MatchmakingPlayer;
        const challengerData = challengerDoc.data() as MatchmakingPlayer;

        if (playerData.pendingChallenge !== challengerId) {
          throw new Error('Invalid challenge');
        }

        // Create match
        const matchData = {
          player1Id: challengerId,
          player2Id: user.uid,
          player1Username: challengerData.username,
          player2Username: playerData.username,
          player1SkillRating: challengerData.skillRating,
          player2SkillRating: playerData.skillRating,
          status: 'in_progress',
          createdAt: serverTimestamp(),
          winner: null,
          moves: [],
          lastMove: null,
          lastUpdate: serverTimestamp()
        };

        transaction.set(matchRef, matchData);
        transaction.update(challengerRef, {
          inQueue: false,
          currentMatch: matchId,
          status: 'in_match',
          lastActive: serverTimestamp()
        });
        transaction.update(playerRef, {
          inQueue: false,
          currentMatch: matchId,
          status: 'in_match',
          lastActive: serverTimestamp(),
          pendingChallenge: null
        });
      });

      cleanup();
      router.push(`/combat?match=${matchId}`);
    } catch (error) {
      handleError(error, 'accept-challenge');
    }
  };

  // Add reject challenge function
  const rejectChallenge = async (challengerId: string): Promise<void> => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        pendingChallenge: null
      });
    } catch (error) {
      handleError(error, 'reject-challenge');
    }
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
          <div className="mb-2 text-sm text-cyber-green">
            Online Players: {onlineCount}
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
                  <div className="flex items-center space-x-2">
                    {player.inQueue && (
                      <span className="px-2 py-1 bg-cyber-green text-white text-sm rounded animate-pulse">
                        In Queue
                      </span>
                    )}
                    {player.uid !== user?.uid && player.status === 'online' && !player.inQueue && !player.currentMatch && (
                      <button
                        onClick={() => challengePlayer(player.uid)}
                        className="px-3 py-1 bg-cyber-yellow text-white text-sm rounded hover:bg-yellow-600 transition-colors"
                      >
                        Challenge
                      </button>
                    )}
                    {player.pendingChallenge === user?.uid && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => acceptChallenge(player.uid)}
                          className="px-3 py-1 bg-cyber-green text-white text-sm rounded hover:bg-green-600 transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => rejectChallenge(player.uid)}
                          className="px-3 py-1 bg-cyber-red text-white text-sm rounded hover:bg-red-600 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
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