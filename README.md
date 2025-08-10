# Hide streams, games, channels and tags on: twitch.tv

## Project status
- This forked version of the repo has been (partially) updated  to be compatible with the current Twitch theme and DOM structure with changes made to new twitch layout that was rolled out 8/8/25.
- **Core functionality working as intended** on individual Game/Category pages, such as:
    - `twitch.tv/directory/category/just-chatting`
    - `twitch.tv/directory/category/retro`
    - `twitch.tv/directory/category/league-of-legends`
- Known pages that *may or may not* be updated to work in this forked repo:
    - `twitch.tv/directory/following` (hiding streams that meet saved criteria is not currently applied to this page)
    - `twitch.tv` (Frontpage)
    - `twitch.tv/directory` (html changes to category cards has not been udpated yet)

<details>

<summary>Features, Supported Pages, Notes and FAQ</summary>

## Known Issues / Troubleshooting / FAQ

### Known Issues

*   **Working as of August 9th 2025, however Vulnerability still exists to Twitch UI Changes:** The extension's filtering and button placement rely heavily on querying Twitch's specific HTML structure. Frequent UI updates by Twitch can break this functionality, requiring manual updates to the extension's selectors. **This was the primary reason for the recent series of fixes.**
*   **Inconsistent Element Structures:** Visually similar elements can have different HTML on different pages. This may lead to filtering working on some pages but not others until specific selectors for each context are added.
    *   **Category Directory:** This may or may not be updated as the html elements used to hide categories in the top level directory is different that browsing invidivual game pages.
*   **`chrome.storage.sync` Quota Limits:** Large blacklists can exceed the storage quota of `chrome.storage.sync`.
    *   **Workaround:** For large blacklists, **disable** the "Synchronize Blacklist via Cloud" option in the blacklist management page. This forces the extension to use `chrome.storage.local`, which has a much higher limit (~5MB).
    *   **Best Practice:** It is **highly recommended to always use the Import/Export feature** on the blacklist management page to create regular backups of your list. This protects you from data loss in case of storage issues, browser profile corruption, or if you need to transfer your list to another computer.

### What's the maximum number of items I can block?
- When using the **cloud synchronization**, about `1 MB` of data. That roughly translates to **about 30,000 items** due to internal restrictions. If you exceed this quota, the extension will automatically turn off synchronization and switch to the local storage.
- When using **local storage** (default), about `5 MB` of data. That roughly translates to **about 200,000 items**.
- Before reaching this upper limit, you will most likely notice a performance degradation first. The extension is generally not designed and optimized for a huge blacklists (50,000+ items).

</details>

## Updates/Changelog

**August 9, 2025**

To adapt to significant changes in Twitch's front-end, a series of deep architectural and logical fixes were implemented. This was a multi-step process that involved identifying and resolving several layers of issues.

### 1. DOM Adaptation for New Twitch UI
The original selectors for stream cards, titles, channels, and tags were completely obsolete.
-   **Old Method:** Relied on specific `data-a-target` attributes and CSS classes that no longer exist.
-   **New Method:** The script now correctly identifies the primary container for each stream card as `div[data-target][style*="order:"]`. Within this container, it uses a combination of more stable selectors to parse the content:
    -   **Stream Title:** `h4[title]`
    -   **Channel Name:** `p[title].CoreText-sc-1txzju1-0`
    -   **Tags:** `button.tw-tag`

### 2. Robust Initialization and Timing
The original script's method for detecting when to run was fragile and failed silently on modern Twitch.
-   **Old Method:** Used a `DOMContentLoaded` event listener and a simple polling "gatekeeper" that would time out before Twitch's React application finished rendering the page content.
-   **New Method:** The script now uses a relentless, brute-force initialization strategy. It abandons `DOMContentLoaded` and immediately starts a `setInterval` loop upon injection. This loop's sole purpose is to find the `<main>` element where content is rendered. Once `<main>` is found, it triggers the full initialization, ensuring the script never misses its chance to run.

### 3. Fixed Post-Interaction Filtering
After a stream or tag was hidden by clicking the "X" button, the page would not update correctly.
-   **The Bug:** The script would mark all cards as "processed" on its first run. When re-filtering was triggered after a click, it would only look for "unprocessed" cards, find none, and do nothing.
-   **The Fix:** A new function, `reFilterAllVisibleCards()`, was created. This function is now called after any blacklist change. It re-evaluates **all currently visible cards** against the updated blacklist, ensuring that newly-blacklisted items are hidden instantly.

### 4. Corrected Individual Tag Hiding
The "X" buttons on individual tags were being created but were not visible.
-   **The Bug:** The tag buttons were not a "positioned" CSS element, causing the absolutely-positioned "X" buttons to render off-screen.
-   **The Fix:** The `attachHideButtons` function in `directory.js` now dynamically applies `style.position = 'relative';` to each tag button, creating the necessary positioning context for the "X" to appear correctly in its top-right corner.

## TODO: Unfinished Page logic / Templates *as of 8/8/25*
- Browse: Categories (Needs update to dynamically match new html updates as of 8/8/25)
- Browse: Live Channels (Requires testing, mostly working)
- Cloud Saving: This has not been a personal focus as personally I am at 13,561 entries and way above the cloud limit.  
- Game: Videos (0% finished)
- Game: Clips (0% finished)
- Frontpage/Discover (carousel is not filtered) (0% finished)
- Explore Gaming/IRL/Music/Creative/Esports - (Requires testing)
- Following - (Requires specific logic on top of html matching logic updates)
- Sidebar (filtering only, no buttons to add items to the blacklist) - (Requires specific logic)
- The primary focus has been to restore functionality to the core Game/Category pages, which is now complete.

## Notes: Browser Support
- This fork will only have changes made to scripts required for the Chrome extension.
