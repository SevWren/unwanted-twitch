//Summary of Key Changes Implemented:

//getDirectoryItemNodes: Updated selectors to target the main container divs (div.jCGmCy for streams, div.ScTowerItem-sc-1sjzzes-2 for categories)
//instead of the inner <a> tags. Placeholders for VOD/Clip selectors added.

//getSidebarItemNodes: Updated to target the main container div.side-nav-card.
//Added logic to specifically query within the "Recommended Channels" section when mode is 'recommended'.


//readItem: Updated to expect the container node and determine item type based on its class or structure, then
//call the appropriate read... function, passing both container and the primary link node.

//readChannel: Updated to expect container and link nodes. Selectors for channel name and title updated to
//match the new structure within the container. Logic for finding the tag container updated. Optional chaining (?.) added for robustness.

//readCategory: Updated to expect container and link nodes. Selectors for category name (h3[title]) and tag container updated based on twitch.tv_directory_html.txt.

//readTags: Updated selector to button.tw-tag[data-a-target]. Expects the specific tag container node as input.

//readSidebarItem: Updated to expect the container node. Finds the link node inside.
//Logic for expanded view extraction confirmed. Added separate helper readCollapsedSidebarItem using existing logic (needs verification with collapsed HTML).
	
//removeDirectoryItem / removeSidebarItem: Simplified to hide the containerNode directly and mark the original node (if found) or the container with data-uttv-hidden.

//attachHideButtonToCard: Updated to find the container node, append the button to it, and set position: relative. Added comments about required CSS changes.

//attachHideButtonsToTags: Updated to accept the tag array and container node. Appends the 'X' button directly to each tag button. Added comments about required CSS changes.

//addManagementButton: Updated targetParent logic slightly for robustness.

//onPageChange: Refined the logic to wait for any primary content card indicator (contentCardSelector) before proceeding. Improved logging.

//onHideItem / onHideTag: Updated to receive data from the button's data attributes.

//General Robustness: Added more checks for null/undefined nodes and used optional chaining (?.)
//more extensively to prevent errors if elements are missing. Improved logging verbosity in key areas.

//Storage Logic: Minor improvements in getBlacklistedItems and putBlacklistedItems for handling potential errors and
//ensuring data structures are initialized correctly. Ensured cloned data is used for storage operations. Added recovery logic for sync storage failures (switch to local).

//Initialization: Ensured mainNode is found before proceeding in onPageChange. Ensured initBlacklistedItems is called correctly after loading from storage.

//This updated script should be much closer to working with the current Twitch layouts you've provided
//for stream and category cards, as well as the expanded sidebar. The next step is to test this and provide the remaining HTML snippets (VOD, Clip, Collapsed Sidebar).


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
			return true;
		}

		// extension
		if (typeof request.extension === 'string') {

			if (request.extension === 'disable') {

				enabled = false;
				await storageSet({ 'enabled': enabled });

				window.location.reload();
				return true;

			} else if (request.extension === 'enable') {

				enabled = true;
				await storageSet({ 'enabled': enabled });

				window.location.reload();
				return true;
			}
		}

		// blacklistedItems
		if (typeof request.blacklistedItems === 'object') {

			const items     = request.blacklistedItems;
			const cacheOnly = (request.storage === false);

			if (cacheOnly) {

				logInfo('Synchronizing new blacklist.', items);

				// store new items in cache
				modifyBlacklistedItems(items);

			} else {

				if (
					(typeof request.dispatcherIndex !== 'number') ||
					(request.dispatcherIndex <= 0)
				) {

					logInfo('Storing new blacklist.', items);
					await putBlacklistedItems(items);

				} else {

					logInfo('Ignoring request to store new blacklist, because the request is already being processed by another tab.', request);
				}
			}

			// invoke directory filter
			if (
				(currentPageType !== 'following') ||
				(hideFollowing === true)
			) {

				filterDirectory();

			} else {

				// invoke directory filter for recommended section
				filterDirectory('recommended');

				// mark remaining items as being processed
				filterDirectory('unprocessed', false);
			}

			// invoke sidebar filter
			if (hideFollowing === true) {

				filterSidebar();

			} else {

				filterSidebar('recommended');
			}

			return true;
		}

		logError('Unknown command received. The following command was ignored:', request);
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
				return 'categories';

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
					return 'channels'; // Needs verification (stream card structure assumed)
				}
		}

		return logWarn('Unable to detect type of page:', page);
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

		const observerCooldown = 500;

		// Use more specific selector for the sidebar container
		const targetSelector = 'nav#side-nav'; // Targeting the nav element directly
		const target         = rootNode.querySelector(targetSelector);

		if (target !== null) {
			// Disconnect previous observer if any
			if (target.observer) {
				target.observer.disconnect();
				logVerbose('Disconnected previous sidebar observer.');
			}

			const observer = new MutationObserver(function callback_observeSidebar(mutations) {
				logTrace('callback invoked: observeSidebar()', mutations);

				// Force cooldown to avoid processing multiple mutations at once
				const timeElapsed = (new Date() - lastSidebarChange);
				if (timeElapsed < observerCooldown) {
					logVerbose('Skipping sidebar mutation due to cooldown.');
					return; // Skip if within cooldown
				}
				lastSidebarChange = new Date();
				logVerbose('Sidebar mutation detected, proceeding with filtering.');

				// Trigger sidebar filter
				if (hideFollowing === true) {
					filterSidebar();
				} else {
					filterSidebar('recommended');
				}
			});

			// Observe changes in children and subtree that might add/remove channel items
			observer.observe(target, { childList: true, subtree: true });
			target.observer = observer; // Store observer reference
			logVerbose('Sidebar observer attached.', target);

		} else {
			logWarn('Unable to find sidebar. Expected:', targetSelector);
		}
	}


	/**
	 * Checks for unprocessed items in the directory of the current page and dispatches a scroll event if necessary.
	 */
	function listenToScroll() {
		logTrace('invoking listenToScroll()');

		const interval = 1000;

		window.clearInterval(checkForItemsInterval);
		checkForItemsInterval = window.setInterval(function checkForItems() {

			// prevent listening during page load
			if (pageLoads === true) {

				//logVerbose('Skipping checkForItems(), because page load is in progress.');
				// Don't clear interval here, page load might finish
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

			const nodes       = getDirectoryItemNodes('unprocessed');
			const nodesLength = nodes.length;

			// when there are unprocessed items in the directory, assume that the user scrolled down or content loaded dynamically
			if (nodesLength > 0) {

				logInfo('Found ' + nodesLength + ' unprocessed nodes in the directory of the current page.', nodes);
				onScroll();
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
			scrollbarNode.dispatchEvent(
				new Event('scroll', { bubbles: true }) // Ensure event bubbles up
			);
			return true;

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

		return (document.getElementById('ffz-script') !== null);
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

			logWarn('Directory filter already running.');
			return [];
		}

		directoryFilterRunning = true;
		logVerbose('Starting directory filter (mode:', mode, 'remove:', remove, ')');

		const items          = getDirectoryItems(mode);
		const remainingItems = filterDirectoryItems(items, remove);

		directoryFilterRunning = false;
		logVerbose('Finished directory filter. Remaining items:', remainingItems.length);

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

		let remainingItems = [];

		const itemsLength = items.length;
		logVerbose('Filtering', itemsLength, 'directory items...');
		for (let i = 0; i < itemsLength; i++) {

			const item = items[i];
			if (!item || !item.node) {
				logWarn('Skipping invalid item:', item);
				continue;
			}

			// mark item node as being processed
			// Use the container node if available, otherwise the primary node
			const nodeToMark = item.containerNode || item.node;
			nodeToMark.setAttribute('data-uttv-processed', '');


			if (remove === false) {
                remainingItems.push(item); // Keep item if not removing
                continue;
            }

			if (isBlacklistedItem(item) === true) {

				if (removeDirectoryItem(item) === true) {

					logVerbose('Removed item in directory due to being blacklisted:', item.type, item.name || item.category || item.title);
					// Do not push to remainingItems
					continue;

				} else {

					logError('Unable to remove blacklisted item in directory:', item);
					// If removal failed, still treat it as visible for safety
					remainingItems.push(item);
				}
			} else {
				// If not blacklisted, add to remaining items
				remainingItems.push(item);
			}
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

			logWarn('Sidebar filter already running.');
			return [];
		}

		sidebarFilterRunning = true;
		logVerbose('Starting sidebar filter (mode:', mode, ')');

		const items          = getSidebarItems(mode);
		const remainingItems = filterSidebarItems(items); // Always removes if blacklisted

		sidebarFilterRunning = false;
		logVerbose('Finished sidebar filter. Remaining items:', remainingItems.length);


		return remainingItems;
	}

	/**
	 * Filters the provided sidebar items and returns the remaining (not blacklisted) items.
	 */
	function filterSidebarItems(items) {
		logTrace('invoking filterSidebarItems($)', items);

		let remainingItems = [];

		const itemsLength = items.length;
		logVerbose('Filtering', itemsLength, 'sidebar items...');
		for (let i = 0; i < itemsLength; i++) {

			const item = items[i];
            if (!item || !item.node) {
                logWarn('Skipping invalid sidebar item:', item);
                continue;
            }


			// mark item node as being processed
			// Use the container node if available, otherwise the primary node
            const nodeToMark = item.containerNode || item.node;
            nodeToMark.setAttribute('data-uttv-processed', '');


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

		const itemNodes       = getDirectoryItemNodes(mode); // This now returns containers
		const itemNodesLength = itemNodes.length;
        logVerbose('Found', itemNodesLength, 'potential item nodes for mode:', mode);

		for (let i = 0; i < itemNodesLength; i++) {
            // Pass the container node to readItem
			const item = readItem(itemNodes[i]);
			if (item === null) {
                logVerbose('Failed to read item from node:', itemNodes[i]);
                continue;
            }
			items.push(item);
		}

		const itemsLength = items.length;

		if (itemsLength > 0) {
			logVerbose('Successfully read ' + itemsLength + ' items on the current page:', items.map(it => it.name || it.category || it.title || 'Unknown'));
		} else {
			logWarn('No valid items read from the found nodes.', itemNodes);
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

		// Selector for Stream Cards (Game, Channels, Following, Explore, Frontpage)
		// Targets the main container div identified in HTML analysis
		selectors.push(`${prefix}div.Layout-sc-1xcs6mc-0.jCGmCy${suffix}`);

		// Selector for Category Cards (Categories page)
		// Targets the main container div identified in HTML analysis
		selectors.push(`${prefix}div.Layout-sc-1xcs6mc-0.ScTowerItem-sc-1sjzzes-2${suffix}`);

        // --- TODO: Add selectors for VOD and Clip cards here when their structure is known ---
		// Example: selectors.push(`${prefix}div.vod-card-container-selector${suffix}`);
		// Example: selectors.push(`${prefix}div.clip-card-container-selector${suffix}`);


		const combinedSelector = selectors.join(', ');

        if (!mainNode) {
            logError('mainNode is null, cannot query for directory items.');
            return [];
        }

		const nodes       = mainNode.querySelectorAll(combinedSelector);
		const nodesLength = nodes.length;

		if (nodesLength > 0) {
			logTrace('Found ' + nodesLength + ' container nodes in directory using selector:', combinedSelector, nodes);
		} else {
			logTrace('Unable to find container nodes in directory. Expected selector:', combinedSelector);
		}

		return nodes;
	}


	/**
	 * Returns all items matching the specified mode in the sidebar of the current page.
	 */
	function getSidebarItems(mode) {
		logTrace('invoking getSidebarItems($)', mode);

		const items = [];

		const itemNodes       = getSidebarItemNodes(mode); // This now returns containers
		const itemNodesLength = itemNodes.length;
        logVerbose('Found', itemNodesLength, 'potential sidebar nodes for mode:', mode);

		for (let i = 0; i < itemNodesLength; i++) {
			const item = readSidebarItem(
				itemNodes[i] // Pass the container node
			);
			if (item === null) {
                logVerbose('Failed to read sidebar item from node:', itemNodes[i]);
                continue;
            }
			items.push(item);
		}

		const itemsLength = items.length;

		if (itemsLength > 0) {
			logVerbose('Successfully read ' + itemsLength + ' sidebar items:', items.map(it => it.name || 'Unknown'));
		} else {
			logWarn('No valid sidebar items read from the found nodes.', itemNodes);
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
		} else {
			logWarn('Unable to find sidebar on the current page. Expected:', sidebarSelector);
		}

		return nodes; // Return the container nodes
	}

	/**
	 * Returns item information based on the provided container node.
	 * UPDATE: Expects the main container node now.
	 */
	function readItem(containerNode) {
		logTrace('invoking readItem($)', containerNode);

		if (!containerNode) { return null; }

		// Check if it's a category card container
		if (containerNode.matches('div.Layout-sc-1xcs6mc-0.ScTowerItem-sc-1sjzzes-2')) {
			const linkNode = containerNode.querySelector('a[data-a-target="tw-box-art-card-link"]');
			if (linkNode) {
				return readCategory(containerNode, linkNode); // Pass both container and link
			} else {
				logWarn('Could not find link node within category container:', containerNode);
				return null;
			}
		}

		// Check if it's a stream card container
		if (containerNode.matches('div.Layout-sc-1xcs6mc-0.jCGmCy')) {
			const linkNode = containerNode.querySelector('a.ScCoreLink-sc-16kq0mq-0.hcWFnG');
            if (linkNode) {
                 return readChannel(containerNode, linkNode); // Pass both container and link
            } else {
                 logWarn('Could not find link node within stream container:', containerNode);
                 return null;
            }
		}

		// --- TODO: Add checks for VOD/Clip card container selectors here ---

		// Fallback/Error
		logError('Unable to identify item type from container node:', containerNode);
		// Mark as processed to avoid re-checking unknown items repeatedly
        containerNode.setAttribute('data-uttv-processed', '');
		return null;
	}

	/**
	 * Returns information for a channel item based on the provided container node and link node.
	 * UPDATE: Updated selectors based on HTML analysis.
	 */
	function readChannel(containerNode, linkNode, findCategory = true, findTags = true) {
		logTrace('invoking readChannel($, $, $, $)', containerNode, linkNode, findCategory, findTags);

		if (!containerNode || !linkNode) return null;

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
				return logError('Unable to determine name of channel.', containerNode); // Name is critical
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
		result.rerun = (containerNode.querySelector('.stream-type-indicator--rerun') !== null); // Keep existing check for now

		return result;
	}


	/**
	 * Returns information for a category item based on the provided container node and link node.
	 * UPDATE: Updated selectors based on HTML analysis.
	 */
	function readCategory(containerNode, linkNode, findTags = true) {
		logTrace('invoking readCategory($, $, $)', containerNode, linkNode, findTags);

        if (!containerNode || !linkNode) return null;

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

		/* BEGIN: name */
			const nameNode = containerNode.querySelector('article h3[title]'); // Target h3 inside article
			result.name = nameNode?.textContent?.trim() ?? '';
			result.category = result.name; // For categories, name and category are the same
			if (!result.name) {
				return logError('Unable to determine name of category.', containerNode);
			}
		/* END: name */

		/* BEGIN: tags */
			if (findTags) {
				const tagContainer = containerNode.querySelector('article .Layout-sc-1xcs6mc-0.fLNVxt'); // Target specific tag container div
				if (tagContainer) {
                    result.tags = readTags(tagContainer);
                } else {
                    logVerbose('Unable to determine tag container for category.', containerNode);
                }
			}
		/* END: tags */

		return result;
	}

	/**
	 * Returns all tags found in the provided tag container node.
	 * UPDATE: Updated selector for tag buttons.
	 */
	function readTags(tagContainerNode) {
		logTrace('invoking readTags($)', tagContainerNode);

		let tags = [];
		if (!tagContainerNode) {
            logVerbose('No tag container node provided to readTags.');
            return tags;
        }

		const tagsSelector = 'button.tw-tag[data-a-target]'; // Select the button tags
		const tagNodes     = tagContainerNode.querySelectorAll(tagsSelector);
		const nodesLength  = tagNodes.length;

		if (nodesLength > 0) {
            logTrace('Found', nodesLength, 'tag nodes in container:', tagContainerNode);
			for (let i = 0; i < nodesLength; i++) {
				const tagNode = tagNodes[i];
				const tagName = tagNode.getAttribute('data-a-target');

				if (!tagName) {
                    logWarn('Tag node missing data-a-target:', tagNode);
                    continue;
                }

				// Optional: Ignore meta targets if necessary (though unlikely within this container)
				// if (tagName.indexOf('preview-card') >= 0) { continue; }

				tags.push({
					name: tagName,
					node: tagNode // Keep reference to the button itself
				});
			}
		} else {
			logTrace('Unable to find any tags in container. Expected selector:', tagsSelector, 'within:', tagContainerNode);
		}
		logVerbose('Extracted tags:', tags.map(t => t.name));
		return tags;
	}


	/**
	 * Returns sidebar item information based on the provided container node.
	 * UPDATE: Expects container node, uses existing logic for data extraction within it. Needs collapsed view verification.
	 */
	function readSidebarItem(containerNode, findCategory = false) { // Default findCategory to false for sidebar
		logTrace('invoking readSidebarItem($, $)', containerNode, findCategory);

        if (!containerNode) return null;

        const linkNode = containerNode.querySelector('a.side-nav-card__link'); // Find the main link inside the container

        if (!linkNode) {
            // Special case for collapsed sidebar where the container itself might be the link/have the aria-label
            if (containerNode.matches('a.side-nav-card')) {
                 // Handle collapsed logic here if different, currently based on existing logic
                return readCollapsedSidebarItem(containerNode);
            }
            logError('Could not find primary link node within sidebar container:', containerNode);
            return null;
        }

		let result = {
			type:     'channels',
			name:     '',
			category: '',
			tags:     [], // Tags usually not shown in sidebar
			title:    '', // Titles not shown in sidebar
			rerun:    false,
			node:     linkNode, // Reference the link node
            containerNode: containerNode // Reference the container
		};

		/* BEGIN: name - Expanded View */
			const nameNode = linkNode.querySelector('[data-a-target="side-nav-title"] p[title], [data-a-target="side-nav-card-metadata"] p[title]');
			result.name = nameNode?.textContent?.trim() ?? '';
			if (!result.name) {
				// If name not found in expanded structure, maybe it's collapsed? Try that logic.
				return readCollapsedSidebarItem(containerNode); // Pass the container
			}
		/* END: name - Expanded View */

		/* BEGIN: category - Expanded View */
			const categoryNode = linkNode.querySelector('[data-a-target="side-nav-game-title"] p'); // Target the paragraph inside
			result.category = categoryNode?.textContent?.trim() ?? '';
			// No warning if category is empty, it's expected for offline channels etc.
		/* END: category - Expanded View */

		// Rerun check - Needs verification if applicable to sidebar
		result.rerun = (linkNode.querySelector('.tw-svg__asset--videorerun') !== null);

		return result;
	}

    /** Helper for collapsed sidebar logic - Needs HTML verification */
    function readCollapsedSidebarItem(node) {
        logTrace('invoking readCollapsedSidebarItem($)', node);
        // Assumes 'node' is the 'a.side-nav-card' element or the container div
        let name = '';
        const avatarNode = node.querySelector('.tw-avatar[aria-label]'); // Check for aria-label first
        if (avatarNode) {
            name = avatarNode.getAttribute('aria-label');
        } else {
            const imageNode = node.querySelector('.tw-image-avatar[alt]'); // Fallback to image alt
            if (imageNode) {
                name = imageNode.getAttribute('alt');
            }
        }

        if (!name) {
             return logError('Unable to determine name of collapsed sidebar channel.', node);
        }

        return {
			type:     'channels',
			name:     name,
			category: '', // No category in collapsed view
			tags:     [],
			title:    '',
			rerun:    false,
			node:     node, // Reference the node itself (likely the <a> or container)
            containerNode: node
		};
    }

	/**
	 * Returns if the specified item is blacklisted.
	 */
	function isBlacklistedItem(item) {
		logTrace('invoking isBlacklistedItem($)', item);

        if (!item || typeof item !== 'object') {
            logError('Invalid item passed to isBlacklistedItem:', item);
            return false;
        }

		// blacklisted for being a rerun
		if (hideReruns && (item.rerun === true)) {
            logTrace('Item blacklisted: Rerun');
            return true;
        }

        // Check item type exists in blacklist cache
		if (storedBlacklistedItems[item.type] === undefined && item.type !== 'categories') { // Allow category check even if type isn't 'categories'
            //logTrace('Item type not in blacklist:', item.type);
             // Check category only if item isn't already a category type
            if (item.type !== 'categories' && item.category && matchTerms(item.category, 'categories')) {
                logTrace('Item blacklisted by Category:', item.category);
                return true;
            }
            // Check tags
            if (item.tags && item.tags.length > 0) {
                for (const tag of item.tags) {
                    if (matchTerms(tag.name, 'tags')) {
                        logTrace('Item blacklisted by Tag:', tag.name);
                        return true;
                    }
                }
            }
             // Check title
            if (item.title && matchTerms(item.title, 'titles')) {
                logTrace('Item blacklisted by Title:', item.title);
                return true;
            }
            return false; // No relevant blacklist entries found for this item type
        }

		// Blacklisted by Name (Channel Name or Category Name)
        // Use item.name for channels, item.category for categories (they are the same value)
        const nameToCheck = item.type === 'categories' ? item.category : item.name;
		if (nameToCheck && matchTerms(nameToCheck, item.type)) {
			logTrace('Item blacklisted by Name/Category Name:', nameToCheck, '(Type:', item.type, ')');
			return true;
		}

		// Blacklisted by Category (specifically for Channel items)
		if (item.type === 'channels' && item.category && matchTerms(item.category, 'categories')) {
			logTrace('Channel item blacklisted by Category:', item.category);
			return true;
		}

		// Blacklisted by Tag
		if (item.tags && item.tags.length > 0) {
            for (const tag of item.tags) {
                if (matchTerms(tag.name, 'tags')) {
                    logTrace('Item blacklisted by Tag:', tag.name);
                    return true;
                }
            }
        }

		// Blacklisted by Title
		if (item.title && matchTerms(item.title, 'titles')) {
			logTrace('Item blacklisted by Title:', item.title);
			return true;
		}

        //logTrace('Item not blacklisted:', item.name || item.category || item.title);
		return false;
	}


	/**
	 * Returns if the specified term matches against the provided blacklist.
	 */
	function matchTerms(term, type) {
		// Added early exit for invalid type
		if (!term || typeof term !== 'string' || term.length === 0 || !storedBlacklistedItems[type]) {
             return false;
        }


		const termL = normalizeCase(term);

		// Match against map (primary check)
		if (storedBlacklistedItems[type][term] !== undefined || storedBlacklistedItems[type][termL] !== undefined) {
			//logVerbose('Match found in map for:', term, 'Type:', type);
			return true;
		}


		// Check for exact match cache
		if (cacheExactTerms[type]) {
			for (const exactTerm of cacheExactTerms[type]) {
				if (term === exactTerm) {
                    //logVerbose('Exact match found:', term, 'vs', exactTerm);
                    return true;
                }
			}
		}

		// Check for loose match cache
		if (cacheLooseTerms[type]) {
			for (const looseTerm of cacheLooseTerms[type]) {
				if (termL.includes(looseTerm)) { // Use includes for substring check
                    //logVerbose('Loose match found:', termL, 'contains', looseTerm);
                    return true;
                }
			}
		}

		// Check for regular expression match cache
		if (cacheRegExpTerms[type]) {
			for (const regexp of cacheRegExpTerms[type]) {
				if (regexp.test(term)) {
                     //logVerbose('RegExp match found:', term, 'matches', regexp);
                    return true;
                }
			}
		}

		return false;
	}

	/**
	 * Removes the provided item node. Returns if the node could be removed.
	 * UPDATE: Targets the container node directly.
	 */
	function removeDirectoryItem(item) {
		logTrace('invoking removeDirectoryItem($)', item);

		const container = item.containerNode; // Use the container node identified earlier

		if (!container) {
			logError('Cannot remove directory item, containerNode is missing:', item);
			return false;
		}

		try {
			// Mark the original node (link/article) as hidden for potential re-checks
			if (item.node) {
				item.node.setAttribute('data-uttv-hidden', '');
			} else {
                 container.setAttribute('data-uttv-hidden', ''); // Mark container if primary node missing
            }

			// Hide the main container
			container.style.display = 'none !important;';
			logVerbose('Successfully hid directory item container:', container);
			return true;
		} catch (error) {
			logError('Error removing directory item container:', error, item);
			return false;
		}
	}


	/**
	 * Removes the provided sidebar item node. Returns if the node could be removed.
	 * UPDATE: Targets the container node directly.
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
            } else {
                 container.setAttribute('data-uttv-hidden', ''); // Mark container if primary node missing
            }

            // Hide the main container card div
            container.style.display = 'none !important;';
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
                tagContainerNode = item.containerNode.querySelector('.Layout-sc-1xcs6mc-0.fAVISI .InjectLayout-sc-1i43xsx-0');
            } else if (item.type === 'categories') {
                tagContainerNode = item.containerNode.querySelector('article .Layout-sc-1xcs6mc-0.fLNVxt');
            }
            // --- TODO: Add logic for VOD/Clip tag containers ---

			if (tagContainerNode && item.tags && item.tags.length > 0) {
                attachHideButtonsToTags(item.tags, tagContainerNode); // Pass tags array and container
            }
		}
	}

	/**
	 * Attaches a hide button to the provided card container node.
	 * UPDATE: Appends to the container node. Requires CSS update.
	 */
	function attachHideButtonToCard(item) {
		logTrace('invoking attachHideButtonToCard($)', item);

		const containerNode = item.containerNode;
		if (!containerNode) {
			logError('Cannot attach card button, containerNode missing:', item);
			return;
		}

		const attachedKey = 'data-uttv-card-button-attached';

		// Prevent attaching the button more than once
		if (containerNode.getAttribute(attachedKey) !== null) {
			//logVerbose('Hide button already attached to card container.', containerNode);
			return;
		}

		// Mark item as being processed
		containerNode.setAttribute(attachedKey, '');

		/* BEGIN: build hide button */
			let hideItem = document.createElement('div');
			let label = '';

			switch (item.type) {
				case 'categories':
					hideItem.className   = 'uttv-hide-item uttv-category';
					label = chrome.i18n.getMessage('label_HideCategory');
				break;
				case 'channels':
					hideItem.className   = 'uttv-hide-item uttv-channel';
                    label = chrome.i18n.getMessage('label_HideChannel');
					// FFZ offset logic might still be relevant visually, keep for now
					if ( usingFFZ() && item.node?.getAttribute('href') && /^\/[^\/]+\/?$/.test(item.node.getAttribute('href')) ) {
						hideItem.className += ' uttv-ffz';
					}
				break;
                // --- TODO: Add cases for VOD/Clip types ---
				default:
					logError('Unable to create hide button for card, unknown item type:', item.type);
                    return; // Don't attach button for unknown types
			}

			hideItem.textContent = 'X';
			hideItem.title       = label + ' (' + (item.name || item.category) + ')'; // Add name for clarity

			if (renderButtons === false) {
				hideItem.classList.add('uttv-hidden');
			}
		/* END: build hide button */

		// Attach action listener with backreference to item
		// Store necessary info directly on the button
		hideItem.setAttribute('data-uttv-type', item.type);
		hideItem.setAttribute('data-uttv-name', item.name || item.category); // Use name or category
		hideItem.addEventListener('click', async(event) => {
			// cancel regular click event on card
			event.preventDefault();
			event.stopPropagation();

            const type = event.currentTarget.getAttribute('data-uttv-type');
            const name = event.currentTarget.getAttribute('data-uttv-name');
            logInfo('Hide Card button clicked:', type, name);
			await onHideItem({ type: type, name: name }); // Pass a simpler object
		});

        // Ensure container is capable of absolute positioning
		containerNode.style.position = 'relative';
		containerNode.appendChild(hideItem);
        logVerbose('Attached card hide button to container:', containerNode);

		// IMPORTANT: Requires CSS update in directory.css to position `.uttv-hide-item` correctly
		// Example CSS needed:
		// .Layout-sc-1xcs6mc-0.jCGmCy .uttv-hide-item,
        // .Layout-sc-1xcs6mc-0.gmMVaQ .uttv-hide-item {
		//   position: absolute;
		//   top: 5px; /* Adjust as needed */
		//   right: 5px; /* Adjust as needed */
		//   z-index: 100; /* Ensure visibility */
		//   cursor: pointer;
        //   /* Add other styling */
		// }

		return hideItem;
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
				// Ask user to confirm action
				const decision = confirm( chrome.i18n.getMessage('confirm_HideTag') + ' [' + tagName + ']' );
				if (decision === true) {
                    logInfo('Hide Tag button clicked:', tagName);
					await onHideTag({ name: tagName }); // Pass simple object
				}
			});

            // Make the tag button relative positioning context
            tagButtonNode.style.position = 'relative';
            // Append the hide button *inside* the tag button
			tagButtonNode.appendChild(hideTagNode);

            // Adjust padding if needed (might not be necessary if using absolute positioning)
			// if (renderButtons) {
			// 	tagButtonNode.style.paddingRight = '...'; // Adjust if needed
			// }
		}
         logVerbose('Attached hide buttons to', tags.length, 'tags in container:', tagContainerNode);

        // IMPORTANT: Requires CSS update in directory.css for `.uttv-hide-tag`
        // Example CSS:
        // button.tw-tag { position: relative; /* Needed for absolute child */ }
        // .uttv-hide-tag {
        //   position: absolute;
        //   top: -5px;  /* Adjust as needed */
        //   right: -5px; /* Adjust as needed */
        //   z-index: 101; /* Higher than card button */
        //   cursor: pointer;
        //   /* Add other styling (background, border-radius, etc.) */
        // }
	}


	/**
	 * Toggles visibility state of all present hide buttons in the directory of the current page. Returns all present hide buttons.
	 */
	async function toggleHideButtonsVisibility(state) {
		logTrace('invoking toggleHideButtonsVisibility($)', state);

		if (typeof state !== 'boolean') {
			throw new Error('Argument "state" is illegal. Expected a boolean.');
		}
        if (!mainNode) {
            logError('mainNode is null, cannot toggle button visibility.');
            return [];
        }

		// store state globally
		renderButtons = state;
		await storageSet({ 'renderButtons': renderButtons });

		const buttonsSelector = '.uttv-hide-item, .uttv-hide-tag'; // Select both types
		const buttons         = mainNode.querySelectorAll(buttonsSelector);
		const buttonsLength   = buttons.length;

		if (buttonsLength > 0) {
            logInfo('Toggling', buttonsLength, 'hide buttons to state:', state);
			if (renderButtons === true) {
				for (let i = 0; i < buttonsLength; i++) {
					buttons[i].classList.remove('uttv-hidden');
				}
			} else {
				for (let i = 0; i < buttonsLength; i++) {
					buttons[i].classList.add('uttv-hidden');
				}
			}
		} else {
			logWarn('Unable to find any hide buttons to toggle. Expected:', buttonsSelector);
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

		// --- TODO: Refine selectors for different page types as needed ---
		switch (currentPageType) {
			case 'frontpage':
				areaSelector = '.root-scrollable__wrapper .front-page-carousel'; // Needs verification
				area         = mainNode.querySelector(areaSelector);
                targetParent = area;
				break;

			case 'categories': // Confirmed from twitch.tv_directory_html.txt
			case 'game':       // Confirmed from Retro - Twitch.html
			case 'channels':   // Assumed similar structure to 'game'
				areaSelector = 'div[data-a-target="tags-filter-dropdown"]';
				area         = mainNode.querySelector(areaSelector);
                targetParent = area?.parentNode?.parentNode; // Go up two levels to the container div
				break;

			case 'videos': // Needs verification
				areaSelector = 'div.directory-videos-page__filters > div'; // Updated potential selector
				area         = mainNode.querySelector(areaSelector);
                targetParent = area;
				break;

			case 'clips': // Needs verification
				areaSelector = 'div.directory-clips-page__filters'; // Updated potential selector
				area         = mainNode.querySelector(areaSelector);
                 targetParent = area;
				break;

			case 'explore': // Needs verification
				areaSelector = '.verticals__header-wrapper';
				area         = mainNode.querySelector(areaSelector);
                targetParent = area?.firstChild;
				break;

			case 'following': // Needs verification for live/videos/games tabs
				areaSelector = 'ul[role="tablist"]'; // Anchor near the tabs
				area         = mainNode.querySelector(areaSelector);
                 targetParent = area?.parentNode;
				break;

			case 'collection': // Needs verification
				areaSelector = '#directory-game-main-content h1';
				area         = mainNode.querySelector(areaSelector);
                 targetParent = area?.parentNode;
				break;

			default:
				logError('Unable to add management button, page type is unhandled:', currentPageType);
				return false; // Exit if type is unknown/unsupported
		}

        if (targetParent) {
             return buildManagementButton(targetParent); // Pass the determined parent
        } else {
             logWarn('Unable to find anchor area for management button on page type:', currentPageType, 'Expected selector:', areaSelector);
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
        try {
            if (position === 'append') {
                areaNode.appendChild(container);
            } else if (position === 'prepend') {
                // Ensure parentNode exists before attempting prepend
                if (areaNode.parentNode) {
                    areaNode.parentNode.insertBefore(container, areaNode); // Insert before the areaNode itself
                } else {
                    logError('Cannot prepend management button, areaNode has no parentNode:', areaNode);
                    return false;
                }
            } else {
                logError('Argument "position" is illegal. Expected one of: "append", "prepend". Got:', position);
                return false;
            }
             logInfo('Successfully added management button.', container, 'to area:', areaNode);
             return true;
        } catch (error) {
            logError('Error adding management button to areaNode:', error, areaNode, container);
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
		window.clearInterval(onPageChangeInterval);

		if (isSupportedPage(page) === false) {
			logWarn('onPageChange: Current page is not supported. Stopping polling.', page);
			stopPageChangePolling(); // Ensure polling stops
			observeSidebar(); // Still try to observe sidebar on unsupported pages
			return;
		}

		logInfo('onPageChange: Starting process for supported page:', page, 'Type:', currentPageType);
		pageLoads = true;
		placeholderLoop = 0; // Reset placeholder loop counter
		onPageChangeCounter = 0;
		const pageLoadMonitorInterval = 150; // Slightly longer interval
		const pageLoadTimeout = 20000 / pageLoadMonitorInterval; // ~20 seconds timeout

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
				'div.Layout-sc-1xcs6mc-0.ScTowerItem-sc-1sjzzes-2', // Category card container
				// --- TODO: Add VOD/Clip container selectors here ---
			].join(', ');

			const indicator = mainNode.querySelector(contentCardSelector);
            const placeholderNode = rootNode.querySelector('.tw-placeholder'); // Standard Twitch placeholder


			// Condition 1: Content indicator found AND (no placeholder OR placeholder timeout reached)
			if (indicator !== null && (placeholderNode === null || placeholderLoop >= MAX_PLACEHOLDER_LOOP)) {
				logInfo('Page content indicator found, proceeding with initialization.', indicator);
				stopPageChangePolling(); // Stop this polling interval
				logTrace('Polling stopped in onPageChange(): page loaded indicator found.');

				// --- Actions to perform once page content is detected ---
				addManagementButton(); // Attempt to add the management button

				// Initial Filter Run
				let remainingItems;
				if (currentPageType === 'following' && hideFollowing === false) {
					logInfo('Filtering only recommended items on Following page due to settings.');
					remainingItems = filterDirectory('recommended', true); // Filter recommended first
					filterDirectory('unprocessed', false); // Mark others as processed without hiding
				} else {
					logInfo('Filtering all visible items.');
					remainingItems = filterDirectory('visible', true); // Default: Filter all visible
				}

				// Attach Buttons to Remaining Items
				attachHideButtons(remainingItems);
				logInfo('Attached hide buttons to', remainingItems.length, 'items.');

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

		// Update cache (pass type and name directly)
		modifyBlacklistedItems(itemType, itemName); // Uses the function overload for single item

		// Update storage
		await putBlacklistedItems(storedBlacklistedItems);
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

		// Update cache
		// No need to normalize here if it comes directly from data-a-target which seems unnormalized
		// But blacklist.js *does* normalize, so maybe we should too for consistency?
		// Let's stick to what's passed for now, assuming match logic handles normalization.
		modifyBlacklistedItems('tags', tagName); // Add the raw tag name

		// Update storage
		await putBlacklistedItems(storedBlacklistedItems);
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

		let remainingItems;

        logInfo('Scroll/Dynamic content detected, filtering unprocessed items...');

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
		return true;
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
                    logWarn('No valid blacklist data found in storage.');
                }
            } else {
                 logWarn('Storage retrieval returned null/undefined.');
            }
        } catch (error) {
             logError('Error retrieving blacklist items:', error);
        }


		// Ensure the final object is initialized correctly
        return initBlacklistedItems(blacklistedItems);
	}

	/**
	 * Stores the provided items or a single item in the local cache.
	 * Maintains several internal lists to improve matching performance.
	 * UPDATE: Clears caches before rebuilding or adding single items.
	 */
	function modifyBlacklistedItems(arg1, arg2) {
		logTrace('invoking modifyBlacklistedItems($, $)', arg1, arg2);

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
                if (!storedBlacklistedItems[type].includes(term)) {
                    storedBlacklistedItems[type].push(term);
                }
            } else {
			    storedBlacklistedItems[type][term] = 1;
            }

			// Clear and rebuild specific cache type for the single item
			if (isExactTerm(term)) {
				cacheExactTerms[type] = cacheExactTerms[type] || [];
				const exactVal = term.substring(1, term.length - 1);
                if (!cacheExactTerms[type].includes(exactVal)) {
                     cacheExactTerms[type].push(exactVal);
                }
			} else if (isLooseTerm(term)) {
				cacheLooseTerms[type] = cacheLooseTerms[type] || [];
                const looseVal = term.substring(1);
                 if (!cacheLooseTerms[type].includes(looseVal)) {
				    cacheLooseTerms[type].push(looseVal);
                 }
			} else if (isRegExpTerm(term)) {
				cacheRegExpTerms[type] = cacheRegExpTerms[type] || [];
				const regexp = toRegExp(term);
				if (regexp && !cacheRegExpTerms[type].some(r => r.toString() === regexp.toString())) { // Avoid duplicate regexps
					cacheRegExpTerms[type].push(regexp);
				}
			}
             logVerbose('Added single item to cache:', type, term);

		// Overload 2: modifyBlacklistedItems(fullBlacklistObject) - Replace entire cache
		} else if (typeof arg1 === 'object' && arg1 !== null && arg2 === undefined) {
			const items = initBlacklistedItems(arg1); // Ensure structure is correct
			storedBlacklistedItems = items;

			// Clear and rebuild all caches
			cacheExactTerms  = {};
			cacheLooseTerms  = {};
			cacheRegExpTerms = {};

			logVerbose('Rebuilding all blacklist caches...');
			for (const itemType in items) {
                if (!items.hasOwnProperty(itemType)) continue;

                let terms;
                if (Array.isArray(items[itemType])) { // Handle titles array
                    terms = items[itemType];
                } else if (typeof items[itemType] === 'object' && items[itemType] !== null){ // Handle category/channel/tag objects
                    terms = Object.keys(items[itemType]);
                } else {
                    logWarn('Unexpected data structure for itemType:', itemType, items[itemType]);
                    continue; // Skip invalid types
                }


				for (const term of terms) {
                    if (typeof term !== 'string') continue; // Skip non-string terms

					if (isExactTerm(term)) {
						cacheExactTerms[itemType] = cacheExactTerms[itemType] || [];
                        const exactVal = term.substring(1, term.length - 1);
                        if (!cacheExactTerms[itemType].includes(exactVal)) {
                            cacheExactTerms[itemType].push(exactVal);
                        }
					} else if (isLooseTerm(term)) {
						cacheLooseTerms[itemType] = cacheLooseTerms[itemType] || [];
                         const looseVal = term.substring(1);
                         if (!cacheLooseTerms[itemType].includes(looseVal)) {
						    cacheLooseTerms[itemType].push(looseVal);
                         }
					} else if (isRegExpTerm(term)) {
						cacheRegExpTerms[itemType] = cacheRegExpTerms[itemType] || [];
						const regexp = toRegExp(term);
                        if (regexp && !cacheRegExpTerms[itemType].some(r => r.toString() === regexp.toString())) {
                            cacheRegExpTerms[itemType].push(regexp);
                        }
					}
                    // Regular terms are implicitly handled by the main storedBlacklistedItems check
				}
			}
            logVerbose('Finished rebuilding caches.');
		} else {
            logError('Invalid arguments passed to modifyBlacklistedItems:', arg1, arg2);
        }
         // Log cache sizes for debugging
        // logVerbose('Cache sizes:',
        //     'Exact:', Object.values(cacheExactTerms).reduce((sum, arr) => sum + arr.length, 0),
        //     'Loose:', Object.values(cacheLooseTerms).reduce((sum, arr) => sum + arr.length, 0),
        //     'RegExp:', Object.values(cacheRegExpTerms).reduce((sum, arr) => sum + arr.length, 0)
        // );
	}

	/**
	 * Stores all blacklisted items in the storage.
	 */
	async function putBlacklistedItems(items, attemptRecovery = true) { // Default attemptRecovery to true
		logTrace('invoking putBlacklistedItems($, $)', items, attemptRecovery);

		if (typeof items !== 'object' || items === null) {
			logError('putBlacklistedItems called with invalid items:', items);
			return; // Don't proceed with invalid data
		}


		const mode   = await getStorageMode();
		const isSync = (mode === 'sync');

		if (attemptRecovery === false) {
			logWarn('Attempting to restore backup to storage:', items);
		}


		// Always use a clone to avoid modifying the live cache during async ops
        const itemsToStore = initBlacklistedItems(cloneBlacklistItems(items));


		let dataToStore = { 'blacklistedItems': itemsToStore };
		let requiresSplitting = false;

		if (isSync) {
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
                     await putBlacklistedItems(items, false); // Retry with local, don't loop recovery
                     return; // Exit after attempting local save
                }
				logVerbose('Splitting of blacklist completed. Fragments:', Object.keys(dataToStore).length);
			}
		}

        // Clear previous data structure (either single key or fragments) before setting new data
        const keysToRemove = ['blacklistedItems'];
        for (let i = 0; i < storageMaxFragments; i++) { // Use defined constant
            keysToRemove.push('blItemsFragment' + i);
        }
        logVerbose('Clearing previous blacklist keys:', keysToRemove);
        await storageRemove(keysToRemove); // Ensure removal finishes before setting


		// Now set the new data (either single object or fragments)
        logVerbose('Attempting to save data to', mode, 'storage:', dataToStore);
		const error = await storageSet(dataToStore);


		// Handle potential errors
		if (error) { // Check if error object exists
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
                     // Maybe restore the in-memory cache from backup?
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
			await syncBlacklistedItems(itemsToStore); // Send the data that was intended to be saved

			// Update backup cache ONLY on successful save
			if (attemptRecovery) { // Only update backup if it wasn't a recovery attempt itself
				backupBlacklistedItems = cloneBlacklistItems(itemsToStore); // Backup the data that was successfully saved
				logVerbose('Created new backup of blacklist.');
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
                 if (error.message.includes("Could not establish connection")) {
                     logVerbose("No other active Twitch tabs to sync with.");
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
		initRun = true;
        logInfo('Extension Core Initialization Starting...');

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
				rootNode = document;
			} else {
                 logVerbose('Root node found:', rootNode);
            }
		/* END: root */

		// Start page processing
		onPageChange(currentPage); // Trigger initial page processing
        logInfo('Extension Core Initialization Complete.');
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