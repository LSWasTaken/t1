module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/*.test.js', '**/*.test.ts', '**/*.test.tsx'],
  setupFiles: ['<rootDir>/jest.setup.js'],
}; 