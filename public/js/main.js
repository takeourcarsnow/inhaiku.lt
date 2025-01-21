// Constants
const CONFIG = {
    HISTORY_MAX_ITEMS: 50,
    TYPING_SPEED: 50,
    TYPING_VARIANCE: 20,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1500,
    NOTIFICATION_DURATION: 3000
};

// History Manager Class
class HistoryManager {
    constructor(maxItems = CONFIG.HISTORY_MAX_ITEMS) {
        this.maxItems = maxItems;
        this.history = this.loadHistory();
    }

    loadHistory() {
        try {
            return JSON.parse(localStorage.getItem('haikuHistory')) || [];
        } catch (e) {
            console.error('Error loading history:', e);
            return [];
        }
    }

    addItem(headline, haiku) {
        try {
            const item = {
                headline,
                haiku,
                timestamp: new Date().toISOString()
            };

            this.history.unshift(item);
            if (this.history.length > this.maxItems) {
                this.history = this.history.slice(0, this.maxItems);
            }

            this.saveHistory();
        } catch (error) {
            console.error('Error adding history item:', error);
        }
    }

    saveHistory() {
        try {
            localStorage.setItem('haikuHistory', JSON.stringify(this.history));
        } catch (error) {
            console.error('Error saving history:', error);
            // Try to clear some space if storage is full
            if (error.name === 'QuotaExceededError') {
                this.history = this.history.slice(0, Math.floor(this.maxItems / 2));
                this.saveHistory();
            }
        }
    }

    getHistory() {
        return this.history;
    }
}

// Initialize History Manager
const historyManager = new HistoryManager();

// DOM Elements cache
const elements = {
    headline: document.getElementById('headline'),
    haiku: document.getElementById('haiku'),
    historyContainer: document.getElementById('historyContainer'),
    historyList: document.getElementById('historyList'),
    clock: document.getElementById('clock'),
    date: document.getElementById('date')
};

// Typing animation with performance optimization
function typeTextWithPromise(element, text) {
    return new Promise((resolve) => {
        element.textContent = '';
        let i = 0;
        const speed = CONFIG.TYPING_SPEED;
        const variance = CONFIG.TYPING_VARIANCE;

        function typeNextChar() {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                setTimeout(typeNextChar, speed + Math.random() * variance);
            } else {
                resolve();
            }
        }

        typeNextChar();
    });
}

// Enhanced error handling
async function getNewHaiku(retryCount = 0) {
    const headlineEl = elements.headline;
    const haikuEl = elements.haiku;
    
    try {
        headlineEl.textContent = 'Kraunama...';
        haikuEl.textContent = '';
        headlineEl.classList.add('loading', 'skeleton');
        haikuEl.classList.add('skeleton');

        const response = await fetch('/api/haiku', {
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.headline || !data.haiku) {
            throw new Error('Invalid data received');
        }

        headlineEl.classList.remove('loading', 'skeleton');
        haikuEl.classList.remove('skeleton');
        
        await typeTextWithPromise(headlineEl, data.headline);
        await typeTextWithPromise(haikuEl, data.haiku);
        
        historyManager.addItem(data.headline, data.haiku);
        updateMetaTags(data.headline, data.haiku);

    } catch (error) {
        console.error('Error:', error);
        headlineEl.classList.remove('loading', 'skeleton');
        haikuEl.classList.remove('skeleton');
        
        if (retryCount < CONFIG.RETRY_ATTEMPTS) {
            headlineEl.textContent = `Bandoma dar kartą... (${retryCount + 1}/3)`;
            setTimeout(() => getNewHaiku(retryCount + 1), CONFIG.RETRY_DELAY);
        } else {
            handleError(error, headlineEl);
        }
    }
}

// Error handling with retry option
function handleError(error, element) {
    element.classList.add('error-state');
    element.textContent = 'Įvyko klaida. Bandykite dar kartą.';
    
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Bandyti dar kartą';
    retryButton.className = 'retry-button';
    retryButton.onclick = () => {
        element.classList.remove('error-state');
        getNewHaiku();
    };
    element.appendChild(retryButton);
}

// Optimized sharing functionality
async function shareContent(platform) {
    const headline = elements.headline.textContent;
    const haiku = elements.haiku.textContent;
    const text = `${headline}\n\n${haiku}\n\n🤖 Sugeneravo Lietuviškų Naujienų Haiku`;
    const url = window.location.href;

    if (navigator.share && platform === 'native') {
        try {
            await navigator.share({
                title: 'Lietuviškų Naujienų Haiku',
                text,
                url
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Share failed:', error);
            }
        }
        return;
    }

    const shareUrls = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
    };

    if (shareUrls[platform]) {
        window.open(shareUrls[platform], '_blank', 'noopener,noreferrer');
    }
}

// Optimized copy functionality
async function copyToClipboard() {
    const headline = elements.headline.textContent;
    const haiku = elements.haiku.textContent;
    const text = `${headline}\n\n${haiku}\n\n🤖 Sugeneravo Lietuviškų Naujienų Haiku`;
    
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Nukopijuota!');
    } catch (err) {
        console.error('Copy failed:', err);
        showNotification('Nepavyko nukopijuoti', 'error');
    }
}

// Notification system
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, CONFIG.NOTIFICATION_DURATION);
}

// Theme handling
function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// History display
function showHistory() {
    updateHistoryDisplay();
    elements.historyContainer.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    elements.historyContainer.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function updateHistoryDisplay() {
    if (!elements.historyList) return;

    elements.historyList.innerHTML = '';
    historyManager.getHistory().forEach((item) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div style="font-weight: bold;">${item.headline}</div>
            <div style="white-space: pre-line; margin: 10px 0;">${item.haiku}</div>
            <div style="font-size: 0.8em;">
                ${new Date(item.timestamp).toLocaleString('lt-LT')}
            </div>
        `;
        elements.historyList.appendChild(historyItem);
    });
}

// Meta tags update
function updateMetaTags(headline, haiku) {
    const metaTags = {
        'og:title': headline,
        'og:description': haiku,
        'twitter:title': headline,
        'twitter:description': haiku
    };

    Object.entries(metaTags).forEach(([property, content]) => {
        const meta = document.querySelector(`meta[property="${property}"]`);
        if (meta) meta.setAttribute('content', content);
    });
}

// Clock update
function updateDateTime() {
    const now = new Date();
    elements.clock.textContent = now.toLocaleTimeString('lt-LT', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    elements.date.textContent = now.toLocaleDateString('lt-LT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// Event delegation for all button clicks
document.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    const action = button.getAttribute('data-action');
    if (!action) return;

    switch (action) {
        case 'new-haiku': await getNewHaiku(); break;
        case 'share-twitter': shareContent('twitter'); break;
        case 'share-facebook': shareContent('facebook'); break;
        case 'show-history': showHistory(); break;
        case 'close-modal': closeModal(); break;
        case 'toggle-theme': toggleTheme(); break;
        case 'copy': await copyToClipboard(); break;
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setInterval(updateDateTime, 1000);
    updateDateTime();
    getNewHaiku();
});

// Handle offline/online events
window.addEventListener('online', () => {
    showNotification('Interneto ryšys atkurtas');
});

window.addEventListener('offline', () => {
    showNotification('Nėra interneto ryšio', 'error');
});