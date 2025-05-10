'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, increment, addDoc, serverTimestamp, FieldValue, getDoc } from 'firebase/firestore';

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    fetchBattleHistory();
  }, [user]);

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

  const startNewText = () => {
    const randomIndex = Math.floor(Math.random() * SAMPLE_TEXTS.length);
    setCurrentText(SAMPLE_TEXTS[randomIndex]);
    setUserInput('');
    setStartTime(null);
    setEndTime(null);
    setWpm(0);
    setAccuracy(0);
    setIsTyping(false);
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
    const calculatedWpm = Math.round(words / timeInMinutes);

    let correctChars = 0;
    for (let i = 0; i < finalInput.length; i++) {
      if (finalInput[i] === currentText[i]) {
        correctChars++;
      }
    }
    const calculatedAccuracy = Math.round((correctChars / currentText.length) * 100);

    setWpm(calculatedWpm);
    setAccuracy(calculatedAccuracy);

    // Only award power and increment win streak if accuracy is above 90%
    if (calculatedAccuracy >= 90) {
      const powerGain = calculatedWpm;
      updatePlayerPower(powerGain);
    } else {
      // Reset win streak on failure
      resetWinStreak();
    }
  };

  const updatePlayerPower = async (powerGain: number) => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      const playerData = playerDoc.data();
      
      const currentWinStreak = (playerData?.winStreak || 0) + 1;
      const highestWinStreak = Math.max(currentWinStreak, playerData?.highestWinStreak || 0);

      await updateDoc(playerRef, {
        power: increment(powerGain),
        tanzaWins: increment(1),
        winStreak: currentWinStreak,
        highestWinStreak: highestWinStreak
      });
      
      setPlayerPower(prev => prev + powerGain);
      setBattleLog([`Gained ${powerGain} power from typing!`, `Win Streak: ${currentWinStreak}`]);
    } catch (error) {
      console.error('Error updating player power:', error);
    }
  };

  const resetWinStreak = async () => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        winStreak: 0
      });
      setBattleLog(['Accuracy too low! Win streak reset.']);
    } catch (error) {
      console.error('Error resetting win streak:', error);
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
          
          <div className="space-y-2">
            <div className="text-cyber-blue text-center">
              {currentText || 'Click Start to begin typing'}
            </div>
            <textarea
              ref={inputRef}
              value={userInput}
              onChange={handleInputChange}
              onPaste={handlePaste}
              placeholder="Start typing here..."
              className="w-full h-32 p-4 bg-cyber-black border-2 border-cyber-pink text-cyber-blue rounded-lg font-mono resize-none focus:outline-none focus:border-cyber-purple"
              disabled={!currentText}
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={startNewText}
              className="px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
            >
              Start New Text
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