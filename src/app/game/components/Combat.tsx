'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

interface Player {
  id: string;
  email: string;
  power: number;
}

interface CombatProps {
  playerPower: number;
  onWin: (powerGain: number) => void;
}

export default function Combat({ playerPower, onWin }: CombatProps) {
  const { user } = useAuth();
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);

  const findOpponent = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Find players with similar power level (±20%)
      const minPower = playerPower * 0.8;
      const maxPower = playerPower * 1.2;

      const q = query(
        collection(db, 'players'),
        where('power', '>=', minPower),
        where('power', '<=', maxPower)
      );

      const snapshot = await getDocs(q);
      const players = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Player))
        .filter(p => p.id !== user.uid);

      if (players.length > 0) {
        const randomOpponent = players[Math.floor(Math.random() * players.length)];
        setOpponent(randomOpponent);
        setBattleLog([]);
      }
    } catch (error) {
      console.error('Error finding opponent:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttack = () => {
    if (!opponent) return;

    const playerRoll = Math.random() * playerPower;
    const opponentRoll = Math.random() * opponent.power;

    const newLog = [...battleLog];
    newLog.push(`You attack with ${Math.floor(playerRoll)} power!`);
    newLog.push(`Opponent defends with ${Math.floor(opponentRoll)} power!`);

    if (playerRoll > opponentRoll) {
      const powerGain = Math.floor(opponent.power * 0.1);
      newLog.push(`Victory! You gained ${powerGain} power!`);
      onWin(powerGain);
      setOpponent(null);
    } else {
      newLog.push('Defeat! Try again!');
    }

    setBattleLog(newLog);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-press-start text-cyber-pink mb-4">
        Combat Arena
      </h3>

      {!opponent ? (
        <button
          onClick={findOpponent}
          disabled={isLoading}
          className="w-full py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Finding Opponent...' : 'Find Opponent'}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="bg-cyber-black rounded-lg p-4 border border-cyber-pink">
            <h4 className="font-press-start text-cyber-blue mb-2">
              Opponent: {opponent.email}
            </h4>
            <p className="text-cyber-green">
              Power: {opponent.power}
            </p>
          </div>

          <button
            onClick={handleAttack}
            className="w-full py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
          >
            Attack!
          </button>

          <div className="bg-cyber-black rounded-lg p-4 border border-cyber-pink max-h-48 overflow-y-auto">
            <h4 className="font-press-start text-cyber-blue mb-2">
              Battle Log
            </h4>
            {battleLog.map((log, index) => (
              <p key={index} className="text-cyber-green text-sm mb-1">
                {log}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 