/* ── Config ─────────────────────────────────────────────────────────── */
const HN_API   = 'https://hn.algolia.com/api/v1/search';
const CACHE_KEY = 'ipo_news_v1';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const REFRESH_INTERVAL = 30 * 60 * 1000;

// Keywords that confirm a story is IPO/market relevant
const IPO_KEYWORDS = [
  'ipo', 'initial public offering', 'going public', 'public offering',
  's-1', 'spac', 'stock', 'nasdaq', 'nyse', 'valuation', 'shares',
  'market cap', 'funding', 'raise', 'raised', 'billion', 'listing',
  'pre-ipo', 'roadshow', 'invest', 'acquisition', 'merger', 'deal',
];

const CATEGORIES = [
  {
    id: 'all', label: '✦ All IPOs',
    badgeClass: 'badge-all', badgeText: 'IPO',
  },
  {
    id: 'ai', label: '🤖 AI Companies',
    badgeClass: 'badge-llm', badgeText: 'AI Co.',
    keywords: [
      'openai', 'anthropic', 'xai', 'x.ai', 'mistral', 'cohere', 'scale ai',
      'databricks', 'perplexity', 'stability ai', 'hugging face', 'inflection',
      'aleph alpha', 'adept', 'jasper', 'writer', 'ai21', 'together ai',
    ],
  },
  {
    id: 'robotics', label: '🦾 Robotics Companies',
    badgeClass: 'badge-robot', badgeText: 'Robotics',
    keywords: [
      'figure', 'boston dynamics', '1x technologies', 'agility robotics',
      'apptronik', 'physical intelligence', 'optimus', 'humanoid robot',
      'autonomous robot', 'spot robot', 'unitree', 'sanctuary ai',
      'robotics company', 'robot startup',
    ],
  },
  {
    id: 'upcoming', label: '📅 Upcoming IPOs',
    badgeClass: 'badge-research', badgeText: 'Upcoming',
    keywords: [
      's-1', 'plans to go public', 'preparing ipo', 'pre-ipo', 'roadshow',
      'filing', 'confidential filing', 'upcoming ipo', 'expected ipo',
    ],
  },
  {
    id: 'market', label: '📈 Market & Valuation',
    badgeClass: 'badge-ml', badgeText: 'Market',
    keywords: [
      'valuation', 'market cap', 'shares', 'nasdaq', 'nyse', 'stock price',
      'earnings', 'revenue', 'profit', 'quarterly', 'analyst', 'investor',
    ],
  },
  {
    id: 'funding', label: '💰 Funding Rounds',
    badgeClass: 'badge-tools', badgeText: 'Funding',
    keywords: [
      'series a', 'series b', 'series c', 'series d', 'seed round',
      'venture capital', 'raised', 'funding round', 'investment', 'raise',
    ],
  },
  {
    id: 'spac', label: '🔀 SPAC & M&A',
    badgeClass: 'badge-safety', badgeText: 'SPAC/M&A',
    keywords: [
      'spac', 'special purpose acquisition', 'blank check', 'merger',
      'acquisition', 'acquire', 'takeover', 'buyout', 'deal',
    ],
  },
];

/* ── State ─────────────────────────────────────────────────────────── */
let allArticles   = [];
let activeCategory = 'all';
let searchQuery   = '';
let refreshTimer  = null;

/* ── DOM Refs ──────────────────────────────────────────────────────── */
const $grid       = document.getElementById('news-grid');
const $loading    = document.getElementById('loading');
const $error      = document.getElementById('error');
const $noResults  = document.getElementById('no-results');
const $noQuery    = document.getElementById('no-results-query');
const $filters    = document.getElementById('filters');
const $search     = document.getElementById('search');
const $refreshBtn = document.getElementById('refresh-btn');
const $lastUpdated = document.getElementById('last-updated');
const $articleCount = document.getElementById('article-count');

/* ── Time Helpers ──────────────────────────────────────────────────── */
function timeAgo(unixTs) {
  const diff = Date.now() / 1000 - unixTs;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── IPO Relevance Filter ──────────────────────────────────────────── */
function isIpoRelevant(hit) {
  const text = `${hit.title} ${hit.url || ''}`.toLowerCase();
  return IPO_KEYWORDS.some(k => text.includes(k));
}

/* ── Category Detection ────────────────────────────────────────────── */
function detectCategory(article) {
  const text = `${article.title} ${article.url || ''}`.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.id === 'all') continue;
    if (cat.keywords && cat.keywords.some(k => text.includes(k))) return cat;
  }
  return CATEGORIES[0]; // fallback: "All IPOs"
}

/* ── Fetch ─────────────────────────────────────────────────────────── */
async function fetchQuery(query) {
  const url = `${HN_API}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=50&numericFilters=points>5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.hits || [];
}

async function fetchAllNews() {
  const queries = [
    'AI IPO initial public offering',
    'robotics IPO stock market',
    'OpenAI IPO valuation',
    'Anthropic IPO public offering',
    'AI startup funding billion valuation',
    'robotics company funding raise',
    'AI company SPAC merger acquisition',
    'tech IPO 2025 artificial intelligence',
    'humanoid robot company stock',
    'AI unicorn going public',
  ];

  const results = await Promise.allSettled(queries.map(q => fetchQuery(q)));

  const seen = new Set();
  const articles = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const hit of result.value) {
      if (!hit.objectID || seen.has(hit.objectID)) continue;
      if (!hit.title) continue;
      if (!isIpoRelevant(hit)) continue; // only IPO-relevant articles
      seen.add(hit.objectID);
      const cat = detectCategory(hit);
      articles.push({
        id:       hit.objectID,
        title:    hit.title,
        url:      hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        hnUrl:    `https://news.ycombinator.com/item?id=${hit.objectID}`,
        points:   hit.points || 0,
        comments: hit.num_comments || 0,
        time:     hit.created_at_i,
        author:   hit.author || '',
        domain:   hit.url ? extractDomain(hit.url) : 'news.ycombinator.com',
        category: cat,
      });
    }
  }

  // Sort by points descending
  articles.sort((a, b) => b.points - a.points);
  return articles;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/* ── Cache ─────────────────────────────────────────────────────────── */
function saveCache(articles) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), articles }));
  } catch {}
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, articles } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return articles;
  } catch {
    return null;
  }
}

/* ── Render ─────────────────────────────────────────────────────────── */
function renderFilters() {
  $filters.innerHTML = '';
  for (const cat of CATEGORIES) {
    const count = cat.id === 'all'
      ? allArticles.length
      : allArticles.filter(a => a.category.id === cat.id).length;

    const btn = document.createElement('button');
    btn.className = `filter-btn${cat.id === activeCategory ? ' active' : ''}`;
    btn.dataset.id = cat.id;
    btn.innerHTML = `${cat.label} <span class="count">${count}</span>`;
    btn.addEventListener('click', () => {
      activeCategory = cat.id;
      renderFilters();
      renderGrid();
    });
    $filters.appendChild(btn);
  }
}

function renderCard(article) {
  const card = document.createElement('article');
  card.className = 'card';
  card.style.animationDelay = `${Math.random() * 0.15}s`;

  card.innerHTML = `
    <div class="card-top">
      <span class="card-badge ${article.category.badgeClass}">${article.category.badgeText}</span>
      <span class="card-time">${timeAgo(article.time)}</span>
    </div>
    <div class="card-title">
      <a href="${article.url}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>
    </div>
    <div class="card-meta">
      <span class="meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
        </svg>
        ${article.points}
      </span>
      <a class="meta-item card-comments-link" href="${article.hnUrl}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        ${article.comments}
      </a>
      <span class="card-source">${escapeHtml(article.domain)}</span>
    </div>
  `;
  return card;
}

function renderGrid() {
  let articles = allArticles;

  // Category filter
  if (activeCategory !== 'all') {
    articles = articles.filter(a => a.category.id === activeCategory);
  }

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    articles = articles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.domain.toLowerCase().includes(q)
    );
  }

  if (articles.length === 0) {
    $grid.classList.add('hidden');
    $noResults.classList.remove('hidden');
    $noQuery.textContent = searchQuery || CATEGORIES.find(c => c.id === activeCategory)?.label || '';
  } else {
    $noResults.classList.add('hidden');
    $grid.classList.remove('hidden');
    $grid.innerHTML = '';
    articles.forEach(a => $grid.appendChild(renderCard(a)));
  }

  $articleCount.textContent = `${articles.length} article${articles.length !== 1 ? 's' : ''}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Load ──────────────────────────────────────────────────────────── */
async function load(forceRefresh = false) {
  $refreshBtn.classList.add('spinning');
  $error.classList.add('hidden');

  if (!forceRefresh) {
    const cached = loadCache();
    if (cached && cached.length > 0) {
      allArticles = cached;
      renderFilters();
      renderGrid();
      $loading.classList.add('hidden');
      $grid.classList.remove('hidden');
      $lastUpdated.textContent = `Cached · refreshes at ${formatNow()}`;
      $refreshBtn.classList.remove('spinning');
      scheduleRefresh();
      return;
    }
  }

  show($loading);

  try {
    allArticles = await fetchAllNews();
    saveCache(allArticles);
    $loading.classList.add('hidden');
    renderFilters();
    renderGrid();
    $lastUpdated.textContent = `Updated ${formatNow()}`;
  } catch (err) {
    console.error(err);
    $loading.classList.add('hidden');
    if (allArticles.length === 0) {
      show($error);
    } else {
      $lastUpdated.textContent = `Refresh failed — showing cached data`;
    }
  } finally {
    $refreshBtn.classList.remove('spinning');
    scheduleRefresh();
  }
}

function show(el) { el.classList.remove('hidden'); }

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => load(true), REFRESH_INTERVAL);
}

/* ── Events ─────────────────────────────────────────────────────────── */
$refreshBtn.addEventListener('click', () => load(true));

document.getElementById('retry-btn').addEventListener('click', () => load(true));

let searchDebounce;
$search.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = $search.value.trim();
    renderGrid();
  }, 250);
});

/* ── Init ───────────────────────────────────────────────────────────── */
load();
