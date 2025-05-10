'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

interface FlappyBirdProps {
  onGameOver: (score: number) => void;
}

interface Bird {
  x: number;
  y: number;
  velocity: number;
  gravity: number;
  jump: number;
}

interface Pipe {
  x: number;
  height: number;
  passed: boolean;
}

export default function FlappyBird({ onGameOver }: FlappyBirdProps) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bird, setBird] = useState<Bird>({
    x: 50,
    y: 200,
    velocity: 0,
    gravity: 0.3,
    jump: -6
  });
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [gameLoop, setGameLoop] = useState<number | null>(null);
  const [power, setPower] = useState(0);

  // Game constants
  const CANVAS_WIDTH = 600; // Vertical layout
  const CANVAS_HEIGHT = 800;
  const PIPE_WIDTH = 80;
  const PIPE_GAP = 250;
  const PIPE_SPACING = 300;
  const BIRD_SIZE = 40;
  const PIPE_SPEED = 2;

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (user) {
      const fetchHighScore = async () => {
        const userRef = doc(db, 'players', user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setHighScore(userData.flappyHighScore || 0);
          setPower(userData.power || 0);
        }
      };
      fetchHighScore();
    }
  }, [user]);

  const startGame = () => {
    setIsPlaying(true);
    setGameOver(false);
    setScore(0);
    setBird({
      x: 50,
      y: 200,
      velocity: 0,
      gravity: 0.3,
      jump: -6
    });
    setPipes([]);
    const loop = window.setInterval(updateGame, 20);
    setGameLoop(loop);
  };

  const updateGame = () => {
    if (!isPlaying) return;

    // Update bird position
    setBird(prevBird => {
      const newY = prevBird.y + prevBird.velocity;
      const newVelocity = prevBird.velocity + prevBird.gravity;

      // Check for collisions with ground and ceiling
      if (newY <= 0 || newY >= CANVAS_HEIGHT - BIRD_SIZE) {
        endGame();
        return prevBird;
      }

      return {
        ...prevBird,
        y: newY,
        velocity: newVelocity
      };
    });

    // Update pipes
    setPipes(prevPipes => {
      const newPipes = prevPipes.map(pipe => ({
        ...pipe,
        x: pipe.x - PIPE_SPEED
      })).filter(pipe => pipe.x > -PIPE_WIDTH);

      // Add new pipe if needed
      if (prevPipes.length === 0 || prevPipes[prevPipes.length - 1].x < CANVAS_WIDTH - PIPE_SPACING) {
        const minHeight = 50;
        const maxHeight = CANVAS_HEIGHT - PIPE_GAP - minHeight;
        const height = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
        newPipes.push({
          x: CANVAS_WIDTH,
          height,
          passed: false
        });
      }

      // Check for collisions and score
      newPipes.forEach(pipe => {
        if (!pipe.passed && pipe.x + PIPE_WIDTH < bird.x) {
          pipe.passed = true;
          setScore(prev => prev + 1);
        }

        // Check for collision with pipes
        if (
          bird.x + BIRD_SIZE > pipe.x &&
          bird.x < pipe.x + PIPE_WIDTH &&
          (bird.y < pipe.height || bird.y + BIRD_SIZE > pipe.height + PIPE_GAP)
        ) {
          endGame();
        }
      });

      return newPipes;
    });

    // Draw game
    drawGame();
  };

  const drawGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a'; // Dark grey background
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw bird
    ctx.fillStyle = '#ffd700'; // Gold color for bird
    ctx.beginPath();
    ctx.arc(bird.x + BIRD_SIZE/2, bird.y + BIRD_SIZE/2, BIRD_SIZE/2, 0, Math.PI * 2);
    ctx.fill();

    // Draw pipes
    ctx.fillStyle = '#333333'; // Dark grey for pipes
    pipes.forEach(pipe => {
      // Top pipe
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.height);
      // Bottom pipe
      ctx.fillRect(pipe.x, pipe.height + PIPE_GAP, PIPE_WIDTH, CANVAS_HEIGHT - pipe.height - PIPE_GAP);
    });

    // Draw score
    ctx.fillStyle = '#ffffff';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Score: ${score}`, CANVAS_WIDTH/2, 50);

    // Draw high score
    ctx.font = '24px Arial';
    ctx.fillText(`High Score: ${highScore}`, CANVAS_WIDTH/2, 90);
  };

  const handleClick = () => {
    if (!isPlaying) {
      startGame();
    } else {
      setBird(prevBird => ({
        ...prevBird,
        velocity: prevBird.jump
      }));
    }
  };

  const endGame = async () => {
    if (gameLoop) {
      clearInterval(gameLoop);
    }
    setIsPlaying(false);
    setGameOver(true);

    if (score > highScore && user) {
      setHighScore(score);
      const userRef = doc(db, 'players', user.uid);
      await updateDoc(userRef, {
        flappyHighScore: score,
        power: power + Math.floor(score / 2)
      });
      setPower(prev => prev + Math.floor(score / 2));
    }

    onGameOver(score);
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center space-y-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleClick}
          className="border-2 border-cyber-accent rounded-lg cursor-pointer"
        />
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 px-3 py-1 bg-cyber-accent text-cyber-white rounded-lg hover:bg-cyber-hover transition-colors text-sm"
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>
      {!isPlaying && !gameOver && (
        <div className="text-center">
          <p className="text-cyber-white mb-2">Click to start!</p>
          <p className="text-cyber-accent text-sm">Press space or click to flap</p>
        </div>
      )}
      {gameOver && (
        <div className="text-center">
          <p className="text-cyber-white mb-2">Game Over!</p>
          <p className="text-cyber-accent">Score: {score}</p>
          <p className="text-cyber-accent">High Score: {highScore}</p>
          <button
            onClick={startGame}
            className="mt-4 px-6 py-2 bg-cyber-accent text-cyber-white rounded-lg hover:bg-cyber-hover transition-colors"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
} 