const nextJest = require('next/jest.js');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Add more setup options before each test is run
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // '^@/(.*)$': '<rootDir>/src/app/$1',
    // '^@/components/(.*)$': '<rootDir>/src/app/components/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    // '^@/types/leave$': '<rootDir>/src/types/caca/leave',
    // '^@/helpers/(.*)$': '<rootDir>/src/helpers/$1'
    '^src/(.*)$': '<rootDir>/src/$1',
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config);
