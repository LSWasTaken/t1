'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import PowerUps from './PowerUps';
import Combat from './Combat';
import Leaderboard from './Leaderboard';

export default function ClickerGame() {
  const { user } = useAuth();
  const router = useRouter();
  const [power, setPower] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [clickPower, setClickPower] = useState(1);
  const [autoClickPower, setAutoClickPower] = useState(0);
  const [powerUps, setPowerUps] = useState({
    doubleClick: false,
    autoClick: false,
    megaClick: false,
  });

  useEffect(() => {
    if (user) {
      loadPlayerData();
    }
  }, [user]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoClickPower > 0) {
      interval = setInterval(() => {
        setPower(prev => prev + autoClickPower);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [autoClickPower]);

  const loadPlayerData = async () => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);

      if (playerDoc.exists()) {
        const data = playerDoc.data();
        setPower(data.power || 0);
        setClicks(data.clicks || 0);
        setClickPower(data.clickPower || 1);
        setAutoClickPower(data.autoClickPower || 0);
        setPowerUps(data.powerUps || {
          doubleClick: false,
          autoClick: false,
          megaClick: false,
        });
      } else {
        // Initialize new player
        await setDoc(playerRef, {
          uid: user.uid,
          email: user.email,
          power: 0,
          clicks: 0,
          clickPower: 1,
          autoClickPower: 0,
          powerUps: {
            doubleClick: false,
            autoClick: false,
            megaClick: false,
          },
          wins: 0,
          losses: 0,
          username: user.email?.split('@')[0] || 'Anonymous',
        });
      }
    } catch (error) {
      console.error('Error loading player data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = async () => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const newPower = power + clickPower;
      const newClicks = clicks + 1;

      setPower(newPower);
      setClicks(newClicks);

      await updateDoc(playerRef, {
        power: newPower,
        clicks: newClicks,
      });
    } catch (error) {
      console.error('Error updating power:', error);
    }
  };

  const handlePowerUp = async (type: string, cost: number) => {
    if (!user || power < cost) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const newPower = power - cost;

      switch (type) {
        case 'doubleClick':
          setClickPower(prev => prev * 2);
          setPowerUps(prev => ({ ...prev, doubleClick: true }));
          await updateDoc(playerRef, {
            power: newPower,
            clickPower: clickPower * 2,
            'powerUps.doubleClick': true,
          });
          break;
        case 'autoClick':
          setAutoClickPower(prev => prev + 1);
          setPowerUps(prev => ({ ...prev, autoClick: true }));
          await updateDoc(playerRef, {
            power: newPower,
            autoClickPower: autoClickPower + 1,
            'powerUps.autoClick': true,
          });
          break;
        case 'megaClick':
          setClickPower(prev => prev * 5);
          setPowerUps(prev => ({ ...prev, megaClick: true }));
          await updateDoc(playerRef, {
            power: newPower,
            clickPower: clickPower * 5,
            'powerUps.megaClick': true,
          });
          break;
      }

      setPower(newPower);
    } catch (error) {
      console.error('Error purchasing power-up:', error);
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
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-press-start text-cyber-pink">
            Tanza Fighter
          </h1>
          <button
            onClick={() => router.push('/profile')}
            className="px-4 py-2 bg-cyber-blue text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
          >
            Profile
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-cyber-dark rounded-lg p-6">
              <h2 className="text-2xl font-press-start text-cyber-pink mb-4">
                Your Power: {power}
              </h2>
              <p className="text-cyber-blue mb-4">
                Click Power: {clickPower} | Auto Power: {autoClickPower}/s
              </p>
              <button
                onClick={handleClick}
                className="w-full py-4 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
              >
                Click to Fight!
              </button>
            </div>

            <PowerUps
              power={power}
              powerUps={powerUps}
              onPurchase={handlePowerUp}
            />
          </div>

          <div className="space-y-6">
            <Combat />
            <Leaderboard />
          </div>
        </div>
      </div>
    </main>
  );
} 