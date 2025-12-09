module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  moduleNameMapper: {
    '^kms-wallet$': '<rootDir>/src/index.ts',
  },
  testTimeout: 60000, // 60 seconds for network tests
  testEnvironmentOptions: {
    NODE_OPTIONS: '--experimental-vm-modules'
  },
};
