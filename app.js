/* ── Config ─────────────────────────────────────────────────────────── */
const CACHE_KEY        = 'ipo_calendar_v3';
const CACHE_TTL        = 60 * 60 * 1000; // 1 hour
const REFRESH_INTERVAL = 60 * 60 * 1000;

// AI/Robotics keyword detection against company name
const AI_KEYWORDS = [
  'ai ', ' ai', '.ai', 'artificial', 'intelligence', 'neural', 'cognitive',
  'machine', 'learning', 'language', 'vision', 'deep', 'predictive',
  'algorithm', 'intelligent', 'automat', 'analytics', 'data', 'cloud',
  'cyber', 'tech', 'software', 'digital', 'compute', 'quantum', 'semiconductor',
  'chip', 'gpu', 'sensing', 'saas', 'platform',
];
const ROBOT_KEYWORDS = [
  'robot', 'robotic', 'drone', 'actuator', 'mechatron', 'humanoid',
  'automation', 'autonomous', 'mobility', 'lidar', 'vehicle',
];

const CATEGORIES = [
  { id: 'all',      label: '✦ All Upcoming', badgeClass: 'badge-all',    badgeText: 'IPO'    },
  { id: 'ai',       label: '🤖 AI & Tech',   badgeClass: 'badge-llm',    badgeText: 'AI'     },
  { id: 'robotics', label: '🦾 Robotics',     badgeClass: 'badge-robot',  badgeText: 'Robot'  },
  { id: 'soon',     label: '🔥 This Week',    badgeClass: 'badge-vision', badgeText: 'Soon'   },
  { id: 'filed',    label: '📋 Filed / TBD',  badgeClass: 'badge-ml',     badgeText: 'Filed'  },
];

/* ── State ─────────────────────────────────────────────────────────── */
let allIPOs        = [];
let activeCategory = 'all';
let searchQuery    = '';
let refreshTimer   = null;

/* ── DOM Refs ──────────────────────────────────────────────────────── */
const $grid         = document.getElementById('news-grid');
const $loading      = document.getElementById('loading');
const $error        = document.getElementById('error');
const $errorMsg     = document.getElementById('error-msg');
const $noResults    = document.getElementById('no-results');
const $noQuery      = document.getElementById('no-results-query');
const $filters      = document.getElementById('filters');
const $search       = document.getElementById('search');
const $refreshBtn   = document.getElementById('refresh-btn');
const $lastUpdated  = document.getElementById('last-updated');
const $articleCount = document.getElementById('article-count');

/* ── Date Helpers ──────────────────────────────────────────────────── */
// Nasdaq returns "M/D/YYYY" e.g. "3/10/2026"
function parseNasdaqDate(str) {
  if (!str || str === 'N/A' || str === '--' || str === 'Pending') return null;
  const p = str.split('/');
  if (p.length === 3) {
    const d = new Date(+p[2], +p[0] - 1, +p[1]);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(date) {
  if (!date) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(date); t.setHours(0, 0, 0, 0);
  return Math.round((t - today) / 86400000);
}

function formatNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── Category Detection ────────────────────────────────────────────── */
function detectCategory(name = '') {
  const n = ` ${name.toLowerCase()} `;
  if (ROBOT_KEYWORDS.some(k => n.includes(k))) return 'robotics';
  if (AI_KEYWORDS.some(k => n.includes(k))) return 'ai';
  return 'other';
}

/* ── Fetch ─────────────────────────────────────────────────────────── */
function getMonths() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

async function fetchMonth(yearMonth) {
  const res = await fetch(`/api/ipo?date=${yearMonth}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function parseResponse(json) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ipos = [];
  const d = json?.data;
  if (!d) return ipos;

  // Upcoming: confirmed pricing date in the future
  const upRows = d.upcoming?.upcomingTable?.rows || [];
  for (const row of upRows) {
    const date = parseNasdaqDate(row.expectedPriceDate);
    if (!date || date < today) continue;
    ipos.push({
      id:        row.dealID,
      name:      row.companyName || '',
      ticker:    row.proposedTickerSymbol || '—',
      exchange:  row.proposedExchange || '',
      date,
      status:    'upcoming',
      priceRange: row.proposedSharePrice || null,
      offerAmt:   row.dollarValueOfSharesOffered || null,
      shares:     row.sharesOffered || null,
      category:  detectCategory(row.companyName),
    });
  }

  // Filed: no confirmed date yet
  const filedRows = d.filed?.rows || [];
  for (const row of filedRows) {
    ipos.push({
      id:        row.dealID,
      name:      row.companyName || '',
      ticker:    row.proposedTickerSymbol || '—',
      exchange:  '',
      date:      null,
      status:    'filed',
      priceRange: null,
      offerAmt:  row.dollarValueOfSharesOffered || null,
      shares:    null,
      category:  detectCategory(row.companyName),
    });
  }

  return ipos;
}

async function fetchAllIPOs() {
  const months = getMonths();
  const results = await Promise.allSettled(months.map(m => fetchMonth(m)));

  const seen = new Set();
  const ipos = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const ipo of parseResponse(r.value)) {
      if (!ipo.id || seen.has(ipo.id) || !ipo.name) continue;
      seen.add(ipo.id);
      ipos.push(ipo);
    }
  }

  // Sort: upcoming by date asc, then filed
  ipos.sort((a, b) => {
    if (a.date && b.date) return a.date - b.date;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  return ipos;
}

/* ── Cache ─────────────────────────────────────────────────────────── */
function saveCache(ipos) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      ipos: ipos.map(i => ({ ...i, date: i.date?.toISOString() ?? null })),
    }));
  } catch {}
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, ipos } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return ipos.map(i => ({ ...i, date: i.date ? new Date(i.date) : null }));
  } catch { return null; }
}

/* ── Render ─────────────────────────────────────────────────────────── */
function renderFilters() {
  $filters.innerHTML = '';
  for (const cat of CATEGORIES) {
    let count;
    switch (cat.id) {
      case 'all':      count = allIPOs.length; break;
      case 'ai':       count = allIPOs.filter(i => i.category === 'ai').length; break;
      case 'robotics': count = allIPOs.filter(i => i.category === 'robotics').length; break;
      case 'soon':     count = allIPOs.filter(i => i.date && daysUntil(i.date) <= 7).length; break;
      case 'filed':    count = allIPOs.filter(i => i.status === 'filed').length; break;
      default:         count = 0;
    }
    const btn = document.createElement('button');
    btn.className = `filter-btn${cat.id === activeCategory ? ' active' : ''}`;
    btn.innerHTML = `${cat.label} <span class="count">${count}</span>`;
    btn.addEventListener('click', () => { activeCategory = cat.id; renderFilters(); renderGrid(); });
    $filters.appendChild(btn);
  }
}

function countdownInfo(days) {
  if (days === null) return { text: 'Date TBD', cls: 'countdown-tbd' };
  if (days < 0)      return { text: 'Passed',   cls: 'countdown-far' };
  if (days === 0)    return { text: '🔥 TODAY',  cls: 'countdown-hot' };
  if (days === 1)    return { text: '🔥 Tomorrow', cls: 'countdown-hot' };
  if (days <= 7)     return { text: `🔥 ${days} days`, cls: 'countdown-hot' };
  if (days <= 30)    return { text: `${days} days`,  cls: 'countdown-soon' };
  return               { text: `${days} days`,        cls: 'countdown-far' };
}

function renderCard(ipo) {
  const days = daysUntil(ipo.date);
  const { text: cdText, cls: cdCls } = countdownInfo(days);
  const cat = CATEGORIES.find(c => c.id === ipo.category) || CATEGORIES[0];

  const card = document.createElement('article');
  card.className = 'card';
  card.style.animationDelay = `${Math.random() * 0.12}s`;

  const metas = [
    ipo.exchange   ? `<span class="meta-chip">${escapeHtml(ipo.exchange)}</span>`   : '',
    ipo.priceRange ? `<span class="meta-chip">$${escapeHtml(ipo.priceRange)}</span>` : '',
    ipo.offerAmt && ipo.offerAmt.trim() ? `<span class="meta-chip">${escapeHtml(ipo.offerAmt)}</span>` : '',
  ].join('');

  card.innerHTML = `
    <div class="card-top">
      <span class="card-badge ${cat.badgeClass}">${cat.badgeText}</span>
      <span class="card-ticker">${escapeHtml(ipo.ticker)}</span>
    </div>
    <div class="card-date-row">
      <div class="card-date">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        ${ipo.date ? formatDate(ipo.date) : 'Date pending'}
      </div>
      <span class="countdown ${cdCls}">${cdText}</span>
    </div>
    <div class="card-title">${escapeHtml(ipo.name)}</div>
    ${metas ? `<div class="card-meta">${metas}</div>` : ''}
  `;
  return card;
}

function renderGrid() {
  let ipos = allIPOs;
  switch (activeCategory) {
    case 'ai':       ipos = ipos.filter(i => i.category === 'ai');                break;
    case 'robotics': ipos = ipos.filter(i => i.category === 'robotics');           break;
    case 'soon':     ipos = ipos.filter(i => i.date && daysUntil(i.date) <= 7);   break;
    case 'filed':    ipos = ipos.filter(i => i.status === 'filed');                break;
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    ipos = ipos.filter(i =>
      i.name.toLowerCase().includes(q) || i.ticker.toLowerCase().includes(q)
    );
  }

  $articleCount.textContent = `${ipos.length} IPO${ipos.length !== 1 ? 's' : ''}`;

  if (ipos.length === 0) {
    $grid.classList.add('hidden');
    $noResults.classList.remove('hidden');
    $noQuery.textContent = searchQuery || CATEGORIES.find(c => c.id === activeCategory)?.label || '';
  } else {
    $noResults.classList.add('hidden');
    $grid.classList.remove('hidden');
    $grid.innerHTML = '';
    ipos.forEach(i => $grid.appendChild(renderCard(i)));
  }
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Load ──────────────────────────────────────────────────────────── */
async function load(forceRefresh = false) {
  $refreshBtn.classList.add('spinning');
  $error.classList.add('hidden');

  if (!forceRefresh) {
    const cached = loadCache();
    if (cached?.length > 0) {
      allIPOs = cached;
      $loading.classList.add('hidden');
      $grid.classList.remove('hidden');
      renderFilters();
      renderGrid();
      $lastUpdated.textContent = `Cached · refreshes at ${formatNow()}`;
      $refreshBtn.classList.remove('spinning');
      scheduleRefresh();
      return;
    }
  }

  $loading.classList.remove('hidden');
  $grid.classList.add('hidden');

  try {
    allIPOs = await fetchAllIPOs();
    saveCache(allIPOs);
    $loading.classList.add('hidden');
    $grid.classList.remove('hidden');
    renderFilters();
    renderGrid();
    $lastUpdated.textContent = `Updated ${formatNow()}`;
  } catch (err) {
    console.error(err);
    $loading.classList.add('hidden');
    if ($errorMsg) $errorMsg.textContent = err.message;
    if (allIPOs.length === 0) {
      $error.classList.remove('hidden');
    } else {
      $lastUpdated.textContent = `Refresh failed — showing cached`;
    }
  } finally {
    $refreshBtn.classList.remove('spinning');
    scheduleRefresh();
  }
}

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
  searchDebounce = setTimeout(() => { searchQuery = $search.value.trim(); renderGrid(); }, 250);
});

/* ── Init ───────────────────────────────────────────────────────────── */
load();
