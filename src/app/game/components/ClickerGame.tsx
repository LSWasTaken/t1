'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';

interface Obstacle {
  x: number;
  gapY: number;
  gapHeight: number;
  width: number;
  passed: boolean;
}

interface Bird {
  x: number;
  y: number;
  velocity: number;
  rotation: number;
  width: number;
  height: number;
}

const GRAVITY = 0.5;
const JUMP_FORCE = -10;
const PIPE_SPEED = 2;
const PIPE_SPAWN_INTERVAL = 1500;
const GAP_HEIGHT = 150;
const MIN_GAP_Y = 100;
const MAX_GAP_Y = 400;
const BIRD_SIZE = 40;
const GROUND_HEIGHT = 100;
const CLOUD_COUNT = 5;

export default function ClickerGame() {
  const { user } = useAuth();
  const [power, setPower] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [bird, setBird] = useState<Bird>({
    x: 100,
    y: 300,
    velocity: 0,
    rotation: 0,
    width: BIRD_SIZE,
    height: BIRD_SIZE
  });
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [clouds, setClouds] = useState<{ x: number; y: number; width: number }[]>([]);
  const [backgroundOffset, setBackgroundOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const lastPipeSpawnRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  // Load player data
  useEffect(() => {
    const loadPlayerData = async () => {
      if (!user) return;

      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        setPower(playerData?.power || 0);
        setHighScore(playerData?.flappyHighScore || 0);
      } catch (error) {
        console.error('Error loading player data:', error);
      }
    };

    loadPlayerData();
  }, [user]);

  // Initialize clouds
  useEffect(() => {
    const initialClouds = Array.from({ length: CLOUD_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * 200,
      width: 100 + Math.random() * 100
    }));
    setClouds(initialClouds);
  }, []);

  // Game loop
  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const gameLoop = () => {
      frameCountRef.current++;
      
      // Update bird
      setBird(prev => {
        const newVelocity = prev.velocity + GRAVITY;
        const newY = prev.y + newVelocity;
        const newRotation = Math.min(Math.max(newVelocity * 2, -30), 90);
        
        return {
          ...prev,
          y: newY,
          velocity: newVelocity,
          rotation: newRotation
        };
      });

      // Update obstacles
      setObstacles(prev => {
        const now = Date.now();
        const newObstacles = prev
          .map(obstacle => ({
            ...obstacle,
            x: obstacle.x - PIPE_SPEED,
            passed: obstacle.passed || obstacle.x + obstacle.width < bird.x
          }))
          .filter(obstacle => obstacle.x + obstacle.width > 0);

        // Spawn new obstacle
        if (now - lastPipeSpawnRef.current > PIPE_SPAWN_INTERVAL) {
          lastPipeSpawnRef.current = now;
          newObstacles.push({
            x: window.innerWidth,
            gapY: MIN_GAP_Y + Math.random() * (MAX_GAP_Y - MIN_GAP_Y),
            gapHeight: GAP_HEIGHT,
            width: 80,
            passed: false
          });
        }

        return newObstacles;
      });

      // Update clouds
      setClouds(prev => 
        prev.map(cloud => ({
          ...cloud,
          x: cloud.x - 0.5,
          y: cloud.y + Math.sin(frameCountRef.current * 0.01) * 0.5
        })).map(cloud => 
          cloud.x + cloud.width < 0 
            ? { ...cloud, x: window.innerWidth, y: Math.random() * 200 }
            : cloud
        )
      );

      // Update background
      setBackgroundOffset(prev => (prev + 0.5) % window.innerWidth);

      // Check collisions
      const birdRect = {
        x: bird.x - bird.width / 2,
        y: bird.y - bird.height / 2,
        width: bird.width,
        height: bird.height
      };

      // Check ground collision
      if (bird.y + bird.height / 2 > window.innerHeight - GROUND_HEIGHT) {
        endGame();
        return;
      }

      // Check ceiling collision
      if (bird.y - bird.height / 2 < 0) {
        endGame();
        return;
      }

      // Check pipe collisions
      for (const obstacle of obstacles) {
        const topPipe = {
          x: obstacle.x,
          y: 0,
          width: obstacle.width,
          height: obstacle.gapY
        };
        const bottomPipe = {
          x: obstacle.x,
          y: obstacle.gapY + obstacle.gapHeight,
          width: obstacle.width,
          height: window.innerHeight - (obstacle.gapY + obstacle.gapHeight)
        };

        if (
          checkCollision(birdRect, topPipe) ||
          checkCollision(birdRect, bottomPipe)
        ) {
          endGame();
          return;
        }

        // Update score
        if (!obstacle.passed && obstacle.x + obstacle.width < bird.x) {
          setScore(prev => prev + 1);
        }
      }

      // Draw everything
      draw();
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameStarted, gameOver, bird, obstacles]);

  const checkCollision = (rect1: any, rect2: any) => {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    clouds.forEach(cloud => {
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.width / 2, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.width / 3, cloud.y - cloud.width / 4, cloud.width / 3, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.width / 2, cloud.y, cloud.width / 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw ground
    const groundCanvas = createGroundPattern(ctx);
    if (groundCanvas) {
      const groundPattern = ctx.createPattern(groundCanvas, 'repeat-x');
      if (groundPattern) {
        ctx.fillStyle = groundPattern;
        ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);
      }
    }

    // Draw obstacles
    obstacles.forEach(obstacle => {
      // Draw top pipe
      ctx.fillStyle = '#2E8B57';
      ctx.fillRect(obstacle.x, 0, obstacle.width, obstacle.gapY);
      ctx.fillStyle = '#1B4D3E';
      ctx.fillRect(obstacle.x - 5, obstacle.gapY - 20, obstacle.width + 10, 20);

      // Draw bottom pipe
      ctx.fillStyle = '#2E8B57';
      ctx.fillRect(
        obstacle.x,
        obstacle.gapY + obstacle.gapHeight,
        obstacle.width,
        canvas.height - (obstacle.gapY + obstacle.gapHeight)
      );
      ctx.fillStyle = '#1B4D3E';
      ctx.fillRect(
        obstacle.x - 5,
        obstacle.gapY + obstacle.gapHeight,
        obstacle.width + 10,
        20
      );
    });

    // Draw bird
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate((bird.rotation * Math.PI) / 180);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, 0, bird.width / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw bird details
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(10, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FF4500';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(25, -5);
    ctx.lineTo(25, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw score
    ctx.fillStyle = '#000';
    ctx.font = '48px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(score.toString(), canvas.width / 2, 100);

    // Draw game over screen
    if (gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FFF';
      ctx.font = '48px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over!', canvas.width / 2, canvas.height / 2 - 50);
      ctx.font = '24px "Press Start 2P"';
      ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2);
      ctx.fillText(`High Score: ${highScore}`, canvas.width / 2, canvas.height / 2 + 50);
    }
  };

  const createGroundPattern = (ctx: CanvasRenderingContext2D) => {
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 100;
    patternCanvas.height = 20;
    const patternCtx = patternCanvas.getContext('2d');
    if (!patternCtx) return null;

    patternCtx.fillStyle = '#8B4513';
    patternCtx.fillRect(0, 0, 100, 20);
    patternCtx.fillStyle = '#A0522D';
    for (let i = 0; i < 5; i++) {
      patternCtx.fillRect(i * 20, 0, 10, 20);
    }

    return patternCanvas;
  };

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setBird({
      x: 100,
      y: 300,
      velocity: 0,
      rotation: 0,
      width: BIRD_SIZE,
      height: BIRD_SIZE
    });
    setObstacles([]);
    lastPipeSpawnRef.current = Date.now();
    frameCountRef.current = 0;
  };

  const endGame = async () => {
    setGameOver(true);
    setGameStarted(false);
    
    if (score > highScore) {
      setHighScore(score);
      if (user) {
        try {
          const playerRef = doc(db, 'players', user.uid);
          await updateDoc(playerRef, {
            flappyHighScore: score,
            power: increment(Math.floor(score / 2))
          });
          setPower(prev => prev + Math.floor(score / 2));
        } catch (error) {
          console.error('Error updating high score:', error);
        }
      }
    }
  };

  const handleJump = () => {
    if (!gameStarted) {
      startGame();
    }
    if (!gameOver) {
      setBird(prev => ({
        ...prev,
        velocity: JUMP_FORCE
      }));
    }
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onClick={handleJump}
        onTouchStart={handleJump}
      />
      {!gameStarted && !gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50">
          <h2 className="text-4xl font-press-start text-cyber-pink mb-8">
            Flappy Bird
          </h2>
          <button
            onClick={startGame}
            className="px-8 py-4 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors text-xl"
          >
            Start Game
          </button>
        </div>
      )}
      {gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50">
          <h2 className="text-4xl font-press-start text-cyber-pink mb-8">
            Game Over!
          </h2>
          <div className="text-2xl font-press-start text-cyber-blue mb-8">
            Score: {score}
          </div>
          <div className="text-xl font-press-start text-cyber-blue mb-8">
            High Score: {highScore}
          </div>
          <button
            onClick={startGame}
            className="px-8 py-4 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors text-xl"
          >
            Play Again
          </button>
        </div>
      )}
      <div className="absolute top-4 left-4 text-cyber-blue font-press-start">
        Power: {power}
      </div>
    </div>
  );
} 