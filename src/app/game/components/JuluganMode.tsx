'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';

interface Block {
  x: number;
  y: number;
  color: string;
  health: number;
}

interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

const COLORS = ['bg-cyber-pink', 'bg-cyber-blue', 'bg-cyber-purple', 'bg-cyber-yellow'];
const BLOCK_ROWS = 5;
const BLOCKS_PER_ROW = 8;
const BLOCK_WIDTH = 60;
const BLOCK_HEIGHT = 30;
const BALL_RADIUS = 8;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;

export default function JuluganMode() {
  const { user } = useAuth();
  const [power, setPower] = useState(0);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ball, setBall] = useState<Ball>({ x: 0, y: 0, dx: 4, dy: -4 });
  const [paddleX, setPaddleX] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();

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
        setHighScore(playerData.juluganHighScore || 0);
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
        setHighScore(data.juluganHighScore || 0);
      } else {
        await setDoc(playerRef, {
          uid: user.uid,
          email: user.email,
          power: 0,
          juluganHighScore: 0,
          wins: 0,
          losses: 0,
          username: user.email?.split('@')[0] || 'Anonymous',
        });
      }
    } catch (error) {
      console.error('Error loading player data:', error);
    }
  };

  const initializeBlocks = () => {
    const newBlocks: Block[] = [];
    for (let row = 0; row < BLOCK_ROWS; row++) {
      for (let col = 0; col < BLOCKS_PER_ROW; col++) {
        newBlocks.push({
          x: col * (BLOCK_WIDTH + 10) + 50,
          y: row * (BLOCK_HEIGHT + 10) + 50,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          health: 2
        });
      }
    }
    setBlocks(newBlocks);
  };

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    initializeBlocks();
    setBall({
      x: canvasRef.current?.width ? canvasRef.current.width / 2 : 400,
      y: canvasRef.current?.height ? canvasRef.current.height - 50 : 500,
      dx: 4,
      dy: -4
    });
    setPaddleX(canvasRef.current?.width ? (canvasRef.current.width - PADDLE_WIDTH) / 2 : 350);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const gameLoop = () => {
    if (!gameStarted || gameOver || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Move ball
    setBall(prev => {
      let newX = prev.x + prev.dx;
      let newY = prev.y + prev.dy;
      let newDx = prev.dx;
      let newDy = prev.dy;

      // Wall collision
      if (newX + BALL_RADIUS > canvas.width || newX - BALL_RADIUS < 0) {
        newDx = -newDx;
      }
      if (newY - BALL_RADIUS < 0) {
        newDy = -newDy;
      }

      // Paddle collision
      if (newY + BALL_RADIUS > canvas.height - PADDLE_HEIGHT &&
          newX > paddleX && newX < paddleX + PADDLE_WIDTH) {
        newDy = -Math.abs(newDy);
        // Add angle based on where ball hits paddle
        const hitPoint = (newX - paddleX) / PADDLE_WIDTH;
        newDx = (hitPoint - 0.5) * 8;
      }

      // Game over
      if (newY + BALL_RADIUS > canvas.height) {
        endGame();
        return prev;
      }

      // Block collision
      blocks.forEach((block, index) => {
        if (newX + BALL_RADIUS > block.x &&
            newX - BALL_RADIUS < block.x + BLOCK_WIDTH &&
            newY + BALL_RADIUS > block.y &&
            newY - BALL_RADIUS < block.y + BLOCK_HEIGHT) {
          
          newDy = -newDy;
          setBlocks(prev => {
            const newBlocks = [...prev];
            newBlocks[index] = {
              ...block,
              health: block.health - 1
            };
            if (newBlocks[index].health <= 0) {
              awardPower();
              setScore(s => s + 10);
            }
            return newBlocks.filter(b => b.health > 0);
          });
        }
      });

      return { x: newX, y: newY, dx: newDx, dy: newDy };
    });

    // Draw blocks
    blocks.forEach(block => {
      ctx.fillStyle = block.color.replace('bg-', '');
      ctx.fillRect(block.x, block.y, BLOCK_WIDTH, BLOCK_HEIGHT);
    });

    // Draw ball
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.closePath();

    // Draw paddle
    ctx.fillStyle = 'white';
    ctx.fillRect(paddleX, canvas.height - PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Check win condition
    if (blocks.length === 0) {
      awardPower(50); // Bonus power for completing level
      setScore(s => s + 100);
      initializeBlocks();
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameStarted || gameOver || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    setPaddleX(Math.max(0, Math.min(mouseX - PADDLE_WIDTH / 2, canvas.width - PADDLE_WIDTH)));
  };

  const awardPower = async (bonus: number = 1) => {
    if (!user) return;
    try {
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        power: increment(bonus)
      });
      setPower(prev => prev + bonus);
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
          juluganHighScore: score
        });
        setHighScore(score);
      }
    } catch (error) {
      console.error('Error updating high score:', error);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto px-4 py-4">
      <div className="bg-cyber-black rounded-lg p-6">
        <div className="space-y-4">
          <div className="text-cyber-yellow text-center">
            Your Power: {power}
          </div>
          <div className="text-cyber-blue text-center">
            Score: {score} | High Score: {highScore}
          </div>
          
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="w-full bg-cyber-black border-2 border-cyber-pink rounded-lg"
              onMouseMove={handleMouseMove}
              onClick={() => !gameStarted && !gameOver && startGame()}
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
                  Move mouse to control paddle<br />
                  Break blocks to earn power!<br />
                  Complete level for bonus power!
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 