    const contentEl = document.getElementById('content');
    const welcomeEl = document.getElementById('welcome');
    const tabsScroll = document.getElementById('tabs-scroll');
    const newTabBtn = document.getElementById('new-tab-btn');
    const themeBtn = document.getElementById('theme-btn');

    /* ---- Safe localStorage helper ---- */
    function safeSave(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* quota exceeded or unavailable */ }
    }

    /* ---- Throttle utility ---- */
    function throttle(fn, ms) {
      let last = 0, timer = null;
      return function (...args) {
        const now = Date.now();
        if (now - last >= ms) { last = now; fn.apply(this, args); }
        else if (!timer) { timer = setTimeout(() => { last = Date.now(); timer = null; fn.apply(this, args); }, ms - (now - last)); }
      };
    }

    /* ---- HTML Cache ---- */
    const htmlCache = new Map();

    const MOON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    const SUN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

    /* ---- Theme ---- */
    const savedTheme = localStorage.getItem('folio-theme');
    let isDark = savedTheme !== null ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    function applyTheme() {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
      themeBtn.innerHTML = isDark ? SUN : MOON;
      themeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      api.setTitlebarTheme(isDark);
      safeSave('folio-theme', isDark ? 'dark' : 'light');
    }
    themeBtn.addEventListener('click', () => { isDark = !isDark; applyTheme(); });

    /* ---- Helpers ---- */
    function injectCopyButtons() {
      contentEl.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.copy-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.addEventListener('click', async () => {
          const code = pre.querySelector('code')?.textContent || pre.textContent;
          await navigator.clipboard.writeText(code);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
        });
        pre.appendChild(btn);
      });
    }

    function showContent(html, scrollY = 0, animate = false) {
      contentEl.style.opacity = '0';
      contentEl.innerHTML = html;
      contentEl.querySelectorAll('table').forEach(t => {
        if (!t.parentElement.classList.contains('table-wrap')) {
          const wrap = document.createElement('div');
          wrap.className = 'table-wrap';
          t.parentNode.insertBefore(wrap, t);
          wrap.appendChild(t);
        }
      });
      contentEl.style.display = 'block';
      welcomeEl.style.display = 'none';
      welcomeEl.setAttribute('aria-hidden', 'true');
      contentEl.removeAttribute('aria-hidden');
      window.scrollTo(0, scrollY);
      if (animate) {
        contentEl.classList.remove('fade-in');
        void contentEl.offsetWidth;
        contentEl.classList.add('fade-in');
      }
      injectCopyButtons();
      buildOutline();
      const activeTab = S.tabs.find(t => t.id === S.activeId);
      updateStatusBar(activeTab);
      requestAnimationFrame(() => { contentEl.style.opacity = '1'; });
    }

    /* ---- Status Bar & Progress ---- */
    const statusBar = document.getElementById('status-bar');
    const statsText = document.getElementById('stats-text');
    const progressBar = document.getElementById('progress-bar');
    let zoomLevel = parseInt(localStorage.getItem('folio-zoom') || '100');

    function updateStatusBar(tab) {
      if (tab && tab.path) {
        statsText.textContent = `${tab.wordCount || 0} words \u00B7 ${tab.readingTime || 0} min read`;
        statusBar.classList.add('visible');
      } else {
        statusBar.classList.remove('visible');
      }
    }

    function updateProgressBar() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = docHeight > 0 ? (scrollTop / docHeight * 100) + '%' : '0';
    }

    function applyZoom() {
      contentEl.style.zoom = zoomLevel + '%';
      document.getElementById('zoom-level').textContent = zoomLevel + '%';
      safeSave('folio-zoom', zoomLevel);
    }

    document.getElementById('zoom-in')?.addEventListener('click', () => { zoomLevel = Math.min(200, zoomLevel + 10); applyZoom(); });
    document.getElementById('zoom-out')?.addEventListener('click', () => { zoomLevel = Math.max(50, zoomLevel - 10); applyZoom(); });

    /* ---- Outline Panel ---- */
    const outlinePanel = document.getElementById('outline-panel');
    const outlineList = document.getElementById('outline-list');
    const outlineBtn = document.getElementById('outline-btn');

    function toggleOutline() { outlinePanel.classList.toggle('visible'); checkPanelOverflow(); }
    outlineBtn?.addEventListener('click', toggleOutline);
    document.getElementById('outline-close')?.addEventListener('click', () => { outlinePanel.classList.remove('visible'); });

    function checkPanelOverflow() {
      if (sidebar.classList.contains('visible') && outlinePanel.classList.contains('visible') && window.innerWidth < 780) {
        outlinePanel.classList.remove('visible');
      }
    }

    function buildOutline() {
      outlineList.innerHTML = '';
      const headings = contentEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
      headings.forEach((h, i) => {
        if (!h.id) h.id = 'heading-' + i;
        const a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        a.dataset.level = h.tagName[1];
        a.addEventListener('click', e => { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth' }); });
        outlineList.appendChild(a);
      });
    }

    function updateOutlineHighlight() {
      const headings = contentEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
      let current = null;
      headings.forEach(h => { if (h.getBoundingClientRect().top <= 100) current = h; });
      outlineList.querySelectorAll('a').forEach(a => {
        a.classList.toggle('active', current && a.getAttribute('href') === '#' + current.id);
      });
    }

    /* ---- Tab State ---- */
    const S = { tabs: [], activeId: null, closed: [], nextId: 1 };

    /* ---- Session Persistence ---- */
    function saveSession() {
      const session = S.tabs
        .filter(t => t.path)
        .map(t => ({ path: t.path, scrollY: t.scrollY }));
      const activeTab = S.tabs.find(t => t.id === S.activeId);
      safeSave('folio-session', JSON.stringify({
        tabs: session,
        activePath: activeTab?.path || null
      }));
    }

    let _saveScrollTimer = null;
    function saveSessionDebounced() {
      clearTimeout(_saveScrollTimer);
      _saveScrollTimer = setTimeout(saveSession, 500);
    }

    function restoreSession() {
      const raw = localStorage.getItem('folio-session');
      if (!raw) return false;
      try {
        const session = JSON.parse(raw);
        if (!session.tabs || !session.tabs.length) return false;
        session.tabs.forEach(t => {
          const tab = { id: S.nextId++, path: null, name: 'Loading...', html: null, scrollY: t.scrollY || 0 };
          S.tabs.push(tab);
          loadInTab(tab.id, t.path);
        });
        const activeIndex = session.activePath
          ? session.tabs.findIndex(s => s.path === session.activePath)
          : 0;
        const targetTab = S.tabs[activeIndex >= 0 ? activeIndex : 0];
        if (targetTab) switchTab(targetTab.id);
        renderTabs();
        return true;
      } catch { return false; }
    }

    function createTab(filePath) {
      const tab = { id: S.nextId++, path: null, name: 'New Tab', html: null, scrollY: 0 };
      S.tabs.push(tab);
      switchTab(tab.id);
      if (filePath) loadInTab(tab.id, filePath);
      return tab;
    }

    function closeTab(id) {
      const idx = S.tabs.findIndex(t => t.id === id);
      if (idx < 0) return;
      const tab = S.tabs[idx];
      if (tab.path) { S.closed.push(tab.path); if (S.closed.length > 20) S.closed.shift(); api.unwatchFile(tab.path); htmlCache.delete(tab.path); }
      const tabEl = tabsScroll.querySelectorAll('.tab')[idx];
      if (tabEl) tabEl.classList.add('tab-closing');
      const finish = () => {
        S.tabs.splice(idx, 1);
        if (!S.tabs.length) { createTab(); return; }
        if (S.activeId === id) {
          switchTab(S.tabs[Math.min(idx, S.tabs.length - 1)].id);
        }
        renderTabs();
        saveSession();
      };
      if (tabEl) { setTimeout(finish, 150); } else { finish(); }
    }

    function switchTab(id) {
      const cur = S.tabs.find(t => t.id === S.activeId);
      if (cur) cur.scrollY = window.scrollY;
      S.activeId = id;
      const tab = S.tabs.find(t => t.id === id);
      if (tab.html) {
        showContent(tab.html, tab.scrollY);
      } else {
        contentEl.style.display = 'none';
        contentEl.setAttribute('aria-hidden', 'true');
        welcomeEl.style.display = '';
        welcomeEl.removeAttribute('aria-hidden');
      }
      document.title = (tab.name || 'New Tab') + ' \u2014 Folio';
      renderTabs();
      highlightActiveFile();
      saveSession();
    }

    function reopenClosed() {
      if (!S.closed.length) return;
      openFile(S.closed.pop());
    }

    async function loadInTab(tabId, filePath) {
      const tab = S.tabs.find(t => t.id === tabId);
      if (!tab) return;
      tab.path = filePath;
      tab.name = filePath.split(/[\\/]/).pop();

      // Check HTML cache first
      const cached = htmlCache.get(filePath);
      if (cached) {
        tab.path = filePath;
        tab.name = cached.name;
        tab.html = cached.html;
        tab.wordCount = cached.wordCount;
        tab.readingTime = cached.readingTime;
        addRecentFile(filePath);
        if (S.activeId === tabId) {
          showContent(tab.html, tab.scrollY || 0, true);
          document.title = tab.name + ' \u2014 Folio';
        }
        renderTabs();
        saveSession();
        return;
      }

      if (S.activeId === tabId) {
        showContent('<div class="loading-dots">Opening</div>', 0);
      }
      const r = await api.readAndRender(filePath);
      const tabAfter = S.tabs.find(t => t.id === tabId);
      if (!tabAfter) return;
      if (r.error) {
        const escaped = r.error.replace(/&/g,'&amp;').replace(/</g,'&lt;');
        tabAfter.html = `<div style="text-align:center;padding:3rem;color:var(--text-muted)"><p>${escaped}</p><button onclick="openDialog()" style="margin-top:1rem;padding:0.4rem 1rem;border:1px solid var(--border);background:transparent;color:var(--accent);border-radius:4px;cursor:pointer;font-family:inherit">Open different file</button></div>`;
        tabAfter.name = 'Error';
      } else {
        tabAfter.path = r.path;
        tabAfter.name = r.name;
        tabAfter.html = r.html;
        tabAfter.wordCount = r.wordCount;
        tabAfter.readingTime = r.readingTime;
        // Store in cache
        htmlCache.set(r.path, { html: r.html, name: r.name, wordCount: r.wordCount, readingTime: r.readingTime });
        addRecentFile(r.path);
      }
      if (S.activeId === tabId) {
        showContent(tabAfter.html, tabAfter.scrollY || 0, true);
        document.title = tabAfter.name + ' \u2014 Folio';
      }
      renderTabs();
      saveSession();
    }

    function openFile(filePath) {
      const existing = S.tabs.find(t => t.path === filePath);
      if (existing) { switchTab(existing.id); return; }
      const cur = S.tabs.find(t => t.id === S.activeId);
      if (cur && !cur.path && !cur.html) {
        loadInTab(cur.id, filePath);
      } else {
        createTab(filePath);
      }
    }

    async function openDialog() {
      const p = await api.openFileDialog();
      if (p) openFile(p);
    }

    function renderTabs() {
      tabsScroll.innerHTML = '';
      tabsScroll.setAttribute('role', 'tablist');
      S.tabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = 'tab' + (tab.id === S.activeId ? ' active' : '');
        el.setAttribute('role', 'tab');
        el.tabIndex = 0;
        el.setAttribute('aria-selected', tab.id === S.activeId ? 'true' : 'false');

        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = tab.name;
        if (tab.path) name.title = tab.path;

        const close = document.createElement('button');
        close.className = 'tab-close';
        close.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.5" fill="none"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>';
        close.title = 'Close (Ctrl+W)';
        close.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });

        el.appendChild(name);
        el.appendChild(close);
        el.addEventListener('click', () => { if (S.activeId !== tab.id) switchTab(tab.id); });
        el.addEventListener('mousedown', e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } });
        el.addEventListener('dblclick', e => e.stopPropagation()); // prevent accidental double-click actions
        tabsScroll.appendChild(el);
      });
      const active = tabsScroll.querySelector('.tab.active');
      if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    /* ---- Open File Button ---- */
    newTabBtn.addEventListener('click', openDialog);
    document.getElementById('welcome-open-btn')?.addEventListener('click', openDialog);

    /* ---- Keyboard Shortcuts ---- */
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'o')) {
        e.preventDefault(); openDialog();
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault(); reopenClosed();
      } else if (e.ctrlKey && e.key === 'w') {
        e.preventDefault(); closeTab(S.activeId);
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const idx = S.tabs.findIndex(t => t.id === S.activeId);
        const dir = e.shiftKey ? -1 : 1;
        const next = (idx + dir + S.tabs.length) % S.tabs.length;
        switchTab(S.tabs[next].id);
      } else if (e.ctrlKey && e.key === 'p') {
        e.preventDefault(); api.exportPDF();
      } else if (e.ctrlKey && e.key === 'b') {
        e.preventDefault(); toggleSidebar();
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault(); toggleCrossFileSearch();
      } else if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
        e.preventDefault(); showSearch();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement?.getAttribute('role') === 'tab') {
        e.preventDefault();
        const tabs = Array.from(tabsScroll.querySelectorAll('.tab'));
        const curIdx = tabs.indexOf(document.activeElement);
        const nextIdx = e.key === 'ArrowRight' ? (curIdx + 1) % tabs.length : (curIdx - 1 + tabs.length) % tabs.length;
        tabs[nextIdx].focus();
      }
    });

    /* ---- Drag & Drop ---- */
    let dragN = 0;
    document.addEventListener('dragenter', e => { e.preventDefault(); dragN++; document.body.classList.add('drag-over'); });
    document.addEventListener('dragleave', e => { e.preventDefault(); dragN--; if (dragN <= 0) { dragN = 0; document.body.classList.remove('drag-over'); } });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      e.preventDefault(); dragN = 0; document.body.classList.remove('drag-over');
      const mdExts = /\.(md|markdown|mdown|mkd|mdx)$/i;
      Array.from(e.dataTransfer.files).filter(f => mdExts.test(f.name)).forEach(f => { if (f.path) openFile(f.path); });
    });

    /* ---- Scroll Shadow & Progress ---- */
    const throttledOutlineHighlight = throttle(updateOutlineHighlight, 100);
    window.addEventListener('scroll', () => {
      document.getElementById('tab-bar').classList.toggle('scrolled', window.scrollY > 8);
      updateProgressBar();
      throttledOutlineHighlight();
      const cur = S.tabs.find(t => t.id === S.activeId);
      if (cur) { cur.scrollY = window.scrollY; saveSessionDebounced(); }
    }, { passive: true });

    let _resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(checkPanelOverflow, 150);
    });

    /* ---- External Links & Anchor Links ---- */
    contentEl.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href && href.startsWith('#')) {
        const target = document.getElementById(href.slice(1));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      } else if (a.href && (a.href.startsWith('http://') || a.href.startsWith('https://'))) {
        api.openExternal(a.href);
      }
    });

    /* ---- IPC Events ---- */
    api.onOpenFile(p => openFile(p));
    api.onFileChanged(async filePath => {
      htmlCache.delete(filePath);
      const r = await api.readAndRender(filePath);
      if (r.error) return;
      htmlCache.set(filePath, { html: r.html, name: r.name, wordCount: r.wordCount, readingTime: r.readingTime });
      S.tabs.forEach(tab => {
        if (tab.path === filePath) {
          tab.html = r.html;
          if (r.wordCount !== undefined) { tab.wordCount = r.wordCount; tab.readingTime = r.readingTime; }
          if (tab.id === S.activeId) {
            showContent(r.html, window.scrollY);
          }
        }
      });
    });

    /* ---- Search ---- */
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const searchCount = document.getElementById('search-count');
    let searchDebounce = null;

    function showSearch() { searchBar.classList.add('visible'); searchInput.focus(); searchInput.select(); }
    function hideSearch() { searchBar.classList.remove('visible'); searchInput.value = ''; searchCount.textContent = ''; api.stopFindInPage(); }

    document.getElementById('search-close').addEventListener('click', hideSearch);
    document.getElementById('search-next').addEventListener('click', () => { if (searchInput.value) api.findInPage(searchInput.value, { forward: true, findNext: true }); });
    document.getElementById('search-prev').addEventListener('click', () => { if (searchInput.value) api.findInPage(searchInput.value, { forward: false, findNext: true }); });

    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        if (searchInput.value) api.findInPage(searchInput.value, { forward: true });
        else { searchCount.textContent = ''; api.stopFindInPage(); }
      }, 150);
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); api.findInPage(searchInput.value, { forward: !e.shiftKey, findNext: true }); }
      if (e.key === 'Escape') hideSearch();
    });

    api.onFoundInPage(result => {
      searchCount.textContent = `${result.activeMatchOrdinal} of ${result.matches}`;
    });

    /* ---- Cross-File Search ---- */
    const cfsPanel = document.getElementById('cross-file-search');
    const cfsInput = document.getElementById('cfs-input');
    const cfsStatus = document.getElementById('cfs-status');
    const cfsResults = document.getElementById('cfs-results');
    let cfsDebounce = null;

    function toggleCrossFileSearch() {
      if (cfsPanel.classList.contains('visible')) {
        hideCrossFileSearch();
      } else {
        showCrossFileSearch();
      }
    }

    function showCrossFileSearch() {
      // Close sidebar if open to avoid overlap
      if (sidebar.classList.contains('visible')) {
        sidebar.classList.remove('visible');
        document.body.classList.remove('sidebar-open');
      }
      cfsPanel.classList.add('visible');
      document.body.classList.add('cross-search-open');
      cfsInput.focus();
      cfsInput.select();
      if (!currentFolder) {
        cfsStatus.textContent = '';
        cfsResults.innerHTML = '<div class="cfs-empty">Open a folder first to search across files</div>';
      }
    }

    function hideCrossFileSearch() {
      cfsPanel.classList.remove('visible');
      document.body.classList.remove('cross-search-open');
      cfsInput.value = '';
      cfsStatus.textContent = '';
      cfsResults.innerHTML = '';
    }

    document.getElementById('cfs-close').addEventListener('click', hideCrossFileSearch);

    cfsInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { hideCrossFileSearch(); e.stopPropagation(); }
    });

    cfsInput.addEventListener('input', () => {
      clearTimeout(cfsDebounce);
      cfsDebounce = setTimeout(() => performCrossFileSearch(), 200);
    });

    async function performCrossFileSearch() {
      const query = cfsInput.value.trim();
      if (!query) {
        cfsStatus.textContent = '';
        cfsResults.innerHTML = '';
        return;
      }
      if (!currentFolder) {
        cfsStatus.textContent = '';
        cfsResults.innerHTML = '<div class="cfs-empty">Open a folder first to search across files</div>';
        return;
      }
      cfsStatus.textContent = 'Searching...';
      const results = await api.searchInFolder(currentFolder, query);
      let totalMatches = 0;
      results.forEach(r => { totalMatches += r.matches.length; });
      if (totalMatches === 0) {
        cfsStatus.textContent = 'No results';
        cfsResults.innerHTML = '<div class="cfs-empty">No matches found</div>';
        return;
      }
      cfsStatus.textContent = `${totalMatches} match${totalMatches !== 1 ? 'es' : ''} in ${results.length} file${results.length !== 1 ? 's' : ''}`;
      cfsResults.innerHTML = '';
      const lowerQuery = query.toLowerCase();
      for (const group of results) {
        const groupEl = document.createElement('div');
        groupEl.className = 'cfs-file-group';
        const header = document.createElement('div');
        header.className = 'cfs-file-header';
        header.innerHTML = `<span>${escapeHtml(group.name)}</span><span class="cfs-match-count">${group.matches.length}</span>`;
        groupEl.appendChild(header);
        for (const match of group.matches) {
          const matchEl = document.createElement('div');
          matchEl.className = 'cfs-match';
          matchEl.innerHTML = `<span class="cfs-line-num">${match.line}</span>${highlightMatch(match.text, lowerQuery)}`;
          matchEl.addEventListener('click', () => openFile(group.file));
          groupEl.appendChild(matchEl);
        }
        cfsResults.appendChild(groupEl);
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function highlightMatch(text, lowerQuery) {
      const escaped = escapeHtml(text);
      const lowerEscaped = escaped.toLowerCase();
      const idx = lowerEscaped.indexOf(lowerQuery);
      if (idx === -1) return escaped;
      const before = escaped.substring(0, idx);
      const matched = escaped.substring(idx, idx + lowerQuery.length);
      const after = escaped.substring(idx + lowerQuery.length);
      return `${before}<span class="cfs-highlight">${matched}</span>${after}`;
    }

    api.onOpenFolder(async (folderPath) => {
      if (currentFolder) api.unwatchFolder(currentFolder);
      expandedFolders.clear();
      currentFolder = folderPath;
      safeSave('folio-folder', folderPath);
      await loadFolderTree(folderPath);
      api.watchFolder(folderPath);
      if (!sidebar.classList.contains('visible')) toggleSidebar();
    });

    api.onFileDeleted(filePath => {
      S.tabs.forEach(tab => {
        if (tab.path === filePath) {
          tab.html = '<p style="color:var(--text-muted)">This file was deleted or moved.</p>';
          tab.name = tab.name + ' (deleted)';
          tab.wordCount = 0;
          tab.readingTime = 0;
          if (tab.id === S.activeId) {
            showContent(tab.html, 0);
          }
        }
      });
      renderTabs();
    });

    /* ---- Sidebar / Folder Tree ---- */
    const sidebar = document.getElementById('sidebar');
    const sidebarBtn = document.getElementById('sidebar-btn');
    const fileTree = document.getElementById('file-tree');
    const sidebarTitle = document.getElementById('sidebar-title');
    let currentFolder = localStorage.getItem('folio-folder') || null;
    const expandedFolders = new Set(); // tracks expanded folder paths for state preservation

    const CHEVRON_SVG = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2l4 3-4 3"/></svg>`;
    const FILE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    const FOLDER_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

    /* ---- AI Config File Detection ---- */
    const AI_CONFIG_NAMES = new Set([
      'CLAUDE.md', '.cursorrules', '.clinerules', '.windsurfrules', 'AGENTS.md',
      'copilot-instructions.md',
    ]);
    function isAIFile(name) { return AI_CONFIG_NAMES.has(name); }

    function toggleSidebar() {
      sidebar.classList.toggle('visible');
      document.body.classList.toggle('sidebar-open', sidebar.classList.contains('visible'));
      safeSave('folio-sidebar', sidebar.classList.contains('visible') ? 'open' : 'closed');
      checkPanelOverflow();
    }

    sidebarBtn?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-close')?.addEventListener('click', () => {
      sidebar.classList.remove('visible');
      document.body.classList.remove('sidebar-open');
      safeSave('folio-sidebar', 'closed');
    });

    async function openFolderForSidebar() {
      const folder = await api.openFolderDialog();
      if (folder) {
        // Stop watching old folder
        if (currentFolder) api.unwatchFolder(currentFolder);
        expandedFolders.clear();
        currentFolder = folder;
        safeSave('folio-folder', folder);
        await loadFolderTree(folder);
        api.watchFolder(folder);
        if (!sidebar.classList.contains('visible')) toggleSidebar();
      }
    }

    document.getElementById('sidebar-open-folder')?.addEventListener('click', openFolderForSidebar);
    document.getElementById('sidebar-empty-open')?.addEventListener('click', openFolderForSidebar);

    async function loadFolderTree(folderPath) {
      const tree = await api.scanFolder(folderPath);
      if (tree.error) {
        const escaped = tree.error.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        fileTree.innerHTML = `<div class="sidebar-empty"><p>${escaped}</p></div>`;
        return;
      }
      if (!tree.length) {
        fileTree.innerHTML = '<div class="sidebar-empty"><p>No markdown files found</p></div>';
        return;
      }
      sidebarTitle.textContent = folderPath.split(/[\\/]/).pop();
      sidebarTitle.title = folderPath;
      fileTree.innerHTML = '';
      renderTree(tree, fileTree, 0);
      highlightActiveFile();
    }

    function renderTree(nodes, parent, depth) {
      // Sort: folders first (unchanged), then files with AI files before regular files
      const sorted = [...nodes].sort((a, b) => {
        // Folders always before files
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        // Among files: AI files first
        if (a.type === 'file' && b.type === 'file') {
          const aAI = isAIFile(a.name);
          const bAI = isAIFile(b.name);
          if (aAI && !bAI) return -1;
          if (!aAI && bAI) return 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const node of sorted) {
        if (node.type === 'folder') {
          const container = document.createElement('div');

          const item = document.createElement('div');
          item.className = 'tree-item';
          item.style.paddingLeft = (12 + depth * 16) + 'px';
          item.dataset.folderPath = node.path;

          const toggle = document.createElement('span');
          toggle.className = 'tree-folder-toggle';
          toggle.innerHTML = CHEVRON_SVG;

          const icon = document.createElement('span');
          icon.className = 'tree-icon';
          icon.innerHTML = FOLDER_SVG;

          const name = document.createElement('span');
          name.className = 'tree-name';
          name.textContent = node.name;

          item.appendChild(toggle);
          item.appendChild(icon);
          item.appendChild(name);

          const children = document.createElement('div');
          children.className = 'tree-children';
          renderTree(node.children, children, depth + 1);

          // Restore expanded state, or auto-expand dot-prefixed folders
          const shouldExpand = expandedFolders.has(node.path) || node.name.startsWith('.');
          if (shouldExpand) {
            toggle.classList.add('open');
            children.classList.add('open');
            expandedFolders.add(node.path);
          }

          item.addEventListener('click', () => {
            const isOpen = toggle.classList.toggle('open');
            children.classList.toggle('open');
            if (isOpen) {
              expandedFolders.add(node.path);
            } else {
              expandedFolders.delete(node.path);
            }
          });

          container.appendChild(item);
          container.appendChild(children);
          parent.appendChild(container);
        } else {
          const item = document.createElement('div');
          item.className = 'tree-item';
          item.style.paddingLeft = (12 + depth * 16 + 18) + 'px';
          item.dataset.path = node.path;

          const icon = document.createElement('span');
          icon.className = 'tree-icon';
          icon.innerHTML = FILE_SVG;

          const name = document.createElement('span');
          name.className = 'tree-name';
          name.textContent = node.name;

          item.appendChild(icon);
          item.appendChild(name);

          if (isAIFile(node.name)) {
            const badge = document.createElement('span');
            badge.className = 'ai-badge';
            badge.textContent = 'AI';
            item.appendChild(badge);
          }

          item.title = node.path;

          item.addEventListener('click', () => openFile(node.path));
          parent.appendChild(item);
        }
      }
    }

    function highlightActiveFile() {
      const activeTab = S.tabs.find(t => t.id === S.activeId);
      fileTree.querySelectorAll('.tree-item').forEach(el => {
        el.classList.toggle('active', el.dataset.path && activeTab && el.dataset.path === activeTab.path);
      });
    }

    // Handle folder-changed events from directory watcher
    api.onFolderChanged(async (folderPath) => {
      if (folderPath === currentFolder) {
        await loadFolderTree(folderPath);
      }
    });

    // Restore sidebar state on load
    if (localStorage.getItem('folio-sidebar') === 'open') {
      sidebar.classList.add('visible');
      document.body.classList.add('sidebar-open');
    }
    if (currentFolder) {
      loadFolderTree(currentFolder);
      api.watchFolder(currentFolder);
    }

    /* ---- Recent Files ---- */
    function getRecentFiles() { try { return JSON.parse(localStorage.getItem('folio-recent') || '[]'); } catch { return []; } }
    function addRecentFile(filePath) {
      let recent = getRecentFiles().filter(f => f !== filePath);
      recent.unshift(filePath);
      if (recent.length > 10) recent = recent.slice(0, 10);
      safeSave('folio-recent', JSON.stringify(recent));
      renderWelcome();
    }
    function renderWelcome() {
      const recent = getRecentFiles();
      const list = document.getElementById('recent-list');
      if (!list) return;
      if (!recent.length) { list.style.display = 'none'; return; }
      list.style.display = 'block';
      list.innerHTML = '<p class="recent-header">Recent</p>' + recent.map(f => {
        const name = f.split(/[\\/]/).pop();
        const dir = f.split(/[\\/]/).slice(-2, -1)[0] || '';
        return `<a class="recent-item" data-path="${f.replace(/"/g, '&quot;')}" title="${f.replace(/"/g, '&quot;')}">${name}<span class="recent-dir">${dir}</span></a>`;
      }).join('') + '<a class="recent-clear">Clear recent</a>';
      list.querySelectorAll('.recent-item').forEach(a => a.addEventListener('click', () => openFile(a.dataset.path)));
      list.querySelector('.recent-clear')?.addEventListener('click', () => { localStorage.removeItem('folio-recent'); renderWelcome(); });
    }

    /* ---- Init ---- */
    contentEl.setAttribute('aria-hidden', 'true');
    applyTheme();
    if (zoomLevel !== 100) applyZoom();
    renderWelcome();
    if (!restoreSession()) createTab(); // restore previous session, or start with empty tab
