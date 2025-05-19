'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc, onSnapshot, increment } from 'firebase/firestore';

const logMessage = (message: string, type: string) => {
  console.log(`[Combat - ${type.toUpperCase()}]: ${message}`);
};

interface MatchData {
  player1Id?: string;
  player2Id?: string;
  board: string[];
  currentTurn: string;
  active: boolean;
  finished: boolean;
  winner: string | null;
  powerGain?: number;
}

interface CombatProps {
  opponent: {
    id: string;
    username: string;
    power: number;
    avatar: string;
  } | null;
  matchId: string | null;
  onExit: () => void;
  matchData: MatchData | null;
}

export default function Combat({ opponent, matchId, onExit, matchData }: CombatProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [gameState, setGameState] = useState<'waiting' | 'countdown' | 'playing' | 'finished'>('waiting');
  const [countdown, setCountdown] = useState(3);
  const [board, setBoard] = useState<string[]>(Array(9).fill(''));
  const [currentTurn, setCurrentTurn] = useState<string>('');
  const [winner, setWinner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlayer1, setIsPlayer1] = useState(true);
  const [powerGained, setPowerGained] = useState(0);
  
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Determine which player we are (1 or 2)
  useEffect(() => {
    if (user && opponent && matchId) {
      const [id1, id2] = matchId.split('_');
      setIsPlayer1(user.uid === id1);
    }
  }, [user, opponent, matchId]);

  // Set up real-time listener for match data
  useEffect(() => {
    if (!matchId) return;
    
    const matchRef = doc(db, 'matches', matchId);
    const unsubscribe = onSnapshot(matchRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as MatchData;
        
        setBoard(data.board || Array(9).fill(''));
        setCurrentTurn(data.currentTurn || '');
        
        // Check for game finish
        if (data.finished && !data.active) {
          setGameState('finished');
          setWinner(data.winner);
          if (data.powerGain) {
            setPowerGained(data.powerGain);
          }
        }
      }
    });
    
    return () => unsubscribe();
  }, [matchId]);

  useEffect(() => {
    if (opponent) {
      startGame();
    }
    
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [opponent]);

  const startGame = () => {
    setGameState('countdown');
    let count = 3;
    setCountdown(count);
    
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    
    countdownTimerRef.current = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setGameState('playing');
        initializeGame();
      }
    }, 1000);
  };

  const initializeGame = async () => {
    if (!matchId) return;
    
    try {
      const matchRef = doc(db, 'matches', matchId);
      await updateDoc(matchRef, {
        board: Array(9).fill(''),
        currentTurn: 'X',
        active: true,
        finished: false,
        winner: null
      });
      setGameState('playing');
    } catch (err) {
      console.error('Error initializing game:', err);
      setError('Failed to start game');
    }
  };

  const checkWinner = (board: string[]): string | null => {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
      [0, 4, 8], [2, 4, 6] // Diagonals
    ];

    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }

    if (board.every(cell => cell !== '')) {
      return 'draw';
    }

    return null;
  };

  const handleCellClick = async (index: number) => {
    if (gameState !== 'playing' || !matchId || !user) return;
    
    const isMyTurn = (isPlayer1 && currentTurn === 'X') || (!isPlayer1 && currentTurn === 'O');
    if (board[index] !== '' || !isMyTurn) return;

    try {
      const newBoard = [...board];
      newBoard[index] = isPlayer1 ? 'X' : 'O';
      
      const matchRef = doc(db, 'matches', matchId);
      const gameWinner = checkWinner(newBoard);
      
      if (gameWinner) {
        const winnerId = gameWinner === 'draw' ? null : 
          (gameWinner === 'X' ? (isPlayer1 ? user.uid : opponent?.id) : (isPlayer1 ? opponent?.id : user.uid));
        
        const powerGain = gameWinner === 'draw' ? 0 : 
          (winnerId === user.uid ? 10 : 0);

        await updateDoc(matchRef, {
          board: newBoard,
          finished: true,
          active: false,
          winner: winnerId || null,
          powerGain: powerGain
        });

        setGameState('finished');
        setWinner(winnerId || null);
        setPowerGained(powerGain);

        if (winnerId === user.uid) {
          const userRef = doc(db, 'players', user.uid);
          await updateDoc(userRef, {
            power: increment(powerGain),
            wins: increment(1)
          });
        } else if (winnerId !== null) {
          const userRef = doc(db, 'players', user.uid);
          await updateDoc(userRef, {
            losses: increment(1)
          });
        }
      } else {
        await updateDoc(matchRef, {
          board: newBoard,
          currentTurn: currentTurn === 'X' ? 'O' : 'X'
        });
      }
    } catch (err) {
      console.error('Error making move:', err);
      setError('Failed to make move');
    }
  };

  const handleExitGame = () => {
    if (onExit) {
      onExit();
    } else {
      if (user) {
        const playerRef = doc(db, 'players', user.uid);
        updateDoc(playerRef, {
          status: 'online',
          inQueue: false,
          currentOpponent: null
        }).then(() => {
          router.push('/game');
        }).catch(err => {
          console.error('Error exiting game:', err);
          router.push('/game');
        });
      } else {
        router.push('/game');
      }
    }
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
          <p className="mt-4 text-cyber-blue">Get ready to play Tic-Tac-Toe!</p>
        </div>
      )}

      {gameState === 'playing' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-cyber-gray p-4 rounded-lg">
            <div className="text-center">
              <h3 className="font-press-start text-cyber-white">{user?.displayName || 'You'}</h3>
              <p className="text-xl text-cyber-pink">{isPlayer1 ? 'X' : 'O'}</p>
            </div>
            <div className="text-center">
              <h3 className="font-press-start text-cyber-white">{opponent?.username || 'Opponent'}</h3>
              <p className="text-xl text-cyber-green">{isPlayer1 ? 'O' : 'X'}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {board.map((cell, index) => (
              <button
                key={index}
                onClick={() => handleCellClick(index)}
                disabled={cell !== '' || gameState !== 'playing' || currentTurn !== (isPlayer1 ? 'X' : 'O')}
                className={`w-20 h-20 text-4xl font-press-start bg-cyber-black border-2 border-cyber-accent
                  ${cell === 'X' ? 'text-cyber-pink' : 'text-cyber-green'}
                  ${gameState === 'playing' && currentTurn === (isPlayer1 ? 'X' : 'O') ? 'hover:bg-cyber-gray cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
              >
                {cell}
              </button>
            ))}
          </div>

          <div className="text-center">
            <p className="text-cyber-blue">
              {gameState === 'playing' 
                ? (currentTurn === (isPlayer1 ? 'X' : 'O') ? 'Your turn!' : 'Opponent\'s turn')
                : gameState === 'finished'
                  ? 'Game Over!'
                  : 'Waiting...'}
            </p>
          </div>
        </div>
      )}

      {gameState === 'finished' && (
        <div className="text-center space-y-4 bg-cyber-gray p-6 rounded-lg">
          <h2 className="text-3xl font-press-start text-cyber-white">
            {winner === user?.uid ? 'You Won!' : winner === null ? 'It\'s a Draw!' : 'You Lost!'}
          </h2>
          
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {board.map((cell, index) => (
              <div
                key={index}
                className={`w-20 h-20 text-4xl font-press-start bg-cyber-black border-2 border-cyber-accent
                  ${cell === 'X' ? 'text-cyber-pink' : 'text-cyber-green'}`}
              >
                {cell}
              </div>
            ))}
          </div>
          
          {winner === user?.uid && (
            <p className="text-cyber-green font-press-start mt-2">
              + {powerGained} Power
            </p>
          )}
          
          <p className="text-cyber-blue">Returning to game lobby in 5 seconds...</p>
          <button
            onClick={handleExitGame}
            className="cyber-button bg-cyber-pink hover:bg-cyber-purple"
          >
            Exit Now
          </button>
        </div>
      )}

      {error && (
        <div className="text-center text-cyber-accent bg-cyber-black p-4 rounded-lg">
          <p>{error}</p>
          <button
            onClick={handleExitGame}
            className="cyber-button mt-4"
          >
            Return to Lobby
          </button>
        </div>
      )}
    </div>
  );
}   