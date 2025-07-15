# Documentation for `common.js`

## File Overview

The `common.js` script is a shared utility library for the "Unwanted Twitch" extension. Its purpose is to provide a centralized set of helper functions and constants that can be used by any other script in the extension, whether it's the background script, the content script, or the UI scripts (`popup.js`, `blacklist.js`).

This script promotes code reuse and consistency. By centralizing common tasks like storage access, string normalization, and logging, it ensures that all parts of the extension behave in the same way and reduces code duplication. This file is intended to be included in every context where its utilities are needed.

## Core Functionalities

### 1. Storage Abstraction Wrappers

This is the most critical feature of `common.js`. It provides a simplified and unified interface for interacting with `chrome.storage`.

- **Purpose**: To abstract away the complexity of choosing between `chrome.storage.sync` and `chrome.storage.local`. The user can choose their preferred storage method, and the rest of the extension's code doesn't need to know or care which one is currently active.
- **Mechanism**:
    - **`getStorageMode()`**: This asynchronous function is the core of the abstraction. It reads a single flag (`useLocalStorage`) from `chrome.storage.local`. Based on this flag, it returns either the string `'sync'` or `'local'`.
    - **`storageGet(data)`**: A wrapper for `chrome.storage.get`. It first calls `getStorageMode()` to determine which storage area to use, and then performs the `get` operation on that area.
    - **`storageSet(data)`**: A wrapper for `chrome.storage.set`. It also calls `getStorageMode()` before performing the `set` operation.
    - **`storageRemove(data)`**: A wrapper for `chrome.storage.remove`.
    - **`storageClear()`**: A wrapper for `chrome.storage.clear`.
- **Key Functions**: `getStorageMode`, `storageGet`, `storageSet`, `storageRemove`, `storageClear`

### 2. Term and Pattern Matching

These functions provide a consistent way to interpret and handle the different types of filter terms a user can enter in the blacklist.

- **Purpose**: To identify whether a string is a plain term, an exact-match term, a loose-match term, or a regular expression.
- **Mechanism**:
    - **`isExactTerm(term)`**: Checks if a term is enclosed in single quotes (e.g., `'exact term'`), signifying a case-sensitive, exact match.
    - **`isLooseTerm(term)`**: Checks if a term starts with a tilde (`~`), signifying a loose, case-insensitive "contains" match.
    - **`isRegExpTerm(term)`**: Checks if a term is enclosed in slashes (e.g., `/pattern/i`), signifying a regular expression. It uses a regex to validate the format.
    - **`toRegExp(term)`**: If a term is identified as a regular expression, this function extracts the pattern and flags and attempts to construct a `new RegExp()` object. It includes error handling to return `null` if the user's pattern is invalid.
- **Key Functions**: `isExactTerm`, `isLooseTerm`, `isRegExpTerm`, `toRegExp`

### 3. String Normalization

- **Purpose**: To provide a single, consistent way to prepare strings for case-insensitive and accent-insensitive comparison. This is essential for matching blacklist terms against channel names, titles, etc.
- **Mechanism**:
    - The `normalizeCase(term)` function performs a series of operations:
        1. Trims leading/trailing whitespace.
        2. Uses `String.prototype.normalize('NFKD')` to decompose composite characters (like `é`) into their base character and diacritic mark (`e` and `´`).
        3. Uses a regular expression (`/\p{Diacritic}/gu`) to remove all diacritical marks.
        4. Converts the resulting string to lowercase.
- **Key Functions**: `normalizeCase`

### 4. Tiered Logging System

- **Purpose**: To provide a flexible and controllable logging system for debugging.
- **Mechanism**:
    - A global constant `debug` is set at the top of the file. This number controls the verbosity of the logs.
    - A series of logging functions (`logTrace`, `logVerbose`, `logInfo`, `logWarn`, `logError`) are defined.
    - Each function first checks the value of the `debug` constant. If the debug level is not high enough, the function returns immediately.
    - If the check passes, it prefixes the message with a consistent tag (e.g., "UTTV INFO:") and prints it to the console using the appropriate `console` method (`.log`, `.warn`, `.error`).
- **Key Functions**: `logTrace`, `logVerbose`, `logInfo`, `logWarn`, `logError`

## How It Works with Other Files

- **All other scripts (`background.js`, `directory.js`, `blacklist.js`, `popup.js`)**: Every other script in the extension includes and uses `common.js`.
    - `directory.js` uses `storageGet` to load the blacklist, `normalizeCase` and the `is...Term`/`toRegExp` functions to match items against the blacklist, and the logging functions extensively.
    - `blacklist.js` uses `storageGet` to load the initial settings, `normalizeCase` and `toRegExp` to validate user input, and the logging functions.
    - `popup.js` uses `storageGet` to display the current state of the extension's settings.
    - `background.js` uses the logging functions.
- **`storage.js`**: While `common.js` provides the high-level interface for storage, `storage.js` provides the low-level implementation for handling large data within storage (fragmentation). The content script (`directory.js`) uses functions from both to manage the blacklist.

In short, `common.js` is the foundational utility belt for the entire extension. It provides the common tools and consistent logic that all other components need to perform their specialized tasks.
