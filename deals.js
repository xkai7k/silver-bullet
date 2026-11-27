// "🎁 عروض": free games on Epic / Steam (GamerPower), and price drops for games on your wishlist (CheapShark).
// Checked every 6 hours; anything new pops up on the PC and, if phone alerts are on, on the phone too.
const fs = require('fs');
const path = require('path');

module.exports = function setupDeals({ ipcMain, app, net, log, phoneNote, shell }) {
  const file = path.join(app.getPath('userData'), 'deals.json');
  let st = { seen: [], free: [], wish: [], checkedAt: 0 };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) }; } catch {}
  const save = () => { try { fs.writeFileSync(file, JSON.stringify(st)); } catch {} };
  const getJson = async (url) => { const r = await net.fetch(url, { headers: { 'User-Agent': 'SilverBullet' } }); if (r.status >= 400) throw new Error('HTTP ' + r.status); return r.json(); };
  const usd = (n) => '$' + Number(n || 0).toFixed(2);

  function pop(title, body, url) {
    try {
      const { Notification } = require('electron');
      const n = new Notification({ title, body });
      if (url) n.on('click', () => shell.openExternal(url));
      n.show();
    } catch {}
    try { phoneNote?.(title, body); } catch {}
  }

  async function checkFree() {
    // one store at a time: a store with nothing free answers with a note instead of a list (or an error), the other still counts
    const list = [];
    for (const pf of ['epic-games-store', 'steam']) {
      try { const r = await getJson(`https://www.gamerpower.com/api/giveaways?platform=${pf}&type=game`); if (Array.isArray(r)) list.push(...r); } catch (e) { log('deals:', pf, e.message); }
    }
    st.free = list.slice(0, 30).map((g) => ({
      id: String(g.id), title: String(g.title || '').replace(/\s*(\((Epic Games|Epic|Steam)\))?\s*(Key|Giveaway)?\s*(Giveaway)?$/i, '').trim(),
      store: /epic/i.test(g.platforms || '') ? 'Epic' : 'Steam', worth: g.worth && g.worth !== 'N/A' ? g.worth : '',
      image: g.image || g.thumbnail || '', url: g.open_giveaway_url || g.gamerpower_url || '', ends: g.end_date && g.end_date !== 'N/A' ? g.end_date : '',
    })).filter((g) => g.title && g.url);
    const fresh = st.free.filter((g) => !st.seen.includes(g.id));
    if (fresh.length) {
      st.seen = [...st.seen, ...fresh.map((g) => g.id)].slice(-400);
      pop('🎁 ألعاب ببلاش', fresh.slice(0, 4).map((g) => `${g.title} (${g.store})`).join('، ') + (fresh.length > 4 ? ` و${fresh.length - 4} غيرها` : ''), fresh[0].url);
      log('deals: new free games', fresh.map((g) => g.title).join(' | ').slice(0, 300));
    }
  }

  async function checkWish() {
    if (!st.wish.length) return;
    const ids = st.wish.map((w) => w.gameID).join(',');
    const res = await getJson('https://www.cheapshark.com/api/1.0/games?ids=' + encodeURIComponent(ids));
    for (const w of st.wish) {
      const g = res?.[w.gameID]; if (!g?.deals?.length) continue;
      const best = g.deals.reduce((a, d) => (Number(d.price) < Number(a.price) ? d : a), g.deals[0]);
      const price = Number(best.price), retail = Number(best.retailPrice) || w.retail || price;
      w.retail = retail; w.dealID = best.dealID; w.checkedAt = Date.now();
      if (w.price != null && price < w.price - 0.01) {
        pop('📉 نزل السعر', `${w.title}: ${usd(price)} (كان ${usd(w.price)})`, 'https://www.cheapshark.com/redirect?dealID=' + best.dealID);
        log('deals: price drop', w.title, w.price, '->', price);
      }
      w.price = price;
    }
  }

  async function check(force) {
    if (!force && Date.now() - st.checkedAt < 6 * 3600e3 && st.free.length) return;
    st.checkedAt = Date.now();
    try { await checkFree(); } catch (e) { log('deals: free games failed', e.message); st.checkedAt = Date.now() - 5.5 * 3600e3; } // failed: try again in half an hour
    try { await checkWish(); } catch (e) { log('deals: wishlist failed', e.message); }
    save();
  }
  setTimeout(() => check(false), 90 * 1000);
  setInterval(() => check(false), 30 * 60 * 1000);

  ipcMain.handle('deals:get', async (_e, refresh) => { if (refresh) await check(true); return { free: st.free, wish: st.wish, checkedAt: st.checkedAt }; });
  ipcMain.handle('deals:search', async (_e, q) => {
    try {
      const r = await getJson('https://www.cheapshark.com/api/1.0/games?limit=8&title=' + encodeURIComponent(String(q || '').slice(0, 80)));
      return (r || []).map((g) => ({ gameID: String(g.gameID), title: g.external, price: Number(g.cheapest), thumb: g.thumb }));
    } catch (e) { log('deals: search failed', e.message); return { error: e.message }; }
  });
  ipcMain.handle('deals:wish', async (_e, g, on) => {
    st.wish = st.wish.filter((w) => w.gameID !== String(g.gameID));
    if (on) st.wish.unshift({ gameID: String(g.gameID), title: String(g.title || '').slice(0, 120), thumb: g.thumb || '', price: Number(g.price) || null, at: Date.now() });
    save();
    if (on) checkWish().then(save).catch(() => {});
    return st.wish;
  });
  ipcMain.handle('deals:open', (_e, url) => { if (/^https:\/\//i.test(url || '')) shell.openExternal(url); });
  return { check };
};
