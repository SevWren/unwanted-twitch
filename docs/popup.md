# Documentation for `popup.js`

## File Overview

The `popup.js` script provides the logic and interactivity for the extension's popup window, which is defined in `views/popup.html`. When a user clicks on the "Unwanted Twitch" icon in the browser toolbar, this script is what makes the buttons and toggles in that small window functional.

Its role is to provide a quick and simple interface for the most common user actions: enabling/disabling the extension, toggling the visibility of the "X" hide buttons, and accessing the main blacklist management page.

## Core Functionalities

### 1. Initialization and State Display

When the popup is opened, it needs to reflect the current state of the extension.

- **Purpose**: To ensure the UI elements in the popup (the main toggle button and the "Show filter buttons" checkbox) accurately represent the user's current settings.
- **Mechanism**:
    - The `init` function is called as soon as the script loads.
    - It calls `getState()`, which uses the `storageGet` wrapper from `common.js` to retrieve the current `enabled` and `renderButtons` values from storage.
    - Based on these values, it updates the UI:
        - It adds or removes the `disabled` class from the main icon to change its color (grayed out or full color).
        - It sets the text of the main toggle button to either "Disable Extension" or "Enable Extension".
        - It sets the `checked` property of the "Show filter buttons" checkbox.
- **Key Functions**: `init`, `getState`

### 2. Opening the Blacklist Manager

- **Purpose**: To provide a simple, one-click way for the user to access the full settings page.
- **Mechanism**:
    - The "Manage Blacklist" button has an event listener attached to it that calls the `openBlacklist` function.
    - **Crucial Interaction**: `openBlacklist` does **not** call `chrome.tabs.create` directly. Instead, it sends a message (`{ action: 'openBlacklist' }`) to the background script (`background.js`).
    - The background script is responsible for actually creating the new tab. This is a robust design choice, as the background script's ability to perform actions is more reliable than a popup's.
    - After sending the message, the script immediately calls `window.close()` to close the popup, providing a smooth user experience.
- **Key Functions**: `openBlacklist`, `chrome.runtime.sendMessage`

### 3. Toggling the Entire Extension

- **Purpose**: To allow the user to quickly enable or disable all functionality of the extension.
- **Mechanism**:
    - The main enable/disable button has an event listener that calls `toggleExtension`.
    - `toggleExtension` checks if the button currently has the `enabled` or `disabled` class.
    - Based on the class, it calls either `enableExtension()` or `disableExtension()`.
    - These functions, in turn, send a message to the content script (forwarded by the background script) with either `{ 'extension': 'enable' }` or `{ 'extension': 'disable' }`.
    - The content script (`directory.js`) receives this message and is responsible for reloading the page to apply the state change (either activating or deactivating its filtering logic).
    - The popup closes itself with `window.close()`.
- **Key Functions**: `toggleExtension`, `enableExtension`, `disableExtension`

### 4. Toggling the "Hide" Buttons

- **Purpose**: To allow the user to show or hide the "X" buttons that appear on stream and category cards, without having to go to the main settings page.
- **Mechanism**:
    - The "Show filter buttons" checkbox (`buttonsToggleButton`) has a `change` event listener attached to it, which calls `toggleButtonsToggle`.
    - `toggleButtonsToggle` reads the `checked` state of the checkbox and sends a message to the content script, e.g., `{ 'renderButtons': true }`.
    - The content script (`directory.js`) receives this message and immediately shows or hides all the "X" buttons currently on the page by adding or removing a CSS class. This change happens instantly without a page reload.
- **Key Functions**: `toggleButtonsToggle`

## How It Works with Other Files

- **`views/popup.html`**: This is the HTML file that defines the structure of the popup window. `popup.js` is included in it via a `<script>` tag and attaches all its event listeners to the elements defined in this file (e.g., `#open_blacklist`, `#toggle_extension`).
- **`popup.css`**: This CSS file provides the styling for the popup window, including the styles for the `enabled` and `disabled` states of the icon and button, which `popup.js` manipulates.
- **`background.js`**: `popup.js` relies on the background script to act as a message broker. It sends high-level commands (like "enable", "disable", "open blacklist") to the background script, which then forwards them to the appropriate components (content scripts or the browser's tab management API). This decouples the popup from the content script.
- **`directory.js` (Content Script)**: The content script is the ultimate recipient of the messages sent by the popup (via the background script). It listens for the `'extension'` and `'renderButtons'` messages and takes the appropriate action on the live Twitch page.
- **`common.js`**: `popup.js` uses `storageGet` from `common.js` to initialize its state. It also uses the logging functions for debugging.

In summary, `popup.js` is a lightweight controller for a simple UI. Its primary role is to capture user intent and translate it into messages that are sent to the more powerful background and content scripts for execution.
