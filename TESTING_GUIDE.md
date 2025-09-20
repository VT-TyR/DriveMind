# Testing Guide

This document outlines the testing strategy for the DriveMind project, provides instructions on how to run tests, and highlights common issues and debugging tips. Adhering to these guidelines ensures code quality and stability.

## Testing Strategy

DriveMind employs a multi-layered testing strategy to ensure the reliability and correctness of its various components:

-   **Unit Tests:** Focus on individual functions, classes, or components in isolation. They are fast to execute and provide immediate feedback on code changes. Jest is used for both backend (Firebase Functions) and frontend (React components) unit testing.
-   **Integration Tests:** Verify the interactions between different modules or services. For example, testing the interaction between a Firebase Function and Firestore, or a React component with its associated hooks and context.
-   **End-to-End (E2E) Tests:** Simulate real user scenarios to ensure the entire application flow works as expected. These tests are typically slower but provide the highest confidence in the application's overall functionality. (Currently, E2E tests are not fully implemented or documented, but are a future goal).

## How to Run Tests

All tests can be run using `npm` scripts defined in `package.json`. Ensure you have Node.js (v18 recommended) and npm installed.

1.  **Install Dependencies:**
    If you haven't already, install project dependencies:
    ```bash
    npm install
    cd functions
    npm install
    cd ..
    ```

2.  **Run All Tests (CI Mode):**
    This command runs all unit and integration tests in a CI-friendly mode (non-interactive, generates coverage reports).
    ```bash
    npm run test:ci
    ```

3.  **Run All Tests (Development Mode):**
    This command runs all tests in watch mode, re-running tests when file changes are detected. Useful for active development.
    ```bash
    npm test
    ```

4.  **Run Specific Test Files:**
    To run tests for a specific file, you can pass the file path to `jest`:
    ```bash
    npx jest functions/src/__tests__/scan-runner.test.ts
    npx jest src/__tests__/components/scans/ScanManager.test.tsx
    ```

5.  **Run Tests with Coverage Report:**
    The `test:ci` command automatically generates a coverage report. You can also generate a coverage report without running in CI mode:
    ```bash
    npx jest --coverage
    ```
    Coverage reports are typically generated in the `coverage/` directory.

## Common Testing Pitfalls and Debugging Tips

### 1. `TypeError: Cannot read properties of undefined`

**Cause:** This often occurs when a mock is not correctly set up, or an asynchronous operation's result is not awaited before being accessed.

**Debugging Tips:**
-   **Verify Mocks:** Double-check that all external dependencies (e.g., Firebase, Google APIs, custom services) are properly mocked and that their mocked methods return expected values.
-   **Await Asynchronous Calls:** Ensure all `async` functions are `await`ed, especially when dealing with Promises or network requests. Missing `await` can lead to `undefined` results.
-   **Inspect `console.log`:** Use `console.log` to inspect the values of variables and the state of objects just before the error occurs. This can help pinpoint which property is `undefined`.

### 2. `Warning: An update to [Component] inside a test was not wrapped in act(...)`

**Cause:** This warning from React Testing Library indicates that state updates or DOM manipulations are happening outside of an `act()` block. `act()` ensures that all updates related to a test are processed before assertions are made, mimicking browser behavior.

**Debugging Tips:**
-   **Wrap State Updates:** Enclose any code that causes React state updates (e.g., `fireEvent.click`, `setState` calls, asynchronous operations that resolve and update state) within `act(() => { ... });`.
-   **Await `waitFor`:** When using `waitFor` for asynchronous assertions, ensure the `waitFor` call itself is `await`ed.

### 3. `ReferenceError: Cannot access 'variable' before initialization`

**Cause:** This typically happens in JavaScript/TypeScript when a variable is accessed before it has been declared or initialized, especially with `const` or `let` in block scopes, or due to hoisting issues with `var`.

**Debugging Tips:**
-   **Check Variable Scope:** Ensure variables are declared in the correct scope and are accessible where they are being used.
-   **Order of Declarations:** In test files, ensure that mocks and variable declarations are ordered correctly, especially when one depends on another.

### 4. Timestamp Mismatches in Checkpoint Tests

**Cause:** Tests that rely on `Date.now()` for creating timestamps can be flaky because the exact timestamp will vary slightly between test runs or even within a single test if `Date.now()` is called multiple times.

**Fix:** Use `jest.spyOn(Date, 'now').mockReturnValue(fixedTimestamp)` in your `beforeEach` or `beforeAll` block to provide a consistent timestamp. Remember to `jest.restoreAllMocks()` in `afterEach` to prevent interference with other tests.

### 5. `Element type is invalid` or `Unable to find an element with the text`

**Cause:** These errors often point to issues with React component rendering or incorrect queries in React Testing Library.

**Debugging Tips:**
-   **Component Export:** Ensure your React components are correctly exported (default or named export) from their respective files.
-   **Import Paths:** Verify that the import paths for your components are correct.
-   **Querying Elements:** Use `screen.debug()` to print the rendered DOM to the console. This helps you see the actual structure and content of the elements, allowing you to adjust your `getByText`, `findByText`, `getByRole`, etc., queries accordingly.
-   **Asynchronous Rendering:** If elements appear after an asynchronous operation (e.g., data fetching), use `findBy*` queries or `waitFor` to wait for them to appear in the DOM.

## Test Coverage

Test coverage is measured using Jest's built-in coverage reporter. The `npm run test:ci` command generates a detailed coverage report in the `coverage/` directory. Aim for high test coverage, especially for critical business logic and utility functions, to ensure robust and maintainable code.
