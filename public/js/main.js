// Performance optimization: Use constants for frequently accessed elements
const DOM = {
    headline: document.getElementById('headline'),
    haiku: document.getElementById('haiku'),
    clock: document.getElementById('clock'),
    date: document.getElementById('date'),
    sourceIndicator: document.getElementById('source-indicator'),
    historyContainer: document.getElementById('historyContainer'),
    historyList: document.getElementById('historyList'),
    favoritesContainer: document.getElementById('favoritesContainer'),
    favoritesList: document.getElementById('favoritesList'),
    favoriteButton: document.querySelector('.favorite-button'),
    generateButton: document.querySelector('[data-action="new-haiku"]')
};

// History Manager Class
class HistoryManager {
    constructor(maxItems = 50) {
        this.maxItems = maxItems;
        this.history = this.loadHistory();
        this.storageKey = 'haikuHistory';
    }

    loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || [];
        } catch (e) {
            console.error('Error loading history:', e);
            return [];
        }
    }

    addItem(headline, haiku, source) {
        const item = {
            headline,
            haiku,
            source,
            timestamp: new Date().toISOString()
        };

        this.history.unshift(item);
        
        if (this.history.length > this.maxItems) {
            this.history.length = this.maxItems;
        }

        this.saveHistory();
    }

    saveHistory() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        } catch (e) {
            console.error('Error saving history:', e);
            this.history.length = Math.floor(this.maxItems / 2);
            localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        }
    }

    getHistory() {
        return this.history;
    }

    formatDate(timestamp) {
        return new Date(timestamp).toLocaleString('lt-LT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// Favorites Manager Class
class FavoritesManager {
    constructor() {
        this.favorites = this.loadFavorites();
        this.storageKey = 'haikuFavorites';
    }

    loadFavorites() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || [];
        } catch (e) {
            console.error('Error loading favorites:', e);
            return [];
        }
    }

    addFavorite(headline, haiku, source) {
        const favorite = {
            headline,
            haiku,
            source,
            timestamp: new Date().toISOString()
        };
        this.favorites.unshift(favorite);
        this.saveFavorites();
        this.updateFavoriteButton(true);
    }

    removeFavorite(index) {
        this.favorites.splice(index, 1);
        this.saveFavorites();
        this.updateFavoriteButton(false);
    }

    isFavorite(headline, haiku) {
        return this.favorites.some(fav => 
            fav.headline === headline && fav.haiku === haiku);
    }

    saveFavorites() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.favorites));
        } catch (e) {
            console.error('Error saving favorites:', e);
        }
    }

    updateFavoriteButton(isFavorite) {
        if (DOM.favoriteButton) {
            DOM.favoriteButton.textContent = isFavorite ? '❤️ Pamėgta' : '🤍 Pamėgti';
            DOM.favoriteButton.classList.toggle('active', isFavorite);
        }
    }
}

// Initialize managers
const historyManager = new HistoryManager();
const favoritesManager = new FavoritesManager();

// Theme handling
const themeManager = {
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    },

    toggleTheme() {
        const currentTheme = localStorage.getItem('theme') || 'dark';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    },

    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.setTheme(savedTheme);
    }
};

// Haiku fetching with error handling
async function getNewHaiku() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        if (DOM.generateButton) {
            DOM.generateButton.disabled = true;
        }
        
        DOM.headline.innerHTML = 'Kraunama...';
        DOM.haiku.innerHTML = '';
        DOM.headline.classList.add('loading', 'skeleton');
        DOM.haiku.classList.add('skeleton');

        const response = await fetch('/api/haiku', {
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.headline || !data.haiku || !data.source) {
            throw new Error('Invalid data received');
        }

        DOM.headline.classList.remove('loading', 'skeleton');
        DOM.haiku.classList.remove('skeleton');
        
        await typeTextWithPromise(DOM.headline, data.headline);
        await typeTextWithPromise(DOM.haiku, data.haiku);
        
        DOM.sourceIndicator.textContent = `Šaltinis: ${data.source}`;
        
        historyManager.addItem(data.headline, data.haiku, data.source);
        updateMetaTags(data.headline, data.haiku);
        
        favoritesManager.updateFavoriteButton(
            favoritesManager.isFavorite(data.headline, data.haiku)
        );

    } catch (error) {
        clearTimeout(timeout);
        console.error('Error:', error);
        DOM.headline.classList.remove('loading', 'skeleton');
        DOM.haiku.classList.remove('skeleton');
        handleError(error, DOM.headline);
    } finally {
        if (DOM.generateButton) {
            DOM.generateButton.disabled = false;
        }
    }
}

// Typing animation with performance optimization
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
                setTimeout(() => requestAnimationFrame(typeNextChar), 
                    speed + Math.random() * variance);
            } else {
                resolve();
            }
        }

        requestAnimationFrame(typeNextChar);
    });
}

// UI Managers
const uiManager = {
    showHistory() {
        this.updateHistoryDisplay();
        DOM.historyContainer.style.display = 'block';
        document.body.style.overflow = 'hidden';
    },

    showFavorites() {
        this.updateFavoritesDisplay();
        DOM.favoritesContainer.style.display = 'block';
        document.body.style.overflow = 'hidden';
    },

    closeModals() {
        DOM.historyContainer.style.display = 'none';
        DOM.favoritesContainer.style.display = 'none';
        document.body.style.overflow = 'auto';
    },

    updateHistoryDisplay() {
        if (!DOM.historyList) return;

        const fragment = document.createDocumentFragment();
        
        historyManager.getHistory().forEach((item, index) => {
            const historyItem = this.createHistoryItem(item, index);
            fragment.appendChild(historyItem);
        });

        DOM.historyList.innerHTML = '';
        DOM.historyList.appendChild(fragment);
    },

    updateFavoritesDisplay() {
        if (!DOM.favoritesList) return;

        const fragment = document.createDocumentFragment();
        
        favoritesManager.favorites.forEach((item, index) => {
            const favoriteItem = this.createFavoriteItem(item, index);
            fragment.appendChild(favoriteItem);
        });

        DOM.favoritesList.innerHTML = '';
        DOM.favoritesList.appendChild(fragment);
    },

    createHistoryItem(item, index) {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div class="item-header">
                <span class="item-source">${item.source}</span>
                <span class="item-date">${historyManager.formatDate(item.timestamp)}</span>
            </div>
            <div class="item-headline">${item.headline}</div>
            <div class="item-haiku">${item.haiku}</div>
            <div class="item-actions">
                <button onclick="favoritesManager.addFavorite('${item.headline}', '${item.haiku}', '${item.source}')" 
                        class="social-button">
                    ⭐ Pamėgti
                </button>
            </div>
        `;
        return div;
    },

    createFavoriteItem(item, index) {
        const div = document.createElement('div');
        div.className = 'favorite-item';
        div.innerHTML = `
            <div class="item-header">
                <span class="item-source">${item.source}</span>
                <span class="item-date">${historyManager.formatDate(item.timestamp)}</span>
            </div>
            <div class="item-headline">${item.headline}</div>
            <div class="item-haiku">${item.haiku}</div>
            <div class="item-actions">
                <button onclick="favoritesManager.removeFavorite(${index})" 
                        class="social-button">
                    🗑️ Pašalinti
                </button>
            </div>
        `;
        return div;
    }
};

// Sharing functionality
async function shareContent(platform) {
    const text = `${DOM.headline.textContent}\n\n${DOM.haiku.textContent}\n\n🤖 Sugeneravo Lietuviškų Naujienų Haiku`;
    const url = encodeURIComponent(window.location.href);

    if (navigator.share && platform === 'native') {
        try {
            await navigator.share({
                title: 'Lietuviškų Naujienų Haiku',
                text: text,
                url: window.location.href
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
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

// Clipboard functionality
async function copyToClipboard() {
    const text = `${DOM.headline.textContent}\n\n${DOM.haiku.textContent}\n\n🤖 Sugeneravo Lietuviškų Naujienų Haiku`;
    
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Nukopijuota!');
    } catch (err) {
        showNotification('Nepavyko nukopijuoti', 'error');
    }
}

// Notification system
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Clock update with performance optimization
function updateDateTime() {
    const now = new Date();
    
    DOM.clock.textContent = now.toLocaleTimeString('lt-LT', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    DOM.date.textContent = now.toLocaleDateString('lt-LT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    requestAnimationFrame(() => {
        setTimeout(updateDateTime, 1000);
    });
}

// Error handling
function handleError(error, element) {
    const errorMessage = error.message === 'Failed to fetch' || error.name === 'AbortError'
        ? 'Nepavyko prisijungti prie serverio. Bandykite vėliau.'
        : 'Nepavyko sugeneruoti haiku. Bandykite dar kartą.';
    
    element.textContent = errorMessage;
    showNotification(errorMessage, 'error');
}

// Event delegation
document.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const actions = {
        'new-haiku': () => getNewHaiku(),
        'share-twitter': () => shareContent('twitter'),
        'share-facebook': () => shareContent('facebook'),
        'show-history': () => uiManager.showHistory(),
        'toggle-favorites': () => uiManager.showFavorites(),
        'toggle-theme': () => themeManager.toggleTheme(),
        'copy': () => copyToClipboard(),
        'close-modal': () => uiManager.closeModals(),
        'favorite-current': () => {
            const headline = DOM.headline.textContent;
            const haiku = DOM.haiku.textContent;
            const source = DOM.sourceIndicator.textContent.replace('Šaltinis: ', '');
            
            if (favoritesManager.isFavorite(headline, haiku)) {
                const index = favoritesManager.favorites.findIndex(
                    fav => fav.headline === headline && fav.haiku === haiku
                );
                if (index !== -1) {
                    favoritesManager.removeFavorite(index);
                }
            } else {
                favoritesManager.addFavorite(headline, haiku, source);
            }
        }
    };

    const action = target.getAttribute('data-action');
    if (actions[action]) {
        await actions[action]();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        uiManager.closeModals();
    } else if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        getNewHaiku();
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    themeManager.initTheme();
    updateDateTime();
    getNewHaiku(); // Initial load
});

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

// Meta tags update function
function updateMetaTags(headline, haiku) {
    const metaDescription = document.querySelector('meta[name="description"]');
    const metaOgDescription = document.querySelector('meta[property="og:description"]');
    const metaTwitterDescription = document.querySelector('meta[name="twitter:description"]');
    
    const description = `${headline} - ${haiku}`;
    
    if (metaDescription) metaDescription.setAttribute('content', description);
    if (metaOgDescription) metaOgDescription.setAttribute('content', description);
    if (metaTwitterDescription) metaTwitterDescription.setAttribute('content', description);
}