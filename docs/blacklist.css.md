# Documentation for `styles/blacklist.css`

## File Overview

This stylesheet provides the specific styles for the blacklist management page (`views/blacklist.html`). It works in conjunction with `common.css` to create the layout and appearance of the settings page. While `common.css` provides the base styles for elements like buttons and tables, `blacklist.css` is responsible for arranging these elements into the final layout, including the four-column design for the blacklist tables and the fixed action bar at the bottom.

## Key Sections and Styles

### 1. `#blacklist` Container

-   **Selector**: `#blacklist`
-   **Purpose**: This is the main container for the entire page.
-   **Key Styles**:
    -   `padding-bottom: 96px;`: This is a crucial style. It adds a large amount of padding to the bottom of the page content. This is necessary to prevent the fixed-position `#actions` bar at the bottom of the page from overlapping and hiding the last few items in the blacklist tables.

### 2. `.settings` Section

-   **Selector**: `#blacklist .settings`
-   **Purpose**: Styles the top section of the page containing the global settings toggles.
-   **Key Styles**:
    -   It uses a two-column layout by setting `.left` and `.right` divs to `display: inline-block;` and `width: 50%;`.
    -   It also styles the `<h2>` header and the `.storage-stats` block, which displays the bytes used in sync and local storage. The `visibility: hidden;` on `.storage-stats` ensures it doesn't appear until the JavaScript has populated it with data.

### 3. `.area` (Blacklist Tables)

-   **Selector**: `#blacklist .area`
-   **Purpose**: This is the core of the layout. Each of the four blacklist tables (Categories, Channels, Tags, Titles) is wrapped in a `div` with the class `.area`.
-   **Key Styles**:
    -   `width: 24.5%;`: This sets up the four-column layout. The width is slightly less than 25% to account for margins.
    -   `display: inline-block;`: Allows the areas to sit side-by-side.
    -   `margin-right: 0.66%;`: Provides the gutter space between the columns.
    -   The `th` (table header) is set to `position: relative;` so that the "Clear" button can be absolutely positioned within it.
    -   The "Clear" button (`button.clear`) is absolutely positioned to the top right of the table header, making it accessible but out of the main flow.

### 4. `.actions` Bar

-   **Selector**: `#blacklist .actions`
-   **Purpose**: Styles the bar at the bottom of the screen that contains the "Save", "Cancel", "Import", and "Export" buttons.
-   **Key Styles**:
    -   `position: fixed;`: This is the most important style. It fixes the action bar to the bottom of the viewport, ensuring that the main action buttons are always visible, no matter how far the user has scrolled down the page.
    -   `display: flex;` and `justify-content: space-between;`: This creates the layout where the Import/Export buttons are on the left and the Save/Cancel buttons are on the right.

### 5. `#processing` Overlay

-   **Selector**: `#blacklist #processing`
-   **Purpose**: Styles the loading overlay that appears when the user performs a slow action, like importing a very large blacklist.
-   **Key Styles**:
    -   `position: fixed;`: Makes the overlay cover the entire viewport.
    -   `background-color: rgba(0, 0, 0, 0.90);`: A semi-transparent black background to dim the page content.
    -   `display: flex;`, `align-items: center;`, `justify-content: center;`: These are used to perfectly center the "Loading..." text both horizontally and vertically.
    -   The `[hidden]` attribute selector (`#processing[hidden]`) is used to hide the overlay by default. The `blacklist.js` script removes the `hidden` attribute to show it.

### 6. Media Queries (Responsive Design)

-   **`@media (max-width: 1023px)`**: When the screen width is less than 1024px, the four-column layout for the `.area` tables is collapsed. The width is changed to `100%`, causing the four tables to stack vertically, which is much more usable on tablets and smaller screens.
-   **`@media (max-width: 799px)`**: On even smaller screens, this rule targets the buttons in the `.actions` bar, adding a bottom margin to stack them vertically instead of horizontally, preventing them from overflowing the small screen width.

This stylesheet demonstrates a well-structured approach to layout, using a combination of `inline-block` for the column layout and `position: fixed` for the persistent action bar, with thoughtful media queries to ensure a good user experience on a range of devices.
