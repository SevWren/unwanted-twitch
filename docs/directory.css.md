# Documentation for `styles/directory.css`

## File Overview

This stylesheet provides the styles for the UI elements that are injected directly into the Twitch.tv directory pages by the content script (`directory.js`). This is a critical CSS file because it contains the rules that visually represent the extension's functionality on the live Twitch site.

Its responsibilities include:
1.  **Hiding Content**: Defining the `.uttv-hidden-item` class that is the core of the filtering mechanism.
2.  **Styling Injected UI**: Styling the "Manage Blacklist" button that appears at the top of directory pages.
3.  **Styling Interactive Elements**: Styling the "X" hide buttons that are overlaid on top of stream cards, category cards, and tags.
4.  **Dark Theme Compatibility**: Providing specific style overrides to ensure all injected elements look correct when Twitch's dark theme is active.

## Key Sections and Styles

### 1. Core Hiding Classes

-   **Selector**: `.uttv-hidden-item`, `.uttv-hidden`
-   **Purpose**: This is the most important rule in the entire extension. It is responsible for making the filtering work.
-   **Key Styles**:
    -   `display: none !important;`: When the content script (`directory.js`) identifies an item that should be blacklisted, it adds the `.uttv-hidden-item` class to that element's container. This CSS rule is what actually removes the element from the page layout. The `!important` flag is crucial here to ensure that this style overrides any of Twitch's own `display` properties (like `display: flex` or `display: grid`), which have high specificity.

### 2. Management Button (`.uttv-management-container`)

-   **Selector**: `.uttv-management-container`, `.uttv-button`
-   **Purpose**: To style the "Manage Blacklist" button that is injected by `directory.js` at the top of the content area.
-   **Key Styles**:
    -   The container uses `text-align: right;` to position the button.
    -   The `.uttv-button` itself uses `display: inline-flex;` to create a flexible container for the icon, the "Manage" text, and the "Toggle" text.
    -   It includes a `background-image` with a base64-encoded URL for the extension's icon, preventing the need for an external image request.
    -   The `.uttv-manage` and `.uttv-toggle` sections within the button have their own padding and hover effects to create a good user experience.

### 3. Hide Buttons on Cards (`.uttv-hide-item`)

-   **Selector**: `.uttv-hide-item` (Note: This selector is reused from the hiding class, but here it refers to the "X" button itself, not the item being hidden. This is a slight ambiguity in the naming).
-   **Purpose**: To style the circular "X" button that appears on stream and category cards.
-   **Key Styles**:
    -   `position: absolute;`: This is critical. It lifts the button out of the normal document flow so it can be overlaid on top of the card. This requires the parent element (the card container) to have `position: relative;`, which is set by `directory.js`.
    -   `top: 8px;`, `right: 8px;`: Positions the button in the top-right corner of the card.
    -   `z-index: 1001;`: Sets a high z-index to ensure the button appears on top of other elements on the card, like Twitch's own badges.
    -   `border-radius: 9000px;`: A common trick to create a perfect circle regardless of the element's size.
    -   A `transition` is defined for `background-color` to provide a smooth visual effect on hover.

### 4. Hide Buttons on Tags (`.uttv-hide-tag`)

-   **Selector**: `.uttv-hide-tag`
-   **Purpose**: To style the smaller "X" button that appears on individual tags within a stream card.
-   **Key Styles**:
    -   `position: absolute;`: Same principle as the card hide button, but this is positioned relative to the tag element itself.
    -   `top: -5px;`, `right: -5px;`: Positions the button slightly outside the top-right corner of the tag for a nice visual offset.
    -   `z-index: 1002;`: An even higher z-index to ensure it appears on top of the card's main hide button if they happen to overlap.
    -   Includes a `transform: scale(1.1);` on hover to give the button a subtle "pop" effect when the user interacts with it.

### 5. Dark Theme Overrides

-   **Selector**: `html.tw-root--theme-dark ...`
-   **Purpose**: To adjust the colors of all the injected UI elements to match Twitch's dark theme.
-   **Mechanism**:
    -   The styles are prefixed with `html.tw-root--theme-dark`, which is the class that Twitch applies to the `<html>` element when dark mode is active.
    -   It redefines the `background-color`, `border-color`, and `color` of the `.uttv-button`, `.uttv-hide-item`, and `.uttv-hide-tag` to use lighter colors that have better contrast on a dark background.
    -   The hover colors are also adjusted to a brighter purple (`#a970ff`) for better visibility in dark mode.

This stylesheet is a good example of how to inject and style UI in a third-party website. It uses specific, prefixed class names to avoid conflicts, relies on absolute positioning to overlay controls, and uses the website's own theme class (`.tw-root--theme-dark`) to provide a seamless visual experience for the user.
