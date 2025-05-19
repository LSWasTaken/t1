'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Leaderboard from '../game/components/Leaderboard';

export default function LeaderboardPage() {
  const { user } = useAuth();
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
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-press-start text-cyber-pink mb-4">Global Rankings</h1>
        <p className="text-cyber-blue">
          Compete with players from around the world and climb the ranks!
        </p>
      </div>
      <Leaderboard />
    </div>
  );
} 