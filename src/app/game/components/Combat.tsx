'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, increment, addDoc, serverTimestamp, FieldValue, getDoc, setDoc } from 'firebase/firestore';

interface Player {
  id: string;
  uid: string;
  email?: string;
  username?: string;
  power: number;
  wins?: number;
  losses?: number;
  lastMatch?: FieldValue;
}

interface MatchData {
  player1Id: string;
  player2Id: string;
  player1Power: number;
  player2Power: number;
  winner: string;
  powerGained: number;
  timestamp: FieldValue;
}

export default function Combat({ playerPower }: { playerPower: number }) {
  const { user } = useAuth();
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [isInCombat, setIsInCombat] = useState(false);

  const findOpponent = async () => {
    if (!user) return;
    setIsSearching(true);
    setBattleLog([]);

    try {
      // First check if the current user exists in the players collection
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      
      if (!playerDoc.exists()) {
        // Create player document if it doesn't exist
        try {
          await setDoc(doc(db, 'players', user.uid), {
            uid: user.uid,
            email: user.email,
            power: playerPower, // Use the current player power
            wins: 0,
            losses: 0,
            lastMatch: serverTimestamp()
          });
          console.log('Created new player document');
          setBattleLog(prev => [...prev, 'Created new player profile!']);
        } catch (error) {
          console.error('Error creating player document:', error);
          setBattleLog(prev => [...prev, 'Error creating player profile. Please try again.']);
          setIsSearching(false);
          return;
        }
      }

      // Find any opponent except the current user
      const q = query(
        collection(db, 'players'),
        where('uid', '!=', user.uid)
      );

      const querySnapshot = await getDocs(q);
      const potentialOpponents = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Player));

      if (potentialOpponents.length > 0) {
        // Randomly select an opponent
        const randomIndex = Math.floor(Math.random() * potentialOpponents.length);
        const selectedOpponent = potentialOpponents[randomIndex];
        setOpponent(selectedOpponent);
        setBattleLog(prev => [...prev, `Found opponent: ${selectedOpponent.username || selectedOpponent.email?.split('@')[0] || 'Anonymous'}`]);
      } else {
        setBattleLog(prev => [...prev, 'No other players found. Be the first to join the arena!']);
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
      // Calculate attack and defense rolls with more randomness
      const attackRoll = Math.floor(Math.random() * playerPower * 2); // Up to 100% bonus
      const defenseRoll = Math.floor(Math.random() * opponent.power * 2);

      setBattleLog(prev => [
        ...prev,
        `You attack with power: ${attackRoll}`,
        `Opponent defends with power: ${defenseRoll}`
      ]);

      if (attackRoll > defenseRoll) {
        // Calculate power gain based on opponent's power and a random factor
        const powerGain = Math.floor(opponent.power * (0.05 + Math.random() * 0.1)); // 5-15% of opponent's power
        
        // Update player's power and wins
        const playerRef = doc(db, 'players', user.uid);
        await updateDoc(playerRef, {
          power: increment(powerGain),
          wins: increment(1),
          lastMatch: serverTimestamp()
        });

        // Update opponent's losses
        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(opponentRef, {
          losses: increment(1),
          lastMatch: serverTimestamp()
        });

        // Record the match
        await addDoc(collection(db, 'matches'), {
          player1Id: user.uid,
          player2Id: opponent.id,
          player1Power: playerPower,
          player2Power: opponent.power,
          winner: user.uid,
          powerGained: powerGain,
          timestamp: serverTimestamp()
        } as MatchData);

        setBattleLog(prev => [
          ...prev,
          `Victory! You gained ${powerGain} power!`
        ]);
      } else {
        // Update player's losses
        const playerRef = doc(db, 'players', user.uid);
        await updateDoc(playerRef, {
          losses: increment(1),
          lastMatch: serverTimestamp()
        });

        // Update opponent's wins
        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(opponentRef, {
          wins: increment(1),
          lastMatch: serverTimestamp()
        });

        // Record the match
        await addDoc(collection(db, 'matches'), {
          player1Id: user.uid,
          player2Id: opponent.id,
          player1Power: playerPower,
          player2Power: opponent.power,
          winner: opponent.id,
          powerGained: 0,
          timestamp: serverTimestamp()
        } as MatchData);

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
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p className="text-cyber-green">Power: {opponent.power}</p>
              <p className="text-cyber-purple">Wins: {opponent.wins || 0}</p>
              <p className="text-cyber-red">Losses: {opponent.losses || 0}</p>
              <p className="text-cyber-yellow">Win Rate: {opponent.wins && opponent.losses ? 
                Math.round((opponent.wins / (opponent.wins + opponent.losses)) * 100) : 0}%</p>
            </div>
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