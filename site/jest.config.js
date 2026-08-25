const nextJest = require('next/jest.js');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/utils/(.*)$': '<rootDir>/utils/$1',
    '^src/(.*)$': '<rootDir>/src/$1',
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
const createdJestConfig = createJestConfig(config);

// next/jest computes its own transformIgnorePatterns (asynchronously, after createJestConfig
// runs), which would otherwise clobber a transformIgnorePatterns set directly on `config` above.
// Its default only lets a handful of Next-internal pnpm packages through, so
// @codegouvfr/react-dsfr — which ships untranspiled ESM (import/export) despite not being marked
// "type": "module" — must be added back in here, once next/jest's own config is resolved.
module.exports = async () => {
  const nextJestConfig = await createdJestConfig();
  return {
    ...nextJestConfig,
    transformIgnorePatterns: [
      '/node_modules/(?!\\.pnpm)(?!@codegouvfr/react-dsfr/)',
      '/node_modules/\\.pnpm/(?!@codegouvfr\\+react-dsfr@)',
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
};
