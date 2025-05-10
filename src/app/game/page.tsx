'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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

        <div className="bg-cyber-dark rounded-lg p-8 shadow-cyber">
          <div className="text-center">
            <h2 className="font-press-start text-2xl text-cyber-blue mb-4">
              Welcome to the Game, {user.email}!
            </h2>
            <p className="text-cyber-green mb-8">
              Game content will be added here...
            </p>
          </div>
        </div>
      </div>
    </main>
  );
} 