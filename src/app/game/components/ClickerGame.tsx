'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';

interface PlayerStats {
  power: number;
  clicks: number;
  lastClick: number;
  clickPower: number;
  email?: string;
}

export default function ClickerGame() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PlayerStats>({
    power: 0,
    clicks: 0,
    lastClick: 0,
    clickPower: 1,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadPlayerStats();
    }
  }, [user]);

  const loadPlayerStats = async () => {
    if (!user) return;
    
    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      
      if (playerDoc.exists()) {
        setStats(playerDoc.data() as PlayerStats);
      } else {
        // Initialize new player
        const newStats: PlayerStats = {
          power: 0,
          clicks: 0,
          lastClick: Date.now(),
          clickPower: 1,
          email: user.email || undefined,
        };
        await setDoc(playerRef, newStats);
        setStats(newStats);
      }
    } catch (error) {
      console.error('Error loading player stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = async () => {
    if (!user) return;

    const now = Date.now();
    const timeSinceLastClick = now - stats.lastClick;
    const powerGain = stats.clickPower;

    const newStats = {
      ...stats,
      power: stats.power + powerGain,
      clicks: stats.clicks + 1,
      lastClick: now,
    };

    setStats(newStats);

    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        power: newStats.power,
        clicks: newStats.clicks,
        lastClick: newStats.lastClick,
      });
    } catch (error) {
      console.error('Error updating player stats:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center">
        <p className="text-cyber-blue">Loading game...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-2xl font-press-start text-cyber-pink mb-4">
          Power: {stats.power}
        </h3>
        <p className="text-cyber-blue mb-2">
          Clicks: {stats.clicks}
        </p>
        <p className="text-cyber-green">
          Click Power: {stats.clickPower}
        </p>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleClick}
          className="w-32 h-32 rounded-full bg-cyber-pink hover:bg-cyber-purple transition-colors flex items-center justify-center font-press-start text-xl"
        >
          CLICK!
        </button>
      </div>
    </div>
  );
} 