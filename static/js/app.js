/**
 * BigQuery Release Notes Explorer - Client Application
 */

(function () {
  'use strict';

  // Application State
  const state = {
    items: [],
    categories: [],
    categoryCounts: {},
    selectedIds: new Set(),
    activeCategory: 'ALL',
    searchQuery: '',
    isLoading: false,
    lastFetchedEpoch: null,
    currentModalItemIds: []
  };

  // DOM Elements
  const elements = {
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    sunIcon: document.querySelector('.sun-icon'),
    moonIcon: document.querySelector('.moon-icon'),
    themeToggleText: document.getElementById('theme-toggle-text'),
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.querySelector('.refresh-icon'),
    refreshSpinner: document.getElementById('refresh-spinner'),
    lastUpdatedText: document.getElementById('last-updated-text'),
    statusDot: document.querySelector('.status-dot'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    categoriesContainer: document.getElementById('categories-container'),
    countAll: document.getElementById('count-all'),
    selectionBar: document.getElementById('selection-bar'),
    selectedCount: document.getElementById('selected-count'),
    tweetSelectedBtn: document.getElementById('tweet-selected-btn'),
    exportSelectedCsvBtn: document.getElementById('export-selected-csv-btn'),
    clearSelectionBtn: document.getElementById('clear-selection-btn'),
    alertBanner: document.getElementById('alert-banner'),
    feedLoading: document.getElementById('feed-loading'),
    cardsGrid: document.getElementById('cards-grid'),
    emptyState: document.getElementById('empty-state'),
    resetFilterBtn: document.getElementById('reset-filter-btn'),
    tweetModal: document.getElementById('tweet-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCount: document.getElementById('char-count'),
    charWarning: document.getElementById('char-warning'),
    tweetSourceLink: document.getElementById('tweet-source-link'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    copyBtnText: document.getElementById('copy-btn-text'),
    postXBtn: document.getElementById('post-x-btn'),
    toast: document.getElementById('toast')
  };

  /**
   * Initializes the application
   */
  function init() {
    initTheme();
    bindEvents();
    loadReleases(false);
  }

  /**
   * Theme Manager: Toggles Dark / Light mode by overriding root CSS variables
   */
  function initTheme() {
    const savedTheme = localStorage.getItem('theme-preference');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    applyTheme(initialTheme, false);

    if (elements.themeToggleBtn) {
      elements.themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 
                             (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme, true);
        showToast(nextTheme === 'dark' ? '다크 모드로 전환되었습니다.' : '라이트 모드로 전환되었습니다.');
      });
    }

    // Listen to OS theme changes if user hasn't set explicit preference
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme-preference')) {
        applyTheme(e.matches ? 'dark' : 'light', false);
      }
    });
  }

  function applyTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.content = theme;
    }
    if (save) {
      localStorage.setItem('theme-preference', theme);
    }
    updateThemeToggleUI(theme);
  }

  function updateThemeToggleUI(theme) {
    const isDark = theme === 'dark';
    if (elements.sunIcon && elements.moonIcon && elements.themeToggleText) {
      elements.sunIcon.classList.toggle('hidden', !isDark);
      elements.moonIcon.classList.toggle('hidden', isDark);
      elements.themeToggleText.textContent = isDark ? '라이트 모드' : '다크 모드';
      elements.themeToggleBtn.setAttribute('title', isDark ? '라이트 모드로 전환' : '다크 모드로 전환');
    }
  }

  /**
   * Event Listeners setup
   */
  function bindEvents() {
    // Refresh button
    elements.refreshBtn.addEventListener('click', () => {
      if (!state.isLoading) {
        loadReleases(true);
      }
    });

    // Search input
    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      elements.clearSearchBtn.classList.toggle('hidden', state.searchQuery.length === 0);
      renderFeed();
    });

    elements.clearSearchBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.clearSearchBtn.classList.add('hidden');
      elements.searchInput.focus();
      renderFeed();
    });

    // Category filter click (event delegation)
    elements.categoriesContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      const category = chip.getAttribute('data-category');
      if (category && category !== state.activeCategory) {
        state.activeCategory = category;
        updateActiveCategoryChip();
        renderFeed();
      }
    });

    // Reset filters
    elements.resetFilterBtn.addEventListener('click', () => {
      state.activeCategory = 'ALL';
      state.searchQuery = '';
      elements.searchInput.value = '';
      elements.clearSearchBtn.classList.add('hidden');
      updateActiveCategoryChip();
      renderFeed();
    });

    // Cards Grid interaction: Checkbox, Tweet, Copy, and CSV buttons
    elements.cardsGrid.addEventListener('click', (e) => {
      // 1. Copy to clipboard on card
      const copyBtn = e.target.closest('.btn-card-copy');
      if (copyBtn) {
        e.stopPropagation();
        const itemId = copyBtn.getAttribute('data-id');
        const item = state.items.find(it => it.id === itemId);
        if (item) copyCardToClipboard(item, copyBtn);
        return;
      }

      // 2. Export single card to CSV
      const csvBtn = e.target.closest('.btn-card-csv');
      if (csvBtn) {
        e.stopPropagation();
        const itemId = csvBtn.getAttribute('data-id');
        const item = state.items.find(it => it.id === itemId);
        if (item) exportItemsToCsv([item], `bigquery-${item.id}.csv`);
        return;
      }

      // 3. Tweet button clicked on a card
      const tweetBtn = e.target.closest('.btn-card-tweet');
      if (tweetBtn) {
        e.stopPropagation();
        const itemId = tweetBtn.getAttribute('data-id');
        openTweetModalForItems([itemId]);
        return;
      }

      // 4. Checkbox toggled
      const checkbox = e.target.closest('.item-checkbox');
      if (checkbox) {
        const itemId = checkbox.getAttribute('data-id');
        toggleSelection(itemId, checkbox.checked);
        return;
      }

      // 5. Clicking card background toggles selection
      const card = e.target.closest('.release-card');
      if (card && !e.target.closest('a') && !e.target.closest('button')) {
        const itemId = card.getAttribute('data-id');
        const box = card.querySelector('.item-checkbox');
        if (box) {
          const nextState = !state.selectedIds.has(itemId);
          box.checked = nextState;
          toggleSelection(itemId, nextState);
        }
      }
    });

    // Selection Bar actions
    elements.clearSelectionBtn.addEventListener('click', () => {
      clearSelection();
    });

    elements.tweetSelectedBtn.addEventListener('click', () => {
      if (state.selectedIds.size > 0) {
        openTweetModalForItems(Array.from(state.selectedIds));
      }
    });

    if (elements.exportSelectedCsvBtn) {
      elements.exportSelectedCsvBtn.addEventListener('click', () => {
        const selectedItems = state.items.filter(it => state.selectedIds.has(it.id));
        if (selectedItems.length > 0) {
          exportItemsToCsv(selectedItems, `bigquery-selected-${selectedItems.length}-releases.csv`);
        }
      });
    }

    // Modal dialog controls
    elements.closeModalBtn.addEventListener('click', () => {
      elements.tweetModal.close();
    });

    elements.tweetModal.addEventListener('click', (e) => {
      // Close on backdrop click
      const rect = elements.tweetModal.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        elements.tweetModal.close();
      }
    });

    // Live tweet character counter
    elements.tweetTextarea.addEventListener('input', () => {
      updateCharCounter();
    });

    // Copy to clipboard from modal
    elements.copyTweetBtn.addEventListener('click', async () => {
      const text = elements.tweetTextarea.value;
      try {
        await navigator.clipboard.writeText(text);
        showToast('트윗 내용이 클립보드에 복사되었습니다!');
        elements.copyBtnText.textContent = '복사됨!';
        setTimeout(() => {
          elements.copyBtnText.textContent = 'Copy to Clipboard';
        }, 2000);
      } catch (err) {
        showToast('복사에 실패했습니다.');
      }
    });

    // Post on X (Twitter Intent)
    elements.postXBtn.addEventListener('click', () => {
      const text = elements.tweetTextarea.value.trim();
      if (!text) return;
      const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      const width = 600;
      const height = 480;
      const left = Math.max(0, (window.innerWidth - width) / 2 + window.screenX);
      const top = Math.max(0, (window.innerHeight - height) / 2 + window.screenY);
      window.open(intentUrl, 'twitter_tweet', `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
      showToast('Twitter / X 작성창을 열었습니다.');
    });
  }

  /**
   * Utility 1: Copy single card details to clipboard
   */
  async function copyCardToClipboard(item, btnElement) {
    const textToCopy = `[BigQuery 릴리스 노트] ${item.date} - ${item.category}\n` +
                       `헤드라인: ${item.headline}\n` +
                       `요약: ${item.summary_text}\n` +
                       `원문 링크: ${item.link || 'https://cloud.google.com/bigquery/docs/release-notes'}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('클립보드에 복사되었습니다.');
      
      if (btnElement) {
        const originalHtml = btnElement.innerHTML;
        btnElement.classList.add('copied');
        btnElement.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span class="btn-text">복사됨!</span>
        `;
        setTimeout(() => {
          btnElement.classList.remove('copied');
          btnElement.innerHTML = originalHtml;
        }, 2000);
      }
    } catch (err) {
      console.error('Copy failed:', err);
      showToast('클립보드 복사에 실패했습니다.');
    }
  }

  /**
   * Utility 2: Export items to RFC 4180 compliant CSV file with UTF-8 BOM
   */
  function exportItemsToCsv(items, filename) {
    if (!items || items.length === 0) return;

    const headers = ['ID', 'Date', 'Category', 'Headline', 'Summary', 'Doc_Link'];
    const rows = items.map(item => [
      item.id,
      item.date,
      item.category,
      item.headline,
      item.summary_text,
      item.link || ''
    ].map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','));

    // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'bigquery-releases.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`${items.length}개 항목이 CSV 파일로 다운로드되었습니다.`);
  }

  /**
   * Fetches release notes from the backend
   */
  async function loadReleases(forceRefresh = false) {
    setLoading(true);
    elements.alertBanner.classList.add('hidden');

    try {
      const url = '/api/releases' + (forceRefresh ? '?refresh=true' : '');
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch updates`);
      }

      const data = await response.json();
      state.items = data.items || [];
      state.categories = data.categories || [];
      state.categoryCounts = data.categoryCounts || {};
      state.lastFetchedEpoch = data.last_fetched_epoch || Date.now() / 1000;

      if (data.warning) {
        elements.alertBanner.textContent = data.warning;
        elements.alertBanner.classList.remove('hidden');
      }

      updateTimestamp();
      renderCategories();
      renderFeed();

      if (forceRefresh) {
        showToast('피드를 최신 정보로 새로고침했습니다!');
      }
    } catch (err) {
      console.error('Error fetching releases:', err);
      elements.alertBanner.textContent = `피드를 가져올 수 없습니다: ${err.message}. 잠시 후 다시 시도해 주세요.`;
      elements.alertBanner.classList.remove('hidden');
      showToast('피드 새로고침에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sets the loading state & toggle spinner
   */
  function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.refreshBtn.disabled = isLoading;

    if (isLoading) {
      elements.refreshIcon.classList.add('hidden');
      elements.refreshSpinner.classList.remove('hidden');
      if (state.items.length === 0) {
        elements.feedLoading.classList.remove('hidden');
        elements.cardsGrid.classList.add('hidden');
      }
    } else {
      elements.refreshIcon.classList.remove('hidden');
      elements.refreshSpinner.classList.add('hidden');
      elements.feedLoading.classList.add('hidden');
    }
  }

  /**
   * Updates the "Last updated" text
   */
  function updateTimestamp() {
    if (!state.lastFetchedEpoch) return;
    const date = new Date(state.lastFetchedEpoch * 1000);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    elements.lastUpdatedText.textContent = `Updated at ${timeStr}`;
    elements.statusDot.classList.remove('stale');
  }

  /**
   * Renders Category Filter Chips
   */
  function renderCategories() {
    // Total count
    elements.countAll.textContent = state.items.length;

    // Remove existing chips except ALL
    const chips = elements.categoriesContainer.querySelectorAll('.filter-chip:not([data-category="ALL"])');
    chips.forEach(c => c.remove());

    // Append chips for each category
    state.categories.forEach(cat => {
      const count = state.categoryCounts[cat] || 0;
      const chip = document.createElement('button');
      chip.className = `filter-chip ${state.activeCategory === cat ? 'active' : ''}`;
      chip.setAttribute('type', 'button');
      chip.setAttribute('data-category', cat);
      chip.innerHTML = `${escapeHtml(cat)} <span class="chip-count">${count}</span>`;
      elements.categoriesContainer.appendChild(chip);
    });
  }

  /**
   * Updates category active chip highlight
   */
  function updateActiveCategoryChip() {
    const chips = elements.categoriesContainer.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
      const cat = chip.getAttribute('data-category');
      chip.classList.toggle('active', cat === state.activeCategory);
    });
  }

  /**
   * Renders the feed cards with utility buttons and tweet actions
   */
  function renderFeed() {
    let filtered = state.items;

    // Category filter
    if (state.activeCategory !== 'ALL') {
      filtered = filtered.filter(item => item.category === state.activeCategory);
    }

    // Search query filter
    if (state.searchQuery) {
      const q = state.searchQuery;
      filtered = filtered.filter(item => {
        return (
          item.headline.toLowerCase().includes(q) ||
          item.summary_text.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.date.toLowerCase().includes(q)
        );
      });
    }

    if (filtered.length === 0) {
      elements.cardsGrid.classList.add('hidden');
      elements.emptyState.classList.remove('hidden');
      return;
    }

    elements.emptyState.classList.add('hidden');
    elements.cardsGrid.classList.remove('hidden');

    elements.cardsGrid.innerHTML = filtered.map(item => {
      const isSelected = state.selectedIds.has(item.id);
      const categoryClass = getBadgeClass(item.category);
      const sanitizedContent = sanitizeAndFormatHtml(item.content_html || item.summary_text);

      return `
        <article class="release-card ${isSelected ? 'selected' : ''}" data-id="${escapeHtml(item.id)}">
          <div class="card-top">
            <div class="card-meta-left">
              <input type="checkbox" class="item-checkbox" data-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} aria-label="Select update from ${escapeHtml(item.date)}">
              <span class="badge ${categoryClass}">${escapeHtml(item.category)}</span>
            </div>
            <time class="card-date">${escapeHtml(item.date)}</time>
          </div>

          <h3 class="card-headline">${escapeHtml(item.headline)}</h3>

          <div class="card-content">
            ${sanitizedContent}
          </div>

          <div class="card-footer">
            <div class="card-footer-left">
              ${item.link ? `
                <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="btn-icon-link" title="공식 릴리스 문서 열기">
                  <span>문서 보기</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
              ` : '<span></span>'}
            </div>

            <div class="card-footer-actions">
              <!-- Utility 1: Copy to clipboard -->
              <button type="button" class="btn btn-utility btn-card-copy" data-id="${escapeHtml(item.id)}" title="요약 내용을 클립보드에 복사" aria-label="클립보드에 복사">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span class="btn-text">복사</span>
              </button>

              <!-- Utility 2: Export to CSV -->
              <button type="button" class="btn btn-utility btn-card-csv" data-id="${escapeHtml(item.id)}" title="이 항목을 CSV 파일로 다운로드" aria-label="CSV로 내보내기">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span class="btn-text">CSV</span>
              </button>

              <!-- Tweet button -->
              <button type="button" class="btn btn-tweet btn-card-tweet" data-id="${escapeHtml(item.id)}" aria-label="Tweet this update">
                <svg class="x-logo" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span>Tweet</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  /**
   * Helper to get CSS badge class by category
   */
  function getBadgeClass(category) {
    const lower = (category || '').toLowerCase();
    if (lower.includes('feature')) return 'badge-feature';
    if (lower.includes('announcement')) return 'badge-announcement';
    if (lower.includes('change')) return 'badge-change';
    if (lower.includes('fix')) return 'badge-fixed';
    return 'badge-general';
  }

  /**
   * Toggles selection of an item
   */
  function toggleSelection(itemId, isSelected) {
    if (isSelected) {
      state.selectedIds.add(itemId);
    } else {
      state.selectedIds.delete(itemId);
    }
    updateSelectionUI();
  }

  /**
   * Clears all selections
   */
  function clearSelection() {
    state.selectedIds.clear();
    updateSelectionUI();
    const boxes = elements.cardsGrid.querySelectorAll('.item-checkbox');
    boxes.forEach(b => b.checked = false);
    const cards = elements.cardsGrid.querySelectorAll('.release-card.selected');
    cards.forEach(c => c.classList.remove('selected'));
  }

  /**
   * Updates selection bar and card styles
   */
  function updateSelectionUI() {
    const count = state.selectedIds.size;
    elements.selectedCount.textContent = count;
    elements.selectionBar.classList.toggle('hidden', count === 0);

    const cards = elements.cardsGrid.querySelectorAll('.release-card');
    cards.forEach(card => {
      const id = card.getAttribute('data-id');
      card.classList.toggle('selected', state.selectedIds.has(id));
    });
  }

  /**
   * Opens the Tweet composer modal for selected item(s)
   */
  function openTweetModalForItems(itemIds) {
    state.currentModalItemIds = itemIds;
    const selectedItems = state.items.filter(item => itemIds.includes(item.id));
    if (selectedItems.length === 0) return;

    let defaultTweet = '';
    let primaryLink = '';

    if (selectedItems.length === 1) {
      const item = selectedItems[0];
      primaryLink = item.link || 'https://cloud.google.com/bigquery/docs/release-notes';

      const headline = item.headline || `${item.category} Update`;
      const dateSnippet = item.date;
      let summary = item.summary_text || '';

      const prefix = `BigQuery [${item.category}] (${dateSnippet}):\n${headline}`;
      const hashtags = '#BigQuery #GoogleCloud';
      const maxSummaryLen = 280 - (prefix.length + hashtags.length + primaryLink.length + 8);

      if (summary.length > maxSummaryLen && maxSummaryLen > 20) {
        summary = summary.substring(0, maxSummaryLen - 3) + '...';
      }

      defaultTweet = `${prefix}\n\n${summary}\n\n${primaryLink}\n${hashtags}`;
    } else {
      primaryLink = 'https://cloud.google.com/bigquery/docs/release-notes';
      const bullets = selectedItems.slice(0, 3).map(it => `• [${it.category}] ${it.headline}`).join('\n');
      const moreCount = selectedItems.length > 3 ? `\n...and ${selectedItems.length - 3} more updates` : '';

      defaultTweet = `Latest BigQuery Updates:\n${bullets}${moreCount}\n\n${primaryLink}\n#BigQuery #GoogleCloud`;
    }

    elements.tweetTextarea.value = defaultTweet.trim();
    elements.tweetSourceLink.href = primaryLink;
    elements.tweetSourceLink.textContent = primaryLink;

    updateCharCounter();
    elements.tweetModal.showModal();
    elements.tweetTextarea.focus();
  }

  /**
   * Updates character count in modal
   */
  function updateCharCounter() {
    const text = elements.tweetTextarea.value;
    const len = text.length;
    elements.charCount.textContent = len;

    elements.charCount.classList.remove('warning', 'danger');
    if (len > 280) {
      elements.charCount.classList.add('danger');
      elements.charWarning.classList.remove('hidden');
    } else if (len > 250) {
      elements.charCount.classList.add('warning');
      elements.charWarning.classList.add('hidden');
    } else {
      elements.charWarning.classList.add('hidden');
    }
  }

  /**
   * Sanitizes and rewrites links in HTML content for safety
   */
  function sanitizeAndFormatHtml(rawHtml) {
    if (!rawHtml) return '';
    let formatted = rawHtml.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi, (match, href) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
    });
    return formatted;
  }

  /**
   * Basic HTML Escaper for text interpolation
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Shows a brief toast alert
   */
  let toastTimer = null;
  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      elements.toast.classList.add('hidden');
    }, 2500);
  }

  // Start the application when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
