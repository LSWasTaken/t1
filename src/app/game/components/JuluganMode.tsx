'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';

interface JuluganModeProps {
  onGameEnd: (score: number) => void;
}

export default function JuluganMode({ onGameEnd }: JuluganModeProps) {
  const { user } = useAuth();
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [clicksPerSecond, setClicksPerSecond] = useState(0);
  const [lastClickTime, setLastClickTime] = useState<number[]>([]);
  const gameAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    const fetchHighScore = async () => {
      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        setHighScore(playerData?.juluganHighScore || 0);
      } catch (error) {
        console.error('Error fetching high score:', error);
      }
    };

    fetchHighScore();
  }, [user]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isPlaying) {
      endGame();
    }
    return () => clearInterval(timer);
  }, [isPlaying, timeLeft]);

  useEffect(() => {
    // Calculate clicks per second based on last 5 seconds
    const now = Date.now();
    const recentClicks = lastClickTime.filter(time => now - time < 5000);
    setClicksPerSecond(recentClicks.length / 5);
  }, [lastClickTime]);

  const startGame = () => {
    setScore(0);
    setTimeLeft(30);
    setIsPlaying(true);
    setGameOver(false);
    setLastClickTime([]);
  };

  const endGame = async () => {
    setIsPlaying(false);
    setGameOver(true);
    
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      const playerData = playerDoc.data();
      const currentHighScore = playerData?.juluganHighScore || 0;

      if (score > currentHighScore) {
        await updateDoc(playerRef, {
          juluganHighScore: score,
          lastPlayed: serverTimestamp()
        });
        setHighScore(score);
      }

      onGameEnd(score);
    } catch (error) {
      console.error('Error updating high score:', error);
    }
  };

  const handleClick = () => {
    if (!isPlaying) return;
    
    setScore(prev => prev + 1);
    setLastClickTime(prev => [...prev, Date.now()]);
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="text-2xl font-press-start text-cyber-pink">
        Score: {score}
      </div>
      <div className="text-xl font-press-start text-cyber-blue">
        Time: {timeLeft}s
      </div>
      <div className="text-lg font-press-start text-cyber-yellow">
        CPS: {clicksPerSecond.toFixed(1)}
      </div>
      <div className="text-lg font-press-start text-cyber-purple">
        High Score: {highScore}
      </div>

      <div
        ref={gameAreaRef}
        onClick={handleClick}
        className={`w-64 h-64 rounded-lg border-4 cursor-pointer transition-all duration-200
          ${isPlaying 
            ? 'border-cyber-pink bg-cyber-black hover:bg-cyber-purple/20' 
            : 'border-cyber-purple bg-cyber-black/50'
          }
          ${gameOver ? 'animate-pulse' : ''}
        `}
      >
        <div className="w-full h-full flex items-center justify-center">
          {!isPlaying && !gameOver && (
            <button
              onClick={startGame}
              className="px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
            >
              Start Game
            </button>
          )}
          {gameOver && (
            <div className="text-center">
              <div className="text-cyber-pink text-xl mb-2">Game Over!</div>
              <div className="text-cyber-yellow mb-4">Final Score: {score}</div>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      </div>

      {isPlaying && (
        <div className="text-cyber-yellow text-sm font-press-start">
          Click as fast as you can!
        </div>
      )}
    </div>
  );
} 