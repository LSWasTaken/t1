'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { doc, getDoc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Combat from '@/app/game/combat/Combat';

interface Player {
  id: string;
  username: string;
  power: number;
  avatar: string;
}

interface UserData {
  username: string;
  power: number;
  avatar: string;
}

interface MatchData {
  player1Score: number;
  player2Score: number;
  active: boolean;
  finished: boolean;
  winner: string | null;
}

export default function CombatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);

  // Handle exit from combat
  const handleExitCombat = useCallback(async () => {
    if (!user) return;
    
    try {
      // Update player status
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        status: 'online',
        inQueue: false,
        currentOpponent: null
      });
      
      // If there's an active match, mark it as finished
      if (matchId) {
        const matchRef = doc(db, 'matches', matchId);
        const matchSnap = await getDoc(matchRef);
        
        if (matchSnap.exists()) {
          await updateDoc(matchRef, {
            active: false,
            finished: true
          });
        }
      }
      
      // Navigate back to game page
      router.push('/game');
    } catch (err) {
      console.error('Error exiting combat:', err);
    }
  }, [user, router, matchId]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData(data);
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    };

    fetchUserData();
  }, [user]);

  useEffect(() => {
    const fetchOpponent = async () => {
      try {
        if (!searchParams) {
          setError('Invalid URL parameters');
          setLoading(false);
          return;
        }

        const opponentId = searchParams.get('opponent');
        if (!opponentId) {
          setError('No opponent specified');
          setLoading(false);
          return;
        }

        const opponentDoc = await getDoc(doc(db, 'users', opponentId));
        if (!opponentDoc.exists()) {
          setError('Opponent not found');
          setLoading(false);
          return;
        }

        const opponentData = opponentDoc.data() as UserData;
        setOpponent({
          id: opponentDoc.id,
          username: opponentData.username,
          power: opponentData.power || 0,
          avatar: opponentData.avatar || '/default-avatar.png'
        });

        // Create or get match document for real-time updates
        if (user) {
          // Use consistent ID pattern to avoid duplicate matches
          const matchId = [user.uid, opponentId].sort().join('_');
          setMatchId(matchId);
          
          const matchRef = doc(db, 'matches', matchId);
          const matchDoc = await getDoc(matchRef);
          
          if (!matchDoc.exists()) {
            // Create new match document
            await setDoc(matchRef, {
              player1Id: user.uid,
              player2Id: opponentId,
              player1Score: 0,
              player2Score: 0,
              active: true,
              finished: false,
              winner: null,
              timestamp: new Date()
            });
          } else {
            // Reset existing match document
            await updateDoc(matchRef, {
              player1Score: 0,
              player2Score: 0,
              active: true,
              finished: false,
              winner: null,
              timestamp: new Date()
            });
          }
          
          // Set up real-time listener for match data
          const unsubscribe = onSnapshot(matchRef, (doc) => {
            if (doc.exists()) {
              setMatchData(doc.data() as MatchData);
              
              // If match is finished and we're still on this page, redirect
              if (doc.data().finished) {
                router.push('/game');
              }
            }
          });
          
          return () => unsubscribe();
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching opponent:', err);
        setError('Failed to load opponent data');
        setLoading(false);
      }
    };

    if (user) {
      fetchOpponent();
    }
  }, [user, searchParams, router]);

  // Add this useEffect to prevent navigation during combat
  useEffect(() => {
    // Block navigation attempts while in combat
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    // If in combat, add the event listener
    if (opponent) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [opponent]);

  if (!user) {
    return (
      <div className="min-h-screen bg-cyber-black text-cyber-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-press-start mb-4">Please log in to play</h1>
          <button
            onClick={() => router.push('/login')}
            className="cyber-button"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cyber-black text-cyber-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-press-start animate-pulse">Loading Battle...</h1>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cyber-black text-cyber-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-press-start text-cyber-red mb-4">{error}</h1>
          <button
            onClick={() => router.push('/game')}
            className="cyber-button"
          >
            Return to Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-black text-cyber-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={handleExitCombat}
            className="cyber-button"
          >
            Exit Battle
          </button>
          <h1 className="text-2xl font-press-start">Battle Arena</h1>
          <div className="w-24"></div> {/* Spacer for balance */}
        </div>

        <div className="bg-cyber-gray rounded-lg p-8">
          <Combat 
            opponent={opponent} 
            matchId={matchId} 
            onExit={handleExitCombat}
            matchData={matchData}
          />
        </div>
      </div>
    </div>
  );
} 