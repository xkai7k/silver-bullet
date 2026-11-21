// Page pictures: hand-drawn icons and colour scenes for each page instead of emoji; any page can use your own picture.
(() => {
  const S = (body) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICONS = {
    games: S('<path d="M20 22h24a12 12 0 0 1 11.6 9l3 11.5a6.5 6.5 0 0 1-11 5.9L42 42H22l-5.6 6.4a6.5 6.5 0 0 1-11-5.9L8.4 31A12 12 0 0 1 20 22z"/><path d="M20 29v8M16 33h8"/><circle cx="42" cy="30" r="1.8" fill="currentColor"/><circle cx="47" cy="35" r="1.8" fill="currentColor"/>'),
    emu: S('<rect x="10" y="38" width="44" height="16" rx="5"/><path d="M32 38V20"/><circle cx="32" cy="15" r="7"/><circle cx="20" cy="46" r="2" fill="currentColor"/><circle cx="44" cy="46" r="2" fill="currentColor"/>'),
    watch: S('<rect x="6" y="14" width="52" height="34" rx="5"/><path d="M27 24v14l12-7z" fill="currentColor"/><path d="M22 56h20"/>'),
    music: S('<path d="M10 40v-6a22 22 0 0 1 44 0v6"/><rect x="8" y="38" width="10" height="16" rx="4"/><rect x="46" y="38" width="10" height="16" rx="4"/>'),
    apps: S('<rect x="9" y="9" width="18" height="18" rx="5"/><rect x="37" y="9" width="18" height="18" rx="5"/><rect x="9" y="37" width="18" height="18" rx="5"/><rect x="37" y="37" width="18" height="18" rx="5"/>'),
    mods: S('<path d="M26 8h12v7a5 5 0 1 0 10 0V8h8v16h-7a5 5 0 1 0 0 10h7v22H38v-7a5 5 0 1 0-10 0v7H8V34h7a5 5 0 1 0 0-10H8V8z"/>'),
    gallery: S('<rect x="6" y="14" width="52" height="38" rx="6"/><circle cx="32" cy="33" r="10"/><path d="M22 14l4-6h12l4 6"/><circle cx="48" cy="22" r="1.8" fill="currentColor"/>'),
    calendar: S('<rect x="8" y="12" width="48" height="44" rx="6"/><path d="M8 24h48M20 6v10M44 6v10"/><circle cx="21" cy="35" r="2" fill="currentColor"/><circle cx="32" cy="35" r="2" fill="currentColor"/><circle cx="43" cy="35" r="2" fill="currentColor"/><circle cx="21" cy="46" r="2" fill="currentColor"/><circle cx="32" cy="46" r="2" fill="currentColor"/>'),
    star: S('<path d="M32 6l7.8 16 17.6 2.5-12.7 12.4 3 17.5L32 46l-15.7 8.4 3-17.5L6.6 24.5 24.2 22z"/>'),
    book: S('<path d="M10 10h18a6 6 0 0 1 6 6v38a5 5 0 0 0-5-5H10zM54 10H40a6 6 0 0 0-6 6v38a5 5 0 0 1 5-5h15z"/>'),
    globe: S('<circle cx="32" cy="32" r="24"/><path d="M8 32h48M32 8c8 8 8 40 0 48M32 8c-8 8-8 40 0 48"/>'),
    heart: S('<path d="M32 54S8 40 8 23a12 12 0 0 1 24-3 12 12 0 0 1 24 3c0 17-24 31-24 31z"/>'),
    folder: S('<path d="M6 16a5 5 0 0 1 5-5h13l6 7h23a5 5 0 0 1 5 5v25a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z"/>'),
  };
  const SCENES = { // colours behind the icon when the page has no picture of its own
    games: ['#5b2be0', '#e0328a'], emu: ['#0f766e', '#22c55e'], watch: ['#b91c1c', '#f97316'], music: ['#065f46', '#1ed760'],
    apps: ['#1e3a8a', '#38bdf8'], mods: ['#6d28d9', '#f59e0b'], gallery: ['#9d174d', '#fb7185'], calendar: ['#0e7490', '#a78bfa'],
    star: ['#a16207', '#facc15'], book: ['#7c2d12', '#fb923c'], globe: ['#1d4ed8', '#22d3ee'], heart: ['#be123c', '#f472b6'], folder: ['#334155', '#64748b'],
  };
  const kindOf = (p) => p.iconKind || (ICONS[p.type] ? p.type : ICONS[p.id] ? p.id : p.id === 'music' ? 'music' : 'folder');
  window.PAGE_ICON_KINDS = Object.keys(ICONS);
  window.pageIconSvg = (k) => ICONS[k] || ICONS.folder;
  // Small icon (titles, menu)
  window.pageIcon = (p, cls = '') => {
    if (p.iconImg) return `<img class="pg-ico ${cls}" src="${esc(toImageUrl(p.iconImg))}" alt="">`;
    if (p.iconStyle === 'emoji' && p.icon) return `<span class="pg-ico emoji ${cls}">${esc(p.icon)}</span>`;
    return `<span class="pg-ico ${cls}">${ICONS[kindOf(p)]}</span>`;
  };
  // Background of the page's card on the home strip
  window.pageCardBg = (p) => {
    if (p.cover) return `<img class="cov" src="${esc(toImageUrl(p.cover))}" alt="">`;
    const a = typeof pageArt === 'function' && p.type !== 'calendar' ? pageArt(p) : null;
    if (a && !p.noAutoArt) return `<img class="cov" src="${esc(toImageUrl(a.image || a.hero))}" alt="">`;
    const [c1, c2] = SCENES[kindOf(p)] || SCENES.folder;
    return `<div class="pg-scene" style="--c1:${c1};--c2:${c2}">${ICONS[kindOf(p)]}</div>`;
  };
})();
