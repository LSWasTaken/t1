'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, signOut } = useAuth();

  return (
    <>
      <nav className="bg-cyber-dark p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-press-start text-cyber-pink">
            Tanza Fighter
          </Link>
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="text-cyber-blue hover:text-cyber-purple transition-colors"
                >
                  Profile
                </Link>
                <Link
                  href="/game"
                  className="text-cyber-blue hover:text-cyber-purple transition-colors"
                >
                  Game
                </Link>
                <button
                  onClick={() => signOut()}
                  className="text-cyber-pink hover:text-cyber-purple transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="text-cyber-pink hover:text-cyber-purple transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>
      {children}
    </>
  );
} 