'use client';

import { useEffect, useState } from 'react';
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

export default function CombatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOpponent = async () => {
      try {
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

        const opponentData = opponentDoc.data();
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
                src={user.avatar || '/default-avatar.png'}
                alt={user.username}
                className="w-24 h-24 rounded-full mx-auto mb-2"
              />
              <h2 className="font-press-start text-cyber-blue">{user.username}</h2>
              <p className="text-cyber-light-gray">Power: {user.power || 0}</p>
            </div>
            <div className="text-4xl font-press-start text-cyber-yellow">VS</div>
            <div className="text-center">
              <img
                src={opponent?.avatar || '/default-avatar.png'}
                alt={opponent?.username}
                className="w-24 h-24 rounded-full mx-auto mb-2"
              />
              <h2 className="font-press-start text-cyber-pink">{opponent?.username}</h2>
              <p className="text-cyber-light-gray">Power: {opponent?.power || 0}</p>
            </div>
          </div>

          <Combat opponent={opponent} />
        </div>
      </div>
    </div>
  );
} 