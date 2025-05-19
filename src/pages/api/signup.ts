import { NextApiRequest, NextApiResponse } from 'next';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    return res.status(200).json({
      message: 'User created successfully',
      user: {
        uid: user.uid,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return res.status(500).json({
      message: 'Error creating user',
      error: error.message,
    });
  }
} 