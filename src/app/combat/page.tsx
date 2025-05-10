'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Combat from '@/app/game/components/Combat';

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

export default function CombatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [userHealth, setUserHealth] = useState(100);
  const [opponentHealth, setOpponentHealth] = useState(100);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

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
  }, [user, searchParams]);

  const handleAttack = useCallback(() => {
    if (!opponent || gameOver) return;

    const damage = Math.floor(Math.random() * 20) + 1;
    setOpponentHealth(prev => {
      const newHealth = Math.max(prev - damage, 0);
      if (newHealth === 0) {
        setWinner(userData?.username || 'Player');
        setGameOver(true);
      }
      return newHealth;
    });

    const opponentDamage = Math.floor(Math.random() * 20) + 1;
    setUserHealth(prev => {
      const newHealth = Math.max(prev - opponentDamage, 0);
      if (newHealth === 0) {
        setWinner(opponent.username);
        setGameOver(true);
      }
      return newHealth;
    });
  }, [opponent, userData, gameOver]);

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
            onClick={() => router.push('/game')}
            className="cyber-button"
          >
            Exit Battle
          </button>
          <h1 className="text-2xl font-press-start">Battle Arena</h1>
          <div className="w-24"></div> {/* Spacer for balance */}
        </div>

        <div className="bg-cyber-gray rounded-lg p-8">
          <div className="flex justify-between items-center mb-8">
            <div className="text-center">
              <img
                src={userData?.avatar || '/default-avatar.png'}
                alt={userData?.username || 'Player'}
                className="w-24 h-24 rounded-full mx-auto mb-2"
              />
              <h2 className="font-press-start text-cyber-white">{userData?.username || 'Player'}</h2>
              <p className="text-cyber-light-gray">Power: {userData?.power || 0}</p>
              <h2 className="font-press-start text-cyber-white">Your Health: {userHealth}</h2>
            </div>
            <div className="text-4xl font-press-start text-cyber-white">VS</div>
            <div className="text-center">
              <img
                src={opponent?.avatar || '/default-avatar.png'}
                alt={opponent?.username || 'Opponent'}
                className="w-24 h-24 rounded-full mx-auto mb-2"
              />
              <h2 className="font-press-start text-cyber-white">{opponent?.username || 'Opponent'}</h2>
              <p className="text-cyber-light-gray">Power: {opponent?.power || 0}</p>
              <h2 className="font-press-start text-cyber-white">Opponent Health: {opponentHealth}</h2>
            </div>
          </div>

          <button onClick={handleAttack} className="cyber-button" disabled={gameOver}>
            Attack
          </button>

          {gameOver && (
            <div className="mt-4 text-center">
              <h2 className="text-2xl font-press-start text-cyber-red">
                {winner} Wins!
              </h2>
              <button onClick={() => router.push('/game')} className="cyber-button">
                Return to Game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 