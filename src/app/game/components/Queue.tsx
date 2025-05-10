'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, getDoc, orderBy, onSnapshot, runTransaction } from 'firebase/firestore';

interface QueueProps {
  onMatchFound: (opponent: any) => void;
  onQueueUpdate: (inQueue: boolean) => void;
}

interface Player {
  id: string;
  uid: string;
  username?: string;
  email?: string;
  power: number;
  inQueue: boolean;
  currentOpponent?: string;
  lastMatch?: any;
  status?: 'online' | 'offline' | 'in_game';
}

export default function Queue({ onMatchFound, onQueueUpdate }: QueueProps) {
  const { user } = useAuth();
  const [isInQueue, setIsInQueue] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [queueTimer, setQueueTimer] = useState<NodeJS.Timeout | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [friendUsername, setFriendUsername] = useState('');
  const [isDirectChallenge, setIsDirectChallenge] = useState(false);
  const [challengeStatus, setChallengeStatus] = useState<'none' | 'sent' | 'received'>('none');
  const [challengeFrom, setChallengeFrom] = useState<string | null>(null);
  const [challengeTimeout, setChallengeTimeout] = useState<NodeJS.Timeout | null>(null);
  const [recentOpponents, setRecentOpponents] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add log with timestamp
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setBattleLog(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // Queue timeout effect with improved cleanup
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isInQueue && !isDirectChallenge) {
      timer = setInterval(() => {
        setQueueTime(prev => prev + 1);
        setEstimatedTime(Math.max(0, estimatedTime - 1));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isInQueue, isDirectChallenge, estimatedTime]);

  // Challenge timeout effect
  useEffect(() => {
    if (challengeStatus === 'sent') {
      const timeout = setTimeout(() => {
        if (challengeStatus === 'sent') {
          rejectChallenge();
          addLog('Challenge timed out');
        }
      }, 30000); // 30 second timeout
      setChallengeTimeout(timeout);
    }
    return () => {
      if (challengeTimeout) clearTimeout(challengeTimeout);
    };
  }, [challengeStatus]);

  // Real-time queue position updates with improved matching
  useEffect(() => {
    if (!user || !isInQueue || isDirectChallenge) return;

    const q = query(
      collection(db, 'players'),
      where('inQueue', '==', true),
      where('currentOpponent', '==', null),
      where('status', '==', 'online')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const players = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Player));

      const position = players.findIndex(p => p.uid === user.uid) + 1;
      setQueuePosition(position);
      
      // Improved time estimation based on queue size and position
      const baseTime = 30;
      const queueSize = players.length;
      const positionMultiplier = Math.max(1, position / Math.max(1, queueSize / 2));
      setEstimatedTime(Math.ceil(baseTime * positionMultiplier));

      // Improved matching algorithm
      if (players.length > 1) {
        const potentialOpponents = players.filter(p => p.uid !== user.uid);
        if (potentialOpponents.length > 0) {
          // Try to match with similar power level first
          const playerPower = players.find(p => p.uid === user.uid)?.power || 0;
          const sortedOpponents = potentialOpponents.sort((a, b) => {
            const powerDiffA = Math.abs((a.power || 0) - playerPower);
            const powerDiffB = Math.abs((b.power || 0) - playerPower);
            return powerDiffA - powerDiffB;
          });

          // Take the closest power match or random if no good match
          const selectedOpponent = sortedOpponents[0];
          handleMatchFound(selectedOpponent);
        }
      }
    });

    return () => unsubscribe();
  }, [user, isInQueue, isDirectChallenge]);

  // Real-time challenge updates with improved state management
  useEffect(() => {
    if (!user) return;

    const playerRef = doc(db, 'players', user.uid);
    const unsubscribe = onSnapshot(playerRef, (doc) => {
      const playerData = doc.data();
      if (playerData) {
        setIsInQueue(playerData.inQueue || false);
        setIsDirectChallenge(!!playerData.currentOpponent);
        onQueueUpdate(playerData.inQueue || false);

        // Check for incoming challenges
        if (playerData.currentOpponent && !playerData.inQueue) {
          setChallengeStatus('received');
          setChallengeFrom(playerData.currentOpponent);
          addLog(`Challenge received from ${playerData.currentOpponent}`);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, onQueueUpdate, addLog]);

  // Load recent opponents
  useEffect(() => {
    if (!user) return;

    const loadRecentOpponents = async () => {
      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        
        if (playerData?.lastMatches) {
          const opponentIds = playerData.lastMatches.slice(0, 5);
          const opponents = await Promise.all(
            opponentIds.map(async (id: string) => {
              const opponentDoc = await getDoc(doc(db, 'players', id));
              return { id: opponentDoc.id, ...opponentDoc.data() } as Player;
            })
          );
          setRecentOpponents(opponents);
        }
      } catch (error) {
        console.error('Error loading recent opponents:', error);
      }
    };

    loadRecentOpponents();
  }, [user]);

  const handleMatchFound = async (opponent: Player) => {
    if (!user) return;

    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const opponentRef = doc(db, 'players', opponent.uid);

        const playerDoc = await transaction.get(playerRef);
        const opponentDoc = await transaction.get(opponentRef);

        if (!playerDoc.exists() || !opponentDoc.exists()) {
          throw new Error('Player or opponent not found');
        }

        const playerData = playerDoc.data();
        const opponentData = opponentDoc.data();

        if (!playerData.inQueue || !opponentData.inQueue) {
          throw new Error('One of the players is no longer in queue');
        }

        transaction.update(playerRef, {
          inQueue: false,
          lastMatch: serverTimestamp(),
          currentOpponent: opponent.uid,
          status: 'in_game'
        });

        transaction.update(opponentRef, {
          inQueue: false,
          lastMatch: serverTimestamp(),
          currentOpponent: user.uid,
          status: 'in_game'
        });
      });

      setIsInQueue(false);
      setIsDirectChallenge(true);
      onQueueUpdate(false);
      onMatchFound(opponent);
      addLog(`Match found! You'll compete against ${opponent.username || 'Anonymous'} in a clicking speed challenge!`);
    } catch (error) {
      console.error('Error handling match:', error);
      addLog('Error finding match. Please try again.');
    }
  };

  const joinQueue = async () => {
    if (!user) return;
    if (isInQueue) {
      addLog('You are already in queue!');
      return;
    }

    setIsSearching(true);
    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await transaction.get(playerRef);

        if (!playerDoc.exists()) {
          throw new Error('Player not found');
        }

        const playerData = playerDoc.data();
        if (playerData.inQueue || playerData.currentOpponent) {
          throw new Error('Player is already in a match');
        }

        transaction.update(playerRef, {
          inQueue: true,
          lastMatch: serverTimestamp(),
          currentOpponent: null,
          status: 'online'
        });
      });

      setIsInQueue(true);
      setIsDirectChallenge(false);
      onQueueUpdate(true);
      addLog('Joined queue!');
      setQueueTime(0);
      setQueuePosition(0);
      setEstimatedTime(30);
    } catch (error) {
      console.error('Error joining queue:', error);
      addLog('Failed to join queue. Please try again.');
      setIsInQueue(false);
      onQueueUpdate(false);
    } finally {
      setIsSearching(false);
    }
  };

  const challengeFriend = async () => {
    if (!user || !friendUsername) return;
    if (isInQueue) {
      addLog('You are already in a challenge!');
      return;
    }

    setIsSearching(true);
    try {
      await runTransaction(db, async (transaction) => {
        const q = query(
          collection(db, 'players'),
          where('username', '==', friendUsername)
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          throw new Error('Friend not found');
        }

        const friendDoc = querySnapshot.docs[0];
        const friendData = friendDoc.data() as Player;

        if (friendData.uid === user.uid) {
          throw new Error('Cannot challenge yourself');
        }

        if (friendData.inQueue || friendData.currentOpponent) {
          throw new Error('Friend is already in a match');
        }

        const playerRef = doc(db, 'players', user.uid);
        const friendRef = doc(db, 'players', friendData.uid);

        transaction.update(friendRef, {
          currentOpponent: user.uid,
          status: 'online'
        });

        transaction.update(playerRef, {
          inQueue: true,
          lastMatch: serverTimestamp(),
          currentOpponent: friendData.uid,
          status: 'online'
        });
      });

      setIsInQueue(true);
      setIsDirectChallenge(true);
      setChallengeStatus('sent');
      onQueueUpdate(true);
      addLog(`Challenge sent to ${friendUsername}!`);
    } catch (error) {
      console.error('Error challenging friend:', error);
      addLog(error instanceof Error ? error.message : 'Failed to send challenge. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const acceptChallenge = async () => {
    if (!user || !challengeFrom) return;

    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const opponentRef = doc(db, 'players', challengeFrom);

        const playerDoc = await transaction.get(playerRef);
        const opponentDoc = await transaction.get(opponentRef);

        if (!playerDoc.exists() || !opponentDoc.exists()) {
          throw new Error('Player or opponent not found');
        }

        transaction.update(playerRef, {
          inQueue: true,
          lastMatch: serverTimestamp(),
          currentOpponent: challengeFrom,
          status: 'in_game'
        });

        transaction.update(opponentRef, {
          inQueue: true,
          lastMatch: serverTimestamp(),
          currentOpponent: user.uid,
          status: 'in_game'
        });
      });

      setIsInQueue(true);
      setIsDirectChallenge(true);
      setChallengeStatus('none');
      onQueueUpdate(true);
      addLog('Challenge accepted!');
    } catch (error) {
      console.error('Error accepting challenge:', error);
      addLog('Failed to accept challenge. Please try again.');
    }
  };

  const rejectChallenge = async () => {
    if (!user || !challengeFrom) return;

    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const opponentRef = doc(db, 'players', challengeFrom);

        transaction.update(playerRef, {
          inQueue: false,
          currentOpponent: null,
          status: 'online'
        });

        transaction.update(opponentRef, {
          inQueue: false,
          currentOpponent: null,
          status: 'online'
        });
      });

      setChallengeStatus('none');
      setChallengeFrom(null);
      addLog('Challenge rejected.');
    } catch (error) {
      console.error('Error rejecting challenge:', error);
      addLog('Failed to reject challenge. Please try again.');
    }
  };

  const leaveQueue = async () => {
    if (!user) return;
    
    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await transaction.get(playerRef);
        
        if (!playerDoc.exists()) {
          throw new Error('Player not found');
        }

        const playerData = playerDoc.data();
        transaction.update(playerRef, {
          inQueue: false,
          lastMatch: serverTimestamp(),
          currentOpponent: null,
          status: 'online'
        });

        if (playerData.currentOpponent) {
          const opponentRef = doc(db, 'players', playerData.currentOpponent);
          transaction.update(opponentRef, {
            inQueue: false,
            lastMatch: serverTimestamp(),
            currentOpponent: null,
            status: 'online'
          });
        }
      });

      // Clear any existing timers
      if (queueTimer) {
        clearInterval(queueTimer);
        setQueueTimer(null);
      }
      if (challengeTimeout) {
        clearTimeout(challengeTimeout);
        setChallengeTimeout(null);
      }

      // Reset all queue-related state
      setIsInQueue(false);
      setIsDirectChallenge(false);
      setQueueTime(0);
      setQueuePosition(0);
      setEstimatedTime(0);
      setFriendUsername('');
      setChallengeStatus('none');
      setChallengeFrom(null);
      addLog('Left the queue');
      onQueueUpdate(false);
    } catch (error) {
      console.error('Error leaving queue:', error);
      // Try to force reset the queue state even if the update fails
      setIsInQueue(false);
      setIsDirectChallenge(false);
      onQueueUpdate(false);
      addLog('Failed to leave queue. Please try again.');
    }
  };

  const challengeRecentOpponent = (opponent: Player) => {
    setFriendUsername(opponent.username || '');
    challengeFriend();
  };

  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 space-y-4">
        <div className="text-gray-300 text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6 space-y-4">
      <h2 className="text-2xl font-press-start text-gray-200 text-center">
        Clicking Speed Challenge
      </h2>

      {challengeStatus === 'received' && (
        <div className="space-y-4">
          <div className="text-gray-300 text-center text-lg">
            Challenge from {challengeFrom}!
          </div>
          <div className="flex space-x-4">
            <button
              onClick={acceptChallenge}
              className="flex-1 px-6 py-4 bg-gray-700 text-white rounded-lg font-press-start hover:bg-gray-600 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={rejectChallenge}
              className="flex-1 px-6 py-4 bg-gray-900 border-2 border-gray-700 text-gray-300 rounded-lg font-press-start hover:bg-gray-800 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {!isInQueue && challengeStatus === 'none' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <input
              type="text"
              value={friendUsername}
              onChange={(e) => setFriendUsername(e.target.value)}
              placeholder="Enter friend's username"
              className="w-full px-4 py-2 bg-gray-800 border-2 border-gray-700 text-gray-200 rounded-lg font-press-start text-sm focus:outline-none focus:border-gray-600"
            />
          </div>
          <div className="flex space-x-4">
            <button
              onClick={challengeFriend}
              disabled={isSearching || !friendUsername}
              className="flex-1 px-6 py-4 bg-gray-700 text-white rounded-lg font-press-start hover:bg-gray-600 transition-colors disabled:opacity-50 text-lg"
            >
              {isSearching ? 'Sending Challenge...' : 'Challenge Friend'}
            </button>
            <button
              onClick={joinQueue}
              disabled={isSearching}
              className="flex-1 px-6 py-4 bg-gray-800 text-white rounded-lg font-press-start hover:bg-gray-700 transition-colors disabled:opacity-50 text-lg"
            >
              {isSearching ? 'Searching...' : 'Quick Match'}
            </button>
          </div>

          {recentOpponents.length > 0 && (
            <div className="mt-4">
              <h3 className="text-gray-400 font-press-start text-sm mb-2">Recent Opponents:</h3>
              <div className="space-y-2">
                {recentOpponents.map((opponent) => (
                  <button
                    key={opponent.uid}
                    onClick={() => challengeRecentOpponent(opponent)}
                    className="w-full px-4 py-2 bg-gray-800 text-gray-300 rounded-lg font-press-start hover:bg-gray-700 transition-colors text-sm"
                  >
                    {opponent.username || 'Anonymous'} (Power: {opponent.power || 0})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isInQueue && (
        <div className="space-y-4">
          <div className="text-gray-300 text-center text-lg">
            {isDirectChallenge ? 'Challenge in Progress!' : 'Searching for Opponent...'}
          </div>
          {!isDirectChallenge && (
            <div className="space-y-2">
              <div className="text-gray-400 text-center">
                Queue Position: {queuePosition}
              </div>
              <div className="text-gray-400 text-center">
                Estimated Time: {estimatedTime}s
              </div>
            </div>
          )}
          <div className="text-gray-400 text-center">
            Time: {queueTime}s
          </div>
          <button
            onClick={leaveQueue}
            className="w-full px-6 py-4 bg-gray-900 border-2 border-gray-700 text-gray-300 rounded-lg font-press-start hover:bg-gray-800 transition-colors text-lg"
          >
            {isDirectChallenge ? 'Cancel Challenge' : 'Leave Queue'}
          </button>
        </div>
      )}

      {/* Battle Log */}
      <div className="mt-4 space-y-2">
        <h3 className="text-gray-400 font-press-start text-sm">Status:</h3>
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 h-32 overflow-y-auto">
          {battleLog.map((log, index) => (
            <div key={index} className="text-gray-300 font-press-start text-xs">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 