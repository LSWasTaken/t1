const assert = require('assert');
const { initializeTestEnvironment, RulesTestEnvironment } = require('@firebase/rules-unit-testing');
const fs = require('fs');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'tfca-e9ecc',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Firestore Security Rules', () => {
  // Test Players Collection
  describe('Players Collection', () => {
    const playerId = 'test-player-id';
    const otherPlayerId = 'other-player-id';
    const playerData = {
      uid: playerId,
      email: 'test@example.com',
      power: 100,
      wins: 0,
      losses: 0
    };

    it('allows anyone to read player data', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assert.doesNotReject(
        db.collection('players').doc(playerId).get()
      );
    });

    it('allows authenticated user to create their own player data', async () => {
      const db = testEnv.authenticatedContext(playerId).firestore();
      await assert.doesNotReject(
        db.collection('players').doc(playerId).set(playerData)
      );
    });

    it('prevents unauthenticated user from creating player data', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assert.rejects(
        db.collection('players').doc(playerId).set(playerData)
      );
    });

    it('allows user to update their own player data', async () => {
      const db = testEnv.authenticatedContext(playerId).firestore();
      await db.collection('players').doc(playerId).set(playerData);
      await assert.doesNotReject(
        db.collection('players').doc(playerId).update({ power: 200 })
      );
    });

    it('prevents user from updating other player data', async () => {
      const db = testEnv.authenticatedContext(playerId).firestore();
      await db.collection('players').doc(otherPlayerId).set({
        ...playerData,
        uid: otherPlayerId
      });
      await assert.rejects(
        db.collection('players').doc(otherPlayerId).update({ power: 200 })
      );
    });

    it('prevents deletion of player data', async () => {
      const db = testEnv.authenticatedContext(playerId).firestore();
      await db.collection('players').doc(playerId).set(playerData);
      await assert.rejects(
        db.collection('players').doc(playerId).delete()
      );
    });
  });

  // Test Matches Collection
  describe('Matches Collection', () => {
    const player1Id = 'player1-id';
    const player2Id = 'player2-id';
    const matchData = {
      player1Id,
      player2Id,
      player1Power: 100,
      player2Power: 90,
      winner: player1Id,
      powerGained: 10,
      timestamp: new Date()
    };

    it('allows anyone to read match data', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assert.doesNotReject(
        db.collection('matches').doc('test-match').get()
      );
    });

    it('allows authenticated user to create match data', async () => {
      const db = testEnv.authenticatedContext(player1Id).firestore();
      await assert.doesNotReject(
        db.collection('matches').add(matchData)
      );
    });

    it('prevents unauthenticated user from creating match data', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assert.rejects(
        db.collection('matches').add(matchData)
      );
    });

    it('allows match participant to update match data', async () => {
      const db = testEnv.authenticatedContext(player1Id).firestore();
      const matchRef = await db.collection('matches').add(matchData);
      await assert.doesNotReject(
        matchRef.update({ powerGained: 20 })
      );
    });

    it('prevents non-participant from updating match data', async () => {
      const db = testEnv.authenticatedContext('non-participant').firestore();
      const matchRef = await db.collection('matches').add(matchData);
      await assert.rejects(
        matchRef.update({ powerGained: 20 })
      );
    });

    it('prevents deletion of match data', async () => {
      const db = testEnv.authenticatedContext(player1Id).firestore();
      const matchRef = await db.collection('matches').add(matchData);
      await assert.rejects(
        matchRef.delete()
      );
    });
  });
}); 