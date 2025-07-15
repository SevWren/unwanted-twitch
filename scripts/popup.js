/**
 * @file This script manages the functionality of the extension's popup window (`popup.html`).
 * @description It handles user interactions within the popup, such as opening the blacklist manager,
 * enabling or disabling the entire extension, and toggling the visibility of the "X" hide buttons
 * on Twitch pages. It communicates with the content scripts (via the background script) to apply these
 * changes. The script initializes the state of the popup's UI elements based on the current settings
 * saved in storage.
 * @author Unwanted Twitch
 * @license MIT
 * @version 1.0.0
 */
// jshint esversion: 6

/**
 * Opens the blacklist management page in a new tab.
 * @returns {Promise<void>}
 */
async function openBlacklist() {
	await chrome.runtime.sendMessage({ action: 'openBlacklist' });
	window.close(); // Close the popup after sending the message
}


/**
 * Retrieves the current state of the extension's main settings from storage.
 * @returns {Promise<[boolean, boolean]>} A promise that resolves to an array containing
 * the 'enabled' state and the 'renderButtons' state. Defaults to `[true, true]`.
 */
async function getState() {

	const result = await storageGet([ 'enabled', 'renderButtons' ]);

	let enabled       = true;
	let renderButtons = true;

	// enabled
	if (typeof result.enabled === 'boolean') {

		enabled = result.enabled;
	}

	// renderButtons
	if (typeof result.renderButtons === 'boolean') {

		renderButtons = result.renderButtons;
	}

	return [ enabled, renderButtons ];
}

/**
 * Sends a message to the content script to enable the extension's functionality.
 * This typically involves reloading the page to activate the content script's filters.
 * @returns {Promise<void>}
 */
async function enableExtension() {

	try {
		await chrome.runtime.sendMessage({ 'extension': 'enable' });
	}
	catch (error) {
		logError('Failed to enable extension.', error);
	}
}

/**
 * Sends a message to the content script to disable the extension's functionality.
 * This typically involves reloading the page to deactivate the content script's filters.
 * @returns {Promise<void>}
 */
async function disableExtension() {

	try {
		await chrome.runtime.sendMessage({ 'extension': 'disable' });
	}
	catch (error) {
		logError('Failed to disable extension.', error);
	}
}

/**
 * Toggles the extension's enabled/disabled state based on the current
 * state of the toggle button. Closes the popup after execution.
 * @this HTMLButtonElement
 */
function toggleExtension() {

	if (this.classList.contains('enabled')) {

		disableExtension();

	} else if (this.classList.contains('disabled')) {

		enableExtension();
	}

	window.close();
}

/**
 * Sends a message to the content script to toggle the visibility of the "X" hide buttons on stream/category cards.
 * @this HTMLInputElement
 * @returns {Promise<void>}
 */
async function toggleButtonsToggle() {

	try {
		await chrome.runtime.sendMessage({ 'renderButtons': this.checked });
	}
	catch (error) {
		logError('Failed to toggle button visibility.', error);
	}
}

// prepare elements
const blacklistManagerButton = document.getElementById('open_blacklist');
const stateToggleButton      = document.getElementById('toggle_extension');
const buttonsToggleButton    = document.getElementById('toggle_buttons');

// button actions
blacklistManagerButton.addEventListener('click', openBlacklist);
stateToggleButton.addEventListener('click', toggleExtension);
buttonsToggleButton.addEventListener('change', toggleButtonsToggle);

// localize
blacklistManagerButton.textContent                                = chrome.i18n.getMessage('popup_ManageBlacklist');
stateToggleButton.textContent                                     = chrome.i18n.getMessage('popup_DisableExtension');
buttonsToggleButton.parentNode.querySelector('label').textContent = chrome.i18n.getMessage('popup_ToggleButtons');

// initialize state
const init = async() => {

	const [ enabled, renderButtons ] = await getState();
	console.log(enabled, renderButtons);
	// enabled
	if (enabled === true) {

		document.getElementById('icon').classList.remove('disabled');

		stateToggleButton.classList.remove('disabled');
		stateToggleButton.classList.add('enabled');
		stateToggleButton.textContent = chrome.i18n.getMessage('popup_DisableExtension');

	} else {

		document.getElementById('icon').classList.add('disabled');

		stateToggleButton.classList.remove('enabled');
		stateToggleButton.classList.add('disabled');
		stateToggleButton.textContent = chrome.i18n.getMessage('popup_EnableExtension');
	}

	// renderButtons
	buttonsToggleButton.checked = renderButtons;
};
init();
