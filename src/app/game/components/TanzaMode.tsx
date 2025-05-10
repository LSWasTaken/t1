'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// List of long words for typing practice
const LONG_WORDS = [
  'antidisestablishmentarianism',
  'pneumonoultramicroscopicsilicovolcanoconiosis',
  'supercalifragilisticexpialidocious',
  'hippopotomonstrosesquippedaliophobia',
  'pseudopseudohypoparathyroidism',
  'floccinaucinihilipilification',
  'incomprehensibilities',
  'electroencephalographically',
  'immunoelectrophoretically',
  'psychophysicotherapeutics',
  'thyroparathyroidectomized',
  'dichlorodifluoromethane',
  'microspectrophotometrically',
  'psychoneuroendocrinological',
  'radioimmunoelectrophoresis'
];

export default function TanzaMode() {
  const { user } = useAuth();
  const [currentWord, setCurrentWord] = useState('');
  const [userInput, setUserInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(15);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState('');

  // Get a random word from the list
  const getRandomWord = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * LONG_WORDS.length);
    return LONG_WORDS[randomIndex];
  }, []);

  // Start a new round
  const startNewRound = useCallback(() => {
    setCurrentWord(getRandomWord());
    setUserInput('');
    setTimeLeft(15);
    setIsActive(true);
    setMessage('');
  }, [getRandomWord]);

  // Handle word completion
  const handleWordCompletion = useCallback(async () => {
    if (!user) return;

    const newWordsCompleted = wordsCompleted + 1;
    setWordsCompleted(newWordsCompleted);

    if (newWordsCompleted >= 10) {
      // Award power and reset
      try {
        const playerRef = doc(db, 'players', user.uid);
        const playerDoc = await getDoc(playerRef);

        if (!playerDoc.exists()) {
          await setDoc(playerRef, {
            uid: user.uid,
            email: user.email,
            power: 1,
            wins: 0,
            losses: 0,
            lastMatch: serverTimestamp()
          });
        } else {
          await updateDoc(playerRef, {
            power: increment(1),
            lastMatch: serverTimestamp()
          });
        }

        setScore(prev => prev + 1);
        setWordsCompleted(0);
        setMessage('Power gained! +1 power');
      } catch (error) {
        console.error('Error updating power:', error);
        setMessage('Error updating power. Try again!');
      }
    }

    startNewRound();
  }, [user, wordsCompleted, startNewRound]);

  // Handle timer
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      setMessage('Time\'s up! Try again.');
    }

    return () => clearInterval(timer);
  }, [isActive, timeLeft]);

  // Handle input changes
  useEffect(() => {
    if (userInput === currentWord) {
      handleWordCompletion();
    }
  }, [userInput, currentWord, handleWordCompletion]);

  return (
    <div className="bg-cyber-dark rounded-lg p-6">
      <h3 className="text-2xl font-press-start text-cyber-pink mb-6 text-center">
        Tanza Mode
      </h3>

      <div className="space-y-4">
        <div className="bg-cyber-black rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="text-cyber-blue">
              Time: {timeLeft}s
            </div>
            <div className="text-cyber-green">
              Words: {wordsCompleted}/10
            </div>
            <div className="text-cyber-purple">
              Power Gained: {score}
            </div>
          </div>

          {isActive ? (
            <div className="space-y-4">
              <div className="text-cyber-yellow text-xl font-mono break-all">
                {currentWord}
              </div>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="w-full px-4 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-blue rounded-lg font-mono focus:outline-none focus:border-cyber-purple"
                placeholder="Type the word..."
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={startNewRound}
              className="w-full px-6 py-3 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
            >
              Start Round
            </button>
          )}

          {message && (
            <div className="mt-4 text-center text-cyber-pink">
              {message}
            </div>
          )}
        </div>

        <div className="text-sm text-cyber-blue">
          <p>• Type 10 long words within 15 seconds each</p>
          <p>• Each set of 10 words gives you +1 power</p>
          <p>• Be careful with spelling!</p>
        </div>
      </div>
    </div>
  );
} 