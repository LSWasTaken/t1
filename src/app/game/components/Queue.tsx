'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';

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
}

export default function Queue({ onMatchFound, onQueueUpdate }: QueueProps) {
  const { user } = useAuth();
  const [isInQueue, setIsInQueue] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [queueTimer, setQueueTimer] = useState<NodeJS.Timeout | null>(null);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const [battleLog, setBattleLog] = useState<string[]>([]);

  // Queue timeout effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isInQueue) {
      timer = setInterval(() => {
        setQueueTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            leaveQueue();
            setBattleLog(['Queue timed out. No players found.']);
            return 50;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setQueueTime(50);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isInQueue]);

  // Queue position effect
  useEffect(() => {
    if (isInQueue) {
      const updateQueuePosition = async () => {
        try {
          const q = query(
            collection(db, 'players'),
            where('inQueue', '==', true),
            orderBy('power', 'asc')
          );
          const snapshot = await getDocs(q);
          const position = snapshot.docs.findIndex(doc => doc.id === user?.uid) + 1;
          setQueuePosition(position);
          
          // Estimate time based on queue position
          const baseTime = 30; // Base time in seconds
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
  }, [isInQueue, user]);

  // Add queue state effect
  useEffect(() => {
    const fetchQueueState = async () => {
      if (!user) return;

      try {
        const playerRef = doc(db, 'players', user.uid);
        const unsubscribe = onSnapshot(playerRef, (doc) => {
          const playerData = doc.data();
          if (playerData?.inQueue) {
            setIsInQueue(true);
            setBattleLog(['You are already in queue!']);
            setQueueTime(50);
            onQueueUpdate(true);
          }
        });

        return () => unsubscribe();
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
        lastMatch: serverTimestamp()
      });
      setIsInQueue(true);
      onQueueUpdate(true);
      setBattleLog(prev => [...prev, 'Joined queue!']);
      setQueueTime(0);
      const timer = setInterval(() => {
        setQueueTime(prev => prev + 1);
      }, 1000);
      setQueueTimer(timer);

      // Initial opponent search - find any available player except friends
      const q = query(
        collection(db, 'players'),
        where('inQueue', '==', true),
        where('uid', '!=', user.uid)
      );

      const querySnapshot = await getDocs(q);
      const potentialOpponents = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Player))
        .filter(opponent => {
          // Add your friend's UIDs here to prevent matching
          const friendUids = ['friend1_uid', 'friend2_uid']; // Replace with actual friend UIDs
          return !friendUids.includes(opponent.uid);
        });

      if (potentialOpponents.length > 0) {
        // Pick a random opponent from the filtered list
        const randomIndex = Math.floor(Math.random() * potentialOpponents.length);
        const opponent = potentialOpponents[randomIndex];

        // Update both players' queue status
        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(opponentRef, {
          inQueue: false,
          lastMatch: serverTimestamp()
        });
        await updateDoc(playerRef, {
          inQueue: false,
          lastMatch: serverTimestamp()
        });

        onMatchFound(opponent);
      } else {
        setBattleLog(['Searching for opponent...']);
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

  const leaveQueue = async () => {
    if (!user) return;
    
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: false,
        lastMatch: serverTimestamp()
      });

      // Clear any existing timers
      if (queueTimer) {
        clearInterval(queueTimer);
        setQueueTimer(null);
      }

      // Reset all queue-related state
      setIsInQueue(false);
      setQueueTime(50);
      setQueuePosition(0);
      setEstimatedTime(0);
      setBattleLog(['Left the queue']);
      onQueueUpdate(false);
    } catch (error) {
      console.error('Error leaving queue:', error);
      // Try to force reset the queue state even if the update fails
      setIsInQueue(false);
      onQueueUpdate(false);
      setBattleLog(['Failed to leave queue. Please try again.']);
    }
  };

  return (
    <div className="space-y-4">
      {!isInQueue ? (
        <div className="space-y-4">
          <button
            onClick={joinQueue}
            disabled={isSearching}
            className="w-full px-6 py-4 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50 text-lg"
          >
            {isSearching ? 'Searching...' : 'Enter Queue'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-cyber-yellow text-center text-lg">
            Searching for Opponent...
          </div>
          <div className="space-y-2">
            <div className="text-cyber-blue text-center">
              Queue Position: {queuePosition}
            </div>
            <div className="text-cyber-blue text-center">
              Estimated Time: {estimatedTime}s
            </div>
          </div>
          <button
            onClick={leaveQueue}
            className="w-full px-6 py-4 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors text-lg"
          >
            Leave Queue
          </button>
        </div>
      )}
      {battleLog.length > 0 && (
        <div className="space-y-2">
          {battleLog.map((log, index) => (
            <div key={index} className="text-cyber-blue text-center animate-fade-in">
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 