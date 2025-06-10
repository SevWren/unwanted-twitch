(function() {
    const testSuiteName = "directory.js (UI, State & Communication)";
    let testCount = 0;
    let assertionsMade = 0;
    let mockDocument;
    let mockWindow;
    let mockChrome;

    // Assertion Helpers
    function assertEquals(expected, actual, message) { assertionsMade++; if (expected !== actual) throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`); }
    function assertDeepEquals(expected, actual, message) { assertionsMade++; try { if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}.`); } catch(e){ throw new Error(`Assertion Failed: ${message}. ${e.message}`);}}
    function assertTrue(actual, message) { assertionsMade++; if (actual !== true) throw new Error(`Assertion Failed: ${message}. Expected "true", but got "${actual}".`); }
    function assertFalse(actual, message) { assertionsMade++; if (actual !== false) throw new Error(`Assertion Failed: ${message}. Expected "false", but got "${actual}".`); }
    function assertNotNull(actual, message) { assertionsMade++; if (actual === null) throw new Error(`Assertion Failed: ${message}. Expected not "null", but got "${actual}".`); }
    function assertNull(actual, message) { assertionsMade++; if (actual !== null) throw new Error(`Assertion Failed: ${message}. Expected "null", but got "${actual}".`); }
    function assertCondition(condition, message) { assertionsMade++; if (!condition) throw new Error(`Assertion Failed: ${message}. Condition was not met.`); }

    // Mock DOM Element Creation Utility
    function createMockElement(tagName, attributes = {}, children = []) {
        const el = {
            tagName: tagName.toUpperCase(), attributes: {}, children: [],
            classList: { _classes: new Set(), add: function(c){this._classes.add(c);}, remove: function(c){this._classes.delete(c);}, contains: function(c){return this._classes.has(c);}, toggle: function(c){if(this.contains(c))this.remove(c);else this.add(c);}},
            style: {}, textContent: '', innerHTML: '',
            getAttribute: function(name) { return this.attributes[name]; },
            setAttribute: function(name, value) { this.attributes[name] = value; },
            querySelector: function(selector) { /* Simplified */ return this.children.find(c => (selector.startsWith('.') && c.classList.contains(selector.substring(1))) || (c.tagName === selector.toUpperCase()) ) || null; },
            querySelectorAll: function(selector) { /* Simplified */ return this.children.filter(c => (selector.startsWith('.') && c.classList.contains(selector.substring(1))) || (c.tagName === selector.toUpperCase())); },
            appendChild: function(child) { this.children.push(child); child.parentNode = this; },
            removeChild: function(child) { const i = this.children.indexOf(child); if (i > -1) this.children.splice(i,1); child.parentNode = null;},
            matches: function(selector) { if (selector.startsWith('.')) return this.classList.contains(selector.substring(1)); return true; },
            closest: function(selector) { if (this.matches(selector)) return this; if (this.parentNode) return this.parentNode.closest(selector); return null; },
            addEventListener: function(type, listener){this._listeners = this._listeners || {}; this._listeners[type]=listener;},
            dispatchEvent: function(event){if(this._listeners && this._listeners[event.type])this._listeners[event.type].call(this,event);},
            click: function(){ if(this._listeners && this._listeners['click']) this._listeners['click'].call(this, new Event('click'));},
            parentNode: null, firstElementChild: null, title: ''
        };
        if (children.length > 0) el.firstElementChild = children[0];
        for (const key in attributes) {
            if (key === 'class') attributes[key].split(' ').forEach(c => el.classList.add(c));
            else if (key === 'textContent') el.textContent = attributes[key];
            else if (key === 'id') el.id = attributes[key];
            else if (key === 'title') el.title = attributes[key];
            else el.setAttribute(key, attributes[key]);
        }
        children.forEach(child => el.appendChild(child));
        return el;
    }

    function setupMockTwitchDOM(pageType, itemsData = []) {
        mockDocument = {
            _elements: {}, body: createMockElement('body'),
            getElementById: function(id) { return this._elements[id] || null; },
            querySelector: function(selector) { return this.body.querySelector(selector); },
            querySelectorAll: function(selector) { return this.body.querySelectorAll(selector); },
            createElement: createMockElement
        };
        globalThis.document = mockDocument;
        // Common structure directory.js might look for
        const mainContentParent = createMockElement('div', {id: 'main-content-parent'});
        mockDocument.body.appendChild(mainContentParent);
        const mainContentNode = createMockElement('div', { class: 'tw-tower' }); // Or other selector from waitForElement
        mainContentParent.appendChild(mainContentNode);

        // Setup side-nav for observer tests
        const sideNav = createMockElement('nav', {id: 'side-nav'});
        mockDocument.body.appendChild(sideNav);

        itemsData.forEach((item, index) => {
            const containerNode = createMockElement('div', { class: 'mock-item-container', id: `item-container-${index}`});
            containerNode._testData = item;
            // Mock a tag.node if needed by attachHideButtons
            const tagNodeContainer = createMockElement('div', {class: 'mock-tag-node-container'});
            containerNode.appendChild(tagNodeContainer);
            item.tag = { node: tagNodeContainer }; // So item.tag.node exists

            mainContentNode.appendChild(containerNode);
        });
        return mainContentNode;
    }

    // Helper to reset global state from directory.js
    function resetDirectoryState() {
        globalThis.enabled = true;
        globalThis.renderButtons = true;
        globalThis.hideFollowing = false;
        globalThis.hideReruns = false;
        globalThis.storedBlacklistedItems = { channels: {}, categories: {}, games: {}, tags: {}, titles: {} };
        globalThis.cacheExactTerms = {}; globalThis.cacheLooseTerms = {}; globalThis.cacheRegExpTerms = {};
        globalThis.currentPage = "";
        globalThis.currentPageType = null;
        globalThis.currentCategory = null;
        if (globalThis.itemPollInterval) clearInterval(globalThis.itemPollInterval);
        globalThis.itemPollInterval = null;
        if (globalThis.pageChangeInterval) clearInterval(globalThis.pageChangeInterval);
        globalThis.pageChangeInterval = null;
        globalThis.directoryFilterRunning = false;
        globalThis.sidebarFilterRunning = false;
        if (globalThis.sidebarObserver) globalThis.sidebarObserver.disconnect();
        globalThis.sidebarObserver = null;
        globalThis.mainContentObserver = null; // Assuming this might exist for main content too
        globalThis.options = { normalize: true, sort: false, comments: false, debug: false, experimental: false }; // from common.js
        globalThis.debug = false; // from common.js
        if (globalThis.loadingOperation) globalThis.loadingOperation = Promise.resolve();
    }

    function test(testName, testFunction) {
        testCount++;
        setupMockTwitchDOM(null, []); // Basic DOM setup
        resetDirectoryState(); // Reset directory.js globals

        mockChrome = globalThis.chrome;
        mockWindow = globalThis.window;

        // Reset chrome API mocks state
        mockChrome.runtime.lastError = null;
        if(mockChrome.runtime.sendMessage) mockChrome.runtime.sendMessage._lastMessage = null;
        if(mockChrome.runtime.onMessage && mockChrome.runtime.onMessage._listener) { /* Listener is global, don't nullify if background.js adds it */ }
        mockChrome.storage.local._store = {};
        mockChrome.storage.sync._store = {};
        if(mockChrome.i18n && mockChrome.i18n.getMessage) mockChrome.i18n.getMessage._callLog = [];

        if (mockWindow.location) mockWindow.location._originalPathname = mockWindow.location.pathname;
        mockWindow._lastAlert = null;
        mockWindow._intervalId = null; // For setInterval/clearInterval
        mockWindow.location.reload = () => { mockWindow._reloadCalled = true; }; // Spy on reload
        mockWindow._reloadCalled = false;


        try {
            const result = testFunction();
            if (result && typeof result.then === 'function') { // Async test
                result.then(() => reportTestResult(`${testSuiteName}: ${testName}`, true))
                      .catch(error => reportTestResult(`${testSuiteName}: ${testName}`, false, error));
            } else { // Sync test
                reportTestResult(`${testSuiteName}: ${testName}`, true);
            }
        } catch (error) {
            reportTestResult(`${testSuiteName}: ${testName}`, false, error);
        } finally {
            if (mockWindow.location && mockWindow.location._originalPathname) {
                mockWindow.location.pathname = mockWindow.location._originalPathname;
            }
        }
    }

    // --- Tests ---

    test("initExtensionState sets globals from storage", async () => {
        mockChrome.storage.local.get = async (keys) => ({
            enabled: false, // Test non-default
            renderButtons: false, // Test non-default
            hideFollowingPages: true, // Test non-default
            hideRerunsEnabled: true // Test non-default
        });
        await initExtensionState();
        assertFalse(globalThis.enabled, "enabled state from storage");
        assertFalse(globalThis.renderButtons, "renderButtons state from storage");
        assertTrue(globalThis.hideFollowing, "hideFollowing state from storage");
        assertTrue(globalThis.hideReruns, "hideReruns state from storage");
    });

    test("attachHideButtons creates and appends buttons, respects renderButtons", () => {
        const items = [ { name: "TestItem", containerNode: createMockElement('div'), tag: { node: createMockElement('div') } } ];
        globalThis.renderButtons = true;
        attachHideButtons(items);
        assertNotNull(items[0].containerNode.querySelector('.uttv-hide-item'), "Hide item button added");
        assertNotNull(items[0].tag.node.querySelector('.uttv-hide-tag'), "Hide tag button added");

        items[0].containerNode.innerHTML = ''; items[0].tag.node.innerHTML = ''; // Clear for next check
        globalThis.renderButtons = false;
        attachHideButtons(items); // Call again with renderButtons = false
        assertNull(items[0].containerNode.querySelector('.uttv-hide-item'), "Hide item button not added if renderButtons is false");
    });

    test("onHideItem calls modifyBlacklistedItems, putBlacklistedItems, and filterAllContent", async () => {
        let modifyCalledWith = null, putCalled = false, filterCalled = false;
        const origModify = globalThis.modifyBlacklistedItems;
        const origPut = globalThis.putBlacklistedItems;
        const origFilter = globalThis.filterAllContent;

        globalThis.modifyBlacklistedItems = (type,name) => { modifyCalledWith = {type,name}; return origModify(type,name);};
        globalThis.putBlacklistedItems = async (i) => { putCalled = true; return origPut(i);}; // Assume success
        globalThis.filterAllContent = () => { filterCalled = true; };

        await onHideItem('channels', 'TestChannel');
        assertEquals('channels', modifyCalledWith.type, "modifyBlacklistedItems type correct");
        assertEquals('TestChannel', modifyCalledWith.name, "modifyBlacklistedItems name correct");
        assertTrue(putCalled, "putBlacklistedItems should be called");
        assertTrue(filterCalled, "filterAllContent should be called");

        globalThis.modifyBlacklistedItems = origModify;
        globalThis.putBlacklistedItems = origPut;
        globalThis.filterAllContent = origFilter;
    });

    test("toggleHideButtonsVisibility updates state, storage, and UI", async () => {
        const mockHideButton = createMockElement('button', {id:'uttvManageButtonToggleVisibility'});
        mockDocument.body.appendChild(mockHideButton); // So getElementById can find it
        globalThis.renderButtons = true; // Initial state

        // Create some mock buttons that would be affected
        const itemButton = createMockElement('button', {class:'uttv-hide-item'});
        const tagButton = createMockElement('button', {class:'uttv-hide-tag'});
        mockDocument.body.appendChild(itemButton);
        mockDocument.body.appendChild(tagButton);

        let storageSetCalledWith = null;
        mockChrome.storage.local.set = async (obj) => { storageSetCalledWith = obj; };

        await toggleHideButtonsVisibility(false); // Toggle to false

        assertFalse(globalThis.renderButtons, "renderButtons global var updated");
        assertNotNull(storageSetCalledWith, "storage.set called");
        assertFalse(storageSetCalledWith.renderButtons, "renderButtons stored as false");
        assertTrue(itemButton.classList.contains('uttv-hidden'), "Item hide button hidden class toggled");
        assertTrue(tagButton.classList.contains('uttv-hidden'), "Tag hide button hidden class toggled");
        assertEquals(chrome.i18n.getMessage("managementShowButtons"), mockHideButton.title, "Toggle button title updated for 'show'");
    });

    test("addManagementButton appends button container and handles clicks", () => {
        const mainContent = setupMockTwitchDOM(null, []); // Need a .tw-tower or similar

        let openBlacklistSent = false;
        mockChrome.runtime.sendMessage = async (msg) => { if(msg.action === 'openBlacklist') openBlacklistSent = true; return {success:true}; };
        let toggleVisibilityCalled = false;
        const origToggleVis = globalThis.toggleHideButtonsVisibility;
        globalThis.toggleHideButtonsVisibility = async (s) => { toggleVisibilityCalled = true; };

        addManagementButton();

        const mgmtContainer = mainContent.querySelector('.uttv-management-container');
        assertNotNull(mgmtContainer, "Management button container added");
        const manageBtn = mgmtContainer.querySelector('button#uttvManageButton'); // First button
        const toggleBtn = mgmtContainer.querySelector('button#uttvManageButtonToggleVisibility'); // Second button
        assertNotNull(manageBtn, "Manage Blacklist button added");
        assertNotNull(toggleBtn, "Toggle Visibility button added");

        manageBtn.click(); // Simulate click
        assertTrue(openBlacklistSent, "Clicking Manage Blacklist sends message");

        toggleBtn.click(); // Simulate click
        assertTrue(toggleVisibilityCalled, "Clicking Toggle Visibility calls handler");

        globalThis.toggleHideButtonsVisibility = origToggleVis;
    });

    test("onPageChange calls addManagementButton and filterAllContent on supported page", () => {
        mockWindow.location.pathname = "/directory/category/Art"; // Supported page
        let mgmtButtonAdded = false; let filterAllCalled = false; let setIntervalCalled = false;
        const origAddMgmt = globalThis.addManagementButton; const origFilterAll = globalThis.filterAllContent;
        const origSetInterval = mockWindow.setInterval;
        globalThis.addManagementButton = () => { mgmtButtonAdded = true; };
        globalThis.filterAllContent = () => { filterAllCalled = true; };
        mockWindow.setInterval = (fn,t) => { setIntervalCalled = true; return origSetInterval(fn,t); };

        onPageChange();
        assertTrue(mgmtButtonAdded, "addManagementButton called on supported page change");
        assertTrue(filterAllCalled, "filterAllContent called on supported page change");
        assertTrue(setIntervalCalled, "itemPollInterval should be set");

        globalThis.addManagementButton = origAddMgmt; globalThis.filterAllContent = origFilterAll;
        mockWindow.setInterval = origSetInterval;
    });

    test("chrome.runtime.onMessage listener handles requests", async () => {
        const listener = mockChrome.runtime.onMessage._listener; // Assuming mock stored it
        assertNotNull(listener, "Runtime message listener should be set up by directory.js");

        // Test 'renderButtons'
        let toggleVisCalledWith = null;
        const origToggleVis = globalThis.toggleHideButtonsVisibility;
        globalThis.toggleHideButtonsVisibility = async (s) => { toggleVisCalledWith = s; };
        await listener({ renderButtons: false }, {}, () => {});
        assertEquals(false, toggleVisCalledWith, "renderButtons message toggles visibility");

        // Test 'extension' enable/disable
        mockWindow._reloadCalled = false;
        await listener({ extension: "disable" }, {}, () => {});
        assertFalse(globalThis.enabled, "Extension disabled by message");
        assertTrue(mockWindow._reloadCalled, "Window reloaded on extension disable");

        // Test 'blacklistedItems'
        let putItemsCalled = false; let filterAfterPut = false;
        const origPutItems = globalThis.putBlacklistedItems; const origFilterAll = globalThis.filterAllContent;
        globalThis.putBlacklistedItems = async (i) => { putItemsCalled = true; return {success:true};}; // Mock success
        globalThis.filterAllContent = () => { filterAfterPut = true; };
        let sendResponseCalled = false;
        await listener({ blacklistedItems: { channels: {"x":1} } }, {}, () => {sendResponseCalled = true;});
        assertTrue(putItemsCalled, "putBlacklistedItems called by message");
        assertTrue(filterAfterPut, "filterAllContent called after successful putItems");
        assertTrue(sendResponseCalled, "sendResponse called for blacklistedItems message");

        globalThis.toggleHideButtonsVisibility = origToggleVis;
        globalThis.putBlacklistedItems = origPutItems;
        globalThis.filterAllContent = origFilterAll;
    });

    test("getBlacklistedItems loads and merges fragments correctly", async () => {
        mockChrome.storage.local.get = async (keys) => ({
            blItemsFragment0: { channels: { "fraggedChan": 1 }, titles: ["fragTitle"] },
            blItemsFragmentCount: 1 // Only one fragment in this test
        });
        // No need to mock mergeBlacklistFragments if we trust its own tests, just check initBlacklistedItems
        let initItemsCalledWith = null;
        const origInitItems = globalThis.initBlacklistedItems;
        globalThis.initBlacklistedItems = (items) => { initItemsCalledWith = items; origInitItems(items);};

        await getBlacklistedItems();
        assertNotNull(initItemsCalledWith, "initBlacklistedItems should be called");
        assertNotNull(initItemsCalledWith.channels['fraggedChan'], "Fragmented channel data loaded");
        assertEquals("fragTitle", initItemsCalledWith.titles[0], "Fragmented title data loaded");

        globalThis.initBlacklistedItems = origInitItems;
    });

    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
