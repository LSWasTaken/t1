'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Combat from './Combat';
import Leaderboard from './Leaderboard';

interface Obstacle {
  x: number;
  height: number;
  passed: boolean;
}

export default function ClickerGame() {
  const { user } = useAuth();
  const router = useRouter();
  const [power, setPower] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [birdY, setBirdY] = useState(250);
  const [birdVelocity, setBirdVelocity] = useState(0);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const gameLoopRef = useRef<number>();
  const GRAVITY = 0.5;
  const JUMP_FORCE = -10;
  const OBSTACLE_SPEED = 3;
  const OBSTACLE_SPAWN_INTERVAL = 2000;

  useEffect(() => {
    if (user) {
      loadPlayerData();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const playerRef = doc(db, 'players', user.uid);
    
    const unsubscribe = onSnapshot(playerRef, (doc) => {
      const playerData = doc.data();
      if (playerData) {
        setPower(playerData.power || 0);
        setHighScore(playerData.highScore || 0);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const loadPlayerData = async () => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);

      if (playerDoc.exists()) {
        const data = playerDoc.data();
        setPower(data.power || 0);
        setHighScore(data.highScore || 0);
      } else {
        await setDoc(playerRef, {
          uid: user.uid,
          email: user.email,
          power: 0,
          highScore: 0,
          wins: 0,
          losses: 0,
          username: user.email?.split('@')[0] || 'Anonymous',
        });
      }
    } catch (error) {
      console.error('Error loading player data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setBirdY(250);
    setBirdVelocity(0);
    setObstacles([]);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    spawnObstacle();
  };

  const gameLoop = () => {
    if (!gameStarted || gameOver) return;

    // Update bird position
    setBirdY(prev => {
      const newY = prev + birdVelocity;
      if (newY < 0 || newY > 500) {
        endGame();
        return prev;
      }
      return newY;
    });
    setBirdVelocity(prev => prev + GRAVITY);

    // Update obstacles
    setObstacles(prev => {
      const newObstacles = prev.map(obs => ({
        ...obs,
        x: obs.x - OBSTACLE_SPEED,
        passed: obs.passed || obs.x < 50
      })).filter(obs => obs.x > -50);

      // Check for collisions
      newObstacles.forEach(obs => {
        if (obs.x < 100 && obs.x > 0) {
          if (birdY < obs.height - 100 || birdY > obs.height + 100) {
            endGame();
          }
        }
        // Award power for passing obstacles
        if (!obs.passed && obs.x < 50) {
          awardPower();
          setScore(s => s + 1);
        }
      });

      return newObstacles;
    });

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const spawnObstacle = () => {
    if (!gameStarted || gameOver) return;

    const height = Math.random() * 300 + 100;
    setObstacles(prev => [...prev, { x: 600, height, passed: false }]);
    setTimeout(spawnObstacle, OBSTACLE_SPAWN_INTERVAL);
  };

  const handleJump = () => {
    if (!gameStarted) {
      startGame();
    }
    setBirdVelocity(JUMP_FORCE);
  };

  const awardPower = async () => {
    if (!user) return;
    const powerGain = 1;
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        power: increment(powerGain)
      });
      setPower(prev => prev + powerGain);
    } catch (error) {
      console.error('Error updating power:', error);
    }
  };

  const endGame = async () => {
    setGameOver(true);
    setGameStarted(false);
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }

    if (!user) return;
    try {
      const playerRef = doc(db, 'players', user.uid);
      if (score > highScore) {
        await updateDoc(playerRef, {
          highScore: score
        });
        setHighScore(score);
      }
    } catch (error) {
      console.error('Error updating high score:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cyber-black text-white">
        <div className="text-2xl font-press-start text-cyber-pink">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 bg-cyber-black text-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-press-start text-cyber-pink">
            Tanza Fighter
          </h1>
          <button
            onClick={() => router.push('/profile')}
            className="px-4 py-2 bg-cyber-blue text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
          >
            Profile
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-cyber-dark rounded-lg p-6">
              <h2 className="text-2xl font-press-start text-cyber-pink mb-4">
                Your Power: {power}
              </h2>
              <div className="text-cyber-blue mb-4">
                Score: {score} | High Score: {highScore}
              </div>
              <div 
                ref={gameAreaRef}
                className="relative w-full h-[500px] bg-cyber-black border-2 border-cyber-pink rounded-lg overflow-hidden"
                onClick={handleJump}
              >
                {/* Bird */}
                <div 
                  className="absolute w-8 h-8 bg-cyber-pink rounded-full"
                  style={{ top: `${birdY}px`, left: '50px' }}
                />
                
                {/* Obstacles */}
                {obstacles.map((obs, index) => (
                  <div key={index}>
                    <div 
                      className="absolute w-10 bg-cyber-blue"
                      style={{ 
                        top: 0, 
                        left: `${obs.x}px`, 
                        height: `${obs.height - 100}px` 
                      }}
                    />
                    <div 
                      className="absolute w-10 bg-cyber-blue"
                      style={{ 
                        bottom: 0, 
                        left: `${obs.x}px`, 
                        height: `${500 - obs.height - 100}px` 
                      }}
                    />
                  </div>
                ))}

                {/* Game Over Screen */}
                {gameOver && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-cyber-black bg-opacity-80">
                    <div className="text-2xl font-press-start text-cyber-pink mb-4">
                      Game Over!
                    </div>
                    <button
                      onClick={startGame}
                      className="px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
                    >
                      Play Again
                    </button>
                  </div>
                )}

                {/* Start Screen */}
                {!gameStarted && !gameOver && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-2xl font-press-start text-cyber-pink mb-4">
                      Click to Start
                    </div>
                    <div className="text-cyber-blue text-center">
                      Click to flap and dodge obstacles!<br />
                      Each obstacle passed gives you 1 power!
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Combat />
            <Leaderboard />
          </div>
        </div>
      </div>
    </main>
  );
} 