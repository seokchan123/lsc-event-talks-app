/**
 * BigQuery Release Notes Explorer & Tweet Composer
 * Plain Vanilla JavaScript (ES6)
 */

(function () {
  'use strict';

  // Application State
  const state = {
    notesData: null,
    selectedUpdateId: null,
    activeCategory: 'all',
    searchQuery: '',
    isLoading: false,
    selectedHashtags: new Set(['#BigQuery', '#GoogleCloud'])
  };

  // DOM Elements
  const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    refreshSpinner: document.getElementById('refresh-spinner'),
    refreshBtnLabel: document.getElementById('refresh-btn-label'),
    totalUpdatesCount: document.getElementById('total-updates-count'),
    totalDatesCount: document.getElementById('total-dates-count'),
    lastFetchedText: document.getElementById('last-fetched-text'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    categoryPillsContainer: document.getElementById('category-pills-container'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    errorRetryBtn: document.getElementById('error-retry-btn'),
    emptyState: document.getElementById('empty-state'),
    emptyResetBtn: document.getElementById('empty-reset-btn'),
    feedContainer: document.getElementById('release-notes-feed'),
    floatingBar: document.getElementById('floating-selection-bar'),
    selectionSummaryText: document.getElementById('selection-summary-text'),
    btnFloatingTweet: document.getElementById('btn-floating-tweet'),
    btnFloatingQuickTweet: document.getElementById('btn-floating-quick-tweet'),
    btnFloatingCopy: document.getElementById('btn-floating-copy'),
    btnFloatingClear: document.getElementById('btn-floating-clear'),
    tweetModal: document.getElementById('tweet-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalUpdateCategory: document.getElementById('modal-update-category'),
    modalUpdateDate: document.getElementById('modal-update-date'),
    modalUpdateLink: document.getElementById('modal-update-link'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    hashtagChips: document.getElementById('hashtag-chips'),
    charCount: document.getElementById('char-count'),
    charMeterFill: document.getElementById('char-meter-fill'),
    modalCopyBtn: document.getElementById('modal-copy-btn'),
    modalCopyText: document.getElementById('modal-copy-text'),
    modalTweetBtn: document.getElementById('modal-tweet-btn'),
    toast: document.getElementById('toast')
  };

  // =========================================================================
  // Initialization & Event Listeners
  // =========================================================================

  function init() {
    setupEventListeners();
    loadReleaseNotes(false);
  }

  function setupEventListeners() {
    // Refresh Button
    elements.refreshBtn.addEventListener('click', () => {
      loadReleaseNotes(true);
    });

    // Error Retry Button
    elements.errorRetryBtn.addEventListener('click', () => {
      loadReleaseNotes(true);
    });

    // Search Input
    let searchDebounceTimer;
    elements.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      state.searchQuery = e.target.value.trim().toLowerCase();
      elements.searchClearBtn.style.display = state.searchQuery ? 'block' : 'none';
      searchDebounceTimer = setTimeout(() => {
        filterAndRender();
      }, 180);
    });

    // Clear Search Button
    elements.searchClearBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.searchClearBtn.style.display = 'none';
      elements.searchInput.focus();
      filterAndRender();
    });

    // Category Filter Pills
    elements.categoryPillsContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      const cat = pill.getAttribute('data-category');
      if (cat === state.activeCategory) return;

      state.activeCategory = cat;
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      filterAndRender();
    });

    // Reset Filters from Empty State
    elements.emptyResetBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.searchClearBtn.style.display = 'none';
      state.activeCategory = 'all';
      document.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-category') === 'all');
      });
      filterAndRender();
    });

    // Feed delegation (card click, tweet button click, copy button click)
    elements.feedContainer.addEventListener('click', (e) => {
      const tweetBtn = e.target.closest('[data-action="tweet"]');
      const copyBtn = e.target.closest('[data-action="copy"]');
      const linkEl = e.target.closest('a');
      const card = e.target.closest('.update-card');

      if (tweetBtn) {
        e.stopPropagation();
        const updateId = tweetBtn.getAttribute('data-update-id');
        selectUpdate(updateId);
        openTweetModal(updateId);
        return;
      }

      if (copyBtn) {
        e.stopPropagation();
        const updateId = copyBtn.getAttribute('data-update-id');
        copyUpdateText(updateId);
        return;
      }

      if (linkEl) {
        // Allow standard link navigation
        return;
      }

      if (card) {
        const updateId = card.getAttribute('data-update-id');
        if (state.selectedUpdateId === updateId) {
          clearSelection();
        } else {
          selectUpdate(updateId);
        }
      }
    });

    // Floating Bar Actions
    elements.btnFloatingTweet.addEventListener('click', () => {
      if (state.selectedUpdateId) {
        openTweetModal(state.selectedUpdateId);
      }
    });

    elements.btnFloatingQuickTweet.addEventListener('click', () => {
      if (state.selectedUpdateId) {
        const update = findUpdateById(state.selectedUpdateId);
        if (update) {
          launchTwitterIntent(update.tweet_draft);
        }
      }
    });

    elements.btnFloatingCopy.addEventListener('click', () => {
      if (state.selectedUpdateId) {
        copyUpdateText(state.selectedUpdateId);
      }
    });

    elements.btnFloatingClear.addEventListener('click', () => {
      clearSelection();
    });

    // Tweet Modal Actions
    elements.modalCloseBtn.addEventListener('click', closeTweetModal);
    elements.tweetModal.addEventListener('click', (e) => {
      if (e.target === elements.tweetModal) {
        closeTweetModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.tweetModal.style.display !== 'none') {
        closeTweetModal();
      }
    });

    // Tweet Textarea Typing
    elements.tweetTextarea.addEventListener('input', () => {
      updateCharCounter();
      syncHashtagChipsWithText();
    });

    // Hashtag Chips Toggle in Modal
    elements.hashtagChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const tag = chip.getAttribute('data-tag');
      toggleHashtagInTextarea(tag);
    });

    // Modal Copy Button
    elements.modalCopyBtn.addEventListener('click', () => {
      const text = elements.tweetTextarea.value;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        elements.modalCopyText.textContent = 'Copied!';
        showToast('Tweet text copied to clipboard!');
        setTimeout(() => {
          elements.modalCopyText.textContent = 'Copy Text';
        }, 2000);
      }).catch(err => {
        fallbackCopyText(text);
      });
    });

    // Modal Post on X / Twitter Button
    elements.modalTweetBtn.addEventListener('click', () => {
      const text = elements.tweetTextarea.value;
      if (!text) return;
      launchTwitterIntent(text);
    });
  }

  // =========================================================================
  // Data Fetching & Refresh
  // =========================================================================

  async function loadReleaseNotes(isManualRefresh = false) {
    if (state.isLoading) return;

    state.isLoading = true;
    setRefreshButtonState(true);

    if (!state.notesData) {
      elements.loadingState.style.display = 'flex';
      elements.feedContainer.style.display = 'none';
      elements.errorState.style.display = 'none';
      elements.emptyState.style.display = 'none';
    }

    const endpoint = isManualRefresh ? '/api/release-notes?refresh=true' : '/api/release-notes';

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status !== 'success' && !data.entries) {
        throw new Error(data.message || 'Malformed feed response');
      }

      state.notesData = data;
      updateHeaderMetadata(data);
      updateCategoryCounts(data);
      filterAndRender();

      elements.loadingState.style.display = 'none';
      elements.errorState.style.display = 'none';

      if (isManualRefresh) {
        showToast(`Feed refreshed successfully (${data.total_updates} updates)`);
      }
    } catch (err) {
      console.error('Error fetching release notes:', err);
      if (!state.notesData) {
        elements.loadingState.style.display = 'none';
        elements.feedContainer.style.display = 'none';
        elements.errorState.style.display = 'flex';
        elements.errorMessage.textContent = err.message || 'Could not connect to Google Cloud release notes feed.';
      } else {
        showToast(`Refresh failed: ${err.message}`, 4000);
      }
    } finally {
      state.isLoading = false;
      setRefreshButtonState(false);
    }
  }

  function setRefreshButtonState(loading) {
    if (loading) {
      elements.refreshSpinner.classList.add('spinning');
      elements.refreshBtn.disabled = true;
      elements.refreshBtnLabel.textContent = 'Refreshing...';
    } else {
      elements.refreshSpinner.classList.remove('spinning');
      elements.refreshBtn.disabled = false;
      elements.refreshBtnLabel.textContent = 'Refresh Feed';
    }
  }

  function updateHeaderMetadata(data) {
    elements.totalUpdatesCount.textContent = data.total_updates || 0;
    elements.totalDatesCount.textContent = data.total_entries || 0;
    if (data.fetched_at) {
      elements.lastFetchedText.textContent = `Last refreshed: ${data.fetched_at}`;
    }
  }

  function updateCategoryCounts(data) {
    const counts = data.category_counts || {};
    document.getElementById('count-all').textContent = data.total_updates || 0;
    document.getElementById('count-Feature').textContent = counts['Feature'] || 0;
    document.getElementById('count-Change').textContent = counts['Change'] || 0;
    document.getElementById('count-Announcement').textContent = counts['Announcement'] || 0;
    document.getElementById('count-Fixed').textContent = counts['Fixed'] || 0;
  }

  // =========================================================================
  // Filtering & Rendering
  // =========================================================================

  function filterAndRender() {
    if (!state.notesData || !state.notesData.entries) return;

    const query = state.searchQuery;
    const activeCat = state.activeCategory;

    let matchedDates = [];
    let visibleUpdatesCount = 0;

    state.notesData.entries.forEach(entry => {
      const filteredUpdates = entry.updates.filter(update => {
        // Category check
        const matchCategory = (activeCat === 'all' || update.category.toLowerCase() === activeCat.toLowerCase());
        if (!matchCategory) return false;

        // Query search
        if (!query) return true;
        const inCategory = update.category.toLowerCase().includes(query);
        const inDate = update.date.toLowerCase().includes(query);
        const inText = update.plain_text.toLowerCase().includes(query);
        return inCategory || inDate || inText;
      });

      if (filteredUpdates.length > 0) {
        visibleUpdatesCount += filteredUpdates.length;
        matchedDates.push({
          ...entry,
          updates: filteredUpdates
        });
      }
    });

    if (visibleUpdatesCount === 0) {
      elements.feedContainer.style.display = 'none';
      elements.emptyState.style.display = 'flex';
      return;
    }

    elements.emptyState.style.display = 'none';
    elements.feedContainer.style.display = 'block';

    renderFeedHTML(matchedDates);
  }

  function renderFeedHTML(datesList) {
    const htmlFragments = datesList.map(entry => {
      const updatesHTML = entry.updates.map(update => {
        const isSelected = state.selectedUpdateId === update.id;
        const categoryClass = getBadgeClass(update.category);

        return `
          <article class="update-card ${isSelected ? 'selected' : ''}" 
                   data-update-id="${escapeHtml(update.id)}"
                   role="button"
                   tabindex="0"
                   aria-selected="${isSelected ? 'true' : 'false'}"
                   title="Click to select this update">
            <div class="card-top-row">
              <div class="card-meta-left">
                <span class="select-indicator" title="Select to Tweet">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span class="badge ${categoryClass}">${escapeHtml(update.category)}</span>
              </div>
              <div class="card-actions">
                <button class="btn-card-tweet" data-action="tweet" data-update-id="${escapeHtml(update.id)}" title="Tweet about this update">
                  <svg class="x-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  Tweet
                </button>
                <button class="btn-card-icon" data-action="copy" data-update-id="${escapeHtml(update.id)}" title="Copy update text">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <a href="${escapeHtml(update.link)}" target="_blank" rel="noopener noreferrer" class="btn-card-icon" title="View documentation on Google Cloud">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
              </div>
            </div>
            <div class="card-body">
              ${update.html}
            </div>
          </article>
        `;
      }).join('');

      return `
        <section class="date-group">
          <div class="date-header">
            <div class="date-title-group">
              <h2 class="date-title">${escapeHtml(entry.date)}</h2>
            </div>
            ${entry.link ? `
              <a href="${escapeHtml(entry.link)}" target="_blank" rel="noopener noreferrer" class="date-doc-link">
                Release link ↗
              </a>
            ` : ''}
          </div>
          <div class="updates-list">
            ${updatesHTML}
          </div>
        </section>
      `;
    }).join('');

    elements.feedContainer.innerHTML = htmlFragments;
  }

  function getBadgeClass(category) {
    const map = {
      'Feature': 'badge-feature',
      'Change': 'badge-change',
      'Announcement': 'badge-announcement',
      'Fixed': 'badge-fixed'
    };
    return map[category] || 'badge-feature';
  }

  // =========================================================================
  // Selection Handling
  // =========================================================================

  function selectUpdate(updateId) {
    state.selectedUpdateId = updateId;
    const update = findUpdateById(updateId);

    // Update cards visual state in DOM
    document.querySelectorAll('.update-card').forEach(card => {
      const isSelected = card.getAttribute('data-update-id') === updateId;
      card.classList.toggle('selected', isSelected);
      card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    if (update) {
      elements.selectionSummaryText.textContent = `[${update.category}] ${update.date} - ${update.plain_text.slice(0, 45)}...`;
      elements.floatingBar.style.display = 'block';
    }
  }

  function clearSelection() {
    state.selectedUpdateId = null;
    document.querySelectorAll('.update-card').forEach(card => {
      card.classList.remove('selected');
      card.setAttribute('aria-selected', 'false');
    });
    elements.floatingBar.style.display = 'none';
  }

  function findUpdateById(updateId) {
    if (!state.notesData || !state.notesData.all_updates) return null;
    return state.notesData.all_updates.find(u => u.id === updateId);
  }

  // =========================================================================
  // Tweet Composer Modal & Twitter Intent
  // =========================================================================

  function openTweetModal(updateId) {
    const update = findUpdateById(updateId);
    if (!update) return;

    elements.modalUpdateCategory.textContent = update.category;
    elements.modalUpdateCategory.className = `badge ${getBadgeClass(update.category)}`;
    elements.modalUpdateDate.textContent = update.date;
    elements.modalUpdateLink.href = update.link;

    // Prefill with pre-generated tweet draft
    elements.tweetTextarea.value = update.tweet_draft;

    syncHashtagChipsWithText();
    updateCharCounter();

    elements.tweetModal.style.display = 'flex';
    elements.tweetTextarea.focus();
  }

  function closeTweetModal() {
    elements.tweetModal.style.display = 'none';
  }

  function calculateTwitterLength(text) {
    // Twitter replaces all URLs with a t.co link counting as 23 chars
    const urlRegex = /https?:\/\/[^\s]+/g;
    const textWithoutUrls = text.replace(urlRegex, '');
    const urlMatches = text.match(urlRegex) || [];
    const urlCharCount = urlMatches.length * 23;
    return textWithoutUrls.length + urlCharCount;
  }

  function updateCharCounter() {
    const text = elements.tweetTextarea.value;
    const twitterLength = calculateTwitterLength(text);
    const maxChars = 280;
    const remaining = maxChars - twitterLength;

    elements.charCount.textContent = twitterLength;

    // Meter fill percentage
    const percentage = Math.min(100, Math.max(0, (twitterLength / maxChars) * 100));
    elements.charMeterFill.style.width = `${percentage}%`;

    // Clear color states
    elements.charCount.parentElement.classList.remove('warning', 'danger');
    elements.charMeterFill.classList.remove('warning', 'danger');

    if (twitterLength > maxChars) {
      elements.charCount.parentElement.classList.add('danger');
      elements.charMeterFill.classList.add('danger');
      elements.modalTweetBtn.disabled = true;
    } else if (twitterLength >= 250) {
      elements.charCount.parentElement.classList.add('warning');
      elements.charMeterFill.classList.add('warning');
      elements.modalTweetBtn.disabled = false;
    } else {
      elements.modalTweetBtn.disabled = twitterLength === 0;
    }
  }

  function syncHashtagChipsWithText() {
    const text = elements.tweetTextarea.value;
    document.querySelectorAll('#hashtag-chips .chip').forEach(chip => {
      const tag = chip.getAttribute('data-tag');
      const hasTag = text.includes(tag);
      chip.classList.toggle('active', hasTag);
    });
  }

  function toggleHashtagInTextarea(tag) {
    let currentText = elements.tweetTextarea.value;
    if (currentText.includes(tag)) {
      // Remove tag
      const regex = new RegExp(`\\s*${tag}\\b`, 'g');
      currentText = currentText.replace(regex, '').trim();
    } else {
      // Append tag
      currentText = currentText ? `${currentText} ${tag}` : tag;
    }
    elements.tweetTextarea.value = currentText;
    updateCharCounter();
    syncHashtagChipsWithText();
  }

  function launchTwitterIntent(text) {
    if (!text) return;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
  }

  function copyUpdateText(updateId) {
    const update = findUpdateById(updateId);
    if (!update) return;

    const copyPayload = `BigQuery [${update.category}] (${update.date}):\n${update.plain_text}\nLink: ${update.link}`;
    navigator.clipboard.writeText(copyPayload).then(() => {
      showToast('Update details copied to clipboard!');
    }).catch(() => {
      fallbackCopyText(copyPayload);
    });
  }

  function fallbackCopyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard!');
    } catch (err) {
      showToast('Unable to auto-copy. Please copy manually.');
    }
    document.body.removeChild(textArea);
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  function showToast(message, duration = 3000) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(elements.toast._timer);
    elements.toast._timer = setTimeout(() => {
      elements.toast.classList.remove('show');
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Start app
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
