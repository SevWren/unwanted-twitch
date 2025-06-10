module.exports = {
  testEnvironment: 'jsdom', // Use jsdom for tests that involve DOM manipulation
  verbose: true, // Output detailed information during tests
  setupFilesAfterEnv: ['./jest.setup.js'], // Optional: for global setup like mocks
};
