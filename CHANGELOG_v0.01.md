# Changelog - Unwanted Twitch (Fixes for Twitch UI Update - In Progress)

This documents the proposed and implemented changes aimed at fixing the extension's functionality after recent Twitch.tv website layout updates. Focus is on restoring filtering and UI injection based on analyzed HTML snapshots.

**Note:** These changes are based on the HTML structures provided for Stream Cards (on `/directory/category/retro`), Category Cards (on `/directory`), and the Expanded Sidebar. Functionality for VOD cards, Clip cards, and the Collapsed Sidebar still requires analysis of their respective HTML structures. Verbose logging has been added for debugging purposes and should be reviewed/removed before final release.

## Upcoming Fixes (Based on Conversation)

### `styles/directory.css`

*   **Added:** New CSS class `.uttv-hidden-item` with `display: none !important;` rule. This replaces the use of inline styles for hiding elements, aiming for better compatibility against Twitch's base styles.
*   **Required Adjustments (Mentioned, CSS code not finalized):**
    *   CSS rules for `.uttv-hide-item` (card 'X' button) likely need updating to correctly position the button (e.g., `position: absolute`, `top`, `right`, `z-index`) relative to its new parent container (`div.jCGmCy` or `div.gmMVaQ`).
    *   CSS rules for `.uttv-hide-tag` (tag 'X' button) likely need updating to position correctly relative to the tag `<button>` element (potentially requiring `position: relative` on the tag button and `position: absolute` on the 'X').

### `directory.js`

*   **General:**
    *   Increased use of optional chaining (`?.`) for robustness against missing elements.
    *   Added extensive verbose logging (`logVerbose`, `logInfo`, `logError`) in key functions (`attachHideButtonToCard`, `removeDirectoryItem`, `isBlacklistedItem`, `read...` functions, event handlers) to aid debugging the hiding and filtering process.
*   **`getDirectoryItemNodes(mode)`:**
    *   Updated selectors for Stream Cards (on game/channel/etc. pages) to target the main container `div.Layout-sc-1xcs6mc-0.jCGmCy`.
    *   Updated selectors for Category Cards (on categories page) to target the main container `div.Layout-sc-1xcs6mc-0.ScTowerItem-sc-1sjzzes-2`.
    *   Added placeholder comments indicating where selectors for VOD and Clip cards will be needed.
    *   Adjusted logic to handle the `mode` suffix correctly with the new container selectors.
*   **`getSidebarItemNodes(mode)`:**
    *   Updated selectors to target the main container `div.Layout-sc-1xcs6mc-0.cwtKyw.side-nav-card` for both expanded and collapsed views.
    *   Added specific logic to query within the `div[aria-label="Recommended Channels"]` section when `mode` is 'recommended'.
*   **`readItem(containerNode)`:**
    *   Updated to expect the container node as input.
    *   Added logic to determine item type (stream, category) based on container node's classes/structure.
    *   Passes both the `containerNode` and the found primary `linkNode` to the appropriate `readChannel` or `readCategory` function.
    *   Includes placeholder comments for VOD/Clip type detection.
*   **`readChannel(containerNode, linkNode, ...)`:**
    *   Updated function signature to accept `containerNode` and `linkNode`.
    *   Revised channel name selector to target `p[title]` within `div.Layout-sc-1xcs6mc-0.xxjeD`.
    *   Revised title selector to target `p[title]` within `div.Layout-sc-1xcs6mc-0.fAVISI`.
    *   Updated logic to find the tag container: `containerNode.querySelector('.Layout-sc-1xcs6mc-0.fAVISI .InjectLayout-sc-1i43xsx-0')`.
    *   Added verbose logging for extracted data.
*   **`readCategory(containerNode, linkNode, ...)`:**
    *   Updated function signature to accept `containerNode` and `linkNode`.
    *   Revised category name selector to target `h3[title]` within the `article`.
    *   Updated logic to find the tag container: `containerNode.querySelector('article .Layout-sc-1xcs6mc-0.fLNVxt')`.
*   **`readTags(tagContainerNode)`:**
    *   Updated to expect the specific tag container `div` as input.
    *   Revised selector to find `button.tw-tag[data-a-target]`.
    *   Kept logic for extracting `data-a-target` attribute.
    *   Added verbose logging.
*   **`readSidebarItem(containerNode, ...)`:**
    *   Major refactor: Now checks for sidebar collapsed state (`.side-nav--collapsed`) first.
    *   Calls `readCollapsedSidebarItem` helper function if collapsed.
    *   If expanded, attempts to find `a.side-nav-card__link` and proceeds with previous logic (selectors confirmed as mostly correct for expanded view). Logs error if link not found in expanded view.
*   **`readCollapsedSidebarItem(node)`:**
    *   Added/Refined helper function to handle collapsed sidebar items.
    *   Attempts to find the link node (container or first `a`).
    *   Extracts name using `aria-label` (on link or avatar) or `alt` (on image) as priority, falling back to href parsing. Includes cleanup for tooltip text.
    *   *Note: Still requires HTML snippet of collapsed sidebar for full verification.*
*   **`removeDirectoryItem(item)`:**
    *   Changed from setting inline `style.display` to using `containerNode.classList.add('uttv-hidden-item')`.
    *   Ensures `data-uttv-hidden` attribute is set on the container.
    *   Added verbose logging, including a check of `computedStyle` after adding the class to verify hiding.
*   **`removeSidebarItem(item)`:**
    *   Changed from setting inline `style.display` to using `containerNode.classList.add('uttv-hidden-item')`.
    *   Ensures `data-uttv-hidden` attribute is set on the container.
*   **`attachHideButtonToCard(item)`:**
    *   Updated to append the 'X' button to the `item.containerNode`.
    *   Requires `position: relative` on the container (added via JS).
    *   **Modified Event Listener:** The listener attached to the 'X' button now:
        *   Finds the correct `containerNode` (including traversal fallback).
        *   *Immediately* adds the `.uttv-hidden-item` class and `data-uttv-hidden` attribute to the container for instant visual feedback.
        *   Logs success/failure of the immediate hide based on `computedStyle`.
        *   Calls `onHideItem` asynchronously to update the blacklist.
    *   Added verbose logging for debugging the click and immediate hide process.
*   **`attachHideButtonsToTags(tags, tagContainerNode)`:**
    *   Updated function signature to accept the array of tag objects and the tag container node.
    *   Appends the 'X' button directly as a child of each tag `<button>` element.
    *   Requires `position: relative` on the tag button (added via JS).
    *   *Note: CSS adjustments in `directory.css` are needed for positioning.*
*   **`addManagementButton()`:**
    *   Slightly adjusted parent node targeting logic for different page types for potentially better robustness.
*   **`isBlacklistedItem(item)`:**
    *   Added verbose logging showing the item details being checked and which rule (Name, Category, Tag, Title, Rerun) caused a match.
*   **Event Handlers (`onPageChange`, `onScroll`, `onHideItem`, `onHideTag`)**:
    *   Minor logic adjustments for clarity and robustness.
    *   Updated `onHideItem`/`onHideTag` to work with data passed from modified button listeners.