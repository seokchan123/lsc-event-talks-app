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
    bindEvents();
    loadReleases(false);
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

    // Cards Grid interaction (Checkbox & Tweet buttons)
    elements.cardsGrid.addEventListener('click', (e) => {
      // Tweet button clicked on a card
      const tweetBtn = e.target.closest('.btn-card-tweet');
      if (tweetBtn) {
        e.stopPropagation();
        const itemId = tweetBtn.getAttribute('data-id');
        openTweetModalForItems([itemId]);
        return;
      }

      // Checkbox changed or card clicked
      const checkbox = e.target.closest('.item-checkbox');
      if (checkbox) {
        const itemId = checkbox.getAttribute('data-id');
        toggleSelection(itemId, checkbox.checked);
        return;
      }

      // Clicking card background toggles selection if clicked outside interactive elements
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

    // Copy to clipboard
    elements.copyTweetBtn.addEventListener('click', async () => {
      const text = elements.tweetTextarea.value;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
        elements.copyBtnText.textContent = 'Copied!';
        setTimeout(() => {
          elements.copyBtnText.textContent = 'Copy to Clipboard';
        }, 2000);
      } catch (err) {
        showToast('Failed to copy. Please select and copy manually.');
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
      showToast('Opening Twitter / X post composer...');
    });
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
        showToast('Feed refreshed successfully!');
      }
    } catch (err) {
      console.error('Error fetching releases:', err);
      elements.alertBanner.textContent = `Could not refresh feed: ${err.message}. Please try again later.`;
      elements.alertBanner.classList.remove('hidden');
      showToast('Failed to refresh feed.');
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
   * Renders the feed cards according to current category and search query
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

      // Ensure links inside content open safely in a new tab
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
            ${item.link ? `
              <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="btn-icon-link">
                <span>Release Doc</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
            ` : '<span></span>'}

            <button type="button" class="btn btn-tweet btn-card-tweet" data-id="${escapeHtml(item.id)}" aria-label="Tweet this update">
              <svg class="x-logo" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Tweet
            </button>
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

      // Build concise draft
      const headline = item.headline || `${item.category} Update`;
      const dateSnippet = item.date;
      let summary = item.summary_text || '';

      // Draft base template
      const prefix = `BigQuery [${item.category}] (${dateSnippet}):\n${headline}`;
      const hashtags = '#BigQuery #GoogleCloud';
      const maxSummaryLen = 280 - (prefix.length + hashtags.length + primaryLink.length + 8);

      if (summary.length > maxSummaryLen && maxSummaryLen > 20) {
        summary = summary.substring(0, maxSummaryLen - 3) + '...';
      }

      defaultTweet = `${prefix}\n\n${summary}\n\n${primaryLink}\n${hashtags}`;
    } else {
      // Multi-select tweet draft
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
    // Rewrite all <a> tags to target="_blank" rel="noopener noreferrer"
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
    }, 3000);
  }

  // Start the application when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
