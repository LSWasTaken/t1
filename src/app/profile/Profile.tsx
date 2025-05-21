'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, onSnapshot, query, where } from 'firebase/firestore';

interface Player {
  uid: string;
  username: string;
  email: string;
  power: number;
  wins: number;
  losses: number;
  winStreak: number;
  highestWinStreak: number;
  inQueue: boolean;
}

interface DuelRequest {
  id: string;
  from: string;
  to: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: any;
}

interface ProfileProps {
  selectedPlayer?: Player;
}

export default function Profile({ selectedPlayer }: ProfileProps) {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [duelRequests, setDuelRequests] = useState<DuelRequest[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadPlayerData();
      subscribeToDuelRequests();
    }
  }, [user]);

  useEffect(() => {
    if (player) {
      setEditedName(player.username || player.email?.split('@')[0] || 'Anonymous');
    }
  }, [player]);

  const loadPlayerData = async () => {
    if (!user) return;

    try {
      const playerRef = doc(db, 'players', user.uid);
      const playerDoc = await getDoc(playerRef);

      if (playerDoc.exists()) {
        setPlayer(playerDoc.data() as Player);
      }
    } catch (error) {
      console.error('Error loading player data:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToDuelRequests = () => {
    if (!user) return;

    const q = query(
      collection(db, 'duelRequests'),
      where('to', '==', user.uid)
    );

    return onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DuelRequest));
      setDuelRequests(requests);
    });
  };

  const requestDuel = async (opponentId: string) => {
    if (!user) return;

    try {
      await addDoc(collection(db, 'duelRequests'), {
        from: user.uid,
        to: opponentId,
        status: 'pending',
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error requesting duel:', error);
    }
  };

  const handleDuelRequest = async (requestId: string, accept: boolean) => {
    if (!user) return;

    try {
      const requestRef = doc(db, 'duelRequests', requestId);
      await updateDoc(requestRef, {
        status: accept ? 'accepted' : 'rejected'
      });

      if (accept) {
        // Start the duel by updating both players' queue status
        const request = duelRequests.find(r => r.id === requestId);
        if (request) {
          const playerRef = doc(db, 'players', user.uid);
          const opponentRef = doc(db, 'players', request.from);
          
          await updateDoc(playerRef, {
            inQueue: true,
            lastMatch: serverTimestamp()
          });
          
          await updateDoc(opponentRef, {
            inQueue: true,
            lastMatch: serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.error('Error handling duel request:', error);
    }
  };

  const handleSaveName = async () => {
    if (!user || !editedName.trim()) return;

    try {
      setSaveError(null);
      const playerRef = doc(db, 'players', user.uid);
      await updateDoc(playerRef, {
        username: editedName.trim()
      });
      setIsEditing(false);
      // Reload player data to get the updated name
      await loadPlayerData();
    } catch (error) {
      console.error('Error saving username:', error);
      setSaveError('Failed to save username. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="text-cyber-blue text-center">Loading profile...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Player Stats */}
      <div className="bg-cyber-black rounded-lg p-6">
        <h2 className="text-2xl font-press-start text-cyber-pink mb-4">
          {selectedPlayer ? (
            <>
              {selectedPlayer.username || selectedPlayer.email?.split('@')[0] || 'Anonymous'}
              <button
                className="ml-4 px-4 py-2 bg-cyber-red text-white border-2 border-cyber-red rounded-lg font-press-start shadow-lg shadow-cyber-red/40 hover:bg-red-700 hover:shadow-cyber-red/80 transition-all duration-200 red-glow"
                onClick={() => requestDuel(selectedPlayer.uid)}
              >
                Challenge
              </button>
            </>
          ) : isEditing ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="px-3 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start focus:outline-none focus:border-cyber-purple"
                maxLength={20}
                placeholder="Enter username"
              />
              <button
                onClick={handleSaveName}
                className="px-4 py-2 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedName(player?.username || player?.email?.split('@')[0] || 'Anonymous');
                }}
                className="px-4 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              {player?.username || player?.email?.split('@')[0] || 'Anonymous'}
              <button
                onClick={() => setIsEditing(true)}
                className="ml-2 px-3 py-1 bg-cyber-black border border-cyber-pink text-cyber-pink rounded-lg font-press-start text-sm hover:bg-cyber-purple transition-colors"
              >
                Edit
              </button>
            </div>
          )}
        </h2>
        {saveError && (
          <p className="text-cyber-red text-sm mb-4">{saveError}</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-cyber-blue">
            Power: {selectedPlayer ? selectedPlayer.power : player?.power || 0}
          </div>
          <div className="text-cyber-blue">
            Wins: {selectedPlayer ? selectedPlayer.wins : player?.wins || 0}
          </div>
          <div className="text-cyber-blue">
            Losses: {selectedPlayer ? selectedPlayer.losses : player?.losses || 0}
          </div>
          <div className="text-cyber-blue">
            Win Streak: {selectedPlayer ? selectedPlayer.winStreak : player?.winStreak || 0}
          </div>
          <div className="text-cyber-blue">
            Highest Streak: {selectedPlayer ? selectedPlayer.highestWinStreak : player?.highestWinStreak || 0}
          </div>
        </div>
      </div>

      {/* Duel Requests */}
      {!selectedPlayer && duelRequests.length > 0 && (
        <div className="bg-cyber-black rounded-lg p-6">
          <h3 className="text-xl font-press-start text-cyber-pink mb-4">
            Duel Requests
          </h3>
          <div className="space-y-4">
            {duelRequests.map(request => (
              <div key={request.id} className="flex justify-between items-center p-4 bg-cyber-purple bg-opacity-20 rounded-lg">
                <div className="text-cyber-blue">
                  Duel request from {request.from}
                </div>
                {request.status === 'pending' && (
                  <div className="space-x-2">
                    <button
                      onClick={() => handleDuelRequest(request.id, true)}
                      className="px-4 py-2 bg-cyber-pink text-white rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDuelRequest(request.id, false)}
                      className="px-4 py-2 bg-cyber-black border-2 border-cyber-pink text-cyber-pink rounded-lg font-press-start hover:bg-cyber-purple transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {request.status !== 'pending' && (
                  <div className="text-cyber-yellow">
                    {request.status === 'accepted' ? 'Accepted' : 'Rejected'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 