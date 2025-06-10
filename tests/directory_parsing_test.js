(function() {
    const testSuiteName = "directory.js (DOM Parsing & Page Logic)";
    let testCount = 0;
    let assertionsMade = 0;
    let mockDocument;
    let mockWindow;

    // Assertion Helpers
    function assertEquals(expected, actual, message) { assertionsMade++; if (expected !== actual) throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`); }
    function assertDeepEquals(expected, actual, message) { assertionsMade++; if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Assertion Failed: ${message}. Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}.`); }
    function assertTrue(actual, message) { assertionsMade++; if (actual !== true) throw new Error(`Assertion Failed: ${message}. Expected "true", but got "${actual}".`); }
    function assertFalse(actual, message) { assertionsMade++; if (actual !== false) throw new Error(`Assertion Failed: ${message}. Expected "false", but got "${actual}".`); }
    function assertNotNull(actual, message) { assertionsMade++; if (actual === null) throw new Error(`Assertion Failed: ${message}. Expected not "null", but got "${actual}".`); }
    function assertNull(actual, message) { assertionsMade++; if (actual !== null) throw new Error(`Assertion Failed: ${message}. Expected "null", but got "${actual}".`); }
    function assertCondition(condition, message) { assertionsMade++; if (!condition) throw new Error(`Assertion Failed: ${message}. Condition was not met.`); }

    // Mock DOM Element Creation Utility
    function createMockElement(tagName, attributes = {}, children = []) {
        const el = {
            tagName: tagName.toUpperCase(),
            attributes: {},
            children: [],
            classList: { _classes: new Set(), add: function(c){this._classes.add(c);}, remove: function(c){this._classes.delete(c);}, contains: function(c){return this._classes.has(c);}},
            style: {},
            textContent: '',
            getAttribute: function(name) { return this.attributes[name]; },
            setAttribute: function(name, value) { this.attributes[name] = value; },
            querySelector: function(selector) {
                // Simplified querySelector: checks tag, class, attribute
                return this.children.find(child => {
                    if (selector.startsWith('.')) return child.classList.contains(selector.substring(1));
                    if (selector.startsWith('#')) return child.id === selector.substring(1);
                    if (selector.includes('[')) { // e.g., a[href^="/directory/game"]
                        const [tag, attrPart] = selector.split('[');
                        const [attrKey, valCheck] = attrPart.slice(0, -1).split(/[\^\*\$=]+/); // Simplified: gets key
                        const expectedVal = valCheck ? valCheck.replace(/["']/g, '') : undefined;
                        return child.tagName === tag.toUpperCase() && child.attributes[attrKey] !== undefined &&
                               (expectedVal === undefined || String(child.attributes[attrKey]).startsWith(expectedVal));
                    }
                    return child.tagName === selector.toUpperCase();
                }) || null;
            },
            querySelectorAll: function(selector) {
                 // Simplified querySelectorAll
                return this.children.filter(child => {
                    if (selector.startsWith('.')) return child.classList.contains(selector.substring(1));
                    if (selector.startsWith('#')) return child.id === selector.substring(1);
                     if (selector.includes('[')) {
                        const [tag, attrPart] = selector.split('[');
                        const [attrKey, valCheck] = attrPart.slice(0, -1).split(/[\^\*\$=]+/);
                        const expectedVal = valCheck ? valCheck.replace(/["']/g, '') : undefined;
                        return child.tagName === tag.toUpperCase() && child.attributes[attrKey] !== undefined &&
                               (expectedVal === undefined || String(child.attributes[attrKey]).startsWith(expectedVal));
                    }
                    return child.tagName === selector.toUpperCase();
                });
            },
            appendChild: function(child) { this.children.push(child); child.parentNode = this; },
            matches: function(selector) { // Basic matches logic for getDirectoryItemNodes
                if (selector.startsWith('.')) return this.classList.contains(selector.substring(1));
                if (selector === ':not([data-uttv-processed])') return this.attributes['data-uttv-processed'] === undefined;
                return true; // Simplified
            },
            closest: function(selector) { // Simplified closest
                if (this.matches(selector)) return this;
                if (this.parentNode) return this.parentNode.closest(selector);
                return null;
            },
            parentNode: null
        };
        for (const key in attributes) {
            if (key === 'class') attributes[key].split(' ').forEach(c => el.classList.add(c));
            else if (key === 'textContent') el.textContent = attributes[key];
            else if (key === 'id') el.id = attributes[key];
            else el.setAttribute(key, attributes[key]);
        }
        children.forEach(child => el.appendChild(child));
        return el;
    }

    function setupMockTwitchDOM(pageType, itemsData = []) {
        mockDocument = { // Reset global mock document
            _elements: {},
            body: createMockElement('body'), // Add body
            getElementById: function(id) { return this._elements[id] || null; }, // Allow null return
            querySelector: function(selector) { return this.body.querySelector(selector); },
            querySelectorAll: function(selector) { return this.body.querySelectorAll(selector); },
            createElement: createMockElement // Use our utility
        };
        globalThis.document = mockDocument;

        const tower = createMockElement('div', { class: 'tw-tower' });
        mockDocument.body.appendChild(tower);

        if (pageType === 'categoriesPage') { // /directory
            itemsData.forEach(item => { // item = { name: "Game Name", tags: ["Tag1", "Tag2"] }
                const cardLink = createMockElement('a', { href: `/directory/category/${encodeURIComponent(item.name)}` });
                const gameCard = createMockElement('div', { class: 'game-card' }, [cardLink]);
                // Add title element for game name
                const titleP = createMockElement('p', { class: 'CoreText-sc-1txeqho-0 game-card-title', textContent: item.name });
                cardLink.appendChild(titleP);

                if (item.tags && item.tags.length > 0) {
                    const tagContainer = createMockElement('div');
                    item.tags.forEach(tagText => {
                        tagContainer.appendChild(createMockElement('a', { class: 'tw-tag' }, [
                            createMockElement('span', { textContent: tagText })
                        ]));
                    });
                    gameCard.appendChild(tagContainer); // Tags are often outside the main link in structure
                }
                tower.appendChild(gameCard);
            });
        } else if (pageType === 'channelsPage') { // /directory/category/game
            itemsData.forEach(item => { // item = { name: "ChannelName", title: "Stream Title", tags: [], category: "Game", isRerun: false }
                const streamCard = createMockElement('div', { class: 'stream-thumbnail' }); // A common parent/ancestor
                const link = createMockElement('a', { href: `/${item.name}` });
                streamCard.appendChild(link);

                // Title (often a p or h3 with a title attribute)
                link.appendChild(createMockElement('p', { class: 'CoreText-sc-1txeqho-0 kdxJsK', title: item.title, textContent: item.title }));

                // Tags
                const tagContainer = createMockElement('div');
                if (item.tags && item.tags.length > 0) {
                    item.tags.forEach(tagText => {
                        tagContainer.appendChild(createMockElement('a', { class: 'tw-tag' }, [
                             createMockElement('span', { textContent: tagText })
                        ]));
                    });
                }
                link.appendChild(tagContainer); // Assuming tags are within the main link area for channels

                // Category (usually not directly on stream card, but getCategoryFromPage() is used)
                // isRerun (check for specific rerun indicator element if applicable)
                if (item.isRerun) {
                    // Example: Twitch might use a specific element/class for reruns.
                    // This selector is based on one of the selectors in directory.js for reruns.
                    link.appendChild(createMockElement('div', { class: 'Layout-sc-1xcs6mc-0 hNloth' }, [
                        createMockElement('p', { textContent: 'Rerun' }) // Or however it's indicated
                    ]));
                }
                tower.appendChild(streamCard);
            });
        }

        // Mock side nav if needed by tests for getSidebarItems
        const sideNav = createMockElement('nav', { id: 'side-nav' });
        if (itemsData.sidebarItems) { // itemsData.sidebarItems = [{name: "Channel", category: "Game"}]
            itemsData.sidebarItems.forEach(item => {
                const cardLink = createMockElement('a', { class: 'side-nav-card__link', href: `/${item.name}` });
                // Add structure inside cardLink that readSidebarCard expects
                cardLink.appendChild(createMockElement('p', { class: 'side-nav-card__title', textContent: item.name }));
                cardLink.appendChild(createMockElement('a', { class: 'side-nav-card__subtitle', textContent: item.category, href: `/directory/category/${item.category}`}));
                sideNav.appendChild(createMockElement('div', { class: 'side-nav-card' }, [cardLink]));
            });
        }
        mockDocument.body.appendChild(sideNav); // Add sideNav to body
    }


    function test(testName, testFunction) {
        testCount++;
        // mockDocument and mockWindow will be set by setupMockTwitchDOM or specific test setups
        mockChrome = globalThis.chrome; // Use global mock
        mockWindow = globalThis.window; // Use global mock

        // Reset global state from directory.js if any
        globalThis.currentPageType = null;
        globalThis.currentCategory = null;
        // Reset any spies or logs on mocks if needed for specific tests
        if (mockWindow.location) mockWindow.location._originalPathname = mockWindow.location.pathname; // Save original

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
             if (mockWindow.location && mockWindow.location._originalPathname) { // Restore pathname
                mockWindow.location.pathname = mockWindow.location._originalPathname;
            }
        }
    }

    // --- Tests ---
    test("getCurrentPage should return window.location.pathname", () => {
        mockWindow.location.pathname = "/directory/all";
        assertEquals("/directory/all", getCurrentPage(), "Pathname match");
    });

    test("getPageType identifies various page types correctly", () => {
        assertEquals('categories', getPageType("/directory"), "/directory -> categories");
        assertEquals('categories', getPageType("/directory/"), "/directory/ -> categories");
        assertEquals('channels', getPageType("/directory/category/some-game"), "/directory/category/some-game -> channels");
        assertEquals('channels', getPageType("/directory/game/other-game"), "/directory/game/other-game -> channels (legacy)");
        assertEquals('following', getPageType("/directory/following"), "/directory/following -> following");
        assertEquals('videos', getPageType("/directory/videos/12345"), "/directory/videos/12345 -> videos");
        assertEquals(null, getPageType("/some/other/path"), "Unknown path -> null");
    });

    test("isSupportedPage correctly identifies supported pages", () => {
        assertTrue(isSupportedPage(getPageType("/directory")), "Categories page is supported");
        assertTrue(isSupportedPage(getPageType("/directory/category/art")), "Channels page is supported");
        assertFalse(isSupportedPage(getPageType("/directory/following")), "Following page not supported by default processing");
    });

    test("getCategoryFromPage extracts category name", () => {
        mockWindow.location.pathname = "/directory/category/Creative";
        assertEquals("Creative", getCategoryFromPage(), "Category from /directory/category/");
        mockWindow.location.pathname = "/directory/game/Science%20%26%20Technology";
        assertEquals("Science & Technology", getCategoryFromPage(), "Category from /directory/game/ with decoding");
        mockWindow.location.pathname = "/directory";
        assertNull(getCategoryFromPage(), "No category for /directory");
    });

    test("getDirectoryItemNodes returns correct nodes for categories page", () => {
        setupMockTwitchDOM('categoriesPage', [{ name: "Game 1" }, { name: "Game 2" }]);
        globalThis.currentPageType = 'categories';
        const nodes = getDirectoryItemNodes('unprocessed');
        assertEquals(2, nodes.length, "Nodes for categories page (unprocessed)");
        // Test 'visible' mode (removes :not([data-uttv-processed]))
        nodes[0].setAttribute('data-uttv-processed', 'true');
        const visibleNodes = getDirectoryItemNodes('visible');
        assertEquals(2, visibleNodes.length, "Visible nodes for categories (includes processed)");
    });

    test("getDirectoryItemNodes returns correct nodes for channels page", () => {
        setupMockTwitchDOM('channelsPage', [{ name: "Channel1", title: "Live" }]);
        globalThis.currentPageType = 'channels';
        const nodes = getDirectoryItemNodes('unprocessed');
        assertEquals(1, nodes.length, "Nodes for channels page (unprocessed)");
    });

    test("readCategoryCard extracts name and tags", () => {
        setupMockTwitchDOM('categoriesPage', [{ name: "Art", tags: ["Drawing", "Painting"] }]);
        const cardNode = document.querySelector('.game-card'); // Get the first one
        const cardData = readCategoryCard(cardNode);
        assertEquals("Art", cardData.name, "Category name");
        assertDeepEquals(["Drawing", "Painting"], cardData.tags.sort(), "Category tags");
    });

    test("readChannel extracts channel data", () => {
        mockWindow.location.pathname = "/directory/category/Talk%20Shows%20%26%20Podcasts"; // For getCategoryFromPage
        setupMockTwitchDOM('channelsPage', [{ name: "StreamerDude", title: "Big Chat", tags: ["IRL"], category: "Talk Shows & Podcasts", isRerun: true }]);
        const channelNode = document.querySelector('.stream-thumbnail'); // Get the first one
        const channelData = readChannel(channelNode);

        assertEquals("StreamerDude", channelData.name, "Channel name from URL");
        assertEquals("Big Chat", channelData.title, "Channel title");
        assertDeepEquals(["IRL"], channelData.tags, "Channel tags");
        assertEquals("Talk Shows & Podcasts", channelData.category, "Channel category from page");
        assertTrue(channelData.isRerun, "Channel isRerun status");
    });

    test("getDirectoryItems integrates node selection and parsing for categories", () => {
        setupMockTwitchDOM('categoriesPage', [{ name: "Music", tags: ["Live"] }, { name: "Gaming" }]);
        globalThis.currentPageType = 'categories';
        const items = getDirectoryItems('unprocessed');
        assertEquals(2, items.length, "Number of category items");
        assertEquals("Music", items[0].name, "First category item name");
        assertDeepEquals(["Live"], items[0].tags, "First category item tags");
    });

    test("getSidebarItemNodes and getSidebarItems work correctly", () => {
        setupMockTwitchDOM(null, { sidebarItems: [{name: "SideChannel", category: "SideGame"}] });
        const sidebarNodes = getSidebarItemNodes('unprocessed');
        assertEquals(1, sidebarNodes.length, "Sidebar nodes count");

        const sidebarItems = getSidebarItems('unprocessed');
        assertEquals(1, sidebarItems.length, "Sidebar items count");
        assertEquals("SideChannel", sidebarItems[0].name, "Sidebar item name");
        assertEquals("SideGame", sidebarItems[0].category, "Sidebar item category");
    });

    test("readTags extracts tags from various elements", () => {
        const container = createMockElement('div', {}, [
            createMockElement('a', {class:'tw-tag'}, [createMockElement('span', {textContent:'Tag1'})]),
            createMockElement('button', {class:'tw-tag'}, [createMockElement('span', {textContent:'Tag2'})])
        ]);
        const tags = readTags(container);
        assertDeepEquals(["Tag1", "Tag2"], tags.sort(), "Tags from mixed elements");
    });

    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
