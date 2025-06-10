(function() {
    const testSuiteName = "directory.js (Filtering Logic)";
    let testCount = 0;
    let assertionsMade = 0;
    let mockDocument;
    // mockWindow and mockChrome will use globalThis versions, reset in test()

    // Assertion Helpers
    function assertEquals(expected, actual, message) { assertionsMade++; if (expected !== actual) throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`); }
    function assertDeepEquals(expected, actual, message) { assertionsMade++; if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Assertion Failed: ${message}. Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}.`); }
    function assertTrue(actual, message) { assertionsMade++; if (actual !== true) throw new Error(`Assertion Failed: ${message}. Expected "true", but got "${actual}".`); }
    function assertFalse(actual, message) { assertionsMade++; if (actual !== false) throw new Error(`Assertion Failed: ${message}. Expected "false", but got "${actual}".`); }
    function assertNotNull(actual, message) { assertionsMade++; if (actual === null) throw new Error(`Assertion Failed: ${message}. Expected not "null", but got "${actual}".`); }
    function assertNull(actual, message) { assertionsMade++; if (actual !== null) throw new Error(`Assertion Failed: ${message}. Expected "null", but got "${actual}".`); }
    function assertCondition(condition, message) { assertionsMade++; if (!condition) throw new Error(`Assertion Failed: ${message}. Condition was not met.`); }

    // Mock DOM Element Creation Utility (from directory_parsing_test.js)
    function createMockElement(tagName, attributes = {}, children = []) {
        const el = {
            tagName: tagName.toUpperCase(), attributes: {}, children: [],
            classList: { _classes: new Set(), add: function(c){this._classes.add(c);}, remove: function(c){this._classes.delete(c);}, contains: function(c){return this._classes.has(c);}},
            style: {}, textContent: '',
            getAttribute: function(name) { return this.attributes[name]; },
            setAttribute: function(name, value) { this.attributes[name] = value; },
            querySelector: function(selector) { /* Simplified */ return this.children.find(c => c.tagName === selector.toUpperCase()) || null; },
            querySelectorAll: function(selector) { /* Simplified */ return this.children.filter(c => c.tagName === selector.toUpperCase()); },
            appendChild: function(child) { this.children.push(child); child.parentNode = this; },
            matches: function(selector) { if (selector.startsWith('.')) return this.classList.contains(selector.substring(1)); return true; },
            closest: function(selector) { if (this.matches(selector)) return this; if (this.parentNode) return this.parentNode.closest(selector); return null; },
            parentNode: null,
            // Specific for filterItems' use of containerNode
            firstElementChild: null
        };
        if (children.length > 0) el.firstElementChild = children[0]; // Basic mock for firstElementChild if needed by selectors

        for (const key in attributes) {
            if (key === 'class') attributes[key].split(' ').forEach(c => el.classList.add(c));
            else if (key === 'textContent') el.textContent = attributes[key];
            else if (key === 'id') el.id = attributes[key];
            else el.setAttribute(key, attributes[key]);
        }
        children.forEach(child => el.appendChild(child));
        return el;
    }

    // Setup mock DOM (simplified, focus on item structure for filtering)
    function setupMockTwitchDOM(pageType, itemsData = []) {
        mockDocument = {
            _elements: {}, body: createMockElement('body'),
            getElementById: function(id) { return this._elements[id] || null; },
            querySelector: function(selector) { return this.body.querySelector(selector); },
            querySelectorAll: function(selector) { return this.body.querySelectorAll(selector); },
            createElement: createMockElement
        };
        globalThis.document = mockDocument;

        const itemsContainer = createMockElement('div', {id: 'items-container'}); // Generic container for items
        mockDocument.body.appendChild(itemsContainer);

        itemsData.forEach((item, index) => {
            // Create a containerNode for each item, this is what filterItems expects
            const containerNode = createMockElement('div', { class: 'mock-item-container', id: `item-container-${index}`});
            // Store the item data within the node for retrieval in mocked parsing functions
            containerNode._testData = item;
            itemsContainer.appendChild(containerNode);
        });
        return itemsContainer; // Return the direct parent of item containers
    }

    // Helper to set up global state for filtering tests
    function setupFilterTestState(blacklist, settings = {}) {
        globalThis.storedBlacklistedItems = blacklist;
        globalThis.hideReruns = settings.hideReruns === undefined ? false : settings.hideReruns;
        globalThis.hideFollowing = settings.hideFollowing === undefined ? false : settings.hideFollowing; // Default for directory, true for sidebar
        // Other globals from directory.js if they influence filtering:
        globalThis.normalizeFields = settings.normalizeFields === undefined ? true : settings.normalizeFields;
        globalThis.options = { // From common.js, used by normalizeCase
            normalize: globalThis.normalizeFields,
            // ... other options if needed by normalizeCase or other common functions
        };
    }


    function test(testName, testFunction) {
        testCount++;
        // Basic DOM for elements like side-nav might be needed if filterAllContent is deeply tested
        setupMockTwitchDOM(null, []); // Minimal DOM unless specific test needs more
        globalThis.mockChrome = globalThis.chrome; // Use global mock
        globalThis.mockWindow = globalThis.window; // Use global mock

        // Reset global state from directory.js
        globalThis.currentPageType = null;
        globalThis.currentCategory = null;
        globalThis.storedBlacklistedItems = { channels: {}, categories: {}, games: {}, tags: {}, titles: {} }; // Reset blacklist
        globalThis.hideReruns = false;
        globalThis.hideFollowing = false;
        globalThis.normalizeFields = true;
        globalThis.options = { normalize: true };


        if (globalThis.mockWindow && globalThis.mockWindow.location) { // Save original pathname
             globalThis.mockWindow.location._originalPathname = globalThis.mockWindow.location.pathname;
        }


        try {
            const result = testFunction();
            if (result && typeof result.then === 'function') {
                result.then(() => reportTestResult(`${testSuiteName}: ${testName}`, true))
                      .catch(error => reportTestResult(`${testSuiteName}: ${testName}`, false, error));
            } else {
                reportTestResult(`${testSuiteName}: ${testName}`, true);
            }
        } catch (error) {
            reportTestResult(`${testSuiteName}: ${testName}`, false, error);
        } finally {
            if (globalThis.mockWindow && globalThis.mockWindow.location && globalThis.mockWindow.location._originalPathname) {
                globalThis.mockWindow.location.pathname = globalThis.mockWindow.location._originalPathname;
            }
        }
    }

    // --- Tests ---

    test("isBlacklistedItem by channel name (exact, loose, regex)", () => {
        setupFilterTestState({ channels: { "exactchannel": 1, "~loosechannel": 1, "/regexchannel/i": 1 } });
        assertTrue(isBlacklistedItem({ name: "ExactChannel" }), "Exact channel match (case normalized)");
        assertTrue(isBlacklistedItem({ name: "SomeLooseChannelName" }), "Loose channel match");
        assertTrue(isBlacklistedItem({ name: "ThisIsARegexChannel" }), "Regex channel match (case insensitive)");
        assertFalse(isBlacklistedItem({ name: "OtherChannel" }), "Non-blacklisted channel");
    });

    test("isBlacklistedItem by category/game name", () => {
        setupFilterTestState({ games: { "exactgame": 1, "~boringgame": 1 } }); // 'games' key used in storedBlacklistedItems
        assertTrue(isBlacklistedItem({ category: "ExactGame", name: "Some Channel In Game" }), "Exact game match"); // Item is a channel
        assertTrue(isBlacklistedItem({ name: "Some BoringGame Category" }), "Loose game match on category item"); // Item is a category
    });

    test("isBlacklistedItem by title", () => {
        setupFilterTestState({ titles: { "'exact title'": 1, "~boring title": 1, "/annoying pattern/i":1 } });
        assertTrue(isBlacklistedItem({ title: "Exact Title" }), "Exact title match");
        assertTrue(isBlacklistedItem({ title: "This is a very boring title indeed" }), "Loose title match");
        assertTrue(isBlacklistedItem({ title: "Some ANNOYING PATTERN here" }), "Regex title match");
    });

    test("isBlacklistedItem by tags", () => {
        setupFilterTestState({ tags: { "exacttag": 1, "~badtag": 1 } });
        assertTrue(isBlacklistedItem({ tags: ["ExactTag", "OtherTag"] }), "Exact tag match");
        assertTrue(isBlacklistedItem({ tags: ["Something", "AnotherBadTag"] }), "Loose tag match");
    });

    test("isBlacklistedItem respects hideReruns and hideFollowing", () => {
        setupFilterTestState({}, { hideReruns: true });
        assertTrue(isBlacklistedItem({ isRerun: true, name:"SomeRerunStream" }), "Rerun hidden");
        setupFilterTestState({}, { hideReruns: false });
        assertFalse(isBlacklistedItem({ isRerun: true, name:"SomeRerunStreamNotHidden" }), "Rerun not hidden if setting is false");

        setupFilterTestState({}, { hideFollowing: true }); // This applies to sidebar items
        // isBlacklistedItem checks item.isFollowed which is specific to sidebar items.
        assertTrue(isBlacklistedItem({ name: "FollowedChannel", isFollowed: true, type: "sidebar" }), "Followed sidebar item hidden");
        setupFilterTestState({}, { hideFollowing: false });
        assertFalse(isBlacklistedItem({ name: "FollowedChannelNotHidden", isFollowed: true, type: "sidebar" }), "Followed sidebar item not hidden if setting is false");
    });

    test("filterItems correctly hides/shows items and sets processed attribute", () => {
        // Mock items with containerNodes
        const mockItems = [
            { name: "Good Channel", containerNode: createMockElement('div', {id:'item1'}) }, // Not blacklisted
            { name: "Bad Channel", containerNode: createMockElement('div', {id:'item2'}) },  // Blacklisted
            { name: "Ugly Channel", containerNode: createMockElement('div', {id:'item3'}) } // Blacklisted by different rule
        ];
        setupFilterTestState({ channels: { "bad channel": 1 }, titles: { "~ugly":1 } });

        const filtered = filterItems(mockItems, "test-hide-class");

        assertFalse(mockItems[0].containerNode.classList.contains("test-hide-class"), "Good item not hidden");
        assertTrue(mockItems[0].containerNode.getAttribute('data-uttv-processed') === 'true', "Good item processed");

        assertTrue(mockItems[1].containerNode.classList.contains("test-hide-class"), "Bad item hidden");
        assertTrue(mockItems[1].containerNode.getAttribute('data-uttv-processed') === 'true', "Bad item processed");

        // For "Ugly Channel" to be blacklisted by title, its item object needs a title property
        mockItems[2].title = "Some Ugly Title"; // Add title to the item
        // Re-run filterItems or isBlacklistedItem for this specific item if filterItems doesn't re-evaluate based on this change.
        // For simplicity, we assume isBlacklistedItem would be called again or filterItems is re-run.
        // A more robust test would re-filter. Let's adjust the setup for this item.

        // Re-filter with the updated item for clarity.
        // This means filterItems needs to be pure based on its input 'items' and global state.
        const mockItemsUpdated = [ mockItems[0], mockItems[1], { name: "Ugly Channel", title:"Some Ugly Title", containerNode: mockItems[2].containerNode }];
        filterItems(mockItemsUpdated, "test-hide-class"); // Call again with updated item

        assertTrue(mockItemsUpdated[2].containerNode.classList.contains("test-hide-class"), "Ugly item hidden by title");
        assertTrue(mockItemsUpdated[2].containerNode.getAttribute('data-uttv-processed') === 'true', "Ugly item processed");

        assertEquals(1, filtered.length, "filterItems returns array of non-hidden items");
        assertEquals("Good Channel", filtered[0].name, "Non-hidden item name matches");
    });

    test("filterDirectory applies filtering to DOM elements from getDirectoryItems", () => {
        // Setup DOM and mock getDirectoryItems
        const domItemsContainer = setupMockTwitchDOM('channelsPage', [
            { name: "KeepChannel", title: "Good Stream" },
            { name: "HideChannel", title: "Bad Stream Title" }
        ]);
        // Mock getDirectoryItems to return items with their containerNodes
        const mockParsedItems = Array.from(domItemsContainer.children).map(container => ({
            name: container._testData.name,
            title: container._testData.title,
            containerNode: container
        }));
        const originalGetDirectoryItems = globalThis.getDirectoryItems;
        globalThis.getDirectoryItems = (mode) => mockParsedItems; // Mode is 'visible' or 'unprocessed'

        setupFilterTestState({ titles: { "~bad": 1 } });
        globalThis.currentPageType = 'channels'; // Set page type for getDirectoryItems selector

        filterDirectory('unprocessed'); // Call the function under test

        const keepNode = mockDocument.getElementById('item-container-0');
        const hideNode = mockDocument.getElementById('item-container-1');

        assertFalse(keepNode.classList.contains('uttv-hidden-item'), "KeepChannel should not be hidden");
        assertTrue(hideNode.classList.contains('uttv-hidden-item'), "HideChannel should be hidden");
        assertTrue(keepNode.getAttribute('data-uttv-processed') === 'true', "KeepChannel marked processed");
        assertTrue(hideNode.getAttribute('data-uttv-processed') === 'true', "HideChannel marked processed");

        globalThis.getDirectoryItems = originalGetDirectoryItems; // Restore
    });

    test("filterSidebar applies filtering to DOM elements from getSidebarItems", () => {
        // Mock getSidebarItems to return items with containerNodes
        const mockSidebarNodes = [
            createMockElement('div', {id:'side-item-1'}),
            createMockElement('div', {id:'side-item-2'})
        ];
        const mockParsedSidebarItems = [
            { name: "GoodSideChannel", containerNode: mockSidebarNodes[0], type: "sidebar", isFollowed: true },
            { name: "HideSideChannel", containerNode: mockSidebarNodes[1], type: "sidebar", isFollowed: true }
        ];
        const originalGetSidebarItems = globalThis.getSidebarItems;
        globalThis.getSidebarItems = (mode) => mockParsedSidebarItems;

        // Hide "HideSideChannel" by name, but also test hideFollowing interaction
        setupFilterTestState({ channels: { "hidesidechannel": 1 } }, { hideFollowing: false }); // hideFollowing = false initially

        filterSidebar();

        assertFalse(mockSidebarNodes[0].classList.contains('uttv-sidebar-hidden-item'), "GoodSideChannel not hidden");
        assertTrue(mockSidebarNodes[1].classList.contains('uttv-sidebar-hidden-item'), "HideSideChannel hidden by name rule");

        // Now test with hideFollowing = true, GoodSideChannel should also be hidden
        setupFilterTestState({ channels: { "hidesidechannel": 1 } }, { hideFollowing: true });
        // Reset classes before re-filtering
        mockSidebarNodes[0].classList.remove('uttv-sidebar-hidden-item');
        mockSidebarNodes[1].classList.remove('uttv-sidebar-hidden-item');

        filterSidebar();
        assertTrue(mockSidebarNodes[0].classList.contains('uttv-sidebar-hidden-item'), "GoodSideChannel hidden due to hideFollowing=true");
        assertTrue(mockSidebarNodes[1].classList.contains('uttv-sidebar-hidden-item'), "HideSideChannel still hidden");

        globalThis.getSidebarItems = originalGetSidebarItems; // Restore
    });

    test("filterAllContent calls filterDirectory and filterSidebar", () => {
        let directoryFiltered = false;
        let sidebarFiltered = false;
        const origFilterDirectory = globalThis.filterDirectory;
        const origFilterSidebar = globalThis.filterSidebar;
        const origAttachHideButtons = globalThis.attachHideButtons; // Not testing its internals here

        globalThis.filterDirectory = (mode) => { directoryFiltered = true; };
        globalThis.filterSidebar = () => { sidebarFiltered = true; };
        globalThis.attachHideButtons = () => {}; // Mock to prevent DOM errors

        filterAllContent();

        assertTrue(directoryFiltered, "filterDirectory should be called by filterAllContent");
        assertTrue(sidebarFiltered, "filterSidebar should be called by filterAllContent");

        globalThis.filterDirectory = origFilterDirectory;
        globalThis.filterSidebar = origFilterSidebar;
        globalThis.attachHideButtons = origAttachHideButtons;
    });


    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
