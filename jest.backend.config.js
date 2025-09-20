module.exports = {
  displayName: 'backend',
  roots: ['<rootDir>/functions'],
  testEnvironment: 'node',
  
  transform: {
    '^.+\.(ts|tsx)$': 'ts-jest',
    '^.+\.js$': 'babel-jest',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  collectCoverageFrom: [
    'functions/**/*.{js,jsx,ts,tsx}',
    '!functions/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};