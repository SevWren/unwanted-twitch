# Documentation for `directory.js`

## File Overview

The `directory.js` script is the primary content script for the "Unwanted Twitch" extension. This script is injected directly into Twitch.tv pages and is responsible for the most critical user-facing feature: identifying and hiding unwanted content. It performs all the necessary DOM (Document Object Model) manipulation to filter streams, categories, and sidebar channels based on the user's blacklist.

This script is designed to be highly resilient and adaptable to Twitch's ever-changing front-end code. It uses a combination of polling, Mutation Observers, and context-aware parsing to function effectively within Twitch's dynamic, single-page application environment.

## Core Functionalities

### 1. Initialization and State Management

Before any filtering can occur, the script sets up its environment and loads the necessary data.

- **Purpose**: To safely initialize all global variables, load user settings and the blacklist from storage, and find the essential DOM elements to monitor.
- **Mechanism**:
    - An `initPromise` is used to wrap the entire asynchronous setup process. This ensures that no filtering or message handling occurs until the script is fully ready, preventing race conditions.
    - **`initExtensionState()`**: Loads basic settings like `enabled`, `renderButtons`, `hideFollowing`, and `hideReruns` from storage using the `storageGet` wrapper from `common.js`.
    - **`getBlacklistedItems()`**: Retrieves the complete blacklist from storage. It's designed to handle both single-object blacklists and fragmented blacklists (using `mergeBlacklistFragments` from `storage.js`).
    - **`modifyBlacklistedItems()`**: This function takes the loaded blacklist and processes it into a more efficient, in-memory format. It also builds the performance caches (`cacheExactTerms`, `cacheRegExpTerms`, etc.) which are critical for fast matching.
    - **`waitForElement()`**: A crucial utility that polls the DOM until a specific element (like the main content area `.tw-tower`) is available. This is essential because in single-page apps, the content is not always present when the script first executes.
- **Key Functions**: `initPromise`, `initExtensionState`, `getBlacklistedItems`, `modifyBlacklistedItems`, `waitForElement`

### 2. Content Monitoring and Detection

The script uses multiple strategies to detect new content appearing on the page.

- **Purpose**: To identify new stream cards, category cards, or sidebar channels as they are loaded dynamically by Twitch (e.g., when the user scrolls down or navigates to a new page).
- **Mechanism**:
    - **Page Change Monitoring**: `setInterval(monitorPageChanges, 500)` periodically checks the `window.location.pathname`. If the path has changed, it triggers the `onPageChange` handler, which re-initializes the filtering for the new page.
    - **New Item Polling**: `setInterval(checkForNewDirectoryItems, 750)` periodically runs a query (`getDirectoryItemNodes('unprocessed')`) to find any stream or category cards that do not have the `data-uttv-processed` attribute. This catches new items loaded by infinite scroll.
    - **Sidebar Observation**: An `observeSidebar` function sets up a `MutationObserver` on the main sidebar navigation element (`nav#side-nav`). This is a highly efficient method that triggers the `filterSidebar` function only when the sidebar's DOM actually changes (e.g., a followed streamer comes online).
- **Key Functions**: `monitorPageChanges`, `onPageChange`, `checkForNewDirectoryItems`, `observeSidebar`, `MutationObserver`

### 3. DOM Parsing and Data Extraction (The Most Complex Part)

This is where the script inspects the DOM to understand what each card represents. This section is the most vulnerable to breaking if Twitch changes its HTML structure.

- **Purpose**: To read the raw HTML of a stream or category card and extract structured data (channel name, title, category, tags, rerun status) for filtering.
- **Mechanism**:
    - **Context-Aware Routing**: The `getDirectoryItems` function acts as a "router." It first determines the `currentPageType` ('channels' or 'categories'). Based on this context, it calls the appropriate parsing function. This is a key architectural feature that makes the script adaptable.
    - **`readChannel(containerNode)`**: This function is responsible for parsing a standard stream card. It uses a series of robust selectors to find the link to the channel, the stream title, the category link, and the tag buttons. It extracts the data from these elements.
    - **`readCategoryCard(containerNode)`**: This function is specifically for parsing the larger category cards found on the main `/directory` page. It uses different selectors to find the category name and its associated tags.
    - **`getSidebarItems(mode)`**: This function specifically parses the more compact channel listings found in the sidebar.
- **Key Functions**: `getDirectoryItems`, `readChannel`, `readCategoryCard`, `getSidebarItems`

### 4. Core Filtering and UI Manipulation

This is where the filtering decisions are made and applied to the page.

- **Purpose**: To hide blacklisted content and attach the "X" hide buttons to the remaining content.
- **Mechanism**:
    - **`isBlacklistedItem(item)`**: This is the central decision-making function. It takes a parsed item object and checks all its properties (name, category, title, tags, rerun status) against the in-memory blacklist. It uses the `matchTerms` function for the actual string comparison.
    - **`matchTerms(term, type)`**: This function performs the blacklist check. It's highly optimized, first checking for a direct match in the main blacklist object, and then checking against the pre-compiled caches for exact, loose, and regex terms. It uses `normalizeCase` from `common.js`.
    - **`filterItems(items, hideClass)`**: This function iterates through an array of parsed items. If `isBlacklistedItem` returns true, it adds the `uttv-hidden-item` CSS class to the item's container node, which hides it from view.
    - **`attachHideButtons(items)`**: For items that are *not* hidden, this function dynamically creates and appends the "X" buttons to the card and to each individual tag on the card. It also attaches the `onHideItem` event listener to these buttons.
    - **`onHideItem(type, name)`**: When a user clicks an "X" button, this function immediately adds the item to the in-memory blacklist, saves the entire blacklist back to storage using `putBlacklistedItems`, and then re-runs the entire filter to ensure the page state is consistent.
- **Key Functions**: `isBlacklistedItem`, `matchTerms`, `filterItems`, `attachHideButtons`, `onHideItem`

## How It Works with Other Files

- **`common.js`**: `directory.js` is a heavy user of `common.js`. It uses the storage wrappers (`storageGet`, `storageSet`) for all settings and blacklist management, the term matching and normalization functions for its core filtering logic, and the logging functions for debugging.
- **`storage.js`**: When `directory.js` needs to save the blacklist (`putBlacklistedItems`), it may be dealing with a very large object. It relies on the logic within `storage.js` (`splitBlacklistItems`) to handle the fragmentation of this data if `chrome.storage.sync` is being used and the data exceeds the size limits. It also uses `mergeBlacklistFragments` when loading the data.
- **`blacklist.js`**: The relationship is one of delegation. When a user saves their changes on the blacklist page, `blacklist.js` sends a message containing the new, complete blacklist object. `directory.js` receives this message, calls `putBlacklistedItems` to save it, and then immediately re-runs `filterAllContent()` to apply the new rules to the live page.
- **`background.js`**: `directory.js` receives "passthrough" messages forwarded by the background script, such as the request from the popup to toggle the hide buttons (`renderButtons`).
- **`directory.css`**: This CSS file contains the styles that actually hide the content. The `uttv-hidden-item` class, which this script applies, is defined in `directory.css` with `display: none !important;`. The CSS also styles the "X" buttons and the "Manage Blacklist" button.

In conclusion, `directory.js` is the workhorse of the extension. It is the component that lives on the Twitch page, constantly watching, parsing, and manipulating the DOM to enforce the user's filtering preferences.
