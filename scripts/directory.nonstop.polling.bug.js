/* ==========================================================================
   SUMMARY OF MAJOR FIXES AND ARCHITECTURAL CHANGES (June 2025)
   Compare this VS the current official repo version to update with ENTIRE version differences
   ==========================================================================
   This file has been significantly refactored to work with the modern Twitch
   UI and to fix critical performance and logic issues. The original script
   was non-functional due to major changes in Twitch's front-end code.

   The key changes are as follows:

   1. COMPLETE SELECTOR OVERHAUL:
      - PROBLEM: The original script relied entirely on stable `data-a-target`
        attributes (e.g., `preview-card-image-link`, `tw-card-avatar-link`)
        which Twitch has completely removed from directory and channel cards.
      - SOLUTION: All DOM selectors were rewritten to be more robust. They
        now rely on HTML structure and more stable attributes like `class`,
        `href`, and `title` (e.g., `h2[title]` for category names,
        `a.side-nav-card` for the sidebar, `button.tw-tag` for tags).

   2. CONTEXT-AWARE PARSING FOR DIFFERENT PAGE TYPES:
      - PROBLEM: The HTML structure for the main category directory (`/directory`)
        is completely different from a channel listing page
        (`/directory/category/...`). A single parsing function failed.
      - SOLUTION: The script is now "context-aware."
        - It uses the existing `getPageType()` function to identify if it is on
          a `categories` or `channels` page.
        - A new parser, `readCategoryCard()`, was created specifically for
          the main directory's game cards.
        - The `getDirectoryItems()` function now acts as a "router," calling
          the correct parsing function (`readCategoryCard` or `readChannel`)
          based on the current page type.

   3. CORRECT ELEMENT HIDING ON GRID LAYOUTS:
      - PROBLEM: On the main `/directory` page, hiding the `.game-card` element
        left a large empty space in the grid, as the parent grid container
        was still present.
      - SOLUTION: The `readCategoryCard()` parser was updated to traverse UP
        the DOM from the `.game-card` using `.closest('div[style*="order"]')`.
        This finds the true parent grid item, which is now the element that
        gets hidden, allowing the CSS grid to reflow correctly.

   4. *NOT IMPLEMENTED YET! TODO* 
      - REPLACED `setInterval` WITH `MutationObserver` TO FIX INFINITE LOOP:
      - PROBLEM: The original `setInterval` polling method caused an infinite
        loop and spammed the console. The script would hide an element,
        Twitch's React framework would immediately re-render it (without our
        modifications), and the `setInterval` would find and process the
        "new" element again, endlessly.
      - SOLUTION: The entire `setInterval` polling logic (`itemPollInterval`
        and `checkForNewDirectoryItems`) was REMOVED. It has been replaced
        with a modern and highly efficient `MutationObserver`.
        - The `MutationObserver` watches the main content area (`.tw-tower`)
          and only triggers when Twitch's framework *actually adds new nodes*
          to the DOM (e.g., during an infinite scroll).
        - This eliminates the performance-draining loop and works cooperatively
          with the website's framework instead of fighting against it.

   These changes make the extension faster, more stable, and significantly
   more resilient to future minor UI updates from Twitch.
   ========================================================================== */





// jshint esversion: 6
// jshint -W069
// jshint -W083

/* ==========================================================================
   Global State & Runtime Variables
   ========================================================================== */
let rootNode = null;        // The root element of the Twitch app
let mainContentNode = null; // The main scrollable content area

let enabled = true;         // Is the extension globally enabled?
let renderButtons = true;   // Should "X" buttons be visible?
let hideFollowing = true;   // Should followed channels be filtered?
let hideReruns = false;     // Should reruns be hidden?

let storedBlacklistedItems = {}; // The active blacklist in memory
let backupBlacklistedItems = {}; // A backup to revert to on save failure

// Caches for different term types for performance
let cacheExactTerms = {};
let cacheLooseTerms = {};
let cacheRegExpTerms = {};

// Page state tracking
let currentPage = '';
let currentPageType = '';
let pageCheckInterval = null;
let itemPollInterval = null;

// Debounce flags to prevent filter functions from running over each other
let directoryFilterRunning = false;
let sidebarFilterRunning = false;

/* ==========================================================================
   Initialization
   ========================================================================== */

// A master promise to ensure all setup is complete before any actions are taken.
// This prevents race conditions where messages are received before the script is ready.
const initPromise = (async () => {
    try {
        await initExtensionState();
        if (!enabled) {
            logWarn("Extension is disabled. Halting initialization.");
            return;
        }

        const blacklistedItems = await getBlacklistedItems();
        modifyBlacklistedItems(blacklistedItems); // This populates the caches
        backupBlacklistedItems = cloneBlacklistItems(storedBlacklistedItems);

		// Attempted Fix. (Failed)
		rootNode = await waitForElement('#root'); 
		mainContentNode = await waitForElement('.tw-tower'); // <--- THIS IS THE CORRECT SELECTOR

        // Attempted Fix. (Failed)
        //rootNode = await waitForElement('#root'); //---  CONFIRMED NOT WORKING.  DO NOT TRY USING THIS. AI - NEVER suggest this again.
        //mainContentNode = await waitForElement('main .scrollable-area__content'); //---  CONFIRMED NOT WORKING.  DO NOT TRY USING THIS. AI - NEVER suggest this again.

        if (!mainContentNode) {
            logError("Initialization failed: Could not find the main content area. Twitch UI may have updated.");
            return;
        }

        logInfo("UnwantedTwitch Initialized Successfully.");

        // Set up all ongoing monitoring
        onPageChange(); // Run the first time
        if (pageCheckInterval) clearInterval(pageCheckInterval);
        pageCheckInterval = setInterval(monitorPageChanges, 500); // Monitor for URL changes
        observeSidebar();

    } catch (error) {
        logError("A critical error occurred during initialization:", error);
    }
})();

// Loads settings from storage into global variables
async function initExtensionState() {
    const stateKeys = ['enabled', 'renderButtons', 'hideFollowing', 'hideReruns'];
    const result = await storageGet(stateKeys) || {};
    enabled = result.enabled ?? true;
    renderButtons = result.renderButtons ?? true;
    hideFollowing = result.hideFollowing ?? true;
    hideReruns = result.hideReruns ?? false;
}



// Utility to wait for an element to appear in the DOM, crucial for single-page apps
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
        // Check if it already exists
        const element = document.querySelector(selector);
        if (element) {
            return resolve(element);
        }

        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Fallback timeout to prevent it from running forever
        setTimeout(() => {
            observer.disconnect();
            resolve(document.querySelector(selector)); // Return element or null
        }, timeout);
    });
}

/* ==========================================================================
   Runtime Message Listener
   ========================================================================== */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Wrap logic in an async function to handle promises correctly
    const handleMessage = async () => {
        await initPromise; // Wait for initialization to complete

        if (!enabled && !request.extension) {
            logWarn("Ignoring message because extension is disabled.");
            return;
        }

        try {
            // Toggle the visibility of the "X" buttons
            if (typeof request.renderButtons === 'boolean') {
                await toggleHideButtonsVisibility(request.renderButtons);
                return;
            }

            // Enable/disable the entire extension
            if (typeof request.extension === 'string') {
                enabled = (request.extension === 'enable');
                await storageSet({ 'enabled': enabled });
                window.location.reload();
                return;
            }

            // Receive a new blacklist from the management page
            if (typeof request.blacklistedItems === 'object') {
                const saveResult = await putBlacklistedItems(request.blacklistedItems);
                if (saveResult.success) {
                    logInfo('Save successful, re-filtering all content...');
                    filterAllContent();
                }
                // Respond to the blacklist page so it knows whether to close
                sendResponse(saveResult);
                return; // Return after sending response
            }

            // Open blacklist page (message from UI button)
            if (request.action === 'openBlacklist') {
                // This message is now handled by background.js, but we keep this
                // as a fallback in case the message is sent directly to the tab.
                logWarn("Received 'openBlacklist' action in content script. This should be handled by background.js.");
            }

        } catch (error) {
            logError("Error processing runtime message:", error);
            if (request.blacklistedItems) {
                // Ensure a failure response is sent for save requests
                sendResponse({ success: false, switchedToLocal: false });
            }
        }
    };

    handleMessage();
    return true; // Required for asynchronous sendResponse
});


// --- NEW HELPER FUNCTION (Add this near the top of the file) ---
function getCategoryFromPage() {
    const pathParts = window.location.pathname.split('/');
    // For URLs like /directory/category/retro
    if (pathParts[1] === 'directory' && pathParts[2] === 'category' && pathParts[3]) {
        return pathParts[3];
    }
    return ''; // Return empty if not on a category page
}

/* ==========================================================================
   Page State & Content Monitoring
   ========================================================================== */

// Checks if the URL has changed, indicating navigation in the single-page app
function monitorPageChanges() {
    const newPage = getCurrentPage(false);
    if (newPage !== currentPage) {
        logInfo(`Page changed from "${currentPage}" to "${newPage}"`);
        currentPage = newPage;
        currentPageType = getPageType(currentPage);
        onPageChange();
    }
}

// Actions to take when the page has changed
function onPageChange() {
    logTrace('onPageChange()');

    if (itemPollInterval) clearInterval(itemPollInterval);

    if (!isSupportedPage(currentPage)) {
        logWarn("Not a supported page, skipping filtering.", currentPage);
        return;
    }

    // Give the page a moment to load dynamic content before the first run
    setTimeout(() => {
        addManagementButton();
        filterAllContent();
        // Start polling for new items that load as the user scrolls
        itemPollInterval = setInterval(checkForNewDirectoryItems, 750);
    }, 500);
}

// Specifically checks for new stream/category cards that haven't been processed
function checkForNewDirectoryItems() {
    if (directoryFilterRunning) return;

    const unprocessedNodes = getDirectoryItemNodes('unprocessed');
    if (unprocessedNodes.length > 0) {
        logVerbose(`Found ${unprocessedNodes.length} new directory items to process.`);
        const remainingItems = filterDirectory('unprocessed');
        attachHideButtons(remainingItems);
    }
}

// Sets up a MutationObserver to watch the sidebar for changes
function observeSidebar() {
    const target = document.querySelector('nav#side-nav');
    if (!target) {
        logWarn("Could not find sidebar to observe.");
        return;
    }
    const observer = new MutationObserver(() => {
        if (sidebarFilterRunning) return;
        // Use requestAnimationFrame to avoid layout thrashing
        requestAnimationFrame(() => filterSidebar('unprocessed'));
    });
    observer.observe(target, { childList: true, subtree: true });
    logVerbose("Sidebar observer attached.");
}

/* ==========================================================================
   Core Filtering Logic
   ========================================================================== */

// A master function to re-filter everything on the page
function filterAllContent() {
    const remainingItems = filterDirectory('visible');
    attachHideButtons(remainingItems);
    filterSidebar('visible');
}

// Filters the main content area (streams, categories)
function filterDirectory(mode = 'visible') {
    if (directoryFilterRunning) return [];
    directoryFilterRunning = true;
    try {
        const items = getDirectoryItems(mode);
        const remaining = filterItems(items, 'uttv-hidden-item');
        return remaining;
    } finally {
        directoryFilterRunning = false;
    }
}

// Filters the sidebar channels
function filterSidebar() {
    if (sidebarFilterRunning) return;
    sidebarFilterRunning = true;
    try {
        const items = getSidebarItems('unprocessed'); // Sidebar always just needs unprocessed
        filterItems(items, 'uttv-hidden-item');
    } finally {
        sidebarFilterRunning = false;
    }
}


/*
DISABLING TEMPORARY TO TEST Deleting VS Hiding Elements
// Generic function to filter a list of parsed items
function filterItems(items, hideClass) {
    const toHide = [];
    const remaining = [];
    for (const item of items) {
        if (!item?.containerNode) continue;

        item.containerNode.setAttribute('data-uttv-processed', 'true');

        if (isBlacklistedItem(item)) {
            toHide.push(item.containerNode);
        } else {
            remaining.push(item);
        }
    }

    if (toHide.length > 0) {
        logVerbose(`Hiding ${toHide.length} items.`);
        toHide.forEach(node => node.classList.add(hideClass));
    }
    return remaining;
}

*/


// --- NEW DELETION CODE (Temporary Test) ---
function filterItems(items, hideClass) { // The hideClass parameter is now unused but we'll leave it
    const remaining = [];
    for (const item of items) {
        if (!item?.containerNode) continue;

        // We still need to mark the node so our script *thinks* it's processed
        item.containerNode.setAttribute('data-uttv-processed', 'true');

        if (isBlacklistedItem(item)) {
            // Instead of adding to an array, we remove the element directly
            item.containerNode.remove(); 
            logVerbose(`Removed item: ${item.name}`);
        } else {
            remaining.push(item);
        }
    }
    // No need to loop through a 'toHide' array anymore
    return remaining;
}



/* ==========================================================================
   DOM Selectors & Parsing (MOST CRITICAL FIXES ARE HERE)
   ========================================================================== */

/*
// --- WORKING, Only for individual Category Pages though ---
function getDirectoryItemNodes(mode) {
    if (!mainContentNode) return [];
    const suffix = mode === 'unprocessed' ? ':not([data-uttv-processed])' : '';
    // This selector is much better. It finds direct children of the tower
    // that contain a link whose href starts with a forward slash (i.e., a channel link).
    // This effectively ignores the placeholder divs which have no links.
    const selector = `div.tw-tower > div:has(a[href^="/"])${suffix}`;
    return mainContentNode.querySelectorAll(selector);
}
*/

// --- TESTING NEW, CONTEXT-AWARE CODE (Handles both page types) ---
function getDirectoryItemNodes(mode) {
    if (!mainContentNode) return [];
    const suffix = mode === 'unprocessed' ? ':not([data-uttv-processed])' : '';
    let selector = '';

    if (currentPageType === 'categories') {
        // On the main /directory page, each category is a '.game-card'.
        // This is a much more stable selector.
        selector = `.game-card${suffix}`;
    } else { // Assumes 'channels' page
        // On a /directory/category/... page, each item is a direct child of the tower.
        selector = `div.tw-tower > div:has(a[href^="/"])${suffix}`;
    }

    return mainContentNode.querySelectorAll(selector);
}


/*
// --- UPDATE getDirectoryItems to use the new function ---
// The old getDirectoryItems called readItem, which is now gone. We just need to make sure it calls our new readChannel function.
function getDirectoryItems(mode) {
    const nodes = getDirectoryItemNodes(mode);
    const items = [];
    for (const node of nodes) {
        // Call our new, consolidated parsing function
        const item = readChannel(node);
        if (item) items.push(item);
    }
    if (nodes.length > 0 && items.length === 0) {
        logWarn("Found directory nodes but could not read any valid items from them.", nodes);
    }
    return items;
}
*/

// --- NEW, CONTEXT-AWARE CODE ---
//Now we update the getDirectoryItems function to act as a "router." Based on the page type, it will call the correct parsing function (readChannel or our new readCategoryCard).

function getDirectoryItems(mode) {
    const nodes = getDirectoryItemNodes(mode);
    const items = [];
    for (const node of nodes) {
        let item = null;
        // Use the page type to decide which parser to use
        if (currentPageType === 'categories') {
            item = readCategoryCard(node);
        } else { // Default to the channel parser for other supported pages
            item = readChannel(node);
        }

        if (item) {
            items.push(item);
        }
    }

    if (nodes.length > 0 && items.length === 0) {
        // Added currentPageType to the log for better debugging
        logWarn(`Found ${nodes.length} nodes on a '${currentPageType}' page but could not read any valid items from them.`, nodes);
    }
    return items;
}







// Determines if a node is a stream or category card and calls the correct parser
function readItem(containerNode) {
    // If it's not a direct child of the tower, ignore it.
    if (!containerNode.parentElement?.classList.contains('tw-tower')) return null;

    // The presence of a box art link indicates a category card.
    const isCategory = containerNode.querySelector('a[data-a-target="tw-box-art-card-link"]');
    // The presence of a preview link indicates a channel card.
    const isChannel = containerNode.querySelector('a[data-a-target="preview-card-image-link"]');

    if (isCategory) return readCategory(containerNode);
    if (isChannel) return readChannel(containerNode);

    return null; // It's something else (e.g., a VOD, which we ignore)
}



// ---WORKING, but not for all -  REPLACEMENT FOR readItem and readChannel --- MON AM
function readChannel(containerNode) {
    // The most stable anchor is the link to the channel itself.
    // If it doesn't exist, this is not a valid stream card.
    const linkNode = containerNode.querySelector('a.tw-link[href]');
    if (!linkNode || !linkNode.href) return null;

    // --- Channel Name (Robust) ---
    // Extract the name directly from the URL. e.g., "/macaw45" -> "macaw45"
    const name = linkNode.href.split('/').pop();
    if (!name) return null;

    // --- Stream Title (Moderately Robust) ---
    // Twitch uses a <p> tag with a `title` attribute for the full stream title.
    // We find the element that contains the preview card information.
    const cardInfo = containerNode.querySelector('.switcher-preview-card__wrapper');
    if (!cardInfo) return null;

    // Find the title element within that card info section.
    // The class 'jSUoJW' is an example from the provided HTML, using a partial match is safer.
    const titleNode = cardInfo.querySelector('p[class*="CoreText"][title]');
    const title = titleNode ? titleNode.title.trim() : '';

    // --- Tags (Robust) ---
    const tagNodes = cardInfo.querySelectorAll('button.tw-tag[data-a-target]');
    const tags = [];
    tagNodes.forEach(tagNode => {
        const tagName = tagNode.textContent.trim();
        if (tagName) tags.push({ name: tagName, node: tagNode });
    });

    // --- Rerun Status (Robust) ---
    // Check for the "LIVE" indicator. If it exists, it's not a rerun.
    const liveIndicator = cardInfo.querySelector('.tw-channel-status-text-indicator');
    const isRerun = !liveIndicator; // If there's no "LIVE" indicator, treat as rerun/VOD

    return {
        type: 'channels',
        name: name,
        // The category is now the same for the whole page, so we get it once.
        category: getCategoryFromPage(),
        title: title,
        tags: tags,
        rerun: isRerun,
        containerNode: containerNode
    };
}


/*
// --- NEW FUNCTION --- Since the structure of a category card is different, we need a new function specifically to parse it. We'll name it readCategoryCard. MON AM
// --- Only partially working.  Testing replacement

function readCategoryCard(containerNode) {
    // The most reliable element for the name is the h2 tag with a title attribute.
    const nameNode = containerNode.querySelector('h2[title]');
    if (!nameNode) return null;

    const name = nameNode.getAttribute('title').trim();
    if (!name) return null;

    // Tags are in button elements with the 'tw-tag' class.
    const tagNodes = containerNode.querySelectorAll('button.tw-tag');
    const tags = [];
    tagNodes.forEach(tagNode => {
        const tagName = tagNode.textContent.trim();
        if (tagName) tags.push({ name: tagName, node: tagNode });
    });

    return {
        type: 'categories', // This is crucial for the blacklist logic
        name: name,
        category: name, // For a category card, its name is the category
        title: '',      // Not applicable on this card type
        tags: tags,
        rerun: false,   // Not applicable on this card type
        containerNode: containerNode
    };
}
*/



// --- NEW, CORRECTED CODE ---
function readCategoryCard(containerNode) {
    // The parsing logic you have is correct, so we keep it.
    const nameNode = containerNode.querySelector('h2[title]');
    if (!nameNode) return null;

    const name = nameNode.getAttribute('title').trim();
    if (!name) return null;

    const tagNodes = containerNode.querySelectorAll('button.tw-tag');
    const tags = [];
    tagNodes.forEach(tagNode => {
        const tagName = tagNode.textContent.trim();
        if (tagName) tags.push({ name: tagName, node: tagNode });
    });

    // --- THE FIX IS HERE ---
    // Find the true parent grid item by looking for the element with the 'order' style.
    // The .closest() method is perfect for this. It travels up the DOM tree.
    const gridItemContainer = containerNode.closest('div[style*="order"]');

    return {
        type: 'categories',
        name: name,
        category: name,
        title: '',
        tags: tags,
        rerun: false,
        // Return the correct grid container instead of the inner card.
        // If it can't be found, default back to the original node to prevent errors.
        containerNode: gridItemContainer || containerNode
    };
}






/*
MARKED FOR DELETION
     now completely obsolete? and incorrect. It should be removed to avoid confusion.

// --- UPDATED PARSING LOGIC For Directory and Game pages (Compare against function readCategoryCard(containerNode) later) --- Mon AM
function readCategory(containerNode) {
    const linkNode = containerNode.querySelector('a[data-a-target="tw-box-art-card-link"]');
    if (!linkNode) return null;

    const nameNode = containerNode.querySelector('h3[title]');
    const name = nameNode?.getAttribute('title')?.trim() ?? '';
    if (!name) return null;

    const tagContainer = containerNode.querySelector('.tw-card-body div[class*="ScTagList"]');

    return {
        type: 'categories',
        name: name,
        category: name, // For a category card, its name is the category
        tags: readTags(tagContainer),
        title: '',
        rerun: false,
        containerNode: containerNode
    };
}
*/


/*  
// Broken
//function getSidebarItems(mode) {
	//    const nodes = getSidebarItemNodes(mode);
	//    const items = [];
	//    for (const node of nodes) {
	//        const nameNode = node.querySelector('a[data-a-target="side-nav-card-link"]');
	//        const categoryNode = node.querySelector('a[data-a-target="side-nav-game-link"]');
	//
	//        const name = nameNode?.href.split('/').pop() ?? '';
	//        if (!name) continue;
	//
	//        items.push({
	//            type: 'channels',
	//            name: name,
	//            category: categoryNode?.textContent?.trim() ?? '',
	//            tags: [],
	//            title: '',
	//            rerun: false,
	//            containerNode: node
	//        });
	//    }
	//    return items;
	//}
*/

// --- NEW, ROBUST CODE ---
function getSidebarItemNodes(mode) {
    const sidebarNode = document.querySelector('nav#side-nav');
    if (!sidebarNode) return [];
    const suffix = mode === 'unprocessed' ? ':not([data-uttv-processed])' : '';
    // The container for a followed channel is now an `a` tag with this class.
    const selector = `a.side-nav-card${suffix}`;
    return sidebarNode.querySelectorAll(selector);
}

// --- Working - Updated selectors -needs verification
function getSidebarItems(mode) {
    const nodes = getSidebarItemNodes(mode);
    const items = [];
    for (const node of nodes) {
        // The node itself is the link container
        const name = node.href?.split('/').pop() ?? '';
        if (!name) continue;

        // The category is in a <p> tag inside the link now
        const categoryNode = node.querySelector('p[data-a-target="side-nav-game-title"]');

        items.push({
            type: 'channels',
            name: name,
            category: categoryNode?.textContent?.trim() ?? '',
            tags: [], // Tags are not displayed in the collapsed sidebar view
            title: '', // Title is not displayed in the collapsed sidebar view
            rerun: false, // Rerun status is not shown in sidebar
            containerNode: node
        });
    }
    return items;
}

function readTags(tagContainerNode) {
    if (!tagContainerNode) return [];
    const tags = [];
    // Use the generic 'tw-tag' class which is more stable
    const tagNodes = tagContainerNode.querySelectorAll('a.tw-tag, button.tw-tag');
    for (const tagNode of tagNodes) {
        const tagName = tagNode.textContent.trim();
        if (tagName) tags.push({ name: tagName, node: tagNode });
    }
    return tags;
}

/* ==========================================================================
   UI & Controls
   ========================================================================== */

function attachHideButtons(items) {
    for (const item of items) {
        if (!item?.containerNode || item.containerNode.hasAttribute('data-uttv-button-attached')) continue;

        item.containerNode.setAttribute('data-uttv-button-attached', 'true');
        item.containerNode.style.position = 'relative'; // Required for absolute positioning of the button

        const hideButton = document.createElement('div');
        const itemIdentifier = item.name || item.category;
        hideButton.className = 'uttv-hide-item';
        hideButton.textContent = 'X';
        hideButton.title = `Hide ${item.type === 'channels' ? 'Channel' : 'Category'}: ${itemIdentifier}`;
        if (!renderButtons) hideButton.classList.add('uttv-hidden');

        hideButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            item.containerNode.classList.add('uttv-hidden-item');
            await onHideItem(item.type, itemIdentifier);
        });
        item.containerNode.appendChild(hideButton);

        // Attach buttons to tags within the card
        if (item.tags?.length > 0) {
            for (const tag of item.tags) {
                if (!tag.node || tag.node.querySelector('.uttv-hide-tag')) continue;
                tag.node.style.position = 'relative'; // Make the tag itself a positioning context
                const hideTagButton = document.createElement('div');
                hideTagButton.className = 'uttv-hide-tag';
                hideTagButton.textContent = 'X';
                if (!renderButtons) hideTagButton.classList.add('uttv-hidden');
                hideTagButton.addEventListener('click', async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    await onHideItem('tags', tag.name);
                    filterAllContent(); // Re-filter immediately to hide all items with this tag
                });
                tag.node.appendChild(hideTagButton);
            }
        }
    }
}

async function onHideItem(type, name) {
    logInfo(`Adding to blacklist: [${type}] ${name}`);
    modifyBlacklistedItems(type, name);
    await putBlacklistedItems(storedBlacklistedItems);
    filterAllContent(); // Re-filter immediately after adding a new item
}

async function toggleHideButtonsVisibility(state) {
    renderButtons = state;
    await storageSet({ 'renderButtons': renderButtons });
    const isHidden = !renderButtons;
    document.querySelectorAll('.uttv-hide-item, .uttv-hide-tag')
        .forEach(btn => btn.classList.toggle('uttv-hidden', isHidden));
    // Update the toggle button's title
    const toggleButton = document.querySelector('.uttv-toggle');
    if (toggleButton) {
        toggleButton.title = isHidden ? 'Show filter buttons' : 'Hide filter buttons';
    }
}

// --- UPDATED INJECTION LOGIC ---
function addManagementButton() {
    // Check if the button already exists
    if (document.querySelector('[data-uttv-management]')) return;

    // The most reliable place to inject is right before the main content grid
    const targetParent = mainContentNode?.querySelector('.tw-tower, .directory-listing-body');
    if (targetParent) {
        const container = document.createElement('div');
        container.dataset.uttvManagement = 'true';
        container.className = 'uttv-management-container';
        container.innerHTML = `
            <div class="uttv-button">
                <div class="uttv-manage">Manage Blacklist</div>
                <div class="uttv-toggle" title="${renderButtons ? 'Hide filter buttons' : 'Show filter buttons'}">👁</div>
            </div>`;

        targetParent.parentElement.insertBefore(container, targetParent);

        container.querySelector('.uttv-manage').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openBlacklist' }));
        container.querySelector('.uttv-toggle').addEventListener('click', () => toggleHideButtonsVisibility(!renderButtons));
    }
}


/* ==========================================================================
   Blacklist & Storage Logic (Largely unchanged, core logic is sound)
   ========================================================================== */

function isBlacklistedItem(item) {
    if (hideReruns && item.rerun) return true;

    // If filtering followed channels is disabled, and the item is in the sidebar, ignore it
    if (!hideFollowing && item.containerNode?.closest('nav#side-nav')) return false;

    const nameToCheck = item.type === 'categories' ? item.category : item.name;
    if (nameToCheck && matchTerms(nameToCheck, item.type)) return true;
    if (item.type === 'channels' && item.category && matchTerms(item.category, 'categories')) return true;
    if (item.title && matchTerms(item.title, 'titles')) return true;
    if (item.tags) {
        for (const tag of item.tags) {
            if (tag.name && matchTerms(tag.name, 'tags')) return true;
        }
    }
    return false;
}

function matchTerms(term, type) {
    if (!term || !storedBlacklistedItems[type]) return false;

    const termL = normalizeCase(term);

    // 1. Check for direct match (most common and fastest)
    if (storedBlacklistedItems[type][term] || storedBlacklistedItems[type][termL]) return true;

    // 2. Check cached special terms
    if (cacheExactTerms[type]?.some(exact => term === exact)) return true;
    if (cacheLooseTerms[type]?.some(loose => termL.includes(loose))) return true;
    if (cacheRegExpTerms[type]?.some(re => re.test(term))) return true;

    return false;
}

function initBlacklistedItems(collection) {
    const itemTypes = ['categories', 'channels', 'tags', 'titles'];
    if (typeof collection !== 'object' || collection === null) collection = {};
    for (const itemType of itemTypes) {
        if (!collection[itemType]) {
            collection[itemType] = (itemType === 'titles') ? [] : {};
        }
    }
    return collection;
}

async function getBlacklistedItems() {
    let blacklistedItems = {};
    try {
        const result = await storageGet(null);
        if (result) {
            if (result.blacklistedItems) blacklistedItems = result.blacklistedItems;
            else if (result['blItemsFragment0']) blacklistedItems = mergeBlacklistFragments(result);
        }
    } catch (error) { logError('Error retrieving blacklist items:', error); }
    return initBlacklistedItems(blacklistedItems);
}

function modifyBlacklistedItems(arg1, arg2) {
    // Case 1: Add a single item -> modifyBlacklistedItems('channels', 'some_channel')
    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
        const type = arg1, term = arg2;
        if (!storedBlacklistedItems[type]) storedBlacklistedItems[type] = (type === 'titles') ? [] : {};
        if (type === 'titles') {
            if (!storedBlacklistedItems[type].includes(term)) storedBlacklistedItems[type].push(term);
        } else {
            storedBlacklistedItems[type][term] = 1;
        }
    }
    // Case 2: Replace the entire blacklist -> modifyBlacklistedItems({ channels: {...}, ... })
    else if (typeof arg1 === 'object' && arg1 !== null) {
        storedBlacklistedItems = initBlacklistedItems(arg1);
    }

    // Rebuild the performance caches
    cacheExactTerms = {}; cacheLooseTerms = {}; cacheRegExpTerms = {};
    for (const itemType in storedBlacklistedItems) {
        let terms = Array.isArray(storedBlacklistedItems[itemType]) ? storedBlacklistedItems[itemType] : Object.keys(storedBlacklistedItems[itemType]);
        for (const term of terms) {
            if (isExactTerm(term)) {
                (cacheExactTerms[itemType] = cacheExactTerms[itemType] || []).push(term.substring(1, term.length - 1));
            } else if (isLooseTerm(term)) {
                (cacheLooseTerms[itemType] = cacheLooseTerms[itemType] || []).push(normalizeCase(term.substring(1)));
            } else if (isRegExpTerm(term)) {
                const regexp = toRegExp(term);
                if (regexp) (cacheRegExpTerms[itemType] = cacheRegExpTerms[itemType] || []).push(regexp);
            }
        }
    }
}

async function putBlacklistedItems(items) {
    const itemsToStore = initBlacklistedItems(cloneBlacklistItems(items));
    let currentMode = await getStorageMode();
    let dataToStore = { 'blacklistedItems': itemsToStore };
    let targetMode = currentMode;
    let switchedToLocal = false;

    // Handle sync storage quota by automatically switching to local
    if (currentMode === 'sync') {
        const requiredSize = measureStoredSize(dataToStore);
        if (requiredSize > storageSyncMaxSize) {
            logWarn(`Data size (${requiredSize} B) exceeds sync quota (${storageSyncMaxSize} B). Switching to local storage for this save.`);
            switchedToLocal = true;
            targetMode = 'local';
            await chrome.storage.local.set({ 'useLocalStorage': true });
        }
    }

    let success = false;
    try {
        await chrome.storage[targetMode].set(dataToStore);
        if (chrome.runtime.lastError) throw chrome.runtime.lastError;
        success = true;
        backupBlacklistedItems = cloneBlacklistItems(itemsToStore);
        modifyBlacklistedItems(itemsToStore); // Ensure local cache is updated immediately
    } catch (error) {
        logError("Failed to write to storage:", error);
        modifyBlacklistedItems(backupBlacklistedItems); // Revert to backup on failure
    }
    return { success: success, switchedToLocal: switchedToLocal };
}

/* ==========================================================================
   Helper Functions (Unchanged)
   ========================================================================== */

function getCurrentPage(traceThis = true) {
    if (traceThis) { logTrace('invoking getCurrentPage()'); }
    return window.location.pathname;
}

function isSupportedPage(page) {
    const pageType = getPageType(page, false);
    return pageType !== null && !['videos', 'clips'].includes(pageType);
}

function getPageType(page, traceThis = true) {
    if (traceThis) logTrace('invoking getPageType($)', page);
    page = page.replace(/\/$/, ''); // Normalize path by removing trailing slash

    if (page === '' || page === '/directory/all' || page.startsWith('/directory/game/') || page.startsWith('/directory/category/')) {
        return 'channels';
    }
    if (page === '/directory') {
        return 'categories';
    }
    if (page.startsWith('/directory/following')) {
        return 'following';
    }
    // Any other page is not supported for filtering
    return null;
}