/**
 * @file Manages the blacklist settings page (`views/blacklist.html`).
 * @description This script handles all user interactions on the blacklist page, including adding, removing,
 * importing, and exporting blacklisted items (categories, channels, tags, and titles). It communicates
 * with the storage system (via `storage.js`) and the content scripts to apply changes. The page allows
 * users to manage four types of blacklist entries, configure general settings like hiding reruns or
 * followed channels from the filter, and choose between cloud (sync) and local storage.
 *
 * The script is responsible for:
 * - Dynamically creating and managing the UI for blacklist items.
 * - Validating user input, including regular expressions.
 * - Handling the import of blacklist data from a JSON file.
 * - Handling the export of the current blacklist to a JSON file.
 * - Saving all settings and blacklist data to the chosen storage area.
 * - Communicating with content scripts to apply the new blacklist immediately after saving.
 * - Displaying storage usage statistics.
 * - Providing visual feedback to the user (e.g., loading screens, save button flashing).
 * @author Unwanted Twitch
 * @license MIT
 * @version 1.0.0
 */
// jshint esversion: 6
// jshint -W069

/* BEGIN: runtime cache */

	_getMessage_blacklist_Remove = chrome.i18n.getMessage('blacklist_Remove');

/* END: runtime cache */

/**
 * Creates a table row for a blacklist item with a key and a remove button.
 *
 * @param {string} key - The key/value to be displayed in the first cell of the row.
 * @returns {HTMLTableRowElement} A table row element representing a blacklist item.
 */
function createItemRow(key) {

	let row = document.createElement('tr');
	row.className = 'item';

	let cell1 = document.createElement('td');
	cell1.textContent = key;

	let cell2 = document.createElement('td');

	let button = document.createElement('button');
	button.textContent = _getMessage_blacklist_Remove; // from runtime cache
	button.setAttribute('data-key', key);
	button.addEventListener('click', onRemoveItem);

	cell2.appendChild(button);

	row.appendChild(cell1);
	row.appendChild(cell2);

	return row;
}

/**
 * Adds a single item to the specified table if it doesn't already exist.
 *
 * @param {HTMLTableElement} table - The table element to add the item to.
 * @param {string} key - The item (e.g., channel name, category) to add.
 * @returns {boolean} `true` if the item was added, `false` if it already existed.
 */
function addItem(table, key) {

	// prevent adding the same key more than once
	if (itemExists(table, key) === true) {

		return false;
	}

	table.insertBefore(
		createItemRow(key),
		table.children[0].nextSibling
	);
	handleItemCount(table);

	return true;
}

/**
 * Adds a collection of items to the specified table.
 * It sorts the items (case-insensitively) before creating and appending the corresponding table rows.
 *
 * @param {HTMLTableElement} table - The table to add the items to.
 * @param {Object.<string, *>|string[]} [items] - The items to add, either as an object map or an array of strings.
 * @returns {number} The total number of items in the table after the operation.
 */
function addItems(table, items) {

	if (typeof items !== 'object') {

		return handleItemCount(table);
	}

	let sortedKeys         = ( Array.isArray(items) ? items : Object.keys(items) );
	const sortedKeysLength = sortedKeys.length;

	// sort items (case insensitive)
	sortedKeys = sortedKeys.sort(function (a, b) {

		return normalizeCase(a).localeCompare( normalizeCase(b) );
	});

	let fragment = document.createDocumentFragment();

	for (let i = 0; i < sortedKeysLength; i++) {

		let key = sortedKeys[i];

		fragment.appendChild(
			createItemRow(key)
		);
	}

	table.appendChild(fragment);
	return handleItemCount(table);
}

/**
 * Removes all items (rows with class 'item') from the provided table.
 *
 * @param {HTMLTableElement} table - The table to clear.
 */
function clearItems(table) {

	const rows       = table.querySelectorAll('tr.item');
	const rowsLength = rows.length;

	for (let i = (rowsLength - 1); i >= 0; i--) {

		table.removeChild(rows[i]);
	}

	handleItemCount(table);

	flashSaveButton();
}

/**
 * Checks if a given key already exists in the table.
 *
 * @param {HTMLTableElement} table - The table to check.
 * @param {string} key - The key to look for.
 * @returns {boolean} `true` if the item exists, `false` otherwise.
 */
function itemExists(table, key) {

	const presentKeys = gatherKeysArray(table);

	return (presentKeys.indexOf(key) >= 0);
}

/**
 * Event handler for when the user adds a new item to the blacklist via the input field.
 * This function processes the input value (trims, validates regex, normalizes case) and adds it to the table.
 *
 * @param {HTMLTableRowElement} row - The table row containing the input element.
 * @param {boolean} [byUser=true] - Whether the function was called by a direct user action (which triggers UI feedback like flashing the save button).
 */
function onAddItem(row, byUser = true) {

	const input = row.querySelector('input');
	const table = row.parentNode;

	let item = input.value.trim();

	// remove consecutive whitespaces
	item = item.replace(/[\s]{2,}/g, ' ');

	// convert quotes
	item = item.replace(/^"/, "'");
	item = item.replace(/"$/, "'");

	if (isExactTerm(item)) {

		// don't touch

	} else if (isRegExpTerm(item)) {

		const re = toRegExp(item);
		if (re !== null) {

			item = re.toString();

		} else {

			item = '';
			alert('The entered regular expression pattern is invalid.');
		}
	}
	else {

		item = normalizeCase(item);
	}

	if (item.length > 0) {

		addItem(table, item);
		input.value = '';

		if (byUser) {
			flashSaveButton();
		}
	}

	if (byUser) {
		input.focus();
	}
}

/**
 * Event handler for when the user clicks the "Remove" button on a blacklist item.
 * It removes the corresponding row from the table and updates the UI.
 * @this HTMLButtonElement
 */
function onRemoveItem() {

	const row   = this.parentNode.parentNode;
	const table = row.parentNode;

	row.remove();
	handleItemCount(table);

	flashSaveButton();
}

/**
 * Updates the item count in the table's header and manages the visibility
 * of the "no items" row and the "Clear" button.
 *
 * @param {HTMLTableElement} table - The table that contains the items.
 * @returns {number} The number of items in the table.
 */
function handleItemCount(table) {

	const count = table.querySelectorAll('tr.item').length;

	// update count in head
	table.parentNode.querySelector('.count').textContent = ('(' + count + ')');

	// remove row with a note about having no items
	const emptyRow = table.querySelector('tr.empty');
	if (emptyRow !== null) {
		emptyRow.remove();
	}

	// append row with a note about having no items
	if (count === 0) {

		let row = document.createElement('tr');
		row.className = 'empty';

		let cell = document.createElement('td');
		cell.setAttribute('colspan', 2);
		cell.textContent = chrome.i18n.getMessage('blacklist_Empty');

		row.appendChild(cell);
		table.appendChild(row);

		// hide "Clear" button
		table.parentNode.querySelector('button.clear').style.display = 'none';

	} else {

		// show "Clear" button
		table.parentNode.querySelector('button.clear').style.display = 'inline-block';
	}

	return count;
}

/**
 * Collects keys from elements with a `data-key` attribute within a table and
 * stores them in an object map (e.g., `{ "key1": 1, "key2": 1 }`).
 * This format is used for categories, channels, and tags for efficient lookups.
 *
 * @param {HTMLTableElement} table - The table element from which to gather keys.
 * @returns {Object.<string, number>} An object where each key from the table is mapped to `1`.
 */
function gatherKeysMap(table) {

	let result = {};

	let nodes = table.querySelectorAll('[data-key]');
	const nodesLength = nodes.length;

	for (let i = 0; i < nodesLength; i++) {

		let key = nodes[i].getAttribute('data-key');;
		result[key] = 1;
	}

	return result;
}

/**
 * Collects keys from elements with a `data-key` attribute within a table and
 * returns them in an array. This format is used for titles.
 *
 * @param {HTMLTableElement} table - The table element from which to gather keys.
 * @returns {string[]} An array of keys from the table.
 */
function gatherKeysArray(table) {
	let result = [];

	let nodes = table.querySelectorAll('[data-key]');
	const nodesLength = nodes.length;

	for (let i = 0; i < nodesLength; i++) {

		let key = nodes[i].getAttribute('data-key');
		result.push(key);
	}

	return result;
}

/**
 * Saves the entire blacklist configuration and updates the live filter.
 * This function orchestrates the saving process:
 * 1. Shows a loading screen and disables buttons.
 * 2. Saves general settings (storage mode, hide following/reruns).
 * 3. Gathers all blacklist items from the UI tables.
 * 4. Sends the complete blacklist to the content script via a runtime message.
 *    The content script is responsible for writing to storage and applying the filter.
 * 5. Waits for a confirmation message from the content script.
 * 6. If successful, closes the blacklist tab. If it fails or times out, it alerts the user and keeps the tab open.
 *
 * @returns {Promise<void>} A promise that resolves when the save operation is complete (or has failed).
 */
async function onSave() {

	// Disable buttons during save
	toggleLoadingScreen(true); // Show loading overlay and disable buttons

	try {
		// Save settings first (these are small and should generally succeed)
		await chrome.storage.local.set({ 'useLocalStorage': !useSyncStorageCheckbox.checked });
		await storageSet({ 'hideFollowing': hideFollowingCheckbox.checked });
		await storageSet({ 'hideReruns': hideRerunsCheckbox.checked });

		// add all "pending" user inputs before gathering keys
		document.querySelectorAll('button.add').forEach((e) => {
			// Check if input has value before calling onAddItem
			const input = e.parentNode.parentNode.querySelector('input');
			if (input && input.value.trim().length > 0) {
				onAddItem(e.parentNode.parentNode, false); // Add items without flashing save button
			}
		});

		/* BEGIN: update items */

			let items = {};

			items.categories = gatherKeysMap(categories);
			items.channels   = gatherKeysMap(channels);
			items.tags       = gatherKeysMap(tags);
			items.titles     = gatherKeysArray(titles);

			// store via content script to reflect changes immediately
			let saveOutcome = { success: false, switchedToLocal: false }; // Store result object
			try {
				logInfo("Sending blacklist to content script for saving...");
				// --- AWAIT the response with timeout ---
				const responsePromise = chrome.runtime.sendMessage({ 'blacklistedItems': items });
				const timeoutPromise = new Promise((_, reject) =>
					// Increased timeout to 15 seconds for potentially large local saves
					setTimeout(() => reject(new Error("Timeout waiting for save confirmation")), 15000)
				);

				// Wait for either the response or the timeout
				const response = await Promise.race([responsePromise, timeoutPromise]);
				// --- END AWAIT ---

				logInfo("Response received from content script:", response);

				// --- Check response object ---
				// Ensure response is an object and has the expected properties
				if (response && typeof response === 'object' && typeof response.success === 'boolean') {
					saveOutcome = response; // Store the actual result { success: bool, switchedToLocal: bool }
					if (saveOutcome.success) {
						logInfo("Content script confirmed successful save processing.");
						if (saveOutcome.switchedToLocal) {
							logInfo("Save successful, but mode was switched to Local Storage.");
							// Update the UI checkbox to reflect the change
							useSyncStorageCheckbox.checked = false;
							alert("Blacklist saved successfully to Local Storage (Cloud Sync was disabled due to size).");
						} else {
							logInfo("Blacklist saved successfully using the selected storage mode.");
							// Optional: Briefly notify user of success without alert spam
							// console.log("Blacklist saved.");
						}
					} else {
						// The content script explicitly reported failure (e.g., critical error during save)
						logError("Content script reported save FAILED.");
						alert("Error: The extension failed to save the blacklist. Please check the console for details.");
					}
				} else if (response instanceof Error && response.message.includes("Timeout")) {
					 logError("Timeout waiting for save confirmation from content script.");
					 alert("Warning: Did not receive confirmation of blacklist save within 15 seconds. The save might have failed or is taking a long time. Please check the blacklist later.");
					 saveOutcome.success = false; // Ensure success is false on timeout
				} else {
					 // Response was received but wasn't the expected format
					 logError("Content script did not send expected confirmation object. Response:", response);
					 alert("Warning: Could not confirm blacklist save status due to unexpected response. Please check the console.");
					 saveOutcome.success = false; // Treat unexpected response as failure
				}
				// --- END Check ---

			}
			catch (error) {
				// This catches errors from sendMessage itself or the timeout rejection
				logError("Error sending blacklist message or receiving response:", error);
				alert("Error saving blacklist: " + (error.message || error) + "\nPlease check the console.");
				saveOutcome.success = false; // Mark failure
			}

		/* END: update items */

		// --- Call onCancel AFTER response, conditionally ---
		if (saveOutcome.success) {
			logInfo("Save successful, closing blacklist tab.");
			isModified = false; // Reset modified flag on success
			saveButton.classList.remove('flashed');
			await onCancel(); // Close the tab
		} else {
			logError("Save failed or confirmation timed out/invalid. Blacklist tab will NOT be closed automatically.");
			alert("Save failed or timed out. The blacklist page will remain open. Please check the console for errors and try saving again later.");
			// Re-enable buttons potentially disabled during save attempt
			toggleLoadingScreen(false);
			// Keep modified flag true so save button remains active/flashing
			// isModified = false; // Don't reset this on failure
			// saveButton.classList.remove('flashed'); // Keep flashing on failure
		}
	} catch (outerError) {
		// Catch errors from setting storage mode, hideFollowing, hideReruns
		logError("Error during initial settings save in onSave:", outerError);
		alert("An error occurred while saving settings. Please check the console.");
		toggleLoadingScreen(false); // Ensure buttons are re-enabled on error
		// Keep modified flag potentially true
	}
}

/**
 * Closes the current tab. Intended to be called after a successful save or when the user clicks "Cancel".
 * @returns {Promise<void>}
 */
async function onCancel() {

	const tab = await chrome.tabs.getCurrent();

	await chrome.tabs.remove(tab.id);
}

/**
 * Handles the file import process. It opens a file dialog, reads the selected JSON file,
 * parses it, and adds the contained items to the respective blacklist tables.
 */
function onImport() {

	let input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json,.txt';

	input.addEventListener('change', (event) => {

		if (event.target.files.length === 0) { return; }

		// reader
		const reader = new FileReader();
		reader.addEventListener('load', () => {

			let processed = false;

			try {

				const deserializedImport = JSON.parse(reader.result);

				if (typeof deserializedImport === 'object') {

					if ( Array.isArray(deserializedImport.categories) ) {

						addItems(categories, deserializedImport.categories);
					}

					if ( Array.isArray(deserializedImport.channels) ) {

						addItems(channels, deserializedImport.channels);
					}

					if ( Array.isArray(deserializedImport.tags) ) {

						addItems(tags, deserializedImport.tags);
					}

					if ( Array.isArray(deserializedImport.titles) ) {

						addItems(titles, deserializedImport.titles);
					}

					processed = true;

				} else {

					console.warn('UnwantedTwitch: Unexpected content:', deserializedImport);
				}

			} catch (exception) {

				console.error('UnwantedTwitch: Exception caught:', exception);
			}

			toggleLoadingScreen(false);

			if (processed === true) {

				// defer alert to redraw DOM first
				setTimeout(() => {

					alert( chrome.i18n.getMessage('blacklist_ImportSuccess') );

				}, 200);

			} else {

				// defer alert to redraw DOM first
				setTimeout(() => {

					alert( chrome.i18n.getMessage('blacklist_ImportFailure') );

				}, 200);
			}
		});
		reader.addEventListener('error', () => {

			alert('Unwanted Twitch:\nUnexpected error while reading the selected file.');
		});

		toggleLoadingScreen(true);

		reader.readAsText(
			event.target.files[0]
		);
	});

	// trigger dialog
	input.click();
}

/**
 * Handles the file export process. It gathers all blacklist items from the UI,
 * serializes them into a JSON string, and triggers a file download.
 */
function onExport() {

	let result = {};

	result.categories = gatherKeysArray(categories);
	result.channels   = gatherKeysArray(channels);
	result.tags       = gatherKeysArray(tags);
	result.titles     = gatherKeysArray(titles);

	const serializedBlacklist = JSON.stringify(result);

	let download = document.createElement('a');
	download.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(serializedBlacklist));
	
	// Added date string to export filename (day-month-year format)
	const currentDate = new Date();
	const day = currentDate.getDate();
	const month = currentDate.getMonth() + 1;
	const year = currentDate.getFullYear();
	const dateString = `${day}-${month}-${year}`;
	download.setAttribute('download', `UnwantedTwitch_Blacklist_${dateString}.json`);

	// trigger dialog
	document.body.appendChild(download);
	download.click();
	document.body.removeChild(download);
}

/**
 * Initiates a flashing animation on the "Save" button to indicate that there are unsaved changes.
 * It sets a flag to prevent multiple intervals from being created.
 * @param {number} [interval=400] - The interval in milliseconds for the flashing animation.
 */
function flashSaveButton(interval) {

	if (typeof interval !== 'number') {

		interval = 400;
	}

	if (isModified === true) { return; }
	isModified = true;

	setInterval(() => {

		saveButton.classList.toggle('flashed');

	}, interval);
}

/**
 * Shows an alert with an explanation of the supported title matching patterns.
 */
function onPatternExplained() {

	alert( chrome.i18n.getMessage('blacklist_PatternExplainedText') );
}

/**
 * Shows or hides the loading overlay and toggles the disabled state of the main action buttons.
 * @param {boolean} show - `true` to show the loading screen, `false` to hide it.
 */
function toggleLoadingScreen(show) {

	if (show === true) {

		processingScreen.removeAttribute('hidden');

	} else {

		processingScreen.setAttribute('hidden', '');
	}

	saveButton.disabled   = show;
	importButton.disabled = show;
	exportButton.disabled = show;
}

// indicates if there are changes to save
let isModified = false;

/* BEGIN: prepare elements */

	const hideFollowingCheckbox  = document.getElementById('hideFollowing');
	const hideRerunsCheckbox     = document.getElementById('hideReruns');
	const useSyncStorageCheckbox = document.getElementById('useSyncStorage');

	const categories        = document.getElementById('table_categories');
	const channels          = document.getElementById('table_channels');
	const tags              = document.getElementById('table_tags');
	const titles            = document.getElementById('table_titles');
	const patternsExplained = document.querySelectorAll('[is-pattern]');

	const saveButton   = document.getElementById('save');
	const cancelButton = document.getElementById('cancel');

	const importButton = document.getElementById('import');
	const exportButton = document.getElementById('export');

	const processingScreen = document.getElementById('processing');

/* END: prepare elements */

// "clear" buttons
document.querySelectorAll('button.clear').forEach((e) => {

	e.addEventListener('click', () => {

		const table = e.parentNode.parentNode.parentNode.parentNode.querySelector('tbody');
		clearItems(table);
	});
});

// "add" buttons
document.querySelectorAll('button.add').forEach((e) => {

	e.addEventListener('click', function() {

		onAddItem(this.parentNode.parentNode);
	});
});

// "add" inputs
document.querySelectorAll('tr.input input').forEach((e) => {

	e.addEventListener('keydown', function(event) {

		// listen to ENTER key
		if (event.which === 13) {

			onAddItem(this.parentNode.parentNode);
		}
	});
});

/* BEGIN: button actions */

	hideFollowingCheckbox.addEventListener('change', flashSaveButton);
	hideRerunsCheckbox.addEventListener('change', flashSaveButton);
	useSyncStorageCheckbox.addEventListener('change', flashSaveButton);

	patternsExplained.forEach((e) => {

		e.addEventListener('click', () => {

			onPatternExplained();
		});
	});

	saveButton.addEventListener('click', onSave);
	cancelButton.addEventListener('click', onCancel);

	importButton.addEventListener('click', onImport);
	exportButton.addEventListener('click', onExport);

/* END: button actions */

/* BEGIN: localize */

	document.querySelector('.settings h2').textContent          = chrome.i18n.getMessage('blacklist_SettingsHeadline');
	document.getElementById('label_hideFollowing').textContent  = chrome.i18n.getMessage('blacklist_SettingsHideFollowing');
	document.getElementById('label_hideReruns').textContent     = chrome.i18n.getMessage('blacklist_SettingsHideReruns');
	document.getElementById('label_useSyncStorage').textContent = chrome.i18n.getMessage('blacklist_SettingsSyncStorage');

	document.getElementById('column_Categories').textContent = chrome.i18n.getMessage('blacklist_Categories');
	document.getElementById('column_Channels').textContent   = chrome.i18n.getMessage('blacklist_Channels');
	document.getElementById('column_Tags').textContent       = chrome.i18n.getMessage('blacklist_Tags');
	document.getElementById('column_Titles').textContent     = chrome.i18n.getMessage('blacklist_Titles');

	patternsExplained.forEach((e) => {

		e.textContent = chrome.i18n.getMessage('blacklist_PatternExplainedLabel');
	});

	document.querySelectorAll('button.clear').forEach((e) => {

		e.textContent = chrome.i18n.getMessage('blacklist_RemoveAll');
	});
	document.querySelectorAll('button.add').forEach((e) => {

		e.textContent = chrome.i18n.getMessage('blacklist_Add');
	});

	document.querySelectorAll('#table_categories tr.input input').forEach((e) => {

		e.placeholder = chrome.i18n.getMessage('blacklist_CategoriesInput');
	});
	document.querySelectorAll('#table_channels tr.input input').forEach((e) => {

		e.placeholder = chrome.i18n.getMessage('blacklist_ChannelsInput');
	});
	document.querySelectorAll('#table_tags tr.input input').forEach((e) => {

		e.placeholder = chrome.i18n.getMessage('blacklist_TagsInput');
	});
	document.querySelectorAll('#table_titles tr.input input').forEach((e) => {

		e.placeholder = chrome.i18n.getMessage('blacklist_TitlesInput');
	});

	saveButton.textContent   = chrome.i18n.getMessage('blacklist_Save');
	cancelButton.textContent = chrome.i18n.getMessage('blacklist_Cancel');

	importButton.textContent = chrome.i18n.getMessage('blacklist_Import');
	exportButton.textContent = chrome.i18n.getMessage('blacklist_Export');

	processingScreen.textContent = chrome.i18n.getMessage('blacklist_Processing');

/* END: localize */

// show loading screen on start
toggleLoadingScreen(true);

// load blacklisted items
const loadBlacklistedItems = async() => {

	const result = await storageGet(null);

	let blacklistedItems = {};
	if (typeof result.blacklistedItems === 'object') {

		blacklistedItems = result.blacklistedItems;

	} else if (typeof result['blItemsFragment0'] === 'object') {

		blacklistedItems = mergeBlacklistFragments(result);
	}

	addItems(categories, blacklistedItems.categories);
	addItems(channels,   blacklistedItems.channels);
	addItems(tags,       blacklistedItems.tags);
	addItems(titles,     blacklistedItems.titles);

	Promise.allSettled([

		loadHideFollowing(),
		loadHideReruns(),
		loadStorageMode(),

	]).then(() => {

		// hide loading screen
		toggleLoadingScreen(false);
	});

};
loadBlacklistedItems();

// hide following
async function loadHideFollowing() {

	const result = await storageGet('hideFollowing');

	hideFollowingCheckbox.checked = (
		(typeof result.hideFollowing !== 'boolean') ||
		(result.hideFollowing === true)
	);
}

// hide reruns
async function loadHideReruns() {

	const result = await storageGet('hideReruns');

	hideRerunsCheckbox.checked = (
		(typeof result.hideReruns === 'boolean') &&
		(result.hideReruns === true)
	);
}

// storage mode
async function loadStorageMode() {

	const mode = await getStorageMode();

	useSyncStorageCheckbox.checked = (mode === 'sync');
}

/* BEGIN: storage size */

	const reportStorageSizes = async() => {

		if (chrome.storage.sync.getBytesInUse) {

			const result = await chrome.storage.sync.getBytesInUse(null);

			document.getElementById('storageSize_sync').textContent = result.toLocaleString();
		}

		if (chrome.storage.local.getBytesInUse) {

			const result = await chrome.storage.local.getBytesInUse(null);

			document.getElementById('storageSize_local').textContent = result.toLocaleString();
		}

		document.querySelector('.storage-stats').style.visibility = 'visible';
	};
	reportStorageSizes();

/* END: storage size */

// report storage contents
if (debug <= 1) {

	const reportStorages = async() => {

		const syncStorage = await chrome.storage.sync.get(null);
		logVerbose('storage.sync:', syncStorage);

		const syncLocal = await chrome.storage.local.get(null);
		logVerbose('storage.local:', syncLocal);

		const clearStoragesButton = document.getElementById('clearStorages');
		clearStoragesButton.style.display = 'inline-block';
		clearStoragesButton.addEventListener('click', async() => {

			await chrome.storage.sync.clear();
			await chrome.storage.local.clear();

			alert('Unwanted Twitch:\nStorages cleared. Reloading...');

			window.location.reload();
		});
	};
	reportStorages();
}
