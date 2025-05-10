'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';

export default function Combat({ playerPower }: { playerPower: number }) {
  const { user } = useAuth();
  const [opponent, setOpponent] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [isInCombat, setIsInCombat] = useState(false);

  const findOpponent = async () => {
    if (!user) return;
    setIsSearching(true);
    setBattleLog([]);

    try {
      // First try to find players with similar power (±30% range)
      const powerRange = playerPower * 0.3;
      const minPower = Math.max(1, playerPower - powerRange);
      const maxPower = playerPower + powerRange;

      const q = query(
        collection(db, 'players'),
        where('power', '>=', minPower),
        where('power', '<=', maxPower),
        where('uid', '!=', user.uid)
      );

      const querySnapshot = await getDocs(q);
      const potentialOpponents = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (potentialOpponents.length > 0) {
        // Randomly select an opponent
        const randomIndex = Math.floor(Math.random() * potentialOpponents.length);
        setOpponent(potentialOpponents[randomIndex]);
        setBattleLog(prev => [...prev, `Found opponent: ${potentialOpponents[randomIndex].username || 'Anonymous'}`]);
      } else {
        // If no opponents in range, find any opponent
        const allPlayersQuery = query(
          collection(db, 'players'),
          where('uid', '!=', user.uid)
        );
        const allPlayersSnapshot = await getDocs(allPlayersQuery);
        const allPlayers = allPlayersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        if (allPlayers.length > 0) {
          const randomIndex = Math.floor(Math.random() * allPlayers.length);
          setOpponent(allPlayers[randomIndex]);
          setBattleLog(prev => [...prev, `Found opponent: ${allPlayers[randomIndex].username || 'Anonymous'}`]);
        } else {
          setBattleLog(prev => [...prev, 'No opponents found. Try again later!']);
        }
      }
    } catch (error) {
      console.error('Error finding opponent:', error);
      setBattleLog(prev => [...prev, 'Error finding opponent. Try again!']);
    } finally {
      setIsSearching(false);
    }
  };

  const attack = async () => {
    if (!user || !opponent) return;
    setIsInCombat(true);

    try {
      // Calculate attack and defense rolls
      const attackRoll = Math.floor(Math.random() * playerPower) + 1;
      const defenseRoll = Math.floor(Math.random() * opponent.power) + 1;

      setBattleLog(prev => [
        ...prev,
        `You attack with power: ${attackRoll}`,
        `Opponent defends with power: ${defenseRoll}`
      ]);

      if (attackRoll > defenseRoll) {
        // Calculate power gain (10% of opponent's power)
        const powerGain = Math.floor(opponent.power * 0.1);
        
        // Update player's power and wins
        const playerRef = doc(db, 'players', user.uid);
        await updateDoc(playerRef, {
          power: increment(powerGain),
          wins: increment(1)
        });

        // Update opponent's losses
        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(opponentRef, {
          losses: increment(1)
        });

        setBattleLog(prev => [
          ...prev,
          `Victory! You gained ${powerGain} power!`
        ]);
      } else {
        // Update player's losses
        const playerRef = doc(db, 'players', user.uid);
        await updateDoc(playerRef, {
          losses: increment(1)
        });

        // Update opponent's wins
        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(opponentRef, {
          wins: increment(1)
        });

        setBattleLog(prev => [
          ...prev,
          'Defeat! Try again or find a new opponent.'
        ]);
      }
    } catch (error) {
      console.error('Error in combat:', error);
      setBattleLog(prev => [...prev, 'Error in combat. Try again!']);
    } finally {
      setIsInCombat(false);
    }
  };

  return (
    <div className="bg-cyber-dark rounded-lg p-6">
      <h3 className="text-2xl font-press-start text-cyber-pink mb-6 text-center">
        Combat Arena
      </h3>

      {!opponent ? (
        <button
          onClick={findOpponent}
          disabled={isSearching}
          className="w-full px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50"
        >
          {isSearching ? 'Searching...' : 'Find Opponent'}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="bg-cyber-black rounded-lg p-4">
            <h4 className="text-cyber-blue font-press-start mb-2">
              Opponent: {opponent.username || opponent.email?.split('@')[0] || 'Anonymous'}
            </h4>
            <p className="text-cyber-green">Power: {opponent.power}</p>
            <p className="text-cyber-purple">Wins: {opponent.wins || 0}</p>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={attack}
              disabled={isInCombat}
              className="flex-1 px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50"
            >
              {isInCombat ? 'Fighting...' : 'Attack!'}
            </button>
            <button
              onClick={findOpponent}
              disabled={isSearching}
              className="flex-1 px-6 py-3 bg-cyber-blue text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50"
            >
              New Opponent
            </button>
          </div>
        </div>
      )}

      {battleLog.length > 0 && (
        <div className="mt-6 bg-cyber-black rounded-lg p-4">
          <h4 className="text-cyber-pink font-press-start mb-2">Battle Log</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {battleLog.map((log, index) => (
              <p key={index} className="text-cyber-blue text-sm">
                {log}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 