# Course Allocation Scraper

Chrome extension (Manifest V3). On the "Course Allocation Details" page, it focuses on the **DE - Discipline Elective** category, iterates through every course in its Course List, reads the allocation table (Slot Detail, Venue, Faculty, Course Type), and saves everything into one local JSON file.

**This project is specifically for the "DE - Discipline Elective" category.**

It runs inside your own logged-in session. It never reads or stores credentials or cookies and
makes no network requests of its own. It only reads what is already on the page.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this folder (`vit-course-scraper`)

## Use

1. Log in to the portal yourself and open **Course Allocation Details**
2. A small panel appears at the bottom-right. Click **Start**
3. It goes through one course at a time, with a delay (default 1500 ms plus a little random jitter)
4. When finished it downloads `vit-course-allocations-YYYY-MM-DD.json`. You can also use
   **Download JSON / CSV** at any time

Progress is saved after every course. If you refresh the page, close the tab or stop it, click
**Resume** and it skips the courses already saved. Courses that failed are retried on resume.

Please keep the delay at 1000 ms or more. It is a lot of page loads on a shared university server.


`possiblyStaleCourses` lists courses whose table looked identical to the previous course's table
(the page may have been slow to update). Check those few by hand.

## If it can't find the dropdowns or the table

Click **Debug** in the panel. It shows what was found (select ids, option counts, table found).
All the page-specific logic is in the `SELECTORS` block at the top of `content.js`.

