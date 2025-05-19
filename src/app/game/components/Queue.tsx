import React, { useState, useEffect, useCallback } from 'react';
import {
  doc,
  runTransaction,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot, // For real-time listeners
  serverTimestamp,
  FieldValue,
  limit, // For limiting query results  
  setDoc
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';
import { useRouter } from 'next/navigation';
import { getIdToken, signInWithCustomToken } from 'firebase/auth';
import { DocumentData } from 'firebase/firestore';

// --- Interfaces ---
interface Player {
  uid: string;
  username: string;
  email?: string;
  inQueue?: boolean;
  currentOpponent?: string | null;
  status?: 'online' | 'in_game' | 'offline' | 'challenging';
  lastMatch?: FieldValue;
  challengeFrom?: string | null;
  power?: number;
  wins?: number;
  losses?: number;
}

interface User {
  uid: string;
  email: string | null;
  displayName?: string | null;
}

interface QueueProps {
  user: User;
  db: any;
  onQueueUpdate: (isInQueue: boolean) => void;
  onMatchFound: (opponent: Player) => void;
}

interface BattleLogEntry {
  message: string;
  timestamp: Date;
  type: 'info' | 'error' | 'success' | 'system' | 'action';
}

// --- Component ---
const QueueComponent: React.FC<QueueProps> = ({ user, db, onQueueUpdate, onMatchFound }) => {
  // --- Local State ---
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false); // For specific button actions

  // Player document state (from Firestore listener)
  const [playerData, setPlayerData] = useState<Player | null>(null);
  
  // UI interaction states
  const [friendUsernameInput, setFriendUsernameInput] = useState<string>('');
  
  // Battle Log
  const [battleLogs, setBattleLogs] = useState<BattleLogEntry[]>([]);

  // Online players & opponent states
  const [onlinePlayersCount, setOnlinePlayersCount] = useState<number>(0);
  const [onlinePlayersList, setOnlinePlayersList] = useState<Player[]>([]);
  const [currentOpponentDetails, setCurrentOpponentDetails] = useState<Player | null>(null);

  const router = useRouter();

  // --- Logging ---
  const logMessage = useCallback((message: string, type: BattleLogEntry['type'] = 'info') => {
    console.log(`[BattleLog - ${type.toUpperCase()}]: ${message}`);
    setBattleLogs(prevLogs => {
      const newLog = { message, timestamp: new Date(), type };
      const MAX_LOGS = 50;
      const updatedLogs = [...prevLogs, newLog];
      return updatedLogs.slice(-MAX_LOGS);
    });
  }, []);

  const checkForMatch = async () => {
    if (!user || !db) return;
    
    try {
      // First verify auth
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.error('No authenticated user found');
        return;
      }

      // Force token refresh
      await currentUser.getIdToken(true);

      // Get player data
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      
      if (!playerDoc.exists()) {
        console.error('Player document not found');
        return;
      }

      const playerData = playerDoc.data();
      if (!playerData.inQueue) {
        return; // Not in queue, no need to check for matches
      }

      // Check for existing match
      const matchesRef = collection(db, 'matches');
      const q = query(
        matchesRef,
        where('players', 'array-contains', user.uid),
        where('status', '==', 'active')
      );

      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const matchDoc = querySnapshot.docs[0];
        const matchData = matchDoc.data();
        
        // Get opponent details
        const opponentId = matchData.players.find((id: string) => id !== user.uid);
        if (opponentId) {
          const opponentRef = doc(db, 'players', opponentId);
          const opponentDoc = await getDoc(opponentRef);
          if (opponentDoc.exists()) {
            const opponentData = opponentDoc.data();
            onMatchFound({
              uid: opponentId,
              username: opponentData.username || 'Unknown Player',
              inQueue: false,
              status: 'in_game',
              currentOpponent: user.uid,
              challengeFrom: null,
              lastMatch: undefined
            });
          }
        }
      }
    } catch (error) {
      console.error('Error checking for match:', error);
      // Don't show error to user unless it's a critical error
      if (error instanceof Error && error.message.includes('permission-denied')) {
        logMessage('Unable to check for matches. Please try again.', 'error');
      }
    }
  };

  // 1. Listener for the current player's document
  useEffect(() => {
    if (!user?.uid || !db) {
      setPlayerData(null);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    const setupPlayerListener = () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          console.error('No authenticated user found');
          return;
        }

        // Set up real-time listener for player data
        const playerRef = doc(db, 'players', currentUser.uid);
        unsubscribe = onSnapshot(playerRef, 
          (doc) => {
            if (doc.exists()) {
              const data = doc.data();
              setPlayerData({
                uid: doc.id,
                username: data.username || '',
                inQueue: data.inQueue || false,
                status: data.status || 'online',
                currentOpponent: data.currentOpponent || null,
                challengeFrom: data.challengeFrom || null,
                lastMatch: data.lastMatch
              });
            }
          },
          (error) => {
            console.error('Error in player listener:', error);
            setError('Failed to load player data. Please try again.');
          }
        );
      } catch (error) {
        console.error('Error setting up player listener:', error);
        setError('Failed to initialize player data. Please try again.');
      }
    };

    setupPlayerListener();

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user?.uid, db]);

  // 2. Listener for online players (count and list)
  useEffect(() => {
    if (!db || !user?.uid) return;

    let unsubscribeOnlineList: (() => void) | undefined;
    let unsubscribeOnlineCount: (() => void) | undefined;

    const setupOnlinePlayersListeners = () => {
      try {
        // First, ensure current user is marked as online
        const currentUserRef = doc(db, 'players', user.uid);
        updateDoc(currentUserRef, {
          status: 'online',
          lastSeen: serverTimestamp()
        }).catch(err => {
          console.error('Error updating user status:', err);
        });

        // Query for a list of online players (limited for performance)
        const onlineListQuery = query(
          collection(db, 'players'),
          where('status', '==', 'online'),
          limit(20) // Increased limit to show more players
        );
        
        unsubscribeOnlineList = onSnapshot(onlineListQuery, 
          (snapshot) => {
            const players: Player[] = [];
            snapshot.forEach(docSnap => {
              // Skip the current user
              if (docSnap.id === user.uid) return;
              
              const data = docSnap.data();
              // Only include players who are actually online
              if (data.status === 'online') {
                players.push({
                  uid: docSnap.id,
                  username: data.username || '',
                  inQueue: data.inQueue || false,
                  status: data.status || 'online',
                  currentOpponent: data.currentOpponent || null,
                  challengeFrom: data.challengeFrom || null,
                  lastMatch: data.lastMatch
                });
              }
            });
            setOnlinePlayersList(players);
          },
          (err) => {
            console.error('Error fetching online players list:', err);
            logMessage(`Error fetching online players list: ${err.message}`, 'error');
            if (err.code === 'permission-denied') {
              setError('Unable to fetch online players. Please try signing out and back in.');
            }
          }
        );

        // Query for the total count of online players
        const onlineCountQuery = query(
          collection(db, 'players'), 
          where('status', '==', 'online')
        );
        
        unsubscribeOnlineCount = onSnapshot(onlineCountQuery, 
          (snapshot) => {
            // Subtract 1 from count if current user is online
            const count = snapshot.size - (snapshot.docs.some(doc => doc.id === user.uid) ? 1 : 0);
            setOnlinePlayersCount(count);
          },
          (err) => {
            console.error('Error fetching online player count:', err);
            logMessage(`Error fetching online player count: ${err.message}`, 'error');
          }
        );
      } catch (error) {
        console.error('Error setting up online players listeners:', error);
        setError('Failed to load online players data. Please try again.');
      }
    };

    setupOnlinePlayersListeners();
    
    // Cleanup function to mark user as offline when component unmounts
    return () => {
      if (typeof unsubscribeOnlineList === 'function') {
        unsubscribeOnlineList();
      }
      if (typeof unsubscribeOnlineCount === 'function') {
        unsubscribeOnlineCount();
      }
      // Mark user as offline when leaving
      if (user?.uid) {
        const currentUserRef = doc(db, 'players', user.uid);
        updateDoc(currentUserRef, {
          status: 'offline',
          lastSeen: serverTimestamp()
        }).catch(err => {
          console.error('Error updating user status on cleanup:', err);
        });
      }
    };
  }, [db, user?.uid]);

  // Add a heartbeat to keep user marked as online
  useEffect(() => {
    if (!db || !user?.uid) return;

    const heartbeatInterval = setInterval(() => {
      const currentUserRef = doc(db, 'players', user.uid);
      updateDoc(currentUserRef, {
        lastSeen: serverTimestamp()
      }).catch(err => {
        console.error('Error updating heartbeat:', err);
      });
    }, 30000); // Update every 30 seconds

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [db, user?.uid]);

  // 3. Check for matches when in queue
  useEffect(() => {
    let matchCheckInterval: NodeJS.Timeout | null = null;
    
    if (playerData?.inQueue && playerData.status === 'online') {
      logMessage('Looking for opponents...', 'info');
      matchCheckInterval = setInterval(() => {
        checkForMatch();
      }, 3000);
    }
    
    return () => {
      if (matchCheckInterval) {
        clearInterval(matchCheckInterval);
      }
    };
  }, [playerData?.inQueue, playerData?.status]);

  // 4. Initialize player data when component mounts
  useEffect(() => {
    if (!user?.uid || !db) return;

    const initializePlayer = async () => {
      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);

        if (!playerDoc.exists()) {
          // Create new player document
          await setDoc(playerRef, {
            uid: user.uid,
            username: user.email?.split('@')[0] || 'Player',
            email: user.email || '',
            inQueue: false,
            status: 'online',
            currentOpponent: null,
            challengeFrom: null,
            power: 0,
            wins: 0,
            losses: 0,
            lastMatch: serverTimestamp()
          });
        } else {
          // Update existing player status
          await updateDoc(playerRef, {
            status: 'online',
            inQueue: false,
            currentOpponent: null,
            challengeFrom: null
          });
        }
      } catch (err) {
        console.error('Error initializing player:', err);
        setError('Failed to initialize player data');
      }
    };

    initializePlayer();
  }, [user?.uid, db]);

  // --- Action Functions ---
  const handleSignOut = async () => {
    if (!user) { logMessage('No user to sign out.', 'error'); return; }
    logMessage('Signing out...', 'action');
    setIsProcessing(true); 
    setError(null);
    try {
      // First check if the player document exists
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      
      if (playerDoc.exists()) {
        // Only update if document exists
        await updateDoc(playerRef, {
          inQueue: false,
          status: 'offline',
          currentOpponent: null,
          challengeFrom: null,
          lastSeen: serverTimestamp()
        }).catch(err => {
          console.warn('Warning: Could not update player state:', err);
        });
        logMessage('Player state updated.', 'success');
      } else {
        logMessage('No player document found, skipping state update.', 'info');
      }
      
      // Clear local state before signing out
      setPlayerData(null);
      setCurrentOpponentDetails(null);
      setOnlinePlayersList([]);
      setOnlinePlayersCount(0);
      setBattleLogs([]);
      
      // Small delay to ensure state updates are processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then sign out
      await auth.signOut();
      logMessage('Signed out successfully.', 'success');
    } catch (err: any) {
      console.error('Sign out error:', err);
      let errorMessage = err.message;
      
      // Handle specific error cases
      if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please wait a few minutes before trying again.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (err.code === 'auth/unauthorized-domain') {
        errorMessage = 'Authentication domain not authorized. Please contact support.';
      }
      
      logMessage(`Error signing out: ${errorMessage}`, 'error');
      setError(errorMessage);
    } finally { 
      setIsProcessing(false);
    }
  };

  const handleResetPlayerState = async () => {
    if (!user) { 
      logMessage('User not authenticated. Please sign in again.', 'error'); 
      return; 
    }
    logMessage('Resetting player state...', 'action');
    setIsProcessing(true); 
    setError(null);
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: false,
        status: 'online',
        currentOpponent: null,
        challengeFrom: null
      });
      logMessage('Player state reset successfully.', 'success');
      setError(null);
    } catch (err: any) {
      console.error('Error resetting state:', err);
      let errorMessage = err.message || 'Failed to reset state';
      logMessage(`Error resetting state: ${errorMessage}`, 'error');
      setError(errorMessage);
    } finally { 
      setIsProcessing(false);
    }
  };

  const handleJoinQueue = async () => {
    if (!user || !playerData) { logMessage('Player data not available.', 'error'); return; }
    if (playerData.inQueue || playerData.currentOpponent || playerData.challengeFrom) {
      logMessage('Already in a queue or involved in a challenge.', 'info'); return;
    }
    logMessage('Joining random queue...', 'action');
    setIsProcessing(true); setError(null);
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: true, status: 'online', currentOpponent: null, challengeFrom: null, lastMatch: serverTimestamp()
      });
      logMessage('Successfully joined queue.', 'success');
    } catch (err: any) {
      logMessage(`Error joining queue: ${err.message}`, 'error'); setError(err.message);
    } finally { setIsProcessing(false); }
  };

  const handleChallengeFriend = async () => {
    const targetUsername = friendUsernameInput.trim();
    if (!user || !playerData) { logMessage('Player data not available.', 'error'); return; }
    if (!targetUsername) { logMessage('Enter friend\'s username.', 'info'); return; }
    if (targetUsername === playerData.username) { logMessage('Cannot challenge yourself.', 'info'); return; }

    logMessage(`Challenging ${targetUsername}...`, 'action');
    setIsProcessing(true); setError(null);
    try {
      const q = query(collection(db, 'players'), where('username', '==', targetUsername));
      const snapshot = await getDocs(q);
      if (snapshot.empty) throw new Error(`User '${targetUsername}' not found.`);
      
      const friendDoc = snapshot.docs[0];
      const friendData = friendDoc.data() as Player;
      if (friendData.status !== 'online' || friendData.challengeFrom || friendData.currentOpponent) {
        throw new Error(`${targetUsername} is busy or not available.`);
      }

      // Use a transaction to ensure atomicity
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const friendRef = doc(db, 'players', friendDoc.id);

        // Re-check friend's availability within transaction
        const friendSnapTx = await transaction.get(friendRef);
        if (!friendSnapTx.exists()) throw new Error("Friend vanished!");
        const friendDataTx = friendSnapTx.data() as Player;
        if (friendDataTx.status !== 'online' || friendDataTx.challengeFrom || friendDataTx.currentOpponent) {
          throw new Error(`${targetUsername} became busy.`);
        }

        transaction.update(playerRef, { status: 'challenging', currentOpponent: friendDoc.id, inQueue: false, challengeFrom: null });
        transaction.update(friendRef, { challengeFrom: user.uid });
      });

      logMessage(`Challenge sent to ${targetUsername}.`, 'success');
      setFriendUsernameInput('');
    } catch (err: any) {
      logMessage(`Error challenging: ${err.message}`, 'error'); setError(err.message);
    } finally { setIsProcessing(false); }
  };

  const handleAcceptChallenge = async () => {
    if (!user || !playerData || !playerData.challengeFrom) { logMessage('No challenge to accept or player data missing.', 'error'); return; }
    logMessage(`Accepting challenge from ${playerData.challengeFrom}...`, 'action');
    setIsProcessing(true); setError(null);
    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'players', user.uid);
        const challengerRef = doc(db, 'players', playerData.challengeFrom!);

        const playerSnapTx = await transaction.get(playerRef);
        const challengerSnapTx = await transaction.get(challengerRef);

        if (!playerSnapTx.exists() || !challengerSnapTx.exists()) throw new Error("One or both players not found.");
        if (playerSnapTx.data()?.challengeFrom !== playerData.challengeFrom) throw new Error("Challenge expired or changed.");
        if (challengerSnapTx.data()?.currentOpponent !== user.uid || challengerSnapTx.data()?.status !== 'challenging') {
            throw new Error("Challenger is no longer challenging you or is busy.");
        }

        transaction.update(playerRef, { status: 'in_game', currentOpponent: playerData.challengeFrom, inQueue: false, challengeFrom: null });
        transaction.update(challengerRef, { status: 'in_game', currentOpponent: user.uid, inQueue: false });
      });
      logMessage('Challenge accepted! Match starting.', 'success');
    } catch (err: any) {
      logMessage(`Error accepting challenge: ${err.message}`, 'error'); setError(err.message);
    } finally { setIsProcessing(false); }
  };

  const handleDeclineChallenge = async () => {
    if (!user || !playerData || !playerData.challengeFrom) { logMessage('No challenge to decline.', 'error'); return; }
    logMessage(`Declining challenge from ${playerData.challengeFrom}...`, 'action');
    setIsProcessing(true); setError(null);
    try {
      // Update both player and (former) challenger
      const playerRef = doc(db, 'players', user.uid);
      const challengerRef = doc(db, 'players', playerData.challengeFrom); // UID of who challenged us
      
      await updateDoc(playerRef, { challengeFrom: null, status: 'online' }); // Clear challenge from us
      await updateDoc(challengerRef, { currentOpponent: null, status: 'online' }); // Reset challenger's state

      logMessage('Challenge declined.', 'success');
    } catch (err: any) {
      logMessage(`Error declining challenge: ${err.message}`, 'error'); setError(err.message);
    } finally { setIsProcessing(false); }
  };

  const handleCancelQueue = async () => {
    if (!user || !playerData) {
      logMessage('Player data not available.', 'error');
      return;
    }
    logMessage('Cancelling queue...', 'action');
    setIsProcessing(true);
    setError(null);
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: false,
        status: 'online',
        currentOpponent: null,
        challengeFrom: null
      });
      logMessage('Successfully cancelled queue.', 'success');
    } catch (err: any) {
      console.error('Error cancelling queue:', err);
      logMessage(`Error cancelling queue: ${err.message}`, 'error');
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Render Logic ---
  const canJoinQueue = playerData?.status === 'online' && !playerData.inQueue && !playerData.currentOpponent && !playerData.challengeFrom;
  const canChallengeFriend = playerData?.status === 'online' && !playerData.inQueue && !playerData.currentOpponent && !playerData.challengeFrom;
  const isInQueueSearching = playerData?.inQueue && !playerData.currentOpponent && playerData.status === 'online';
  const isChallengeSent = playerData?.status === 'challenging' && playerData.currentOpponent && !playerData.challengeFrom;
  const hasIncomingChallenge = playerData?.challengeFrom && !playerData.currentOpponent;
  const isInGame = playerData?.status === 'in_game' && playerData.currentOpponent;

  return (
    <div className="bg-neutral-900 text-neutral-300 p-4 sm:p-5 space-y-3 rounded-lg shadow-xl max-w-lg mx-auto">
      <h2 className="text-xl sm:text-2xl font-semibold text-neutral-100 text-center font-mono">
        Game Hub
      </h2>

      {/* Info Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="bg-neutral-800 p-2.5 rounded-md border border-neutral-700/60">
          <h3 className="font-semibold text-neutral-200 mb-1">Online: {onlinePlayersCount}</h3>
          {onlinePlayersList.length > 0 ? (
            <ul className="max-h-16 overflow-y-auto space-y-0.5 text-neutral-400">
              {onlinePlayersList.map(p => <li key={p.uid} className="truncate">{p.username || p.uid}</li>)}
            </ul>
          ) : <p className="text-neutral-500 italic">Quiet for now...</p>}
          {onlinePlayersList.length >= 10 && <p className="text-neutral-600 text-xs mt-0.5">Showing first 10.</p>}
        </div>
        <div className="bg-neutral-800 p-2.5 rounded-md border border-neutral-700/60">
          <h3 className="font-semibold text-neutral-200 mb-1">Current Match</h3>
          {isInGame && currentOpponentDetails ? (
            <p className="text-neutral-100">vs <span className="font-bold">{currentOpponentDetails.username || 'Opponent'}</span></p>
          ) : isChallengeSent ? (
            <p className="text-neutral-400 italic">Challenge sent...</p>
          ) : (
            <p className="text-neutral-500 italic">Not in a match.</p>
          )}
        </div>
      </div>

      {/* Battle Log */}
      <div className="h-32 sm:h-36 p-2 bg-neutral-800 rounded-md overflow-y-auto border border-neutral-700/60 space-y-1 text-xs font-mono">
        {battleLogs.length === 0 && <p className="text-neutral-500 italic">Awaiting actions...</p>}
        {battleLogs.map((log, index) => (
          <div key={index} className={`flex items-start ${
              log.type === 'error' ? 'text-orange-400' :
              log.type === 'success' ? 'text-green-400' :
              log.type === 'action' ? 'text-sky-400' :
              log.type === 'system' ? 'text-neutral-400 italic' : 'text-neutral-300'}`}>
            <span className="mr-1.5 text-neutral-500">{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}:</span>
            <span className="flex-1 break-words">{log.message}</span>
          </div>
        ))}
      </div>

      {/* Global Error Display (if any) */}
      {error && (
        <div className="border border-orange-500/50 bg-neutral-800 p-2.5 rounded-md text-center text-xs my-2">
          <p className="text-orange-300 font-semibold">Alert: {error}</p>
          <button onClick={handleResetPlayerState} disabled={isProcessing}
            className="mt-1.5 px-3 py-1 bg-neutral-700 text-neutral-200 rounded hover:bg-neutral-600 text-xs disabled:opacity-50">
            {isProcessing ? '...' : 'Reset My State'}
          </button>
        </div>
      )}

      {/* Sign Out Button */}
      <div className="mt-4 pt-4 border-t border-neutral-700/50">
        <button onClick={handleSignOut} disabled={isProcessing || !user}
          className="w-full px-4 py-2 bg-red-700 text-neutral-100 rounded hover:bg-red-600 font-semibold disabled:opacity-50">
          {isProcessing ? 'Processing...' : 'Sign Out'}
        </button>
      </div>

      {/* --- Action Buttons --- */}
      <div className="space-y-2.5 text-sm">
        {/* Idle State: Join Queue or Challenge */}
        {canJoinQueue && (
          <>
            <button onClick={handleJoinQueue} disabled={isProcessing || !user}
              className="w-full px-4 py-2 bg-neutral-700 text-neutral-100 rounded hover:bg-neutral-600 font-semibold disabled:opacity-50">
              {isProcessing ? 'Processing...' : 'Join Random Queue'}
            </button>
            <div className="pt-2 border-t border-neutral-700/50">
              <input type="text" value={friendUsernameInput} onChange={(e) => setFriendUsernameInput(e.target.value)}
                placeholder="Friend's Username"
                className="w-full p-1.5 mb-1.5 rounded bg-neutral-800 border border-neutral-600 text-neutral-200 focus:ring-1 focus:ring-neutral-500 placeholder:text-neutral-500"
                disabled={isProcessing || !user} />
              <button onClick={handleChallengeFriend} disabled={isProcessing || !friendUsernameInput.trim() || !user}
                className="w-full px-4 py-2 bg-neutral-700 text-neutral-100 rounded hover:bg-neutral-600 font-semibold disabled:opacity-50">
                {isProcessing ? 'Processing...' : 'Challenge Friend'}
              </button>
            </div>
          </>
        )}

        {/* In Queue: Cancel Button */}
        {playerData?.inQueue && !playerData.currentOpponent && (
          <button onClick={handleCancelQueue} disabled={isProcessing || !user}
            className="w-full px-4 py-2 bg-amber-700 text-neutral-100 rounded hover:bg-amber-600 font-semibold disabled:opacity-50">
            {isProcessing ? 'Processing...' : 'Cancel Queue'}
          </button>
        )}

        {/* Incoming Challenge: Accept/Decline */}
        {hasIncomingChallenge && playerData?.challengeFrom && (
          <div className="p-2.5 bg-neutral-800 border border-neutral-700 rounded text-center">
            <p className="mb-1.5 text-neutral-200">
              Incoming challenge from: <span className="font-semibold">{playerData.challengeFrom /* Fetch username */}</span>!
            </p>
            <div className="flex space-x-2">
              <button onClick={handleAcceptChallenge} disabled={isProcessing || !user}
                className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-500 font-semibold disabled:opacity-50">
                {isProcessing ? '...' : 'Accept'}
              </button>
              <button onClick={handleDeclineChallenge} disabled={isProcessing || !user}
                className="flex-1 px-3 py-1.5 bg-red-700 text-white rounded hover:bg-red-600 font-semibold disabled:opacity-50">
                {isProcessing ? '...' : 'Decline'}
              </button>
            </div>
          </div>
        )}

        {/* In Game */}
        {isInGame && (
          <div className="p-3 bg-neutral-800 border-neutral-700 rounded text-center">
            <p className="text-green-400 font-semibold">You are in a game!</p>
            {/* You might add a "Report Score" or "Leave Game" (gracefully) button here */}
          </div>
        )}
      </div>
       {/* Fallback for no user data or not 'online' */}
       {!playerData && user && <p className="text-xs text-neutral-500 text-center italic">Initializing player data...</p>}
       {!user && <p className="text-xs text-neutral-500 text-center italic">Please log in to use the game hub.</p>}

    </div>
  );
};

export default QueueComponent;