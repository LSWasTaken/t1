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
  gap: number;
}

interface Bird {
  y: number;
  velocity: number;
  rotation: number;
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
  const [bird, setBird] = useState<Bird>({ y: 250, velocity: 0, rotation: 0 });
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [backgroundPosition, setBackgroundPosition] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const GRAVITY = 0.5;
  const JUMP_FORCE = -10;
  const OBSTACLE_SPEED = 3;
  const OBSTACLE_SPAWN_INTERVAL = 2000;
  const GAP_SIZE = 150;
  const BIRD_SIZE = 30;
  const OBSTACLE_WIDTH = 60;

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
    setBird({ y: 250, velocity: 0, rotation: 0 });
    setObstacles([]);
    setBackgroundPosition(0);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    spawnObstacle();
  };

  const gameLoop = () => {
    if (!gameStarted || gameOver || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw scrolling background
    setBackgroundPosition(prev => (prev - 1) % canvas.width);
    ctx.fillStyle = '#2a2a2a';
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.fillRect((i + backgroundPosition) % canvas.width, 0, 2, canvas.height);
    }

    // Update bird
    setBird(prev => {
      const newY = prev.y + prev.velocity;
      const newRotation = Math.min(Math.max(prev.velocity * 5, -30), 30);
      
      if (newY < 0 || newY > canvas.height) {
        endGame();
        return prev;
      }
      
      return {
        y: newY,
        velocity: prev.velocity + GRAVITY,
        rotation: newRotation
      };
    });

    // Draw bird
    ctx.save();
    ctx.translate(50, bird.y);
    ctx.rotate((bird.rotation * Math.PI) / 180);
    ctx.fillStyle = '#ff69b4';
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-5, -5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Update obstacles
    setObstacles(prev => {
      const newObstacles = prev.map(obs => ({
        ...obs,
        x: obs.x - OBSTACLE_SPEED,
        passed: obs.passed || obs.x < 50
      })).filter(obs => obs.x > -OBSTACLE_WIDTH);

      // Check for collisions
      newObstacles.forEach(obs => {
        if (obs.x < 50 + BIRD_SIZE && obs.x + OBSTACLE_WIDTH > 50 - BIRD_SIZE) {
          if (bird.y < obs.height - GAP_SIZE/2 || bird.y > obs.height + GAP_SIZE/2) {
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

    // Draw obstacles
    obstacles.forEach(obs => {
      // Top pipe
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(obs.x, 0, OBSTACLE_WIDTH, obs.height - GAP_SIZE/2);
      ctx.fillStyle = '#388E3C';
      ctx.fillRect(obs.x - 5, obs.height - GAP_SIZE/2 - 20, OBSTACLE_WIDTH + 10, 20);

      // Bottom pipe
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(obs.x, obs.height + GAP_SIZE/2, OBSTACLE_WIDTH, canvas.height);
      ctx.fillStyle = '#388E3C';
      ctx.fillRect(obs.x - 5, obs.height + GAP_SIZE/2, OBSTACLE_WIDTH + 10, 20);
    });

    // Draw score
    ctx.fillStyle = '#fff';
    ctx.font = '24px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(score.toString(), canvas.width / 2, 50);

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const spawnObstacle = () => {
    if (!gameStarted || gameOver || !canvasRef.current) return;

    const height = Math.random() * (canvasRef.current.height - GAP_SIZE - 100) + 50;
    setObstacles(prev => [...prev, { x: canvasRef.current!.width, height, passed: false, gap: GAP_SIZE }]);
    setTimeout(spawnObstacle, OBSTACLE_SPAWN_INTERVAL);
  };

  const handleJump = () => {
    if (!gameStarted) {
      startGame();
    }
    setBird(prev => ({
      ...prev,
      velocity: JUMP_FORCE
    }));
  };

  const awardPower = async () => {
    if (!user) return;
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        power: increment(1)
      });
      setPower(prev => prev + 1);
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
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={600}
                  className="w-full bg-cyber-black border-2 border-cyber-pink rounded-lg"
                  onClick={handleJump}
                />

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