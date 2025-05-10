'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { toast } from 'react-toastify';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { signIn, signUp, signInWithGithub } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signIn(email, password);
      toast.success('Logged in successfully!');
      router.push('/');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        try {
          await signUp(email, password);
          toast.success('Account created and logged in!');
          router.push('/');
        } catch (signUpError: any) {
          toast.error(signUpError.message);
        }
      } else {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGithub();
      toast.success('Logged in with GitHub!');
      router.push('/');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-cyber-black text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-8 bg-cyber-dark rounded-lg shadow-cyber">
        <div className="text-center">
          <h1 className="font-press-start text-3xl text-cyber-pink mb-2">Login</h1>
          <p className="text-cyber-blue">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-cyber-blue">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-cyber-black border border-cyber-pink rounded-md text-white focus:outline-none focus:ring-2 focus:ring-cyber-pink"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-cyber-blue">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-cyber-black border border-cyber-pink rounded-md text-white focus:outline-none focus:ring-2 focus:ring-cyber-pink"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-white bg-cyber-pink hover:bg-cyber-purple focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyber-pink font-press-start disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Sign In / Sign Up'}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-cyber-pink"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-cyber-dark text-cyber-blue">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGithubSignIn}
            disabled={isLoading}
            className="mt-4 w-full py-2 px-4 border border-cyber-pink rounded-md shadow-sm text-white bg-cyber-black hover:bg-cyber-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyber-pink font-press-start disabled:opacity-50"
          >
            GitHub
          </button>
        </div>
      </div>
    </main>
  );
} 