(() => {
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view'), sheet = $('#sheet'), tabsEl = $('#tabs');
const SECTIONS = ['Today', 'Education', 'Work', 'Creative', 'Get Involved'];
const PAGES = ['Today', 'Education', 'Work', 'Creative'];
const VERBS = ['Submit', 'Audition', 'Apply', 'Enter', 'Join', 'Pitch'];
const GROUPS = [['Film','FI'],['Writing','WR'],['Acting & Voice','AV'],['Behind the Camera','BC'],['Industry','IN'],['Communities','CM']];
const STATUSES = ['Planning to attend', 'Applied', 'Registered', 'Added to Slate', 'Completed', 'Couldn\'t attend'];
const ICON = { Acting:'AC', Film:'FI', Directing:'DI', 'Web Design':'WD', Screenwriting:'SW', Education:'ED', College:'CO', 'Financial aid':'FA', HiSET:'HS', Workshops:'WK', Freelance:'FR', Career:'CA', Producing:'PR', 'Voice Acting':'VA', Editing:'EG', Design:'DS', Cinematography:'CI', Writing:'WR', 'Web Development':'WB', Photography:'PH' };
const DISC = { Acting:'#c2185b', Film:'#1c1c1e', Directing:'#444', 'Web Design':'#0a5bd8', Screenwriting:'#7b3fc4', Education:'#0a7d4f', College:'#0a7d4f', 'Financial aid':'#2e8b57', HiSET:'#e08a00', Freelance:'#00838f', Career:'#555', Producing:'#8a5a00' };
// Goals the matcher scores against (edit here)
const GOALS = ['Voice Acting','Editing','Design','Cinematography','Writing','Web Development','Photography','HiSET','College','Financial aid','Education','Web Design','Freelance','Acting','Film','Screenwriting','Directing','Career','Producing'];
const GOAL_W = { HiSET:18, College:16, 'Financial aid':16, Education:12, 'Web Design':18, Freelance:16, Acting:18, Film:14, Screenwriting:18, Directing:16, Career:10, Producing:8, 'Voice Acting':18, Editing:12, Design:10, Cinematography:14, Writing:8, 'Web Development':16, Photography:6 };
const LOC_RANK = [['Hammond',16],['Baton Rouge',13],['New Orleans',13],['Louisiana',10],['Online',8],['Anywhere',6]];
const SHOW_MIN = 60; // Today surfaces only matches at or above this

const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
let TODAY = todayStr();
let OPPS = [], SOURCES = [], loaded = false, dbOK = true, staticMode = false;
let st = { saved: [], taken: {}, slate: [], dismissed: [] };
let fmtF = 'All', locF = 'Anywhere', verbF = null, groupF = null, SCANS = [];
const LOCS = ['Anywhere', 'Virtual', 'California', 'Los Angeles', 'New York', 'Louisiana', 'International', 'Other'];
let tab = 'Today', circleFilter = null;
let q = { text:'', cat:'Any', loc:'Any', cost:'Any', date:'Any' };

// ---------- state (per-viewer, in db when available, else localStorage) ----------
let db = null, stRef = null, KEY = 'scout.v2';
try { const l = JSON.parse(localStorage.getItem(KEY)); if (l) st = { dismissed: [], ...l }; } catch (e) {}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
  if (stRef) stRef.set(JSON.parse(JSON.stringify(st))).catch(() => {});
}
async function boot() {
  render();
  try {
    const c = window.claude && await window.claude.use('db');
    if (!c) { await loadStatic(); return; }
    db = c;
    db.collection('opportunities').onSnapshot(s => { OPPS = s.docs.map(d => ({ ...d.data(), id: d.id })); loaded = true; refresh(); }, () => { dbOK = false; loaded = true; refresh(); });
    db.collection('scans').onSnapshot(s => { SCANS = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || '')); if (!sheet.hidden && sheet.dataset.kind === 'scan') showScan(); else if (tab === 'Today') refresh(); }, () => {});
    db.collection('sources').onSnapshot(s => { SOURCES = s.docs.map(d => ({ ...d.data(), id: d.id })); if (!sheet.hidden || tab === 'Today') refresh(); }, () => {});
    try {
      const u = await window.claude.use('user'); const id = u && await u.id();
      if (id) { stRef = db.collection('data/users/' + id).doc('scout'); stRef.onSnapshot(s => { if (s.exists) { st = { saved: [], taken: {}, slate: [], dismissed: [], ...s.data() }; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} refresh(); } }, () => {}); }
    } catch (e) {}
  } catch (e) { await loadStatic(); }
}
// Public site mode: no database, so read the exported snapshot (data.json).
async function loadStatic() {
  try {
    const r = await fetch('data.json', { cache: 'no-cache' }); const d = await r.json();
    OPPS = d.opportunities || []; SOURCES = d.sources || []; SCANS = d.scans || []; staticMode = true; dbOK = true;
  } catch (e) { dbOK = false; }
  loaded = true; render();
}
function refresh() { if (!sheet.hidden) return; const y = scrollY; render(true); scrollTo(0, y); }

// ---------- helpers ----------
const live = o => {
  if (o.status && o.status !== 'active') return false;
  if (st.dismissed && st.dismissed.includes(o.id)) return false;
  if (o.deadline) return o.deadline >= TODAY;
  if (o.rolling) return true; // source states no end date
  if (o.occurrences && o.occurrences.length) return o.occurrences.some(d => d >= TODAY);
  const end = o.endsOn || o.startsOn;
  return !!end && end >= TODAY;
};
const nextOcc = o => o.occurrences && o.occurrences.find(d => d >= TODAY);
const locOK = o => { if (locF === 'Anywhere') return true; const r = o.regions || []; if (locF === 'Virtual') return r.includes('Online'); return r.includes(locF); };
const fmtOK0 = o => fmtF === 'All' || (fmtF === 'Virtual' ? (o.format === 'Virtual' || o.format === 'Hybrid') : (o.format === 'In person' || o.format === 'Hybrid'));
const fmtOK = o => fmtOK0(o) && locOK(o);
const byId = id => OPPS.find(o => o.id === id) || (st.taken[id] && st.taken[id].snap) || null;
const daysFrom = d => Math.round((new Date(d + 'T12:00:00') - new Date(TODAY + 'T12:00:00')) / 864e5);
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric' });
const fmtS = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
const ascii = v => String(v == null ? '' : v).replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u00B7/g, '-').replace(/\u2026/g, '...').replace(/[\u00A0\u202F]/g, ' ').replace(/[^\x00-\x7F]/g, '');
const esc = s => ascii(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const ago = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso)) / 6e4); if (m < 2) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 36) return h + ' hr ago'; return fmtS(iso.slice(0, 10)); };

function score(o) {
  let s = 40, hit = [];
  (o.tags || []).forEach(t => { if (GOALS.includes(t)) { s += GOAL_W[t] || 8; hit.push(t); } });
  const loc = (o.location || '') + ' ' + (o.mode || '');
  const l = LOC_RANK.find(([n]) => loc.includes(n)); s += l ? l[1] : 3;
  if (o.deadline) { const d = daysFrom(o.deadline); if (d >= 0 && d <= 14) s += 8; }
  if (o.costNum === 0) s += 5; else if (o.costNum != null && o.costNum < 100) s += 2;
  if (o.eligibility) s -= 12;
  return { s: Math.min(100, s), hit };
}
const matchLabel = o => { const s = score(o).s; return s >= 90 ? 'Great match for you' : s >= 75 ? 'Strong match' : 'Possible match'; };
const why = o => {
  const { hit } = score(o); const bits = [];
  if (hit.length) bits.push('Matches your ' + hit.slice(0, 3).join(', ').toLowerCase() + ' goals.');
  if (o.location && o.location !== 'Online') bits.push('Based in ' + o.location + '.'); else if (o.mode && o.mode.startsWith('Online')) bits.push('Online, so no travel.');
  if (o.costNum === 0) bits.push('Free.');
  if (o.deadline && daysFrom(o.deadline) <= 14) bits.push('Closing soon.');
  if (o.eligibility) bits.push('Check eligibility: ' + o.eligibility);
  return bits.join(' ') || 'Selected from a verified source.';
};
const visible = cat => OPPS.filter(o => live(o) && fmtOK(o) && (!cat || o.cat === cat)).sort((a, b) => score(b).s - score(a).s || (a.deadline || '9').localeCompare(b.deadline || '9'));
const strong = cat => visible(cat).filter(o => score(o).s >= SHOW_MIN);
const dueTxt = o => { const nx = nextOcc(o); if (nx && !o.deadline) return 'Next: ' + fmtS(nx); if (!o.deadline) return o.dateText ? esc(o.dateText) : 'Deadline not stated'; const d = daysFrom(o.deadline); return d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : 'Deadline ' + fmtS(o.deadline); };

// Editorial artwork (no stock photos: swap in o.image later)
function art(o, big) {
  let h = 0; for (const c of o.id) h = (h * 31 + c.charCodeAt(0)) % 360;
  const base = { Education:140, Work:215, Creative:335 }[o.cat] || 200; const hue = (base + (h % 40) - 20 + 360) % 360, h2 = (hue + 45) % 360;
  const m = ['spot', 'grid', 'arch', 'lines'][h % 4];
  const shapes = {
    spot: `<circle cx="72%" cy="38%" r="${big?230:90}" fill="hsl(${h2} 90% 72%)" opacity=".55"/><circle cx="72%" cy="38%" r="${big?120:48}" fill="hsl(${hue} 95% 88%)" opacity=".7"/><rect x="0" y="78%" width="100%" height="22%" fill="hsl(${hue} 60% 12%)" opacity=".5"/>`,
    grid: [0,1,2,3,4].map(i => `<rect x="${44+i*11}%" y="${14+(i%3)*18}%" width="9%" height="${big?150:56}" rx="10" fill="hsl(${h2} 85% ${70+i*4}%)" opacity=".7"/>`).join('') + `<rect x="10%" y="62%" width="80%" height="6" rx="3" fill="#fff" opacity=".5"/>`,
    arch: `<path d="M45% 100% V45% a22% 28% 0 0 1 44% 0 V100%Z" fill="hsl(${h2} 80% 80%)" opacity=".6"/><path d="M60% 100% V58% a8% 12% 0 0 1 16% 0 V100%Z" fill="hsl(${hue} 70% 30%)" opacity=".6"/>`,
    lines: [0,1,2,3,4,5].map(i => `<rect x="42%" y="${16+i*12}%" width="${50-(i%3)*12}%" height="${big?10:5}" rx="5" fill="#fff" opacity="${.6-i*.07}"/>`).join('')
  }[m];
  const bg = o.image ? `background-image:url(${esc(o.image)});background-size:cover;background-position:center` : `background:linear-gradient(135deg,hsl(${hue} 80% 52%),hsl(${h2} 75% 38%))`;
  return `<div class="art" style="${bg}">${o.image ? '' : `<svg preserveAspectRatio="xMidYMid slice">${shapes}</svg>`}</div>`;
}

function card(o) {
  const t = st.taken[o.id];
  return `<article class="card" data-open="${esc(o.id)}" tabindex="0" role="button">
    ${art(o)}<span class="badge">${t ? '' + esc(t.status) : esc(o.action || o.type)}</span>
    <div class="src-line">${esc(o.sourceName)}</div>
    <div class="card-body">
      <div class="cat c-${esc(o.cat)}">${esc(o.cat)}${o.org && o.org !== o.sourceName ? ' - ' + esc(o.org) : ''}</div>
      <h3>${esc(o.title)}</h3>
      <div class="sub">${esc(o.format || 'Format not stated')}${o.homeRegion && o.homeRegion !== 'Online' ? ' - ' + esc(o.homeRegion) : ''} - ${esc(o.costLabel)}<br>${dueTxt(o)}</div>
      <span class="more-pill">${matchLabel(o)}</span>
      <button class="menu" data-menu="${esc(o.id)}" aria-label="Save">${st.saved.includes(o.id) ? 'Saved' : '...'}</button>
    </div></article>`;
}
const rail = list => `<div class="rail">${list.map(card).join('')}</div>`;
const section = (title, sub, body, more) => `<section class="section fade"><div class="sec-head"><div><h2>${title}</h2>${sub ? `<p class="sub2">${sub}</p>` : ''}</div>${more || ''}</div>${body}</section>`;
const emptyBox = (icon, h, p) => `<div class="empty"><h3>${h}</h3><p>${p}</p></div>`;

function actions(o) {
  const t = st.taken[o.id], s = st.saved.includes(o.id);
  return `<button class="btn ${t ? 'done' : 'primary'}" data-take="${esc(o.id)}">${t ? 'Taken' : 'Take Opportunity'}</button>
    <button class="btn ${s ? 'on' : ''}" data-save="${esc(o.id)}">${s ? 'Saved' : 'Save'}</button>
    <button class="btn" data-share="${esc(o.id)}">Share</button>`;
}
function hero(o) {
  return `<button class="hero" data-open="${esc(o.id)}" aria-label="${esc(o.title)}">${art(o, true)}
    <div class="hero-copy"><div class="kicker">${esc(o.cat)} - ${esc(o.type)}</div><h1>${esc(o.title)}</h1>
    <div class="meta">${esc(o.sourceName)} - ${esc(o.location)} - ${esc(o.costLabel)}<br>${o.deadline ? 'Closes ' + fmt(o.deadline) : esc(o.dateText || '')}</div>
    <span class="go">VIEW OPPORTUNITY</span></div></button>
  <div class="facts">
    <div class="fact"><small>${o.deadline ? 'Deadline' : 'Date'}</small><b>${o.deadline ? fmt(o.deadline) : esc(o.dateText || 'Not stated')}</b></div>
    <div class="fact"><small>Location</small><b>${esc(o.location)}</b></div>
    <div class="fact"><small>Cost</small><b>${esc(o.costLabel)}</b></div>
    <p>${esc(o.summary)}<span class="actions">${actions(o)}</span></p></div>`;
}

function circles() {
  const ids = Object.keys(st.taken);
  if (!ids.length) return emptyBox('', 'Nothing here yet.', 'When you find something worth pursuing, tap Take Opportunity and it will appear here.');
  const items = ids.map(byId).filter(Boolean);
  const tags = {}; items.forEach(o => (o.tags || []).forEach(t => (tags[t] = (tags[t] || 0) + 1)));
  const list = items.filter(o => !circleFilter || (o.tags || []).includes(circleFilter)).sort((a, b) => st.taken[b.id].at.localeCompare(st.taken[a.id].at));
  return `<div class="circles">${Object.keys(tags).map(t => `<button class="circle ${circleFilter === t ? 'on' : ''}" data-circle="${esc(t)}"><span class="disc" style="background:${DISC[t] || '#555'}">${ICON[t] || esc(t.slice(0, 2).toUpperCase())}${tags[t] > 1 ? `<span class="n">${tags[t]}</span>` : ''}</span>${esc(t)}</button>`).join('')}</div>
    <div class="rail">${list.map(takenCard).join('')}</div>`;
}
function takenCard(o) {
  const t = st.taken[o.id], gone = !OPPS.find(x => x.id === o.id) || !live(o);
  return `<article class="card" data-open="${esc(o.id)}" tabindex="0" role="button">${art(o)}<span class="badge">${esc(t.status)}</span>
    <div class="card-body"><div class="cat c-${esc(o.cat)}">${esc(o.cat)}</div><h3>${esc(o.title)}</h3>
    <div class="sub">${esc(o.dateText || '')}${o.timeText ? ' - ' + esc(o.timeText) : ''}<br>${esc(o.location)}${st.slate.includes(o.id) ? ' - On your Slate ' : ''}${gone ? '<br>No longer listed by the source' : ''}</div></div></article>`;
}

function footer() {
  const checked = SOURCES.map(s => s.lastChecked).filter(Boolean).sort().pop();
  return `<div class="fade" style="margin-top:50px;color:var(--ink2);font-size:14px;text-align:center">Every opportunity links to its original source. Sources last checked ${checked ? ago(checked) : '-'} - <button data-sources style="color:var(--accent);font-weight:600;font-size:14px">See sources</button></div>`;
}
const fmtBar = () => `<div class="seg" role="group" aria-label="Format">${['All', 'Virtual', 'In person'].map(v => `<button class="${fmtF === v ? 'on' : ''}" data-fmt="${v}">${v.toUpperCase()}</button>`).join('')}</div><div class="fgroup" style="margin:-6px 0 22px"><small>LOCATION</small><div class="chips">${LOCS.map(v => `<button class="chip ${locF === v ? 'on' : ''}" data-loc="${v}">${v}</button>`).join('')}</div></div>`;
const groupsOf = o => {
  const g = [], d = o.discipline || [];
  if (d.includes('Film')) g.push('Film');
  if (d.some(x => ['Screenwriting', 'Writing'].includes(x))) g.push('Writing');
  if (d.some(x => ['Acting', 'Voice Acting'].includes(x))) g.push('Acting & Voice');
  if (d.some(x => ['Directing', 'Producing', 'Editing', 'Cinematography', 'Sound', 'Animation', 'VFX', 'Photography'].includes(x))) g.push('Behind the Camera');
  if (o.cat === 'Work' || d.includes('Career')) g.push('Industry');
  if (['Table read', 'Writing meetup', 'Critique group', 'Writers group', 'Writers lab', 'Volunteer'].includes(o.type) || ['meetup', 'scriptcamp', 'script-camp-conor'].includes(o.sourceId)) g.push('Communities');
  return g;
};
function scanBlock() {
  const last = SCANS.find(x => x.status === 'complete'), pend = SCANS.find(x => x.status === 'requested' || x.status === 'running');
  return `<button class="scan-btn" data-scan><span>SCAN FOR OPPORTUNITIES</span><small>${pend ? 'Scan requested ' + ago(pend.requestedAt) : last ? 'Last scan ' + ago(last.completedAt) + ' - ' + last.newCount + ' new - ' + last.updatedCount + ' updated' : 'No scan yet'}</small></button>`;
}

function render() {
  TODAY = todayStr();
  tabsEl.innerHTML = SECTIONS.map(s => `<button class="tab ${s === tab ? 'on' : ''}" data-tab="${s}">${s}</button>`).join('') +
    `<button class="icon-btn ${tab === 'Search' ? 'on' : ''}" data-tab="Search" aria-label="Search"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg></button>`;
  if (!loaded) { view.innerHTML = emptyBox('', 'Loading opportunities...', 'Reading the latest verified listings.'); return; }
  if (!dbOK) { view.innerHTML = emptyBox('', 'Opportunity data isn\'t available', 'The opportunity data could not be loaded. Try again in a moment.'); return; }
  if (tab === 'Search') return renderSearch();
  if (tab === 'Get Involved') return renderInvolved();
  const noneMsg = fmtF === 'All' ? 'Nothing open right now from the sources Scout checks.' : 'Nothing ' + fmtF.toLowerCase() + ' right now. Try ALL.';
  if (tab === 'Today') {
    const top = strong(), feat = top[0];
    if (!feat) { view.innerHTML = scanBlock() + fmtBar() + emptyBox('', 'No strong matches right now', noneMsg) + footer(); return; }
    const saved = st.saved.map(byId).filter(o => o && live(o) && fmtOK(o));
    const soon = top.filter(o => o.deadline && !st.taken[o.id] && o.id !== feat.id).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 6);
    view.innerHTML = scanBlock() + fmtBar() + `<div class="fade">${hero(feat)}</div>` +
      section('Top Opportunities', 'Selected based on your goals and interests.', rail(top.slice(1, 9))) +
      section('Opportunities You Took', 'Opportunities you\'re planning to attend or participate in.', circles()) +
      (saved.length ? section('Saved', 'Come back to these before the deadline.', rail(saved)) : '') +
      (soon.length ? section('Closing Soon', 'Verified deadlines coming up.', rail(soon)) : '') + footer();
  } else {
    const all = visible(tab), list = all.filter(o => score(o).s >= SHOW_MIN), more = all.filter(o => score(o).s < SHOW_MIN);
    const blurb = { Education:'HiSET, scholarships, college programs and aid.', Work:'Jobs, freelance, internships and paid creative work.', Creative:'Film first: learn, make, submit, audition and meet people.' }[tab];
    const head = `<div class="fade pg-hero"><h1>${tab}</h1><p>${blurb}</p></div>` + fmtBar();
    if (!all.length) {
      const srcs = SOURCES.filter(s => s.area === tab);
      view.innerHTML = head + emptyBox('', 'Nothing verified yet.', fmtF !== 'All' ? noneMsg : tab === 'Work' ? 'Contra and Upwork couldn\'t be read automatically. Scout won\'t show anything it can\'t confirm.' : noneMsg) + (srcs.length ? section('Sources', '', sourceList(srcs)) : '') + footer(); return;
    }
    const types = [...new Set(list.slice(1).map(o => o.type))];
    view.innerHTML = head + (list[0] ? `<div class="fade">${hero(list[0])}</div>` : '') +
      (list.length > 1 ? section('Top in ' + tab, 'Selected based on your goals and interests.', rail(list.slice(1, 9))) : '') +
      types.map(t => ({ t, l: list.slice(9).filter(o => o.type === t) })).filter(x => x.l.length).map(x => section(x.t, '', rail(x.l))).join('') +
      (more.length ? section('More to explore', 'Lower matches, still verified and open.', rail(more)) : '') + footer();
  }
  scrollTo(0, 0);
}

function renderInvolved() {
  const base = OPPS.filter(o => live(o) && o.verb && (o.cat === 'Creative' || o.cat === 'Work') && fmtOK(o));
  const inVerb = o => !verbF || o.verb === verbF, inGroup = o => !groupF || groupsOf(o).includes(groupF);
  const list = base.filter(o => inVerb(o) && inGroup(o)).sort((a, b) => score(b).s - score(a).s);
  const verbChips = VERBS.map(v => { const n = base.filter(o => inGroup(o) && o.verb === v).length; return `<button class="chip ${verbF === v ? 'on' : ''}" ${n || verbF === v ? '' : 'style="opacity:.45"'} data-verb="${v}">${v.toUpperCase()} <span style="opacity:.6">${n}</span></button>`; }).join('');
  const circ = GROUPS.map(([g]) => { const n = base.filter(o => inVerb(o) && groupsOf(o).includes(g)).length; return `<button class="circle ${groupF === g ? 'on' : ''}" data-group="${g}"><span class="disc" style="background:#1c1c1e;${n ? '' : 'opacity:.4'}">Gi+${n ? `<span class="n">${n}</span>` : ''}</span>${g}</button>`; }).join('');
  view.innerHTML = `<div class="fade pg-hero"><h1>Get Involved</h1><p>Things you can actually do: join, apply, submit, audition. Same opportunities, filtered by what you can act on.</p></div>` + fmtBar() +
    `<div class="chips" style="margin:6px 0 18px">${verbChips}</div><div class="circles">${circ}</div>` +
    (list.length ? (groupF || verbF ? `<div class="grid">${list.map(card).join('')}</div>` : GROUPS.map(([g]) => ({ g, l: list.filter(o => groupsOf(o).includes(g)) })).filter(x => x.l.length).map(x => section(x.g, '', rail(x.l))).join('')) :
      emptyBox('', 'Nothing here yet.', (verbF === 'Submit' || verbF === 'Audition' || verbF === 'Enter' || verbF === 'Pitch') ? 'Scout hasn\'t verified any open ' + verbF.toLowerCase() + ' opportunities yet. Festival and casting sites like FilmFreeway block automated reading, so those need another route.' : 'No open opportunities match these filters.')) + footer();
}

const ACCESS_COLOR = { 'Public':'#0a7d4f', 'Authenticated':'#0a7d4f', 'Needs Sign-In':'#b36b00', 'Restricted':'#b3261e', 'Unavailable':'#b3261e', 'No Current Opportunities':'#6e6e73' };
function sourceList(list) {
  return `<div class="grid">${list.map(s => { const a = s.access || s.status; return `<div class="empty" style="text-align:left;padding:20px"><div class="cat" style="color:${ACCESS_COLOR[a] || '#6e6e73'}">${esc(a)} - ${s.found} stored</div><h3 style="font-size:19px;margin:6px 0">${esc(s.name)}</h3><p style="font-size:14px;margin:0;max-width:none">${esc(s.note)}</p>${s.method ? `<p style="font-size:13px;margin:8px 0 0;max-width:none"><b>Method:</b> ${esc(s.method)}</p>` : ''}${s.sustainable ? `<p style="font-size:13px;margin:4px 0 0;max-width:none"><b>Long-term:</b> ${esc(s.sustainable)}</p>` : ''}${s.connectLater ? `<p style="font-size:13px;margin:4px 0 0;max-width:none"><b>Would need:</b> ${esc(s.connectLater)}</p>` : ''}<p style="font-size:13px;margin-top:8px"><a class="src" style="margin:0" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, ''))}</a> - checked ${ago(s.lastChecked)}</p></div>`; }).join('')}</div>`;
}
function showSources() {
  sheet.hidden = false; sheet.dataset.id = ''; sheet.dataset.kind = 'sources'; sheet.scrollTop = 0;
  sheet.innerHTML = `<button class="close" data-close aria-label="Close">Close</button><div class="d-wrap" style="max-width:1100px"><div class="pg-hero"><h1>Sources</h1><p>Scout only lists opportunities it could read from these pages. Anything it couldn\'t verify is left out.</p></div>${sourceList(SOURCES.slice().sort((a, b) => b.found - a.found))}</div>`;
}
function showScan() {
  sheet.hidden = false; sheet.dataset.id = ''; sheet.dataset.kind = 'scan'; const y = sheet.scrollTop;
  const pend = SCANS.find(x => x.status === 'requested' || x.status === 'running'), last = SCANS.find(x => x.status === 'complete');
  const mark = {};
  let body = '';
  if (pend) body += `<div class="empty" style="margin-bottom:24px"><h3>Scan requested</h3><p>Requested ${ago(pend.requestedAt)}. Scans run from Claude\'s side because this page can\'t open other websites. This screen updates as soon as the results are written.</p></div>`;
  else body += `<div class="empty" style="margin-bottom:24px"><h3>Check all sources now</h3><p>This sends a scan request. It doesn\'t run in your browser: a page here can\'t read other websites or hold your logins.</p><div class="actions" style="justify-content:center"><button class="btn primary" data-startscan>Request a scan</button></div></div>`;
  if (last) {
    const ss = Object.values(last.sourceStates || {}).sort((a, b) => b.found - a.found);
    body += `<h2 style="font-size:26px;margin:0 0 6px">${pend ? 'Last scan' : 'SCAN COMPLETE'}</h2><p class="sub2" style="color:var(--ink2);margin:0 0 16px">${ago(last.completedAt)}</p>
      <div class="info-grid"><div class="info"><small>New</small><b>${last.newCount}</b></div><div class="info"><small>Updated</small><b>${last.updatedCount}</b></div><div class="info"><small>Expired</small><b>${last.expiredCount}</b></div><div class="info"><small>Need sign-in</small><b>${(last.needSignIn || []).length}</b></div><div class="info"><small>Restricted or unavailable</small><b>${(last.restricted || []).length + (last.unavailable || []).length}</b></div></div>
      <div class="box" style="background:var(--card);border-radius:14px;padding:6px 18px;margin-bottom:18px">${ss.map(x => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:16px"><span>${esc(x.name)}</span><span style="color:var(--ink2)">${x.found ? x.found + ' found' : esc(x.access)}</span></div>`).join('')}</div>
      ${last.note ? `<p class="sub2" style="color:var(--ink2)">${esc(last.note)}</p>` : ''}`;
  }
  body += `<p style="margin-top:18px"><button data-sources style="color:var(--accent);font-weight:600;font-size:16px">How each source is accessed</button></p>`;
  sheet.innerHTML = `<button class="close" data-close aria-label="Close">Close</button><div class="d-wrap"><div class="pg-hero"><h1>Scan for Opportunities</h1></div>${body}</div>`;
  sheet.scrollTop = y;
}

function matches(o) {
  const t = q.text.trim().toLowerCase();
  if (t && !((o.title || '') + (o.summary || '') + (o.type || '') + (o.org || '') + (o.tags || []).join(' ')).toLowerCase().includes(t)) return false;
  if (q.cat !== 'Any' && o.cat !== q.cat) return false;
  if (q.loc !== 'Any') {
    const l = (o.location || '') + ' ' + (o.mode || '');
    if (q.loc === 'Online' ? !/Online/.test(l) : q.loc === 'Anywhere' ? !/Online|Anywhere/.test(l) : !l.includes(q.loc)) return false;
  }
  if (q.cost !== 'Any') {
    const c = o.costNum; if (c == null) return false;
    if (q.cost === 'Free' && c !== 0) return false; if (q.cost === 'Paid' && !(c > 0)) return false;
    if (q.cost === 'Under $25' && !(c < 25)) return false; if (q.cost === 'Under $100' && !(c < 100)) return false;
  }
  if (q.date !== 'Any') {
    const ref = o.startsOn || o.deadline; if (!ref) return false; const d = daysFrom(ref);
    if (q.date === 'Today' && d !== 0) return false; if (q.date === 'This week' && !(d >= 0 && d <= 7)) return false;
    if (q.date === 'This month' && !(d >= 0 && d <= 31)) return false; if (q.date === 'Upcoming' && d < 0) return false;
  }
  return live(o) && fmtOK(o);
}
function renderSearch() {
  const grp = (k, label, opts) => `<div class="fgroup"><small>${label}</small><div class="chips">${['Any', ...opts].map(v => `<button class="chip ${q[k] === v ? 'on' : ''}" data-f="${k}" data-v="${v}">${v}</button>`).join('')}</div></div>`;
  view.innerHTML = `<div class="fade"><div class="pg-hero"><h1>Search</h1></div>${fmtBar()}
    <label class="searchbar"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6e6e73" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="qi" placeholder="Search opportunities" value="${esc(q.text)}" autocomplete="off"></label>
    <div class="filters">${grp('cat', 'Category', SECTIONS.slice(1))}${grp('loc', 'Location', ['Online','Hammond','Baton Rouge','New Orleans','Louisiana','Anywhere'])}${grp('cost', 'Cost', ['Free','Paid','Under $25','Under $100'])}${grp('date', 'Date', ['Today','This week','This month','Upcoming'])}</div>
    <div id="results"></div></div>`;
  results();
  const qi = $('#qi'); qi.addEventListener('input', () => { q.text = qi.value; results(); });
}
function results() {
  const r = OPPS.filter(matches).sort((a, b) => score(b).s - score(a).s);
  $('#results').innerHTML = r.length ? `<div class="grid">${r.map(card).join('')}</div>` : emptyBox('', 'No matches', 'Try loosening a filter. Scout only searches verified, open opportunities.');
}

function detail(id) {
  const o = byId(id); if (!o) return;
  const t = st.taken[id], onSlate = st.slate.includes(id);
  sheet.hidden = false; sheet.scrollTop = 0;
  sheet.innerHTML = `<button class="close" data-close aria-label="Close">Close</button>
  <div class="d-hero">${art(o, true)}
    <div class="d-glass"><div class="kicker">${esc(o.cat)} - ${esc(o.action || '')} - ${esc(o.format || 'Format not stated')}${o.verb ? ' - ' + esc(o.verb) : ''}</div><h1>${esc(o.title)}</h1><div class="by">${esc(o.org || o.sourceName)} - ${esc(o.type)}</div>
      <div class="gfacts"><div><small>Date</small><b>${nextOcc(o) ? 'Next: ' + fmt(nextOcc(o)) : ''}${nextOcc(o) && o.dateText ? '<br><span style="font-weight:400;font-size:12px">' + esc(o.dateText) + '</span>' : esc(nextOcc(o) ? '' : (o.dateText || 'Not stated'))}</b></div><div><small>Time</small><b>${esc(o.timeText || 'Not stated')}</b></div>
      <div><small>Location</small><b>${esc(o.location || 'Not stated')}</b></div><div><small>Cost</small><b>${esc(o.costLabel)}</b></div>
      <div><small>Deadline</small><b>${o.deadline ? fmt(o.deadline) : 'Not stated'}</b></div></div>
      <a class="gtile" href="${esc(o.url)}" target="_blank" rel="noopener"><span class="th">${art(o)}</span><span style="flex:1"><small>VIEW ORIGINAL SOURCE</small><b>${esc(o.sourceName)}</b></span><span></span></a>
      <div class="gbtns"><button class="btn ${t ? 'done' : ''}" data-take="${esc(id)}">${t ? 'Taken' : 'Take Opportunity'}</button>
      <button class="btn ${st.saved.includes(id) ? 'on' : ''}" data-save="${esc(id)}">${st.saved.includes(id) ? 'Saved' : 'Save'}</button>
      <button class="btn" data-share="${esc(id)}">Share</button></div>
      <p class="gdesc">${esc(o.summary)}</p></div></div>
  <div class="two-col"><div><h2>Why this is a good fit</h2><div class="hint">${matchLabel(o)}</div><div class="box">${esc(why(o))}</div>
    ${o.format === 'Virtual' || o.format === 'Hybrid' ? `<div class="box"><small style="color:var(--ink2);font-weight:700;font-size:11px;letter-spacing:.07em">FROM LOUISIANA</small><br>${o.format === 'Virtual' ? 'You can take part remotely.' : 'Part of this can be done remotely.'}${o.homeRegion && o.homeRegion !== 'Online' ? ' Based in ' + esc(o.homeRegion) + '.' : ''}</div>` : ''}<div class="box"><small style="color:var(--ink2);font-weight:700;font-size:11px;letter-spacing:.07em">VERIFIED</small><br>Read from ${esc(o.sourceName)} - checked ${ago(o.lastChecked)}${o.imageCredit ? '<br><span style="font-size:13px;color:var(--ink2)">' + esc(o.imageCredit) + (o.imageSource ? ' - <a class="src" style="margin:0;font-size:13px" href="' + esc(o.imageSource) + '" target="_blank" rel="noopener">photo page</a>' : '') + '</span>' : ''}${(o.sourceRefs || []).length > 1 ? '<br>Also listed: ' + o.sourceRefs.slice(1).map(r => `<a class="src" style="margin:0" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>`).join(', ') : ''}</div>
    ${o.eligibility ? `<div class="box"><small style="color:var(--ink2);font-weight:700;font-size:11px;letter-spacing:.07em">ELIGIBILITY</small><br>${esc(o.eligibility)}</div>` : ''}
    ${o.deadlineNote || o.note ? `<div class="box">${esc(o.deadlineNote || '')} ${esc(o.note || '')}</div>` : ''}</div>
    <div><h2>Your plan</h2><div class="hint">${t ? 'Taken ' + fmt(t.at) : 'Not taken yet'}</div>
    ${t ? `<div class="step">STATUS</div><div class="chips">${STATUSES.map(s => `<button class="chip ${t.status === s ? 'on' : ''}" data-status="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <div class="step">SLATE</div><p class="body">Opportunity Scout finds things. Slate is where you schedule them.</p>
      <button class="btn ${onSlate ? 'done' : 'primary'}" data-slate="${esc(id)}">${onSlate ? 'On your Slate' : 'Add to Slate'}</button>`
    : `<p class="body">Tap <b>Take Opportunity</b> to commit to this. It will move to "Opportunities You Took" and you can add it to Slate.</p>`}
    <div class="step">DETAILS</div><p class="body">${esc(o.summary)}</p><div class="actions" style="margin-top:22px"><button class="btn" data-dismiss="${esc(id)}">Not for me</button></div></div></div>`;
  sheet.dataset.id = id; sheet.dataset.kind = 'detail';
}
const refreshDetail = () => { if (!sheet.hidden && sheet.dataset.id) { const y = sheet.scrollTop; detail(sheet.dataset.id); sheet.scrollTop = y; } };
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }
const closeSheet = () => { sheet.hidden = true; sheet.dataset.id = ''; sheet.dataset.kind = ''; render(); };

document.addEventListener('click', e => {
  const g = a => e.target.closest(`[${a}]`); let el;
  if ((el = g('data-menu'))) { e.stopPropagation(); toggleSave(el.dataset.menu); return; }
  if ((el = g('data-take'))) { const id = el.dataset.take; if (st.taken[id]) { delete st.taken[id]; toast('Removed from Opportunities You Took'); } else { const o = byId(id); st.taken[id] = { status:'Planning to attend', at:TODAY, snap:o }; toast('Taken - added to Opportunities You Took'); } persist(); refreshDetail(); if (sheet.hidden) render(); return; }
  if ((el = g('data-save'))) { toggleSave(el.dataset.save); return; }
  if ((el = g('data-share'))) { const o = byId(el.dataset.share); if (navigator.share) navigator.share({ title:o.title, url:o.url }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(o.url).then(() => toast('Source link copied'), () => toast('Copy isn\'t available here')); return; }
  if ((el = g('data-fmt'))) { fmtF = el.dataset.fmt; const y = scrollY; render(); scrollTo(0, y); return; }
  if ((el = g('data-loc'))) { locF = el.dataset.loc; const y = scrollY; render(); scrollTo(0, y); return; }
  if ((el = g('data-verb'))) { verbF = verbF === el.dataset.verb ? null : el.dataset.verb; render(); return; }
  if ((el = g('data-group'))) { groupF = groupF === el.dataset.group ? null : el.dataset.group; render(); return; }
  if (g('data-scan')) { showScan(); return; }
  if (g('data-startscan')) { if (staticMode) { toast('Scans run from Claude. Open the app in Claude to request one.'); return; } if (db) { const id = 'scan-' + Date.now(); db.collection('scans').doc(id).set({ status: 'requested', requestedAt: new Date().toISOString(), newCount: 0, updatedCount: 0, expiredCount: 0 }).then(() => toast('Scan requested'), () => toast('Couldn\'t send the request')); } return; }
  if ((el = g('data-dismiss'))) { const id = el.dataset.dismiss; if (!st.dismissed.includes(id)) st.dismissed.push(id); persist(); toast('Hidden from your feed'); closeSheet(); return; }
  if ((el = g('data-slate'))) { const id = el.dataset.slate; if (!st.slate.includes(id)) { st.slate.push(id); if (st.taken[id]) st.taken[id].status = 'Added to Slate'; const o = byId(id); try { localStorage.setItem('slate.inbox', JSON.stringify([...(JSON.parse(localStorage.getItem('slate.inbox') || '[]')), { id, title:o.title, date:o.startsOn, deadline:o.deadline, time:o.timeText, location:o.location, url:o.url }])); } catch (er) {} toast('Added to Slate'); } persist(); refreshDetail(); return; }
  if ((el = g('data-status'))) { st.taken[sheet.dataset.id].status = el.dataset.status; persist(); refreshDetail(); return; }
  if (g('data-close')) { closeSheet(); return; }
  if (g('data-sources')) { showSources(); return; }
  if ((el = g('data-circle'))) { circleFilter = circleFilter === el.dataset.circle ? null : el.dataset.circle; const y = scrollY; render(); scrollTo(0, y); return; }
  if ((el = g('data-f'))) { q[el.dataset.f] = el.dataset.v; renderSearch(); return; }
  if ((el = g('data-tab'))) { tab = el.dataset.tab; render(); return; }
  if ((el = g('data-open'))) { detail(el.dataset.open); }
});
function toggleSave(id) { const i = st.saved.indexOf(id); i < 0 ? st.saved.push(id) : st.saved.splice(i, 1); persist(); toast(i < 0 ? 'Saved' : 'Removed from Saved'); refreshDetail(); if (sheet.hidden) { const y = scrollY; render(); scrollTo(0, y); } }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); if (e.key === 'Enter' && e.target.dataset && e.target.dataset.open) detail(e.target.dataset.open); });
boot();
})();
