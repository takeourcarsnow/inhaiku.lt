// History Manager Class
class HistoryManager {
    constructor(maxItems = 50) {
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
    }

    saveHistory() {
        try {
            localStorage.setItem('haikuHistory', JSON.stringify(this.history));
        } catch (e) {
            console.error('Error saving history:', e);
        }
    }

    getHistory() {
        return this.history;
    }
}

// Initialize History Manager
const historyManager = new HistoryManager();

// Theme handling
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

// Main haiku fetching function
async function getNewHaiku(retryCount = 0) {
    const headlineEl = document.getElementById('headline');
    const haikuEl = document.getElementById('haiku');
    
    try {
        headlineEl.innerHTML = 'Kraunama...';
        haikuEl.innerHTML = '';
        headlineEl.classList.add('loading', 'skeleton');
        haikuEl.classList.add('skeleton');

        const response = await fetch('/api/haiku', {
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            timeout: 10000
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
        
        if (retryCount < 3) {
            headlineEl.textContent = `Bandoma dar kartą... (${retryCount + 1}/3)`;
            setTimeout(() => getNewHaiku(retryCount + 1), 1500);
        } else {
            handleError(error, headlineEl);
        }
    }
}

// Typing animation
function typeTextWithPromise(element, text) {
    return new Promise((resolve) => {
        element.textContent = '';
        let i = 0;
        const speed = 50;
        const variance = 20;

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

// Error handling
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

// Sharing functionality
function shareContent(platform) {
    const headline = document.getElementById('headline').textContent;
    const haiku = document.getElementById('haiku').textContent;
    const text = `${headline}\n\n${haiku}\n\n🤖 Sugeneravo Lietuviškų Naujienų Haiku`;
    const url = encodeURIComponent(window.location.href);

    if (navigator.share && platform === 'native') {
        navigator.share({
            title: 'Lietuviškų Naujienų Haiku',
            text: text,
            url: window.location.href
        }).catch(console.error);
        return;
    }

    const shareUrls = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`
    };

    if (shareUrls[platform]) {
        window.open(shareUrls[platform], '_blank', 'noopener,noreferrer');
    }
}

// Copy functionality
async function copyToClipboard() {
    const headline = document.getElementById('headline').textContent;
    const haiku = document.getElementById('haiku').textContent;
    const text = `${headline}\n\n${haiku}\n\n🤖 Sugeneravo Lietuviškų Naujienų Haiku`;
    
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Nukopijuota!');
    } catch (err) {
        showNotification('Nepavyko nukopijuoti', 'error');
    }
}

// History display functions
function showHistory() {
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) {
        updateHistoryDisplay();
        historyContainer.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) {
        historyContainer.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    historyList.innerHTML = '';
    
    historyManager.getHistory().forEach((item) => {
        const date = new Date(item.timestamp).toLocaleString('lt-LT');
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div style="font-weight: bold;">${item.headline}</div>
            <div style="white-space: pre-line; margin: 10px 0;">${item.haiku}</div>
            <div style="font-size: 0.8em;">${date}</div>
        `;
        historyList.appendChild(historyItem);
    });
}

// Notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Update meta tags
function updateMetaTags(headline, haiku) {
    const metaTags = {
        'og:title': 'Lietuviškų Naujienų Haiku',
        'og:description': `${headline}\n${haiku}`,
        'twitter:title': 'Lietuviškų Naujienų Haiku',
        'twitter:description': `${headline}\n${haiku}`
    };

    Object.entries(metaTags).forEach(([property, content]) => {
        const meta = document.querySelector(`meta[property="${property}"]`);
        if (meta) meta.setAttribute('content', content);
    });
}

// Clock update
function updateDateTime() {
    const now = new Date();
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('clock').textContent = `${hours}:${minutes}`;
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    document.getElementById('date').textContent = `${year}-${month}-${day}`;
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Add click event listeners
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');
            if (!action) return;

            switch (action) {
                case 'new-haiku': getNewHaiku(); break;
                case 'share-twitter': shareContent('twitter'); break;
                case 'share-facebook': shareContent('facebook'); break;
                case 'show-history': showHistory(); break;
                case 'toggle-theme': toggleTheme(); break;
                case 'copy': copyToClipboard(); break;
                case 'close-modal': closeModal(); break;
            }
        });
    });

    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    // Start clock and get first haiku
    setInterval(updateDateTime, 1000);
    updateDateTime();
    getNewHaiku();
});