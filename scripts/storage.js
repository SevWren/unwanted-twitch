/**
 * @file This script provides utility functions for managing data in Chrome's storage,
 * specifically handling the limitations of the `chrome.storage.sync` area.
 * @description The `chrome.storage.sync` API has strict limits on the number of items and the total
 * size of the data that can be stored. To work around these limitations for large blacklists,
 * this script provides functions to split a large blacklist object into smaller "fragments"
 * that can be stored individually, and to merge those fragments back into a single object upon retrieval.
 * It also includes a function to measure the approximate size of an object when serialized to JSON.
 * These utilities are crucial for allowing users to maintain large blacklists while still benefiting
 * from the cross-device synchronization feature of `chrome.storage.sync`.
 * @author Unwanted Twitch
 * @license MIT
 * @version 1.0.0
 */
// jshint esversion: 6

/**
 * The maximum number of individual keys that can be stored in the sync storage area.
 * A small amount of wiggle room is subtracted from the hard limit (`chrome.storage.sync.MAX_ITEMS`).
 * @const {number}
 */
const storageSyncMaxKeys = 500;

/**
 * The maximum size in bytes for a single item in the sync storage area.
 * A small amount of wiggle room is subtracted from the hard limit (`chrome.storage.sync.QUOTA_BYTES_PER_ITEM`).
 * @const {number}
 */
const storageSyncMaxSize = 8000;

/**
 * The maximum number of fragments to create when splitting a blacklist. This is a soft limit
 * to prevent runaway fragmentation.
 * @const {number}
 */
const storageMaxFragments = 100;

/**
 * Splits a large blacklist object into a series of smaller "fragment" objects.
 * This is necessary to store large blacklists in `chrome.storage.sync`, which has
 * limitations on the size of individual items. Each fragment is stored under a key
 * like `blItemsFragment0`, `blItemsFragment1`, etc.
 *
 * @param {object} items - The complete blacklist object to be split.
 * @returns {object} An object containing the generated fragments, ready to be stored.
 *                   For example: `{ blItemsFragment0: { channels: [...] }, blItemsFragment1: { ... } }`.
 */
function splitBlacklistItems(items) {
	logTrace('invoking splitBlacklistItems($)', items);

	const maxValuesPerFragment = 200;

	let fragments     = {};
	let fragmentIndex = 0;

	let remainingSpace = maxValuesPerFragment;

	for (let type in items) {
		if (!items.hasOwnProperty(type)) { continue; }

		// max. fragments reached?
		if (fragmentIndex >= storageSyncMaxKeys) {

			logError('Exceeding storage limit: storageSyncMaxKeys (' + storageSyncMaxKeys + '). Splitting aborted.');
			break;
		}

		let key = ('blItemsFragment' + fragmentIndex);
		if (fragments[key] === undefined) { fragments[key] = {}; }

		let values       = ( Array.isArray(items[type]) ? items[type] : Object.keys(items[type]) );
		let valuesLength = values.length;

		let sliceOffset     = 0;
		let remainingValues = valuesLength;

		if (remainingValues === 0) { continue; }

		while (true) {

			// no more space, start new fragment
			if (remainingSpace === 0) {

				fragmentIndex       += 1;
				key                  = ('blItemsFragment' + fragmentIndex);
				fragments[key]       = {};
				fragments[key][type] = [];
				remainingSpace       = maxValuesPerFragment;
			}

			// max. fragments reached?
			if (fragmentIndex >= storageSyncMaxKeys) {

				logError('Exceeding storage limit: storageSyncMaxKeys (' + storageSyncMaxKeys + '). Splitting aborted.');
				break;
			}

			let slice       = values.slice(sliceOffset, (sliceOffset + Math.min(remainingSpace, maxValuesPerFragment)));
			let sliceLength = slice.length;

			sliceOffset     += sliceLength;
			remainingSpace  -= sliceLength;
			remainingValues -= sliceLength;

			fragments[key][type] = slice;

			// no more values to add, go to next entry type
			if (remainingValues === 0) { break; }
		}
	}

	return fragments;
}

/**
 * Merges a collection of blacklist fragments from storage back into a single, cohesive blacklist object.
 * This function is the counterpart to `splitBlacklistItems`.
 *
 * @param {object} fragments - An object retrieved from storage, containing keys like `blItemsFragment0`, `blItemsFragment1`, etc.
 * @returns {object} The fully reconstructed blacklist object.
 */
function mergeBlacklistFragments(fragments) {
	logTrace('invoking mergeBlacklistFragments($)', fragments);

	let result = {};

	for (let i = 0; i < storageSyncMaxKeys; i++) {

		let fragmentKey = ('blItemsFragment' + i);

		let fragment = fragments[fragmentKey];
		if (fragment === undefined) { break; }

		for (let type in fragment) {
			if (!fragment.hasOwnProperty(type)) { continue; }

			if (type === 'titles') {

				if (result[type] === undefined) {

					result[type] = [];
				}

				const itemList       = fragment[type];
				const itemListLength = itemList.length;
				for (let n = 0; n < itemListLength; n++) {

					result[type].push(itemList[n]);
				}

			} else {

				if (result[type] === undefined) {

					result[type] = {};
				}

				const itemList       = fragment[type];
				const itemListLength = itemList.length;
				for (let n = 0; n < itemListLength; n++) {

					result[type][itemList[n]] = 1;
				}
			}
		}

	}

	return result;
}

/**
 * Calculates the approximate size (in bytes) of an object when it is serialized to a JSON string.
 * This is used to check if a blacklist will exceed the `chrome.storage.sync` quota before attempting to save it.
 *
 * @param {object|string} o - The object or string to measure.
 * @returns {number} The length of the serialized JSON string.
 */
function measureStoredSize(o) {
	logTrace('invoking measureStoredSize($)', o);

	let serialized;
	if (typeof o !== 'string') {

		serialized = JSON.stringify(o);

	} else {

		serialized = o;
	}

	return serialized.length;
}
