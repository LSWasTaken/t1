'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

interface CombatProps {
  opponent: {
    id: string;
    username: string;
    power: number;
    avatar: string;
  } | null;
}

export default function Combat({ opponent }: CombatProps) {
  const { user } = useAuth();
  const [gameState, setGameState] = useState<'waiting' | 'countdown' | 'playing' | 'finished'>('waiting');
  const [countdown, setCountdown] = useState(3);
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opponent) {
      startGame();
    }
  }, [opponent]);

  const startGame = () => {
    setGameState('countdown');
    let count = 3;
    const timer = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(timer);
        setGameState('playing');
        startGameTimer();
      }
    }, 1000);
  };

  const startGameTimer = () => {
    // Simulate opponent clicks
    const opponentInterval = setInterval(() => {
      setOpponentScore(prev => prev + Math.floor(Math.random() * 2));
    }, 500);

    // Game ends after 10 seconds
    setTimeout(() => {
      clearInterval(opponentInterval);
      endGame();
    }, 10000);
  };

  const handleClick = () => {
    if (gameState !== 'playing') return;
    setPlayerScore(prev => prev + 1);
  };

  const endGame = () => {
    setGameState('finished');
    setWinner(playerScore > opponentScore ? (user?.uid || '') : (opponent?.id || ''));
  };

  const handlePlayAgain = () => {
    setPlayerScore(0);
    setOpponentScore(0);
    setWinner(null);
    setGameState('waiting');
    startGame();
  };

  return (
    <div className="space-y-8">
      {gameState === 'waiting' && (
        <div className="text-center">
          <h2 className="text-2xl font-press-start mb-4">Waiting for opponent...</h2>
          <div className="animate-pulse">
            <div className="w-16 h-16 border-4 border-cyber-accent border-t-transparent rounded-full mx-auto animate-spin"></div>
          </div>
        </div>
      )}

      {gameState === 'countdown' && (
        <div className="text-center">
          <h2 className="text-4xl font-press-start text-cyber-white">{countdown}</h2>
        </div>
      )}

      {gameState === 'playing' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-center">
              <h3 className="font-press-start text-cyber-white">{user?.displayName || 'Player'}</h3>
              <p className="text-2xl">{playerScore}</p>
            </div>
            <div className="text-center">
              <h3 className="font-press-start text-cyber-white">{opponent?.username}</h3>
              <p className="text-2xl">{opponentScore}</p>
            </div>
          </div>
          <div className="text-center">
            <button
              onClick={handleClick}
              className="cyber-button text-4xl py-8 px-16"
            >
              CLICK!
            </button>
          </div>
        </div>
      )}

      {gameState === 'finished' && (
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-press-start">
            {winner === user?.uid ? 'You Won!' : 'You Lost!'}
          </h2>
          <div className="flex justify-center space-x-8">
            <div className="text-center">
              <h3 className="font-press-start text-cyber-white">{user?.displayName || 'Player'}</h3>
              <p className="text-2xl">{playerScore}</p>
            </div>
            <div className="text-center">
              <h3 className="font-press-start text-cyber-white">{opponent?.username}</h3>
              <p className="text-2xl">{opponentScore}</p>
            </div>
          </div>
          <button
            onClick={handlePlayAgain}
            className="cyber-button"
          >
            Play Again
          </button>
        </div>
      )}

      {error && (
        <div className="text-center text-cyber-accent">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
} 