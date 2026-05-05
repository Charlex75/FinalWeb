import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Entry point — only runs with a real MongoDB, not testable via supertest
    '!src/index.ts',
    // Database connection — only executes on server boot, not in integration tests
    '!src/config/database.ts',
    // Socket.IO infrastructure — requires a WebSocket client to exercise
    '!src/middleware/socket.middleware.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches:   70,
      functions:  70,
      lines:      70,
    },
  },
};

export default config;
