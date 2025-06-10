(function() {
    const testSuiteName = "popup.js";
    let testCount = 0;
    let assertionsMade = 0;
    // mockChrome will use the globalThis.chrome which is reset/managed by test()
    let mockDocument; // To hold mock document elements

    // Assertion Helpers
    function assertEquals(expected, actual, message) {
        assertionsMade++;
        if (expected !== actual) {
            throw new Error(`Assertion Failed: ${message}. Expected "${expected}", but got "${actual}".`);
        }
    }
    function assertTrue(actual, message) {
        assertionsMade++;
        if (actual !== true) {
            throw new Error(`Assertion Failed: ${message}. Expected "true", but got "${actual}".`);
        }
    }
    function assertCondition(condition, message) {
        assertionsMade++;
        if (!condition) {
            throw new Error(`Assertion Failed: ${message}. Condition was not met.`);
        }
    }

    // Function to simulate the DOM elements of popup.html
    function setupMockDOM() {
        mockDocument = {
            getElementById: function(id) {
                if (!this.elements[id]) {
                    this.elements[id] = {
                        id: id,
                        textContent: '',
                        checked: false,
                        classList: {
                            _classes: new Set(),
                            add: function(c) { this._classes.add(c); mockConsole.log(`classList.add('${c}') on #${id}`); },
                            remove: function(c) { this._classes.delete(c); mockConsole.log(`classList.remove('${c}') on #${id}`); },
                            contains: function(c) { return this._classes.has(c); }
                        },
                        addEventListener: function(type, listener) {
                            this.listeners = this.listeners || {};
                            this.listeners[type] = this.listeners[type] || [];
                            this.listeners[type].push(listener);
                            mockConsole.log(`addEventListener('${type}') on #${id}`);
                        },
                        dispatchEvent: function(event) {
                            mockConsole.log(`dispatchEvent('${event.type}') on #${id}`);
                            if (this.listeners && this.listeners[event.type]) {
                                this.listeners[event.type].forEach(l => l.call(this, event));
                            }
                        },
                        // Mock parentNode for querySelector('label') used by toggleButtonsToggle's label update
                        parentNode: (id === 'toggle_buttons' || id === 'toggle_extension') ? {
                            querySelector: function(selector) {
                                if (selector === 'label') {
                                    // Create a mock label associated with the checkbox/button if it doesn't exist
                                    const labelId = `label_for_${id}`;
                                    if (!mockDocument.elements[labelId]) {
                                        mockDocument.elements[labelId] = {
                                            id: labelId,
                                            textContent: ''
                                        };
                                    }
                                    return mockDocument.elements[labelId];
                                }
                                return null;
                            }
                        } : null // Only provide parentNode mock for specific elements
                    };
                }
                return this.elements[id];
            },
            elements: {} // Store mock elements here
        };
        globalThis.document = mockDocument; // Override global document
    }


    function test(testName, testFunction) {
        testCount++;
        setupMockDOM(); // Setup fresh mock DOM for each test

        // Reset parts of the global chrome mock
        if (globalThis.chrome) {
            if (globalThis.chrome.runtime) {
                globalThis.chrome.runtime.lastError = null;
                if(globalThis.chrome.runtime.sendMessage) globalThis.chrome.runtime.sendMessage._lastMessage = null;
            }
            if (globalThis.chrome.tabs) {
                if(globalThis.chrome.tabs.create) globalThis.chrome.tabs.create._lastUrl = null;
            }
            if (globalThis.chrome.storage) {
                if(globalThis.chrome.storage.local) globalThis.chrome.storage.local._store = {};
                if(globalThis.chrome.storage.sync) globalThis.chrome.storage.sync._store = {};
            }
        }

        // Ensure popup.js specific elements are explicitly created in the mock DOM before init() or listeners might run
        mockDocument.getElementById('open_blacklist');
        mockDocument.getElementById('toggle_extension');
        mockDocument.getElementById('toggle_buttons');
        mockDocument.getElementById('icon');

        // Re-attach listeners from popup.js as it runs its global logic once on load.
        // This is a workaround for not having proper module loading/setup/teardown.
        // We assume popup.js's global event listener attachments are done like:
        // document.getElementById('X').addEventListener('click', Y);
        // So, we need to simulate that Y is now attached to our new mock elements.
        // The most straightforward way is to call the functions from popup.js that add them,
        // or re-run init which should set them up.
        // The `init` function in popup.js sets up the UI AND event listeners.

        try {
            testFunction(); // This will call functions from popup.js
            reportTestResult(`${testSuiteName}: ${testName}`, true);
        } catch (error) {
            reportTestResult(`${testSuiteName}: ${testName}`, false, error);
        }
    }

    // --- Tests for openBlacklist ---
    test("openBlacklist should call chrome.tabs.create with correct URL", async () => {
        await openBlacklist(); // openBlacklist is global in popup.js
        const expectedUrl = globalThis.chrome.runtime.getURL("/views/blacklist.html");
        assertEquals(expectedUrl, globalThis.chrome.tabs.create._lastUrl, "chrome.tabs.create should be called with blacklist URL");
    });

    // --- Tests for getState ---
    test("getState should return default true for enabled and renderButtons if not in storage", async () => {
        const [enabled, renderButtons] = await getState();
        assertTrue(enabled, "Default enabled state should be true");
        assertTrue(renderButtons, "Default renderButtons state should be true");
    });

    test("getState should return stored values for enabled and renderButtons", async () => {
        await globalThis.chrome.storage.local.set({ enabled: false, renderButtons: false });
        const [enabled, renderButtons] = await getState();
        assertCondition(enabled === false, "Stored enabled state should be false");
        assertCondition(renderButtons === false, "Stored renderButtons state should be false");
    });

    // --- Tests for enableExtension / disableExtension ---
    test("enableExtension should send 'enable' message", async () => {
        await enableExtension();
        assertCondition(globalThis.chrome.runtime.sendMessage._lastMessage && globalThis.chrome.runtime.sendMessage._lastMessage.extension === 'enable', "enableExtension sends correct message");
    });

    test("disableExtension should send 'disable' message", async () => {
        await disableExtension();
        assertCondition(globalThis.chrome.runtime.sendMessage._lastMessage && globalThis.chrome.runtime.sendMessage._lastMessage.extension === 'disable', "disableExtension sends correct message");
    });

    // --- Tests for Event Listeners (via init calling them) ---
    test("Blacklist manager button click should trigger openBlacklist", async () => {
        await init(); // init adds the listeners in popup.js
        const button = mockDocument.getElementById('open_blacklist');
        button.dispatchEvent(new Event('click'));
        const expectedUrl = globalThis.chrome.runtime.getURL("/views/blacklist.html");
        assertEquals(expectedUrl, globalThis.chrome.tabs.create._lastUrl, "Clicking manage blacklist button");
    });

    test("Toggle extension button should call disableExtension if enabled, then enable", async () => {
        // Initial state: enabled (default or set by init)
        await globalThis.chrome.storage.local.set({ enabled: true, renderButtons: true });
        await init();

        const button = mockDocument.getElementById('toggle_extension');
        button.dispatchEvent(new Event('click')); // Should call disableExtension
        assertCondition(globalThis.chrome.runtime.sendMessage._lastMessage && globalThis.chrome.runtime.sendMessage._lastMessage.extension === 'disable', "First click (enabled->disabled) sends 'disable'");

        // Manually update class for next toggle (as actual DOM update is not fully mocked here)
        button.classList.remove('enabled');
        button.classList.add('disabled');
        mockDocument.getElementById('icon').classList.add('disabled');


        button.dispatchEvent(new Event('click')); // Should call enableExtension
        assertCondition(globalThis.chrome.runtime.sendMessage._lastMessage && globalThis.chrome.runtime.sendMessage._lastMessage.extension === 'enable', "Second click (disabled->enabled) sends 'enable'");
    });

    test("Toggle buttons checkbox change should send renderButtons message", async () => {
        await init(); // Setup listeners
        const checkbox = mockDocument.getElementById('toggle_buttons');

        checkbox.checked = true; // Simulate checking the box
        checkbox.dispatchEvent(new Event('change'));
        assertCondition(globalThis.chrome.runtime.sendMessage._lastMessage && globalThis.chrome.runtime.sendMessage._lastMessage.renderButtons === true, "Checking toggle_buttons sends true");

        checkbox.checked = false; // Simulate unchecking
        checkbox.dispatchEvent(new Event('change'));
        assertCondition(globalThis.chrome.runtime.sendMessage._lastMessage && globalThis.chrome.runtime.sendMessage._lastMessage.renderButtons === false, "Unchecking toggle_buttons sends false");
    });

    // --- Tests for init() ---
    test("init should set UI elements based on enabled state (true)", async () => {
        await globalThis.chrome.storage.local.set({ enabled: true, renderButtons: true });
        await init();

        const icon = mockDocument.getElementById('icon');
        const toggleButton = mockDocument.getElementById('toggle_extension');
        const buttonsToggle = mockDocument.getElementById('toggle_buttons');
        const toggleButtonLabel = mockDocument.getElementById('label_for_toggle_extension');


        assertCondition(!icon.classList.contains('disabled'), "Icon should not have 'disabled' class when enabled");
        assertCondition(toggleButton.classList.contains('enabled'), "Toggle button should have 'enabled' class");
        assertCondition(!toggleButton.classList.contains('disabled'), "Toggle button should not have 'disabled' class");
        assertEquals(globalThis.chrome.i18n.getMessage('popup_DisableExtension'), toggleButtonLabel.textContent, "Toggle button label for enabled state");
        assertTrue(buttonsToggle.checked, "Buttons toggle checkbox should be checked when renderButtons is true");
    });

    test("init should set UI elements based on enabled state (false)", async () => {
        await globalThis.chrome.storage.local.set({ enabled: false, renderButtons: false });
        await init();

        const icon = mockDocument.getElementById('icon');
        const toggleButton = mockDocument.getElementById('toggle_extension');
        const buttonsToggle = mockDocument.getElementById('toggle_buttons');
        const toggleButtonLabel = mockDocument.getElementById('label_for_toggle_extension');


        assertCondition(icon.classList.contains('disabled'), "Icon should have 'disabled' class when disabled");
        assertCondition(!toggleButton.classList.contains('enabled'), "Toggle button should not have 'enabled' class");
        assertCondition(toggleButton.classList.contains('disabled'), "Toggle button should have 'disabled' class");
        assertEquals(globalThis.chrome.i18n.getMessage('popup_EnableExtension'), toggleButtonLabel.textContent, "Toggle button label for disabled state");
        assertCondition(buttonsToggle.checked === false, "Buttons toggle checkbox should be unchecked when renderButtons is false");
    });

    console.log(`${testSuiteName}: ${assertionsMade} assertions in ${testCount} tests.`);
})();
