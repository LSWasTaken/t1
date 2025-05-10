'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const { signIn, signUp, signInWithGithub } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      router.push('/game');
    } catch (error) {
      console.error('Authentication error:', error);
    }
  };

  const handleGithubSignIn = async () => {
    try {
      await signInWithGithub();
      router.push('/game');
    } catch (error) {
      console.error('GitHub authentication error:', error);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-cyber-black text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-press-start text-cyber-pink mb-4">
            Tanza Fighter
          </h1>
          <p className="text-cyber-blue">
            {isSignUp ? 'Create your fighter account' : 'Welcome back, fighter!'}
          </p>
        </div>

        <div className="bg-cyber-dark rounded-lg p-8 shadow-cyber">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-cyber-blue mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-cyber-black border border-cyber-pink rounded-lg text-white focus:outline-none focus:border-cyber-purple"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-cyber-blue mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-cyber-black border border-cyber-pink rounded-lg text-white focus:outline-none focus:border-cyber-purple"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
            >
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6">
            <button
              onClick={handleGithubSignIn}
              className="w-full py-3 bg-cyber-blue text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
            >
              Sign in with GitHub
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-cyber-blue hover:text-cyber-pink transition-colors"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-cyber-blue hover:text-cyber-pink transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
} 