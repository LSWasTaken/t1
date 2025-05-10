'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ClickerGame from './components/ClickerGame';
import Leaderboard from './components/Leaderboard';

export default function GamePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cyber-black text-white">
        <div className="text-2xl font-press-start text-cyber-pink">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen p-4 bg-cyber-black text-white">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-press-start text-cyber-pink mb-8 text-center">
          Tanza Fighter Arena
        </h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ClickerGame />
          </div>
          <div>
            <Leaderboard />
          </div>
        </div>
      </div>
    </main>
  );
} 