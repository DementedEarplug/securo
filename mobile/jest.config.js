/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Jest resolves the package's ESM build (.mjs), which it doesn't transform; use the CommonJS one.
    '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  // The first test of a screen pays for transforming the screen and its chart
  // libraries; on a cold CI runner that alone can pass Jest's 5 s default.
  testTimeout: 20000,
}
