'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
  GithubAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { app } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  signInWithGithub: () => Promise<User>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => { throw new Error('Not implemented'); },
  signUp: async () => { throw new Error('Not implemented'); },
  logout: async () => {},
  signInWithGithub: async () => { throw new Error('Not implemented'); },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth(app);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  const signIn = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (!userCredential.user) {
        throw new Error('No user returned from sign in');
      }
      return userCredential.user;
    } catch (error: any) {
      console.error('Error signing in:', error);
      if (error.code === 'auth/invalid-credential') {
        throw new Error('Invalid email or password');
      } else if (error.code === 'auth/user-not-found') {
        throw new Error('No account found with this email');
      } else if (error.code === 'auth/wrong-password') {
        throw new Error('Incorrect password');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many failed attempts. Please try again later');
      }
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (!userCredential.user) {
        throw new Error('No user returned from sign up');
      }
      return userCredential.user;
    } catch (error: any) {
      console.error('Error signing up:', error);
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('An account already exists with this email');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak');
      }
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const signInWithGithub = async () => {
    try {
      const provider = new GithubAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (!result.user) {
        throw new Error('No user returned from GitHub sign in');
      }
      return result.user;
    } catch (error: any) {
      console.error('Error signing in with GitHub:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign in was cancelled');
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Pop-up was blocked by the browser');
      } else if (error.code === 'auth/cancelled-popup-request') {
        throw new Error('Sign in was cancelled');
      }
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, logout, signInWithGithub }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
