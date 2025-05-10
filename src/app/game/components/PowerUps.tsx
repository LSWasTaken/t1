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
  owned: boolean;
}

interface PowerUpsProps {
  power: number;
  powerUps: {
    doubleClick: boolean;
    autoClick: boolean;
    megaClick: boolean;
  };
  onPurchase: (type: string, cost: number) => void;
}

export default function PowerUps({ power, powerUps, onPurchase }: PowerUpsProps) {
  const { user } = useAuth();
  const powerUpOptions = [
    {
      id: 'doubleClick',
      name: 'Double Click',
      description: 'Double your click power',
      cost: 100,
      owned: powerUps.doubleClick,
    },
    {
      id: 'autoClick',
      name: 'Auto Click',
      description: 'Gain 1 power per second',
      cost: 500,
      owned: powerUps.autoClick,
    },
    {
      id: 'megaClick',
      name: 'Mega Click',
      description: 'Multiply click power by 5',
      cost: 1000,
      owned: powerUps.megaClick,
    },
  ];

  const handlePurchase = async (powerUp: PowerUp) => {
    if (power < powerUp.cost) return;

    onPurchase(powerUp.id, powerUp.cost);

    if (user) {
      try {
        const playerRef = doc(db, 'players', user.uid);
        await updateDoc(playerRef, {
          powerUps: {
            [powerUp.id]: !powerUp.owned,
          },
        });
      } catch (error) {
        console.error('Error updating power-ups:', error);
      }
    }
  };

  return (
    <div className="bg-cyber-dark rounded-lg p-6">
      <h3 className="text-2xl font-press-start text-cyber-pink mb-6 text-center">
        Power-Ups
      </h3>
      <div className="space-y-4">
        {powerUpOptions.map((powerUp) => (
          <div
            key={powerUp.id}
            className="bg-cyber-black rounded-lg p-4"
          >
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-cyber-blue font-press-start">
                {powerUp.name}
              </h4>
              <span className="text-cyber-green">
                {powerUp.cost} power
              </span>
            </div>
            <p className="text-cyber-purple text-sm mb-3">
              {powerUp.description}
            </p>
            <button
              onClick={() => handlePurchase(powerUp)}
              disabled={power < powerUp.cost || powerUp.owned}
              className={`w-full py-2 rounded-lg font-press-start transition-colors ${
                powerUp.owned
                  ? 'bg-cyber-green text-white cursor-not-allowed'
                  : power >= powerUp.cost
                  ? 'bg-cyber-pink text-white hover:bg-cyber-purple'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {powerUp.owned ? 'Owned' : 'Purchase'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
} 