/**
 * @file This is the primary content script for the "Unwanted Twitch" extension.
 * @description This script is injected into all Twitch.tv pages and is responsible for the core filtering logic.
 * It monitors the page for changes, identifies stream and category cards, and hides them based on the user's
 * blacklist settings. It also adds the "Manage Blacklist" button and the individual "X" hide buttons to the UI.
 *
 * The script is designed to work with Twitch's dynamic, single-page application architecture. It uses
 * MutationObservers and polling to detect new content as it's loaded by the user scrolling or navigating.
 * It communicates with the background script and the blacklist page to receive updated settings and data.
 * @author Unwanted Twitch
 * @license MIT
 * @version 1.0.0
 */
// jshint esversion: 6
// jshint -W069
// jshint -W083

/* ==========================================================================
   Global State & Runtime Variables
   ========================================================================== */
/** @type {HTMLElement} The root element of the Twitch application. */
let rootNode = null;
/** @type {HTMLElement} The main scrollable content area where stream/category cards are displayed. */
let mainContentNode = null;

/** @type {boolean} Whether the extension is globally enabled. */
let enabled = true;
/** @type {boolean} Whether the "X" hide buttons should be rendered on cards. */
let renderButtons = true;
/** @type {boolean} Whether to filter channels the user is following (primarily for the sidebar). */
let hideFollowing = true;
/** @type {boolean} Whether to hide streams that are marked as reruns. */
let hideReruns = false;

/** @type {object} The active, in-memory representation of the user's blacklist. */
let storedBlacklistedItems = {};
/** @type {object} A backup of the blacklist, used to revert changes if a save operation fails. */
let backupBlacklistedItems = {};

// Caches for different term types for performance
/** @type {object} A cache of blacklist terms that require an exact, case-sensitive match. */
let cacheExactTerms = {};
/** @type {object} A cache of blacklist terms that require a loose, case-insensitive substring match. */
let cacheLooseTerms = {};
/** @type {object} A cache of blacklist terms that are regular expressions. */
let cacheRegExpTerms = {};

// Page state tracking
/** @type {string} The current URL path of the page. */
let currentPage = '';
/** @type {string} The type of the current page ('channels', 'categories', etc.). */
let currentPageType = '';
/** @type {number} An interval ID for periodically checking for page URL changes. */
let pageCheckInterval = null;
/** @type {number} An interval ID for polling for new directory items as the user scrolls. */
let itemPollInterval = null;

// Debounce flags to prevent filter functions from running over each other
/** @type {boolean} A flag to prevent the main directory filter from running concurrently. */
let directoryFilterRunning = false;
/** @type {boolean} A flag to prevent the sidebar filter from running concurrently. */
let sidebarFilterRunning = false;

/* ==========================================================================
   Initialization
   ========================================================================== */

/**
 * A master promise that ensures all asynchronous setup is complete before any filtering actions are taken.
 * This prevents race conditions, such as messages being received before the script has loaded its settings.
 * @type {Promise<void>}
 */
const initPromise = (async () => {
    try {
        await initExtensionState();
        if (!enabled) {
            logWarn("Extension is disabled. Halting initialization.");
            return;
        }

        const blacklistedItems = await getBlacklistedItems();
        modifyBlacklistedItems(blacklistedItems); // This populates the performance caches
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

/**
 * Loads the initial extension state (settings like 'enabled', 'hideReruns', etc.) from storage
 * and populates the global variables.
 * @returns {Promise<void>}
 */
async function initExtensionState() {
    const stateKeys = ['enabled', 'renderButtons', 'hideFollowing', 'hideReruns'];
    const result = await storageGet(stateKeys) || {};
    enabled = result.enabled ?? true;
    renderButtons = result.renderButtons ?? true;
    hideFollowing = result.hideFollowing ?? true;
    hideReruns = result.hideReruns ?? false;
}



/**
 * Waits for a specific element to appear in the DOM.
 * This is crucial for single-page applications like Twitch where content is loaded dynamically.
 * @param {string} selector - The CSS selector of the element to wait for.
 * @param {number} [timeout=10000] - The maximum time to wait in milliseconds.
 * @returns {Promise<Element|null>} A promise that resolves with the element once it's found, or null if it times out.
 */
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

/**
 * Listens for messages from other parts of the extension (e.g., background script, popup).
 * Handles requests to update settings, receive a new blacklist, or enable/disable the extension.
 * @listens chrome.runtime.onMessage
 */
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


/**
 * Gets the current category name from the URL.
 * This is used on channel list pages (e.g., `/directory/category/retro`) to identify the context.
 * @returns {string} The category name from the URL, or an empty string if not on a category page.
 */
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

/**
 * Checks if the URL has changed, and if so, triggers the `onPageChange` handler.
 * This is the primary mechanism for detecting navigation within the Twitch single-page app.
 */
function monitorPageChanges() {
    const newPage = getCurrentPage(false);
    if (newPage !== currentPage) {
        logInfo(`Page changed from "${currentPage}" to "${newPage}"`);
        currentPage = newPage;
        currentPageType = getPageType(currentPage);
        onPageChange();
    }
}

/**
 * Orchestrates the necessary actions when a page change is detected.
 * It stops any existing polling, checks if the new page is supported, and then
 * initializes filtering and continuous monitoring for the new page content.
 */
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

/**
 * Periodically checks for new, unprocessed stream or category cards that have been
 * loaded into the DOM (e.g., by scrolling down).
 */
function checkForNewDirectoryItems() {
    if (directoryFilterRunning) return;

    const unprocessedNodes = getDirectoryItemNodes('unprocessed');
    if (unprocessedNodes.length > 0) {
        logVerbose(`Found ${unprocessedNodes.length} new directory items to process.`);
        const remainingItems = filterDirectory('unprocessed');
        attachHideButtons(remainingItems);
    }
}

/**
 * Sets up a `MutationObserver` to watch the sidebar for changes (e.g., followed
 * channels coming online or going offline) and triggers the sidebar filter.
 */
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

/**
 * A master function to re-filter all relevant content on the page.
 * This is typically called after a page change or a blacklist update.
 */
function filterAllContent() {
    const remainingItems = filterDirectory('visible');
    attachHideButtons(remainingItems);
    filterSidebar('visible');
}

/**
 * Filters the main content area, which contains stream and category cards.
 * @param {'visible'|'unprocessed'} mode - The mode of filtering. 'visible' re-checks all items,
 *   'unprocessed' only checks items that haven't been processed yet.
 * @returns {Array<object>} An array of the items that were not hidden.
 */
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

/**
 * Filters the list of followed channels in the sidebar.
 */
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

/**
 * A generic function that takes an array of parsed item objects, checks each against
 * the blacklist, and applies a CSS class to hide the blacklisted ones.
 * @param {Array<object>} items - An array of parsed item objects (from `getDirectoryItems` or `getSidebarItems`).
 * @param {string} hideClass - The CSS class to apply to hide the item's container node.
 * @returns {Array<object>} An array of the items that were not hidden.
 */
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

/* ==========================================================================
   DOM Selectors & Parsing (MOST CRITICAL FIXES ARE HERE)
   ========================================================================== */

/**
 * Gets the DOM nodes for directory items (streams or categories) based on the current page type.
 * This is a context-aware selector.
 * @param {'visible'|'unprocessed'} mode - Whether to select all items or only unprocessed ones.
 * @returns {NodeListOf<Element>} A list of DOM elements representing the items.
 */
function getDirectoryItemNodes(mode) {
    if (!mainContentNode) return [];
    const suffix = mode === 'unprocessed' ? ':not([data-uttv-processed])' : '';
    let selector = '';

    if (currentPageType === 'categories') {
        // On the main /directory page, each category is a '.game-card'.
        selector = `.game-card${suffix}`;
    } else { // Assumes 'channels' page
        // On a /directory/category/... page, each item is a direct child of the tower.
        selector = `div.tw-tower > div:has(a[href^="/"])${suffix}`;
    }

    return mainContentNode.querySelectorAll(selector);
}


/**
 * A router function that gets all directory item nodes and parses them using the
 * appropriate parser function based on the current page type.
 * @param {'visible'|'unprocessed'} mode - The selection mode to pass to `getDirectoryItemNodes`.
 * @returns {Array<object>} An array of parsed item objects, ready for filtering.
 */
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


/**
 * Determines if a node is a stream or category card and calls the correct parser.
 * @param {HTMLElement} containerNode - The root DOM element of the card.
 * @returns {object|null} A parsed item object, or null if the node is not a recognized type.
 * @deprecated This function is less reliable than the context-aware `getDirectoryItems` router and may be removed.
 */
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



/**
 * Parses a stream card DOM node to extract relevant information for filtering.
 * @param {HTMLElement} containerNode - The root DOM element of the stream card.
 * @returns {object|null} A parsed object with channel name, title, tags, etc., or null if parsing fails.
 */
function readChannel(containerNode) {
    // The most stable anchor is the link to the channel itself.
    const linkNode = containerNode.querySelector('a.tw-link[href]');
    if (!linkNode || !linkNode.href) return null;

    // Extract the name directly from the URL. e.g., "/macaw45" -> "macaw45"
    const name = linkNode.href.split('/').pop();
    if (!name) return null;

    // We find the element that contains the preview card information.
    const cardInfo = containerNode.querySelector('.switcher-preview-card__wrapper');
    if (!cardInfo) return null;

    // Find the title element within that card info section.
    const titleNode = cardInfo.querySelector('p[class*="CoreText"][title]');
    const title = titleNode ? titleNode.title.trim() : '';

    // Find all tag buttons.
    const tagNodes = cardInfo.querySelectorAll('button.tw-tag[data-a-target]');
    const tags = [];
    tagNodes.forEach(tagNode => {
        const tagName = tagNode.textContent.trim();
        if (tagName) tags.push({ name: tagName, node: tagNode });
    });

    // Check for the "LIVE" indicator. If it's absent, it's a rerun or VOD.
    const liveIndicator = cardInfo.querySelector('.tw-channel-status-text-indicator');
    const isRerun = !liveIndicator;

    return {
        type: 'channels',
        name: name,
        category: getCategoryFromPage(), // Category is consistent for the whole page
        title: title,
        tags: tags,
        rerun: isRerun,
        containerNode: containerNode
    };
}

/**
 * Parses a category card DOM node to extract its name and tags.
 * @param {HTMLElement} containerNode - The root DOM element of the category card.
 * @returns {object|null} A parsed object with the category name and tags, or null if parsing fails.
 */
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
        type: 'categories',
        name: name,
        category: name, // For a category card, its name *is* the category
        title: '',      // Not applicable
        tags: tags,
        rerun: false,   // Not applicable
        containerNode: containerNode
    };
}


/**
 * Gets the DOM nodes for the followed channels listed in the sidebar.
 * @param {'unprocessed'|'visible'} mode - The selection mode.
 * @returns {NodeListOf<Element>} A list of DOM elements for the sidebar items.
 */
function getSidebarItemNodes(mode) {
    const sidebarNode = document.querySelector('nav#side-nav');
    if (!sidebarNode) return [];
    const suffix = mode === 'unprocessed' ? ':not([data-uttv-processed])' : '';
    // The container for a followed channel is now an `a` tag with this class.
    const selector = `a.side-nav-card${suffix}`;
    return sidebarNode.querySelectorAll(selector);
}

/**
 * Parses the sidebar item nodes to extract channel name and category.
 * @param {'unprocessed'|'visible'} mode - The selection mode to pass to `getSidebarItemNodes`.
 * @returns {Array<object>} An array of parsed sidebar item objects.
 */
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
            tags: [], // Tags are not displayed in the sidebar
            title: '', // Title is not displayed in the sidebar
            rerun: false, // Rerun status is not shown in sidebar
            containerNode: node
        });
    }
    return items;
}

/**
 * Extracts all tag names from a given container node.
 * @param {HTMLElement} tagContainerNode - The DOM element containing the tag elements.
 * @returns {Array<object>} An array of tag objects, each with a `name` and `node` property.
 */
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

/**
 * Attaches the "X" hide buttons to an array of item cards and their internal tags.
 * @param {Array<object>} items - An array of parsed item objects that were not filtered out.
 */
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

/**
 * Handles the event when a user clicks a hide button. It adds the item to the
 * in-memory blacklist, saves the updated blacklist to storage, and re-filters the page.
 * @param {'channels'|'categories'|'tags'} type - The type of item being hidden.
 * @param {string} name - The name of the item to add to the blacklist.
 * @returns {Promise<void>}
 */
async function onHideItem(type, name) {
    logInfo(`Adding to blacklist: [${type}] ${name}`);
    modifyBlacklistedItems(type, name);
    await putBlacklistedItems(storedBlacklistedItems);
    filterAllContent(); // Re-filter immediately after adding a new item
}

/**
 * Toggles the visibility of all "X" hide buttons on the page and saves the preference.
 * @param {boolean} state - `true` to show the buttons, `false` to hide them.
 * @returns {Promise<void>}
 */
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

/**
 * Injects the "Manage Blacklist" and "Toggle Buttons" UI into the page if it doesn't already exist.
 */
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
   Blacklist & Storage Logic
   ========================================================================== */

/**
 * Checks if a parsed item object should be hidden based on the current blacklist and settings.
 * @param {object} item - The parsed item object.
 * @returns {boolean} `true` if the item should be hidden, `false` otherwise.
 */
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

/**
 * Matches a given term against the blacklist for a specific type, using the performance caches.
 * @param {string} term - The term to check (e.g., a channel name, a title).
 * @param {string} type - The type of blacklist to check against ('channels', 'titles', etc.).
 * @returns {boolean} `true` if a match is found.
 */
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

/**
 * Ensures a blacklist collection object has all the necessary top-level properties
 * ('categories', 'channels', 'tags', 'titles').
 * @param {object} collection - The blacklist object.
 * @returns {object} The initialized blacklist object.
 */
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

/**
 * Retrieves the full blacklist from storage, handling fragmented storage if necessary.
 * @returns {Promise<object>} A promise that resolves to the fully constituted blacklist object.
 */
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

/**
 * Modifies the in-memory blacklist. Can either add a single item or replace the entire collection.
 * After modification, it rebuilds the performance caches.
 * @param {object|string} arg1 - The blacklist object or the type of the single item to add.
 * @param {string} [arg2] - The name of the single item to add.
 */
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

/**
 * Saves the provided blacklist object to storage.
 * It automatically handles switching from 'sync' to 'local' storage if the data size exceeds the sync quota.
 * @param {object} items - The complete blacklist object to save.
 * @returns {Promise<{success: boolean, switchedToLocal: boolean}>} An object indicating the result of the save operation.
 */
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
   Helper Functions
   ========================================================================== */

/**
 * Gets the current page's path from the window location.
 * @param {boolean} [traceThis=true] - Whether to log the function call.
 * @returns {string} The current path.
 */
function getCurrentPage(traceThis = true) {
    if (traceThis) { logTrace('invoking getCurrentPage()'); }
    return window.location.pathname;
}

/**
 * Checks if the current page is a page where filtering is supported.
 * @param {string} page - The page path to check.
 * @returns {boolean} `true` if the page is supported.
 */
function isSupportedPage(page) {
    const pageType = getPageType(page, false);
    return pageType !== null && !['videos', 'clips'].includes(pageType);
}

/**
 * Determines the 'type' of the current page based on its URL path.
 * @param {string} page - The page path.
 * @param {boolean} [traceThis=true] - Whether to log the function call.
 * @returns {string|null} The page type (e.g., 'channels', 'categories') or null if not supported.
 */
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