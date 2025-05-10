import { NextApiRequest, NextApiResponse } from 'next';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { userId, score, gameMode } = req.body;

    if (!userId || typeof score !== 'number' || !gameMode) {
      return res.status(400).json({ message: 'Invalid request data' });
    }

    const scoresRef = collection(db, 'scores');
    const docRef = await addDoc(scoresRef, {
      userId,
      score,
      gameMode,
      timestamp: serverTimestamp(),
    });

    return res.status(200).json({
      message: 'Score submitted successfully',
      scoreId: docRef.id,
    });
  } catch (error: any) {
    console.error('Submit score error:', error);
    return res.status(500).json({
      message: 'Error submitting score',
      error: error.message,
    });
  }
} 