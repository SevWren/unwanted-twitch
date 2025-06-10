# Running Tests

This project uses a manual, browser-based test runner due to limitations in the execution environment that prevent the use of standard JavaScript testing frameworks like Jest.

## How to Run Tests

1.  **Ensure all project files are accessible.** The test runner loads the extension's source JavaScript files.
2.  **Open the Test Runner:** Navigate to the `tests/test_runner.html` file in your web browser.
3.  **View Results:**
    *   The main page will display a summary of test suites, with "PASSED" or "FAILED" for each test case.
    *   Open the browser's Developer Console (usually by pressing F12). Detailed logs from the tests, including mock API calls and any errors from failing tests, will be printed here. This is crucial for debugging.

## Test Structure

*   Test files are located in the `tests/` directory and typically named `[source_file_name]_test.js`.
*   `mocks.js` in the `tests/` directory contains mock implementations for Chrome extension APIs (`chrome.*`) and browser DOM features.
*   The tests are written in plain JavaScript. Each test file defines its own test cases and uses a simple set of assertion helpers.

## Limitations

*   **No Automated Execution:** Tests must be run manually by opening the HTML file.
*   **Limited Mocking:** While `mocks.js` provides essential mocks, it might not cover every edge case or complex API behavior.
*   **No Code Coverage Reports:** Automatic code coverage analysis is not available with this setup.
*   **Focus on Unit/Integration:** These tests primarily focus on unit and integration testing of JavaScript logic. They do not perform end-to-end UI testing within a live Twitch environment.
