'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ClickerGame from './components/ClickerGame';
import Leaderboard from './components/Leaderboard';

export default function GamePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-cyber-black text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-press-start text-3xl text-cyber-pink">Cyberpunk Game</h1>
          <button
            onClick={() => {
              logout();
              router.push('/');
            }}
            className="px-4 py-2 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
          >
            Logout
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-cyber-dark rounded-lg p-8 shadow-cyber">
            <ClickerGame />
          </div>
          <div className="bg-cyber-dark rounded-lg p-8 shadow-cyber">
            <Leaderboard />
          </div>
        </div>
      </div>
    </main>
  );
} 