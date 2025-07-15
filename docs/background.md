# Documentation for `background.js`

## File Overview

The `background.js` script serves as the central nervous system for the "Unwanted Twitch" extension. It operates as a service worker, running persistently in the background of the Chrome browser. Its primary responsibilities are to manage the extension's state, handle URL redirections, orchestrate communication between different parts of the extension, and manage the browser action (the extension's icon in the toolbar).

This script is crucial for the extension's core functionality, as it's the only component that can monitor all tab activity and react to navigation events across the entire browser.

## Core Functionalities

### 1. URL Redirection

The most critical feature of this script is its ability to automatically redirect Twitch directory pages.

- **Purpose**: To change the default sorting of Twitch's category and game directory pages from "Relevance" to "Viewer Count (High to Low)". This provides a more traditional and arguably more useful browsing experience for users.
- **Mechanism**:
    - The script listens for tab updates using `chrome.tabs.onUpdated`.
    - When a tab's URL changes and the page begins to load, the `handleUrlRedirect` function is triggered.
    - `handleUrlRedirect` parses the URL to check if it's a Twitch directory page that should be modified.
    - It specifically targets URLs starting with `https://www.twitch.tv/directory` but contains a crucial exclusion list (`EXCLUDED_DIRECTORY_PREFIXES`) to avoid altering pages like `/directory/following`, `/directory/videos`, and `/directory/clips`.
    - If the URL matches the target pattern and the URL's search parameters either lack a `sort` parameter or have it set to `sort=RELEVANCE`, the script modifies the URL.
    - It sets the `sort` parameter to `VIEWER_COUNT` and then updates the tab's URL using `chrome.tabs.update`, effectively redirecting the user to the same page but with the desired sorting.
- **Key Functions**: `handleUrlRedirect`, `chrome.tabs.onUpdated.addListener`

### 2. Browser Action (Icon) Management

This functionality provides clear visual feedback to the user about when the extension is active.

- **Purpose**: To enable the extension's icon in the browser toolbar only when the user is on a `twitch.tv` tab and disable it for all other websites.
- **Mechanism**:
    - The `chrome.tabs.onUpdated` listener also checks the URL of the updated tab.
    - If the URL starts with `https://www.twitch.tv/`, it calls `chrome.action.enable(tabId)`.
    - If the URL is for any other website, it calls `chrome.action.disable(tabId)`.
    - Additionally, the `setInitialIconStates` function runs when the extension first starts up. It queries all open tabs and sets the initial state of the icon for each one, ensuring a correct UI state on browser launch.
- **Key Functions**: `chrome.tabs.onUpdated.addListener`, `setInitialIconStates`, `chrome.action.enable`, `chrome.action.disable`

### 3. Message Handling and Forwarding

The background script acts as a central hub for communication between the popup, the content scripts, and the browser.

- **Purpose**: To receive messages from other parts of the extension and take appropriate action.
- **Mechanism**:
    - It uses `chrome.runtime.onMessage.addListener` to listen for incoming messages.
    - If a message has a specific `action` property (e.g., `{action: 'openBlacklist'}`), the background script handles it directly. In this case, it opens the `blacklist.html` page in a new tab.
    - If the message does not have a specific action, it is treated as a "passthrough" message intended for the content scripts running on Twitch pages.
    - The `forwardMessageToTabs` function is called, which queries all open Twitch tabs and sends the message to each one that is in a 'complete' loading state. This is how the popup, for example, can tell the content scripts to toggle the visibility of the hide buttons.
- **Key Functions**: `chrome.runtime.onMessage.addListener`, `forwardMessageToTabs`

## Global Constants

- `twitchUrl`: The base URL for Twitch.
- `BASE_DIRECTORY_PATH`: The base path for directory pages (`/directory`).
- `EXCLUDED_DIRECTORY_PREFIXES`: An array of paths to exclude from redirection (e.g., `/directory/following`).
- `SORT_PARAM`, `RELEVANCE_VALUE`, `VIEWER_COUNT_VALUE`: Constants for URL parameter manipulation.

## How It Works with Other Files

- **`popup.js`**: The popup sends messages to `background.js` to perform actions that the popup itself cannot (due to its limited scope and lifetime). For example, when the user clicks "Manage Blacklist" in the popup, it sends a message with `{action: 'openBlacklist'}` to this script. When the user toggles the main on/off switch, the popup sends a message like `{'extension': 'disable'}` which this script handles by reloading the tab.
- **`directory.js` (Content Script)**: While this script handles the *redirection*, it does not directly hide any elements on the page. The `directory.js` content script is responsible for the actual DOM manipulation (hiding streams/categories). `background.js` forwards messages (like blacklist updates or button visibility toggles) to `directory.js` so it can update the page accordingly.
- **`common.js`**: `background.js` utilizes the logging functions (`logInfo`, `logError`, etc.) from `common.js` for consistent and controllable console output.
- **`storage.js`**: Although it doesn't directly call functions from `storage.js`, the logic for storing and retrieving settings is shared conceptually. The background script works with the same storage structure that `storage.js` and `common.js` manage.

In summary, `background.js` is the conductor of the orchestra. It doesn't play an instrument (manipulate the DOM) itself, but it tells all the other components when and how to play their parts, ensuring the entire extension works together seamlessly.
