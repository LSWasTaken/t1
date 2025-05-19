'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, onSnapshot, DocumentData } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';

interface Player {
  uid: string;
  username: string;
  avatar: string;
  power: number;
}

interface Move {
  position: number;
  player: string;
}

export default function Combat() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams?.get('match') || '';

  const [board, setBoard] = useState<string[]>(Array(9).fill(''));
  const [currentPlayer, setCurrentPlayer] = useState<string>('');
  const [winner, setWinner] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ [key: string]: Player }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !matchId) {
      router.push('/game');
      return;
    }

    // Listen for match updates
    const matchRef = doc(db, 'matches', matchId);
    const unsubscribe = onSnapshot(matchRef, async (matchDoc) => {
      if (!matchDoc.exists()) {
        setError('Match not found');
        return;
      }

      const matchData = matchDoc.data();
      
      try {
        // Fetch player data
        const player1Doc = await getDoc(doc(db, 'players', matchData.player1Id));
        const player2Doc = await getDoc(doc(db, 'players', matchData.player2Id));
        
        if (!player1Doc.exists() || !player2Doc.exists()) {
          setError('Player data not found');
          return;
        }

        const player1Data = player1Doc.data() as Player;
        const player2Data = player2Doc.data() as Player;

        setPlayers({
          [matchData.player1Id]: {
            ...player1Data,
            uid: matchData.player1Id
          },
          [matchData.player2Id]: {
            ...player2Data,
            uid: matchData.player2Id
          }
        });

        // Update board state
        const moves = matchData.moves || [];
        const newBoard = Array(9).fill('');
        moves.forEach((move: Move) => {
          newBoard[move.position] = move.player === matchData.player1Id ? 'X' : 'O';
        });
        setBoard(newBoard);

        // Set current player
        setCurrentPlayer(moves.length % 2 === 0 ? matchData.player1Id : matchData.player2Id);

        // Check for winner
        if (matchData.winner) {
          setWinner(matchData.winner);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching player data:', error);
        setError('Failed to load player data');
      }
    });

    return () => unsubscribe();
  }, [user, matchId, router]);

  const handleCellClick = async (index: number) => {
    if (!user || !matchId || winner || board[index] !== '' || currentPlayer !== user.uid) {
      return;
    }

    try {
      const matchRef = doc(db, 'matches', matchId);
      const matchDoc = await getDoc(matchRef);
      
      if (!matchDoc.exists()) return;
      
      const matchData = matchDoc.data();
      const moves = matchData.moves || [];
      
      // Add new move
      moves.push({
        position: index,
        player: user.uid
      });

      // Check for winner
      const newBoard = [...board];
      newBoard[index] = user.uid === matchData.player1Id ? 'X' : 'O';
      
      const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6] // Diagonals
      ];

      let gameWinner = null;
      for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) {
          gameWinner = user.uid;
          break;
        }
      }

      // Update match document
      await updateDoc(matchRef, {
        moves,
        winner: gameWinner,
        status: gameWinner ? 'completed' : 'in_progress'
      });

      // If there's a winner, update player power
      if (gameWinner) {
        const winnerRef = doc(db, 'players', gameWinner);
        const winnerDoc = await getDoc(winnerRef);
        if (winnerDoc.exists()) {
          const currentPower = winnerDoc.data().power || 0;
          await updateDoc(winnerRef, {
            power: currentPower + 1,
            inQueue: false,
            currentMatch: null
          });
        }
      }

    } catch (error) {
      console.error('Error making move:', error);
      setError('Failed to make move');
    }
  };

  if (loading) {
    return (
      <div className="text-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-pink mx-auto"></div>
        <p className="text-cyber-blue mt-2">Loading match...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4">
        <p className="text-cyber-red">{error}</p>
        <button
          onClick={() => router.push('/game')}
          className="mt-2 px-4 py-2 bg-cyber-pink text-white rounded-lg"
        >
          Return to Game
        </button>
      </div>
    );
  }

  const player1 = players[Object.keys(players)[0]];
  const player2 = players[Object.keys(players)[1]];

  if (!user) {
    return (
      <div className="text-center p-4">
        <p className="text-cyber-red">Please log in to play</p>
        <button
          onClick={() => router.push('/login')}
          className="mt-2 px-4 py-2 bg-cyber-pink text-white rounded-lg"
        >
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="bg-cyber-dark rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="text-center">
            <img
              src={player1?.avatar || '/default-avatar.svg'}
              alt={player1?.username}
              className="w-16 h-16 rounded-full border-2 border-cyber-pink mx-auto mb-2"
            />
            <p className="text-cyber-pink font-press-start">{player1?.username}</p>
            <p className="text-cyber-blue">Power: {player1?.power}</p>
          </div>
          
          <div className="text-center">
            <h2 className="text-2xl font-press-start text-cyber-green mb-2">VS</h2>
            {winner && (
              <p className="text-cyber-yellow">
                {winner === user.uid ? 'You Won!' : 'You Lost!'}
              </p>
            )}
          </div>
          
          <div className="text-center">
            <img
              src={player2?.avatar || '/default-avatar.svg'}
              alt={player2?.username}
              className="w-16 h-16 rounded-full border-2 border-cyber-pink mx-auto mb-2"
            />
            <p className="text-cyber-pink font-press-start">{player2?.username}</p>
            <p className="text-cyber-blue">Power: {player2?.power}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 aspect-square">
          {board.map((cell, index) => (
            <button
              key={index}
              onClick={() => handleCellClick(index)}
              disabled={cell !== '' || winner !== null || currentPlayer !== user.uid}
              className={`
                aspect-square bg-cyber-black rounded-lg flex items-center justify-center
                text-4xl font-press-start transition-all duration-300
                ${cell === 'X' ? 'text-cyber-pink' : cell === 'O' ? 'text-cyber-blue' : ''}
                ${currentPlayer === user.uid && !cell && !winner ? 'hover:bg-cyber-dark' : ''}
                ${currentPlayer !== user.uid || cell || winner ? 'cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {cell}
            </button>
          ))}
        </div>

        {winner && (
          <div className="mt-6 text-center">
            <button
              onClick={() => router.push('/game')}
              className="px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start"
            >
              Return to Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 