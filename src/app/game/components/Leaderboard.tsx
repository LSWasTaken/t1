'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import Profile from './Profile';

interface LeaderboardEntry {
  uid: string;
  username: string;
  email: string;
  power: number;
  wins: number;
  losses: number;
  winStreak: number;
  highestWinStreak: number;
  inQueue: boolean;
  lastMatch?: any;
}

type LeaderboardCategory = 'power' | 'wins' | 'streak';

export default function Leaderboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<LeaderboardCategory>('power');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    fetchLeaderboardData();
  }, [activeTab]);

  const fetchLeaderboardData = async () => {
    setLoading(true);
    try {
      let q;
      switch (activeTab) {
        case 'power':
          q = query(
            collection(db, 'players'),
            orderBy('power', 'desc'),
            limit(10)
          );
          break;
        case 'wins':
          q = query(
            collection(db, 'players'),
            orderBy('wins', 'desc'),
            limit(10)
          );
          break;
        case 'streak':
          q = query(
            collection(db, 'players'),
            orderBy('winStreak', 'desc'),
            limit(10)
          );
          break;
      }

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        uid: doc.id,
        username: doc.data().username || 'Anonymous',
        email: doc.data().email || '',
        power: doc.data().power || 0,
        wins: doc.data().wins || 0,
        losses: doc.data().losses || 0,
        winStreak: doc.data().winStreak || 0,
        highestWinStreak: doc.data().highestWinStreak || 0,
        inQueue: doc.data().inQueue || false,
        lastMatch: doc.data().lastMatch
      }));

      setLeaderboardData(data);
    } catch (error) {
      console.error('Error fetching leaderboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryLabel = (category: LeaderboardCategory) => {
    switch (category) {
      case 'power':
        return 'Power Rankings';
      case 'wins':
        return 'Most Wins';
      case 'streak':
        return 'Best Streaks';
    }
  };

  const getCategoryValue = (entry: LeaderboardEntry) => {
    switch (activeTab) {
      case 'power':
        return entry.power;
      case 'wins':
        return entry.wins;
      case 'streak':
        return entry.winStreak;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-cyber-black rounded-lg p-6">
        <div className="space-y-4">
          <h2 className="text-2xl font-press-start text-cyber-pink text-center">
            Leaderboard
          </h2>

          {/* Tab Navigation */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => setActiveTab('power')}
              className={`px-4 py-2 rounded-lg font-press-start ${
                activeTab === 'power'
                  ? 'bg-cyber-pink text-white'
                  : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
              }`}
            >
              Power
            </button>
            <button
              onClick={() => setActiveTab('wins')}
              className={`px-4 py-2 rounded-lg font-press-start ${
                activeTab === 'wins'
                  ? 'bg-cyber-pink text-white'
                  : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
              }`}
            >
              Wins
            </button>
            <button
              onClick={() => setActiveTab('streak')}
              className={`px-4 py-2 rounded-lg font-press-start ${
                activeTab === 'streak'
                  ? 'bg-cyber-pink text-white'
                  : 'bg-cyber-purple text-cyber-pink hover:bg-cyber-pink hover:text-white'
              }`}
            >
              Streaks
            </button>
          </div>

          {/* Leaderboard Title */}
          <div className="text-cyber-yellow text-center text-xl font-press-start">
            {getCategoryLabel(activeTab)}
          </div>

          {/* Leaderboard Table */}
          {loading ? (
            <div className="text-cyber-blue text-center">Loading...</div>
          ) : (
            <div className="space-y-2">
              {leaderboardData.map((entry, index) => (
                <div
                  key={entry.uid}
                  onClick={() => setSelectedPlayer(entry)}
                  className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors ${
                    entry.uid === user?.uid
                      ? 'bg-cyber-pink bg-opacity-20 border-2 border-cyber-pink'
                      : selectedPlayer?.uid === entry.uid
                      ? 'bg-cyber-yellow bg-opacity-20 border-2 border-cyber-yellow'
                      : 'bg-cyber-purple bg-opacity-20 hover:bg-opacity-30'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <span className="text-cyber-yellow font-press-start w-8">
                      #{index + 1}
                    </span>
                    <span className="text-cyber-blue font-press-start">
                      {entry.username}
                    </span>
                  </div>
                  <div className="text-cyber-pink font-press-start">
                    {getCategoryValue(entry)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Profile Section */}
      {selectedPlayer && (
        <Profile selectedPlayer={selectedPlayer} />
      )}
    </div>
  );
} 