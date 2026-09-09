/* =========================================================
   1. SUPABASE CONFIG — replace with YOUR project's values.
   Supabase dashboard → Project Settings → API.
   ========================================================= */
const SUPABASE_URL = "https://balaeixgbhcxwhukhbjl.supabase.co/";       // e.g. https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbGFlaXhnYmhjeHdodWtoYmpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4OTE4NTIsImV4cCI6MjEwNDQ2Nzg1Mn0.MIU81DDeb8tVlRNQuWrw-srnoRFb-2cQyJ78uVWR4pw";  // the "anon public" key, never the service_role key

const CONFIG_IS_SET = SUPABASE_URL !== "REPLACE_ME" && SUPABASE_ANON_KEY !== "REPLACE_ME";

let supabase = null;
let currentSession = null;
let currentProfile = null;
let chosenRole = null;
let authMode = 'login'; // 'login' | 'signup'

let farmerProductsCache = [];
let farmerRequestsCache = [];
let marketplaceCache = [];
let buyerOrdersCache = [];
let adminUsersCache = [];

// Filters & date ranges
let farmerListingFilter = { name:'', category:'all', status:'all', dateFrom:'', dateTo:'' };
let marketplaceFilter = { name:'', category:'all', status:'all', farmer:'all', dateFrom:'', dateTo:'' };
let farmerRequestFilter = 'action';
let buyerOrderFilter = 'action';
let farmerRequestDateFilter = { from:'', to:'' };
let buyerOrderDateFilter = { from:'', to:'' };
let adminPendingDateFilter = { from:'', to:'' };
let adminAllDateFilter = { from:'', to:'' };
let farmerReportDateFilter = { from:'', to:'' };
let buyerReportDateFilter = { from:'', to:'' };
let adminReportDateFilter = { from:'', to:'' };
const CATEGORY_LIST = ['Vegetables','Fruits','Grains','Pulses','Dairy','Spices','Other'];

let modalOrderId = null;
let modalViewerRole = null;

/* ---------- BOOT ---------- */
window.addEventListener('load', init);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOrderId) closeOrderModal(); });

async function init(){
  if (!CONFIG_IS_SET) { showView('view-setup'); return; }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  supabase.auth.onAuthStateChange((_event, session) => { handleAuthChange(session); });
  const { data: { session } } = await supabase.auth.getSession();
  handleAuthChange(session);

  document.getElementById('btn-logout').addEventListener('click', () => supabase.auth.signOut());
}

async function handleAuthChange(session){
  currentSession = session;
  if (!session) { currentProfile = null; setUserChip(false); showView('view-auth'); return; }
  await loadProfileAndRoute();
}

/* ---------- VIEW HELPERS ---------- */
function showView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function setUserChip(show){ document.getElementById('topbar-user').style.display = show ? 'flex' : 'none'; }
function esc(str){ return String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function formatDT(ts){ return ts ? new Date(ts).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'; }

/* ---------- AUTH: email + password login / signup ---------- */
function selectRole(role){
  chosenRole = role;
  document.querySelectorAll('.role-option').forEach(el => el.classList.toggle('selected', el.dataset.role === role));
}

function toggleAuthMode(){
  authMode = authMode === 'login' ? 'signup' : 'login';
  document.getElementById('auth-message').innerHTML = '';
  if (authMode === 'signup') {
    document.getElementById('auth-heading').textContent = 'Create your account';
    document.getElementById('auth-subheading').textContent = 'Pick a role, then set an email and password.';
    document.getElementById('auth-role-step').style.display = 'block';
    document.getElementById('auth-password').setAttribute('autocomplete', 'new-password');
    document.getElementById('btn-auth-submit').textContent = 'Create account';
    document.getElementById('auth-toggle-link').textContent = 'Already have an account? Log in';
  } else {
    document.getElementById('auth-heading').textContent = 'Welcome back';
    document.getElementById('auth-subheading').textContent = 'Log in with your email and password.';
    document.getElementById('auth-role-step').style.display = 'none';
    document.getElementById('auth-password').setAttribute('autocomplete', 'current-password');
    document.getElementById('btn-auth-submit').textContent = 'Log in';
    document.getElementById('auth-toggle-link').textContent = 'New here? Create an account';
  }
}

async function submitAuth(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const msgEl = document.getElementById('auth-message');
  msgEl.innerHTML = '';

  if (!email || !email.includes('@')) { msgEl.innerHTML = '<div class="notice error" style="margin-top:12px;">Enter a valid email address.</div>'; return; }
  if (!password || password.length < 6) { msgEl.innerHTML = '<div class="notice error" style="margin-top:12px;">Password should be at least 6 characters.</div>'; return; }
  if (authMode === 'signup' && !chosenRole) { msgEl.innerHTML = '<div class="notice error" style="margin-top:12px;">Pick "Farmer" or "Buyer" above.</div>'; return; }

  const btn = document.getElementById('btn-auth-submit');
  btn.disabled = true;

  if (authMode === 'signup') {
    const { data, error } = await supabase.auth.signUp({ email, password });
    btn.disabled = false;
    if (error) { msgEl.innerHTML = `<div class="notice error" style="margin-top:12px;">${esc(error.message)}</div>`; return; }
    if (!data.session) {
      // Only happens if "Confirm email" is still turned on in Supabase — see README to disable it.
      msgEl.innerHTML = '<div class="notice" style="margin-top:12px;">Account created. If your project still requires email confirmation, check your inbox — otherwise you should be logged in automatically.</div>';
      return;
    }
    // onAuthStateChange fires and routes onward; profile gets created with chosenRole.
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) { msgEl.innerHTML = `<div class="notice error" style="margin-top:12px;">${esc(error.message)}</div>`; return; }
    // onAuthStateChange fires and routes onward.
  }
}

/* ---------- PROFILE: load + route ---------- */
async function loadProfileAndRoute(){
  const uid = currentSession.user.id;
  const email = currentSession.user.email;
  let { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (!profile) {
    const role = chosenRole || 'buyer';
    const { data: inserted, error } = await supabase.from('profiles').insert({ id: uid, email, role }).select().maybeSingle();
    if (error) { console.error(error); return; }
    profile = inserted;
  }
  currentProfile = profile;
  route();
}

function route(){
  setUserChip(true);
  document.getElementById('topbar-email').textContent = currentProfile.email;
  const badge = document.getElementById('topbar-role');
  badge.textContent = currentProfile.role;
  badge.className = 'badge ' + currentProfile.role;

  if (currentProfile.role === 'admin') { showView('view-admin'); loadAdminData(); return; }
  if (!currentProfile.name) { showView(currentProfile.role === 'farmer' ? 'view-profile-farmer' : 'view-profile-buyer'); return; }
  if (currentProfile.status === 'pending')   { document.getElementById('pending-role').textContent = currentProfile.role; showView('view-pending'); return; }
  if (currentProfile.status === 'rejected')  { showView('view-rejected'); return; }
  if (currentProfile.status === 'suspended') { showView('view-suspended'); return; }
  if (currentProfile.role === 'farmer') { showView('view-farmer'); loadFarmerData(); }
  else { showView('view-buyer'); loadBuyerData(); }
}

/* ---------- DISTANCE (real geocoding + Haversine, same approach as the demo) ---------- */
const geocodeCache = {};
async function geocodePincode(pincode){
  if (pincode in geocodeCache) return geocodeCache[pincode];
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(pincode)}&country=India&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    if (data && data[0]) {
      const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      geocodeCache[pincode] = coords;
      return coords;
    }
  } catch (e) { console.error('Geocoding failed', e); }
  geocodeCache[pincode] = null;
  return null;
}
function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function actualDistanceKm(a, b){
  if (!a || !b || a.lat == null || b.lat == null) return null;
  return Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon));
}
function distanceHtml(a, b){
  const km = actualDistanceKm(a, b);
  if (km === null) return '<span class="dist-cell">— location unavailable</span>';
  return `<span class="dist-cell">~${km} km <span title="Straight-line distance between geocoded PIN codes.">ⓘ</span></span>`;
}
function inDateRange(ts, fromStr, toStr){
  if (!ts) return !fromStr && !toStr;
  const t = new Date(ts).getTime();
  if (fromStr) { const fromTs = new Date(fromStr + 'T00:00:00').getTime(); if (t < fromTs) return false; }
  if (toStr) { const toTs = new Date(toStr + 'T23:59:59').getTime(); if (t > toTs) return false; }
  return true;
}
function categorySelectOptions(current){
  return `<option value="all" ${current==='all'?'selected':''}>All</option>` +
    CATEGORY_LIST.map(c => `<option value="${c}" ${current===c?'selected':''}>${c}</option>`).join('');
}
function matchesFarmerListingFilter(p, status){
  const f = farmerListingFilter;
  if (f.name && !p.name.toLowerCase().includes(f.name.toLowerCase())) return false;
  if (f.category !== 'all' && p.category !== f.category) return false;
  if (f.status !== 'all' && status !== f.status) return false;
  if (!inDateRange(p.listed_at, f.dateFrom, f.dateTo)) return false;
  return true;
}
function matchesMarketplaceFilter(p, status){
  const f = marketplaceFilter;
  if (f.name && !p.name.toLowerCase().includes(f.name.toLowerCase())) return false;
  if (f.category !== 'all' && p.category !== f.category) return false;
  if (f.status !== 'all' && status !== f.status) return false;
  if (f.farmer !== 'all' && p.farmer_id !== f.farmer) return false;
  if (!inDateRange(p.listed_at, f.dateFrom, f.dateTo)) return false;
  return true;
}
function setFarmerListingFilter(key, value){ farmerListingFilter[key] = value; renderFarmerProducts(); }
function clearFarmerListingDateFilter(){
  farmerListingFilter.dateFrom = ''; farmerListingFilter.dateTo = '';
  document.getElementById('farmer-listing-date-from').value = '';
  document.getElementById('farmer-listing-date-to').value = '';
  renderFarmerProducts();
}
function setMarketplaceFilter(key, value){ marketplaceFilter[key] = value; renderMarketplace(); }
function clearMarketplaceDateFilter(){
  marketplaceFilter.dateFrom = ''; marketplaceFilter.dateTo = '';
  document.getElementById('market-date-from').value = '';
  document.getElementById('market-date-to').value = '';
  renderMarketplace();
}

/* ---------- REQUEST/ORDER STATUS SUB-TABS ---------- */
function needsAction(o, viewerRole){
  if (o.status === 'pending') return true;
  if (o.status === 'accepted') {
    if (!o.delivery_method) return true;
    if (viewerRole === 'farmer' && !o.delivered_at) return true;
    if (viewerRole === 'buyer' && o.delivered_at && !o.received_at) return true;
  }
  return false;
}
function isCompletedOrder(o){ return o.status === 'accepted' && !!o.delivered_at && !!o.received_at; }
function countByStatus(list, viewerRole){
  return {
    action: list.filter(o => needsAction(o, viewerRole)).length,
    pending: list.filter(o => o.status === 'pending').length,
    accepted: list.filter(o => o.status === 'accepted' && !isCompletedOrder(o)).length,
    completed: list.filter(isCompletedOrder).length,
    declined: list.filter(o => o.status === 'declined').length,
    all: list.length
  };
}
function filterByTab(list, key, viewerRole){
  if (key === 'all') return list;
  if (key === 'action') return list.filter(o => needsAction(o, viewerRole));
  if (key === 'completed') return list.filter(isCompletedOrder);
  if (key === 'accepted') return list.filter(o => o.status === 'accepted' && !isCompletedOrder(o));
  return list.filter(o => o.status === key);
}
function renderRequestSubtabs(containerId, list, currentFilter, fnName, viewerRole){
  const counts = countByStatus(list, viewerRole);
  const tabs = [['action','Action needed'],['pending','Pending'],['accepted','Accepted'],['completed','Completed'],['declined','Declined'],['all','All']];
  document.getElementById(containerId).innerHTML = tabs.map(([key,label]) =>
    `<button class="subtab-btn ${currentFilter===key?'active':''}" onclick="${fnName}('${key}')">${label} (${counts[key]})</button>`
  ).join('');
}
function setFarmerRequestFilter(f){ farmerRequestFilter = f; renderFarmerRequests(); }
function clearFarmerRequestDateFilter(){
  farmerRequestDateFilter = { from:'', to:'' };
  document.getElementById('farmer-req-date-from').value = '';
  document.getElementById('farmer-req-date-to').value = '';
  renderFarmerRequests();
}
function setFarmerRequestDateFilter(key, value){ farmerRequestDateFilter[key] = value; renderFarmerRequests(); }
function setBuyerOrderFilter(f){ buyerOrderFilter = f; renderBuyerOrders(); }
function clearBuyerOrderDateFilter(){
  buyerOrderDateFilter = { from:'', to:'' };
  document.getElementById('buyer-req-date-from').value = '';
  document.getElementById('buyer-req-date-to').value = '';
  renderBuyerOrders();
}
function setBuyerOrderDateFilter(key, value){ buyerOrderDateFilter[key] = value; renderBuyerOrders(); }

function partyLabel(profile){
  if (!profile) return 'Unknown';
  const loc = profile.village || (profile.address ? profile.address.split(',')[0].trim() : '');
  return loc ? `${esc(profile.name)}<br><span class="helptext" style="margin-top:0;">${esc(loc)}</span>` : esc(profile.name);
}

/* ---------- PROFILE FORMS ---------- */
async function saveFarmerProfile(){
  const name = document.getElementById('pf-name').value.trim();
  const mobile = document.getElementById('pf-mobile').value.trim();
  const land = document.getElementById('pf-land').value.trim();
  const village = document.getElementById('pf-village').value.trim();
  const pincode = document.getElementById('pf-pincode').value.trim();
  const msg = document.getElementById('pf-message');
  if (!name || !mobile || !land || !village || !pincode) { msg.innerHTML = '<div class="notice error" style="margin-top:12px;">Please fill in every field.</div>'; return; }
  if (!/^\d{10}$/.test(mobile)) { msg.innerHTML = '<div class="notice error" style="margin-top:12px;">Mobile number should be 10 digits.</div>'; return; }
  if (!/^\d{6}$/.test(pincode)) { msg.innerHTML = '<div class="notice error" style="margin-top:12px;">PIN code should be 6 digits.</div>'; return; }
  msg.innerHTML = '<div class="notice" style="margin-top:12px;">Locating your village...</div>';
  const coords = await geocodePincode(pincode);
  const { error } = await supabase.from('profiles').update({
    name, mobile, land, village, pincode, lat: coords?.lat ?? null, lon: coords?.lon ?? null
  }).eq('id', currentSession.user.id);
  if (error) { msg.innerHTML = `<div class="notice error" style="margin-top:12px;">${esc(error.message)}</div>`; return; }
  await loadProfileAndRoute();
}
async function saveBuyerProfile(){
  const name = document.getElementById('pb-name').value.trim();
  const mobile = document.getElementById('pb-mobile').value.trim();
  const address = document.getElementById('pb-address').value.trim();
  const pincode = document.getElementById('pb-pincode').value.trim();
  const msg = document.getElementById('pb-message');
  if (!name || !mobile || !address || !pincode) { msg.innerHTML = '<div class="notice error" style="margin-top:12px;">Please fill in every field.</div>'; return; }
  if (!/^\d{10}$/.test(mobile)) { msg.innerHTML = '<div class="notice error" style="margin-top:12px;">Mobile number should be 10 digits.</div>'; return; }
  if (!/^\d{6}$/.test(pincode)) { msg.innerHTML = '<div class="notice error" style="margin-top:12px;">PIN code should be 6 digits.</div>'; return; }
  msg.innerHTML = '<div class="notice" style="margin-top:12px;">Locating your address...</div>';
  const coords = await geocodePincode(pincode);
  const { error } = await supabase.from('profiles').update({
    name, mobile, address, pincode, lat: coords?.lat ?? null, lon: coords?.lon ?? null
  }).eq('id', currentSession.user.id);
  if (error) { msg.innerHTML = `<div class="notice error" style="margin-top:12px;">${esc(error.message)}</div>`; return; }
  await loadProfileAndRoute();
}

/* ---------- TABS ---------- */
function switchTab(section, tab){
  document.querySelectorAll('.tab-btn').forEach(b => { if (b.dataset.tab.startsWith(section)) b.classList.toggle('active', b.dataset.tab === `${section}-${tab}`); });
  document.querySelectorAll(`[id^="${section}-tab-"]`).forEach(el => { el.style.display = el.id === `${section}-tab-${tab}` ? 'block' : 'none'; });
  if (tab === 'profile') toggleProfileView(section, false);
  if (tab === 'report') {
    if (section === 'farmer') renderFarmerReport();
    else if (section === 'buyer') renderBuyerReport();
    else if (section === 'admin') renderAdminReport();
  }
}
function toggleProfileView(role, forceState){
  const card = document.getElementById(role + '-profile-view');
  const btn = document.getElementById('btn-toggle-' + role + '-profile');
  const show = typeof forceState === 'boolean' ? forceState : card.style.display === 'none';
  card.style.display = show ? 'block' : 'none';
  btn.textContent = show ? 'Hide profile' : 'View profile';
  if (show) renderProfileView(role);
}
function renderProfileView(role){
  const p = currentProfile;
  const el = document.getElementById(role + '-profile-view');
  if (role === 'farmer') {
    el.innerHTML = `
      <div class="contact-block"><b>Name</b>${esc(p.name)}</div>
      <div class="contact-block"><b>Mobile</b>${esc(p.mobile)}</div>
      <div class="contact-block"><b>Land space</b>${esc(p.land)}</div>
      <div class="contact-block"><b>Village</b>${esc(p.village)}</div>
      <div class="contact-block"><b>PIN code</b>${esc(p.pincode)}</div>
      <p class="helptext">Joined ${formatDT(p.created_at)}.</p>`;
  } else {
    el.innerHTML = `
      <div class="contact-block"><b>Name</b>${esc(p.name)}</div>
      <div class="contact-block"><b>Mobile</b>${esc(p.mobile)}</div>
      <div class="contact-block"><b>Address</b>${esc(p.address)}</div>
      <div class="contact-block"><b>PIN code</b>${esc(p.pincode)}</div>
      <p class="helptext">Joined ${formatDT(p.created_at)}.</p>`;
  }
}

/* ---------- FARMER: add-produce form visibility ---------- */
function toggleAddForm(forceState){
  const card = document.getElementById('add-product-card');
  const btn = document.getElementById('btn-toggle-add-form');
  const show = typeof forceState === 'boolean' ? forceState : card.style.display === 'none';
  card.style.display = show ? 'block' : 'none';
  btn.style.display = show ? 'none' : 'inline-block';
  if (!show) document.getElementById('product-form-message').innerHTML = '';
}

/* ---------- FARMER DATA ---------- */
async function loadFarmerData(){
  await renderFarmerProducts();
  await renderFarmerRequests();
}

async function addProduct(){
  const name = document.getElementById('p-name').value.trim();
  const category = document.getElementById('p-category').value;
  const price = parseFloat(document.getElementById('p-price').value);
  const unit = document.getElementById('p-unit').value;
  const qty = parseFloat(document.getElementById('p-qty').value);
  const notes = document.getElementById('p-notes').value.trim();
  const msgEl = document.getElementById('product-form-message');
  if (!name || isNaN(price) || price <= 0) { msgEl.innerHTML = '<div class="notice error" style="margin-top:12px;">Enter a produce name and a rate greater than 0.</div>'; return; }

  const { error } = await supabase.from('products').insert({
    farmer_id: currentProfile.id, name, category, price, unit,
    qty: isNaN(qty) ? null : qty, notes
  });
  if (error) { msgEl.innerHTML = `<div class="notice error" style="margin-top:12px;">${esc(error.message)}</div>`; return; }
  ['p-name','p-price','p-qty','p-notes'].forEach(id => document.getElementById(id).value = '');
  await renderFarmerProducts();
  toggleAddForm(false);
}
async function deleteProduct(id){
  if (!confirm('Remove this listing?')) return;
  await supabase.from('products').delete().eq('id', id);
  await renderFarmerProducts();
}

async function renderFarmerProducts(){
  const { data: mine, error } = await supabase.from('products')
    .select('*').eq('farmer_id', currentProfile.id).order('listed_at', { ascending: false });
  if (error) { console.error(error); return; }
  farmerProductsCache = mine || [];

  const { data: accepted } = await supabase.from('orders')
    .select('product_id, qty_requested').eq('farmer_id', currentProfile.id).eq('status', 'accepted');
  const soldMap = {};
  (accepted || []).forEach(o => { soldMap[o.product_id] = (soldMap[o.product_id] || 0) + Number(o.qty_requested); });

  const withStatus = farmerProductsCache.map(p => {
    const sold = soldMap[p.id] || 0;
    const remaining = p.qty != null ? Math.max(0, p.qty - sold) : null;
    const status = remaining !== null && remaining <= 0 ? 'soldout' : 'live';
    return { p, sold, remaining, status };
  });
  const filtered = withStatus.filter(x => matchesFarmerListingFilter(x.p, x.status));

  const wrap = document.getElementById('my-products-wrap');
  if (!farmerProductsCache.length) { wrap.innerHTML = '<div class="empty" style="padding:20px;">You haven\'t listed any produce yet.</div>'; return; }
  wrap.innerHTML = `<table class="data-table"><thead>
    <tr><th>Produce</th><th>Category</th><th>Rate</th><th>Listed qty</th><th>Sold (accepted)</th><th>Remaining</th><th>Status</th><th>Listed on</th><th>Actions</th></tr>
    <tr class="filter-row">
      <th><input type="text" class="filter-input" placeholder="Filter name..." value="${esc(farmerListingFilter.name)}" oninput="setFarmerListingFilter('name', this.value)"></th>
      <th><select class="filter-input" onchange="setFarmerListingFilter('category', this.value)">${categorySelectOptions(farmerListingFilter.category)}</select></th>
      <th></th><th></th><th></th><th></th>
      <th><select class="filter-input" onchange="setFarmerListingFilter('status', this.value)">
        <option value="all" ${farmerListingFilter.status==='all'?'selected':''}>All</option>
        <option value="live" ${farmerListingFilter.status==='live'?'selected':''}>Live</option>
        <option value="soldout" ${farmerListingFilter.status==='soldout'?'selected':''}>Sold out</option>
      </select></th>
      <th></th><th></th>
    </tr>
  </thead><tbody>
    ${filtered.length ? filtered.map(({p, sold, remaining, status}) => {
      const dot = status === 'live' ? '<span class="live-dot"></span>' : '';
      return `<tr>
        <td class="name-cell">${esc(p.name)}</td>
        <td>${esc(p.category)}</td>
        <td>₹${p.price}/${p.unit}</td>
        <td>${p.qty != null ? p.qty + ' ' + p.unit : 'No limit set'}</td>
        <td>${sold} ${p.unit}</td>
        <td>${remaining != null ? remaining + ' ' + p.unit : '—'}</td>
        <td><span class="status-pill status-${status}">${dot}${status === 'live' ? 'Live' : 'Sold out'}</span></td>
        <td class="dt-cell">${formatDT(p.listed_at)}</td>
        <td class="actions-cell"><button class="secondary small" onclick="deleteProduct('${p.id}')">Remove</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="9"><div class="empty">No listings match these filters.</div></td></tr>`}
  </tbody></table>`;
}

async function renderFarmerRequests(){
  const { data: reqs, error } = await supabase.from('orders')
    .select('*, buyer:profiles!buyer_id(*)')
    .eq('farmer_id', currentProfile.id)
    .order('requested_at', { ascending: false });
  if (error) { console.error(error); return; }
  farmerRequestsCache = reqs || [];

  renderRequestSubtabs('farmer-request-subtabs', farmerRequestsCache, farmerRequestFilter, 'setFarmerRequestFilter', 'farmer');
  const filtered = filterByTab(farmerRequestsCache, farmerRequestFilter, 'farmer')
    .filter(o => inDateRange(o.requested_at, farmerRequestDateFilter.from, farmerRequestDateFilter.to));

  const wrap = document.getElementById('farmer-requests-wrap');
  if (!farmerRequestsCache.length) { wrap.innerHTML = '<div class="empty" style="padding:20px;">No buyer requests yet.</div>'; return; }
  wrap.innerHTML = `<table class="data-table"><thead><tr>
    <th>Product</th><th>Qty</th><th>Buyer</th><th>Distance</th><th>Requested on</th><th>Status</th><th>Actions</th>
  </tr></thead><tbody>
    ${filtered.length ? filtered.map(o => orderRowHtml(o, 'farmer')).join('') : `<tr><td colspan="7"><div class="empty">Nothing in this view.</div></td></tr>`}
  </tbody></table>`;
}

/* ---------- BUYER DATA ---------- */
async function loadBuyerData(){
  await renderMarketplace();
  await renderBuyerOrders();
}

async function renderMarketplace(){
  const { data: products, error } = await supabase.from('products')
    .select('*, farmer:profiles!farmer_id(*)').order('listed_at', { ascending: false });
  if (error) { console.error(error); return; }
  marketplaceCache = products || [];

  const { data: accepted } = await supabase.from('orders').select('product_id, qty_requested').eq('status', 'accepted');
  const soldMap = {};
  (accepted || []).forEach(o => { soldMap[o.product_id] = (soldMap[o.product_id] || 0) + Number(o.qty_requested); });

  const withStatus = marketplaceCache.map(p => {
    const sold = soldMap[p.id] || 0;
    const remaining = p.qty != null ? Math.max(0, p.qty - sold) : null;
    const status = remaining !== null && remaining <= 0 ? 'soldout' : 'live';
    return { p, remaining, status };
  });
  const filtered = withStatus.filter(x => matchesMarketplaceFilter(x.p, x.status));
  const farmerOptions = [...new Map(marketplaceCache.map(p => [p.farmer_id, p.farmer])).entries()];

  const wrap = document.getElementById('marketplace-wrap');
  if (!marketplaceCache.length) { wrap.innerHTML = '<div class="empty" style="padding:20px;">No produce listed yet.</div>'; return; }
  wrap.innerHTML = `<table class="data-table"><thead>
    <tr><th>Produce</th><th>Category</th><th>Rate</th><th>Available now</th><th>Status</th><th>Farmer</th><th>Distance</th><th>Listed on</th><th>Action</th></tr>
    <tr class="filter-row">
      <th><input type="text" class="filter-input" placeholder="Filter name..." value="${esc(marketplaceFilter.name)}" oninput="setMarketplaceFilter('name', this.value)"></th>
      <th><select class="filter-input" onchange="setMarketplaceFilter('category', this.value)">${categorySelectOptions(marketplaceFilter.category)}</select></th>
      <th></th><th></th>
      <th><select class="filter-input" onchange="setMarketplaceFilter('status', this.value)">
        <option value="all" ${marketplaceFilter.status==='all'?'selected':''}>All</option>
        <option value="live" ${marketplaceFilter.status==='live'?'selected':''}>Live</option>
        <option value="soldout" ${marketplaceFilter.status==='soldout'?'selected':''}>Sold out</option>
      </select></th>
      <th><select class="filter-input" onchange="setMarketplaceFilter('farmer', this.value)">
        <option value="all" ${marketplaceFilter.farmer==='all'?'selected':''}>All</option>
        ${farmerOptions.map(([id, f]) => `<option value="${id}" ${marketplaceFilter.farmer===id?'selected':''}>${esc(f?.name || 'Farmer')}</option>`).join('')}
      </select></th>
      <th></th><th></th>
    </tr>
  </thead><tbody>
    ${filtered.length ? filtered.map(({p, remaining, status}) => {
      const dot = status === 'live' ? '<span class="live-dot"></span>' : '';
      const canRequest = status === 'live';
      return `<tr>
        <td class="name-cell">${esc(p.name)}</td>
        <td>${esc(p.category)}</td>
        <td>₹${p.price}/${p.unit}</td>
        <td>${remaining != null ? remaining + ' ' + p.unit : 'No limit set'}</td>
        <td><span class="status-pill status-${status}">${dot}${status === 'live' ? 'Live' : 'Sold out'}</span></td>
        <td>${partyLabel(p.farmer)}</td>
        <td>${distanceHtml(currentProfile, p.farmer)}</td>
        <td class="dt-cell">${formatDT(p.listed_at)}</td>
        <td class="actions-cell"><button class="gold small" onclick="requestProduct('${p.id}')" ${canRequest ? '' : 'disabled'}>Request</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="9"><div class="empty">No produce matches these filters.</div></td></tr>`}
  </tbody></table>`;
}

async function requestProduct(productId){
  const p = marketplaceCache.find(x => x.id === productId);
  if (!p) return;
  const qty = prompt(`How many ${p.unit} of ${p.name} do you want?`, '1');
  if (qty === null) return;
  const qtyNum = parseFloat(qty);
  if (isNaN(qtyNum) || qtyNum <= 0) { alert('Enter a valid quantity.'); return; }

  const { error } = await supabase.from('orders').insert({
    product_id: p.id, product_name: p.name, unit: p.unit, price: p.price,
    qty_requested: qtyNum, farmer_id: p.farmer_id, buyer_id: currentProfile.id
  });
  if (error) { alert(error.message); return; } // the check_stock_before_order trigger raises a clear message if oversold
  switchTab('buyer', 'orders');
  document.querySelector('[data-tab="buyer-orders"]').click();
  await renderBuyerOrders();
}

async function renderBuyerOrders(){
  const { data: mine, error } = await supabase.from('orders')
    .select('*, farmer:profiles!farmer_id(*)')
    .eq('buyer_id', currentProfile.id)
    .order('requested_at', { ascending: false });
  if (error) { console.error(error); return; }
  buyerOrdersCache = mine || [];

  renderRequestSubtabs('buyer-order-subtabs', buyerOrdersCache, buyerOrderFilter, 'setBuyerOrderFilter', 'buyer');
  const filtered = filterByTab(buyerOrdersCache, buyerOrderFilter, 'buyer')
    .filter(o => inDateRange(o.requested_at, buyerOrderDateFilter.from, buyerOrderDateFilter.to));

  const wrap = document.getElementById('buyer-orders-wrap');
  if (!buyerOrdersCache.length) { wrap.innerHTML = '<div class="empty" style="padding:20px;">You haven\'t requested anything yet.</div>'; return; }
  wrap.innerHTML = `<table class="data-table"><thead><tr>
    <th>Product</th><th>Qty</th><th>Farmer</th><th>Distance</th><th>Requested on</th><th>Status</th><th>Actions</th>
  </tr></thead><tbody>
    ${filtered.length ? filtered.map(o => orderRowHtml(o, 'buyer')).join('') : `<tr><td colspan="7"><div class="empty">Nothing in this view.</div></td></tr>`}
  </tbody></table>`;
}

/* ---------- SHARED: order row + accept/decline + popup modal ---------- */
function orderStageLabel(o){
  if (o.status !== 'accepted') return o.status;
  if (o.delivered_at && o.received_at) return 'completed';
  if (o.delivered_at) return 'delivered';
  return 'accepted';
}
function orderRowHtml(o, viewerRole){
  const other = viewerRole === 'farmer' ? o.buyer : o.farmer;
  const stage = orderStageLabel(o);
  let actions = '';
  if (viewerRole === 'farmer' && o.status === 'pending') {
    actions = `<button class="gold small" onclick="respondToOrder('${o.id}','accepted')">Accept</button>
               <button class="secondary small" onclick="respondToOrder('${o.id}','declined')">Decline</button>`;
  }
  if (o.status === 'accepted') {
    const label = stage === 'completed' ? 'View details' : (stage === 'delivered' ? 'Delivery status' : 'Arrange delivery');
    actions = `<button class="secondary small" onclick="openOrderModal('${o.id}','${viewerRole}')">${label}</button>`;
  }
  if (o.status === 'declined') actions = '<span class="helptext">Declined</span>';

  return `<tr>
    <td class="name-cell">${esc(o.product_name)}</td>
    <td>${o.qty_requested} ${esc(o.unit)}</td>
    <td>${partyLabel(other)}</td>
    <td>${distanceHtml(currentProfile, other)}</td>
    <td class="dt-cell">${formatDT(o.requested_at)}</td>
    <td><span class="status-pill status-${stage}">${stage}</span></td>
    <td class="actions-cell">${actions}</td>
  </tr>`;
}

async function respondToOrder(id, status){
  const patch = { status };
  if (status === 'accepted') patch.accepted_at = new Date().toISOString();
  const { error } = await supabase.from('orders').update(patch).eq('id', id);
  if (error) { alert(error.message); return; }
  await renderFarmerRequests(); await renderBuyerOrders();
  if (status === 'accepted') openOrderModal(id, 'farmer');
}

function findCachedOrder(orderId){
  return farmerRequestsCache.find(o => o.id === orderId) || buyerOrdersCache.find(o => o.id === orderId);
}

async function buildOrderPanelHtml(o, viewerRole){
  const other = viewerRole === 'farmer' ? o.buyer : o.farmer;
  const contactHtml = other ? (
    viewerRole === 'farmer'
      ? `<div class="contact-block"><b>Buyer — ${esc(other.name)}</b>Mobile: ${esc(other.mobile)}<br>Deliver to: ${esc(other.address)}, PIN ${esc(other.pincode)}</div>`
      : `<div class="contact-block"><b>Farmer — ${esc(other.name)}</b>Mobile: ${esc(other.mobile)}<br>Coming from: ${esc(other.village)} (PIN ${esc(other.pincode)}), ${esc(other.land)}</div>`
  ) : `<div class="contact-block">Profile not available.</div>`;

  const methodOptions = ['Farmer delivers','Buyer picks up','Courier / transport'];
  const km = actualDistanceKm(currentProfile, other);
  const methodSelect = `
    <div class="field" style="margin-bottom:12px;">
      <label>How will it reach the buyer? (${km != null ? '~' + km + ' km' : 'distance unavailable'})</label>
      <select onchange="setDeliveryMethod('${o.id}', this.value)" ${o.delivered_at ? 'disabled' : ''}>
        <option value="">Choose a method</option>
        ${methodOptions.map(m => `<option value="${m}" ${o.delivery_method===m?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>`;

  let deliveryStatusHtml = '';
  if (o.delivery_method) {
    const lines = [];
    if (o.delivered_at) {
      lines.push(`<div class="contact-block"><b>Delivery</b>✓ Marked delivered by the farmer on ${formatDT(o.delivered_at)}</div>`);
    } else if (viewerRole === 'farmer') {
      lines.push(`<button class="gold small" onclick="markDelivered('${o.id}')">Mark as delivered</button>`);
    } else {
      lines.push(`<div class="contact-block"><b>Delivery</b>Waiting for the farmer to mark this delivered.</div>`);
    }
    if (o.delivered_at) {
      if (o.received_at) {
        lines.push(`<div class="contact-block"><b>Receipt</b>✓ Confirmed received by the buyer on ${formatDT(o.received_at)}</div>`);
      } else if (viewerRole === 'buyer') {
        lines.push(`<button class="gold small" style="margin-top:8px;" onclick="confirmReceived('${o.id}')">Confirm received</button>`);
      } else {
        lines.push(`<div class="contact-block"><b>Receipt</b>Waiting for the buyer to confirm they've received it.</div>`);
      }
    }
    deliveryStatusHtml = `<div style="margin-bottom:12px;">${lines.join('')}</div>`;
  }

  const { data: messages } = await supabase.from('order_messages').select('*, sender:profiles!sender_id(name)').eq('order_id', o.id).order('created_at', { ascending: true });
  const msgs = (messages && messages.length)
    ? messages.map(m => `<div class="msg"><span class="who">${m.sender_id === currentProfile.id ? 'You' : esc(m.sender?.name || 'User')}</span> <span class="dt-cell">${formatDT(m.created_at)}</span><br>${esc(m.text)}</div>`).join('')
    : '<div class="empty" style="padding:6px 0;">No messages yet — coordinate pickup/delivery timing here.</div>';

  return `
    ${contactHtml}
    ${methodSelect}
    ${deliveryStatusHtml}
    <label>Coordination notes — type a message below and press Send</label>
    <div class="msg-thread">${msgs}</div>
    <div class="msg-row">
      <input type="text" id="msg-input-${o.id}" placeholder="${viewerRole === 'farmer' ? "e.g. I'll deliver Friday morning by truck" : "e.g. I'm available after 5 PM, please call before arriving"}">
      <button class="gold small" onclick="sendOrderMessage('${o.id}')">Send</button>
    </div>`;
}

async function openOrderModal(orderId, viewerRole){
  const o = findCachedOrder(orderId);
  if (!o) return;
  modalOrderId = orderId; modalViewerRole = viewerRole;
  const stage = orderStageLabel(o);
  const panel = document.getElementById('order-modal-panel');
  panel.innerHTML = `
    <button class="modal-close-btn" onclick="closeOrderModal()">✕ Close</button>
    <h2 class="modal-title">${esc(o.product_name)} — ${o.qty_requested} ${esc(o.unit)}</h2>
    <div class="modal-subtitle"><span class="status-pill status-${stage}">${stage}</span></div>
    <div id="order-modal-body">Loading…</div>`;
  document.getElementById('order-modal-overlay').style.display = 'flex';
  document.getElementById('order-modal-body').innerHTML = await buildOrderPanelHtml(o, viewerRole);
  bindMsgInputs();
}
function closeOrderModal(){
  document.getElementById('order-modal-overlay').style.display = 'none';
  modalOrderId = null; modalViewerRole = null;
}
async function refreshEverythingAndModal(){
  if (currentProfile.role === 'farmer') { await renderFarmerRequests(); }
  else { await renderBuyerOrders(); }
  if (modalOrderId) await openOrderModal(modalOrderId, modalViewerRole);
}

async function markDelivered(orderId){
  await supabase.from('orders').update({ delivered_at: new Date().toISOString() }).eq('id', orderId);
  await refreshEverythingAndModal();
}
async function confirmReceived(orderId){
  await supabase.from('orders').update({ received_at: new Date().toISOString() }).eq('id', orderId);
  await refreshEverythingAndModal();
}
async function setDeliveryMethod(orderId, method){
  await supabase.from('orders').update({ delivery_method: method }).eq('id', orderId);
  await refreshEverythingAndModal();
}
async function sendOrderMessage(orderId){
  const input = document.getElementById('msg-input-' + orderId);
  const text = input.value.trim();
  if (!text) return;
  await supabase.from('order_messages').insert({ order_id: orderId, sender_id: currentProfile.id, text });
  await refreshEverythingAndModal();
}
function bindMsgInputs(){
  document.querySelectorAll('[id^="msg-input-"]').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendOrderMessage(inp.id.replace('msg-input-','')); } });
  });
}

/* ---------- ADMIN ---------- */
async function loadAdminData(){
  const { data: all, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  adminUsersCache = all || [];
  renderAdminTables();
}
function renderAdminTables(){
  const pendingAll = adminUsersCache.filter(u => u.role !== 'admin' && u.name && u.status === 'pending');
  const pending = pendingAll.filter(u => inDateRange(u.created_at, adminPendingDateFilter.from, adminPendingDateFilter.to));
  const pwrap = document.getElementById('admin-pending-wrap');
  if (!pending.length) { pwrap.innerHTML = `<div class="empty" style="padding:20px;">${pendingAll.length ? 'No accounts in this date range.' : 'No accounts waiting for approval.'}</div>`; }
  else {
    pwrap.innerHTML = `<table class="data-table"><thead><tr>
      <th>Email</th><th>Role</th><th>Name</th><th>Mobile</th><th>Joined on</th><th>Actions</th>
    </tr></thead><tbody>
      ${pending.map(u => `<tr>
        <td class="name-cell">${esc(u.email)}</td>
        <td><span class="badge ${u.role}">${u.role}</span></td>
        <td>${esc(u.name)}</td>
        <td>${esc(u.mobile || '—')}</td>
        <td class="dt-cell">${formatDT(u.created_at)}</td>
        <td class="actions-cell">
          <button class="gold small" onclick="setUserStatus('${u.id}','approved')">Approve</button>
          <button class="secondary small" onclick="setUserStatus('${u.id}','rejected')">Reject</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  const allFiltered = adminUsersCache.filter(u => inDateRange(u.created_at, adminAllDateFilter.from, adminAllDateFilter.to));
  const awrap = document.getElementById('admin-all-wrap');
  if (!allFiltered.length) { awrap.innerHTML = '<div class="empty" style="padding:20px;">No accounts in this date range.</div>'; }
  else {
    awrap.innerHTML = `<table class="data-table"><thead><tr>
      <th>Email</th><th>Role</th><th>Name</th><th>Mobile</th><th>Joined on</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>
      ${allFiltered.map(u => {
        let actions = '';
        if (u.role !== 'admin') {
          if (u.status === 'suspended') actions = `<button class="gold small" onclick="setUserStatus('${u.id}','approved')">Reactivate</button>`;
          else if (u.status === 'approved') actions = `<button class="secondary small" onclick="suspendUser('${u.id}')">Suspend</button>`;
        }
        return `<tr>
          <td class="name-cell">${esc(u.email)}</td>
          <td><span class="badge ${u.role}">${u.role}</span></td>
          <td>${esc(u.name || '—')}</td>
          <td>${esc(u.mobile || '—')}</td>
          <td class="dt-cell">${formatDT(u.created_at)}</td>
          <td><span class="status-pill status-${u.status}">${u.status}</span></td>
          <td class="actions-cell">${actions}</td>
        </tr>`;
      }).join('')}
    </tbody></table>`;
  }
}
function setAdminPendingDateFilter(key, value){ adminPendingDateFilter[key] = value; renderAdminTables(); }
function clearAdminPendingDateFilter(){
  adminPendingDateFilter = { from:'', to:'' };
  document.getElementById('admin-pending-date-from').value = '';
  document.getElementById('admin-pending-date-to').value = '';
  renderAdminTables();
}
function setAdminAllDateFilter(key, value){ adminAllDateFilter[key] = value; renderAdminTables(); }
function clearAdminAllDateFilter(){
  adminAllDateFilter = { from:'', to:'' };
  document.getElementById('admin-all-date-from').value = '';
  document.getElementById('admin-all-date-to').value = '';
  renderAdminTables();
}
async function setUserStatus(userId, status){
  await supabase.from('profiles').update({ status }).eq('id', userId);
  await loadAdminData();
}
async function suspendUser(userId){
  if (!confirm('Suspend this account? They won\'t be able to use the app until you reactivate them.')) return;
  await setUserStatus(userId, 'suspended');
}

/* ---------- REPORTS (transaction history + PDF/Excel export) ---------- */
function orderTotal(o){ return (o.price || 0) * o.qty_requested; }
function rangeLabelText(filter){
  if (!filter.from && !filter.to) return 'All time';
  return `${filter.from || 'start'} to ${filter.to || 'today'}`;
}
function orderStage(o){
  if (o.status !== 'accepted') return o.status;
  if (o.delivered_at && o.received_at) return 'completed';
  if (o.delivered_at) return 'delivered';
  return 'accepted';
}

async function fetchTransactions({ farmerId, buyerId, from, to }){
  let q = supabase.from('orders')
    .select('*, farmer:profiles!farmer_id(name,email), buyer:profiles!buyer_id(name,email)')
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false });
  if (farmerId) q = q.eq('farmer_id', farmerId);
  if (buyerId) q = q.eq('buyer_id', buyerId);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).filter(o => inDateRange(o.accepted_at || o.requested_at, from, to));
}

async function renderFarmerReport(){
  const rows = await fetchTransactions({ farmerId: currentProfile.id, from: farmerReportDateFilter.from, to: farmerReportDateFilter.to });
  const total = rows.reduce((s,o) => s + orderTotal(o), 0);
  document.getElementById('farmer-report-summary').innerHTML = `
    <div class="stat-box"><div class="stat-value">${rows.length}</div><div class="stat-label">Completed transactions</div></div>
    <div class="stat-box"><div class="stat-value">₹${total.toLocaleString('en-IN')}</div><div class="stat-label">Total revenue in range</div></div>`;
  const wrap = document.getElementById('farmer-report-wrap');
  if (!rows.length) { wrap.innerHTML = '<div class="empty" style="padding:20px;">No completed transactions in this range yet.</div>'; return; }
  wrap.innerHTML = `<table class="data-table"><thead><tr>
    <th>Date</th><th>Product</th><th>Buyer</th><th>Qty</th><th>Rate</th><th>Total</th>
  </tr></thead><tbody>
    ${rows.map(o => `<tr>
      <td class="dt-cell">${formatDT(o.accepted_at || o.requested_at)}</td>
      <td class="name-cell">${esc(o.product_name)}</td>
      <td>${esc(o.buyer?.name || '—')}</td>
      <td>${o.qty_requested} ${esc(o.unit)}</td>
      <td>₹${o.price}/${o.unit}</td>
      <td>₹${orderTotal(o).toLocaleString('en-IN')}</td>
    </tr>`).join('')}
  </tbody></table>`;
}
function setFarmerReportDate(key, value){ farmerReportDateFilter[key] = value; renderFarmerReport(); }
function clearFarmerReportDate(){
  farmerReportDateFilter = { from:'', to:'' };
  document.getElementById('farmer-report-date-from').value = '';
  document.getElementById('farmer-report-date-to').value = '';
  renderFarmerReport();
}

async function renderBuyerReport(){
  const rows = await fetchTransactions({ buyerId: currentProfile.id, from: buyerReportDateFilter.from, to: buyerReportDateFilter.to });
  const total = rows.reduce((s,o) => s + orderTotal(o), 0);
  document.getElementById('buyer-report-summary').innerHTML = `
    <div class="stat-box"><div class="stat-value">${rows.length}</div><div class="stat-label">Completed transactions</div></div>
    <div class="stat-box"><div class="stat-value">₹${total.toLocaleString('en-IN')}</div><div class="stat-label">Total spent in range</div></div>`;
  const wrap = document.getElementById('buyer-report-wrap');
  if (!rows.length) { wrap.innerHTML = '<div class="empty" style="padding:20px;">No completed transactions in this range yet.</div>'; return; }
  wrap.innerHTML = `<table class="data-table"><thead><tr>
    <th>Date</th><th>Product</th><th>Farmer</th><th>Qty</th><th>Rate</th><th>Total</th>
  </tr></thead><tbody>
    ${rows.map(o => `<tr>
      <td class="dt-cell">${formatDT(o.accepted_at || o.requested_at)}</td>
      <td class="name-cell">${esc(o.product_name)}</td>
      <td>${esc(o.farmer?.name || '—')}</td>
      <td>${o.qty_requested} ${esc(o.unit)}</td>
      <td>₹${o.price}/${o.unit}</td>
      <td>₹${orderTotal(o).toLocaleString('en-IN')}</td>
    </tr>`).join('')}
  </tbody></table>`;
}
function setBuyerReportDate(key, value){ buyerReportDateFilter[key] = value; renderBuyerReport(); }
function clearBuyerReportDate(){
  buyerReportDateFilter = { from:'', to:'' };
  document.getElementById('buyer-report-date-from').value = '';
  document.getElementById('buyer-report-date-to').value = '';
  renderBuyerReport();
}

async function renderAdminReport(){
  const rows = await fetchTransactions({ from: adminReportDateFilter.from, to: adminReportDateFilter.to });
  const total = rows.reduce((s,o) => s + orderTotal(o), 0);
  const { count: activeFarmers } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role','farmer').eq('status','approved');
  const { count: activeBuyers } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role','buyer').eq('status','approved');
  document.getElementById('admin-report-summary').innerHTML = `
    <div class="stat-box"><div class="stat-value">${rows.length}</div><div class="stat-label">Completed transactions</div></div>
    <div class="stat-box"><div class="stat-value">₹${total.toLocaleString('en-IN')}</div><div class="stat-label">Total platform value</div></div>
    <div class="stat-box"><div class="stat-value">${activeFarmers ?? 0}</div><div class="stat-label">Active farmers</div></div>
    <div class="stat-box"><div class="stat-value">${activeBuyers ?? 0}</div><div class="stat-label">Active buyers</div></div>`;
  const wrap = document.getElementById('admin-report-wrap');
  if (!rows.length) { wrap.innerHTML = '<div class="empty" style="padding:20px;">No completed transactions in this range yet.</div>'; return; }
  wrap.innerHTML = `<table class="data-table"><thead><tr>
    <th>Date</th><th>Product</th><th>Farmer</th><th>Buyer</th><th>Qty</th><th>Rate</th><th>Total</th><th>Stage</th>
  </tr></thead><tbody>
    ${rows.map(o => `<tr>
      <td class="dt-cell">${formatDT(o.accepted_at || o.requested_at)}</td>
      <td class="name-cell">${esc(o.product_name)}</td>
      <td>${esc(o.farmer?.name || '—')}</td>
      <td>${esc(o.buyer?.name || '—')}</td>
      <td>${o.qty_requested} ${esc(o.unit)}</td>
      <td>₹${o.price}/${o.unit}</td>
      <td>₹${orderTotal(o).toLocaleString('en-IN')}</td>
      <td><span class="status-pill status-${orderStage(o)}">${orderStage(o)}</span></td>
    </tr>`).join('')}
  </tbody></table>`;
}
function setAdminReportDate(key, value){ adminReportDateFilter[key] = value; renderAdminReport(); }
function clearAdminReportDate(){
  adminReportDateFilter = { from:'', to:'' };
  document.getElementById('admin-report-date-from').value = '';
  document.getElementById('admin-report-date-to').value = '';
  renderAdminReport();
}

/* ---- PDF exports (jsPDF) ---- */
function drawReportPdf({ title, personLine, rangeLabel, rows, counterpartyHeader, counterpartyFn, totalLabel, total }){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(16); doc.text(title, 14, y); y += 8;
  doc.setFontSize(10);
  if (personLine) { doc.text(personLine, 14, y); y += 6; }
  doc.text(`Date range: ${rangeLabel}`, 14, y); y += 6;
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, y); y += 10;
  doc.text(`Total transactions: ${rows.length}`, 14, y); y += 6;
  doc.text(`${totalLabel}: Rs. ${total.toLocaleString('en-IN')}`, 14, y); y += 10;

  const cols = [['Date',14],['Product',48],[counterpartyHeader,88],['Qty',128],['Rate',150],['Total',175]];
  doc.setFont(undefined, 'bold');
  cols.forEach(([label,x]) => doc.text(label, x, y));
  doc.setFont(undefined, 'normal');
  y += 4; doc.line(14, y, 196, y); y += 6;

  rows.forEach(o => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(formatDT(o.accepted_at || o.requested_at).slice(0, 17), 14, y);
    doc.text(String(o.product_name).slice(0, 16), 48, y);
    doc.text(String(counterpartyFn(o)).slice(0, 16), 88, y);
    doc.text(`${o.qty_requested} ${o.unit}`, 128, y);
    doc.text(`Rs.${o.price}`, 150, y);
    doc.text(`Rs.${orderTotal(o).toLocaleString('en-IN')}`, 175, y);
    y += 7;
  });
  return doc;
}
async function downloadFarmerReportPdf(){
  const rows = await fetchTransactions({ farmerId: currentProfile.id, from: farmerReportDateFilter.from, to: farmerReportDateFilter.to });
  const total = rows.reduce((s,o) => s + orderTotal(o), 0);
  const doc = drawReportPdf({
    title: 'Bhumiputra-Bandhu — Transaction Report',
    personLine: `Farmer: ${currentProfile.name} (${currentProfile.email})`,
    rangeLabel: rangeLabelText(farmerReportDateFilter),
    rows, counterpartyHeader: 'Buyer', counterpartyFn: o => o.buyer?.name || '—',
    totalLabel: 'Total revenue', total
  });
  doc.save(`bhumiputra-bandhu-farmer-report-${Date.now()}.pdf`);
}
async function downloadBuyerReportPdf(){
  const rows = await fetchTransactions({ buyerId: currentProfile.id, from: buyerReportDateFilter.from, to: buyerReportDateFilter.to });
  const total = rows.reduce((s,o) => s + orderTotal(o), 0);
  const doc = drawReportPdf({
    title: 'Bhumiputra-Bandhu — Transaction Report',
    personLine: `Buyer: ${currentProfile.name} (${currentProfile.email})`,
    rangeLabel: rangeLabelText(buyerReportDateFilter),
    rows, counterpartyHeader: 'Farmer', counterpartyFn: o => o.farmer?.name || '—',
    totalLabel: 'Total spent', total
  });
  doc.save(`bhumiputra-bandhu-buyer-report-${Date.now()}.pdf`);
}
async function downloadAdminReportPdf(){
  const rows = await fetchTransactions({ from: adminReportDateFilter.from, to: adminReportDateFilter.to });
  const total = rows.reduce((s,o) => s + orderTotal(o), 0);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(16); doc.text('Bhumiputra-Bandhu — Platform Transaction Report', 14, y); y += 8;
  doc.setFontSize(10);
  doc.text(`Date range: ${rangeLabelText(adminReportDateFilter)}`, 14, y); y += 6;
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, y); y += 10;
  doc.text(`Total transactions: ${rows.length}`, 14, y); y += 6;
  doc.text(`Total platform value: Rs. ${total.toLocaleString('en-IN')}`, 14, y); y += 10;

  const cols = [['Date',14],['Product',44],['Farmer',74],['Buyer',104],['Qty',134],['Rate',154],['Total',176]];
  doc.setFont(undefined, 'bold');
  cols.forEach(([label,x]) => doc.text(label, x, y));
  doc.setFont(undefined, 'normal');
  y += 4; doc.line(14, y, 196, y); y += 6;

  rows.forEach(o => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(formatDT(o.accepted_at || o.requested_at).slice(0, 15), 14, y);
    doc.text(String(o.product_name).slice(0, 13), 44, y);
    doc.text(String(o.farmer?.name || '—').slice(0, 13), 74, y);
    doc.text(String(o.buyer?.name || '—').slice(0, 13), 104, y);
    doc.text(`${o.qty_requested} ${o.unit}`, 134, y);
    doc.text(`Rs.${o.price}`, 154, y);
    doc.text(`Rs.${orderTotal(o).toLocaleString('en-IN')}`, 176, y);
    y += 7;
  });
  doc.save(`bhumiputra-bandhu-admin-report-${Date.now()}.pdf`);
}

/* ---- Excel export (SheetJS) — admin only ---- */
async function downloadAdminReportExcel(){
  const rows = await fetchTransactions({ from: adminReportDateFilter.from, to: adminReportDateFilter.to });
  const total = rows.reduce((s,o) => s + orderTotal(o), 0);
  const dataRows = rows.map(o => ({
    'Date': formatDT(o.accepted_at || o.requested_at),
    'Product': o.product_name,
    'Farmer': o.farmer?.name || '—',
    'Farmer Email': o.farmer?.email || '—',
    'Buyer': o.buyer?.name || '—',
    'Buyer Email': o.buyer?.email || '—',
    'Qty': o.qty_requested,
    'Unit': o.unit,
    'Rate (Rs.)': o.price,
    'Total (Rs.)': orderTotal(o),
    'Stage': orderStage(o)
  }));
  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(wb, wsData, 'Transactions');

  const summaryRows = [
    { Metric: 'Date range', Value: rangeLabelText(adminReportDateFilter) },
    { Metric: 'Generated', Value: new Date().toLocaleString('en-IN') },
    { Metric: 'Total transactions', Value: rows.length },
    { Metric: 'Total platform value (Rs.)', Value: total }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  XLSX.writeFile(wb, `bhumiputra-bandhu-admin-report-${Date.now()}.xlsx`);
}

/* ---------- PWA service worker registration ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
