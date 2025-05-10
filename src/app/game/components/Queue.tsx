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
  limit // For limiting query results
} from 'firebase/firestore';
import { auth } from '@/lib/firebase';

// --- Interfaces ---
interface Player {
  uid: string;
  username: string;
  inQueue?: boolean;
  currentOpponent?: string | null;
  status?: 'online' | 'in_game' | 'offline' | 'challenging'; // Added 'challenging'
  lastMatch?: FieldValue;
  challengeFrom?: string | null;
}

interface QueueProps {
  user: any; // Authenticated user object (e.g., from Firebase Auth)
  db: any;   // Firestore instance
  onQueueUpdate: (isInQueue: boolean) => void; // Callback when queue status changes
  onMatchFound: (opponent: Player) => void;  // Callback when a match is made
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

  // --- Firestore Real-time Listeners ---

  // 1. Listener for the current player's document
  useEffect(() => {
    if (!user || !db) {
      setPlayerData(null); // Clear player data if no user or db
      return;
    }

    const playerRef = doc(db, 'players', user.uid);
    const unsubscribePlayer = onSnapshot(playerRef, async (docSnap) => {
      if (docSnap.exists()) {
        const currentPlayerData = { uid: docSnap.id, ...docSnap.data() } as Player;
        setPlayerData(currentPlayerData);
        logMessage(`Player data updated: Status - ${currentPlayerData.status}`, 'system');

        // Update overall queue status for parent components
        onQueueUpdate(currentPlayerData.inQueue || false);

        // Handle opponent details
        if (currentPlayerData.currentOpponent) {
          if (!currentOpponentDetails || currentOpponentDetails.uid !== currentPlayerData.currentOpponent) {
            logMessage(`Workspaceing opponent details for UID: ${currentPlayerData.currentOpponent}`, 'system');
            const opponentDocRef = doc(db, 'players', currentPlayerData.currentOpponent);
            const opponentDocSnap = await getDoc(opponentDocRef);
            if (opponentDocSnap.exists()) {
              const opponentData = { uid: opponentDocSnap.id, ...opponentDocSnap.data() } as Player;
              setCurrentOpponentDetails(opponentData);
              logMessage(`Opponent: ${opponentData.username || 'Unknown'}`, 'info');
              if (currentPlayerData.status === 'in_game') { // If actively in game with this opponent
                onMatchFound(opponentData);
              }
            } else {
              logMessage(`Opponent UID ${currentPlayerData.currentOpponent} not found.`, 'error');
              setCurrentOpponentDetails(null);
            }
          }
        } else {
          if (currentOpponentDetails) { // If there was an opponent but now there isn't
             logMessage(`Opponent cleared. Was: ${currentOpponentDetails.username}`, 'system');
          }
          setCurrentOpponentDetails(null);
        }
      } else {
        logMessage('Player document does not exist. User might need to be initialized.', 'error');
        setPlayerData(null);
        // Consider redirecting or showing an error to create player profile
      }
    }, (err) => {
      logMessage(`Error listening to player document: ${err.message}`, 'error');
      setError('Failed to sync player data.');
    });

    return () => unsubscribePlayer();
  }, [user, db, logMessage, onQueueUpdate, onMatchFound, currentOpponentDetails]); // Added currentOpponentDetails

  // 2. Listener for online players (count and list)
  useEffect(() => {
    if (!db) return;

    // Query for a list of online players (limited for performance)
    const onlineListQuery = query(
      collection(db, 'players'),
      where('status', '==', 'online'),
      limit(10) // Display up to 10 online players in the list
    );
    const unsubscribeOnlineList = onSnapshot(onlineListQuery, (snapshot) => {
      const players: Player[] = [];
      snapshot.forEach(docSnap => players.push({ uid: docSnap.id, ...docSnap.data() } as Player));
      setOnlinePlayersList(players);
    }, (err) => {
      logMessage(`Error fetching online players list: ${err.message}`, 'error');
    });

    // Query for the total count of online players (more reads, consider aggregation for scale)
    const onlineCountQuery = query(collection(db, 'players'), where('status', '==', 'online'));
    const unsubscribeOnlineCount = onSnapshot(onlineCountQuery, (snapshot) => {
      setOnlinePlayersCount(snapshot.size);
    }, (err) => {
      logMessage(`Error fetching online player count: ${err.message}`, 'error');
    });
    
    return () => {
      unsubscribeOnlineList();
      unsubscribeOnlineCount();
    };
  }, [db, logMessage]);

  // --- Action Functions ---

  const handleSignOut = async () => {
    if (!user) { logMessage('No user to sign out.', 'error'); return; }
    logMessage('Signing out...', 'action');
    setIsProcessing(true); setError(null);
    try {
      // First reset the player state
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: false,
        status: 'offline',
        currentOpponent: null
      });
      logMessage('Player state reset successfully.', 'success');
      
      // Then sign out
      await auth.signOut();
      logMessage('Signed out successfully.', 'success');
    } catch (err: any) {
      logMessage(`Error signing out: ${err.message}`, 'error');
      setError(err.message);
    } finally { 
      setIsProcessing(false);
    }
  };

  const handleResetPlayerState = async () => {
    if (!user) { logMessage('User not authenticated.', 'error'); return; }
    logMessage('Resetting player state...', 'action');
    setIsProcessing(true); setError(null);
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: false,
        status: 'online',
        currentOpponent: null
      });
      logMessage('Player state reset successfully.', 'success');
    } catch (err: any) {
      logMessage(`Error resetting state: ${err.message}`, 'error'); setError(err.message);
    } finally { setIsProcessing(false); }
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

  const handleLeaveOrCancel = async () => { // Cancels queue search, or a challenge you sent
    if (!user || !playerData) { logMessage('Player data not available.', 'error'); return; }
    logMessage('Leaving queue / Cancelling action...', 'action');
    setIsProcessing(true); setError(null);
    try {
      const playerRef = doc(db, 'players', user.uid);
      const updates = {
        inQueue: false,
        status: 'online',
        currentOpponent: null
      };
      
      if (playerData.status === 'challenging' && playerData.currentOpponent) {
        try {
          // If cancelling a challenge sent to someone, also clear their 'challengeFrom' field.
          const opponentRef = doc(db, 'players', playerData.currentOpponent);
          // This should ideally be in a transaction if both must succeed.
          await updateDoc(opponentRef, { status: 'online' });
          logMessage(`Cancelled challenge sent to ${playerData.currentOpponent}.`, 'system');
        } catch (opponentErr: any) {
          // Log but don't fail the whole operation if opponent update fails
          logMessage(`Warning: Could not update opponent state: ${opponentErr.message}`, 'error');
        }
      }
      
      try {
        await updateDoc(playerRef, updates);
        logMessage('Action cancelled successfully.', 'success');
      } catch (updateErr: any) {
        if (updateErr.message.includes('ERR_BLOCKED_BY_CLIENT')) {
          logMessage('Network request was blocked. Please check your browser extensions or try again.', 'error');
          setError('Network request blocked. Please disable ad blockers or try again.');
        } else {
          throw updateErr; // Re-throw other errors
        }
      }
    } catch (err: any) {
      logMessage(`Error leaving/cancelling: ${err.message}`, 'error');
      setError(err.message);
    } finally { 
      setIsProcessing(false);
    }
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


  // --- Render Logic ---
  const canJoinQueue = playerData?.status === 'online' && !playerData.inQueue && !playerData.currentOpponent && !playerData.challengeFrom;
  const canChallengeFriend = playerData?.status === 'online' && !playerData.inQueue && !playerData.currentOpponent && !playerData.challengeFrom;
  const isInQueueSearching = playerData?.inQueue && !playerData.currentOpponent && playerData.status === 'online';
  const isChallengeSent = playerData?.status === 'challenging' && playerData.currentOpponent && !playerData.challengeFrom;
  const hasIncomingChallenge = playerData?.challengeFrom && !playerData.currentOpponent;
  const isInGame = playerData?.status === 'in_game' && playerData.currentOpponent;

  return (
    <div className="bg-neutral-900 text-neutral-300 p-4 sm:p-5 space-y-3 rounded-lg shadow-xl max-w-lg mx-auto"> {/* Removed font-mono from base */}
      <h2 className="text-xl sm:text-2xl font-semibold text-neutral-100 text-center font-mono"> {/* Kept font-mono for title */}
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
      <div className="h-32 sm:h-36 p-2 bg-neutral-800 rounded-md overflow-y-auto border border-neutral-700/60 space-y-1 text-xs font-mono"> {/* Kept font-mono */}
        {battleLogs.length === 0 && <p className="text-neutral-500 italic">Awaiting actions...</p>}
        {battleLogs.map((log, index) => (
          <div key={index} className={`flex items-start ${
              log.type === 'error' ? 'text-orange-400' : // Monotone-friendly error indication
              log.type === 'success' ? 'text-green-400' : // Monotone-friendly success
              log.type === 'action' ? 'text-sky-400' : // Monotone-friendly action
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

        {/* In Queue or Challenge Sent: Cancel Button */}
        {(isInQueueSearching || isChallengeSent) && (
          <button onClick={handleLeaveOrCancel} disabled={isProcessing || !user}
            className="w-full px-4 py-2 bg-amber-700 text-neutral-100 rounded hover:bg-amber-600 font-semibold disabled:opacity-50">
            {isProcessing ? 'Processing...' : (isChallengeSent ? 'Cancel Challenge Sent' : 'Cancel Queue Search')}
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