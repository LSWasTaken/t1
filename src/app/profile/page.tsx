'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Player {
  uid: string;
  email?: string;
  username?: string;
  power: number;
  tanzaWins: number;
  losses: number;
  winStreak: number;
  highestWinStreak: number;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!user) return;

      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);

        if (!playerDoc.exists()) {
          // Create new player document if it doesn't exist
          const newPlayerData: Player = {
            uid: user.uid,
            email: user.email || '',
            username: user.email?.split('@')[0] || 'Anonymous',
            power: 0,
            tanzaWins: 0,
            losses: 0,
            winStreak: 0,
            highestWinStreak: 0
          };
          await setDoc(playerRef, newPlayerData);
          setPlayer(newPlayerData);
          setUsername(newPlayerData.username || '');
        } else {
          const playerData = playerDoc.data();
          setPlayer({
            uid: playerData.uid,
            email: playerData.email,
            username: playerData.username,
            power: playerData.power || 0,
            tanzaWins: playerData.tanzaWins || 0,
            losses: playerData.losses || 0,
            winStreak: playerData.winStreak || 0,
            highestWinStreak: playerData.highestWinStreak || 0
          });
          setUsername(playerData.username || user.email?.split('@')[0] || 'Anonymous');
        }
      } catch (error) {
        console.error('Error fetching player data:', error);
        setError('Failed to load profile data');
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [user]);

  const handleUpdateUsername = async () => {
    if (!user || !username.trim()) return;

    try {
      setError(null);
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        username: username.trim()
      });
      setPlayer(prev => prev ? { ...prev, username: username.trim() } : null);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating username:', error);
      setError('Failed to update username. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cyber-black text-white">
        <div className="text-2xl font-press-start text-cyber-pink">Loading...</div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-cyber-blue text-center">No profile data found.</div>
    );
  }

  return (
    <main className="min-h-screen p-4 bg-cyber-black text-white">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-press-start text-cyber-pink mb-8 text-center">
          Fighter Profile
        </h1>

        <div className="bg-cyber-dark rounded-lg p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-cyber-yellow text-center sm:text-left">
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="px-4 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-blue rounded-lg font-press-start focus:outline-none focus:border-cyber-purple"
                    placeholder="Enter username"
                    maxLength={20}
                  />
                  <button
                    onClick={handleUpdateUsername}
                    className="px-4 py-2 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setUsername(player.username || player.email?.split('@')[0] || 'Anonymous');
                    }}
                    className="px-4 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <span className="text-cyber-pink font-bold">{player.username || player.email?.split('@')[0] || 'Anonymous'}</span>
                  {player.winStreak >= 2 && (
                    <span className="text-yellow-400" title={`${player.winStreak} Win Streak!`}>
                      👑
                    </span>
                  )}
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
                  >
                    Edit
                  </button>
                </div>
              )}
              {error && (
                <p className="text-cyber-red text-sm mt-2">{error}</p>
              )}
            </div>
            <div className="text-cyber-blue text-center sm:text-right">
              Power: {player.power}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-cyber-black border-2 border-cyber-pink rounded-lg p-4">
              <div className="text-cyber-pink text-center">Tanza Mode Wins</div>
              <div className="text-cyber-blue text-2xl text-center">{player.tanzaWins}</div>
            </div>
            <div className="bg-cyber-black border-2 border-cyber-pink rounded-lg p-4">
              <div className="text-cyber-pink text-center">Losses</div>
              <div className="text-cyber-blue text-2xl text-center">{player.losses}</div>
            </div>
            <div className="bg-cyber-black border-2 border-cyber-pink rounded-lg p-4">
              <div className="text-cyber-pink text-center">Current Win Streak</div>
              <div className="text-cyber-blue text-2xl text-center">{player.winStreak}</div>
            </div>
            <div className="bg-cyber-black border-2 border-cyber-pink rounded-lg p-4">
              <div className="text-cyber-pink text-center">Highest Win Streak</div>
              <div className="text-cyber-blue text-2xl text-center">{player.highestWinStreak}</div>
            </div>
          </div>

          <div className="flex justify-between">
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