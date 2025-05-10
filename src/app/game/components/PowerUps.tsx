'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface PowerUp {
  id: string;
  name: string;
  description: string;
  cost: number;
  multiplier: number;
  owned: number;
}

interface PowerUpsProps {
  power: number;
  onPurchase: (cost: number) => void;
}

export default function PowerUps({ power, onPurchase }: PowerUpsProps) {
  const { user } = useAuth();
  const [powerUps, setPowerUps] = useState<PowerUp[]>([
    {
      id: 'click-boost',
      name: 'Click Boost',
      description: 'Doubles your click power',
      cost: 100,
      multiplier: 2,
      owned: 0,
    },
    {
      id: 'auto-clicker',
      name: 'Auto Clicker',
      description: 'Automatically clicks every second',
      cost: 500,
      multiplier: 1,
      owned: 0,
    },
    {
      id: 'power-multiplier',
      name: 'Power Multiplier',
      description: 'Doubles all power gains',
      cost: 1000,
      multiplier: 2,
      owned: 0,
    },
  ]);

  const handlePurchase = async (powerUp: PowerUp) => {
    if (power < powerUp.cost) return;

    const newPowerUps = powerUps.map((p) =>
      p.id === powerUp.id ? { ...p, owned: p.owned + 1 } : p
    );
    setPowerUps(newPowerUps);
    onPurchase(powerUp.cost);

    if (user) {
      try {
        const playerRef = doc(db, 'players', user.uid);
        await updateDoc(playerRef, {
          powerUps: newPowerUps,
        });
      } catch (error) {
        console.error('Error updating power-ups:', error);
      }
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-press-start text-cyber-pink mb-4">
        Power-Ups
      </h3>
      <div className="grid grid-cols-1 gap-4">
        {powerUps.map((powerUp) => (
          <div
            key={powerUp.id}
            className="bg-cyber-black rounded-lg p-4 border border-cyber-pink hover:border-cyber-purple transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-press-start text-cyber-blue">
                  {powerUp.name}
                </h4>
                <p className="text-sm text-cyber-green">
                  {powerUp.description}
                </p>
              </div>
              <span className="text-cyber-pink font-press-start">
                x{powerUp.owned}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-cyber-blue">
                Cost: {powerUp.cost} power
              </span>
              <button
                onClick={() => handlePurchase(powerUp)}
                disabled={power < powerUp.cost}
                className="px-4 py-2 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Purchase
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 