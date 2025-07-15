# Documentation for `blacklist.js`

## File Overview

The `blacklist.js` script is the controller for the extension's main settings page, `views/blacklist.html`. It is responsible for all dynamic user interactions on this page, from adding and removing items to the various blacklist tables, to handling import/export functionality, and saving all changes. It acts as the primary user interface for managing the extension's filtering rules.

This script is highly interactive and heavily reliant on DOM manipulation. It reads the user's current settings from storage, populates the UI, and then sends the updated configuration back to the content script (`directory.js`) to be applied live on Twitch pages.

## Core Functionalities

### 1. Dynamic UI Management

The script dynamically builds and manages the tables that display the blacklisted items.

- **Purpose**: To provide a clear and interactive way for users to view and manage their blacklist.
- **Mechanism**:
    - **`createItemRow(key)`**: A factory function that creates a new `<tr>` element for a single blacklist item. Each row contains the item's key (e.g., a channel name or category) and a "Remove" button.
    - **`addItem(table, key)`**: Adds a single new item to a specified table, ensuring no duplicates are added.
    - **`addItems(table, items)`**: A bulk-add function that takes an array or object of items, sorts them case-insensitively, and appends them to the appropriate table. This is used for initial population and for imports.
    - **`clearItems(table)`**: Removes all item rows from a table.
    - **`handleItemCount(table)`**: Updates the item count displayed in the table's header (e.g., "Categories (15)") and toggles the visibility of the "no items" message and the "Clear" button.
- **Key Functions**: `createItemRow`, `addItem`, `addItems`, `clearItems`, `handleItemCount`

### 2. User Input Handling

The script captures and processes all user input from the "Add" fields.

- **Purpose**: To validate and normalize user input before adding it to the blacklist.
- **Mechanism**:
    - The `onAddItem` function is the central handler for this. It is triggered by both the "Add" button and the "Enter" key in the input field.
    - It trims whitespace, collapses multiple spaces, and handles different term types.
    - It checks if the term is an exact match (e.g., `'term'`) or a regular expression (e.g., `/term/i`).
    - For regular expressions, it uses `toRegExp` (from `common.js`) to validate the pattern. If the regex is invalid, it alerts the user.
    - For all other terms, it normalizes them to lowercase using `normalizeCase` (from `common.js`).
    - Once processed, the item is added to the UI and the input field is cleared.
- **Key Functions**: `onAddItem`, `isExactTerm`, `isRegExpTerm`, `toRegExp`, `normalizeCase`

### 3. Saving and Communication

This is the most critical interaction. The script gathers all data from the UI and sends it to the content script for storage and live application.

- **Purpose**: To persist the user's changes and make them take effect immediately.
- **Mechanism**:
    - The `onSave` function is the primary orchestrator.
    - It first saves the simple checkbox settings (`hideFollowing`, `hideReruns`, `useLocalStorage`) directly to storage.
    - It then gathers all blacklist items from the four tables using `gatherKeysMap` (for categories, channels, tags) and `gatherKeysArray` (for titles).
    - The complete blacklist object is then sent as a message to the content script (`directory.js`) using `chrome.runtime.sendMessage`. **This is a key architectural point**: the blacklist page does *not* write the main blacklist to storage itself. It delegates this task to the content script.
    - It uses a `Promise.race` with a timeout to wait for a confirmation response from the content script. This ensures the page doesn't close prematurely if the save operation is slow or fails.
    - If the content script confirms a successful save, `onCancel` is called to close the tab. If it fails, an alert is shown, and the page remains open for the user to retry.
- **Key Functions**: `onSave`, `gatherKeysMap`, `gatherKeysArray`, `chrome.runtime.sendMessage`, `onCancel`

### 4. Import/Export Functionality

- **Purpose**: To allow users to back up and restore their blacklists.
- **Mechanism**:
    - **`onExport`**: Gathers all blacklist keys into a single JSON object, serializes it, and creates a data URL. It then programmatically creates an `<a>` element with this URL and a `download` attribute, and simulates a click to trigger a file download.
    - **`onImport`**: Creates a file input element and programmatically clicks it. When the user selects a file, it uses a `FileReader` to read the file's content. It parses the JSON and uses the `addItems` function to populate the UI tables with the imported data. It includes error handling for invalid file formats.
- **Key Functions**: `onExport`, `onImport`, `FileReader`

## How It Works with Other Files

- **`directory.js` (Content Script)**: This is the most important interaction. `blacklist.js` sends the entire updated blacklist object to `directory.js` upon saving. `directory.js` then takes on the responsibility of writing this data to `chrome.storage` (using the fragmentation logic in `storage.js` if necessary) and immediately re-running its filtering logic on the live Twitch page. This delegation ensures that the changes are applied instantly without needing a page reload.
- **`common.js`**: `blacklist.js` heavily relies on `common.js` for utility functions. It uses `storageGet` to load initial settings, `normalizeCase` and `toRegExp` for input validation, and the various logging functions (`logInfo`, `logError`) for debugging.
- **`storage.js`**: While `blacklist.js` doesn't call `splitBlacklistItems` or `mergeBlacklistFragments` directly, it is implicitly reliant on them. The `onSave` function sends the large blacklist object to the content script, which in turn uses the functions from `storage.js` to handle the complexities of storing the data in `chrome.storage.sync`.
- **`background.js`**: The "Manage Blacklist" button in the popup sends a message to `background.js`, which is responsible for opening the `views/blacklist.html` page, thereby activating this `blacklist.js` script.

In essence, `blacklist.js` is the command center for user configuration. It provides the interface for rule management and then broadcasts the new set of rules to the active content script, which acts as the enforcer.
