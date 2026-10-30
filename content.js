/*
 * VIT Course Allocation Scraper
 * Reads every course on the "Course Allocation Details" page and saves one JSON file.
 * Runs only inside your own logged-in browser session. It never touches credentials
 * and makes no network requests of its own.
 */
(() => {
  'use strict';
  if (window.__vitCourseScraperLoaded) return;
  window.__vitCourseScraperLoaded = true;

  /* ===================== SELECTORS: edit here if the portal changes ===================== */
  const SELECTORS = {
    categoryLabel: /curriculum\s*category/i,
    courseLabel: /^\s*course\s*list\s*:?\s*$/i,
    // Only this curriculum category is scraped. Matches "DE - Discipline Elective".
    // To scrape everything again, change it to /./
    targetCategory: /^\s*DE\b|discipline\s*elective/i,
    categoryFallback: /categor/i, // matched against select id + name
    courseFallback: /course/i,
    tableHeaders: ['slot detail', 'venue', 'faculty'],
    columns: { slot: /slot/i, venue: /venue/i, faculty: /faculty/i, type: /type/i },
  };
  /* ====================================================================================== */

  const STORE_KEY = 'vitScraper.v1';
  const SETTINGS_KEY = 'vitScraper.settings';
  const MIN_DELAY = 800;
  const NONE = '(no table)';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  /* ------------------------------ finding elements ------------------------------ */
  function firstSelectAfter(el) {
    for (const s of document.querySelectorAll('select')) {
      if (!el.contains(s) && el.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) return s;
    }
    return null;
  }

  function findSelectByLabel(labelRe, fallbackRe) {
    const candidates = Array.from(
      document.querySelectorAll('label, td, th, div, span, b, strong, p, dt')
    ).filter((el) => {
      const t = clean(el.textContent);
      return t.length > 0 && t.length < 40 && labelRe.test(t);
    });
    const deepest = candidates.filter((el) => !candidates.some((o) => o !== el && el.contains(o)));
    for (const el of deepest) {
      const forId = el.tagName === 'LABEL' && el.getAttribute('for');
      if (forId) {
        const byId = document.getElementById(forId);
        if (byId && byId.tagName === 'SELECT') return byId;
      }
      const sel = firstSelectAfter(el);
      if (sel) return sel;
    }
    const all = Array.from(document.querySelectorAll('select'));
    return all.find((s) => fallbackRe.test((s.id || '') + ' ' + (s.name || ''))) || null;
  }

  const getCategorySel = () => findSelectByLabel(SELECTORS.categoryLabel, SELECTORS.categoryFallback);
  const getCourseSel = () => findSelectByLabel(SELECTORS.courseLabel, SELECTORS.courseFallback);

  function findTable() {
    const tables = Array.from(document.querySelectorAll('table'));
    const hasHeaders = (text) => SELECTORS.tableHeaders.every((h) => text.includes(h));
    const byHead = tables.find((t) => {
      const head = t.querySelector('thead') || t.rows[0];
      return head && hasHeaders(clean(head.textContent).toLowerCase());
    });
    if (byHead) return byHead;
    // fallback: innermost table whose text contains the headers
    const loose = tables.filter((t) => hasHeaders(clean(t.textContent).toLowerCase()));
    return loose.find((t) => !loose.some((o) => o !== t && t.contains(o))) || null;
  }

  /* ------------------------------ reading data ------------------------------ */
  function validOptions(sel) {
    if (!sel) return [];
    return Array.from(sel.options)
      .map((o) => ({ value: o.value, text: clean(o.text) }))
      .filter((o) => o.value !== '' && !/^-{2,}/.test(o.text));
  }

  function splitOption(text) {
    const i = text.indexOf(' - ');
    return i < 0 ? { code: text.trim(), title: '' } : { code: text.slice(0, i).trim(), title: text.slice(i + 3).trim() };
  }

  function readAllocations(table) {
    if (!table) return [];
    const headerRow = table.querySelector('thead tr') || table.rows[0];
    const headerCells = headerRow ? Array.from(headerRow.children).map((c) => clean(c.textContent).toLowerCase()) : [];
    const defaults = { slot: 0, venue: 1, faculty: 2, type: 3 };
    const idx = {};
    for (const [k, re] of Object.entries(SELECTORS.columns)) {
      const i = headerCells.findIndex((h) => re.test(h));
      idx[k] = i >= 0 ? i : defaults[k];
    }
    const rows = table.tBodies.length
      ? Array.from(table.tBodies).flatMap((b) => Array.from(b.rows))
      : Array.from(table.rows).slice(1);
    const out = [];
    for (const tr of rows) {
      if (tr === headerRow) continue;
      const cells = Array.from(tr.cells);
      if (cells.length < 4 || cells.some((c) => c.colSpan > 1)) continue; // "No data" style rows
      const row = {
        slot: clean(cells[idx.slot] && cells[idx.slot].textContent),
        venue: clean(cells[idx.venue] && cells[idx.venue].textContent),
        faculty: clean(cells[idx.faculty] && cells[idx.faculty].textContent),
        type: clean(cells[idx.type] && cells[idx.type].textContent),
      };
      if (row.slot || row.venue || row.faculty || row.type) out.push(row);
    }
    return out;
  }

  function readSemester() {
    const re = /^[A-Za-z]+(?: [A-Za-z]+)? Semester\s+\d{4}-\d{2,4}$/;
    // Preferred: an element whose whole text is the semester name, e.g. "Winter Semester 2026-27"
    const el = Array.from(document.querySelectorAll('b, strong, td, span, div, p, label, dd')).find((e) => {
      const t = clean(e.textContent);
      return t.length < 60 && re.test(t);
    });
    if (el) return clean(el.textContent);
    const text = document.body.innerText || document.body.textContent || '';
    const m = text.match(/([A-Za-z]+(?: [A-Za-z]+)? Semester\s+\d{4}-\d{2,4})/);
    return m ? clean(m[1]) : '';
  }

  /* ------------------------------ waiting helpers ------------------------------ */
  const optionSig = (sel) => (sel ? Array.from(sel.options).map((o) => o.value + '|' + o.text).join('\n') : '');
  const tableSig = () => {
    const t = findTable();
    return t ? clean(t.textContent) : NONE;
  };

  function setSelect(sel, value) {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Waits until the table content changed and stayed unchanged for 500 ms.
  async function waitForTableChange(beforeSig, maxNoChange = 4000, maxTotal = 12000) {
    const start = Date.now();
    let last = tableSig();
    let lastChange = Date.now();
    let changed = last !== beforeSig;
    while (Date.now() - start < maxTotal) {
      await sleep(150);
      const s = tableSig();
      if (s !== last) {
        last = s;
        lastChange = Date.now();
        if (s !== beforeSig) changed = true;
      }
      const quiet = Date.now() - lastChange;
      if (changed && quiet >= 500 && (s !== NONE || quiet >= maxNoChange)) return { ok: true, changed: true };
      if (!changed && Date.now() - start >= maxNoChange) return { ok: true, changed: false };
    }
    return { ok: false, changed };
  }

  // Waits until the Course List options changed and stayed unchanged for 600 ms.
  async function waitForOptionsChange(beforeSig, maxNoChange = 3500, maxTotal = 12000) {
    const start = Date.now();
    let last = optionSig(getCourseSel());
    let lastChange = Date.now();
    let changed = last !== beforeSig;
    while (Date.now() - start < maxTotal) {
      await sleep(200);
      const sel = getCourseSel();
      const s = optionSig(sel);
      if (s !== last) {
        last = s;
        lastChange = Date.now();
        if (s !== beforeSig) changed = true;
      }
      const quiet = Date.now() - lastChange;
      const hasCourses = validOptions(sel).length > 0;
      if (changed && quiet >= 600 && (hasCourses || quiet >= maxNoChange)) return true;
      if (!changed && Date.now() - start >= maxNoChange) return false;
    }
    return changed;
  }

  /* ------------------------------ saved progress ------------------------------ */
  let store = { semester: '', catOrder: [], courses: {} };
  let settings = { delay: 1500 };

  async function loadSaved() {
    try {
      const r = await chrome.storage.local.get([STORE_KEY, SETTINGS_KEY]);
      if (r[STORE_KEY]) store = Object.assign(store, r[STORE_KEY]);
      if (r[SETTINGS_KEY]) settings = Object.assign(settings, r[SETTINGS_KEY]);
    } catch (e) {
      console.warn('[scraper] could not load saved data', e);
    }
  }
  const saveStore = () => chrome.storage.local.set({ [STORE_KEY]: store });
  const saveSettings = () => chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  // Only courses from the target category count (older saved data from other categories is ignored).
  const targetCourses = () => Object.values(store.courses).filter((c) => SELECTORS.targetCategory.test(c.category || ''));
  const savedCount = () => targetCourses().length;

  /* ------------------------------ output files ------------------------------ */
  function buildOutput() {
    const all = targetCourses();
    const courses = all.map((c) => ({
      code: c.code,
      title: c.title,
      category: c.category,
      allocations: c.allocations,
      error: c.error || null,
    }));
    return {
      meta: {
        source: 'vit-course-scraper',
        scrapedAt: new Date().toISOString(),
        semester: store.semester,
        totalCourses: courses.length,
        failedCourses: courses.filter((c) => c.error).length,
        possiblyStaleCourses: all.filter((c) => c.unchanged).map((c) => c.code),
      },
      categories: store.catOrder.filter((c) => SELECTORS.targetCategory.test(c)),
      courses,
    };
  }

  function buildCsv() {
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [['category', 'code', 'title', 'slot', 'venue', 'faculty', 'type'].join(',')];
    for (const c of targetCourses()) {
      for (const a of c.allocations) {
        lines.push([c.category, c.code, c.title, a.slot, a.venue, a.faculty, a.type].map(esc).join(','));
      }
    }
    return '﻿' + lines.join('\r\n');
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const today = () => new Date().toISOString().slice(0, 10);
  const downloadJson = () =>
    download(`vit-course-allocations-${today()}.json`, JSON.stringify(buildOutput(), null, 2), 'application/json');
  const downloadCsv = () =>
    download(`vit-course-allocations-${today()}.csv`, buildCsv(), 'text/csv;charset=utf-8');

  /* ------------------------------ scraping ------------------------------ */
  let state = 'idle'; // idle | running
  let paused = false;
  let stopFlag = false;

  async function gate() {
    while (paused && !stopFlag) await sleep(200);
    return !stopFlag;
  }

  async function interruptibleSleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !stopFlag) await sleep(Math.min(200, end - Date.now()));
  }

  async function scrapeCourse(opt, category) {
    const { code, title } = splitOption(opt.text);
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const sel = getCourseSel();
        if (!sel) throw new Error('Course List select not found');
        const before = tableSig();
        setSelect(sel, opt.value);
        if (sel.value !== opt.value) throw new Error('could not select this course');
        const w = await waitForTableChange(before);
        if (!w.ok) throw new Error('timeout waiting for table');
        return { code, title, category, allocations: readAllocations(findTable()), error: null, unchanged: !w.changed };
      } catch (e) {
        lastErr = e;
        await sleep(1000);
      }
    }
    return { code, title, category, allocations: [], error: String((lastErr && lastErr.message) || lastErr), unchanged: false };
  }

  async function selectCategory(cat) {
    const sel = getCategorySel();
    if (!sel) throw new Error('Curriculum category select not found');
    if (sel.value === cat.value && validOptions(getCourseSel()).length > 0) return;
    const before = optionSig(getCourseSel());
    setSelect(sel, cat.value);
    await waitForOptionsChange(before);
  }

  async function run() {
    const catSel = getCategorySel();
    if (!catSel || !getCourseSel()) throw new Error('Could not find the dropdowns. Click Debug.');
    if (!store.semester) store.semester = readSemester();
    const allCats = validOptions(catSel);
    if (!allCats.length) throw new Error('No categories found');
    const cats = allCats.filter((o) => SELECTORS.targetCategory.test(o.text));
    if (!cats.length) {
      throw new Error('No "DE - Discipline Elective" option found in the Curriculum category dropdown.');
    }

    for (const cat of cats) {
      if (stopFlag) break;
      ui.setStatus(`Opening category: ${cat.text}`);
      await selectCategory(cat);
      const list = validOptions(getCourseSel());
      if (!store.catOrder.includes(cat.text)) store.catOrder.push(cat.text);

      let i = 0;
      for (const opt of list) {
        i++;
        if (!(await gate())) break;
        const { code } = splitOption(opt.text);
        const key = cat.text + '|' + code;
        ui.setProgress(i - 1, list.length);
        if (store.courses[key] && !store.courses[key].error) continue; // already done (resume)
        ui.setStatus(`${cat.text}: ${opt.text}`);
        store.courses[key] = await scrapeCourse(opt, cat.text);
        await saveStore();
        ui.setProgress(i, list.length);
        ui.refreshCounts();
        await interruptibleSleep(Math.max(MIN_DELAY, settings.delay) + Math.floor(Math.random() * 500));
      }
      await saveStore();
    }
  }

  async function start() {
    if (state === 'running') return;
    state = 'running';
    stopFlag = false;
    paused = false;
    ui.syncButtons();
    try {
      await run();
      if (stopFlag) ui.setStatus(`Stopped. ${savedCount()} courses saved.`);
      else {
        ui.setStatus(`Done. ${savedCount()} courses saved.`);
        downloadJson();
      }
    } catch (e) {
      console.error('[scraper]', e);
      ui.setStatus('Error: ' + (e && e.message ? e.message : e));
    }
    state = 'idle';
    paused = false;
    ui.syncButtons();
    ui.refreshCounts();
  }

  // "Clear saved data": stops a running scrape (if any), wipes all saved progress, and returns the panel to its start state.
  let resetting = false;
  async function resetAll() {
    if (resetting) return;
    resetting = true;
    try {
      if (state === 'running') {
        stopFlag = true;
        paused = false;
        ui.setStatus('Stopping, then clearing...');
        while (state === 'running') await sleep(100); // the in-flight course finishes first
      }
      store = { semester: '', catOrder: [], courses: {} };
      try {
        await chrome.storage.local.remove(STORE_KEY);
      } catch (e) {
        await saveStore();
      }
      stopFlag = false;
      paused = false;
      ui.setProgress(0, 0);
      const out = ui.q('vs-out');
      out.hidden = true;
      out.textContent = '';
      ui.setStatus('Cleared. Ready to start from the beginning.');
      ui.refreshCounts();
    } finally {
      resetting = false;
    }
  }

  /* ------------------------------ debug ------------------------------ */
  function debugInfo() {
    const cat = getCategorySel();
    const course = getCourseSel();
    const table = findTable();
    const info = {
      url: location.href,
      semester: readSemester(),
      categorySelect: cat ? { id: cat.id, name: cat.name, options: validOptions(cat).length, value: cat.value } : null,
      courseSelect: course ? { id: course.id, name: course.name, options: validOptions(course).length, value: course.value } : null,
      tableFound: !!table,
      tableRows: table ? readAllocations(table).length : 0,
      firstRow: table ? readAllocations(table)[0] || null : null,
    };
    console.log('[scraper] debug', info);
    return info;
  }

  /* ------------------------------ panel UI ------------------------------ */
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Open Sans", system-ui, "Segoe UI", sans-serif; }
    .card { width: 310px; background: #fff; color: #1f2933; border-radius: 8px; box-shadow: 0 2px 14px rgba(0,0,0,.35); font-size: 13px; overflow: hidden; }
    .head { background: #5e8cb8; color: #fff; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; }
    .head button { background: transparent; color: #fff; border: 0; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px; }
    .body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .body.hidden { display: none; }
    #vs-status { min-height: 34px; word-break: break-word; }
    #vs-count { color: #6b7785; font-size: 12px; }
    .bar { height: 8px; background: #e6ebf0; border-radius: 4px; overflow: hidden; }
    #vs-bar { height: 100%; width: 0; background: #5e8cb8; transition: width .2s; }
    .row { display: flex; gap: 6px; }
    .row button { flex: 1; }
    button { font-size: 12px; padding: 7px 8px; border: 1px solid #5e8cb8; background: #fff; color: #3b6a97; border-radius: 4px; cursor: pointer; }
    button:hover:not(:disabled) { background: #f2f7fc; }
    button:disabled { opacity: .45; cursor: default; }
    button.primary { background: #5e8cb8; color: #fff; }
    button.primary:hover:not(:disabled) { background: #4d7ba6; }
    button.danger { border-color: #d9230f; color: #d9230f; }
    .opt { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .opt input[type=number] { width: 80px; padding: 4px; border: 1px solid #d5dbe0; border-radius: 4px; }
    pre { margin: 0; max-height: 180px; overflow: auto; background: #f6f8fa; padding: 6px; font-size: 11px; white-space: pre-wrap; }
  `;

  const ui = {
    host: null,
    root: null,
    q(id) { return this.root.querySelector('#' + id); },
    setStatus(t) { this.q('vs-status').textContent = t; },
    setProgress(done, total) { this.q('vs-bar').style.width = total ? Math.round((done / total) * 100) + '%' : '0%'; },
    refreshCounts() {
      const all = targetCourses();
      const failed = all.filter((c) => c.error).length;
      this.q('vs-count').textContent = `${all.length} courses saved` + (failed ? ` · ${failed} failed` : '');
      this.syncButtons();
    },
    syncButtons() {
      const running = state === 'running';
      const n = savedCount();
      const start = this.q('vs-start');
      start.disabled = running;
      start.textContent = n > 0 ? `Resume (${n} saved)` : 'Start';
      this.q('vs-pause').disabled = !running;
      this.q('vs-pause').textContent = paused ? 'Continue' : 'Pause';
      this.q('vs-stop').disabled = !running;
      this.q('vs-delay').disabled = running;
    },
    mount() {
      const host = document.createElement('div');
      host.id = 'vit-scraper-host';
      host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;';
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>${CSS}</style>
        <div class="card">
          <div class="head"><strong>VIT Course Scraper</strong><button id="vs-min" title="Minimize">&ndash;</button></div>
          <div class="body" id="vs-body">
            <div id="vs-status">Ready</div>
            <div class="bar"><div id="vs-bar"></div></div>
            <div id="vs-count"></div>
            <div class="row">
              <button id="vs-start" class="primary">Start</button>
              <button id="vs-pause" disabled>Pause</button>
              <button id="vs-stop" disabled>Stop</button>
            </div>
            <label class="opt">Delay between courses (ms)
              <input id="vs-delay" type="number" min="${MIN_DELAY}" step="100" value="${settings.delay}">
            </label>
            <div class="opt" style="color:#6b7785;font-size:12px">Scrapes only: DE - Discipline Elective</div>
            <div class="row"><button id="vs-json">Download JSON</button><button id="vs-csv">Download CSV</button></div>
            <div class="row"><button id="vs-debug">Debug</button><button id="vs-clear" class="danger">Clear saved data</button></div>
            <pre id="vs-out" hidden></pre>
          </div>
        </div>`;
      document.documentElement.appendChild(host);
      this.host = host;
      this.root = root;

      this.q('vs-start').addEventListener('click', start);
      this.q('vs-pause').addEventListener('click', () => {
        paused = !paused;
        this.setStatus(paused ? 'Paused (finishes the current course first)' : 'Resumed');
        this.syncButtons();
      });
      this.q('vs-stop').addEventListener('click', () => {
        stopFlag = true;
        paused = false;
        this.setStatus('Stopping...');
      });
      this.q('vs-json').addEventListener('click', () => (savedCount() ? downloadJson() : this.setStatus('Nothing saved yet.')));
      this.q('vs-csv').addEventListener('click', () => (savedCount() ? downloadCsv() : this.setStatus('Nothing saved yet.')));
      this.q('vs-debug').addEventListener('click', () => {
        const out = this.q('vs-out');
        out.hidden = false;
        out.textContent = JSON.stringify(debugInfo(), null, 2);
      });
      this.q('vs-clear').addEventListener('click', resetAll);
      this.q('vs-delay').addEventListener('change', () => {
        settings.delay = Math.max(MIN_DELAY, Number(this.q('vs-delay').value) || 1500);
        this.q('vs-delay').value = settings.delay;
        saveSettings();
      });
      this.q('vs-min').addEventListener('click', () => this.q('vs-body').classList.toggle('hidden'));
      this.refreshCounts();
    },
    unmount() {
      if (this.host) this.host.remove();
      this.host = null;
      this.root = null;
    },
  };

  /* ------------------------------ boot: wait for the page to contain the form ------------------------------ */
  const isTop = window.top === window;
  const WAIT_MSG = 'Waiting: open "Course Allocation Details" so the dropdowns appear on this page.';
  let missing = 0;
  async function tick() {
    const present = !!getCourseSel() && !!getCategorySel();
    if (!ui.host && (present || isTop)) {
      missing = 0;
      await loadSaved();
      if (!ui.host) {
        ui.mount();
        ui.setStatus(present ? 'Ready' : WAIT_MSG);
      }
    } else if (ui.host) {
      if (present) {
        missing = 0;
        if (ui.q('vs-status').textContent === WAIT_MSG) ui.setStatus('Ready');
      } else if (state !== 'running') {
        if (isTop) {
          if (ui.q('vs-status').textContent === 'Ready') ui.setStatus(WAIT_MSG);
        } else if (++missing >= 5) {
          ui.unmount();
        }
      }
    }
  }
  setInterval(tick, 1000);
  tick();

  // Toolbar icon click: show / hide the panel (mount it if needed).
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'vit-scraper-toggle') return;
      const present = !!getCourseSel() && !!getCategorySel();
      if (!ui.host) {
        if (present || isTop) {
          loadSaved().then(() => {
            if (!ui.host) {
              ui.mount();
              ui.setStatus(present ? 'Ready' : WAIT_MSG);
            }
          });
        }
      } else {
        ui.host.style.display = ui.host.style.display === 'none' ? '' : 'none';
      }
      sendResponse({ ok: true });
    });
  }
})();
