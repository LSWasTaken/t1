'use client';

import { useAuth } from '@/lib/auth';
import Link from 'next/link';

export default function Home() {
  const { user } = useAuth();

  return (
    <main className="min-h-screen bg-cyber-black text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="font-press-start text-4xl md:text-6xl mb-8 text-cyber-pink">
            Cyberpunk Game
          </h1>
          <p className="text-xl mb-12 text-cyber-blue">
            Welcome to the future of gaming
          </p>
          
          {user ? (
            <div className="space-y-4">
              <p className="text-cyber-green">
                Welcome back, {user.email}!
              </p>
              <Link
                href="/game"
                className="inline-block bg-cyber-pink text-white px-8 py-3 rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
              >
                Start Game
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <Link
                href="/login"
                className="inline-block bg-cyber-pink text-white px-8 py-3 rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
              >
                Login to Play
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
} 