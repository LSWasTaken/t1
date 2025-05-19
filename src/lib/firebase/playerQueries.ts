import { collection, query, where, limit, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getAuth } from 'firebase/auth';

interface Player {
  uid: string;
  username: string;
  public: boolean;
  inQueue: boolean;
  currentOpponent?: string;
  challengeFrom?: string;
  // ... other player fields
}

// Auth check utility
const checkAuth = () => {
  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error('User must be authenticated to perform this operation');
  }
  return auth.currentUser;
};

// Fetch public players
export const fetchPublicPlayers = async (): Promise<Player[]> => {
  checkAuth();
  const playersRef = collection(db, 'players');
  const q = query(
    playersRef,
    where('public', '==', true),
    limit(10)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Player));
};

// Fetch players in queue
export const fetchPlayersInQueue = async (): Promise<Player[]> => {
  checkAuth();
  const playersRef = collection(db, 'players');
  const q = query(
    playersRef,
    where('inQueue', '==', true),
    limit(10)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Player));
};

// Fetch specific opponent with debug info
export const fetchOpponent = async (opponentId: string): Promise<{ player: Player; debug: string }> => {
  const currentUser = checkAuth();
  const playerRef = doc(db, 'players', opponentId);
  const playerDoc = await getDoc(playerRef);
  
  if (!playerDoc.exists()) {
    throw new Error('Opponent not found');
  }
  
  const player = { uid: playerDoc.id, ...playerDoc.data() } as Player;
  
  // Debug information
  const debug = {
    isPublic: player.public,
    isInQueue: player.inQueue,
    isCurrentOpponent: player.currentOpponent === currentUser.uid,
    isChallenger: player.challengeFrom === currentUser.uid,
    currentUser: currentUser.uid
  };
  
  return { player, debug: JSON.stringify(debug, null, 2) };
};

// Update player's public status
export const updatePublicStatus = async (isPublic: boolean): Promise<void> => {
  const currentUser = checkAuth();
  const playerRef = doc(db, 'players', currentUser.uid);
  await updateDoc(playerRef, { public: isPublic });
};

// Debug tip for checking opponent document
export const debugOpponentAccess = (player: Player, currentUserId: string): string => {
  return `
Debug Information:
-----------------
1. Is player public? ${player.public}
2. Is player in queue? ${player.inQueue}
3. Is current user the opponent? ${player.currentOpponent === currentUserId}
4. Is current user the challenger? ${player.challengeFrom === currentUserId}
5. Current user ID: ${currentUserId}
6. Player ID: ${player.uid}

Access should be granted if ANY of these are true:
- Player is public
- Player is in queue AND current user is in queue
- Current user is the opponent
- Current user is the challenger
`;
}; 