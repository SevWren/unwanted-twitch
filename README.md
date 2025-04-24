# Hide unwanted streams, games, categories, channels and tags on: twitch.tv

![UnwantedTwitch](webstore/banner1400x560.png)

## Project status
- I am attempting to update this forked version of the repo to be compatible with current twitch theme changes.
- Currently implemented working as intended on individual Game channels i.e.
    `twitch.tv/directory/category/just-chatting`
    `twitch.tv/directory/category/dota-2`
    `twitch.tv/directory/category/grand-theft-auto-v`
    `twitch.tv/directory/category/league-of-legends`
- Known NOT working on:
    `twitch.tv/directory/following`
    `twitch.tv`
    <details>
    <summary>Features, Supported Pages, Notes and FAQ</summary>

    ## Original Extension Supported pages
    - Browse: Categories
    - Browse: Live Channels
    - Game: Live Channels (preview slider is not filtered)
    - Game: Videos
    - Game: Clips
    - Frontpage/Discover (carousel is not filtered)
    - Explore Gaming/IRL/Music/Creative/Esports
    - Following
    - Sidebar (filtering only, no buttons to add items to the blacklist)
    - you can still access any blacklisted content via direct link

    ## Known Issues / Troubleshooting / FAQ
    ## Known Issues

    *   **Vulnerability to Twitch UI Changes:** The extension's filtering and button placement rely heavily on querying Twitch's specific HTML structure and CSS class names via content scripts (`directory.js`). Frequent UI updates by Twitch often break this functionality, requiring manual updates to the extension's selectors. This is the primary reason updates are needed.
    *   **Inconsistent Element Structures:** Even visually similar elements (like stream cards) can have different underlying HTML structures on different Twitch pages (e.g., stream cards on `/directory` vs. `/directory/category/...`). This may lead to filtering or button placement working on some pages but not others until specific selectors for each context are added.
        *   **Status:** Selectors for stream cards on category pages and category cards on the main directory page have been updated. Stream cards displayed directly on `/directory` may still require selector adjustments.
    *   **`chrome.storage.sync` Quota Limits:** Large blacklists (typically > 100KB total, or complex lists requiring many fragments) can exceed the storage quota limits of `chrome.storage.sync`. Attempting to save such large lists with the "Synchronize Blacklist via Cloud" option enabled **will fail**.
        *   **Workaround:** For large blacklists, **disable** the "Synchronize Blacklist via Cloud" option in the blacklist management page. This forces the extension to use `chrome.storage.local`, which has a much higher limit (~5MB).
    *   **Potential Save Failure After Sync Error (Fixed, Needs Monitoring):** Previously, if a save failed while sync was enabled (due to quota limits), subsequent attempts to save *even after disabling sync* could also fail persistently due to a race condition.
        *   **Status:** Fixes have been implemented to handle quota errors more gracefully by automatically switching to local storage and ensuring the storage mode preference is correctly read. However, if save issues persist after switching off sync, please report it.
        **What's the maximum number of items I can block?**
        - When using the **cloud synchronization**, about `1 MB` of data. That roughly translates to **about 30.000 items** due to internal restrictions. If you exceed this quota, the extension will automatically turn off synchronization and switch to the local storage.
        - When using **local storage** (default), about `5 MB` of data. That roughly translates to **about 200.000 items**.
        - Before reaching this upper limit, you will most likely notice a performance degradation first. The extension is generally not designed and optimized for a huge blacklists (50.000+ items).

    </details>

## Updates/Changelog

This forked repository includes performance optimizations to the `directory.js` file, specifically designed to improve the extension's handling of dynamic content loading on pages like `https://www.twitch.tv/directory/category/games-demos`. Below is a detailed changelog of the modifications made, highlighting the differences from the original repository:

**April 24, 2025**
*   **Added date string to export filename in `blacklist.js`**: The export filename now includes the current date in the format `day-month-year`.
*   **Optimized blacklist import/export in `blacklist.js`**: Improved the import and export functionality for blacklists, including error handling and user feedback.
*   **Updated storage size limits in `README.md`**: Clarified the storage size limits for cloud synchronization and local storage.
*   **Improved performance in `directory.js`**: Implemented various performance optimizations, including debounced scroll event handling, batched DOM updates, and optimized selectors.
*   **[REVERTED] Changes made after 11:00 a.m. CST**: Substantial code edits made while debugging the Twitch extension—specifically related to stream card detection—have been reverted. At some point, the cloud sync feature was unknowingly enabled, which blocks all local and cloud-side changes without warning. This caused edits to silently fail, reverting the blacklist and other script data back to previous versions despite appearing saved. Numerous attempted fixes only deepened the inconsistency. To maintain a clean baseline and avoid further instability, all changes from that period have been rolled back.

**April 18, 2025**
- **Debounced Scroll Event Handling**: Added debouncing to the `onScroll` function to reduce the frequency of filtering operations during rapid scrolling, preventing performance bottlenecks.
- **Batched DOM Updates**: Modified the `filterDirectoryItems` function to batch hide operations using `classList.add('uttv-hidden-item')`, reducing reflows and improving rendering performance.
- **Optimized Selectors**: Updated DOM selectors to be more specific, targeting precise container elements (e.g., `div.Layout-sc-1xcs6mc-0.jCGmCy` for stream cards), enhancing query efficiency.
- **Mutation Observer Enhancements**: Improved the Mutation Observer in `observeSidebar` to target specific sidebar containers and use `requestAnimationFrame` for updates, reducing layout thrashing.
- **In-Memory Caching**: Ensured blacklist checks use an in-memory cache (`storedBlacklistedItems`), speeding up filtering operations.
- **Event Delegation**: Implemented event delegation for hide buttons, reducing the number of event listeners and improving performance on pages with many items.

## TODO: Unfinished Page logic / Templates 
- Browse: Categories (double check)
- Browse: Live Channels
- Game: Live Channels (preview slider is not filtered)
- Game: Videos (0% finished)
- Game: Clips (0% finished)
- Frontpage/Discover (carousel is not filtered) (0% finished)
- Explore Gaming/IRL/Music/Creative/Esports - (80%)
- Following - (50%)
- Sidebar (filtering only, no buttons to add items to the blacklist) - (0%)
- Most work has been getting extension to work with game categories i.e. https://www.twitch.tv/directory/category/grand-theft-auto-v https://www.twitch.tv/directory/category/retro etc 
