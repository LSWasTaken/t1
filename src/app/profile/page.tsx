'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    power: 0,
    clicks: 0,
    wins: 0,
    losses: 0,
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    
    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      
      if (playerDoc.exists()) {
        const data = playerDoc.data();
        setUsername(data.username || '');
        setStats({
          power: data.power || 0,
          clicks: data.clicks || 0,
          wins: data.wins || 0,
          losses: data.losses || 0,
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !username.trim()) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        username: username.trim(),
      });
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cyber-black text-white">
        <div className="text-2xl font-press-start text-cyber-pink">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 bg-cyber-black text-white">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-press-start text-cyber-pink mb-8 text-center">
          Fighter Profile
        </h1>

        <div className="bg-cyber-dark rounded-lg p-6 space-y-6">
          <div>
            <label className="block text-cyber-blue mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-cyber-black border border-cyber-pink rounded-lg text-white focus:outline-none focus:border-cyber-purple"
              placeholder="Enter your username"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-cyber-black rounded-lg p-4">
              <h3 className="text-cyber-pink font-press-start mb-2">Power</h3>
              <p className="text-cyber-green text-xl">{stats.power}</p>
            </div>
            <div className="bg-cyber-black rounded-lg p-4">
              <h3 className="text-cyber-pink font-press-start mb-2">Clicks</h3>
              <p className="text-cyber-green text-xl">{stats.clicks}</p>
            </div>
            <div className="bg-cyber-black rounded-lg p-4">
              <h3 className="text-cyber-pink font-press-start mb-2">Wins</h3>
              <p className="text-cyber-green text-xl">{stats.wins}</p>
            </div>
            <div className="bg-cyber-black rounded-lg p-4">
              <h3 className="text-cyber-pink font-press-start mb-2">Losses</h3>
              <p className="text-cyber-green text-xl">{stats.losses}</p>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={handleUpdateProfile}
              className="px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
            >
              Save Profile
            </button>
            <button
              onClick={() => router.push('/game')}
              className="px-6 py-3 bg-cyber-blue text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
            >
              Back to Game
            </button>
          </div>
        </div>
      </div>
    </main>
  );
} 