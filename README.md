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

## Features
- hide unwanted categories/games
- hide unwanted channels/streams
- hide unwanted tags
- hide stream reruns
- hide streams based on their title
- filtering on "Following" page can be disabled (in settings)
- toggle visibility of "X" buttons
- share blacklists using import/export (in settings)
- blacklist can automatically sync between devices (in settings, requires opt-in)
- one-click-toggle to disable/enable extension (click on the extension icon to access)
- compatible with FrankerFaceZ (FFZ) and other popular extensions for Twitch
- supports Twitch's Dark Mode
- supports pattern matching and regular expressions for dynamic blacklisting

## Supported pages
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

## Note about breaking changes on twitch.tv
Twitch is infamous for changing their website without further notice, which may break this extension over night. Twitch also serves different [canary builds](https://www.techtarget.com/whatis/definition/canary-canary-testing) (previews of potential future versions) to selected/random users for up to 4 weeks, which most likely break parts of the extension. If you notice pages no longer working properly, disable the extension, [report the issue](https://github.com/kwaschny/unwanted-twitch/issues) and wait for an update. Note that updates may take a few days to be approved on the corresponding browser stores.

## Known Issues / Troubleshooting / FAQ

**There are no X buttons visible anywhere?**
- After the first install of the extension, restart your browser. Or at least do a hard refresh (`CTRL+R`) on all twitch.tv tabs.
- Check if you accidently unchecked the `Show "X" Buttons` option. It can be found in the extension popup menu or as clickable 👁 icon on the management button.
- Make sure the page is supported, see description. The sidebar generally has no "X" button.
- This is still being addressed in the current forked version of the extension.
**Channel still show up although I blocked one of the tags?**
- Twitch limits the number of visible tags in the directory view. If the blocked tag only shows up on the channel page and is not visible in the directory, the extension cannot filter properly.
- The extension needs to "see" the unwanted content on the page to perform filtering.
    - If the channel has a lot of tags, the extension may not be able to see the tag you previously blocked.
- Some views add tags after the initial load (layout adjustment based on screen size). Monitoring these changes is too costly (performance wise) and thus these tags are neither filtered nor blockable via "X" button.

**What's the maximum number of items I can block?**
- When using the **cloud synchronization**, about `1 MB` of data. That roughly translates to **about 30.000 items** due to internal restrictions. If you exceed this quota, the extension will automatically turn off synchronization and switch to the local storage.
- When using **local storage** (default), about `5 MB` of data. That roughly translates to **about 200.000 items**.
- Before reaching this upper limit, you will most likely notice a performance degradation first. The extension is generally not designed and optimized for a huge blacklists (50.000+ items).

**Whatever I try to block, the entry is never saved to the blacklist?**
- Make sure you restarted your browser after installing the extension.
- Avoid having more than one tab of twitch.tv open while adding to or removing from the blacklist.
- Try switching to local storage (instead of cloud storage). This option can be found in the management view (accessible via the extension popup menu or via management button) by unchecking the box at the top right.
- Close browser system tabs (browser settings, flags, extensions) before adding to or removing from the blacklist.

**Why do special characters in blocked items disappear?**
- This is working as intended. When adding an item, all characters are normalized (i.e. diacritics are removed).
- At runtime, every item in the directory will also be normalized internally before matching against the blocked item.
- Example: Blocking the term `ÄéôŪ` will be added as `aeou`, yet it will block items like `äëöü`, `âèôú`, `ẬỆỘỤ` etc. because all of them are normalized as `aeou`.

**Are you accessing my Twitch profile in any way?**
- No, there is no attempt to access or read any information other than what is needed to detect and identify items to block. These items do not contain sensitive data.
- There is no attempt to write any information to an external resource, other than your personal blacklist in case you are using the cloud storage of your browser. The cloud storage is only accessible to you and the cloud storage's operator, such as Google (Chrome), Mozilla (Firefox), Microsoft (Edge) etc. The blacklist only contains category names, channel names, tags and titles, see export.
- There are no code injections or outgoing requests (such as [script tags](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script), [fetches](https://developer.mozilla.org/en-US/docs/Web/API/fetch) or [XmlHttpRequests](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)). There is also no dependency on any library other than the native browser extension API ([Chrome](https://developer.chrome.com/docs/extensions/reference/) and [WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)).

## Updates/Changelog

This forked repository includes performance optimizations to the `directory.js` file, specifically designed to improve the extension's handling of dynamic content loading on pages like `https://www.twitch.tv/directory/category/games-demos`. Below is a detailed changelog of the modifications made, highlighting the differences from the original repository:

**April 24, 2025**

*   **Added date string to export filename in `blacklist.js`**: The export filename now includes the current date in the format `day-month-year`.
*   **Optimized blacklist import/export in `blacklist.js`**: Improved the import and export functionality for blacklists, including error handling and user feedback.
*   **Updated storage size limits in `README.md`**: Clarified the storage size limits for cloud synchronization and local storage.
*   **Improved performance in `directory.js`**: Implemented various performance optimizations, including debounced scroll event handling, batched DOM updates, and optimized selectors.

**April 18, 2025**
- **Debounced Scroll Event Handling**: Added debouncing to the `onScroll` function to reduce the frequency of filtering operations during rapid scrolling, preventing performance bottlenecks.
- **Batched DOM Updates**: Modified the `filterDirectoryItems` function to batch hide operations using `classList.add('uttv-hidden-item')`, reducing reflows and improving rendering performance.
- **Optimized Selectors**: Updated DOM selectors to be more specific, targeting precise container elements (e.g., `div.Layout-sc-1xcs6mc-0.jCGmCy` for stream cards), enhancing query efficiency.
- **Mutation Observer Enhancements**: Improved the Mutation Observer in `observeSidebar` to target specific sidebar containers and use `requestAnimationFrame` for updates, reducing layout thrashing.
- **In-Memory Caching**: Ensured blacklist checks use an in-memory cache (`storedBlacklistedItems`), speeding up filtering operations.
- **Event Delegation**: Implemented event delegation for hide buttons, reducing the number of event listeners and improving performance on pages with many items.

These changes significantly reduce sluggishness on dynamically loading pages, ensuring a smoother user experience compared to the original repository.

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

## Contributing to this extension
Regardless if you are a regular user or a developer yourself, [check out the contribution page for information about how you can help this project](CONTRIBUTING.md).

## Translations
| Language | Translator |
| -------- | ----------- |
| English | [kwaschny](https://github.com/kwaschny) |
| German | [kwaschny](https://github.com/kwaschny) |
| Spanish | [JoseSM](https://github.com/JoseSM) |
| Polish | de_oScar |
| Portuguese | [sealestial](https://github.com/sealestial) |

## How it works
The extension is loaded after the requested twitch.tv page is fully served and completely relies on the present DOM. It adds button controls to specific nodes that can be used to add the underlying item to the blacklist. The blacklist is held in the storage, either local or synced (can be adjusted in the settings). Once there are items on the blacklist, supported pages are filtered by going through item nodes, matching game/category, channel or tags. A successful match hides the topmost node and marks it as being hidden. Most detections are interval based node comparisons instead of observing mutations in the DOM (I find it more consistent, especially because of the seamless page navigation on Twitch), that's why you might notice a minor flicker effect once in a while.
