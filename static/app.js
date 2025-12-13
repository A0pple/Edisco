const feedList = document.getElementById('feedList');
const topViewedList = document.getElementById('topViewedList');
const limitSelect = document.getElementById('limitSelect');
const anonOnlyToggle = document.getElementById('anonOnlyToggle');
const globalPeriodSelect = document.getElementById('globalPeriod');
const userFilterInput = document.getElementById('userFilter');
const refreshBtn = document.getElementById('refreshBtn');
const filterModeBtn = document.getElementById('filterModeBtn');
const feedSort = document.getElementById('feedSort');
let filterMode = 'user'; // 'user' or 'article'

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const refreshAll = () => {
    // Refresh all data
    const limit = parseInt(limitSelect.value) || 50;
    const period = ['1h', '24h', '7d'].includes(limitSelect.value) ? limitSelect.value : null;

    fetchRecentEdits(limit, period);
    updateTopSection();
    fetchNewArticles();
    fetchTopViewedArticles();
    fetchTopTalkPages();
};

globalPeriodSelect.addEventListener('change', () => {
    const period = globalPeriodSelect.value;
    // Update all individual selectors
    if (limitSelect.querySelector(`option[value="${period}"]`)) limitSelect.value = period;
    const topPeriod = document.getElementById('topPeriod');
    if (topPeriod) topPeriod.value = period;
    const topTalkPeriod = document.getElementById('topTalkPeriod');
    if (topTalkPeriod) topTalkPeriod.value = period;
    const newPeriod = document.getElementById('newPeriod');
    if (newPeriod) newPeriod.value = period;
    const topViewedPeriod = document.getElementById('topViewedPeriod');
    if (topViewedPeriod) topViewedPeriod.value = period;

    refreshAll();
});

limitSelect.addEventListener('change', () => {
    let value = limitSelect.value;

    // Handle Custom
    if (value === 'custom') {
        const custom = prompt("הכנס מספר עריכות להצגה (מקסימום 500):", "50");
        if (custom && !isNaN(custom)) {
            const num = Math.min(parseInt(custom), 500);
            // Check if option exists, if not create
            let opt = Array.from(limitSelect.options).find(o => o.value === String(num));
            if (!opt) {
                opt = new Option(`${num} (מותאם)`, num);
                limitSelect.add(opt, limitSelect.options[limitSelect.options.length - 1]); // Before 'custom' ? No 'custom' is usually last.
                // Assuming 'custom' is last.
            }
            limitSelect.value = String(num);
            value = String(num);
        } else {
            limitSelect.value = "50";
            value = "50";
        }
    }

    const limit = parseInt(value);

    // Immediate truncation if limit is reduced
    if (!isNaN(limit) && feedList.children.length > limit) {
        while (feedList.children.length > limit) {
            feedList.lastChild.remove();
        }
    }

    refreshAll();
});

anonOnlyToggle.addEventListener('change', refreshAll);

feedSort.addEventListener('change', () => {
    refreshAll();
});

userFilterInput.addEventListener('input', debounce(() => {
    refreshAll();
}, 500));

refreshBtn.addEventListener('click', () => {
    const icon = refreshBtn.querySelector('i');
    icon.classList.add('fa-spin');
    refreshAll();
    setTimeout(() => icon.classList.remove('fa-spin'), 1000);
    setTimeout(() => icon.classList.remove('fa-spin'), 1000);
});

filterModeBtn.addEventListener('click', () => {
    if (filterMode === 'user') {
        filterMode = 'article';
        filterModeBtn.classList.remove('fa-user-tag');
        filterModeBtn.classList.add('fa-file-lines');
        filterModeBtn.title = 'לחץ להחלפה לחיפוש משתמש';
        userFilterInput.placeholder = 'סנן לפי ערך...';
    } else {
        filterMode = 'user';
        filterModeBtn.classList.remove('fa-file-lines');
        filterModeBtn.classList.add('fa-user-tag');
        filterModeBtn.title = 'לחץ להחלפה לחיפוש ערך';
        userFilterInput.placeholder = 'סנן לפי משתמש...';
    }
    // Optional: Clear input? Let's keep it, user might want to switch mode for same string (unlikely but possible)
    // Refresh if there is input
    if (userFilterInput.value.trim()) {
        refreshAll();
    }
});


// Error Handling
function showError(message) {
    const existingToast = document.querySelector('.error-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// WebSocket Connection
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws/live`;
let socket;

function connectWebSocket() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('Connected to live feed');
        document.querySelector('.live-indicator').classList.remove('offline');
        // Clear empty state if it exists
        const emptyState = feedList.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
    };

    socket.onmessage = (event) => {
        // If sorting is active (not date), ignore live updates to keep list stable
        if (feedSort.value !== 'date') return;

        const data = JSON.parse(event.data);
        addEditToFeed(data);
    };

    socket.onclose = () => {
        console.log('Disconnected from live feed, retrying in 5s...');
        document.querySelector('.live-indicator').classList.add('offline');
        showError('החיבור לשרת נותק. מנסה להתחבר מחדש...');
        setTimeout(connectWebSocket, 5000);
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        document.querySelector('.live-indicator').classList.add('offline');
        // WebSocket errors are often silent for security, but we can infer connection issues
        showError('שגיאה בחיבור לשרת. בדוק את החיבור שלך.');
    };
}

function addEditToFeed(edit) {
    // Deduplicate: Check if we already have this edit
    const rcid = edit.rcid || edit.id;
    if (rcid) {
        const existing = document.querySelector(`.edit-card[data-rcid="${rcid}"]`);
        if (existing) return;
    }

    const card = createEditCard(edit);

    feedList.insertBefore(card, feedList.firstChild);

    // Limit feed based on selection (if not custom)
    const limit = limitSelect.value === 'custom' ? 500 : parseInt(limitSelect.value);
    // Only enforce limit if we are in a limit-based mode (numeric value)
    // Only enforce limit if we are in a limit-based mode (numeric value)
    if (!isNaN(limit)) {
        while (feedList.children.length > limit) {
            feedList.lastChild.remove();
        }
    }
}

// Modal Logic
const backdrop = document.createElement('div');
backdrop.id = 'modal-backdrop';
document.body.appendChild(backdrop);

const modal = document.createElement('div');
modal.id = 'edit-modal';
document.body.appendChild(modal);

function closeModal() {
    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
    setTimeout(() => {
        modal.innerHTML = ''; // Clear content
    }, 300);
}

backdrop.addEventListener('click', closeModal);

async function openEditModal(edit) {
    // Populate Initial Content
    const time = new Date(edit.timestamp * 1000 || edit.timestamp).toLocaleTimeString('he-IL');
    const date = new Date(edit.timestamp * 1000 || edit.timestamp).toLocaleDateString('he-IL');
    const user = edit.user || 'אנונימי';
    const title = edit.title || 'ללא כותרת';
    const summary = edit.comment || 'אין תקציר עריכה';
    const rcid = edit.rcid || edit.id;

    // Links
    const diffUrl = edit.revid ? `https://he.wikipedia.org/w/index.php?diff=${edit.revid}` : `https://he.wikipedia.org/wiki/${title}`;
    const isAnon = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(user) || /:/.test(user); // Simple IP check
    const userUrl = `https://he.wikipedia.org/wiki/${isAnon ? 'Special:Contributions' : 'User'}:${user}`;

    // Construct Initial HTML
    modal.innerHTML = `
        <div class="modal-header">
            <div class="modal-info">
                <a href="https://he.wikipedia.org/wiki/${title}" target="_blank" class="modal-title">${title}</a>
                <div class="modal-meta">
                    <span><i class="fa-solid fa-user"></i> <a href="${userUrl}" target="_blank" style="color: inherit; text-decoration: none;">${user}</a></span>
                    <span><i class="fa-solid fa-clock"></i> ${date} ${time}</span>
                </div>
                <div class="modal-summary">"${summary}"</div>
                <div class="modal-actions">
                    <a href="${diffUrl}" target="_blank" class="action-btn primary">
                        <i class="fa-brands fa-wikipedia-w"></i> צפה בויקיפדיה
                    </a>
                    <a href="${userUrl}" target="_blank" class="action-btn secondary">
                        <i class="fa-solid fa-user"></i> דף משתמש
                    </a>
                </div>
            </div>
            <button class="close-btn" onclick="closeModal()"><i class="fa-solid fa-times"></i></button>
        </div>
        <div class="modal-body">
            <div class="diff-loading">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <span>טוען שינויים...</span>
            </div>
        </div>
    `;

    // Show Modal
    backdrop.classList.add('visible');
    modal.classList.add('visible');

    // Fetch Diff
    if (edit.revid) {
        try {
            const response = await fetch(`/api/diff?revid=${edit.revid}`);
            const data = await response.json();
            const modalBody = modal.querySelector('.modal-body');

            if (!data.diff) {
                modalBody.innerHTML = '<div style="text-align:center; padding: 2rem; color: #cbd5e1;">אין שינויים להצגה או לא ניתן לטעון את ההבדלים.</div>';
                return;
            }

            modalBody.innerHTML = `
                <div class="diff-content">
                    <table class="diff">
                        ${data.diff}
                    </table>
                </div>
            `;
        } catch (e) {
            console.error(e);
            const modalBody = modal.querySelector('.modal-body');
            modalBody.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--danger-color);">שגיאה בטעינת הנתונים.</div>';
        }
    } else {
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = '<div style="text-align:center; padding: 2rem; color: #cbd5e1;">זוהי יצירת דף חדש או שאין מידע על שינויים.</div>';
    }
}

// Make globally available for button
window.closeModal = closeModal;


function createEditCard(edit) {
    const div = document.createElement('div');
    div.className = 'edit-card'; // Removed glass-panel to avoid height: 100%
    const rcid = edit.rcid || edit.id;
    div.dataset.rcid = rcid; // Track ID

    // Click Listener for Modal
    div.style.cursor = 'pointer';
    div.addEventListener('click', (e) => {
        // Did we click a link?
        if (e.target.closest('a')) return;
        openEditModal(edit);
    });

    // Handle size diff from stream (length.new/old) or API (newlen/oldlen)
    const sizeDiff = (edit.length ? (edit.length.new || 0) - (edit.length.old || 0) : (edit.newlen || 0) - (edit.oldlen || 0));
    let sizeClass = 'diff-neu';
    let sizeText = sizeDiff > 0 ? `+${sizeDiff}` : `${sizeDiff}`;

    if (sizeDiff > 0) sizeClass = 'diff-pos';
    if (sizeDiff < 0) sizeClass = 'diff-neg';
    if (sizeDiff === 0) sizeText = '0';

    const title = edit.title || 'ללא כותרת';
    const user = edit.user || 'אנונימי';
    const comment = edit.comment ? `(${edit.comment})` : 'אין תקציר עריכה';
    // Handle URL from stream (server_url + revision.new) or API (url or construct it)
    let url = '#';
    if (edit.server_url && edit.revision) {
        url = `${edit.server_url}/w/index.php?diff=${edit.revision.new}`;
    } else if (edit.revid) {
        url = `https://he.wikipedia.org/w/index.php?diff=${edit.revid}`;
    }


    let imageHtml = '';
    if (edit.thumbnail) {
        imageHtml = `<img src="${edit.thumbnail}" class="edit-image" alt="Article Image">`;
    }

    // Swapped order: Image first (Right in RTL), then Content
    div.innerHTML = `
        ${imageHtml}
        <div class="edit-content">
            <div class="edit-header">
                <span>${new Date(edit.timestamp * 1000 || edit.timestamp).toLocaleTimeString('he-IL')}</span>
                <span class="diff-size ${sizeClass}">
                    ${(edit.type === 'new' || (edit.oldlen === 0) || (edit.revision && edit.revision.old === 0)) ? '🆕 ' : ''}${sizeText}
                </span>
            </div>
            <span class="edit-title">${title}</span>
            <div class="edit-summary">${comment}</div>
            <div class="edit-meta">
                <div class="edit-user">
                    <i class="fa-solid fa-user"></i> ${user}
                </div>
            </div>
        </div>
    `;
    return div;
}

// Recent Edits Logic


async function fetchRecentEdits(limit, period, merge = false) {
    if (!merge) {
        feedList.innerHTML = '<div class="empty-state">טוען עריכות אחרונות...</div>';
    }

    try {
        let url = `/api/recent?limit=${limit}&sort=${feedSort.value}`;
        if (period) {
            url += `&period=${period}`;
        }
        if (anonOnlyToggle.checked) {
            url += `&anon_only=true`;
        }
        if (userFilterInput.value.trim()) {
            if (filterMode === 'article') {
                url += `&title=${encodeURIComponent(userFilterInput.value.trim())}`;
            } else {
                url += `&user=${encodeURIComponent(userFilterInput.value.trim())}`;
            }
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (!merge) {
            feedList.innerHTML = '';
            // API returns oldest first usually? Or newest? Recentchanges is usually newest first.
            // We want to append them.
            data.results.forEach(edit => {
                const card = createEditCard(edit);
                feedList.appendChild(card);
            });
        } else {
            // Merge logic
            const existingRcids = new Set();
            document.querySelectorAll('.edit-card').forEach(card => {
                existingRcids.add(parseInt(card.dataset.rcid));
            });

            const newEdits = data.results.filter(edit => !existingRcids.has(edit.rcid));

            // Reverse to prepend in correct order (oldest of new batch first, so newest ends up top)
            for (let i = newEdits.length - 1; i >= 0; i--) {
                const edit = newEdits[i];
                const card = createEditCard(edit);
                card.classList.add('new-edit-animation');
                feedList.insertBefore(card, feedList.firstChild);
            }

            if (!period) {
                while (feedList.children.length > limit) {
                    feedList.removeChild(feedList.lastChild);
                }
            }
        }
    } catch (error) {
        console.error('Error fetching recent edits:', error);
        if (!merge) {
            feedList.innerHTML = '<div class="empty-state">שגיאה בטעינת עריכות.</div>';
        }
        showError('שגיאה בטעינת עריכות אחרונות.');
    }
}

const topViewedPeriodSelect = document.getElementById('topViewedPeriod');

topViewedPeriodSelect.addEventListener('change', () => {
    fetchTopViewedArticles();
});

// Top Viewed Articles Logic
async function fetchTopViewedArticles() {
    const period = topViewedPeriodSelect.value;
    topViewedList.innerHTML = '<div class="empty-state">טוען...</div>';
    try {
        let url = `/api/top-viewed?limit=25&period=${period}&_t=${Date.now()}`;
        if (userFilterInput.value.trim()) {
            if (filterMode === 'article') {
                url += `&title=${encodeURIComponent(userFilterInput.value.trim())}`;
            } else {
                url += `&user=${encodeURIComponent(userFilterInput.value.trim())}`;
            }
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.results.length === 0) {
            topViewedList.innerHTML = '<div class="empty-state">אין נתונים.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        data.results.forEach((article) => {
            const card = createTopViewedCard(article);
            fragment.appendChild(card);
        });

        topViewedList.innerHTML = '';
        topViewedList.appendChild(fragment);

    } catch (error) {
        console.error('Error fetching top viewed articles:', error);
        topViewedList.innerHTML = '<div class="empty-state">שגיאה בטעינת נתונים.</div>';
        showError('שגיאה בטעינת הערכים הנצפים ביותר.');
    }
}

// Initial load
fetchTopViewedArticles();

// Refresh every 10 minutes
setInterval(fetchTopViewedArticles, 600000);

function createTopViewedCard(article) {
    const div = document.createElement('div');
    div.className = 'edit-card';

    let imageHtml = '';
    if (article.thumbnail) {
        imageHtml = `<img src="${article.thumbnail}" class="edit-image" alt="Article Image">`;
    } else {
        imageHtml = `<div class="edit-image" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-color); font-weight: bold;">${article.rank}</div>`;
    }

    div.innerHTML = `
        ${imageHtml}
        <div class="edit-content">
            <div class="edit-header">
                <span class="top-rank-badge" style="font-size: 0.8rem; color: var(--success-color); background: rgba(74, 222, 128, 0.1); padding: 1px 6px; border-radius: 4px;">#${article.rank}</span>
            </div>
            <a href="https://he.wikipedia.org/wiki/${article.title}" target="_blank" class="edit-title">${article.title}</a>
            ${article.description ? `<div style="font-size: 0.85em; color: var(--text-muted); margin-bottom: 4px;">${article.description}</div>` : ''}
            <div class="edit-summary">
                <i class="fa-solid fa-eye"></i> ${article.views.toLocaleString()} צפיות
            </div>
        </div>
    `;
    return div;
}

// Initial load
fetchTopViewedArticles();

// Refresh every 10 minutes
setInterval(fetchTopViewedArticles, 600000);

// Auto Refresh Logic
let autoRefreshInterval;

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        // Only refresh if we are not in "custom" mode (unless we want to refresh custom too, but let's stick to standard)
        // Actually, just refresh whatever is selected.
        const value = limitSelect.value;
        let limit = 50;
        let period = null;

        if (value !== 'custom') {
            if (['1h', '24h', '7d'].includes(value)) {
                period = value;
            } else {
                limit = parseInt(value);
            }
            fetchRecentEdits(limit, period, true); // merge = true
        }
    }, 60000); // 60 seconds
}



// Start
connectWebSocket();
// Top Edited Logic
const topEditedList = document.getElementById('topEditedList');
const topPeriodSelect = document.getElementById('topPeriod');
const topTypeSelect = document.getElementById('topType');

topPeriodSelect.addEventListener('change', () => {
    updateTopSection();
});

topTypeSelect.addEventListener('change', () => {
    updateTopSection();
});

async function updateTopSection() {
    const type = topTypeSelect.value;
    if (type === 'articles') {
        await fetchTopEdited();
    } else {
        await fetchTopEditors();
    }
}

async function fetchTopEdited() {
    const topList = document.getElementById('topEditedList');
    const period = document.getElementById('topPeriod').value;
    topList.innerHTML = '<div class="empty-state">טוען...</div>';

    try {
        let url = `/api/top-edited?limit=25&period=${period}&anon_only=${anonOnlyToggle.checked}`;
        if (userFilterInput.value.trim()) {
            if (filterMode === 'article') {
                url += `&title=${encodeURIComponent(userFilterInput.value.trim())}`;
            } else {
                url += `&user=${encodeURIComponent(userFilterInput.value.trim())}`;
            }
        }
        const response = await fetch(url);
        const data = await response.json();

        if (data.results.length === 0) {
            topList.innerHTML = '<div class="empty-state">אין נתונים.</div>';
            return;
        }

        // Optimization: Use DocumentFragment
        const fragment = document.createDocumentFragment();
        data.results.forEach((article, index) => {
            const card = createTopArticleCard(article, index + 1);
            fragment.appendChild(card);
        });

        topList.innerHTML = '';
        topList.appendChild(fragment);

    } catch (error) {
        console.error('Error fetching top edited:', error);
        topList.innerHTML = '<div class="empty-state">שגיאה בטעינת נתונים.</div>';
    }
}

async function fetchTopEditors() {
    const topList = document.getElementById('topEditedList');
    const period = document.getElementById('topPeriod').value;
    topList.innerHTML = '<div class="empty-state">טוען...</div>';

    try {
        let url = `/api/top-editors?limit=25&period=${period}&anon_only=${anonOnlyToggle.checked}`;
        if (userFilterInput.value.trim()) {
            if (filterMode === 'article') {
                url += `&title=${encodeURIComponent(userFilterInput.value.trim())}`;
            } else {
                url += `&user=${encodeURIComponent(userFilterInput.value.trim())}`;
            }
        }
        const response = await fetch(url);
        const data = await response.json();

        if (data.results.length === 0) {
            topList.innerHTML = '<div class="empty-state">אין נתונים.</div>';
            return;
        }

        // Optimization: Use DocumentFragment
        const fragment = document.createDocumentFragment();
        data.results.forEach((user, index) => {
            const card = createTopUserCard(user, index + 1);
            fragment.appendChild(card);
        });

        topList.innerHTML = '';
        topList.appendChild(fragment);

    } catch (error) {
        console.error('Error fetching top editors:', error);
        topList.innerHTML = '<div class="empty-state">שגיאה בטעינת נתונים.</div>';
    }
}

function createTopArticleCard(article, rank) {
    const div = document.createElement('div');
    div.className = 'edit-card'; // Use edit-card class directly

    let imageHtml = '';
    if (article.thumbnail) {
        imageHtml = `<img src="${article.thumbnail}" class="edit-image" alt="Article Image">`;
    } else {
        imageHtml = `<div class="edit-image" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-color); font-weight: bold;">${rank}</div>`;
    }

    // Calculate time ago
    let lastEditHtml = '';
    if (article.last_timestamp) {
        const now = new Date();
        const editDate = new Date(article.last_timestamp);
        const diffMs = now - editDate;
        const diffMins = Math.floor(diffMs / 60000);

        let timeAgo = '';
        if (diffMins < 1) {
            timeAgo = 'כעת';
        } else if (diffMins < 60) {
            timeAgo = `לפני ${diffMins} דקות`;
        } else if (diffMins < 1440) {
            const hours = Math.floor(diffMins / 60);
            timeAgo = hours === 2 ? 'לפני שעתיים' : `לפני ${hours} שעות`;
        } else {
            const days = Math.floor(diffMins / 1440);
            timeAgo = days === 2 ? 'לפני יומיים' : `לפני ${days} ימים`;
        }

        console.log('Article last_user:', article.last_user, 'Type:', typeof article.last_user);
        const rawUser = article.last_user || '';
        const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(rawUser.trim());
        const displayUser = (!rawUser.trim() || isIp) ? 'אנונימי' : rawUser.trim();
        lastEditHtml = `<div class="edit-summary"><i class="fa-solid fa-pen"></i> ${timeAgo} על ידי <strong>${displayUser}</strong></div>`;
    }

    div.innerHTML = `
        ${imageHtml}
        <div class="edit-content">
            <div class="edit-header">
                <span class="top-rank-badge" style="font-size: 0.8rem; color: var(--success-color); background: rgba(74, 222, 128, 0.1); padding: 1px 6px; border-radius: 4px;">#${rank}</span>
            </div>
            <a href="https://he.wikipedia.org/wiki/${article.title}" target="_blank" class="edit-title">${article.title}</a>
            ${article.active_section ? `<div class="active-discussion" style="font-size: 0.85em; color: var(--text-muted); margin-top: 2px; font-style: italic;"><i class="fa-solid fa-paragraph" style="font-size: 0.8em;"></i> ${article.active_section}</div>` : ''}
            <div class="edit-summary">
                <i class="fa-solid fa-users"></i> ${article.count} עורכים שונים
            </div>
            ${lastEditHtml}
        </div>
    `;
    return div;
}

function createTopUserCard(user, rank) {
    const div = document.createElement('div');
    div.className = 'edit-card';

    // User avatar placeholder
    const imageHtml = `<div class="edit-image" style="background: rgba(56, 189, 248, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-color); font-size: 1.2rem;"><i class="fa-solid fa-user"></i></div>`;

    div.innerHTML = `
        ${imageHtml}
        <div class="edit-content">
            <div class="edit-header">
                <span class="top-rank-badge" style="font-size: 0.8rem; color: var(--success-color); background: rgba(74, 222, 128, 0.1); padding: 1px 6px; border-radius: 4px;">#${rank}</span>
            </div>
            <a href="https://he.wikipedia.org/wiki/User:${user.user}" target="_blank" class="edit-title">${user.user}</a>
            <div class="edit-summary">
                <i class="fa-solid fa-pen"></i> ${user.count} עריכות
            </div>
        </div>
    `;
    return div;
}

// Initial load
fetchRecentEdits(50);
fetchTopEdited();
startAutoRefresh();

// Refresh top edited every 30 seconds
setInterval(updateTopSection, 30000);

// Top Talk Pages Logic
const topTalkList = document.getElementById('topTalkList');
const topTalkPeriodSelect = document.getElementById('topTalkPeriod');

topTalkPeriodSelect.addEventListener('change', () => {
    fetchTopTalkPages();
});

async function fetchTopTalkPages() {
    const period = topTalkPeriodSelect.value;
    topTalkList.innerHTML = '<div class="empty-state">טוען...</div>';

    try {
        let url = `/api/top-talk-pages?limit=25&period=${period}&anon_only=${anonOnlyToggle.checked}`;
        if (userFilterInput.value.trim()) {
            if (filterMode === 'article') {
                url += `&title=${encodeURIComponent(userFilterInput.value.trim())}`;
            } else {
                url += `&user=${encodeURIComponent(userFilterInput.value.trim())}`;
            }
        }
        const response = await fetch(url);
        const data = await response.json();

        if (data.results.length === 0) {
            topTalkList.innerHTML = '<div class="empty-state">אין נתונים.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        data.results.forEach((article, index) => {
            const card = createTopTalkCard(article, index + 1);
            fragment.appendChild(card);
        });

        topTalkList.innerHTML = '';
        topTalkList.appendChild(fragment);

    } catch (error) {
        console.error('Error fetching top talk pages:', error);
        topTalkList.innerHTML = '<div class="empty-state">שגיאה בטעינת נתונים.</div>';
    }
}

function createTopTalkCard(article, rank) {
    const div = document.createElement('div');
    div.className = 'edit-card';

    let imageHtml = '';
    if (article.thumbnail) {
        imageHtml = `<img src="${article.thumbnail}" class="edit-image" alt="Article Image">`;
    } else {
        imageHtml = `<div class="edit-image" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-color); font-weight: bold;">${rank}</div>`;
    }

    let fireIcon = '';
    if (article.count > 10) {
        fireIcon = `<i class="fa-solid fa-fire fire-icon" title="ערך חם (מעל 10 עורכים)"></i>`;
    }

    let discussionHtml = '';
    if (article.active_discussion) {
        let text = article.active_discussion;
        if (text.includes('שחזור')) {
            text = '<strong>דיון שחזור</strong>';
        } else if (text.includes('חשיבות')) {
            text = '<strong>דיון חשיבות</strong>';
        } else if (text.includes('איחוד')) {
            text = '<strong>דיון איחוד</strong>';
        } else if (text.includes('שם')) {
            text = '<strong>שינוי שם</strong>';
        }
        discussionHtml = `<div class="active-discussion" style="font-size: 0.85em; color: var(--text-muted); margin-top: 2px;">${text}</div>`;
    }

    // Calculate time ago
    let lastEditHtml = '';
    if (article.last_timestamp) {
        const now = new Date();
        const editDate = new Date(article.last_timestamp);
        const diffMs = now - editDate;
        const diffMins = Math.floor(diffMs / 60000);

        let timeAgo = '';
        if (diffMins < 1) {
            timeAgo = 'כעת';
        } else if (diffMins < 60) {
            timeAgo = `לפני ${diffMins} דקות`;
        } else if (diffMins < 1440) {
            const hours = Math.floor(diffMins / 60);
            timeAgo = hours === 2 ? 'לפני שעתיים' : `לפני ${hours} שעות`;
        } else {
            const days = Math.floor(diffMins / 1440);
            timeAgo = days === 2 ? 'לפני יומיים' : `לפני ${days} ימים`;
        }

        const rawUser = article.last_user || '';
        const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(rawUser.trim());
        const displayUser = (!rawUser.trim() || isIp) ? 'אנונימי' : rawUser.trim();
        lastEditHtml = `<div class="edit-summary"><i class="fa-solid fa-comment"></i> ${timeAgo} על ידי <strong>${displayUser}</strong></div>`;
    }

    div.innerHTML = `
        ${imageHtml}
        <div class="edit-content">
            <div class="edit-header">
                <div>
                    <span class="top-rank-badge" style="font-size: 0.8rem; color: var(--success-color); background: rgba(74, 222, 128, 0.1); padding: 1px 6px; border-radius: 4px;">#${rank}</span>
                    ${fireIcon}
                </div>
            </div>
            <a href="https://he.wikipedia.org/wiki/${article.title}" target="_blank" class="edit-title">${article.title}</a>
            ${discussionHtml}
            <div class="edit-summary">
                <i class="fa-solid fa-users"></i> ${article.count} עורכים שונים
            </div>
            ${lastEditHtml}
        </div>
    `;
    return div;
}

// Initial load
fetchTopTalkPages();

// Refresh every 60 seconds
setInterval(fetchTopTalkPages, 60000);

// New Articles Logic
const newArticlesList = document.getElementById('newArticlesList');
const newPeriodSelect = document.getElementById('newPeriod');

newPeriodSelect.addEventListener('change', () => {
    fetchNewArticles();
});

async function fetchNewArticles() {
    const period = newPeriodSelect.value;
    newArticlesList.innerHTML = '<div class="empty-state">טוען...</div>';
    const limit = period === '7d' ? 100 : 25;

    try {
        let url = `/api/new-articles?limit=${limit}&period=${period}&anon_only=${anonOnlyToggle.checked}`;
        if (userFilterInput.value.trim()) {
            if (filterMode === 'article') {
                url += `&title=${encodeURIComponent(userFilterInput.value.trim())}`;
            } else {
                url += `&user=${encodeURIComponent(userFilterInput.value.trim())}`;
            }
        }
        const response = await fetch(url);
        const data = await response.json();

        if (data.results.length === 0) {
            newArticlesList.innerHTML = '<div class="empty-state">אין נתונים.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        data.results.forEach((article) => {
            const card = createNewArticleCard(article);
            fragment.appendChild(card);
        });

        newArticlesList.innerHTML = '';
        newArticlesList.appendChild(fragment);

    } catch (error) {
        console.error('Error fetching new articles:', error);
        newArticlesList.innerHTML = '<div class="empty-state">שגיאה בטעינת נתונים.</div>';
    }
}

function createNewArticleCard(article) {
    const div = document.createElement('div');
    div.className = 'edit-card';

    let imageHtml = '';
    if (article.thumbnail) {
        imageHtml = `<img src="${article.thumbnail}" class="edit-image" alt="Article Image">`;
    } else {
        imageHtml = `<div class="edit-image" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-color); font-size: 1.2rem;"><i class="fa-solid fa-file-alt"></i></div>`;
    }

    const user = article.user || 'אנונימי';
    const timestamp = new Date(article.timestamp).toLocaleString('he-IL');

    div.innerHTML = `
        ${imageHtml}
        <div class="edit-content">
            <div class="edit-header">
                <span>${timestamp}</span>
                <span class="diff-size diff-pos">חדש</span>
            </div>
            <a href="https://he.wikipedia.org/wiki/${article.title}" target="_blank" class="edit-title">${article.title}</a>
            <div class="edit-meta">
                <div class="edit-user">
                    <i class="fa-solid fa-user"></i> ${user}
                </div>
            </div>
        </div>
    `;
    return div;
}

// Initial load for new articles
fetchNewArticles();

// Refresh new articles every 60 seconds
setInterval(fetchNewArticles, 60000);
