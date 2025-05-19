'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface UserProfile {
  username: string;
  email: string;
  avatar: string;
  power: number;
  wins: number;
  losses: number;
  draws: number;
}

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfile({
            username: data.username || user.email?.split('@')[0] || 'Anonymous',
            email: user.email || '',
            avatar: data.avatar || '/default-avatar.svg',
            power: data.power || 0,
            wins: data.wins || 0,
            losses: data.losses || 0,
            draws: data.draws || 0
          });
          setNewUsername(data.username || user.email?.split('@')[0] || 'Anonymous');
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAvatarFile(e.target.files[0]);
    }
  };

  const handleSave = async () => {
    if (!user || !profile) return;

    try {
      setUploading(true);
      let avatarUrl = profile.avatar;

      if (avatarFile) {
        const storageRef = ref(storage, `avatars/${user.uid}`);
        await uploadBytes(storageRef, avatarFile);
        avatarUrl = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        username: newUsername,
        avatar: avatarUrl
      });

      setProfile({
        ...profile,
        username: newUsername,
        avatar: avatarUrl
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-press-start animate-pulse">Loading profile...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-press-start text-cyber-red mb-4">{error}</h2>
        <button
          onClick={() => window.location.reload()}
          className="cyber-button"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-press-start text-cyber-red">Profile not found</h2>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-press-start mb-6">Profile</h2>
      
      <div className="bg-cyber-dark rounded-lg p-6">
        <div className="flex items-center space-x-6 mb-6">
          <div className="relative">
            <img
              src={profile.avatar}
              alt="Avatar"
              className="w-24 h-24 rounded-full border-2 border-cyber-pink"
            />
            {isEditing && (
              <label className="absolute bottom-0 right-0 bg-cyber-pink rounded-full p-2 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </label>
            )}
          </div>
          
          <div className="flex-1">
            {isEditing ? (
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full bg-cyber-black text-cyber-pink border border-cyber-pink rounded px-3 py-2 font-press-start"
                placeholder="Enter username"
              />
            ) : (
              <h3 className="text-xl font-press-start text-cyber-pink">{profile.username}</h3>
            )}
            <p className="text-cyber-blue">{profile.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-cyber-black rounded p-4 text-center">
            <p className="text-cyber-green font-press-start">Power</p>
            <p className="text-2xl">{profile.power}</p>
          </div>
          <div className="bg-cyber-black rounded p-4 text-center">
            <p className="text-cyber-green font-press-start">Wins</p>
            <p className="text-2xl">{profile.wins}</p>
          </div>
          <div className="bg-cyber-black rounded p-4 text-center">
            <p className="text-cyber-green font-press-start">Losses</p>
            <p className="text-2xl">{profile.losses}</p>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="cyber-button bg-cyber-red"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="cyber-button bg-cyber-green"
                disabled={uploading}
              >
                {uploading ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="cyber-button"
            >
              Edit Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
} 