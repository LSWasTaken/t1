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
  wins: number;
  losses: number;
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

export default function Combat() {
  const { user } = useAuth();
  const [playerPower, setPlayerPower] = useState(0);
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!user) return;

      try {
        const playerDoc = await getDoc(doc(db, 'players', user.uid));
        const playerData = playerDoc.data();
        setPlayerPower(playerData?.power || 0);
      } catch (error) {
        console.error('Error fetching player data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [user]);

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
          await setDoc(playerRef, {
            uid: user.uid,
            email: user.email,
            power: playerPower,
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
    setIsSearching(true);

    try {
      // Calculate attack and defense with more randomness
      const attackRoll = Math.random() * 2; // 0 to 2 (up to 100% bonus)
      const defenseRoll = Math.random() * 2; // 0 to 2 (up to 100% bonus)
      
      const attackPower = playerPower * attackRoll;
      const defensePower = opponent.power * defenseRoll;

      if (attackPower > defensePower) {
        // Calculate variable power gain (5-15% of opponent's power)
        const powerGainPercentage = 0.05 + Math.random() * 0.1; // 5% to 15%
        const powerGain = Math.floor(opponent.power * powerGainPercentage);
        
        // Update player's power
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
          `You attacked with ${Math.floor(attackPower)} power!`,
          `Opponent defended with ${Math.floor(defensePower)} power!`,
          `Victory! Gained ${powerGain} power!`
        ]);
        setPlayerPower(prev => prev + powerGain);
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
          `You attacked with ${Math.floor(attackPower)} power!`,
          `Opponent defended with ${Math.floor(defensePower)} power!`,
          'Defeat! Better luck next time!'
        ]);
      }
    } catch (error) {
      console.error('Error in combat:', error);
      setBattleLog(prev => [...prev, 'Error in combat. Try again!']);
    } finally {
      setIsSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="text-cyber-blue text-center">Loading combat data...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-cyber-blue">
          Your Power: {playerPower}
        </div>
        {opponent && (
          <div className="text-cyber-pink">
            Opponent Power: {opponent.power}
          </div>
        )}
      </div>

      <div className="bg-cyber-black rounded-lg p-4">
        <div className="space-y-4">
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
              <div className="text-cyber-yellow">
                Fighting against: {opponent.username || opponent.email?.split('@')[0] || 'Anonymous'}
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={attack}
                  disabled={isSearching}
                  className="flex-1 px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50"
                >
                  {isSearching ? 'Fighting...' : 'Attack!'}
                </button>
                <button
                  onClick={() => setOpponent(null)}
                  className="px-6 py-3 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
                >
                  Find New Opponent
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {battleLog.length > 0 && (
        <div className="bg-cyber-black rounded-lg p-4">
          <h3 className="text-cyber-pink mb-2">Battle Log:</h3>
          <div className="space-y-1">
            {battleLog.map((log, index) => (
              <div key={index} className="text-cyber-blue">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 