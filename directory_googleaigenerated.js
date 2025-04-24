//*	  GOOGLEAI Generated
//*   Updated selectors in `getDirectoryItemNodes` to correctly target both stream cards //and category cards, removing the obsolete one. Added `try-catch` for `querySelectorAll`.
//*   Updated `readItem` to correctly identify the new category card container //(`div.game-card`).
//*   Updated `attachHideButtons` to use the correct relative selector for the tag //container within category cards.
//*   Updated the `chrome.runtime.onMessage.addListener` to `await` the //`putBlacklistedItems` call and to correctly return a Promise or `true` to signal //completion for asynchronous message handling, fixing the race condition with //`blacklist.js`.


// jshint esversion: 6
// jshint -W069
// jshint -W083

/* BEGIN: runtime variables */

	// reference nodes for query selectors
	let rootNode = null;
	let mainNode = null;

	/* BEGIN: default settings */

		// determines if the filtering is enabled
		let enabled = true;

		// determines if attached hide buttons are visible
		let renderButtons = true;

		// determines if followed channels/categories shall be hidden
		let hideFollowing = true;

		// determines if stream reruns shall be hidden
		let hideReruns = false;

	/* END: default settings */

	// collection of blacklisted items, serves as local cache
	let storedBlacklistedItems = {};
	let backupBlacklistedItems = {};

	// internal cache to improve matching performance
	let cacheExactTerms  = {};
	let cacheLooseTerms  = {};
	let cacheRegExpTerms = {};

	// interval handles for page load detection
	let monitorPagesInterval;
	let onPageChangeInterval;
	let onPageChangeCounter = 0;
	let checkForItemsInterval;

	// semaphore for the extension initialization
	let initRun = false;

	// semaphore for page load progress
	let pageLoads = false;

	// track number of loops when waiting for placeholders to prevent infinite waiting
	let placeholderLoop = 0;
	const MAX_PLACEHOLDER_LOOP = 20;

	// semaphore for filter progress
	let directoryFilterRunning = false;
	let sidebarFilterRunning   = false;

	// last time the sidebar filtering was triggered by the observer
	let lastSidebarChange = new Date();

	// current page
	let currentPage = getCurrentPage();

	// currently detected page type
	let currentPageType = getPageType(currentPage);

/* END: runtime variables */

/* BEGIN: runtime listeners */

	/**
	 * Listens for chrome extension messages and dispatches corresponding actions.
	 */
	chrome.runtime.onMessage.addListener(async function callback_runtimeOnMessage(request) {
		logTrace('event invoked: chrome.runtime.onMessage($)', request);

		logVerbose('Command received:', request);

		// renderButtons
		if (typeof request['renderButtons'] === 'boolean') {

			await toggleHideButtonsVisibility(request['renderButtons']);
			// For simple state updates like this, returning true is fine for async.
			return true;
		}

		// extension
		if (typeof request.extension === 'string') {

			if (request.extension === 'disable') {

				enabled = false;
				await storageSet({ 'enabled': enabled });

				window.location.reload();
				// Reloading, no need to return anything specific.
				return true;

			} else if (request.extension === 'enable') {

				enabled = true;
				await storageSet({ 'enabled': enabled });

				window.location.reload();
				// Reloading, no need to return anything specific.
				return true;
			}
		}

		// blacklistedItems
		if (typeof request.blacklistedItems === 'object') {

			const items     = request.blacklistedItems;
			const cacheOnly = (request.storage === false);
			let saveProcessed = false; // Flag to track if save was attempted

			if (cacheOnly) {
				logInfo('Synchronizing new blacklist (cache only).', items);
				modifyBlacklistedItems(items);
				// Don't filter here if it's just a sync message from another tab
				// Let the originating tab handle filtering after save confirmation.
			} else {
				// This is a request to SAVE and filter
				if (
					(typeof request.dispatcherIndex !== 'number') ||
					(request.dispatcherIndex <= 0)
				) {
					// This tab is the primary one responsible for saving
					logInfo('Storing new blacklist in storage.', items);
					try {
						// --- AWAIT the save operation ---
						await putBlacklistedItems(items);
						saveProcessed = true; // Mark that save was processed by this tab
						// --- END AWAIT ---

						// --- Filter AFTER successful save attempt ---
						logInfo('Save processed, invoking filters...');
						// invoke directory filter
						if (
							(currentPageType !== 'following') ||
							(hideFollowing === true)
						) {
							filterDirectory();
						} else {
							filterDirectory('recommended');
							filterDirectory('unprocessed', false);
						}
						// invoke sidebar filter
						if (hideFollowing === true) {
							filterSidebar();
						} else {
							filterSidebar('recommended');
						}
						// --- END Filter ---
					} catch (error) {
						logError("Error during putBlacklistedItems or subsequent filtering:", error);
						// Even if saving failed, we should resolve the promise for the listener
						saveProcessed = false; // Indicate save wasn't fully successful
					}

				} else {
					// This tab received the message but isn't the primary saver (dispatcherIndex > 0)
					logInfo('Ignoring request to store new blacklist (already processed by another tab), synchronizing cache.', request);
					// Just update the cache based on the message
					modifyBlacklistedItems(items);
					// Re-filter based on the potentially updated cache from the primary tab
					logInfo('Cache synchronized, invoking filters based on updated cache...');
					if (
						(currentPageType !== 'following') ||
						(hideFollowing === true)
					) {
						filterDirectory();
					} else {
						filterDirectory('recommended');
						filterDirectory('unprocessed', false);
					}
					if (hideFollowing === true) {
						filterSidebar();
					} else {
						filterSidebar('recommended');
					}
				}
			}

			// --- SEND RESPONSE ---
			// Send a response back to blacklist.js to confirm processing is complete,
			// allowing it to close the tab safely.
			logVerbose("Sending response back to sender acknowledging blacklist message processing.");
			// Return a promise that resolves with the status.
			return Promise.resolve({ success: true, processedSave: saveProcessed });
			// --- END SEND RESPONSE ---
		}

		logError('Unknown command received. The following command was ignored:', request);
		// Must return true or a Promise for async listeners if not handled above.
		return true;
	});

/* END: runtime listeners */

/* BEGIN: page state */

	/**
	 * Returns the current page.
	 */
	function getCurrentPage(traceThis = true) {

		if (traceThis) {

			logTrace('invoking getCurrentPage()');
		}

		// remove trailing slash
		var result = window.location.pathname.replace(/\/$/, '');

		return result;
	}

	/**
	 * Returns if the specified page is a known and supported type.
	 */
	function isSupportedPage(page, traceThis = true) {

		if (traceThis) {

			logTrace('invoking isSupportedPage($)', page);
		}

		const pageType = getPageType(page);
		const result   = (pageType !== null);

		if (traceThis) {

			if (result === true) {

				logVerbose('Current page is supported:', page, pageType);

			} else {

				logWarn('Current page is not supported:', page, pageType);
			}
		}

		return result;
	}

	/**
	 * Returns the type of the current page.
	 */
	function getPageType(page) {
		logTrace('invoking getPageType($)', page);

		// remove trailing slash
		page = page.replace(/\/$/, '');

		switch (page) {

			case '':
				return 'frontpage'; // May need different selectors later

			case '/directory':
				return 'categories'; // Correctly identified

			case '/directory/all':
				return 'channels'; // Needs verification

			case '/directory/gaming':
			case '/directory/irl':
			case '/directory/music':
			case '/directory/creative':
			case '/directory/esports':
				return 'explore'; // May need different selectors later

			case '/directory/following':
			case '/directory/following/live':
				return 'following'; // Assume stream card structure

			case '/directory/following/videos':
				return 'videos'; // Needs VOD card structure

			case '/directory/following/hosts':
				return 'following'; // Needs verification

			case '/directory/following/games':
				return 'following'; // Needs verification

			case '/directory/following/channels':
				return null; // Unsupported

			default:

				// order of checks matters!
				if (RegExp('^/directory/.+').test(page) === true) {

					if (page.indexOf('/all/tags/') >= 0) {
						return 'channels'; // Needs verification (stream card structure assumed)
					}

					if (page.indexOf('/tags/') >= 0) {
						// This could be /directory/game/...?tags=... or /directory/category/...?tags=...
						// Treat as 'game' if it contains /game/, otherwise 'categories'
						if (page.includes('/game/')) {
							return 'game';
						}
						return 'categories'; // Needs verification (category card structure assumed)
					}

					if (page.indexOf('/videos') >= 0) { // Match /videos and /videos/all etc.
						return 'videos'; // Needs VOD card structure
					}

					if (page.indexOf('/clips') >= 0) {
						return 'clips'; // Needs Clip card structure
					}

					// This handles /directory/category/... and /directory/game/...
					if (page.includes('/category/') || page.includes('/game/')) {
						// Assume these pages show stream cards primarily
						return 'game'; // Using 'game' generically for stream card directories
					}

					if (page.indexOf('/collection/') >= 0) {
						return 'collection'; // Needs verification
					}

					// Default fallback for other /directory/... paths
					// Let's assume 'channels' is a reasonable default for unknown directory pages
					logWarn('Unknown /directory/ page structure, assuming "channels":', page);
					return 'channels';
				}
		}

		return logWarn('Unable to detect type of page:', page); // Returns null
	}


	/**
	 * Constantly checks the current location path to detect change of page.
	 */
	const pageChangeMonitorInterval = 100;
	window.clearInterval(monitorPagesInterval);
	monitorPagesInterval = window.setInterval(function monitorPages() {

		if (enabled === false) {

			window.clearInterval(monitorPagesInterval);
			logWarn('Page monitoring stopped. Extension is not enabled.');
			return;
		}

		var page = getCurrentPage(false);

		// location path change = view/page changed
		if (page !== currentPage) {

			currentPage     = page;
			currentPageType = getPageType(page);

			logInfo('Page changed to:', currentPage, '(Type:', currentPageType, ')');

			if (initRun === true) {

				onPageChange(currentPage);
			}
		}

	}, pageChangeMonitorInterval);

	/**
	 * Stops the current page change polling.
	 */
	function stopPageChangePolling() {
		logTrace('invoking stopPageChangePolling()');

		window.clearInterval(onPageChangeInterval);
		placeholderLoop = 0;
		pageLoads       = false;
	}

	/**
	 * Attaches an observer to the sidebar of the current page, which will filter its items.
	 */
	function observeSidebar() {
		logTrace('invoking observeSidebar()');

		// Try a more robust selector for the sidebar container
		const targetSelector = 'nav#side-nav .scrollable-area__content > div'; // Target content div inside scrollable area
		let target = rootNode.querySelector(targetSelector);

		if (!target) {
			// Fallback to original selectors if the above fails
			const fallbackSelectors = ['div[aria-label="Recommended Channels"]', 'nav#side-nav'];
			for (const selector of fallbackSelectors) {
				target = rootNode.querySelector(selector);
				if (target) {
					logVerbose('Using fallback sidebar selector:', selector);
					break;
				}
			}
		}

		if (target) {
			if (target.observer) {
				logVerbose('Disconnecting existing sidebar observer.');
				target.observer.disconnect();
			}
			const observer = new MutationObserver(mutations => {
				// Use requestAnimationFrame to debounce and avoid excessive filtering
				requestAnimationFrame(() => {
					const now = Date.now();
					// Simple debounce: only run if 500ms passed since last run
					if (now - lastSidebarChange < 500) return;
					lastSidebarChange = now;
					logVerbose('Sidebar mutation detected, triggering filter.');
					filterSidebar(hideFollowing ? 'visible' : 'recommended');
				});
			});
			// Observe changes to child elements and the subtree
			observer.observe(target, { childList: true, subtree: true });
			target.observer = observer; // Store observer on the target node
			logVerbose('Sidebar observer attached to:', target);
		} else {
			logWarn('Sidebar target not found using primary or fallback selectors.');
		}
	}


	/**
	 * Checks for unprocessed items in the directory of the current page and dispatches a scroll event if necessary.
	 */
	function listenToScroll() {
		logTrace('invoking listenToScroll()');

		const interval = 1000; // Check every second

		window.clearInterval(checkForItemsInterval);
		checkForItemsInterval = window.setInterval(function checkForItems() {

			// prevent listening during page load
			if (pageLoads === true) {
				//logVerbose('Skipping checkForItems(), because page load is in progress.');
				return;
			}

			// prevent filtering the directory more than once at the same time
			if (directoryFilterRunning === true) {
				logVerbose('Aborted invocation of checkForItems(), because directory filter is running.');
				return;
			}

			// page not supported, no reason to listen
			if (isSupportedPage(currentPage, false) === false) {
				logWarn('Stopped checkForItems(), because page is not supported.');
				window.clearInterval(checkForItemsInterval);
				return;
			}

			const nodes = getDirectoryItemNodes('unprocessed');
			const nodesLength = nodes.length;

			// when there are unprocessed items in the directory, assume that the user scrolled down or content loaded dynamically
			if (nodesLength > 0) {
				logInfo('Found ' + nodesLength + ' unprocessed nodes in the directory of the current page.', nodes);
				onScroll(); // Trigger filtering for new items
			}

		}, interval);
	}

	/**
	 * Triggers scroll event to load more directory items on the current page. Returns if the event could be dispatched to the custom scrolbar.
	 */
	function triggerScroll() {
		logTrace('invoking triggerScroll()');
		// Updated selector based on observed structure in Retro - Twitch.html
		const scrollbarNodeSelector = '.root-scrollable.scrollable-area .simplebar-scroll-content';
		const scrollbarNode         = rootNode.querySelector(scrollbarNodeSelector);

		if (scrollbarNode !== null) {
			logVerbose('Dispatching scroll event to:', scrollbarNode);
			// Dispatch scroll event to custom scrollbar
			try {
				scrollbarNode.dispatchEvent(
					new Event('scroll', { bubbles: true }) // Ensure event bubbles up
				);
				return true;
			} catch (e) {
				logError("Error dispatching scroll event:", e);
				// Fallback to window scroll if dispatch fails
				window.scrollBy(0, 1);
				return false;
			}

		} else {
			// Fallback: scroll the window if the specific element isn't found
			logWarn('Unable to find custom scrollbar element, attempting window scroll. Expected:', scrollbarNodeSelector);
			window.scrollBy(0, 1); // Scroll down a tiny bit
			return false; // Indicate specific target wasn't found
		}
	}

	/**
	 * Returns if the current document invokes the FFZ extension.
	 */
	function usingFFZ() {
		// Check for a known FFZ element or attribute
		return (document.querySelector('[data-ffz-extension]') !== null || document.getElementById('ffz-script') !== null);
	}

/* END: page state */

/* BEGIN: filter operations */

	/**
	 * Filters directory on the current page. Returns the remaining (not blacklisted) items.
	 */
	function filterDirectory(mode = 'visible', remove = true) {
		logTrace('invoking filterDirectory($, $)', mode, remove);

		// prevent filtering more than once at the same time
		if (directoryFilterRunning === true) {
			logWarn('Directory filter already running. Aborting.');
			return []; // Return empty array to indicate nothing was processed this time
		}

		directoryFilterRunning = true;
		logVerbose('Starting directory filter (mode:', mode, 'remove:', remove, ')');

		let remainingItems = [];
		let items = [];
		try {
			items = getDirectoryItems(mode);
			remainingItems = filterDirectoryItems(items, remove);
		} catch (error) {
			logError("Error during directory filtering:", error);
		} finally {
			directoryFilterRunning = false; // Ensure flag is reset even on error
			logVerbose('Finished directory filter. Remaining items:', remainingItems.length);
		}


		// If items were removed, trigger scroll event to request more items.
		// Only trigger if remove was true and items were actually hidden.
		if (remove === true && remainingItems.length < items.length) {
			// Check if the page type supports infinite scrolling/loading more items.
			// Avoid scrolling on pages like 'frontpage' where it might not apply or be desired.
			const scrollablePageTypes = ['categories', 'channels', 'game', 'videos', 'clips', 'following', 'explore', 'collection']; // Add others as needed
			if (scrollablePageTypes.includes(currentPageType)) {
				logVerbose('Items in the directory were removed. Attempting to request more items via scroll.');
				triggerScroll();
			} else {
				logVerbose('Items removed, but not triggering scroll for page type:', currentPageType);
			}
		}

		return remainingItems;
	}

	/**
	 * Filters the provided items and returns the remaining (not blacklisted) items.
	 */
	function filterDirectoryItems(items, remove = true) {
		logTrace('invoking filterDirectoryItems($, $)', items, remove);

		const toHide = [];
		const remainingItems = [];

		const itemsLength = items.length;
		if (itemsLength === 0) {
			logVerbose('No directory items to filter.');
			return remainingItems; // Return empty array if no items passed
		}

		logVerbose('Filtering', itemsLength, 'directory items...');
		for (let i = 0; i < itemsLength; i++) {

			const item = items[i];
			// Ensure item and containerNode exist
			if (!item || !item.containerNode) {
				logWarn('Skipping invalid item during filtering (missing item or containerNode):', item);
				continue;
			}

			// mark item node as being processed
			// Use the container node
			item.containerNode.setAttribute('data-uttv-processed', '');

			if (remove === false) {
				remainingItems.push(item); // Keep item if not removing
				continue;
			}

			if (isBlacklistedItem(item) === true) {
				// Add container node to the list to be hidden
				toHide.push(item.containerNode);
				// Also mark the primary node if it exists
				if (item.node) item.node.setAttribute('data-uttv-hidden', '');
				item.containerNode.setAttribute('data-uttv-hidden', '');
			} else {
				remainingItems.push(item);
			}
		}

		// Batch hide operation for performance
		if (remove && toHide.length > 0) {
			logVerbose('Applying .uttv-hidden-item to', toHide.length, 'items.');
			toHide.forEach(node => {
				try {
					node.classList.add('uttv-hidden-item');
				} catch (e) {
					logError("Error adding hide class to node:", node, e);
				}
			});
		}

		logVerbose('Finished filtering items. Kept:', remainingItems.length);
		return remainingItems;
	}

	/**
	 * Filters items in the sidebar of the current page. Returns the remaining (not blacklisted) items.
	 */
	function filterSidebar(mode = 'visible') {
		logTrace('invoking filterSidebar($, $)', mode);

		// prevent filtering more than once at the same time
		if (sidebarFilterRunning === true) {
			logWarn('Sidebar filter already running. Aborting.');
			return [];
		}

		sidebarFilterRunning = true;
		logVerbose('Starting sidebar filter (mode:', mode, ')');

		let remainingItems = [];
		try {
			const items = getSidebarItems(mode);
			remainingItems = filterSidebarItems(items); // Always removes if blacklisted
		} catch (error) {
			logError("Error during sidebar filtering:", error);
		} finally {
			sidebarFilterRunning = false; // Ensure flag is reset
			logVerbose('Finished sidebar filter. Remaining items:', remainingItems.length);
		}

		return remainingItems;
	}

	/**
	 * Filters the provided sidebar items and returns the remaining (not blacklisted) items.
	 */
	function filterSidebarItems(items) {
		logTrace('invoking filterSidebarItems($)', items);

		let remainingItems = [];

		const itemsLength = items.length;
		if (itemsLength === 0) {
			logVerbose('No sidebar items to filter.');
			return remainingItems;
		}

		logVerbose('Filtering', itemsLength, 'sidebar items...');
		for (let i = 0; i < itemsLength; i++) {

			const item = items[i];
			// Ensure item and containerNode exist
			if (!item || !item.containerNode) {
				logWarn('Skipping invalid sidebar item during filtering (missing item or containerNode):', item);
				continue;
			}

			// mark item node as being processed
			// Use the container node
			item.containerNode.setAttribute('data-uttv-processed', '');

			if (isBlacklistedItem(item) === true) {
				if (removeSidebarItem(item) === true) {
					logVerbose('Removed item in sidebar due to being blacklisted:', item.type, item.name || item.category);
					// Do not push to remainingItems
					continue;
				} else {
					logError('Unable to remove blacklisted item in sidebar:', item);
					// If removal failed, still treat it as visible for safety
					remainingItems.push(item);
				}
			} else {
				// If not blacklisted, add to remaining items
				remainingItems.push(item);
			}
		}
		logVerbose('Finished filtering sidebar items. Kept:', remainingItems.length);
		return remainingItems;
	}

/* END: filter operations */

/* BEGIN: item operations */

	/**
	 * Returns all items matching the specified mode in the directory of the current page.
	 */
	function getDirectoryItems(mode) {
		logTrace('invoking getDirectoryItems($)', mode);

		const items = [];

		const itemNodes = getDirectoryItemNodes(mode); // This now returns containers
		const itemNodesLength = itemNodes.length;
		logVerbose('Found', itemNodesLength, 'potential item nodes for mode:', mode);

		for (let i = 0; i < itemNodesLength; i++) {
			try {
				// Pass the container node to readItem
				const item = readItem(itemNodes[i]);
				if (item === null) {
					logVerbose('Failed to read item from node or node type unknown:', itemNodes[i]);
					continue;
				}
				items.push(item);
			} catch (error) {
				logError("Error reading directory item from node:", itemNodes[i], error);
			}
		}

		const itemsLength = items.length;

		if (itemsLength > 0) {
			logVerbose('Successfully read ' + itemsLength + ' items on the current page:', items.map(it => it.name || it.category || it.title || 'Unknown'));
		} else if (itemNodesLength > 0) {
			// Only warn if nodes were found but none could be read
			logWarn('Found nodes but failed to read any valid items from them.', itemNodes);
		}

		return items;
	}

	/**
	 * Returns all item nodes matching the specified mode in the directory of the current page.
	 * UPDATE: Now selects the main *container* div for each item type.
	 */
	function getDirectoryItemNodes(mode) {
		logTrace('invoking getDirectoryItemNodes($)', mode);

		if (typeof mode !== 'string') {
			throw new Error('Argument "mode" is required. Expected a string.');
		}

		const modes = {
			'visible':     ':not([data-uttv-hidden])',
			'hidden':      '[data-uttv-hidden]',
			'unprocessed': ':not([data-uttv-processed])',
			'processed':   '[data-uttv-processed]',
			'recommended': '.find-me :not([data-uttv-processed])' // Prefix handled separately if needed
		};

		let suffix = modes[mode];
		if (!suffix && mode !== 'all') { // 'all' implies no suffix needed
			throw new Error('Value of argument "mode", which is "' + mode + '", is unknown.');
		}
		if (mode === 'all') suffix = ''; // Handle 'all' explicitly

		let selectors = [];
		let prefix = (mode === 'recommended') ? '.find-me ' : '';

		// --- CORRECT: Selector for Stream Cards (Game, Channels, Following, Explore, Frontpage) ---
		// Targets the main container div identified in HTML analysis
		selectors.push(`${prefix}div.Layout-sc-1xcs6mc-0.jCGmCy${suffix}`);
		// --- END CORRECT ---

		// --- CORRECT: Selector for Category Cards (Main /directory page) ---
		// Use the container div identified in the new HTML analysis
		selectors.push(`${prefix}div.game-card${suffix}`);
		// --- END CORRECT ---

		// --- REMOVED: Obsolete category card selector based on older HTML ---
		// selectors.push(`${prefix}div[data-target="directory-page__card-container"]${suffix}`);
		// --- END REMOVED ---

		// --- TODO: Add selectors for VOD and Clip cards here when their structure is known ---
		// Example: selectors.push(`${prefix}div.vod-card-container-selector${suffix}`);
		// Example: selectors.push(`${prefix}div.clip-card-container-selector${suffix}`);

		const combinedSelector = selectors.join(', ');

		if (!mainNode) {
			logError('mainNode is null, cannot query for directory items.');
			return [];
		}

		// Use try-catch for querySelectorAll as invalid selectors can throw errors
		let nodes = [];
		try {
			nodes = mainNode.querySelectorAll(combinedSelector);
		} catch (error) {
			logError('Error executing querySelectorAll with selector:', combinedSelector, error);
			return []; // Return empty array on error
		}

		const nodesLength = nodes.length;

		if (nodesLength > 0) {
			logTrace('Found ' + nodesLength + ' container nodes in directory using selector:', combinedSelector, nodes);
		} else {
			// Only log trace if we expected results (e.g., not on an empty page)
			if (mainNode.querySelector('main > div > div:not(:empty)')) { // Basic check if main area has *some* content
				logTrace('Unable to find container nodes in directory. Expected selector:', combinedSelector);
			}
		}

		return nodes;
	}


	/**
	 * Returns all items matching the specified mode in the sidebar of the current page.
	 */
	function getSidebarItems(mode) {
		logTrace('invoking getSidebarItems($)', mode);

		const items = [];

		const itemNodes = getSidebarItemNodes(mode); // This now returns containers
		const itemNodesLength = itemNodes.length;
		logVerbose('Found', itemNodesLength, 'potential sidebar nodes for mode:', mode);

		for (let i = 0; i < itemNodesLength; i++) {
			try {
				const item = readSidebarItem(
					itemNodes[i] // Pass the container node
				);
				if (item === null) {
					logVerbose('Failed to read sidebar item from node:', itemNodes[i]);
					continue;
				}
				items.push(item);
			} catch (error) {
				logError("Error reading sidebar item from node:", itemNodes[i], error);
			}
		}

		const itemsLength = items.length;

		if (itemsLength > 0) {
			logVerbose('Successfully read ' + itemsLength + ' sidebar items:', items.map(it => it.name || 'Unknown'));
		} else if (itemNodesLength > 0){
			logWarn('Found sidebar nodes but failed to read any valid items from them.', itemNodes);
		}

		return items;
	}

	/**
	 * Returns all item nodes matching the specified mode in the sidebar of the current page.
	 * UPDATE: Now selects the main container div for each sidebar item.
	 */
	function getSidebarItemNodes(mode) {
		logTrace('invoking getSidebarItemNodes($)', mode);

		if (typeof mode !== 'string') {
			throw new Error('Argument "mode" is required. Expected a string.');
		}

		const modes = {
			'visible':     ':not([data-uttv-hidden])',
			'hidden':      '[data-uttv-hidden]',
			'unprocessed': ':not([data-uttv-processed])',
			'processed':   '[data-uttv-processed]',
			'recommended': ':not([data-uttv-hidden])' // Filter by section selector below
		};

		let suffix = modes[mode];
		if (!suffix && mode !== 'all') {
			throw new Error('Value of argument "mode", which is "' + mode + '", is unknown.');
		}
		if (mode === 'all') suffix = '';

		// Base selector for the container of each sidebar item (works for expanded and likely collapsed)
		const baseItemSelector = `div.Layout-sc-1xcs6mc-0.cwtKyw.side-nav-card${suffix}`;

		let combinedSelector = baseItemSelector;
		let nodes = [];

		const sidebarSelector = 'nav#side-nav'; // Target the nav element
		const sidebarNode     = rootNode.querySelector(sidebarSelector);

		if (sidebarNode !== null) {
			try {
				if (mode === 'recommended') {
					// Find the "Recommended Channels" section specifically
					const recommendedSection = sidebarNode.querySelector('div[aria-label="Recommended Channels"]');
					if (recommendedSection) {
						nodes = Array.from(recommendedSection.querySelectorAll(baseItemSelector)); // Query within the section
						logTrace('Found', nodes.length, 'nodes in Recommended section.');
					} else {
						logVerbose('Could not find Recommended Channels section.');
					}
				} else {
					// Query the entire sidebar for other modes
					nodes = Array.from(sidebarNode.querySelectorAll(combinedSelector));
				}

				const nodesLength = nodes.length;
				if (nodesLength > 0) {
					logTrace('Found ' + nodesLength + ' sidebar nodes for mode', mode, nodes);
				} else {
					logTrace('Unable to find sidebar nodes for mode', mode, 'using selector:', combinedSelector, 'within:', sidebarNode);
				}
			} catch (error) {
				logError("Error querying sidebar nodes:", error);
			}
		} else {
			logWarn('Unable to find sidebar on the current page. Expected:', sidebarSelector);
		}

		return nodes; // Return the container nodes
	}

	/**
	 * Returns item information based on the provided container node.
	 * UPDATE: Expects the main container node now. Checks for category and stream cards.
	 */
	function readItem(containerNode) {
		logTrace('invoking readItem($)', containerNode);

		if (!containerNode || !containerNode.matches) { // Basic check if it's a valid element
			logWarn('Invalid containerNode passed to readItem:', containerNode);
			return null;
		}

		try {
			// --- Check for Category Card Container (Main /directory page) ---
			if (containerNode.matches('div.game-card')) {
				const linkNode = containerNode.querySelector('a[data-a-target="tw-box-art-card-link"]');
				if (linkNode) {
					return readCategory(containerNode, linkNode);
				} else {
					logWarn('Could not find link node within category container (div.game-card):', containerNode);
					return null;
				}
			}

			// --- Check for Stream Card Container ---
			if (containerNode.matches('div.Layout-sc-1xcs6mc-0.jCGmCy')) {
				// Check if it's a stream card (has channel name etc.) vs potentially other cards using same layout class
				// A simple check is looking for the channel name element
				if (containerNode.querySelector('.Layout-sc-1xcs6mc-0.xxjeD p[title]')) {
					const linkNode = containerNode.querySelector('a.ScCoreLink-sc-16kq0mq-0.hcWFnG'); // Primary link for stream
					if (linkNode) {
						return readChannel(containerNode, linkNode); // Pass both container and link
					} else {
						logWarn('Could not find primary link node (a.hcWFnG) within stream container:', containerNode);
						// Maybe try finding the preview link as fallback?
						const previewLink = containerNode.querySelector('a[data-a-target="preview-card-image-link"]');
						if (previewLink) {
							logVerbose('Using preview link as fallback node reference for stream card.');
							return readChannel(containerNode, previewLink);
						}
						logError('Could not find any suitable link node within stream container:', containerNode);
						return null;
					}
				} else {
					logVerbose('Node matched stream container selector but lacked channel name structure, ignoring:', containerNode);
					// Mark as processed to avoid re-checking if it's not a stream card we handle
					containerNode.setAttribute('data-uttv-processed', '');
					return null;
				}
			}

			// --- TODO: Add checks for VOD/Clip card container selectors here ---
			// else if (containerNode.matches('div.vod-card-selector')) { ... }
			// else if (containerNode.matches('div.clip-card-selector')) { ... }

		} catch (error) {
			logError("Error in readItem while matching node:", containerNode, error);
			// Mark as processed to avoid infinite loops on erroring items
			containerNode.setAttribute('data-uttv-processed', '');
			return null;
		}

		// Fallback/Error if no match
		logWarn('Unable to identify item type from container node:', containerNode);
		// Mark as processed to avoid re-checking unknown items repeatedly
		containerNode.setAttribute('data-uttv-processed', '');
		return null;
	}


	/**
	 * Returns information for a channel item based on the provided container node and link node.
	 * UPDATE: Updated selectors based on HTML analysis. Added optional chaining.
	 */
	function readChannel(containerNode, linkNode, findCategory = true, findTags = true) {
		logTrace('invoking readChannel($, $, $, $)', containerNode, linkNode, findCategory, findTags);

		if (!containerNode || !linkNode) {
			logError("readChannel called with invalid containerNode or linkNode.");
			return null;
		}

		let result = {
			type:     'channels',
			name:     '',
			category: '', // Category usually not on card on category pages
			tags:     [],
			title:    '',
			rerun:    false,
			node:     linkNode, // Keep link node as primary reference for hiding attribute? Or container? Let's use container.
			containerNode: containerNode // Store container node reference explicitly
		};

		try {
			/* BEGIN: title */
				// Prefer the <p> with title attribute as it seems more consistent
				const titleNode = containerNode.querySelector('.Layout-sc-1xcs6mc-0.fAVISI p[title]');
				result.title = titleNode?.title?.trim() ?? '';
				if (!result.title) {
					// Fallback to span if p[title] is missing or empty
					const titleSpan = containerNode.querySelector('.Layout-sc-1xcs6mc-0.iUlBlt span.CoreText-sc-1txzju1-0');
					result.title = titleSpan?.textContent?.trim() ?? '';
				}
				if (!result.title) {
					logWarn('Unable to determine title of channel.', containerNode);
				}
			/* END: title */

			/* BEGIN: name */
				const nameNode = containerNode.querySelector('.Layout-sc-1xcs6mc-0.xxjeD p[title]');
				result.name = nameNode?.textContent?.trim() ?? '';
				if (!result.name) {
					// Try another potential location if the first fails
					const altNameNode = containerNode.querySelector('a[data-a-target="preview-card-channel-link"]');
					result.name = altNameNode?.textContent?.trim() ?? '';
					if (!result.name) {
						return logError('Unable to determine name of channel using primary or secondary selectors.', containerNode); // Name is critical
					}
				}
			/* END: name */

			/* BEGIN: category */
				// This selector is likely only present on non-category directory pages
				const categoryNode = containerNode.querySelector('a[data-a-target="preview-card-game-link"]');
				result.category = categoryNode?.textContent?.trim() ?? '';
				if (!result.category && findCategory && currentPageType !== 'game' && currentPageType !== 'categories') {
					// Only warn if we expect a category and didn't find it
					logVerbose('Unable to determine category link of channel.', containerNode);
				}
			/* END: category */

			/* BEGIN: tags */
				if (findTags) {
					const tagContainer = containerNode.querySelector('.Layout-sc-1xcs6mc-0.fAVISI .InjectLayout-sc-1i43xsx-0'); // Target the container div for tags
					if (tagContainer) {
						result.tags = readTags(tagContainer);
					} else {
						logVerbose('Unable to determine tag container for channel.', containerNode);
					}
				}
			/* END: tags */

			// rerun - Selector needs verification from Rerun Card HTML
			// Check for specific rerun indicator text or class
			const rerunIndicator = containerNode.querySelector('.stream-type-indicator--rerun, [data-a-target="stream-rerun-indicator"]'); // Combine checks
			result.rerun = (rerunIndicator !== null);
			if (result.rerun) logVerbose("Rerun indicator found for channel:", result.name);

		} catch (error) {
			logError("Error extracting channel data from node:", containerNode, error);
			return null; // Return null if critical data extraction fails
		}

		logVerbose(`[readChannel] Extracted Data: Name='${result.name}', Title='${result.title}', Category='${result.category}', Tags='${result.tags?.map(t=>t.name).join(',')}', Rerun='${result.rerun}'`);
		return result;
	}

	/**
	 * Returns information for a category item based on the provided container node and link node.
	 * UPDATE: Updated selectors based on HTML analysis. Added optional chaining.
	 */
	function readCategory(containerNode, linkNode, findTags = true) {
		logTrace('invoking readCategory($, $, $)', containerNode, linkNode, findTags);

		if (!containerNode || !linkNode) {
			logError("readCategory called with invalid containerNode or linkNode.");
			return null;
		}

		let result = {
			type:     'categories',
			name:     '',
			category: '',
			tags:     [],
			title:    '', // Categories don't have stream titles
			rerun:    false, // Categories aren't reruns
			node:     linkNode, // Use link node as primary reference
			containerNode: containerNode // Store container node reference
		};

		try {
			/* BEGIN: name */
				// Updated selector: Find the h2 title within the specific link structure
				const nameNode = containerNode.querySelector('a.ScCoreLink-sc-16kq0mq-0.jRnnHH h2[title]');
				result.name = nameNode?.textContent?.trim() ?? '';
				result.category = result.name; // For categories, name and category are the same
				if (!result.name) {
					// Try fallback selector if the first one fails (e.g., structure variation)
					const fallbackNameNode = containerNode.querySelector('.tw-card-body h2[title]'); // Simpler fallback
					result.name = fallbackNameNode?.textContent?.trim() ?? '';
					result.category = result.name;
					if (!result.name) {
						return logError('Unable to determine name of category using primary or fallback selector.', containerNode);
					}
					logVerbose('Used fallback selector for category name.');
				}
			/* END: name */

			/* BEGIN: tags */
				if (findTags) {
					// Updated selector for the tag container div (sibling to the main card div)
					const tagContainer = containerNode.querySelector('.Layout-sc-1xcs6mc-0.fAVISI .InjectLayout-sc-1i43xsx-0.gNgtQs');
					if (tagContainer) {
						result.tags = readTags(tagContainer);
					} else {
						logVerbose('Unable to determine tag container for category.', containerNode);
					}
				}
			/* END: tags */

		} catch (error) {
			logError("Error extracting category data from node:", containerNode, error);
			return null; // Return null if critical data extraction fails
		}

		logVerbose(`[readCategory] Extracted Data: Name='${result.name}', Tags='${result.tags?.map(t=>t.name).join(',')}'`);
		return result;
	}

	/**
	 * Returns all tags found in the provided tag container node.
	 * UPDATE: Updated selector for tag buttons. Added optional chaining.
	 */
	function readTags(tagContainerNode) {
		logTrace('invoking readTags($)', tagContainerNode);

		let tags = [];
		if (!tagContainerNode) {
			logVerbose('No tag container node provided to readTags.');
			return tags;
		}

		try {
			const tagsSelector = 'button.tw-tag[data-a-target]'; // Select the button tags
			const tagNodes     = tagContainerNode.querySelectorAll(tagsSelector);
			const nodesLength  = tagNodes.length;

			if (nodesLength > 0) {
				logTrace('Found', nodesLength, 'tag nodes in container:', tagContainerNode);
				for (let i = 0; i < nodesLength; i++) {
					const tagNode = tagNodes[i];
					// Use data-a-target as the primary source for the tag name
					let tagName = tagNode.getAttribute('data-a-target');

					// Fallback to aria-label if data-a-target is missing or generic
					if (!tagName || tagName === "tag") {
						const ariaLabel = tagNode.getAttribute('aria-label');
						if (ariaLabel && ariaLabel.startsWith('Tag, ')) {
							tagName = ariaLabel.substring(5).trim(); // Remove "Tag, " prefix
						}
					}

					// Fallback to text content if still no name
					if (!tagName) {
						tagName = tagNode.textContent?.trim();
					}

					if (!tagName) {
						logWarn('Tag node missing identifiable name (data-a-target, aria-label, textContent):', tagNode);
						continue;
					}

					tags.push({
						name: tagName,
						node: tagNode // Keep reference to the button itself
					});
				}
			} else {
				logTrace('Unable to find any tags in container. Expected selector:', tagsSelector, 'within:', tagContainerNode);
			}
		} catch (error) {
			logError("Error reading tags from container:", tagContainerNode, error);
		}

		logVerbose('Extracted tags from container:', tags.map(t => t.name), tagContainerNode);
		return tags;
	}


	/**
	 * Returns sidebar item information based on the provided container node.
	 * UPDATE: Checks sidebar state first, then applies appropriate logic. Added optional chaining.
	 */
	function readSidebarItem(containerNode, findCategory = false) {
		logTrace('invoking readSidebarItem($, $)', containerNode, findCategory);

		if (!containerNode) return null;

		try {
			// Find the main sidebar nav element to check its state
			const sidebarNav = document.querySelector('nav#side-nav'); // Assuming side-nav ID is reliable
			const isCollapsed = sidebarNav ? sidebarNav.closest('.side-nav--collapsed') !== null : false; // Check if the parent div has the collapsed class

			logVerbose(`Reading sidebar item. Collapsed state: ${isCollapsed}`);

			if (isCollapsed) {
				// --- Handle Collapsed Sidebar ---
				return readCollapsedSidebarItem(containerNode); // Pass the container

			} else {
				// --- Handle Expanded Sidebar ---
				const linkNode = containerNode.querySelector('a.side-nav-card__link'); // Find the main link inside the container

				if (!linkNode) {
					// If link is not found even in expanded view, log error and exit.
					logError('Could not find primary link node (a.side-nav-card__link) within expanded sidebar container:', containerNode);
					return null;
				}

				let result = {
					type: 'channels',
					name: '',
					category: '',
					tags: [], // Tags usually not shown in sidebar
					title: '', // Titles not shown in sidebar
					rerun: false,
					node: linkNode, // Reference the link node
					containerNode: containerNode // Reference the container
				};

				/* BEGIN: name - Expanded View */
				// Combined selector for robustness, prioritizing p[title] inside data-a-target first
				const nameNode = linkNode.querySelector('[data-a-target="side-nav-title"] p[title], [data-a-target="side-nav-card-metadata"] p[title]');
				result.name = nameNode?.textContent?.trim() ?? '';
				if (!result.name) {
					// Fallback: Try finding the name directly within the title target
					const titleTarget = linkNode.querySelector('[data-a-target="side-nav-title"]');
					result.name = titleTarget?.textContent?.trim() ?? '';
				}
				if (!result.name) {
					// It's unusual for name to be missing in expanded view, log as warning.
					logWarn('Could not determine name for expanded sidebar item:', containerNode);
					// We might still be able to get category, so don't return null immediately.
				}
				/* END: name - Expanded View */

				/* BEGIN: category - Expanded View */
				const categoryNode = linkNode.querySelector('[data-a-target="side-nav-game-title"] p'); // Target the paragraph inside
				result.category = categoryNode?.textContent?.trim() ?? '';
				if (!result.category) {
					// Fallback if the 'p' isn't there
					const categoryTarget = linkNode.querySelector('[data-a-target="side-nav-game-title"]');
					result.category = categoryTarget?.textContent?.trim() ?? '';
				}
				// No warning if category is empty, it's expected for offline channels etc.
				/* END: category - Expanded View */

				// Rerun check - Needs verification if applicable to sidebar
				result.rerun = (linkNode.querySelector('.tw-svg__asset--videorerun') !== null); // Keep existing check

				// Return null only if the essential name is missing
				if (!result.name) {
					logError('Expanded sidebar item missing critical name information.', containerNode);
					return null;
				}
				logVerbose(`[readSidebarItem Expanded] Name='${result.name}', Category='${result.category}'`);
				return result;
			}
		} catch (error) {
			logError("Error reading sidebar item:", containerNode, error);
			return null;
		}
	}

	/** Helper for collapsed sidebar logic - Needs HTML verification */
	function readCollapsedSidebarItem(node) {
		logTrace('invoking readCollapsedSidebarItem($)', node);
		// Assumes 'node' is the 'div.side-nav-card' container for the collapsed item
		let name = '';
		let linkHref = '#'; // Default href

		try {
			// In collapsed view, the main link might be the container itself or an inner 'a' without the specific class
			const collapsedLink = node.matches('a') ? node : node.querySelector('a'); // Check if container is link, else find first link within

			if (collapsedLink) {
				linkHref = collapsedLink.getAttribute('href') || '#';
				// Try getting name from aria-label on the link first
				name = collapsedLink.getAttribute('aria-label');
				if (!name) {
					// Fallback: Look for aria-label on avatar *inside* the link
					const avatarNode = collapsedLink.querySelector('.tw-avatar[aria-label]');
					if (avatarNode) {
						name = avatarNode.getAttribute('aria-label');
					} else {
						// Fallback: Look for alt text on image *inside* the link
						const imageNode = collapsedLink.querySelector('.tw-image-avatar[alt]');
						if (imageNode) {
							name = imageNode.getAttribute('alt');
						}
					}
				}
				// Further fallback if aria-label/alt fails: extract from href? Less reliable.
				if (!name && linkHref !== '#') {
					name = linkHref.substring(1); // Get text after "/" as a last resort
					logVerbose('Collapsed sidebar item name extracted from href:', name);
				}

			} else {
				logWarn('Could not find link element within collapsed sidebar container:', node);
				// Attempt extraction directly from container's children if no link found
				const avatarNode = node.querySelector('.tw-avatar[aria-label]');
				if (avatarNode) {
					name = avatarNode.getAttribute('aria-label');
				} else {
					const imageNode = node.querySelector('.tw-image-avatar[alt]');
					if (imageNode) {
						name = imageNode.getAttribute('alt');
					}
				}
			}

			if (!name) {
				return logError('Unable to determine name of collapsed sidebar channel.', node);
			}

			// Clean up potential extra text like "Use the Right Arrow Key..." if present in aria-label
			name = name.replace(/Use the Right Arrow Key to show more information for /i, '').replace(/\./, '').trim();
			// Clean up "(offline)" suffix if present
			name = name.replace(/\(offline\)$/i, '').trim();

		} catch (error) {
			logError("Error reading collapsed sidebar item:", node, error);
			return null;
		}

		logVerbose(`[readSidebarItem Collapsed] Name='${name}'`);
		return {
			type: 'channels',
			name: name,
			category: '', // No category in collapsed view
			tags: [],
			title: '',
			rerun: false,
			node: node.querySelector('a') || node, // Best guess for the node to manipulate/mark
			containerNode: node
		};
	}

	/**
	 * Returns if the specified item is blacklisted.
	 */
	function isBlacklistedItem(item) {
		//logTrace('invoking isBlacklistedItem($)', item); // Keep trace optional

		if (!item || typeof item !== 'object') {
			logError('[isBlacklistedItem] Invalid item passed:', item);
			return false;
		}

		const itemIdentifier = item.name || item.category || item.title || 'Unknown Item';
		logVerbose(`[isBlacklistedItem] Checking: Type='${item.type}', Name='${item.name}', Category='${item.category}', Title='${item.title}', Rerun='${item.rerun}', Tags='${item.tags?.map(t=>t.name).join(',')}'`);

		// blacklisted for being a rerun
		if (hideReruns && (item.rerun === true)) {
			logInfo(`[isBlacklistedItem] Blacklisted: Rerun - ${itemIdentifier}`);
			return true;
		}

		// Blacklisted by Name (Channel Name or Category Name)
		// Use item.name for channels, item.category for categories (they are the same value)
		const nameToCheck = item.type === 'categories' ? item.category : item.name;
		if (nameToCheck && matchTerms(nameToCheck, item.type)) {
			logInfo(`[isBlacklistedItem] Blacklisted: Name Match on '${nameToCheck}' (Type: ${item.type})`);
			return true;
		}

		// Blacklisted by Category (specifically for Channel items)
		if (item.type === 'channels' && item.category && matchTerms(item.category, 'categories')) {
			logInfo(`[isBlacklistedItem] Blacklisted: Category Match on '${item.category}' for channel ${item.name}`);
			return true;
		}

		// Blacklisted by Tag
		if (item.tags && item.tags.length > 0) {
			for (const tag of item.tags) {
				if (matchTerms(tag.name, 'tags')) {
					logInfo(`[isBlacklistedItem] Blacklisted: Tag Match on '${tag.name}' for item ${itemIdentifier}`);
					return true;
				}
			}
		}

		// Blacklisted by Title
		if (item.title && matchTerms(item.title, 'titles')) {
			logInfo(`[isBlacklistedItem] Blacklisted: Title Match on '${item.title}' for item ${itemIdentifier}`);
			return true;
		}

		logVerbose(`[isBlacklistedItem] Not blacklisted: ${itemIdentifier}`);
		return false;
	}

	/**
	 * Returns if the specified term matches against the provided blacklist type.
	 */
	function matchTerms(term, type) {
		if (!term || typeof term !== 'string' || term.length === 0 || !storedBlacklistedItems || !storedBlacklistedItems[type]) {
			//logTrace(`[matchTerms] Early exit: Invalid term/type or missing blacklist data for type '${type}'`);
			return false;
		}

		const termL = normalizeCase(term);

		// Check map/array types
		if (type === 'titles') {
			// Titles use array and special matching logic
			if (Array.isArray(storedBlacklistedItems.titles)) {
				for (const pattern of storedBlacklistedItems.titles) {
					if (typeof pattern !== 'string') continue;

					if (isExactTerm(pattern)) {
						const exactVal = pattern.substring(1, pattern.length - 1);
						if (term === exactVal) return true;
					} else if (isLooseTerm(pattern)) {
						const looseVal = normalizeCase(pattern.substring(1));
						if (termL.includes(looseVal)) return true;
					} else if (isRegExpTerm(pattern)) {
						const regexp = toRegExp(pattern);
						if (regexp && regexp.test(term)) return true;
					} else { // Default: loose matching for titles if no prefix
						const looseVal = normalizeCase(pattern);
						if (termL.includes(looseVal)) return true;
					}
				}
			}
		} else {
			// Other types (categories, channels, tags) use object map for direct lookup
			// Check original case and normalized case for non-prefixed terms
			if (storedBlacklistedItems[type][term] !== undefined) return true;
			if (storedBlacklistedItems[type][termL] !== undefined) return true;

			// Check caches for prefixed terms (exact, loose, regex)
			if (cacheExactTerms[type]) {
				for (const exactTerm of cacheExactTerms[type]) {
					if (term === exactTerm) return true;
				}
			}
			if (cacheLooseTerms[type]) {
				for (const looseTerm of cacheLooseTerms[type]) {
					if (termL.includes(looseTerm)) return true;
				}
			}
			if (cacheRegExpTerms[type]) {
				for (const regexp of cacheRegExpTerms[type]) {
					if (regexp.test(term)) return true;
				}
			}
		}

		return false;
	}


	/**
	 * Removes the provided item node. Returns if the node could be removed.
	 * UPDATE: Uses classList.add instead of inline style.
	 */
	function removeDirectoryItem(item) {
		//logTrace('invoking removeDirectoryItem($)', item); // Optional trace

		const container = item.containerNode; // Use the container node identified earlier
		const itemIdentifier = item.name || item.category || item.title || 'Unknown Item';

		if (!container) {
			logError('[removeDirectoryItem] Cannot remove directory item, containerNode is missing:', item);
			return false;
		}
		logInfo(`[removeDirectoryItem] Attempting to hide container for: ${itemIdentifier}`, container);
		// *** DEBUG: Log classes before adding ***
		//logVerbose('[removeDirectoryItem] Container classes BEFORE add:', container.className);

		try {
			// Mark the original node (link/article) as hidden for potential re-checks
			// Use optional chaining for safety
			item.node?.setAttribute('data-uttv-hidden', '');
			container.setAttribute('data-uttv-hidden', ''); // Ensure container is also marked

			// Hide the main container by adding the CSS class
			logVerbose('[removeDirectoryItem] Adding .uttv-hidden-item class to container.');
			container.classList.add('uttv-hidden-item');
			// *** DEBUG: Log classes AFTER adding ***
			//logVerbose('[removeDirectoryItem] Container classes AFTER add:', container.className);

			// *** DEBUG: Verify hiding after applying class ***
			requestAnimationFrame(() => { // Check style after next frame
				const computedStyle = window.getComputedStyle(container).display;
				if (computedStyle === 'none') {
					logInfo(`[removeDirectoryItem] Hide successful for: ${itemIdentifier} (via class)`);
				} else {
					logError(`[removeDirectoryItem] Hide FAILED for: ${itemIdentifier} (Computed style: ${computedStyle} despite adding class)`);
					// Log parent display style too, maybe it's affecting children?
					if (container.parentNode) {
						logVerbose(`[removeDirectoryItem] Parent computed display: ${window.getComputedStyle(container.parentNode).display}`);
					}
				}
			});
			return true; // Return true even if computedStyle check fails, as the class was added.
		} catch (error) {
			logError(`[removeDirectoryItem] Error hiding container for: ${itemIdentifier}`, error, item);
			return false;
		}
	}

	/**
	 * Removes the provided sidebar item node. Returns if the node could be removed.
	 * UPDATE: Targets the container node directly. Uses classList.add.
	 */
	function removeSidebarItem(item) {
		logTrace('invoking removeSidebarItem($)', item);

		const container = item.containerNode; // Use the container node identified earlier

		if (!container) {
			logError('Cannot remove sidebar item, containerNode is missing:', item);
			return false;
		}

		try {
			// Mark the original node (link/article) as hidden for potential re-checks
			if (item.node) {
				item.node.setAttribute('data-uttv-hidden', '');
			}
			container.setAttribute('data-uttv-hidden', ''); // Mark container

			// Hide the main container card div by adding class
			container.classList.add('uttv-hidden-item');
			logVerbose('Successfully hid sidebar item container:', container);
			return true;
		} catch (error) {
			logError('Error removing sidebar item container:', error, item);
			return false;
		}
	}

/* END: item operations */

/* BEGIN: controls */

	/**
	 * Attaches a hide button to all cards and tags in the directory of the current page.
	 */
	function attachHideButtons(items) {
		logTrace('invoking attachHideButtons($)', items);

		const itemsLength = items.length;

		for (let i = 0; i < itemsLength; i++) {
			try {
				const item = items[i];
				if (!item || !item.containerNode) {
					logWarn('Skipping button attachment for invalid item:', item);
					continue;
				};

				// Attach to Card Container
				attachHideButtonToCard(item);

				// Attach to Tags within the container
				// Find the correct tag container based on item type
				let tagContainerNode = null;
				if (item.type === 'channels') {
					// Selector for stream card tag container
					tagContainerNode = item.containerNode.querySelector('.Layout-sc-1xcs6mc-0.fAVISI .InjectLayout-sc-1i43xsx-0');
				} else if (item.type === 'categories') {
					// --- UPDATED SELECTOR for category card tag container ---
					// Select the sibling div containing the tags relative to the main card content
					tagContainerNode = item.containerNode.querySelector('.Layout-sc-1xcs6mc-0.fAVISI .InjectLayout-sc-1i43xsx-0.gNgtQs');
					// --- END UPDATE ---
				}
				// --- TODO: Add logic for VOD/Clip tag containers ---

				if (tagContainerNode && item.tags && item.tags.length > 0) {
					attachHideButtonsToTags(item.tags, tagContainerNode); // Pass tags array and container
				} else if (item.tags && item.tags.length > 0) {
					// Log if tags exist in data but container wasn't found
					logWarn('Found tags in item data, but failed to find tag container node for item:', item, 'Expected selectors based on type.');
				}
			} catch (error) {
				logError("Error attaching hide buttons for item:", items[i], error);
			}
		}
	}


	/**
	 * Attaches a hide button to the provided card container node.
	 * UPDATE: Appends to the container node. Listener now handles immediate hide + verbose logging.
	 */
	function attachHideButtonToCard(item) {
		//logTrace('invoking attachHideButtonToCard($)', item); // Keep trace for less noise if needed

		const containerNode = item.containerNode;
		if (!containerNode) {
			logError('[attachHideButtonToCard] Cannot attach card button, containerNode missing for item:', item);
			return;
		}

		const attachedKey = 'data-uttv-card-button-attached';

		// Prevent attaching the button more than once
		if (containerNode.getAttribute(attachedKey) !== null) {
			//logVerbose('[attachHideButtonToCard] Hide button already attached to card container.', containerNode);
			return;
		}

		// Mark item as being processed for button attachment
		containerNode.setAttribute(attachedKey, '');
		logVerbose('[attachHideButtonToCard] Attaching button to container:', containerNode, 'for item:', item.name || item.category);

		try {
			/* BEGIN: build hide button */
				let hideItem = document.createElement('div');
				let label = '';
				let itemIdentifier = item.name || item.category || item.title || 'Unknown Item'; // Use best available identifier

				switch (item.type) {
					case 'categories':
						hideItem.className   = 'uttv-hide-item uttv-category';
						label = chrome.i18n.getMessage('label_HideCategory');
						itemIdentifier = item.category; // Prefer category name for categories
					break;
					case 'channels':
						hideItem.className   = 'uttv-hide-item uttv-channel';
						label = chrome.i18n.getMessage('label_HideChannel');
						itemIdentifier = item.name; // Prefer channel name for channels
						if ( usingFFZ() && item.node?.getAttribute('href') && /^\/[^\/]+\/?$/.test(item.node.getAttribute('href')) ) {
							hideItem.className += ' uttv-ffz';
						}
					break;
					// --- TODO: Add cases for VOD/Clip types ---
					default:
						logError('[attachHideButtonToCard] Unable to create hide button for card, unknown item type:', item.type);
						return; // Don't attach button for unknown types
				}

				hideItem.textContent = 'X';
				hideItem.title       = label + ' (' + itemIdentifier + ')';

				if (renderButtons === false) {
					hideItem.classList.add('uttv-hidden');
				}
			/* END: build hide button */

			// Store necessary info directly on the button
			const itemType = item.type;
			const itemName = itemIdentifier; // Use the determined identifier
			hideItem.setAttribute('data-uttv-type', itemType);
			hideItem.setAttribute('data-uttv-name', itemName);

			// --- Event Listener ---
			hideItem.addEventListener('click', async (event) => {
				// cancel regular click event on card
				event.preventDefault();
				event.stopPropagation();

				const buttonClicked = event.currentTarget;
				const containerToHide = buttonClicked.closest('.game-card, .Layout-sc-1xcs6mc-0.jCGmCy'); // Find closest container

				if (!containerToHide) {
					logError('[Hide Card Click] Could not find parent container node for button:', buttonClicked);
					return; // Cannot proceed without container
				}

				const type = buttonClicked.getAttribute('data-uttv-type');
				const name = buttonClicked.getAttribute('data-uttv-name');

				if (!type || !name) {
					logError("[Hide Card Click] Missing data-uttv-type or data-uttv-name on button.", buttonClicked);
					return;
				}

				logInfo(`[Hide Card Click] Attempting to hide: Type='${type}', Name='${name}'`);
				logInfo('[Hide Card Click] Target container for hiding:', containerToHide);

				// 1. Immediately hide the visual element
				try {
					logVerbose("[Hide Card Click] Adding .uttv-hidden-item class to container.");
					containerToHide.classList.add('uttv-hidden-item'); // Use classList.add
					logVerbose("[Hide Card Click] Setting data-uttv-hidden on container.");
					containerToHide.setAttribute('data-uttv-hidden', ''); // Mark as hidden

					// *** DEBUG: Check if style was applied ***
					requestAnimationFrame(() => {
						const computedStyle = window.getComputedStyle(containerToHide).display;
						if (computedStyle === 'none') {
							logInfo("[Hide Card Click] Immediate hide successful (computed style is 'none' via class).");
						} else {
							logError("[Hide Card Click] Immediate hide FAILED (computed style is NOT 'none', it is: " + computedStyle + "). Class might be overridden.", containerToHide);
						}
					});

					// Also mark the original primary node if it exists
					const primaryNode = containerToHide.querySelector('a.ScCoreLink-sc-16kq0mq-0.hcWFnG, a[data-a-target="tw-box-art-card-link"]');
					if (primaryNode) {
						logVerbose("[Hide Card Click] Setting data-uttv-hidden on primary node:", primaryNode);
						primaryNode.setAttribute('data-uttv-hidden', '');
					} else {
						logWarn("[Hide Card Click] Could not find primary node within container to mark as hidden.");
					}

				} catch(e) {
					logError("[Hide Card Click] Error during immediate hide:", e, containerToHide);
				}

				// 2. Proceed with blacklist update in the background
				logVerbose("[Hide Card Click] Calling onHideItem for blacklist update.");
				await onHideItem({ type: type, name: name }); // Pass the extracted data
			});
			// --- End Event Listener ---

			// Ensure container is capable of absolute positioning
			// Only apply if not already relative or absolute
			const currentPosition = window.getComputedStyle(containerNode).position;
			if (currentPosition !== 'relative' && currentPosition !== 'absolute' && currentPosition !== 'fixed') {
				containerNode.style.position = 'relative';
			}
			containerNode.appendChild(hideItem);
			//logVerbose('[attachHideButtonToCard] Attached card hide button to container:', containerNode); // Keep less verbose if needed

			return hideItem;

		} catch (error) {
			logError("Error attaching hide button to card:", item, error);
			return null;
		}
	}


	/**
	 * Attaches a hide button to each tag node within the provided container.
	 * UPDATE: Accepts tag array and container, attaches to tag buttons. Requires CSS update.
	 */
	function attachHideButtonsToTags(tags, tagContainerNode) {
		logTrace('invoking attachHideButtonsToTags($, $)', tags, tagContainerNode);

		if (!tags || tags.length === 0 || !tagContainerNode) {
			//logVerbose('No tags or container provided for button attachment.');
			return;
		}

		const attachedKey = 'data-uttv-tags-attached';

		// Check if buttons are already attached to the container (less granular but prevents duplicates)
		if (tagContainerNode.getAttribute(attachedKey) !== null) {
			//logVerbose('Hide buttons already attached to tags in this container.', tagContainerNode);
			return;
		}
		tagContainerNode.setAttribute(attachedKey, '');

		try {
			/* BEGIN: build hide button template */
				let hideTagTemplate = document.createElement('div');
				hideTagTemplate.className   = 'uttv-hide-tag';
				hideTagTemplate.textContent = 'X';
				hideTagTemplate.title       = chrome.i18n.getMessage('label_HideTag');

				if (renderButtons === false) {
					hideTagTemplate.classList.add('uttv-hidden');
				}
			/* END: build hide button template */

			for (let i = 0; i < tags.length; i++) {
				const tag = tags[i];
				const tagButtonNode = tag.node; // This should be the <button> element

				if (!tagButtonNode || tagButtonNode.querySelector('.uttv-hide-tag')) {
					// Skip if node is invalid or button already attached
					continue;
				}

				const hideTagNode = hideTagTemplate.cloneNode(true);

				// Attach action listener with backreference to the tag name
				hideTagNode.setAttribute('data-uttv-tag-name', tag.name);
				hideTagNode.addEventListener('click', async(event) => {
					// Cancel regular click event on tag
					event.preventDefault();
					event.stopPropagation();

					const tagName = event.currentTarget.getAttribute('data-uttv-tag-name');
					if (!tagName) {
						logError("Hide tag button missing tag name attribute.", event.currentTarget);
						return;
					}
					// Ask user to confirm action
					const decision = confirm( chrome.i18n.getMessage('confirm_HideTag') + ' [' + tagName + ']' );
					if (decision === true) {
						logInfo('Hide Tag button clicked:', tagName);
						await onHideTag({ name: tagName }); // Pass simple object
					}
				});

				// Make the tag button relative positioning context if needed
				const currentPosition = window.getComputedStyle(tagButtonNode).position;
				if (currentPosition !== 'relative' && currentPosition !== 'absolute' && currentPosition !== 'fixed') {
					tagButtonNode.style.position = 'relative';
				}
				// Append the hide button *inside* the tag button
				tagButtonNode.appendChild(hideTagNode);
			}
			logVerbose('Attached hide buttons to', tags.length, 'tags in container:', tagContainerNode);

		} catch (error) {
			logError("Error attaching hide buttons to tags:", tags, tagContainerNode, error);
		}

		// IMPORTANT: Requires CSS update in directory.css for `.uttv-hide-tag`
		// Example CSS suggestion moved to comments in directory.css
	}

	/**
	 * Toggles visibility state of all present hide buttons in the directory of the current page. Returns all present hide buttons.
	 */
	async function toggleHideButtonsVisibility(state) {
		logTrace('invoking toggleHideButtonsVisibility($)', state);

		if (typeof state !== 'boolean') {
			throw new Error('Argument "state" is illegal. Expected a boolean.');
		}
		if (!mainNode && !rootNode) { // Check both main and root
			logError('mainNode and rootNode are null, cannot toggle button visibility.');
			return [];
		}
		// Use mainNode if available, otherwise fallback to rootNode
		const queryNode = mainNode || rootNode;

		// store state globally
		renderButtons = state;
		await storageSet({ 'renderButtons': renderButtons });

		const buttonsSelector = '.uttv-hide-item, .uttv-hide-tag'; // Select both types
		let buttons = [];
		try {
			buttons = queryNode.querySelectorAll(buttonsSelector);
		} catch (error) {
			logError("Error querying hide buttons:", error);
			return [];
		}

		const buttonsLength   = buttons.length;

		if (buttonsLength > 0) {
			logInfo('Toggling', buttonsLength, 'hide buttons to state:', state);
			const className = 'uttv-hidden'; // Use the specific class for visibility
			if (renderButtons === true) {
				for (let i = 0; i < buttonsLength; i++) {
					buttons[i].classList.remove(className);
				}
			} else {
				for (let i = 0; i < buttonsLength; i++) {
					buttons[i].classList.add(className);
				}
			}
		} else {
			logWarn('Unable to find any hide buttons to toggle. Expected:', buttonsSelector);
		}

		// Update the tooltip on the management button if it exists
		const manageButtonToggle = queryNode.querySelector('.uttv-button .uttv-toggle');
		if (manageButtonToggle) {
			manageButtonToggle.title = renderButtons ? 'Hide filter buttons' : 'Show filter buttons';
		}


		return buttons;
	}

	/**
	 * Adds a button to open the management view in the directory of the current page.
	 */
	function addManagementButton() {
		logTrace('invoking addManagementButton()');
		if (!mainNode) {
			logError('mainNode is null, cannot add management button.');
			return false;
		}

		let areaSelector;
		let area;
		let targetParent = null; // Define parent explicitly
		let position = 'append'; // Default position

		// --- Selectors refined based on page types ---
		try {
			switch (currentPageType) {
				case 'frontpage':
					// Try to find a stable container near the carousels
					areaSelector = '.root-scrollable__wrapper main > div > div:nth-child(2)'; // Second main div often holds content
					area         = mainNode.querySelector(areaSelector);
					targetParent = area;
					position     = 'prepend'; // Prepend to front page content
					break;

				case 'categories': // Main /directory page
				case 'game':       // Specific /directory/category/... or /directory/game/...
				case 'channels':   // /directory/all or similar stream lists
					// Target the area containing sorting/filtering dropdowns
					areaSelector = 'div[data-a-target="tags-filter-dropdown"], div[data-a-target="sort-filter-dropdown"]';
					area         = mainNode.querySelector(areaSelector);
					// Go up to find a common ancestor container, likely a div holding these controls
					targetParent = area?.closest('.Layout-sc-1xcs6mc-0'); // Find nearest Layout parent
					if (!targetParent && area) targetParent = area.parentNode?.parentNode; // Fallback to previous logic
					position = 'append'; // Append after filters
					break;

				case 'videos': // Needs verification
					areaSelector = '.channel-root__videos-page .tw-mg-b-2'; // Area above video list
					area         = mainNode.querySelector(areaSelector);
					targetParent = area;
					position = 'append';
					break;

				case 'clips': // Needs verification
					areaSelector = '.clips-root .tw-mg-b-2'; // Area above clips list
					area         = mainNode.querySelector(areaSelector);
					targetParent = area;
					position = 'append';
					break;

				case 'explore': // Needs verification - e.g., /directory/gaming
					areaSelector = '.directory-header'; // Header for explore sections
					area         = mainNode.querySelector(areaSelector);
					targetParent = area;
					position = 'append';
					break;

				case 'following': // Needs verification for live/videos/games tabs
					// Place near the top-level filter/search area if present
					areaSelector = '.tw-flex.tw-flex-row.tw-justify-content-end'; // Div holding search/filters on following
					area         = mainNode.querySelector(areaSelector);
					targetParent = area?.parentNode; // Parent div holding that row
					position     = 'prepend'; // Prepend before the search/filter row
					if (!targetParent) { // Fallback near tabs
						areaSelector = 'ul[role="tablist"]';
						area         = mainNode.querySelector(areaSelector);
						targetParent = area?.parentNode;
						position = 'append';
					}
					break;

				case 'collection': // Needs verification
					areaSelector = '#directory-game-main-content h1'; // Near the title
					area         = mainNode.querySelector(areaSelector);
					targetParent = area?.parentNode;
					position = 'append'; // Append after title
					break;

				default:
					logError('Unable to add management button, page type is unhandled:', currentPageType);
					return false; // Exit if type is unknown/unsupported
			}

			if (targetParent) {
				// Pass the determined parent and position
				return buildManagementButton(targetParent, '', position);
			} else {
				logWarn('Unable to find anchor area for management button on page type:', currentPageType, 'Expected selector:', areaSelector);
			}
		} catch (error) {
			logError("Error finding management button anchor:", error);
		}

		return false;
	}

	/**
	 * Adds a button to open the management view in the specified area.
	 */
	function buildManagementButton(areaNode, className = '', position = 'append') {
		logTrace('invoking buildManagementButton($, $, $)', areaNode, className, position);

		if (!areaNode) {
			logError('buildManagementButton called with null areaNode.');
			return false;
		}

		// prevent adding more than one button in the specified area
		if (areaNode.querySelector('div[data-uttv-management]') !== null) {
			logInfo('Management button already present in the specified area:', areaNode);
			return false; // Button already exists
		}

		try {
			let container = document.createElement('div');
			container.setAttribute('data-uttv-management', '');

			// container's class
			if (Array.isArray(className)) {
				className = className.join(' ');
			}
			if (typeof className === 'string' && className.length > 0) { // Add class only if provided
				container.className = className;
			}
			// Add a base class for potential common styling
			container.classList.add('uttv-management-container');
			// Add page-specific class for easier styling if needed
			container.classList.add(`uttv-page-${currentPageType || 'unknown'}`);


			let button = document.createElement('div');
			button.className = 'uttv-button'; // Keep existing class

			let buttonText = document.createElement('div');
			buttonText.className = 'uttv-manage'; // Keep existing class
			buttonText.textContent = chrome.i18n.getMessage('label_Management');

			// click action for label
			buttonText.addEventListener('click', async() => {
				try {
					logInfo('Opening blacklist manager from button click.');
					await chrome.runtime.sendMessage({ action: 'openBlacklist' });
				}
				catch(error) { // Catch specific error
					logError('Failed to open blacklist tab.', error);
				}
			});

			let buttonToggle = document.createElement('div');
			buttonToggle.className = 'uttv-toggle'; // Keep existing class
			buttonToggle.textContent = '👁';
			buttonToggle.title = renderButtons ? 'Hide filter buttons' : 'Show filter buttons'; // Dynamic title

			// click action for eye symbol
			buttonToggle.addEventListener('click', async() => {
				const newState = !renderButtons; // Determine the target state *before* confirming
				logInfo('Toggle visibility button clicked. Current state:', renderButtons, 'Target state:', newState);
				// Require confirmation only when hiding
				if (renderButtons === true) {
					const confirmed = confirm( chrome.i18n.getMessage('confirm_HideButtons') );
					if (!confirmed) {
						logInfo('User cancelled hiding buttons.');
						return;
					}
				}
				// Update the tooltip before toggling
				buttonToggle.title = newState ? 'Hide filter buttons' : 'Show filter buttons';
				await toggleHideButtonsVisibility(newState);
			});

			button.appendChild(buttonText);
			button.appendChild(buttonToggle);
			container.appendChild(button);

			// Simplified positioning logic
			if (position === 'append') {
				areaNode.appendChild(container);
			} else if (position === 'prepend') {
				areaNode.insertBefore(container, areaNode.firstChild); // Insert at the beginning of the areaNode
			} else {
				logError('Argument "position" is illegal. Expected one of: "append", "prepend". Got:', position);
				return false;
			}
			logInfo('Successfully added management button.', container, 'to area:', areaNode, 'Position:', position);
			return true;
		} catch (error) {
			logError('Error building/adding management button to areaNode:', error, areaNode, container);
			return false;
		}
	}

/* END: controls */

/* BEGIN: events */

	/**
	 * Event that is emitted whenever the page changes.
	 */
	function onPageChange(page) {
		logTrace('invoking onPageChange($)', page);

		// Prevent page change before the first initialization completed
		if (initRun !== true) {
			return logWarn('Aborting onPageChange, extension not initialized.', page);
		}

		// Prevent running multiple page changes at once
		if (pageLoads === true) {
			return logWarn('Aborting onPageChange, previous page load still in progress.', page);
		}

		// Clear previous page load polling interval if any
		stopPageChangePolling(); // Clear previous interval and reset flags

		if (isSupportedPage(page) === false) {
			logWarn('onPageChange: Current page is not supported. Stopping polling.', page);
			// Still try to observe sidebar on unsupported pages
			observeSidebar();
			return;
		}

		logInfo('onPageChange: Starting process for supported page:', page, 'Type:', currentPageType);
		pageLoads = true; // Set loading flag
		placeholderLoop = 0; // Reset placeholder loop counter
		onPageChangeCounter = 0;
		const pageLoadMonitorInterval = 200; // Check every 200ms
		const pageLoadTimeout = 15000 / pageLoadMonitorInterval; // ~15 seconds timeout

		// Ensure mainNode is available
		const mainNodeSelector = 'main';
		mainNode = document.querySelector(mainNodeSelector);
		if (!mainNode) {
			logError('onPageChange: Main node not found, cannot proceed. Expected:', mainNodeSelector);
			pageLoads = false; // Reset loading state
			return; // Cannot proceed without main node
		}

		// Wait until the directory content seems loaded
		onPageChangeInterval = window.setInterval(function onPageChange_waitingForPageLoad() {
			//logTrace('Polling for page load completion...'); // Reduce log noise
			onPageChangeCounter += 1;

			// Generic check for *any* primary content card (stream, category, VOD, clip)
			// Use the container selectors we identified/will identify
			const contentCardSelector = [
				'div.Layout-sc-1xcs6mc-0.jCGmCy', // Stream card container
				'div.game-card',                  // Category card container
				// --- TODO: Add VOD/Clip container selectors here ---
			].join(', ');

			const indicator = mainNode.querySelector(contentCardSelector);
			// Check for common loading placeholders
			const placeholderNode = rootNode.querySelector('.tw-placeholder, .tw-loading-spinner');

			// Condition 1: Content indicator found AND (no placeholder OR placeholder timeout reached)
			if (indicator !== null && (placeholderNode === null || placeholderLoop >= MAX_PLACEHOLDER_LOOP)) {
				if (placeholderLoop >= MAX_PLACEHOLDER_LOOP) {
					logWarn("Proceeding despite potential placeholders due to timeout.");
				}
				logInfo('Page content indicator found, proceeding with initialization.', indicator);
				stopPageChangePolling(); // Stop this polling interval
				logTrace('Polling stopped in onPageChange(): page loaded indicator found.');

				// --- Actions to perform once page content is detected ---
				try {
					addManagementButton(); // Attempt to add the management button

					// Initial Filter Run
					let remainingItems = [];
					if (currentPageType === 'following' && hideFollowing === false) {
						logInfo('Filtering only recommended items on Following page due to settings.');
						remainingItems = filterDirectory('recommended', true); // Filter recommended first
						filterDirectory('unprocessed', false); // Mark others as processed without hiding
					} else {
						logInfo('Filtering all visible items.');
						remainingItems = filterDirectory('visible', true); // Default: Filter all visible
					}

					// Attach Buttons to Remaining Items
					if (remainingItems.length > 0) {
						attachHideButtons(remainingItems);
						logInfo('Attached hide buttons to', remainingItems.length, 'items.');
					} else {
						logVerbose("No remaining items after initial filter to attach buttons to.");
					}

					// Filter Sidebar
					if (hideFollowing === true) {
						filterSidebar('visible'); // Filter all visible sidebar items
					} else {
						filterSidebar('recommended'); // Filter only recommended sidebar items
					}
					// Always observe sidebar after initial setup
					observeSidebar();

					// Start listening for dynamically loaded content / scroll events
					listenToScroll();
				} catch (error) {
					logError("Error during post-page-load actions:", error);
					// Ensure loading state is reset even if actions fail
					pageLoads = false;
				}
				// --- End Actions ---

			} else if (placeholderNode !== null && placeholderLoop < MAX_PLACEHOLDER_LOOP) {
				placeholderLoop++;
				logVerbose(`Placeholder detected (loop ${placeholderLoop}/${MAX_PLACEHOLDER_LOOP}), waiting...`);
				// Continue polling

			} else if (indicator === null && onPageChangeCounter <= pageLoadTimeout) {
				logVerbose('Page content indicator not found yet, polling again...');
				// Continue polling if timeout not reached

			} else if (onPageChangeCounter > pageLoadTimeout) {
				stopPageChangePolling(); // Stop interval on timeout
				logWarn('Stopped polling in onPageChange(): Page did not load indicator within timeout.', page);
				// Attempt sidebar observation anyway
				observeSidebar();
			}

		}, pageLoadMonitorInterval);
	}

	/**
	 * Event that is emitted by hide buttons on cards in the directory of the current page.
	 * UPDATE: Reads data attributes from the button itself.
	 */
	async function onHideItem(itemData) {
		logTrace('invoking onHideItem($)', itemData);

		if (!itemData || !itemData.type || !itemData.name || itemData.name.length === 0) {
			logError('Unable to hide item. Invalid data received:', itemData);
			return false;
		}

		const itemType = itemData.type;
		const itemName = itemData.name; // Name is already normalized or comes from data attr

		logInfo('Adding item to blacklist:', itemType, itemName);

		try {
			// Update cache (pass type and name directly)
			modifyBlacklistedItems(itemType, itemName); // Uses the function overload for single item

			// Update storage
			await putBlacklistedItems(storedBlacklistedItems);
			return true; // Indicate success
		} catch (error) {
			logError("Error hiding item (modify/put blacklist):", itemData, error);
			return false; // Indicate failure
		}
	}

	/**
	 * Event that is emitted by hide buttons on tags in the directory of the current page.
	 * UPDATE: Reads data attribute from the button itself.
	 */
	async function onHideTag(tagData) {
		logTrace('invoking onHideTag($)', tagData);

		if (!tagData || !tagData.name || tagData.name.length === 0) {
			logError('Unable to hide tag. Invalid data received:', tagData);
			return false;
		}

		const tagName = tagData.name; // Name comes from data attribute
		logInfo('Adding tag to blacklist:', tagName);

		try {
			// Update cache
			// Add the raw tag name as 'tags' matching doesn't usually rely on prefix/normalization
			modifyBlacklistedItems('tags', tagName);

			// Update storage
			await putBlacklistedItems(storedBlacklistedItems);
			return true; // Indicate success
		} catch (error) {
			logError("Error hiding tag (modify/put blacklist):", tagData, error);
			return false; // Indicate failure
		}
	}

	/**
	 * Event that is emitted whenever unprocessed items appear in the directory of the current page. Returns if filtering was invoked.
	 */
	function onScroll() {
		logTrace('invoking onScroll()');

		if (pageLoads === true) {
			logWarn('Cancelled onScroll event, page load is in progress.');
			return false;
		}
		if (directoryFilterRunning === true) {
			logWarn('Cancelled onScroll event, directory filter already running.');
			return false;
		}

		let remainingItems = [];

		logInfo('Scroll/Dynamic content detected, filtering unprocessed items...');

		try {
			if (currentPageType === 'following' && hideFollowing === false) {
				// Only filter recommended items if on 'following' and filtering is disabled for followed items
				remainingItems = filterDirectory('recommended', true); // Target recommended specifically if they appear dynamically
				filterDirectory('unprocessed', false); // Mark any other new items as processed without hiding
			} else {
				// Filter all newly appeared items
				remainingItems = filterDirectory('unprocessed', true);
			}

			if (remainingItems.length > 0) {
				logInfo('Attaching buttons to', remainingItems.length, 'newly processed items.');
				attachHideButtons(remainingItems);
			} else {
				logVerbose('No new items remained after filtering dynamically loaded content.');
			}
			return true; // Indicate filtering happened
		} catch (error) {
			logError("Error during onScroll processing:", error);
			// Ensure filter flag is reset if an error occurs mid-filter
			directoryFilterRunning = false;
			return false; // Indicate failure
		}
	}

/* END: events */

/* BEGIN: blacklist */

	/**
	 * Initializes the blacklisted items collection by setting up the default item types in the provided object.
	 */
	function initBlacklistedItems(collection) {
		logTrace('invoking initBlacklistedItems($)', collection);

		const itemTypes = [
			'categories',
			'channels',
			'tags',
			'titles'
		];

		// base container
		if (typeof collection !== 'object' || collection === null) { // Ensure collection is an object
			collection = {};
		}

		const itemTypesLength = itemTypes.length;
		for (let i = 0; i < itemTypesLength; i++) {

			let itemType = itemTypes[i];

			// Ensure each type exists and is an object (for map types) or array (for titles)
			if (collection[itemType] === undefined) {
				collection[itemType] = (itemType === 'titles') ? [] : {};
			} else if (itemType === 'titles' && !Array.isArray(collection[itemType])) {
				logWarn('Correcting non-array titles blacklist to array.');
				collection[itemType] = []; // Force titles to be an array
			} else if (itemType !== 'titles' && (typeof collection[itemType] !== 'object' || Array.isArray(collection[itemType]) || collection[itemType] === null)) {
				logWarn('Correcting non-object', itemType, 'blacklist to object.');
				collection[itemType] = {}; // Force others to be objects
			}
		}

		return collection;
	}

	/**
	 * Retrieves all blacklisted items from the storage.
	 */
	async function getBlacklistedItems() {
		logTrace('invoking getBlacklistedItems()');

		let blacklistedItems = {};
		try {
			const result = await storageGet(null); // Get all storage data for the current mode

			if (result) { // Check if result is not null/undefined
				if (typeof result.blacklistedItems === 'object' && result.blacklistedItems !== null) {
					blacklistedItems = result.blacklistedItems;
					logVerbose('Loaded single blacklist object.');
				} else if (typeof result['blItemsFragment0'] === 'object') {
					blacklistedItems = mergeBlacklistFragments(result);
					logVerbose('Merged fragments to blacklist:', Object.keys(result).filter(k => k.startsWith('blItemsFragment')).length, 'fragments processed.');
				} else {
					// It's normal for storage to be empty initially
					logInfo('No valid blacklist data found in storage (or storage is empty).');
				}
			} else {
				// This might happen if storage API fails, less common than empty storage
				logWarn('Storage retrieval returned null/undefined.');
			}
		} catch (error) {
			logError('Error retrieving blacklist items:', error);
		}

		// Ensure the final object is initialized correctly even if loading failed
		return initBlacklistedItems(blacklistedItems);
	}

	/**
	 * Stores the provided items or a single item in the local cache.
	 * Maintains several internal lists to improve matching performance.
	 * UPDATE: Clears caches before rebuilding or adding single items.
	 */
	function modifyBlacklistedItems(arg1, arg2) {
		logTrace('invoking modifyBlacklistedItems($, $)', arg1, arg2);

		// Ensure storedBlacklistedItems is initialized
		if (typeof storedBlacklistedItems !== 'object' || storedBlacklistedItems === null) {
			storedBlacklistedItems = initBlacklistedItems({});
		}

		try {
			// Overload 1: modifyBlacklistedItems(type, term) - Add single item
			if (typeof arg1 === 'string' && typeof arg2 === 'string') {
				const type = arg1;
				const term = arg2;

				// Ensure the type exists in the main blacklist object
				if (storedBlacklistedItems[type] === undefined) {
					storedBlacklistedItems[type] = (type === 'titles') ? [] : {};
				}

				// Add to main blacklist object
				if(type === 'titles') {
					if (Array.isArray(storedBlacklistedItems[type]) && !storedBlacklistedItems[type].includes(term)) {
						storedBlacklistedItems[type].push(term);
					} else if (!Array.isArray(storedBlacklistedItems[type])) {
						logError("Attempted to push title to non-array blacklist:", type);
					}
				} else {
					if (typeof storedBlacklistedItems[type] === 'object' && storedBlacklistedItems[type] !== null) {
						storedBlacklistedItems[type][term] = 1;
					} else {
						logError("Attempted to add key to non-object blacklist:", type);
					}
				}

				// Rebuild specific cache type - more robust than just adding
				rebuildCacheForType(type);
				logVerbose('Added single item and rebuilt cache for type:', type, term);

			// Overload 2: modifyBlacklistedItems(fullBlacklistObject) - Replace entire cache
			} else if (typeof arg1 === 'object' && arg1 !== null && arg2 === undefined) {
				const items = initBlacklistedItems(arg1); // Ensure structure is correct
				storedBlacklistedItems = items;

				// Clear and rebuild all caches
				rebuildAllCaches();
				logVerbose('Replaced and rebuilt all blacklist caches.');
			} else {
				logError('Invalid arguments passed to modifyBlacklistedItems:', arg1, arg2);
			}
		} catch (error) {
			logError("Error modifying blacklist cache:", error);
		}
		// Log cache sizes for debugging
		// logVerbose('Cache sizes:',
		//     'Exact:', Object.values(cacheExactTerms).reduce((sum, arr) => sum + arr.length, 0),
		//     'Loose:', Object.values(cacheLooseTerms).reduce((sum, arr) => sum + arr.length, 0),
		//     'RegExp:', Object.values(cacheRegExpTerms).reduce((sum, arr) => sum + arr.length, 0)
		// );
	}

	/** Helper function to rebuild all matching caches */
	function rebuildAllCaches() {
		cacheExactTerms  = {};
		cacheLooseTerms  = {};
		cacheRegExpTerms = {};
		logVerbose('Rebuilding all blacklist caches...');
		for (const itemType in storedBlacklistedItems) {
			if (storedBlacklistedItems.hasOwnProperty(itemType)) {
				rebuildCacheForType(itemType);
			}
		}
		logVerbose('Finished rebuilding all caches.');
	}

	/** Helper function to rebuild cache for a specific type */
	function rebuildCacheForType(itemType) {
		// Clear existing cache for this type
		cacheExactTerms[itemType] = [];
		cacheLooseTerms[itemType] = [];
		cacheRegExpTerms[itemType] = [];

		if (!storedBlacklistedItems || !storedBlacklistedItems[itemType]) return;

		let terms;
		if (Array.isArray(storedBlacklistedItems[itemType])) { // Handle titles array
			terms = storedBlacklistedItems[itemType];
		} else if (typeof storedBlacklistedItems[itemType] === 'object' && storedBlacklistedItems[itemType] !== null){ // Handle category/channel/tag objects
			terms = Object.keys(storedBlacklistedItems[itemType]);
		} else {
			logWarn('Unexpected data structure for itemType during cache rebuild:', itemType, storedBlacklistedItems[itemType]);
			return; // Skip invalid types
		}

		for (const term of terms) {
			if (typeof term !== 'string') continue; // Skip non-string terms

			if (isExactTerm(term)) {
				const exactVal = term.substring(1, term.length - 1);
				if (!cacheExactTerms[itemType].includes(exactVal)) {
					cacheExactTerms[itemType].push(exactVal);
				}
			} else if (isLooseTerm(term)) {
				// Normalize loose terms before caching for consistent matching
				const looseVal = normalizeCase(term.substring(1));
				if (!cacheLooseTerms[itemType].includes(looseVal)) {
					cacheLooseTerms[itemType].push(looseVal);
				}
			} else if (isRegExpTerm(term)) {
				const regexp = toRegExp(term);
				if (regexp && !cacheRegExpTerms[itemType].some(r => r.toString() === regexp.toString())) {
					cacheRegExpTerms[itemType].push(regexp);
				}
			}
			// Regular terms (non-prefixed) are handled by the main storedBlacklistedItems check in matchTerms
			// or by the default loose matching for titles.
		}
	}

	/**
	 * Stores all blacklisted items in the storage.
	 */
	async function putBlacklistedItems(items, attemptRecovery = true) { // Default attemptRecovery to true
		logTrace('invoking putBlacklistedItems($, $)', items, attemptRecovery);

		if (typeof items !== 'object' || items === null) {
			logError('putBlacklistedItems called with invalid items:', items);
			// Don't throw, but return to prevent further errors
			return;
		}

		const mode   = await getStorageMode();
		const isSync = (mode === 'sync');

		if (attemptRecovery === false) {
			logWarn('Attempting to restore backup to storage:', backupBlacklistedItems); // Log the backup being restored
			// Use the backup data for the recovery attempt
			items = backupBlacklistedItems;
		}

		// Always use a clone to avoid modifying the live cache during async ops
		// Ensure the clone is also initialized correctly
		const itemsToStore = initBlacklistedItems(cloneBlacklistItems(items));

		let dataToStore = { 'blacklistedItems': itemsToStore };
		let requiresSplitting = false;

		if (isSync) {
			try {
				const requiredSize = measureStoredSize(dataToStore);
				if (requiredSize > storageSyncMaxSize) {
					logWarn('Blacklist (' + requiredSize + ' bytes) exceeds sync limit per item (' + storageSyncMaxSize + '). Splitting...');
					requiresSplitting = true;
					dataToStore = splitBlacklistItems(itemsToStore); // Use the cloned, initialized data
					if (Object.keys(dataToStore).length > storageSyncMaxKeys) {
						logError('Cannot save blacklist: Number of fragments (' + Object.keys(dataToStore).length + ') exceeds MAX_ITEMS (' + storageSyncMaxKeys + ').');
						// Optionally, attempt to save to local storage instead or alert user
						alert(chrome.i18n.getMessage('alert_StorageQuota')); // Inform user
						// Force switch to local storage and try saving there
						await chrome.storage.local.set({ 'useLocalStorage': true });
						logWarn('Forcing switch to local storage due to sync quota limits.');
						// Retry with local, use backup, don't loop recovery
						await putBlacklistedItems(backupBlacklistedItems, false);
						return; // Exit after attempting local save
					}
					logVerbose('Splitting of blacklist completed. Fragments:', Object.keys(dataToStore).length);
				}
			} catch (splitError) {
				logError("Error during blacklist splitting:", splitError);
				// Handle splitting error, maybe try local storage
				if (attemptRecovery) {
					alert(chrome.i18n.getMessage('alert_StorageIssue') + '\n\nError during splitting. Trying local storage.');
					await chrome.storage.local.set({ 'useLocalStorage': true });
					await putBlacklistedItems(backupBlacklistedItems, false);
				}
				return; // Stop processing if splitting fails
			}
		}

		// Clear previous data structure (either single key or fragments) before setting new data
		const keysToRemove = ['blacklistedItems'];
		for (let i = 0; i < storageMaxFragments; i++) { // Use defined constant
			keysToRemove.push('blItemsFragment' + i);
		}

		try {
			logVerbose('Clearing previous blacklist keys:', keysToRemove);
			await storageRemove(keysToRemove); // Ensure removal finishes before setting

			// Now set the new data (either single object or fragments)
			logVerbose('Attempting to save data to', mode, 'storage:', dataToStore);
			const error = await storageSet(dataToStore); // storageSet returns null on success, error object on failure

			// Handle potential errors
			if (error) { // Check if error object exists and is truthy
				logError('Error saving blacklist to', mode, 'storage:', error.message || error);
				if (attemptRecovery) { // Only alert and retry once
					const suffix = ('\n\nStorage Service Error:\n' + (error.message || 'Unknown error'));
					let alertMessage = chrome.i18n.getMessage('alert_StorageIssue'); // Default message

					if (error.message && error.message.includes('QUOTA_BYTES')) {
						alertMessage = chrome.i18n.getMessage('alert_StorageQuota');
					} else if (error.message && error.message.includes('MAX_ITEMS')) {
						alertMessage = chrome.i18n.getMessage('alert_StorageQuota'); // Often related if splitting failed
					} else if (error.message && error.message.includes('MAX_WRITE_OPERATIONS_PER')) {
						alertMessage = chrome.i18n.getMessage('alert_StorageThrottle');
					}
					alert(alertMessage + suffix);

					// If sync failed, force switch to local and retry ONLY ONCE without recovery loop
					if (isSync) {
						logWarn('Sync save failed. Forcing switch to local storage and attempting recovery.');
						await chrome.storage.local.set({ 'useLocalStorage': true });
						await putBlacklistedItems(backupBlacklistedItems, false); // Use backup, prevent recovery loop
					} else {
						logError('Local storage save also failed. Cannot recover.');
						// Restore the in-memory cache from backup as a last resort
						modifyBlacklistedItems(backupBlacklistedItems);
					}
				} else {
					logError('Recovery attempt failed or was disabled. Blacklist may not be saved correctly.');
					// Restore cache from backup if recovery wasn't attempted or failed
					modifyBlacklistedItems(backupBlacklistedItems);
				}
			} else {
				logInfo('Blacklist successfully saved to', mode, 'storage.');
				// Synchronize new items among tabs (send the original structure)
				// No need to await sync, it's fire-and-forget
				syncBlacklistedItems(itemsToStore); // Send the data that was intended to be saved

				// Update backup cache ONLY on successful save
				if (attemptRecovery) { // Only update backup if it wasn't a recovery attempt itself
					backupBlacklistedItems = cloneBlacklistItems(itemsToStore); // Backup the data that was successfully saved
					logVerbose('Created new backup of blacklist.');
				}
			}
		} catch (storageError) {
			logError("Critical error during storage remove/set operations:", storageError);
			// Attempt recovery if enabled
			if (attemptRecovery) {
				alert(chrome.i18n.getMessage('alert_StorageIssue') + '\n\nCritical storage error. Trying local storage.');
				if (isSync) {
					await chrome.storage.local.set({ 'useLocalStorage': true });
					await putBlacklistedItems(backupBlacklistedItems, false);
				} else {
					modifyBlacklistedItems(backupBlacklistedItems);
				}
			} else {
				modifyBlacklistedItems(backupBlacklistedItems);
			}
		}
	}


	/**
	 * Informs all tabs (including the one that invokes this function) about the provided items in order to keep them synchronized.
	 */
	async function syncBlacklistedItems(items) {
		logVerbose('Broadcasting blacklist update to other tabs...');
		try {
			// Send message without waiting for responses from all tabs
			chrome.runtime.sendMessage({ blacklistedItems: items, storage: false }).catch(error => {
				// Log errors if sending fails (e.g., no listeners), but don't block
				if (error.message && (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist"))) {
					logVerbose("No other active Twitch tabs to sync with or background script unavailable.");
				} else {
					logError('Error broadcasting blacklist sync message:', error);
				}
			});
		}
		catch (error) { // Catch synchronous errors during send setup
			logError('Failed to initiate blacklist synchronization:', error);
		}
	}

/* END: blacklist */

/* BEGIN: initialization */

	/**
	 * Fetches blacklist from storage and starts filtering.
	 */
	async function init() {
		logTrace('invoking init()');

		if (initRun === true) {
			return logWarn('Aborting init(), already initialized.');
		}

		logInfo('Extension Core Initialization Starting...');

		try {
			// Prepare blacklist (regardless of the current page support)
			const blacklistedItems = await getBlacklistedItems();

			// Initialize defaults and cache blacklisted items from storage
			modifyBlacklistedItems(blacklistedItems); // This also initializes if empty and builds caches
			logInfo('Blacklist loaded and caches built. Items:',
				Object.keys(storedBlacklistedItems.categories || {}).length, 'categories,',
				Object.keys(storedBlacklistedItems.channels || {}).length, 'channels,',
				Object.keys(storedBlacklistedItems.tags || {}).length, 'tags,',
				(storedBlacklistedItems.titles || []).length, 'titles.'
			);

			// Create initial backup
			backupBlacklistedItems = cloneBlacklistItems(storedBlacklistedItems);

			/* BEGIN: root */
				// Ensure rootNode is set, default to document if needed
				const rootNodeSelector = '#root';
				rootNode = document.querySelector(rootNodeSelector);
				if (!rootNode) {
					logWarn('Root node (#root) not found. Using document as rootNode.');
					rootNode = document; // Fallback to document
				} else {
					logVerbose('Root node found:', rootNode);
				}
			/* END: root */

			// Mark initialization as complete *before* starting page processing
			initRun = true;

			// Start page processing
			onPageChange(currentPage); // Trigger initial page processing
			logInfo('Extension Core Initialization Complete.');

		} catch (error) {
			logError("Critical error during extension initialization:", error);
			// Optionally, disable the extension or show an error message to the user
			initRun = false; // Mark as not initialized if error occurred
		}
	}

	/**
	 * Retrieves the extension state from storage.
	 */
	async function initExtensionState() {
		logTrace('invoking initExtensionState()');

		const stateKeys = [
			'enabled',
			'renderButtons',
			'hideFollowing',
			'hideReruns'
		];
		let result = {}; // Default empty object

		try {
			result = await storageGet(stateKeys);
			if (!result) result = {}; // Ensure result is an object even if storageGet returns null/undefined
		} catch(error) {
			logError("Error getting extension state from storage:", error);
			// Use defaults if storage fails
			result = {};
		}

		// Set defaults first, then override if value exists in storage result
		enabled = (typeof result['enabled'] === 'boolean') ? result['enabled'] : true;
		renderButtons = (typeof result['renderButtons'] === 'boolean') ? result['renderButtons'] : true;
		hideFollowing = (typeof result['hideFollowing'] === 'boolean') ? result['hideFollowing'] : true;
		hideReruns = (typeof result['hideReruns'] === 'boolean') ? result['hideReruns'] : false;

		logInfo('Extension State Initialized:', { enabled, renderButtons, hideFollowing, hideReruns });
	}

	/**
	 * Waits for the DOM to load, then starts initialization.
	 */
	window.addEventListener('DOMContentLoaded', async function callback_windowLoad() {
		logTrace('event invoked: window.DOMContentLoaded()');

		// Init extension's state first
		await initExtensionState();

		if (enabled === false) {
			return logWarn('Extension is disabled. Aborting page initialization.');
		}

		// Start core initialization
		await init();
	});

/* END: initialization */