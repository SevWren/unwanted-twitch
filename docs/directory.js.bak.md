# Documentation for `directory.js.bak`

## File Overview

This file, `directory.js.bak`, is a **legacy backup file**. It represents a snapshot of `directory.js` from a previous point in the extension's development. It is **not actively used** by the extension in its current state.

The primary purpose of this documentation is to explain its status as a legacy file, highlight the key differences between it and the current `directory.js`, and clarify why it should not be used or referenced for current development.

## Status: Legacy Backup

This file is a backup, likely created before a significant refactoring of the content script. Its presence is for historical reference or as a potential rollback point in case of catastrophic failure in the main file during development. It should be considered **deprecated**.

**Recommendation**: This file should be deleted in a future cleanup of the repository to avoid confusion, unless there is a specific development reason to preserve this exact snapshot.

## Key Differences and Obsolete Code

Comparing this `.bak` file to the active `directory.js` reveals several key areas where the code is outdated. These differences are the reason this file is non-functional with the modern Twitch UI.

### 1. Outdated DOM Selectors

The most significant issue is that the selectors used in this file to find streams and categories are no longer valid.

- **Obsolete Selectors**: This file heavily relies on `data-a-target` attributes like:
    - `a[data-a-target="preview-card-image-link"]`
    - `a[data-a-target="tw-card-avatar-link"]`
    - `a[data-a-target="preview-card-game-link"]`
- **The Problem**: Twitch has removed most of these specific `data-a-target` attributes from their directory pages. As a result, the core parsing functions in this file (`readChannel`, `readCategory`) would fail to find any elements and would be unable to extract any data.
- **The Modern Solution (in `directory.js`)**: The active script uses more resilient selectors based on HTML tag structure, CSS classes, and more stable attributes like `href` and `title`. It also uses a context-aware approach to choose different selectors for different page types.

### 2. Lack of Context-Aware Parsing

This backup file uses a single, monolithic approach to parsing directory items.

- **Obsolete Logic**: The `getDirectoryItems` function calls `readItem`, which then tries to guess whether a card is a stream or a category. This logic assumes that all directory pages have a similar, predictable structure for their content cards.
- **The Problem**: The HTML structure for the main category directory (`/directory`) is completely different from a specific channel listing page (e.g., `/directory/category/retro`). The monolithic approach of this backup file would fail to parse one or both of these pages correctly.
- **The Modern Solution (in `directory.js`)**: The active script uses `getPageType()` to determine if it's on a `channels` or `categories` page. It then uses a "router" (`getDirectoryItems`) to call a specialized parsing function (`readChannel` or `readCategoryCard`) designed specifically for that page's structure.

### 3. Inefficient Content Detection

This version of the script contains the `setInterval` polling mechanism that was later identified as a source of performance issues and bugs.

- **Obsolete Logic**: The `itemPollInterval` and `checkForNewDirectoryItems` functions create a loop that repeatedly queries the DOM for new items every 750ms.
- **The Problem**: This method is inefficient and can lead to race conditions and infinite loops, especially on a framework-heavy site like Twitch. The script could modify an element, only for Twitch's React framework to re-render it, causing the script to process it again on the next interval. The file `directory.nonstop.polling.bug.js` was likely created specifically to debug this issue.
- **The Modern Solution (in `directory.js`)**: The active script still uses this polling method, but the comments in `directory.nonstop.polling.bug.js` indicate that the intended solution is to replace this with a more efficient `MutationObserver`.

## How It Interacts with Other Files (Hypothetically)

If this script were active, its interactions would be similar to the current `directory.js`, but likely broken.

- It would attempt to use the storage and utility functions from **`common.js`** and **`storage.js`**.
- It would fail to properly receive and apply blacklist updates from **`blacklist.js`** because its core filtering loop would be unable to find and parse the DOM elements correctly.
- It would not be able to provide a functional user experience, as the core feature of hiding content would be non-operational.

In summary, `directory.js.bak` is a historical artifact. It is a valuable piece of evidence showing the evolution of the extension and the challenges faced in adapting to a changing website, but it holds no functional value in the current codebase.
