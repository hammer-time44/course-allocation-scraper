# Course Allocation Scraper

A lightweight Manifest V3 Chrome extension designed to scrape course allocation details (Slot, Venue, Faculty, Course Type) for the **DE - Discipline Elective** category and export them as JSON or CSV.

## Features

- **DE Course Scraping**: Iterates through every course under the Discipline Elective (DE) category.
- **Pause & Resume**: Progress is saved locally after every course. Refreshing or reopening the tab allows you to resume without restarting.
- **Client-Side & Private**: Runs strictly within your logged-in session. Does not read or store credentials and makes no external network requests.
- **Export Options**: Download scraped allocations as JSON or CSV at any point.

## Installation

1. Open `chrome://extensions` in Google Chrome.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the extension folder.

## How to Use

1. Log in to the student portal and navigate to the **Course Allocation Details** page.
2. The scraper panel will appear in the bottom-right corner.
3. Click **Start** to begin. The scraper visits courses one by one with a built-in delay to avoid overloading the server.
4. When finished (or at any time), click **Download JSON** or **Download CSV**.

> **Tip**: If interrupted, click **Resume** to continue from where you left off. Failed courses are retried automatically.

## Troubleshooting

- **Debug Panel**: Click **Debug** to verify detected select dropdowns and table elements.
- **Stale Data Flag**: Any course flagged under `possiblyStaleCourses` indicates the table content was identical to the previous course (often due to slow server response) and can be checked manually.


