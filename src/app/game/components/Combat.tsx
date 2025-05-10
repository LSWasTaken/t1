'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, increment, collection, addDoc, serverTimestamp, FieldValue, query, where, getDocs } from 'firebase/firestore';

interface Player {
  id: string;
  uid: string;
  email?: string;
  username?: string;
  power: number;
  wins: number;
  losses: number;
  winStreak: number;
  highestWinStreak: number;
  inQueue?: boolean;
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

const MAX_HEALTH = 100;

export default function Combat() {
  const { user } = useAuth();
  const [playerPower, setPlayerPower] = useState(0);
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerHealth, setPlayerHealth] = useState(MAX_HEALTH);
  const [opponentHealth, setOpponentHealth] = useState(MAX_HEALTH);
  const [isInCombat, setIsInCombat] = useState(false);
  const [inQueue, setInQueue] = useState(false);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!user) return;

      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        setPlayerPower(playerData?.power || 0);
        setInQueue(playerData?.inQueue || false);
      } catch (error) {
        console.error('Error fetching player data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [user]);

  // Add copy-paste prevention
  useEffect(() => {
    const preventCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('copy', preventCopyPaste);
    document.addEventListener('paste', preventCopyPaste);
    document.addEventListener('cut', preventCopyPaste);

    return () => {
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('cut', preventCopyPaste);
    };
  }, []);

  const resetHealth = () => {
    setPlayerHealth(MAX_HEALTH);
    setOpponentHealth(MAX_HEALTH);
  };

  const joinQueue = async () => {
    if (!user) return;
    setIsSearching(true);
    setBattleLog([]);
    resetHealth();

    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: true,
        lastMatch: serverTimestamp()
      });
      setInQueue(true);
      setBattleLog(['Waiting for opponent...']);

      // Find opponent in queue
      const q = query(
        collection(db, 'players'),
        where('uid', '!=', user.uid),
        where('inQueue', '==', true)
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
        setBattleLog([`Found opponent: ${selectedOpponent.username || selectedOpponent.email?.split('@')[0] || 'Anonymous'}`]);
      }
    } catch (error) {
      console.error('Error joining queue:', error);
      setBattleLog(['Error joining queue. Try again!']);
      setInQueue(false);
    } finally {
      setIsSearching(false);
    }
  };

  const leaveQueue = async () => {
    if (!user) return;
    try {
      const playerRef = doc(db, 'players', user.uid);
      
      if (opponent) {
        // If in a match, handle surrender
        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(playerRef, {
          losses: increment(1),
          inQueue: false,
          lastMatch: serverTimestamp(),
          winStreak: 0 // Reset win streak on surrender
        });

        await updateDoc(opponentRef, {
          wins: increment(1),
          inQueue: false,
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

        setBattleLog(['You surrendered the match!']);
      } else {
        // Just leave queue if not in a match
        await updateDoc(playerRef, {
          inQueue: false
        });
        setBattleLog(['Left the queue']);
      }

      setInQueue(false);
      setOpponent(null);
      resetHealth();
    } catch (error) {
      console.error('Error leaving queue:', error);
      setBattleLog(['Error leaving queue. Try again!']);
    }
  };

  const attack = async () => {
    if (!user || !opponent) return;
    setIsInCombat(true);
    setBattleLog([]); // Reset battle log for new move

    try {
      // Calculate attack and defense with more randomness
      const attackRoll = Math.random() * 2;
      const defenseRoll = Math.random() * 2;
      
      const attackPower = playerPower * attackRoll;
      const defensePower = opponent.power * defenseRoll;

      // Calculate damage (20-40% of attack power)
      const damagePercentage = 0.2 + Math.random() * 0.2;
      const damage = Math.floor(attackPower * damagePercentage);
      
      // Apply damage to opponent
      const newOpponentHealth = Math.max(0, opponentHealth - damage);
      setOpponentHealth(newOpponentHealth);

      const newBattleLog = [
        `You attacked with ${Math.floor(attackPower)} power!`,
        `Opponent defended with ${Math.floor(defensePower)} power!`,
        `Dealt ${damage} damage!`
      ];

      // Check if opponent is defeated
      if (newOpponentHealth <= 0) {
        const powerGainPercentage = 0.05 + Math.random() * 0.1;
        const powerGain = Math.floor(opponent.power * powerGainPercentage);
        
        // Get current player data to update win streak
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        
        const currentWinStreak = (playerData?.winStreak || 0) + 1;
        const highestWinStreak = Math.max(currentWinStreak, playerData?.highestWinStreak || 0);

        await updateDoc(playerRef, {
          power: increment(powerGain),
          wins: increment(1),
          inQueue: false,
          lastMatch: serverTimestamp(),
          winStreak: currentWinStreak,
          highestWinStreak: highestWinStreak
        });

        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(opponentRef, {
          losses: increment(1),
          inQueue: false,
          lastMatch: serverTimestamp(),
          winStreak: 0 // Reset opponent's win streak
        });

        await addDoc(collection(db, 'matches'), {
          player1Id: user.uid,
          player2Id: opponent.id,
          player1Power: playerPower,
          player2Power: opponent.power,
          winner: user.uid,
          powerGained: powerGain,
          timestamp: serverTimestamp()
        } as MatchData);

        newBattleLog.push(
          `Victory! Gained ${powerGain} power!`,
          currentWinStreak >= 2 ? `Win Streak: ${currentWinStreak}!` : ''
        );
        setPlayerPower(prev => prev + powerGain);
        setOpponent(null);
        setInQueue(false);
      } else {
        // Opponent counter-attacks
        const counterAttackRoll = Math.random() * 2;
        const counterDefenseRoll = Math.random() * 2;
        
        const counterAttackPower = opponent.power * counterAttackRoll;
        const counterDefensePower = playerPower * counterDefenseRoll;

        if (counterAttackPower > counterDefensePower) {
          const counterDamage = Math.floor(counterAttackPower * (0.2 + Math.random() * 0.2));
          const newPlayerHealth = Math.max(0, playerHealth - counterDamage);
          setPlayerHealth(newPlayerHealth);

          newBattleLog.push(
            `Opponent counter-attacked with ${Math.floor(counterAttackPower)} power!`,
            `You defended with ${Math.floor(counterDefensePower)} power!`,
            `Took ${counterDamage} damage!`
          );

          if (newPlayerHealth <= 0) {
            const playerRef = doc(db, 'players', user.uid);
            await updateDoc(playerRef, {
              losses: increment(1),
              inQueue: false,
              lastMatch: serverTimestamp(),
              winStreak: 0 // Reset win streak on loss
            });

            const opponentRef = doc(db, 'players', opponent.id);
            await updateDoc(opponentRef, {
              wins: increment(1),
              inQueue: false,
              lastMatch: serverTimestamp()
            });

            await addDoc(collection(db, 'matches'), {
              player1Id: user.uid,
              player2Id: opponent.id,
              player1Power: playerPower,
              player2Power: opponent.power,
              winner: opponent.id,
              powerGained: 0,
              timestamp: serverTimestamp()
            } as MatchData);

            newBattleLog.push('You were defeated! Better luck next time!');
            setOpponent(null);
            setInQueue(false);
          }
        } else {
          newBattleLog.push(
            `Opponent counter-attacked with ${Math.floor(counterAttackPower)} power!`,
            `You defended with ${Math.floor(counterDefensePower)} power!`,
            'You blocked the attack!'
          );
        }
      }

      setBattleLog(newBattleLog);
    } catch (error) {
      console.error('Error in combat:', error);
      setBattleLog(['Error in combat. Try again!']);
    } finally {
      setIsInCombat(false);
    }
  };

  if (loading) {
    return (
      <div className="text-cyber-blue text-center">Loading combat data...</div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto px-4 py-4" onCopy={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()}>
      {/* Power Display */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-2 bg-cyber-black rounded-lg p-3">
        <div className="text-cyber-blue text-center sm:text-left w-full sm:w-auto text-lg">
          Your Power: {playerPower}
        </div>
        {opponent && (
          <div className="text-cyber-pink text-center sm:text-right w-full sm:w-auto text-lg">
            Opponent Power: {opponent.power}
          </div>
        )}
      </div>

      {/* Main Combat Area */}
      <div className="bg-cyber-black rounded-lg p-4">
        <div className="space-y-4">
          {!opponent ? (
            <div className="space-y-4">
              <button
                onClick={inQueue ? leaveQueue : joinQueue}
                disabled={isSearching}
                className="w-full px-6 py-4 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50 text-lg"
              >
                {isSearching ? 'Searching...' : inQueue ? 'Leave Queue' : 'Join Queue'}
              </button>
              {inQueue && (
                <div className="text-cyber-yellow text-center animate-pulse text-lg">
                  Waiting for opponent...
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-cyber-yellow text-center text-lg font-bold">
                Fighting against: {opponent.username || opponent.email?.split('@')[0] || 'Anonymous'}
              </div>
              
              {/* Health Bars */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-cyber-blue font-bold">Your Health</span>
                    <span className="text-cyber-blue font-bold">{playerHealth}/{MAX_HEALTH}</span>
                  </div>
                  <div className="h-5 bg-cyber-black border-2 border-cyber-blue rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyber-blue transition-all duration-300"
                      style={{ width: `${(playerHealth / MAX_HEALTH) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-cyber-pink font-bold">Opponent Health</span>
                    <span className="text-cyber-pink font-bold">{opponentHealth}/{MAX_HEALTH}</span>
                  </div>
                  <div className="h-5 bg-cyber-black border-2 border-cyber-pink rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyber-pink transition-all duration-300"
                      style={{ width: `${(opponentHealth / MAX_HEALTH) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={attack}
                  disabled={isInCombat}
                  className="flex-1 px-6 py-4 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50 text-lg"
                >
                  {isInCombat ? 'Fighting...' : 'Attack!'}
                </button>
                <button
                  onClick={leaveQueue}
                  className="w-full sm:w-auto px-6 py-4 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors text-lg"
                >
                  Surrender
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Battle Log */}
      {battleLog.length > 0 && (
        <div className="bg-cyber-black rounded-lg p-4">
          <h3 className="text-cyber-pink mb-3 text-center sm:text-left text-lg font-bold">Battle Log:</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto px-2">
            {battleLog.map((log, index) => (
              <div key={index} className="text-cyber-blue text-center sm:text-left text-base">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 