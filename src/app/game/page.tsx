'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Queue from './components/Queue';
import { motion } from 'framer-motion';

interface UserData {
  username: string;
  power: number;
  avatar: string;
  skillRating?: number;
  region?: string;
  lastActive?: Date;
}

export default function GamePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData(data);
        } else {
          // Create new user document if it doesn't exist
          const newUserData: UserData = {
            username: user.displayName || 'Anonymous',
            power: 0,
            avatar: user.photoURL || '/default-avatar.png',
            skillRating: 1000,
            region: 'global',
            lastActive: new Date()
          };
          await setDoc(doc(db, 'users', user.uid), newUserData);
          setUserData(newUserData);
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Failed to load user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  if (!user) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-cyber-black text-cyber-white flex items-center justify-center"
      >
        <div className="text-center space-y-6">
          <h1 className="text-3xl font-press-start text-cyber-pink mb-4">Please log in to play</h1>
          <button
            onClick={() => router.push('/login')}
            className="cyber-button bg-cyber-pink hover:bg-pink-700 text-white px-8 py-3 rounded-lg font-press-start transition-all duration-300"
          >
            Go to Login
          </button>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-cyber-black text-cyber-white flex items-center justify-center"
      >
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyber-pink mx-auto"></div>
          <h1 className="text-2xl font-press-start text-cyber-blue">Loading Game...</h1>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-cyber-black text-cyber-white flex items-center justify-center"
      >
        <div className="text-center space-y-6">
          <p className="text-cyber-red text-xl">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="cyber-button bg-cyber-pink hover:bg-pink-700 text-white px-8 py-3 rounded-lg font-press-start transition-all duration-300"
          >
            Retry
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-cyber-black text-cyber-white"
    >
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex justify-between items-center mb-8 bg-cyber-dark p-4 rounded-lg">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <img 
                src={userData?.avatar || '/default-avatar.png'} 
                alt="Avatar" 
                className="w-16 h-16 rounded-full border-2 border-cyber-pink"
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-cyber-green rounded-full border-2 border-cyber-black"></div>
            </div>
            <div>
              <h2 className="text-2xl font-press-start text-cyber-pink">{userData?.username}</h2>
              <div className="flex items-center space-x-4">
                <p className="text-cyber-green">Power: {userData?.power || 0}</p>
                <p className="text-cyber-blue">Rating: {userData?.skillRating || 1000}</p>
                <p className="text-cyber-yellow">Region: {userData?.region || 'global'}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push('/')}
            className="cyber-button bg-cyber-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-press-start transition-all duration-300"
          >
            Exit Game
          </button>
        </div>

        <div className="bg-cyber-gray rounded-lg p-8 shadow-lg border border-cyber-pink">
          <Queue />
        </div>
      </div>
    </motion.div>
  );
}
