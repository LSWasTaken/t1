'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, getDoc, orderBy } from 'firebase/firestore';

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

  // Queue timeout effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isInQueue && !isDirectChallenge) {
      timer = setInterval(() => {
        setQueueTime(prev => prev + 1);
        setEstimatedTime(Math.max(0, estimatedTime - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isInQueue, isDirectChallenge, estimatedTime]);

  // Queue position effect
  useEffect(() => {
    if (isInQueue && !isDirectChallenge) {
      const updateQueuePosition = async () => {
        try {
          const q = query(
            collection(db, 'players'),
            where('inQueue', '==', true),
            where('currentOpponent', '==', null),
            orderBy('power', 'asc')
          );
          const snapshot = await getDocs(q);
          const position = snapshot.docs.findIndex(doc => doc.id === user?.uid) + 1;
          setQueuePosition(position);
          
          // Estimate time based on queue position
          const baseTime = 30;
          const positionMultiplier = Math.max(1, position / 2);
          setEstimatedTime(Math.ceil(baseTime * positionMultiplier));
        } catch (error) {
          console.error('Error updating queue position:', error);
        }
      };

      const interval = setInterval(updateQueuePosition, 2000);
      updateQueuePosition();
      return () => clearInterval(interval);
    }
  }, [isInQueue, isDirectChallenge, user]);

  // Add queue state effect
  useEffect(() => {
    if (!user) return;

    const fetchQueueState = async () => {
      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        setIsInQueue(playerData?.inQueue || false);
        setIsDirectChallenge(!!playerData?.currentOpponent);
        onQueueUpdate(playerData?.inQueue || false);
      } catch (error) {
        console.error('Error fetching queue state:', error);
      }
    };

    fetchQueueState();
  }, [user, onQueueUpdate]);

  const joinQueue = async () => {
    if (!user) return;
    if (isInQueue) {
      setBattleLog(prev => [...prev, 'You are already in queue!']);
      return;
    }

    setIsSearching(true);
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: true,
        lastMatch: serverTimestamp(),
        currentOpponent: null
      });
      setIsInQueue(true);
      setIsDirectChallenge(false);
      onQueueUpdate(true);
      setBattleLog(prev => [...prev, 'Joined queue!']);
      setQueueTime(0);
      setQueuePosition(0);
      setEstimatedTime(30);

      // Find opponent in queue
      const q = query(
        collection(db, 'players'),
        where('inQueue', '==', true),
        where('currentOpponent', '==', null),
        where('uid', '!=', user.uid)
      );

      const querySnapshot = await getDocs(q);
      const potentialOpponents = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Player));

      if (potentialOpponents.length > 0) {
        // Pick a random opponent
        const randomIndex = Math.floor(Math.random() * potentialOpponents.length);
        const opponent = potentialOpponents[randomIndex];

        // Update both players' status
        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(opponentRef, {
          inQueue: false,
          lastMatch: serverTimestamp(),
          currentOpponent: user.uid
        });
        await updateDoc(playerRef, {
          inQueue: false,
          lastMatch: serverTimestamp(),
          currentOpponent: opponent.id
        });

        setIsInQueue(false);
        onQueueUpdate(false);
        onMatchFound(opponent);
        setBattleLog(prev => [...prev, `Match found! You'll compete against ${opponent.username} in a clicking speed challenge!`]);
      } else {
        setBattleLog(prev => [...prev, 'Searching for opponent...']);
      }
    } catch (error) {
      console.error('Error joining queue:', error);
      setBattleLog(prev => [...prev, 'Failed to join queue. Please try again.']);
      setIsInQueue(false);
      onQueueUpdate(false);
    } finally {
      setIsSearching(false);
    }
  };

  const challengeFriend = async () => {
    if (!user || !friendUsername) return;
    if (isInQueue) {
      setBattleLog(prev => [...prev, 'You are already in a challenge!']);
      return;
    }

    setIsSearching(true);
    try {
      // Find friend by username
      const q = query(
        collection(db, 'players'),
        where('username', '==', friendUsername)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setBattleLog(prev => [...prev, 'Friend not found. Please check the username.']);
        return;
      }

      const friendDoc = querySnapshot.docs[0];
      const friendData = friendDoc.data() as Player;

      if (friendData.uid === user.uid) {
        setBattleLog(prev => [...prev, 'You cannot challenge yourself!']);
        return;
      }

      // Update both players' status
      const playerRef = doc(db, 'players', user.uid);
      const friendRef = doc(db, 'players', friendData.uid);

      await updateDoc(playerRef, {
        inQueue: true,
        lastMatch: serverTimestamp(),
        currentOpponent: friendData.uid
      });

      await updateDoc(friendRef, {
        inQueue: true,
        lastMatch: serverTimestamp(),
        currentOpponent: user.uid
      });

      setIsInQueue(true);
      setIsDirectChallenge(true);
      onQueueUpdate(true);
      setBattleLog(prev => [...prev, `Challenge sent to ${friendUsername}!`]);
      onMatchFound(friendData);
    } catch (error) {
      console.error('Error challenging friend:', error);
      setBattleLog(prev => [...prev, 'Failed to send challenge. Please try again.']);
    } finally {
      setIsSearching(false);
    }
  };

  const leaveQueue = async () => {
    if (!user) return;
    
    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      const playerData = playerDoc.data();

      // Update both players' status
      await updateDoc(playerRef, {
        inQueue: false,
        lastMatch: serverTimestamp(),
        currentOpponent: null
      });

      if (playerData?.currentOpponent) {
        const opponentRef = doc(db, 'players', playerData.currentOpponent);
        await updateDoc(opponentRef, {
          inQueue: false,
          lastMatch: serverTimestamp(),
          currentOpponent: null
        });
      }

      // Clear any existing timers
      if (queueTimer) {
        clearInterval(queueTimer);
        setQueueTimer(null);
      }

      // Reset all queue-related state
      setIsInQueue(false);
      setIsDirectChallenge(false);
      setQueueTime(0);
      setQueuePosition(0);
      setEstimatedTime(0);
      setFriendUsername('');
      setBattleLog(['Left the queue']);
      onQueueUpdate(false);
    } catch (error) {
      console.error('Error leaving queue:', error);
      // Try to force reset the queue state even if the update fails
      setIsInQueue(false);
      setIsDirectChallenge(false);
      onQueueUpdate(false);
      setBattleLog(['Failed to leave queue. Please try again.']);
    }
  };

  return (
    <div className="bg-cyber-black rounded-lg p-6 space-y-4">
      <h2 className="text-2xl font-press-start text-cyber-pink text-center">
        Clicking Speed Challenge
      </h2>

      {!isInQueue ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <input
              type="text"
              value={friendUsername}
              onChange={(e) => setFriendUsername(e.target.value)}
              placeholder="Enter friend's username"
              className="w-full px-4 py-2 bg-cyber-black border-2 border-cyber-purple text-cyber-pink rounded-lg font-press-start text-sm focus:outline-none focus:border-cyber-pink"
            />
          </div>
          <div className="flex space-x-4">
            <button
              onClick={challengeFriend}
              disabled={isSearching || !friendUsername}
              className="flex-1 px-6 py-4 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50 text-lg"
            >
              {isSearching ? 'Sending Challenge...' : 'Challenge Friend'}
            </button>
            <button
              onClick={joinQueue}
              disabled={isSearching}
              className="flex-1 px-6 py-4 bg-cyber-purple text-white rounded-lg font-press-start hover:bg-cyber-pink transition-colors disabled:opacity-50 text-lg"
            >
              {isSearching ? 'Searching...' : 'Quick Match'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-cyber-yellow text-center text-lg">
            {isDirectChallenge ? 'Challenge in Progress!' : 'Searching for Opponent...'}
          </div>
          {!isDirectChallenge && (
            <div className="space-y-2">
              <div className="text-cyber-blue text-center">
                Queue Position: {queuePosition}
              </div>
              <div className="text-cyber-blue text-center">
                Estimated Time: {estimatedTime}s
              </div>
            </div>
          )}
          <div className="text-cyber-blue text-center">
            Time: {queueTime}s
          </div>
          <button
            onClick={leaveQueue}
            className="w-full px-6 py-4 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors text-lg"
          >
            {isDirectChallenge ? 'Cancel Challenge' : 'Leave Queue'}
          </button>
        </div>
      )}

      {/* Battle Log */}
      <div className="mt-4 space-y-2">
        <h3 className="text-cyber-blue font-press-start text-sm">Status:</h3>
        <div className="bg-cyber-black border border-cyber-purple rounded-lg p-3 h-32 overflow-y-auto">
          {battleLog.map((log, index) => (
            <div key={index} className="text-cyber-yellow font-press-start text-xs">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 