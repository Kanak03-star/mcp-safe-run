/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Use the preset specifically designed for ESM
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'], // Look for test files in the src directory
  // Re-add moduleNameMapper to handle .js extensions in imports
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1',
  },
}; 