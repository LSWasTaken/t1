'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, increment, addDoc, serverTimestamp, FieldValue, getDoc, onSnapshot } from 'firebase/firestore';

interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Power: number;
  player2Power: number;
  winner: string;
  powerGained: number;
  timestamp: FieldValue;
}

interface Player {
  id: string;
  uid: string;
  email?: string;
  username?: string;
  power: number;
  wins: number;
  losses: number;
}

interface PowerUp {
  type: 'speed' | 'accuracy' | 'multiplier';
  duration: number;
  value: number;
}

interface Particle {
  x: number;
  y: number;
  color: string;
  life: number;
}

const SAMPLE_TEXTS = [
  "The quick brown fox jumps over the lazy dog.",
  "Pack my box with five dozen liquor jugs.",
  "How vexingly quick daft zebras jump!",
  "Sphinx of black quartz, judge my vow.",
  "Crazy Fredrick bought many very exquisite opal jewels.",
  "We promptly judged antique ivory buckles for the next prize.",
  "The five boxing wizards jump quickly.",
  "How quickly daft jumping zebras vex.",
  "Sphinx of black quartz, judge my vow.",
  "Pack my box with five dozen liquor jugs.",
];

const POWER_UP_CHANCE = 0.1; // 10% chance for power-up after completing text
const POWER_UPS: PowerUp[] = [
  { type: 'speed', duration: 10, value: 1.5 },
  { type: 'accuracy', duration: 15, value: 1.2 },
  { type: 'multiplier', duration: 20, value: 2 }
];

export default function TanzaMode() {
  const { user } = useAuth();
  const [currentText, setCurrentText] = useState('');
  const [userInput, setUserInput] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [battleHistory, setBattleHistory] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerPower, setPlayerPower] = useState(0);
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [isInCombat, setIsInCombat] = useState(false);
  const [activePowerUps, setActivePowerUps] = useState<PowerUp[]>([]);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [perfectTyping, setPerfectTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isOnCooldown, setIsOnCooldown] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [lastTextTime, setLastTextTime] = useState<number>(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const MIN_TIME_BETWEEN_TEXTS = 5000; // 5 seconds minimum between texts

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!user) return;

      try {
        const playerDoc = await getDoc(doc(db, 'players', user.uid));
        const playerData = playerDoc.data();
        setPlayerPower(playerData?.power || 0);
        setMaxStreak(playerData?.maxStreak || 0);
      } catch (error) {
        console.error('Error fetching player data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
    fetchBattleHistory();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const playerRef = doc(db, 'players', user.uid);
    
    const unsubscribe = onSnapshot(playerRef, (doc) => {
      const playerData = doc.data();
      if (playerData) {
        setPlayerPower(playerData.power || 0);
        setMaxStreak(playerData.maxStreak || 0);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const createParticles = (x: number, y: number, color: string) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 10; i++) {
      newParticles.push({
        x,
        y,
        color,
        life: 1
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  const fetchBattleHistory = async () => {
    if (!user) return;

    try {
      const q = query(
        collection(db, 'matches'),
        where('player1Id', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(5)
      );

      const querySnapshot = await getDocs(q);
      const matches = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Match));

      setBattleHistory(matches);
    } catch (error) {
      console.error('Error fetching battle history:', error);
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldownTime > 0) {
      timer = setInterval(() => {
        setCooldownTime(prev => {
          if (prev <= 1) {
            setIsOnCooldown(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cooldownTime]);

  // Update particles
  useEffect(() => {
    const timer = setInterval(() => {
      setParticles(prev => 
        prev.filter(p => {
          p.life -= 0.02;
          return p.life > 0;
        })
      );
    }, 16);

    return () => clearInterval(timer);
  }, []);

  const startNewText = () => {
    const now = Date.now();
    if (now - lastTextTime < MIN_TIME_BETWEEN_TEXTS) {
      setBattleLog(['Please wait before starting a new text!']);
      return;
    }

    const randomIndex = Math.floor(Math.random() * SAMPLE_TEXTS.length);
    setCurrentText(SAMPLE_TEXTS[randomIndex]);
    setUserInput('');
    setStartTime(null);
    setEndTime(null);
    setWpm(0);
    setAccuracy(0);
    setIsTyping(false);
    setLastTextTime(now);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setUserInput(value);

    if (!isTyping) {
      setIsTyping(true);
      setStartTime(Date.now());
    }

    // Check for perfect typing
    const isPerfect = value === currentText.substring(0, value.length);
    setPerfectTyping(isPerfect);

    if (value.length === currentText.length) {
      const endTimeNow = Date.now();
      setEndTime(endTimeNow);
      calculateResults(value, endTimeNow);
    }
  };

  const calculateResults = (finalInput: string, endTimeNow: number) => {
    if (!startTime) return;

    const timeInMinutes = (endTimeNow - startTime) / 60000;
    const words = finalInput.trim().split(/\s+/).length;
    let calculatedWpm = Math.round(words / timeInMinutes);

    let correctChars = 0;
    for (let i = 0; i < finalInput.length; i++) {
      if (finalInput[i] === currentText[i]) {
        correctChars++;
      }
    }
    let calculatedAccuracy = Math.round((correctChars / currentText.length) * 100);

    // Apply power-up effects
    activePowerUps.forEach(powerUp => {
      switch (powerUp.type) {
        case 'speed':
          calculatedWpm = Math.round(calculatedWpm * powerUp.value);
          break;
        case 'accuracy':
          calculatedAccuracy = Math.min(100, Math.round(calculatedAccuracy * powerUp.value));
          break;
        case 'multiplier':
          calculatedWpm = Math.round(calculatedWpm * powerUp.value);
          break;
      }
    });

    setWpm(calculatedWpm);
    setAccuracy(calculatedAccuracy);

    // Award power and update streaks
    if (calculatedAccuracy >= 90) {
      const powerGain = calculatedWpm;
      const newStreak = streak + 1;
      setStreak(newStreak);
      setMaxStreak(prev => Math.max(prev, newStreak));
      updatePlayerPower(powerGain, newStreak);
      
      // Chance for power-up
      if (Math.random() < POWER_UP_CHANCE) {
        const randomPowerUp = POWER_UPS[Math.floor(Math.random() * POWER_UPS.length)];
        setActivePowerUps(prev => [...prev, randomPowerUp]);
        setBattleLog(prev => [...prev, `Power-up activated: ${randomPowerUp.type}!`]);
        
        // Remove power-up after duration
        setTimeout(() => {
          setActivePowerUps(prev => prev.filter(p => p !== randomPowerUp));
        }, randomPowerUp.duration * 1000);
      }

      // Create particles for success
      createParticles(400, 300, 'bg-cyber-pink');
      
      setIsOnCooldown(true);
      setCooldownTime(3);
      
      setTimeout(() => {
        if (!isOnCooldown) {
          startNewText();
        }
      }, 1000);
    } else {
      setStreak(0);
      setBattleLog(['Accuracy too low! Streak reset.']);
      setIsOnCooldown(true);
      setCooldownTime(5);
    }
  };

  const updatePlayerPower = async (powerGain: number, newStreak: number) => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        power: increment(powerGain),
        tanzaWins: increment(1),
        maxStreak: Math.max(newStreak, maxStreak)
      });
      
      setPlayerPower(prev => prev + powerGain);
      setBattleLog(prev => [
        `Gained ${powerGain} power from typing!`,
        `Current Streak: ${newStreak}`,
        `WPM: ${wpm} | Accuracy: ${accuracy}%`
      ]);
    } catch (error) {
      console.error('Error updating player power:', error);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    setUserInput(pastedText);
    
    if (!isTyping) {
      setIsTyping(true);
      setStartTime(Date.now());
    }

    if (pastedText.length === currentText.length) {
      const endTimeNow = Date.now();
      setEndTime(endTimeNow);
      calculateResults(pastedText, endTimeNow);
    }
  };

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

    document.addEventListener('copy', preventCopyPaste);
    document.addEventListener('paste', preventCopyPaste);
    document.addEventListener('cut', preventCopyPaste);
    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('dragstart', preventDrag);
    document.addEventListener('keydown', preventKeyDown);

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
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('cut', preventCopyPaste);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('selectstart', preventSelect);
      document.removeEventListener('dragstart', preventDrag);
      document.removeEventListener('keydown', preventKeyDown);
      document.head.removeChild(style);
    };
  }, []);

  if (loading) {
    return (
      <div className="text-cyber-blue text-center">Loading Tanza Mode...</div>
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
      <div className="bg-cyber-black rounded-lg p-6">
        <div className="space-y-4">
          <div className="text-cyber-yellow text-center">
            Your Power: {playerPower}
          </div>
          
          <div className="text-cyber-purple text-center">
            Streak: {streak} | Max Streak: {maxStreak}
          </div>

          {activePowerUps.length > 0 && (
            <div className="flex justify-center gap-2">
              {activePowerUps.map((powerUp, index) => (
                <div
                  key={index}
                  className="px-3 py-1 bg-cyber-pink text-white rounded-lg text-sm"
                >
                  {powerUp.type} x{powerUp.value}
                </div>
              ))}
            </div>
          )}
          
          <div className="space-y-2">
            <div className={`text-cyber-blue text-center transition-colors duration-200 ${
              perfectTyping ? 'text-cyber-pink' : ''
            }`}>
              {currentText || 'Click Start to begin typing'}
            </div>
            <textarea
              ref={inputRef}
              value={userInput}
              onChange={handleInputChange}
              onPaste={handlePaste}
              placeholder="Start typing here..."
              className={`w-full h-32 p-4 bg-cyber-black border-2 ${
                perfectTyping ? 'border-cyber-pink' : 'border-cyber-purple'
              } text-cyber-blue rounded-lg font-mono resize-none focus:outline-none focus:border-cyber-pink transition-colors duration-200`}
              disabled={!currentText || isOnCooldown}
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={startNewText}
              disabled={isOnCooldown}
              className={`px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start 
                hover:bg-cyber-purple transition-colors disabled:opacity-50
                ${isOnCooldown ? 'cursor-not-allowed' : ''}`}
            >
              {isOnCooldown ? `Wait ${cooldownTime}s` : 'Start New Text'}
            </button>
            {wpm > 0 && (
              <div className="text-cyber-blue text-center">
                WPM: {wpm} | Accuracy: {accuracy}%
              </div>
            )}
          </div>
        </div>
      </div>

      {battleLog.length > 0 && (
        <div className="bg-cyber-black rounded-lg p-4">
          <h3 className="text-cyber-pink mb-2">Battle Log:</h3>
          <div className="space-y-1">
            {battleLog.map((log, index) => (
              <div key={index} className="text-cyber-blue text-center">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {battleHistory.length > 0 && (
        <div className="bg-cyber-black rounded-lg p-4">
          <h3 className="text-cyber-pink mb-2">Recent Battles:</h3>
          <div className="space-y-2">
            {battleHistory.map((match) => (
              <div key={match.id} className="text-cyber-blue text-center sm:text-left">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
                  <div>
                    {match.winner === user?.uid ? 'Victory!' : 'Defeat!'}
                  </div>
                  <div>
                    Power Gained: {match.powerGained}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 