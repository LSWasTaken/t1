'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Suspense } from 'react';

function Navigation() {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-cyber-dark p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="text-2xl font-press-start text-cyber-pink">
          Tanza Fighter
        </Link>
        <div className="flex items-center space-x-4">
          {user ? (
            <>
              <Link
                href="/leaderboard"
                className="px-4 py-2 bg-cyber-black border-2 border-cyber-blue text-cyber-blue hover:bg-cyber-blue hover:text-cyber-black transition-all duration-300 font-press-start text-sm"
              >
                Leaderboard
              </Link>
              <Link
                href="/profile"
                className="px-4 py-2 bg-cyber-black border-2 border-cyber-purple text-cyber-purple hover:bg-cyber-purple hover:text-cyber-black transition-all duration-300 font-press-start text-sm"
              >
                Profile
              </Link>
              <Link
                href="/game"
                className="px-4 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-pink hover:bg-cyber-pink hover:text-cyber-black transition-all duration-300 font-press-start text-sm"
              >
                Game
              </Link>
              <button
                onClick={() => logout()}
                className="px-4 py-2 bg-cyber-black border-2 border-cyber-red text-cyber-red hover:bg-cyber-red hover:text-cyber-black transition-all duration-300 font-press-start text-sm"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="px-4 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-pink hover:bg-cyber-pink hover:text-cyber-black transition-all duration-300 font-press-start text-sm"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cyber-black">
      <Suspense fallback={<div className="text-center p-4">Loading...</div>}>
        <Navigation />
      </Suspense>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Suspense fallback={<div className="text-center p-4">Loading content...</div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
} 