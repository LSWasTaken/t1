'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Queue from './components/Queue';

interface UserData {
  username: string;
  power: number;
  avatar: string;
}

export default function GamePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData(data);
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-cyber-black text-cyber-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-press-start mb-4">Please log in to play</h1>
          <button
            onClick={() => router.push('/login')}
            className="cyber-button"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cyber-black text-cyber-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-press-start animate-pulse">Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-black text-cyber-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-4">
            <img 
              src={userData?.avatar || '/default-avatar.png'} 
              alt="Avatar" 
              className="w-12 h-12 rounded-full"
            />
            <div>
              <h2 className="text-xl font-press-start">{userData?.username}</h2>
              <p className="text-cyber-green">Power: {userData?.power || 0}</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/')}
            className="cyber-button"
          >
            Exit Game
          </button>
        </div>

        <div className="bg-cyber-gray rounded-lg p-8">
          <Queue />
        </div>
      </div>
    </div>
  );
}
