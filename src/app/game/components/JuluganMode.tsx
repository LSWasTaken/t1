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
  points: number;
  special?: boolean;
}

interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  power: number;
}

interface Particle {
  x: number;
  y: number;
  color: string;
  life: number;
}

const COLORS = ['bg-cyber-pink', 'bg-cyber-blue', 'bg-cyber-purple', 'bg-cyber-yellow'];
const BLOCK_ROWS = 8;
const BLOCKS_PER_ROW = 10;
const BLOCK_WIDTH = 60;
const BLOCK_HEIGHT = 30;
const BALL_RADIUS = 8;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;
const SPECIAL_BLOCK_CHANCE = 0.1; // 10% chance for special blocks

export default function JuluganMode() {
  const { user } = useAuth();
  const [power, setPower] = useState(0);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ball, setBall] = useState<Ball>({ x: 0, y: 0, dx: 4, dy: -4, power: 1 });
  const [paddleX, setPaddleX] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [level, setLevel] = useState(1);
  const [particles, setParticles] = useState<Particle[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const lastBlockBreakTime = useRef<number>(0);

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

  const initializeBlocks = () => {
    const newBlocks: Block[] = [];
    for (let row = 0; row < BLOCK_ROWS; row++) {
      for (let col = 0; col < BLOCKS_PER_ROW; col++) {
        const isSpecial = Math.random() < SPECIAL_BLOCK_CHANCE;
        const health = isSpecial ? 3 : Math.floor(Math.random() * 2) + 1;
        const points = isSpecial ? 50 : health * 10;
        newBlocks.push({
          x: col * (BLOCK_WIDTH + 10) + 50,
          y: row * (BLOCK_HEIGHT + 10) + 50,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          health,
          points,
          special: isSpecial
        });
      }
    }
    setBlocks(newBlocks);
  };

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLevel(1);
    setCombo(0);
    setMaxCombo(0);
    initializeBlocks();
    setBall({
      x: canvasRef.current?.width ? canvasRef.current.width / 2 : 400,
      y: canvasRef.current?.height ? canvasRef.current.height - 50 : 500,
      dx: 4,
      dy: -4,
      power: 1
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

    // Update particles
    setParticles(prev => 
      prev.filter(p => {
        p.life -= 0.02;
        return p.life > 0;
      })
    );

    // Draw particles
    particles.forEach(p => {
      ctx.fillStyle = p.color.replace('bg-', '');
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.x, p.y, 4, 4);
    });
    ctx.globalAlpha = 1;

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
              health: block.health - ball.power
            };
            if (newBlocks[index].health <= 0) {
              const now = Date.now();
              const timeSinceLastBreak = now - lastBlockBreakTime.current;
              lastBlockBreakTime.current = now;

              // Update combo
              if (timeSinceLastBreak < 1000) {
                setCombo(prev => {
                  const newCombo = prev + 1;
                  setMaxCombo(currentMax => Math.max(currentMax, newCombo));
                  return newCombo;
                });
              } else {
                setCombo(0);
              }

              // Create particles
              createParticles(block.x + BLOCK_WIDTH/2, block.y + BLOCK_HEIGHT/2, block.color);

              // Award points and power
              const points = block.points * (combo + 1);
              setScore(s => s + points);
              awardPower(block.special ? 5 : 1);

              // Special block effects
              if (block.special) {
                setBall(b => ({ ...b, power: Math.min(b.power + 0.5, 3) }));
              }
            }
            return newBlocks.filter(b => b.health > 0);
          });
        }
      });

      return { x: newX, y: newY, dx: newDx, dy: newDy, power: prev.power };
    });

    // Draw blocks
    blocks.forEach(block => {
      ctx.fillStyle = block.color.replace('bg-', '');
      ctx.fillRect(block.x, block.y, BLOCK_WIDTH, BLOCK_HEIGHT);
      
      // Draw block health
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(block.health.toString(), block.x + 5, block.y + 20);

      // Draw special block indicator
      if (block.special) {
        ctx.fillStyle = 'gold';
        ctx.beginPath();
        ctx.arc(block.x + BLOCK_WIDTH - 10, block.y + 10, 5, 0, Math.PI * 2);
        ctx.fill();
      }
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
      setLevel(prev => prev + 1);
      awardPower(50); // Bonus power for completing level
      setScore(s => s + 100);
      initializeBlocks();
      // Increase ball speed
      setBall(prev => ({
        ...prev,
        dx: prev.dx * 1.1,
        dy: prev.dy * 1.1
      }));
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
          <div className="text-cyber-purple text-center">
            Level: {level} | Combo: {combo}x (Max: {maxCombo}x)
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
                <div className="text-cyber-yellow mb-4">
                  Final Score: {score}
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
                  Special blocks (gold) give bonus power!<br />
                  Build combos for more points!<br />
                  Complete levels for bonus power!
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 