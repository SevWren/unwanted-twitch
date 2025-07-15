/**
 * @file This script serves as the background worker for the "Unwanted Twitch" extension.
 * @description It handles several key functionalities:
 * 1.  **URL Redirection**: It automatically changes the sorting of Twitch directory pages from the default "Relevance" to "Viewer Count (High to Low)". This is the core feature of the extension. It specifically targets directory pages while excluding certain paths like 'following', 'videos', and 'clips'.
 * 2.  **Browser Action (Icon) Management**: It enables the extension's icon in the browser toolbar only when the user is on a Twitch.tv tab and disables it otherwise, providing a clear visual cue of when the extension is active.
 * 3.  **Message Handling**: It listens for messages from other parts of the extension (like popup scripts) to perform actions, such as opening the blacklist page. It also acts as a message-passing hub, forwarding relevant messages to content scripts running on Twitch tabs.
 * 4.  **Initialization**: On startup, it correctly sets the initial state of the browser action icon for all existing tabs.
 *
 * This script is designed to be persistent (within the constraints of Manifest V3 service workers) and operates without direct user interaction for its primary redirection and icon management tasks.
 * @author Unwanted Twitch
 * @license MIT
 * @version 1.0.0
 */
// jshint esversion: 6

const twitchUrl = 'https://www.twitch.tv/';

// --- Constants for Redirection ---
const BASE_DIRECTORY_PATH = '/directory';
// Prefixes within /directory to EXCLUDE from default sorting override
const EXCLUDED_DIRECTORY_PREFIXES = [
    '/directory/following',
    '/directory/videos', // Exclude VOD pages
    '/directory/clips', // Exclude Clip pages
    '/directory/discovery' // Exclude discovery (if it exists and has different sorting)
    // Add any other specific /directory sub-paths to exclude here
];
const SORT_PARAM = 'sort';
const RELEVANCE_VALUE = 'RELEVANCE';
const VIEWER_COUNT_VALUE = 'VIEWER_COUNT';

// --- Helper logging functions ---
/**
 * Logs informational messages to the console with a consistent prefix.
 * @param {...*} args - The arguments to log.
 */
function logInfo(...args) {
    console.log('UTTV BG INFO:', ...args);
}
/**
 * Logs warning messages to the console with a consistent prefix.
 * @param {...*} args - The arguments to log.
 */
function logWarn(...args) {
    console.warn('UTTV BG WARN:', ...args);
}
/**
 * Logs error messages to the console with a consistent prefix.
 * @param {...*} args - The arguments to log.
 */
function logError(...args) {
    console.error('UTTV BG ERROR:', ...args);
}
/**
 * Logs verbose (debugging) messages to the console. Can be commented out in production.
 * @param {...*} args - The arguments to log.
 */
function logVerbose(...args) {
     console.log('UTTV BG VERBOSE:', ...args); // Uncomment for detailed debugging
}


/**
 * Analyzes a URL and redirects if it's a Twitch directory page that needs its sorting parameter changed.
 * It checks if the URL is a main directory page (and not an excluded one) and if the sort parameter
 * is either missing or set to 'RELEVANCE'. If so, it updates the URL to sort by 'VIEWER_COUNT'
 * and redirects the tab.
 * @param {number} tabId - The ID of the tab to potentially redirect.
 * @param {string} url - The URL of the tab to check.
 * @returns {Promise<boolean>} A promise that resolves to `true` if a redirect occurred, `false` otherwise.
 */
async function handleUrlRedirect(tabId, url) {
    try {
        // Ensure URL is valid
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            logVerbose(`Skipping redirect check for invalid/incomplete URL: ${url}`);
            return false;
        }
        const currentUrl = new URL(url);

        // Check hostname first
        if (currentUrl.hostname !== 'www.twitch.tv') {
            return false;
        }

        const pathname = currentUrl.pathname.replace(/\/$/, ''); // Normalize path

        // --- Dynamic Pattern Check ---
        let isTargetPath = false;
        if (pathname.startsWith(BASE_DIRECTORY_PATH)) {
            // It's a directory path, now check if it's NOT one of the excluded prefixes
            isTargetPath = !EXCLUDED_DIRECTORY_PREFIXES.some(prefix => pathname.startsWith(prefix));
            logVerbose(`Pathname ${pathname}. Starts with /directory? Yes. Is excluded? ${!isTargetPath}`);
        } else {
             logVerbose(`Pathname ${pathname} does not start with /directory.`);
        }
        // --- End Dynamic Pattern Check ---


        if (!isTargetPath) {
            logVerbose(`Pathname ${pathname} is not targeted for sort override.`);
            return false; // Not a path we want to modify sort for
        }

        // Check the current sort parameter
        const currentSort = currentUrl.searchParams.get(SORT_PARAM);

        // Condition: Redirect if sort is missing OR sort is RELEVANCE
        if (currentSort === null || currentSort === RELEVANCE_VALUE) {
            const reason = currentSort === null ? 'missing' : 'RELEVANCE';
            logInfo(`Redirect Triggered: Path ${pathname} matched dynamic pattern and sort was ${reason}. Original: ${url}`);

            // Modify the sort parameter
            currentUrl.searchParams.set(SORT_PARAM, VIEWER_COUNT_VALUE);
            const newUrl = currentUrl.href;

            // Prevent redirect loops if somehow the URL is already the target
            if (newUrl === url) {
                logWarn(`Prevented redirect loop for URL: ${url}`);
                return false;
            }

            // Update the tab's URL to redirect
            // Use try-catch as the tab might close during the async operation
            try {
                await chrome.tabs.update(tabId, { url: newUrl });
                logInfo(`Redirected tab ${tabId} to: ${newUrl}`);
                return true; // Indicate redirect happened
            } catch (updateError) {
                logWarn(`Failed to update tab ${tabId} (it might have closed): ${updateError.message}`);
                return false;
            }
        } else {
             logVerbose(`Path ${pathname} matched pattern, but sort is already '${currentSort}'. No redirect needed.`);
        }

    } catch (e) {
        // Ignore errors like invalid URLs during navigation phases
        logWarn(`Error processing URL for redirect: ${e}`, url);
    }
    return false; // No redirect performed
}


/**
 * Listens for updates to tabs and orchestrates actions based on the changes.
 * This function serves two main purposes:
 * 1.  **Icon Management**: Enables or disables the browser action icon based on whether the tab's URL is for Twitch.tv.
 * 2.  **URL Redirection**: When a tab's URL changes, it triggers the `handleUrlRedirect` function to check if a sort-by-viewer-count redirect is needed. This check is specifically tied to the 'loading' status to ensure it acts on the new URL being navigated to.
 * @listens chrome.tabs.onUpdated
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {

    // --- 1. Icon Enabling/Disabling Logic ---
    const urlForIconCheck = changeInfo.url || tab?.url;

    if (urlForIconCheck) {
        try {
            if (urlForIconCheck.startsWith(twitchUrl)) {
                await chrome.action.enable(tabId);
            } else {
                await chrome.action.disable(tabId);
            }
        } catch (error) {
             if (error.message && !error.message.toLowerCase().includes('no tab with id')) {
                logError(`Error setting action state for tab ${tabId}:`, error);
             }
        }
    }

    // --- 2. URL Redirection Logic ---
    const urlForRedirectCheck = changeInfo.url; // IMPORTANT: Only act on changeInfo.url when status is loading
    // Perform redirect check ONLY if the URL *actually changed* and the tab is loading
    if (urlForRedirectCheck && changeInfo.status === 'loading') {
        await handleUrlRedirect(tabId, urlForRedirectCheck);
    }
});


/**
 * Forwards a message to a list of specified tabs.
 * It iterates through the tabs, ensures they are valid and have a 'complete' status,
 * and then sends the message. It handles potential errors gracefully, such as when a tab
 * is not ready to receive messages or has been closed.
 * @param {object} request - The message payload to forward.
 * @param {chrome.tabs.Tab[]} tabs - An array of tabs to forward the message to.
 * @returns {Promise<void>} A promise that resolves when the forwarding attempt is complete.
 */
async function forwardMessageToTabs(request, tabs) {
    let relevantTabs = [];
    let tabsLength = tabs.length;
    for (let i = 0; i < tabsLength; i++) {
        if (tabs[i] && typeof tabs[i].url === 'string') {
            relevantTabs.push(tabs[i]);
        }
    }

    let dispatcherIndex = 0;
    tabsLength = relevantTabs.length;
    logVerbose(`Forwarding message to ${tabsLength} relevant tabs:`, request);

    for (let i = 0; i < tabsLength; i++) {
        request.dispatcherIndex = dispatcherIndex;
        try {
            if (relevantTabs[i].status === 'complete') {
                await chrome.tabs.sendMessage(relevantTabs[i].id, request);
                dispatcherIndex++;
                logVerbose(`Message sent successfully to tab ${relevantTabs[i].id}`);
            } else {
                 logVerbose(`Skipping message send to tab ${relevantTabs[i].id}, status is '${relevantTabs[i].status}'.`);
            }
        }
        catch (error) {
            if (error.message && !error.message.includes("Could not establish connection") && !error.message.includes("Receiving end does not exist")) {
                 logError(`Error sending message to tab ${relevantTabs[i].id}:`, error);
            } else {
                 logVerbose(`Could not send message to tab ${relevantTabs[i].id} (likely not ready):`, error.message);
            }
        }
    }
}

/**
 * Listens for incoming messages from other parts of the extension.
 * This acts as the central message router for the background script.
 * - If the message contains a specific `action` (e.g., 'openBlacklist'), it handles it directly.
 * - Otherwise, it assumes the message is intended for content scripts and forwards it to all active Twitch tabs using `forwardMessageToTabs`.
 * @listens chrome.runtime.onMessage
 * @returns {boolean} Returns `true` to indicate that the listener will respond asynchronously. This is crucial for Manifest V3 service workers.
 */
chrome.runtime.onMessage.addListener(async(request) => {
    logVerbose("Background received message:", request);
    // actions
    if (request && request.action) {
        switch (request.action) {
            case 'openBlacklist':
                logInfo("Handling action: openBlacklist");
                await chrome.tabs.create({ active: true, url: '/views/blacklist.html' });
            break;
            default:
                logWarn("Received unknown action:", request.action);
            break;
        }
    // passthrough to content scripts
    } else {
        logVerbose("Passing message through to content scripts...");
        const tabs = await chrome.tabs.query({ url: (twitchUrl + '*') });
        await forwardMessageToTabs(request, tabs);
    }
    // Important for async listeners in MV3
    return true;
});

/**
 * Sets the initial state of the browser action icon for all currently open tabs.
 * It queries all tabs, enabling the icon for Twitch tabs and disabling it for all others.
 * This ensures the UI is in the correct state when the extension is first installed or enabled.
 * @returns {Promise<void>}
 */
async function setInitialIconStates() {
    try {
        const twitchTabs = await chrome.tabs.query({ url: twitchUrl + '*' });
        twitchTabs.forEach(tab => {
            if (tab.id) {
                chrome.action.enable(tab.id).catch(e => logWarn(`Failed initial enable for tab ${tab.id}: ${e.message}`));
            }
        });

        // Query all tabs and then filter to disable non-Twitch ones
        const allTabs = await chrome.tabs.query({ url: '*://*/*' });
        allTabs.forEach(tab => {
            // Check if tab exists, has an ID, has a URL, and the URL does not start with twitchUrl
            if (tab && tab.id && tab.url && !tab.url.startsWith(twitchUrl)) {
                chrome.action.disable(tab.id).catch(e => {
                    // Ignore errors for tabs that might have closed since the query or other benign issues
                    if (e.message && !e.message.toLowerCase().includes('no tab with id') && !e.message.toLowerCase().includes('the tab was discarded')) {
                        logWarn(`Failed initial disable for non-Twitch tab ${tab.id}: ${e.message}`);
                    }
                });
            }
        });
    } catch (error) {
        logError("Error setting initial icon states:", error);
    }
}

// Initialize the extension's state when the script is first loaded.
setInitialIconStates();

logInfo("Unwanted Twitch Background Script Loaded and Initialized.");
