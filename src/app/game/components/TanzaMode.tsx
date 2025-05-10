'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';

interface TanzaModeProps {
  onGameEnd: (score: number) => void;
}

export default function TanzaMode({ onGameEnd }: TanzaModeProps) {
  const { user } = useAuth();
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [clicksPerSecond, setClicksPerSecond] = useState(0);
  const [lastClickTime, setLastClickTime] = useState<number[]>([]);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const gameAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    const fetchHighScore = async () => {
      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        setHighScore(playerData?.tanzaHighScore || 0);
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

    // Update combo
    if (recentClicks.length > 0) {
      const timeSinceLastClick = now - recentClicks[recentClicks.length - 1];
      if (timeSinceLastClick < 1000) {
        setCombo(prev => {
          const newCombo = prev + 1;
          setMaxCombo(currentMax => Math.max(currentMax, newCombo));
          return newCombo;
        });
      } else {
        setCombo(0);
      }
    }
  }, [lastClickTime]);

  const startGame = () => {
    setScore(0);
    setTimeLeft(60);
    setIsPlaying(true);
    setGameOver(false);
    setLastClickTime([]);
    setCombo(0);
    setMaxCombo(0);
  };

  const endGame = async () => {
    setIsPlaying(false);
    setGameOver(true);
    
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);
      const playerData = playerDoc.data();
      const currentHighScore = playerData?.tanzaHighScore || 0;

      if (score > currentHighScore) {
        await updateDoc(playerRef, {
          tanzaHighScore: score,
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
    
    const clickValue = combo > 0 ? 1 + (combo * 0.1) : 1;
    setScore(prev => prev + clickValue);
    setLastClickTime(prev => [...prev, Date.now()]);
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="text-2xl font-press-start text-cyber-pink">
        Score: {score.toFixed(1)}
      </div>
      <div className="text-xl font-press-start text-cyber-blue">
        Time: {timeLeft}s
      </div>
      <div className="text-lg font-press-start text-cyber-yellow">
        CPS: {clicksPerSecond.toFixed(1)}
      </div>
      <div className="text-lg font-press-start text-cyber-purple">
        Combo: {combo}x (Max: {maxCombo}x)
      </div>
      <div className="text-lg font-press-start text-cyber-green">
        High Score: {highScore.toFixed(1)}
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
          ${combo > 0 ? 'scale-105' : ''}
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
              <div className="text-cyber-yellow mb-4">Final Score: {score.toFixed(1)}</div>
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
          Click as fast as you can! Build combos for bonus points!
        </div>
      )}
    </div>
  );
} 