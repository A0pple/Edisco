const feedList = document.getElementById('feedList');
const topViewedList = document.getElementById('topViewedList');
const limitSelect = document.getElementById('limitSelect');
const anonOnlyToggle = document.getElementById('anonOnlyToggle');
const globalPeriodSelect = document.getElementById('globalPeriod');

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

    // Trigger refresh
    const limit = parseInt(limitSelect.value) || 50;
    fetchRecentEdits(limit, period);
    updateTopSection();
    fetchNewArticles();
    fetchTopViewedArticles();
    fetchTopTalkPages();
});

anonOnlyToggle.addEventListener('change', () => {
    // Refresh all data
    const limit = parseInt(limitSelect.value) || 50;
    const period = ['1h', '24h', '7d'].includes(limitSelect.value) ? limitSelect.value : null;

    fetchRecentEdits(limit, period);
    updateTopSection();
    fetchNewArticles();
    fetchTopViewedArticles(); // Top viewed usually doesn't have anon filter in API but good to refresh
    fetchTopTalkPages();
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
    if (!isNaN(limit) && feedList.children.length > limit) {
        feedList.lastChild.remove();
    }
}

function createEditCard(edit) {
    const div = document.createElement('div');
    div.className = 'edit-card'; // Removed glass-panel to avoid height: 100%
    const rcid = edit.rcid || edit.id;
    div.dataset.rcid = rcid; // Track ID

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
                <span class="diff-size ${sizeClass}">${sizeText}</span>
            </div>
            <a href="${url}" target="_blank" class="edit-title">${title}</a>
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
limitSelect.addEventListener('change', async () => {
    let value = limitSelect.value;
    let limit = 50;
    let period = null;

    if (value === 'custom') {
        const custom = prompt("הכנס מספר עריכות להצגה (מקסימום 500):", "50");
        if (custom && !isNaN(custom)) {
            limit = Math.min(parseInt(custom), 500);
        } else {
            limitSelect.value = "50"; // Reset
            return;
        }
    } else if (['1h', '24h', '7d'].includes(value)) {
        period = value;
    } else {
        limit = parseInt(value);
    }

    await fetchRecentEdits(limit, period);
});

async function fetchRecentEdits(limit, period, merge = false) {
    if (!merge) {
        feedList.innerHTML = '<div class="empty-state">טוען עריכות אחרונות...</div>';
    }

    try {
        let url = `/api/recent?limit=${limit}`;
        if (period) {
            url += `&period=${period}`;
        }
        if (anonOnlyToggle.checked) {
            url += `&anon_only=true`;
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
        const response = await fetch(`/api/top-viewed?limit=25&period=${period}&_t=${Date.now()}`);
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
        const response = await fetch(`/api/top-edited?limit=25&period=${period}&anon_only=${anonOnlyToggle.checked}`);
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
        const response = await fetch(`/api/top-editors?limit=25&period=${period}&anon_only=${anonOnlyToggle.checked}`);
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

    div.innerHTML = `
        ${imageHtml}
        <div class="edit-content">
            <div class="edit-header">
                <span class="top-rank-badge" style="font-size: 0.8rem; color: var(--success-color); background: rgba(74, 222, 128, 0.1); padding: 1px 6px; border-radius: 4px;">#${rank}</span>
            </div>
            <a href="https://he.wikipedia.org/wiki/${article.title}" target="_blank" class="edit-title">${article.title}</a>
            <div class="edit-summary">
                <i class="fa-solid fa-users"></i> ${article.count} עורכים שונים
            </div>
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
        const response = await fetch(`/api/top-talk-pages?limit=25&period=${period}&anon_only=${anonOnlyToggle.checked}`);
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

    div.innerHTML = `
        ${imageHtml}
        <div class="edit-content">
            <div class="edit-header">
                <span class="top-rank-badge" style="font-size: 0.8rem; color: var(--success-color); background: rgba(74, 222, 128, 0.1); padding: 1px 6px; border-radius: 4px;">#${rank}</span>
            </div>
            <a href="https://he.wikipedia.org/wiki/${article.title}" target="_blank" class="edit-title">${article.title}</a>
            <div class="edit-summary">
                <i class="fa-solid fa-users"></i> ${article.count} עורכים שונים
            </div>
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
        const response = await fetch(`/api/new-articles?limit=${limit}&period=${period}&anon_only=${anonOnlyToggle.checked}`);
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
