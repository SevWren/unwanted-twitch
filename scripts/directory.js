// jshint esversion: 6
// jshint -W069
// jshint -W083

console.log('%c[UTTV] SCRIPT INJECTED. Starting main execution loop.', 'color: #FF69B4; font-size: 18px; font-weight: bold;');

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let mainNode = null;
let enabled = true;
let renderButtons = true;
let hideFollowing = true;
let hideReruns = false;
let storedBlacklistedItems = {};
let backupBlacklistedItems = {};
let cacheExactTerms = {};
let cacheRegExpTerms = {};
let initRun = false;
let directoryFilterRunning = false;
let bruteForceInterval;

// ============================================================================
// MESSAGE LISTENER (Simplified for one-way notifications)
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[UTTV] Message received:', request);

    // This is the ONLY message we care about now for updates.
    if (request.action === 'blacklistUpdated') {
        console.log('%c[UTTV] Blacklist update notification received! Reloading and re-filtering.', 'color: lime; font-weight: bold;');
        (async () => {
            await reloadBlacklistFromStorage();
            reFilterAllVisibleCards();
        })();
    }
    
    // Handle other simple messages if needed
    if (typeof request['renderButtons'] === 'boolean') {
        toggleHideButtonsVisibility(request['renderButtons']);
    }
});


// ============================================================================
// CORE LOGIC
// ============================================================================

function processUnprocessedCards() {
    if (directoryFilterRunning || !mainNode) return;
    const items = getDirectoryItems('unprocessed');
    if (items.length > 0) {
        directoryFilterRunning = true;
        const remainingItems = filterDirectoryItems(items);
        attachHideButtons(remainingItems);
        directoryFilterRunning = false;
    }
}

function reFilterAllVisibleCards() {
    if (directoryFilterRunning || !mainNode) return;
    const items = getDirectoryItems('visible');
    if (items.length > 0) {
        directoryFilterRunning = true;
        filterDirectoryItems(items);
        directoryFilterRunning = false;
    }
}

function getDirectoryItemNodes(mode) {
    const suffix = {
        'visible': ':not([data-uttv-hidden="true"])',
        'unprocessed': ':not([data-uttv-processed="true"])'
    }[mode] || '';
    const selector = `div[data-target][style*="order:"]${suffix}`;
    if (!mainNode) return [];
    return mainNode.querySelectorAll(selector);
}

function getDirectoryItems(mode) {
    const itemNodes = getDirectoryItemNodes(mode);
    const items = [];
    for (const node of itemNodes) {
        const item = readChannel(node);
        if (item) items.push(item);
    }
    return items;
}

function readChannel(node) {
    const result = { type: 'channels', name: '', category: '', tags: [], title: '', rerun: false, node: node };
    try {
        const titleEl = node.querySelector('h4[title]');
        if (titleEl) result.title = titleEl.getAttribute('title').trim();
        const nameEl = node.querySelector('p[title].CoreText-sc-1txzju1-0');
        if (nameEl) {
            result.name = nameEl.getAttribute('title').trim();
        } else {
            const linkEl = node.querySelector('a[data-a-target="preview-card-channel-link"]');
            if (linkEl && linkEl.href) { result.name = new URL(linkEl.href).pathname.substring(1); }
        }
        if (!result.name) return null;
        const categoryEl = node.querySelector('a[data-a-target="preview-card-game-link"]');
        if (categoryEl) result.category = categoryEl.textContent.trim();
        node.querySelectorAll('button.tw-tag').forEach(tagEl => {
            const tagName = tagEl.getAttribute('data-a-target');
            if (tagName) result.tags.push({ name: tagName, node: tagEl });
        });
        result.rerun = !!node.querySelector('.stream-type-indicator--rerun');
        return result;
    } catch (e) { return null; }
}

function filterDirectoryItems(items) {
    let remainingItems = [];
    for (const item of items) {
        if (!item.node.hasAttribute('data-uttv-processed')) {
            item.node.setAttribute('data-uttv-processed', 'true');
        }
        if (isBlacklistedItem(item)) {
            item.node.style.display = 'none';
            item.node.setAttribute('data-uttv-hidden', 'true');
        } else {
            remainingItems.push(item);
        }
    }
    return remainingItems;
}

function attachHideButtons(items) {
    for (const item of items) {
        const cardTarget = item.node.querySelector('.stream-thumbnail, [data-a-target="preview-card-image-link"]');
        if (cardTarget && !cardTarget.hasAttribute('data-uttv-card-attached')) {
            cardTarget.setAttribute('data-uttv-card-attached', 'true');
            const hideItem = document.createElement('div');
            hideItem.className = 'uttv-hide-item uttv-channel';
            hideItem.textContent = 'X';
            hideItem.title = 'Hide Channel: ' + item.name;
            if (!renderButtons) hideItem.style.display = 'none';
            hideItem.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onHideItem(item); };
            cardTarget.style.position = 'relative';
            cardTarget.appendChild(hideItem);
        }
        if (!item.node.hasAttribute('data-uttv-tags-attached')) {
            item.node.setAttribute('data-uttv-tags-attached', 'true');
            for (const tag of item.tags) {
                tag.node.style.position = 'relative';
                const hideTag = document.createElement('div');
                hideTag.className = 'uttv-hide-tag';
                hideTag.textContent = 'X';
                hideTag.title = 'Hide Tag: ' + tag.name;
                if (!renderButtons) hideTag.style.display = 'none';
                hideTag.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onHideTag(item, tag); };
                if (!tag.node.querySelector('.uttv-hide-tag')) {
                    tag.node.appendChild(hideTag);
                }
            }
        }
    }
}

function isBlacklistedItem(item) {
    if (hideReruns && item.rerun) return true;
    if (matchTerms(item.name, 'channels')) return true;
    if (matchTerms(item.category, 'categories')) return true;
    if (item.tags.some(tag => matchTerms(tag.name, 'tags'))) return true;
    if (matchTerms(item.title, 'titles')) return true;
    return false;
}

function matchTerms(term, type) {
    if (typeof term !== 'string' || term.length === 0 || !storedBlacklistedItems[type]) return false;
    const termL = term.trim().normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    if (storedBlacklistedItems[type][term] || storedBlacklistedItems[type][termL]) return true;
    if (cacheExactTerms[type] && cacheExactTerms[type].includes(term)) return true;
    if (cacheRegExpTerms[type]) {
        for (const re of cacheRegExpTerms[type]) { if (re.test(term)) return true; }
    }
    return false;
}

// ============================================================================
// EVENT HANDLERS & BLACKLIST MANAGEMENT
// ============================================================================

async function onHideItem(item) {
    const nameL = item.name.trim().normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    modifyBlacklistedItems('channels', nameL);
    await putBlacklistedItems(storedBlacklistedItems);
    reFilterAllVisibleCards();
}

async function onHideTag(item, tag) {
    if (confirm(`Are you sure you want to hide all streams with the tag "${tag.name}"?`)) {
        const nameL = tag.name.trim().normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        modifyBlacklistedItems('tags', nameL);
        await putBlacklistedItems(storedBlacklistedItems);
        reFilterAllVisibleCards();
    }
}

function modifyBlacklistedItems(typeOrItems, item) {
    if (typeof typeOrItems === 'string' && typeof item === 'string') {
        if (!storedBlacklistedItems[typeOrItems]) storedBlacklistedItems[typeOrItems] = {};
        storedBlacklistedItems[typeOrItems][item] = 1;
    } else {
        storedBlacklistedItems = typeOrItems;
    }
    rebuildCaches();
}

function rebuildCaches() {
    cacheExactTerms = {};
    cacheRegExpTerms = {};
    for (const type in storedBlacklistedItems) {
        cacheExactTerms[type] = [];
        cacheRegExpTerms[type] = [];
        for (const term in storedBlacklistedItems[type]) {
            if (term.startsWith("'") && term.endsWith("'")) {
                cacheExactTerms[type].push(term.slice(1, -1));
            } else if (term.startsWith("/") && term.lastIndexOf("/") > 0) {
                try {
                    const pattern = term.slice(1, term.lastIndexOf("/"));
                    const flags = term.slice(term.lastIndexOf("/") + 1);
                    cacheRegExpTerms[type].push(new RegExp(pattern, flags));
                } catch (e) {}
            }
        }
    }
}

async function putBlacklistedItems(items) {
    // This function is now only used by onHideItem/onHideTag.
    // It saves and then sends a notification for other tabs.
    const result = await storageSet({ 'blacklistedItems': items });
    if (!result) { // storageSet returns null on success
        await chrome.runtime.sendMessage({ action: 'blacklistUpdated' });
    }
    return result;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function reloadBlacklistFromStorage() {
    console.log('[UTTV] Reloading blacklist from storage...');
    const result = await storageGet(null);
    let newBlacklist = result.blacklistedItems || (result['blItemsFragment0'] ? mergeBlacklistFragments(result) : {});
    modifyBlacklistedItems(newBlacklist);
    console.log('[UTTV] Blacklist reloaded and caches rebuilt.');
}

async function init() {
    if (initRun) return;
    initRun = true;

    const settings = await storageGet(['enabled', 'renderButtons', 'hideFollowing', 'hideReruns']);
    enabled = typeof settings.enabled === 'boolean' ? settings.enabled : true;
    if (!enabled) return;

    renderButtons = typeof settings.renderButtons === 'boolean' ? settings.renderButtons : true;
    hideFollowing = typeof settings.hideFollowing === 'boolean' ? settings.hideFollowing : true;
    hideReruns = typeof settings.hideReruns === 'boolean' ? settings.hideReruns : false;

    await reloadBlacklistFromStorage();

    bruteForceInterval = setInterval(processUnprocessedCards, 750);
}

function start() {
    const mainFinder = setInterval(() => {
        mainNode = document.querySelector('main');
        if (mainNode) {
            clearInterval(mainFinder);
            init();
        }
    }, 500);
    setTimeout(() => {
        if (!mainNode) {
            clearInterval(mainFinder);
        }
    }, 20000);
}

start();