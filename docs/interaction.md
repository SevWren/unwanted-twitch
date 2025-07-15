# Documentation for Script Interaction

## How the "Unwanted Twitch" Extension Blocks Content

The "Unwanted Twitch" extension operates through a coordinated effort between several specialized JavaScript files. No single script is responsible for the entire process. The blocking of a Twitch element is the final result of a chain of events involving user interaction, background processing, and direct page manipulation.

This document details the step-by-step process of how these scripts work together, from a user adding a channel to their blacklist to that channel disappearing from their directory view.

### The Core Components

First, let's define the role of each major script in the process:

-   **`popup.js` & `blacklist.js` (The User Interface Layer)**: These scripts manage the user-facing controls. `popup.js` handles the simple popup menu, while `blacklist.js` controls the main settings page. Their job is to capture what the user wants to do.
-   **`background.js` (The Conductor)**: This is the central message broker and event manager. It runs persistently in the background. It doesn't touch the Twitch page itself, but it listens for events (like URL changes or messages from the UI) and tells the other scripts what to do.
-   **`directory.js` (The Worker)**: This is the content script that gets injected directly into the Twitch.tv page. It is the only script that can actually see and modify the page's content. It does all the heavy lifting of finding, parsing, and hiding elements.
-   **`common.js` & `storage.js` (The Utility Belt)**: These are shared libraries. `common.js` provides common functions for storage access and string manipulation, while `storage.js` provides specialized functions for handling very large blacklists.

---

### The Workflow: From Blacklisting to Blocking

Here is the detailed workflow, following a typical user action.

#### Scenario: A user wants to blacklist the channel "UnwantedStreamer".

**Step 1: The User Action (UI Layer)**

1.  The user is on a Twitch directory page and sees "UnwantedStreamer".
2.  The `directory.js` content script has already run, found the stream card for "UnwantedStreamer", determined it's not currently blacklisted, and attached a small "X" button to it using its `attachHideButtons` function.
3.  The user clicks the "X" button.

**Step 2: The Immediate Response (Content Script)**

1.  The click event listener, also created by `attachHideButtons` in `directory.js`, fires.
2.  It immediately calls the `onHideItem('channels', 'UnwantedStreamer')` function within `directory.js`.
3.  `onHideItem` does two things almost simultaneously:
    a.  It adds `'UnwantedStreamer'` to its active, in-memory blacklist (`storedBlacklistedItems`).
    b.  It calls `putBlacklistedItems()` to begin the process of saving the updated blacklist to permanent storage.

**Step 3: Saving the Blacklist (Content Script + Utilities)**

1.  The `putBlacklistedItems` function in `directory.js` takes the newly updated blacklist object.
2.  It uses `getStorageMode()` (from `common.js`) to check if the user has chosen `sync` or `local` storage.
3.  **If using `sync` storage**: It uses `measureStoredSize()` (from `storage.js`) to check if the new blacklist is too large for Chrome's sync quota.
    -   If it's too large, it automatically switches to `local` storage for the save.
    -   If it fits, it may call upon the `splitBlacklistItems()` logic (from `storage.js`) to break the blacklist into storable fragments.
4.  It then uses `chrome.storage.[mode].set()` to save the (potentially fragmented) blacklist.

**Step 4: Re-filtering the Page (Content Script)**

1.  Immediately after the `putBlacklistedItems` call completes, the `onHideItem` function calls `filterAllContent()`.
2.  `filterAllContent()` in `directory.js` re-runs the entire filtering process on the page.
3.  The `filterDirectory` function gets all the stream cards.
4.  For each card, the `isBlacklistedItem` function is called. This time, when it checks the card for "UnwantedStreamer", it finds a match in the now-updated in-memory blacklist.
5.  `isBlacklistedItem` returns `true`.
6.  The `filterItems` function receives this `true` result and adds the `uttv-hidden-item` CSS class to the stream card's main container element.

**Step 5: The Final Result (CSS)**

1.  The `styles/directory.css` stylesheet, which was injected into the page by the extension, contains the following rule:
    ```css
    .uttv-hidden-item {
        display: none !important;
    }
    ```
2.  The browser's rendering engine sees that the stream card for "UnwantedStreamer" now has this class, and it immediately removes it from the page layout.

**The stream card for "UnwantedStreamer" is now hidden from the user's view.**

---

### How Other Interactions Fit In

-   **URL Redirection**: While the user is browsing, `background.js` is constantly watching for URL changes. If the user navigates to a directory page without the correct sorting parameter (`?sort=VIEWER_COUNT`), `background.js` will intercept this and redirect the tab *before* `directory.js` even has a chance to run its full filtering logic. This ensures the page is sorted correctly first.
-   **Managing the Full Blacklist**: If the user opens the popup (`popup.js`), clicks "Manage Blacklist", `popup.js` sends a message to `background.js`, which opens `views/blacklist.html`. The user can then add/remove many items using `blacklist.js`. When they click "Save", `blacklist.js` sends a single, large message containing the entire new blacklist. `directory.js` receives this one message, updates its entire in-memory blacklist at once with `modifyBlacklistedItems`, saves it to storage, and re-filters the page, applying all the new rules instantly.

## Conclusion

The extension's architecture is a clear example of the separation of concerns:

-   The **UI Scripts** (`popup.js`, `blacklist.js`) are only concerned with capturing user input.
-   The **Background Script** (`background.js`) is only concerned with high-level events and routing messages.
-   The **Content Script** (`directory.js`) is the only component concerned with the structure of the Twitch page and is responsible for all DOM manipulation.
-   The **Utility Scripts** (`common.js`, `storage.js`) provide shared, reusable logic to support all other components.

This separation makes the extension robust. A change in Twitch's page structure only requires updating `directory.js`, not the entire extension. A change in the UI only requires updating the UI scripts. The `background.js` conductor ensures they all continue to work together.
