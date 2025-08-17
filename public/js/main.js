// main.js — English UI, country + category, haiku language selection
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const els = {
    clock: $('#clock'),
    date: $('#date'),
    indicator: $('#source-indicator'),
    headline: $('#headline'),
    haiku: $('#haiku'),
    historyModal: $('#historyContainer'),
    favoritesModal: $('#favoritesContainer'),
    historyList: $('#historyList'),
    favoritesList: $('#favoritesList'),
    favoriteButton: document.querySelector('[data-action="favorite-current"]'),
    categoryRow: $('#categoryRow'),
    countrySelect: $('#countrySelect'),
    langSelect: $('#langSelect'),
  };

  // Countries (code, name, default language)
  const COUNTRIES = [
    ['US','United States','en'], ['GB','United Kingdom','en'], ['IE','Ireland','en'],
    ['CA','Canada','en'], ['AU','Australia','en'], ['NZ','New Zealand','en'],
    ['LT','Lithuania','lt'], ['LV','Latvia','lv'], ['EE','Estonia','et'],
    ['PL','Poland','pl'], ['DE','Germany','de'], ['FR','France','fr'], ['ES','Spain','es'], ['IT','Italy','it'], ['PT','Portugal','pt'], ['NL','Netherlands','nl'],
    ['NO','Norway','no'], ['SE','Sweden','sv'], ['DK','Denmark','da'], ['FI','Finland','fi'],
    ['CZ','Czechia','cs'], ['SK','Slovakia','sk'], ['HU','Hungary','hu'], ['RO','Romania','ro'], ['BG','Bulgaria','bg'], ['GR','Greece','el'],
    ['HR','Croatia','hr'], ['SI','Slovenia','sl'], ['RS','Serbia','sr'],
    ['UA','Ukraine','uk'], ['TR','Türkiye','tr'],
    ['BR','Brazil','pt'], ['MX','Mexico','es'], ['AR','Argentina','es'], ['CL','Chile','es'], ['CO','Colombia','es'], ['PE','Peru','es'],
    ['JP','Japan','ja'], ['KR','South Korea','ko'], ['CN','China','zh-CN'], ['TW','Taiwan','zh-TW'], ['HK','Hong Kong','zh-HK'],
    ['IN','India','en'], ['ZA','South Africa','en']
  ];

  // Languages for haiku override (code → display)
  const LANGS = [
    ['auto','Auto (by country)'],
    ['en','English'], ['lt','Lithuanian'], ['lv','Latvian'], ['et','Estonian'],
    ['pl','Polish'], ['de','German'], ['fr','French'], ['es','Spanish'], ['it','Italian'], ['pt','Portuguese'], ['nl','Dutch'],
    ['no','Norwegian'], ['sv','Swedish'], ['da','Danish'], ['fi','Finnish'],
    ['cs','Czech'], ['sk','Slovak'], ['hu','Hungarian'], ['ro','Romanian'], ['bg','Bulgarian'], ['el','Greek'],
    ['hr','Croatian'], ['sl','Slovene'], ['sr','Serbian'],
    ['uk','Ukrainian'], ['tr','Turkish'],
    ['ja','Japanese'], ['ko','Korean'], ['zh-CN','Chinese (Simpl.)'], ['zh-TW','Chinese (Trad.)'], ['zh-HK','Chinese (HK)']
  ];

  const CATS = [
    { val: 'general', label: 'General' },
    { val: 'business', label: 'Business' },
    { val: 'entertainment', label: 'Entertainment' },
    { val: 'health', label: 'Health' },
    { val: 'science', label: 'Science' },
    { val: 'sports', label: 'Sports' },
    { val: 'technology', label: 'Technology' },
  ];

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  };

  const defaultCountry = () => {
    // Try to guess from browser locale (e.g., en-US -> US)
    const m = (navigator.language || 'en-US').split('-')[1];
    const c = (m || 'US').toUpperCase();
    const found = COUNTRIES.find(([code]) => code === c);
    return found ? c : 'US';
  };

  const state = {
    theme: store.get('nh.theme', (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'),
    sound: store.get('nh.sound', true),
    country: store.get('nh.country', defaultCountry()),
    category: store.get('nh.category', 'general'),
    haikuLang: store.get('nh.lang', 'auto'), // 'auto' or specific code
    headlines: [],
    lastFetchedAt: 0,
    current: null, // {title, source, url}
    currentHaiku: '',
    history: store.get('nh.history', []),
    favorites: store.get('nh.favorites', []),
    typing: false,
    reduceMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  // Apply theme
  document.documentElement.setAttribute('data-theme', state.theme);

  // Time
  function updateClock() {
    const d = new Date();
    els.clock.textContent = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    els.date.textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // Flag emoji from country code
  function flagEmoji(cc) {
    return cc.replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
  }

  // Simple beeper
  let audioCtx;
  function beep(freq = 1200, duration = 0.02, vol = 0.035) {
    if (!state.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + duration);
    } catch {}
  }

  // Typewriter
  async function typeText(el, text, speed = 18) {
    state.typing = true;
    el.classList.remove('skeleton');
    el.textContent = '';
    if (state.reduceMotion) {
      el.textContent = text;
      state.typing = false;
      return;
    }
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    el.appendChild(cursor);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      cursor.insertAdjacentText('beforebegin', ch);
      if (/\S/.test(ch)) beep(1050 + Math.random()*200, 0.012, 0.03);
      await new Promise(r => setTimeout(r, speed));
    }
    cursor.remove();
    state.typing = false;
  }

  // UI helpers
  function toast(msg, timeout = 1500) {
    const n = document.createElement('div');
    n.className = 'notification';
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), timeout);
  }

  function defaultLangForCountry(code) {
    const f = COUNTRIES.find(([c]) => c === code);
    return f ? f[2] : 'en';
  }

  function renderIndicator() {
    const src = state.current?.source || '—';
    const catLabel = CATS.find(c => c.val === state.category)?.label || state.category;
    const countryName = COUNTRIES.find(([c]) => c === state.country)?.[1] || state.country;
    const haikuLang = state.haikuLang === 'auto' ? `${defaultLangForCountry(state.country)} (auto)` : state.haikuLang;
    els.indicator.innerHTML = `Source: <b>${src}</b> • Country: <b>${countryName} ${flagEmoji(state.country)}</b> • Category: <b>${catLabel}</b> • Haiku: <b>${haikuLang}</b>${state.sound ? ' • 🔊' : ' • 🔇'}`;
  }

  function renderCategoryChips() {
    els.categoryRow.innerHTML = CATS.map(c =>
      `<span class="chip ${c.val === state.category ? 'active' : ''}" data-cat="${c.val}">${c.label}</span>`
    ).join('');
    $$('.chip', els.categoryRow).forEach(ch => {
      ch.addEventListener('click', async () => {
        if (state.typing) return;
        // Remove 'active' from all chips
        $$('.chip', els.categoryRow).forEach(c => c.classList.remove('active'));
        // Add 'active' to the clicked chip
        ch.classList.add('active');
        state.category = ch.dataset.cat;
        store.set('nh.category', state.category);
        renderIndicator();
        // refresh headlines in background
        state.headlines = [];
        state.lastFetchedAt = 0;
        await ensureHeadlines();
        toast(`Category: ${CATS.find(x=>x.val===state.category)?.label}`);
      });
    });
  }

  function renderSelectors() {
    // Country select
    els.countrySelect.innerHTML = COUNTRIES.map(([code, name]) => {
      return `<option value="${code}">${name} ${flagEmoji(code)}</option>`;
    }).join('');
    els.countrySelect.value = state.country;

    // Language select
    els.langSelect.innerHTML = LANGS.map(([code, label]) => {
      return `<option value="${code}">${label}</option>`;
    }).join('');
    els.langSelect.value = state.haikuLang;
  }

  // Data
  async function fetchNews(category, country) {
    const r = await fetch(`/api/news?category=${encodeURIComponent(category)}&country=${encodeURIComponent(country)}`);
    if (!r.ok) throw new Error('News fetch failed');
    const data = await r.json();
    return data.headlines || [];
  }

  async function fetchHaiku(headline, langToUse) {
    const r = await fetch('/api/haiku', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headline, lang: langToUse })
    });
    const data = await r.json();
    if (!data.haiku) throw new Error('Haiku generation failed');
    return data.haiku;
  }

  async function ensureHeadlines() {
    const freshForMs = 1000 * 60 * 10; // 10 min
    if (state.headlines.length && (Date.now() - state.lastFetchedAt < freshForMs)) return;
    try {
      setSkeleton(true);
      state.headlines = await fetchNews(state.category, state.country);
      state.lastFetchedAt = Date.now();
    } catch (e) {
      console.warn(e);
      toast('Could not fetch news.');
    } finally {
      setSkeleton(false);
    }
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function setSkeleton(on) {
    els.headline.classList.toggle('skeleton', on);
    els.haiku.classList.toggle('skeleton', on);
  }

  function setFavoriteButtonActive(on) {
    els.favoriteButton.classList.toggle('active', !!on);
    els.favoriteButton.textContent = on ? '💛 Favorited' : '🤍 Favorite';
  }

  function entryKey(entry) {
    return `${entry.title}|${entry.url}|${entry.haiku}`.toLowerCase();
  }

  function isFavorited(entry) {
    const key = entryKey(entry);
    return state.favorites.some(e => entryKey(e) === key);
  }

  // Main action
  async function newHaiku() {
    if (state.typing) return;
    renderIndicator();
    try {
      setSkeleton(true);
      els.headline.textContent = '';
      els.haiku.textContent = '';

      await ensureHeadlines();
      if (!state.headlines.length) {
        els.headline.textContent = 'No headlines right now. Try again.';
        els.haiku.textContent = '';
        return;
      }

      // pick a random headline and generate haiku
      const item = pickRandom(state.headlines);
      state.current = item;
      renderIndicator();

      await typeText(els.headline, item.title, 15);

      const langToUse = state.haikuLang === 'auto' ? defaultLangForCountry(state.country) : state.haikuLang;
      const poem = await fetchHaiku(item.title, langToUse);
      state.currentHaiku = poem;
      await typeText(els.haiku, poem, 24);

      // update favorite button
      const entry = {
        title: item.title,
        source: item.source,
        url: item.url,
        haiku: poem,
        createdAt: new Date().toISOString(),
        country: state.country,
        category: state.category,
        haikuLang: langToUse,
      };
      setFavoriteButtonActive(isFavorited(entry));
      pushHistory(entry);
    } catch (e) {
      console.error(e);
      els.haiku.classList.remove('skeleton');
      els.haiku.classList.add('error-state');
      els.haiku.textContent = 'Could not generate haiku.';
      toast('Oops! Haiku failed.');
    } finally {
      setSkeleton(false);
    }
  }

  function pushHistory(entry) {
    // dedupe by key, keep last 80
    const key = entryKey(entry);
    state.history = [entry, ...state.history.filter(e => entryKey(e) !== key)].slice(0, 80);
    store.set('nh.history', state.history);
  }

  function toggleFavoriteCurrent() {
    if (!state.current || !state.currentHaiku) return;
    const entry = {
      title: state.current.title,
      source: state.current.source,
      url: state.current.url,
      haiku: state.currentHaiku,
      createdAt: new Date().toISOString(),
      country: state.country,
      category: state.category,
      haikuLang: state.haikuLang === 'auto' ? defaultLangForCountry(state.country) : state.haikuLang,
    };
    const key = entryKey(entry);
    if (isFavorited(entry)) {
      state.favorites = state.favorites.filter(e => entryKey(e) !== key);
      setFavoriteButtonActive(false);
      toast('Removed from favorites');
    } else {
      state.favorites = [entry, ...state.favorites].slice(0, 150);
      setFavoriteButtonActive(true);
      toast('Added to favorites');
    }
    store.set('nh.favorites', state.favorites);
  }

  // Modals
  function openModal(el) { el.style.display = 'block'; }
  function closeModals() { els.historyModal.style.display = 'none'; els.favoritesModal.style.display = 'none'; }

  function renderList(container, items, emptyMsg) {
    if (!items.length) {
      container.innerHTML = `<div class="item-header" style="justify-content:center;opacity:.8;">${emptyMsg}</div>`;
      return;
    }
    container.innerHTML = items.map((e, i) => `
      <div class="${container === els.historyList ? 'history-item' : 'favorite-item'}">
        <div class="item-header">
          <span class="item-source">${e.source} • ${e.country} ${flagEmoji(e.country)} • ${e.category} • ${e.haikuLang || ''}</span>
          <span class="item-date">${new Date(e.createdAt).toLocaleString()}</span>
        </div>
        <div class="item-headline">${e.title}</div>
        <div class="item-haiku">${e.haiku}</div>
        <div class="item-actions">
          <button class="small-btn" data-act="open" data-i="${i}">Open</button>
          <button class="small-btn" data-act="copy" data-i="${i}">Copy</button>
          <button class="small-btn" data-act="${container === els.historyList ? 'fav' : 'unfav'}" data-i="${i}">
            ${container === els.historyList ? 'Favorite' : 'Remove'}
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.small-btn').forEach(btn => {
      const idx = Number(btn.dataset.i);
      const item = items[idx];
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'open') {
          if (item?.url && item.url !== '#') window.open(item.url, '_blank');
        } else if (act === 'copy') {
          copyText(`${item.haiku}\n\n${item.title}\n${item.url}`);
        } else if (act === 'fav') {
          if (!isFavorited(item)) {
            state.favorites = [item, ...state.favorites].slice(0, 150);
            store.set('nh.favorites', state.favorites);
            toast('Added to favorites');
          }
        } else if (act === 'unfav') {
          const key = entryKey(item);
          state.favorites = state.favorites.filter(e => entryKey(e) !== key);
          store.set('nh.favorites', state.favorites);
          renderList(els.favoritesList, state.favorites, 'Nothing here yet.');
          toast('Removed from favorites');
        }
      });
    });
  }

  // Copy/share
  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast('Copied!'));
  }

  function copyCurrent() {
    if (!state.currentHaiku || !state.current) return;
    copyText(`${state.currentHaiku}\n\n${state.current.title}\n${state.current.url}`);
  }

  function shareTwitter() {
    if (!state.currentHaiku || !state.current) return;
    const url = new URL('https://twitter.com/intent/tweet');
    url.searchParams.set('text', `${state.currentHaiku}\n\n${state.current.title}`);
    url.searchParams.set('url', state.current.url);
    window.open(url.toString(), '_blank');
  }

  function shareFacebook() {
    if (!state.current) return;
    const url = new URL('https://www.facebook.com/sharer/sharer.php');
    url.searchParams.set('u', state.current.url);
    window.open(url.toString(), '_blank');
  }

  // Theme + sound
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    store.set('nh.theme', state.theme);
  }

  function toggleSound() {
    state.sound = !state.sound;
    store.set('nh.sound', state.sound);
    renderIndicator();
    toast(state.sound ? 'Sound: on' : 'Sound: off');
  }

  // Events
  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (!act || (state.typing && act !== 'toggle-theme' && act !== 'copy')) return;

    if (act === 'new-haiku') newHaiku();
    if (act === 'toggle-theme') toggleTheme();
    if (act === 'toggle-favorites') {
      renderList(els.favoritesList, state.favorites, 'Nothing here yet.');
      openModal(els.favoritesModal);
    }
    if (act === 'show-history') {
      renderList(els.historyList, state.history, 'History is empty.');
      openModal(els.historyModal);
    }
    if (act === 'copy') copyCurrent();
    if (act === 'share-twitter') shareTwitter();
    if (act === 'share-facebook') shareFacebook();
    if (act === 'favorite-current') toggleFavoriteCurrent();
    if (act === 'close-modal') closeModals();
  });

  els.countrySelect.addEventListener('change', async () => {
    state.country = els.countrySelect.value;
    store.set('nh.country', state.country);
    // if language is auto, no change; otherwise leave manual override
    renderIndicator();
    state.headlines = [];
    state.lastFetchedAt = 0;
    await ensureHeadlines();
    toast(`Country: ${COUNTRIES.find(([c]) => c === state.country)?.[1]}`);
  });

  els.langSelect.addEventListener('change', () => {
    state.haikuLang = els.langSelect.value;
    store.set('nh.lang', state.haikuLang);
    renderIndicator();
    toast(state.haikuLang === 'auto' ? 'Haiku language: Auto' : `Haiku language: ${els.langSelect.selectedOptions[0].textContent}`);
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 's') toggleSound();  // sound toggle
    if (e.key.toLowerCase() === 'n') newHaiku();     // new haiku
    if (e.key.toLowerCase() === 'c') copyCurrent();  // copy
    if (e.key.toLowerCase() === 't') toggleTheme();  // theme
    if (e.key === 'Escape') closeModals();
  });

  // Open headline link on click
  els.headline.addEventListener('click', () => {
    if (state.current?.url && state.current.url !== '#') window.open(state.current.url, '_blank');
  });

  // Initial render
  renderSelectors();
  renderCategoryChips();
  renderIndicator();
  setSkeleton(true);
  els.headline.classList.remove('skeleton');
  els.headline.textContent = 'Press “New haiku”.';
  els.haiku.classList.remove('skeleton');
  els.haiku.textContent = 'We will turn a headline into a 3-line poem.';

})();
