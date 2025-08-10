/**
 * @file This script provides common utility functions used across the "Unwanted Twitch" extension.
 * @description It includes helper functions for string manipulation, pattern matching (exact, loose, regex),
 * browser detection, and, most importantly, a set of wrappers for interacting with the `chrome.storage` API.
 * The storage wrappers abstract the logic of choosing between 'sync' and 'local' storage based on user
 * preferences, providing a consistent interface for other scripts. It also contains a tiered logging system
 * that can be controlled by a global `debug` constant.
 *
 * This file is intended to be included in any context (background, content scripts, popups) where these
 * utilities are needed, promoting code reuse and consistency.
 * @author Unwanted Twitch
 * @license MIT
 * @version 1.0.0
 */
// jshint esversion: 6
// jshint -W069

/**
 * @const {number} debug - The global debug level for logging.
 * @description Controls the verbosity of the logging functions.
 * - 0: TRACE, VERBOSE, INFO, WARN, ERROR
 * - 1: VERBOSE, INFO, WARN, ERROR
 * - 2: INFO, WARN, ERROR
 * - 3: WARN, ERROR
 * - 4: ERROR
 * - 5: NONE
 */
const debug = 0;

/**
 * Creates a deep copy of a blacklist items object.
 * @param {object} items - The object to clone.
 * @returns {object} A deep copy of the input object.
 */
function cloneBlacklistItems(items) {

	return JSON.parse( JSON.stringify(items) );
}

/**
 * Checks if the extension is running in Firefox.
 * This is determined by the presence of the `browser` global in addition to `chrome`.
 * @returns {boolean} `true` if the browser is Firefox, `false` otherwise.
 */
function isFirefox() {
	logTrace('invoking isFirefox()');

	return (
		(typeof chrome  !== 'undefined') &&
		(typeof browser !== 'undefined')
	);
}

/**
 * Determines if a filter term is an exact match term.
 * Exact match terms are enclosed in single quotes (e.g., `'exact term'`).
 * @param {string} term - The term to check.
 * @returns {boolean} `true` if the term is an exact match pattern.
 */
function isExactTerm(term) {

	const firstChar = term.slice(0, 1);
	const lastChar  = term.slice(-1);

	return (
		(firstChar === "'") &&
		(lastChar  === "'")
	);
}

/**
 * Determines if a filter term is a loose match term.
 * Loose match terms start with a tilde (`~`). This is not currently used for filtering but the helper exists.
 * @param {string} term - The term to check.
 * @returns {boolean} `true` if the term is a loose match pattern.
 */
function isLooseTerm(term) {

	const firstChar = term.slice(0, 1);

	return (firstChar === '~');
}

/**
 * Determines if a filter term is a regular expression.
 * Regex terms are enclosed in slashes (e.g., `/pattern/i`).
 * @param {string} term - The term to check.
 * @returns {boolean} `true` if the term is a valid regular expression pattern.
 */
function isRegExpTerm(term) {

	const firstChar = term.slice(0, 1);

	return (
		(firstChar === '/') &&
		/^\/(.*)\/[a-zA-Z]*$/.test(term)
	);
}

/**
 * Converts a string pattern into a `RegExp` object.
 * Handles extracting the pattern and flags from the string (e.g., `/pattern/i`).
 * @param {string} term - The string to convert into a regular expression.
 * @returns {RegExp|null} A `RegExp` object if the pattern is valid, otherwise `null`.
 */
function toRegExp(term) {

	let regexp;
	const isCI = /^\/[^/]*\/[^i]*i[^i]*$/.test(term);

	// strip
	term = term.substring(1, term.indexOf('/', 1));
	if (term.length === 0) { return null; }

	try {

		// case-insensitive
		if (isCI) {

			regexp = new RegExp(term, 'i');

		// case-sensitive
		} else {

			regexp = new RegExp(term);
		}

	} catch {

		return null;
	}

	return regexp;
}

/**
 * Normalizes a string by trimming, converting to lowercase, and removing diacritical marks.
 * This is essential for case-insensitive and accent-insensitive comparisons.
 * @param {string} term - The string to normalize.
 * @returns {string} The normalized string.
 */
function normalizeCase(term) {

	return String(term)
		.trim()
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
	;
}

/**
 * Asynchronously determines the current storage mode ('sync' or 'local') based on user settings.
 * It checks the `useLocalStorage` flag in `chrome.storage.local`.
 * @returns {Promise<'sync'|'local'>} A promise that resolves to the current storage mode.
 */
async function getStorageMode() {
	logTrace('invoking getStorageMode()');

	// default mode: local
	let useSyncStorage = false;

	const result = await chrome.storage.local.get('useLocalStorage');
	const error  = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to read from local storage:', error);
	}

	if (typeof result['useLocalStorage'] === 'boolean') {

		useSyncStorage = !result['useLocalStorage'];
	}

	// remember storage mode
	const storageMode = ( useSyncStorage ? 'sync' : 'local' );
	logVerbose('Storage mode is: ' + storageMode);

	return storageMode;
}

/**
 * A wrapper for `chrome.storage.get` that automatically uses the correct storage area (sync or local).
 * @param {string|string[]|object|null} data - The key(s) to retrieve from storage.
 * @returns {Promise<object>} A promise that resolves with the retrieved data.
 */
async function storageGet(data) {
	logTrace('invoking storageGet($)', data);

	const mode   = await getStorageMode();
	const result = await chrome.storage[mode].get(data);
	const error  = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to read from storage:', error);
	}

	return result;
}

/**
 * A wrapper for `chrome.storage.set` that automatically uses the correct storage area.
 * @param {object} data - An object containing key-value pairs to store.
 * @returns {Promise<Error|null>} A promise that resolves to the runtime error if one occurred, otherwise `null`.
 */
async function storageSet(data) {
	logTrace('invoking storageSet($)', data);

	const mode = await getStorageMode();
	await chrome.storage[mode].set(data);
	const error = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to write to storage:', error);
	}

	return (error ?? null);
}

/**
 * A wrapper for `chrome.storage.remove` that automatically uses the correct storage area.
 * @param {string|string[]} data - The key(s) to remove from storage.
 * @returns {Promise<Error|null>} A promise that resolves to the runtime error if one occurred, otherwise `null`.
 */
async function storageRemove(data) {
	logTrace('invoking storageRemove($)', data);

	const mode = await getStorageMode();
	await chrome.storage[mode].remove(data);
	const error = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to remove from storage:', error);
	}

	return error;
}

/**
 * A wrapper for `chrome.storage.clear` that automatically uses the correct storage area.
 * @returns {Promise<Error|null>} A promise that resolves to the runtime error if one occurred, otherwise `null`.
 */
async function storageClear() {
	logTrace('invoking storageClear()');

	const mode = await getStorageMode();
	await chrome.storage[mode].clear(); // CORRECTED: .clear() takes no arguments.
	const error = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to clear storage:', error);
	}

	return error;
}

/**
 * Logs a trace message to the console if the debug level is 0.
 * @param {...*} args - The arguments to log.
 */
function logTrace() {

	if (debug > 0) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV TRACE:');

	console.log.apply(console, args);
	return null;
}

/**
 * Logs a verbose message to the console if the debug level is 1 or lower.
 * @param {...*} args - The arguments to log.
 */
function logVerbose() {

	if (debug > 1) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV VERBOSE:');

	console.log.apply(console, args);
	return null;
}

/**
 * Logs an informational message to the console if the debug level is 2 or lower.
 * @param {...*} args - The arguments to log.
 */
function logInfo() {

	if (debug > 2) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV INFO:');

	console.log.apply(console, args);
	return null;
}

/**
 * Logs a warning message to the console if the debug level is 3 or lower.
 * @param {...*} args - The arguments to log.
 */
function logWarn() {

	if (debug > 3) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV WARN:');

	// console.warn would show up in the extension overview
	console.warn.apply(console, args);
	return null;
}

/**
 * Logs an error message to the console if the debug level is 4 or lower.
 * @param {...*} args - The arguments to log.
 */
function logError() {

	if (debug > 4) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV ERROR:');

	console.error.apply(console, args);
	return null;
}