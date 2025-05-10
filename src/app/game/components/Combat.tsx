'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, increment, collection, addDoc, serverTimestamp, FieldValue, query, where, getDocs, orderBy, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';

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
  lastMatch?: FieldValue;
  currentHealth?: number;
  opponentHealth?: number;
  isAttacking?: boolean;
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

interface BattleData {
  player1Id: string;
  player2Id: string;
  player1Health: number;
  player2Health: number;
  lastUpdate: FieldValue;
}

interface DamageNumber {
  id: number;
  value: number;
  x: number;
  y: number;
  isPlayer: boolean;
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
  const [isInQueue, setIsInQueue] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [queueTimer, setQueueTimer] = useState<NodeJS.Timeout | null>(null);
  const [canLeaveQueue, setCanLeaveQueue] = useState(true);
  const [queueCooldown, setQueueCooldown] = useState(0);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const [matchFound, setMatchFound] = useState(false);
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);
  const [battleTimer, setBattleTimer] = useState(0);
  const [isAttacking, setIsAttacking] = useState(false);
  const [isDefending, setIsDefending] = useState(false);
  const [lastDamage, setLastDamage] = useState<{ player: number; opponent: number }>({ player: 0, opponent: 0 });
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [highestWinStreak, setHighestWinStreak] = useState(0);
  const [isOnCooldown, setIsOnCooldown] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [lastTextTime, setLastTextTime] = useState(0);
  const MIN_TIME_BETWEEN_TEXTS = 5000; // 5 seconds

  // Load state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('combatState');
      if (savedState) {
        const { playerHealth: savedHealth, opponentHealth: savedOpponentHealth } = JSON.parse(savedState);
        setPlayerHealth(savedHealth);
        setOpponentHealth(savedOpponentHealth);
      }
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('combatState', JSON.stringify({
        playerHealth,
        opponentHealth
      }));
    }
  }, [playerHealth, opponentHealth]);

  // Queue cooldown effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (queueCooldown > 0) {
      timer = setInterval(() => {
        setQueueCooldown((prev) => {
          if (prev <= 1) {
            setCanLeaveQueue(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [queueCooldown]);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!user) return;

      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        setPlayerPower(playerData?.power || 0);
        setIsInQueue(playerData?.inQueue || false);
        setWins(playerData?.wins || 0);
        setLosses(playerData?.losses || 0);
        setWinStreak(playerData?.winStreak || 0);
        setHighestWinStreak(playerData?.highestWinStreak || 0);
      } catch (error) {
        console.error('Error fetching player data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [user]);

  // Add role selection effect
  useEffect(() => {
    if (isInQueue && !opponent) {
      const updateQueuePosition = async () => {
        try {
          const q = query(
            collection(db, 'players'),
            where('inQueue', '==', true),
            orderBy('power', 'asc')
          );
          const snapshot = await getDocs(q);
          const position = snapshot.docs.findIndex(doc => doc.id === user?.uid) + 1;
          setQueuePosition(position);
          
          // Estimate time based on queue position
          const baseTime = 30; // Base time in seconds
          const positionMultiplier = Math.max(1, position / 2);
          setEstimatedTime(Math.ceil(baseTime * positionMultiplier));
        } catch (error) {
          console.error('Error updating queue position:', error);
        }
      };

      const interval = setInterval(updateQueuePosition, 2000);
      updateQueuePosition();
      return () => clearInterval(interval);
    }
  }, [isInQueue, opponent, user]);

  // Add copy-paste prevention
  useEffect(() => {
    const preventCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      return false;
    };

    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const preventSelect = (e: Event) => {
      e.preventDefault();
      return false;
    };

    const preventDrag = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };

    const preventKeyDown = (e: KeyboardEvent) => {
      // Prevent common copy shortcuts
      if ((e.ctrlKey || e.metaKey) && (
        e.key === 'c' || // Copy
        e.key === 'v' || // Paste
        e.key === 'x' || // Cut
        e.key === 'a'    // Select all
      )) {
        e.preventDefault();
        return false;
      }
    };

    // Add event listeners
    document.addEventListener('copy', preventCopyPaste);
    document.addEventListener('paste', preventCopyPaste);
    document.addEventListener('cut', preventCopyPaste);
    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('dragstart', preventDrag);
    document.addEventListener('keydown', preventKeyDown);

    // Add CSS to prevent text selection
    const style = document.createElement('style');
    style.textContent = `
      * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      // Remove event listeners
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('cut', preventCopyPaste);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('selectstart', preventSelect);
      document.removeEventListener('dragstart', preventDrag);
      document.removeEventListener('keydown', preventKeyDown);
      // Remove style
      document.head.removeChild(style);
    };
  }, []);

  // Add real-time player data sync
  useEffect(() => {
    if (!user) return;

    const playerRef = doc(db, 'players', user.uid);
    
    // Set up real-time listener for player data
    const unsubscribe = onSnapshot(playerRef, (doc) => {
      const playerData = doc.data();
      if (playerData) {
        setPlayerPower(playerData.power || 0);
        setIsInQueue(playerData.inQueue || false);
        setWins(playerData.wins || 0);
        setLosses(playerData.losses || 0);
        setWinStreak(playerData.winStreak || 0);
        setHighestWinStreak(playerData.highestWinStreak || 0);
        // Update other player stats as needed
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Add real-time battle sync
  useEffect(() => {
    if (!user || !opponent) return;

    const battleRef = doc(db, 'battles', `${user.uid}_${opponent.id}`);
    
    // Set up real-time listener for battle updates
    const unsubscribe = onSnapshot(battleRef, (doc) => {
      const battleData = doc.data() as BattleData | undefined;
      if (battleData) {
        if (battleData.player1Id === user.uid) {
          setPlayerHealth(battleData.player1Health);
          setOpponentHealth(battleData.player2Health);
        } else {
          setPlayerHealth(battleData.player2Health);
          setOpponentHealth(battleData.player1Health);
        }
      }
    });

    return () => unsubscribe();
  }, [user, opponent]);

  // Add battle timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (opponent) {
      timer = setInterval(() => {
        setBattleTimer(prev => prev + 1);
      }, 1000);
    } else {
      setBattleTimer(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [opponent]);

  // Add damage number cleanup effect
  useEffect(() => {
    const timer = setInterval(() => {
      setDamageNumbers(prev => prev.filter(num => Date.now() - num.id < 1000));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const resetHealth = () => {
    setPlayerHealth(MAX_HEALTH);
    setOpponentHealth(MAX_HEALTH);
  };

  // Queue timeout effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isInQueue && !opponent) {
      timer = setInterval(() => {
        setQueueTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            leaveQueue();
            setBattleLog(['Queue timed out. No players found.']);
            return 50;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setQueueTime(50);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isInQueue, opponent]);

  // Add queue state effect
  useEffect(() => {
    const fetchQueueState = async () => {
      if (!user) return;

      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        
        if (playerData?.inQueue) {
          setIsInQueue(true);
          setBattleLog(['You are already in queue!']);
          setQueueTime(50);
          setCanLeaveQueue(true);
          setQueueCooldown(0);
        }
      } catch (error) {
        console.error('Error fetching queue state:', error);
      }
    };

    fetchQueueState();
  }, [user]);

  const joinQueue = async () => {
    if (!user) return;
    if (isInQueue) {
      setBattleLog(prev => [...prev, 'You are already in queue!']);
      return;
    }

    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        inQueue: true,
        lastMatch: serverTimestamp()
      });
      setIsInQueue(true);
      setBattleLog(prev => [...prev, 'Joined queue!']);
      setQueueTime(0);
      const timer = setInterval(() => {
        setQueueTime(prev => prev + 1);
      }, 1000);
      setQueueTimer(timer);

      // Initial opponent search - simplified to find any available player
      const q = query(
        collection(db, 'players'),
        where('inQueue', '==', true),
        where('uid', '!=', user.uid)
      );

      const querySnapshot = await getDocs(q);
      const potentialOpponents = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Player));

      if (potentialOpponents.length > 0) {
        // Just pick the first available opponent
        const opponent = potentialOpponents[0];

        // Update both players' queue status
        const opponentRef = doc(db, 'players', opponent.id);
        await updateDoc(opponentRef, {
          inQueue: false,
          lastMatch: serverTimestamp()
        });
        await updateDoc(playerRef, {
          inQueue: false,
          lastMatch: serverTimestamp()
        });

        setMatchFound(true);
        setOpponent(opponent);
        setBattleLog([
          'Match Found!',
          `Opponent: ${opponent.username || opponent.email?.split('@')[0] || 'Anonymous'}`,
          `Power Level: ${opponent.power}`
        ]);
      } else {
        setBattleLog(['Searching for opponent...']);
      }
    } catch (error) {
      console.error('Error joining queue:', error);
      setBattleLog(prev => [...prev, 'Failed to join queue. Please try again.']);
      setIsInQueue(false);
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
          winStreak: 0
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

      setIsInQueue(false);
      setOpponent(null);
      resetHealth();
      setQueueTime(50);
      setCanLeaveQueue(true);
      setQueueCooldown(0);
      setMatchFound(false);
    } catch (error) {
      console.error('Error leaving queue:', error);
      setBattleLog(prev => [...prev, 'Failed to leave queue. Please try again.']);
    }
  };

  const addDamageNumber = (value: number, isPlayer: boolean) => {
    const id = Date.now();
    const x = Math.random() * 100 - 50; // Random x offset
    const y = isPlayer ? -50 : 50; // Different y positions for player and opponent
    setDamageNumbers(prev => [...prev, { id, value, x, y, isPlayer }]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const attack = async () => {
    if (!user || !opponent) return;
    setIsInQueue(true);
    setIsAttacking(true);
    setBattleLog([]);

    try {
      const battleRef = doc(db, 'battles', `${user.uid}_${opponent.id}`);
      const battleDoc = await getDoc(battleRef);
      const battleData = battleDoc.data() as BattleData | undefined;
      
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

      // Update battle document with new health values
      if (!battleDoc.exists()) {
        await setDoc(battleRef, {
          player1Id: user.uid,
          player2Id: opponent.id,
          player1Health: playerHealth,
          player2Health: newOpponentHealth,
          lastUpdate: serverTimestamp()
        } as BattleData);
      } else if (battleData) {
        await updateDoc(battleRef, {
          player1Health: user.uid === battleData.player1Id ? playerHealth : newOpponentHealth,
          player2Health: user.uid === battleData.player1Id ? newOpponentHealth : playerHealth,
          lastUpdate: serverTimestamp()
        });
      }

      // Add damage number for opponent
      addDamageNumber(damage, false);
      setLastDamage(prev => ({ ...prev, opponent: damage }));

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

        // Delete battle document
        await deleteDoc(battleRef);

        newBattleLog.push(
          `Victory! Gained ${powerGain} power!`,
          currentWinStreak >= 2 ? `Win Streak: ${currentWinStreak}!` : ''
        );
        setPlayerPower(prev => prev + powerGain);
        setOpponent(null);
        setIsInQueue(false);
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
          setIsDefending(true);

          // Add damage number for player
          addDamageNumber(counterDamage, true);
          setLastDamage(prev => ({ ...prev, player: counterDamage }));

          // Update battle document with counter-attack damage
          await updateDoc(battleRef, {
            player1Health: user.uid === battleData?.player1Id ? newPlayerHealth : newOpponentHealth,
            player2Health: user.uid === battleData?.player1Id ? newOpponentHealth : newPlayerHealth,
            lastUpdate: serverTimestamp()
          });

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

            // Delete battle document
            await deleteDoc(battleRef);

            newBattleLog.push('You were defeated! Better luck next time!');
            setOpponent(null);
            setIsInQueue(false);
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
      setIsInQueue(false);
      setIsAttacking(false);
      setIsDefending(false);
    }
  };

  if (loading) {
    return (
      <div className="text-cyber-blue text-center">Loading combat data...</div>
    );
  }

  return (
    <div 
      className="space-y-4 max-w-2xl mx-auto px-4 py-4" 
      onCopy={(e) => e.preventDefault()} 
      onPaste={(e) => e.preventDefault()} 
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && (
          e.key === 'c' || 
          e.key === 'v' || 
          e.key === 'x' || 
          e.key === 'a'
        )) {
          e.preventDefault();
        }
      }}
    >
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
              {!isInQueue ? (
                <div className="space-y-4">
                  <button
                    onClick={joinQueue}
                    disabled={isSearching}
                    className="w-full px-6 py-4 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors disabled:opacity-50 text-lg"
                  >
                    {isSearching ? 'Searching...' : 'Enter Queue'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-cyber-yellow text-center text-lg">
                    Searching for Opponent...
                  </div>
                  {!matchFound && (
                    <div className="space-y-2">
                      <div className="text-cyber-blue text-center">
                        Queue Position: {queuePosition}
                      </div>
                      <div className="text-cyber-blue text-center">
                        Estimated Time: {estimatedTime}s
                      </div>
                    </div>
                  )}
                  <button
                    onClick={leaveQueue}
                    className="w-full px-6 py-4 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors text-lg"
                  >
                    Leave Queue
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-cyber-yellow text-center text-lg font-bold">
                Fighting against: {opponent.username || opponent.email?.split('@')[0] || 'Anonymous'}
              </div>
              
              {/* Battle Timer */}
              <div className="text-cyber-blue text-center text-lg font-press-start">
                Battle Time: {formatTime(battleTimer)}
              </div>
              
              {/* Health Bars */}
              <div className="space-y-3 relative">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-cyber-blue font-bold">Your Health</span>
                    <span className="text-cyber-blue font-bold">{playerHealth}/{MAX_HEALTH}</span>
                  </div>
                  <div className="h-5 bg-cyber-black border-2 border-cyber-blue rounded-full overflow-hidden relative">
                    <div 
                      className={`h-full bg-cyber-blue transition-all duration-300 ${isDefending ? 'animate-pulse' : ''}`}
                      style={{ width: `${(playerHealth / MAX_HEALTH) * 100}%` }}
                    />
                    {lastDamage.player > 0 && (
                      <div className="absolute right-0 top-0 text-cyber-red text-sm animate-fade-out">
                        -{lastDamage.player}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-cyber-pink font-bold">Opponent Health</span>
                    <span className="text-cyber-pink font-bold">{opponentHealth}/{MAX_HEALTH}</span>
                  </div>
                  <div className="h-5 bg-cyber-black border-2 border-cyber-pink rounded-full overflow-hidden relative">
                    <div 
                      className={`h-full bg-cyber-pink transition-all duration-300 ${isAttacking ? 'animate-pulse' : ''}`}
                      style={{ width: `${(opponentHealth / MAX_HEALTH) * 100}%` }}
                    />
                    {lastDamage.opponent > 0 && (
                      <div className="absolute right-0 top-0 text-cyber-red text-sm animate-fade-out">
                        -{lastDamage.opponent}
                      </div>
                    )}
                  </div>
                </div>

                {/* Floating Damage Numbers */}
                {damageNumbers.map(({ id, value, x, y, isPlayer }) => (
                  <div
                    key={id}
                    className={`absolute text-cyber-red font-bold text-lg pointer-events-none
                      ${isPlayer ? 'left-1/4' : 'right-1/4'}
                      animate-damage-number`}
                    style={{
                      transform: `translate(${x}px, ${y}px)`,
                      animation: 'damageNumber 1s ease-out forwards'
                    }}
                  >
                    -{value}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={attack}
                  disabled={isInQueue}
                  className={`flex-1 px-6 py-4 bg-cyber-pink text-white rounded-lg font-press-start 
                    hover:bg-cyber-purple transition-colors disabled:opacity-50 text-lg
                    ${isAttacking ? 'animate-pulse' : ''}`}
                >
                  {isInQueue ? 'Fighting...' : 'Attack!'}
                </button>
                <button
                  onClick={leaveQueue}
                  className="w-full sm:w-auto px-6 py-4 bg-cyber-black border-2 border-cyber-pink 
                    text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple 
                    transition-colors text-lg"
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
              <div 
                key={index} 
                className="text-cyber-blue text-center sm:text-left text-base animate-fade-in"
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 