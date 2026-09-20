// FindIt — frontend (vanilla JS, sin frameworks)

let AUTH_TOKEN = localStorage.getItem('findit_token') || null;
let CURRENT_USER = JSON.parse(localStorage.getItem('findit_user') || 'null');

let currentSearchTab = 'found';
let screenHistory = ['login'];
let notifPollTimer = null;

// ---------- Sesión ----------
function saveSession(token, user) {
  AUTH_TOKEN = token;
  CURRENT_USER = user;
  localStorage.setItem('findit_token', token);
  localStorage.setItem('findit_user', JSON.stringify(user));
}
function clearSession() {
  AUTH_TOKEN = null;
  CURRENT_USER = null;
  localStorage.removeItem('findit_token');
  localStorage.removeItem('findit_user');
}
function authHeaders(extra) {
  return Object.assign({}, extra, AUTH_TOKEN ? { 'x-auth-token': AUTH_TOKEN } : {});
}

async function checkSession() {
  if (!AUTH_TOKEN) { showScreen('login', false); return; }
  try {
    const res = await fetch('/api/me', { headers: authHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    CURRENT_USER = data.user;
    enterApp();
  } catch (e) {
    clearSession();
    showScreen('login', false);
  }
}

function enterApp() {
  document.getElementById('whoAmI').textContent = 'Sesión iniciada como ' + CURRENT_USER.name;
  document.getElementById('bellBtn').classList.remove('hidden');
  screenHistory = ['home'];
  showScreen('home', false);
  refreshNotifications();
  if (notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(refreshNotifications, 15000);
}

function logout() {
  clearSession();
  document.getElementById('bellBtn').classList.add('hidden');
  if (notifPollTimer) clearInterval(notifPollTimer);
  screenHistory = ['login'];
  showScreen('login', false);
}

// ---------- Login / Registro ----------
document.getElementById('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const errBox = document.getElementById('loginError');
  errBox.classList.add('hidden');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
    saveSession(data.token, data.user);
    e.target.reset();
    enterApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
});

document.getElementById('formRegister').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const errBox = document.getElementById('registerError');
  errBox.classList.add('hidden');
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fd.get('name'), username: fd.get('username'), password: fd.get('password') }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo crear la cuenta');
    saveSession(data.token, data.user);
    e.target.reset();
    enterApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
});

// ---------- Navegación ----------
function showScreen(name, pushHistory = true) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  document.getElementById('screen-' + name).classList.remove('hidden');
  const showBack = pushHistory === false ? (name !== 'home' && name !== 'login') : true;
  document.getElementById('backBtn').classList.toggle('show', name !== 'home' && name !== 'login');
  if (pushHistory) screenHistory.push(name);

  if (name === 'search') loadSearchResults();
  if (name === 'notifications') loadNotifications();
  window.scrollTo(0, 0);
}

function goHome() {
  screenHistory = ['home'];
  showScreen('home', false);
}

function goBack() {
  screenHistory.pop();
  const prev = screenHistory[screenHistory.length - 1] || 'home';
  showScreen(prev, false);
}

// ---------- Helpers ----------
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function timeAgo(ts) {
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'ahora mismo';
  if (diffMin < 60) return 'hace ' + diffMin + ' min';
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return 'hace ' + diffH + ' h';
  return 'hace ' + Math.round(diffH / 24) + ' d';
}

function itemThumb(item) {
  return item.foto
    ? `<img class="item-thumb" src="${item.foto}" alt="">`
    : `<div class="item-thumb">${item.type === 'lost' ? '🔴' : '🟢'}</div>`;
}

// ---------- Publicar objeto perdido / encontrado ----------
document.getElementById('formLost').addEventListener('submit', (e) => submitItem(e, 'lost'));
document.getElementById('formFound').addEventListener('submit', (e) => submitItem(e, 'found'));

async function submitItem(e, type) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('.submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publicando...';

  const formData = new FormData(form);
  formData.set('type', type);

  try {
    const res = await fetch('/api/items', { method: 'POST', headers: authHeaders(), body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al publicar');

    form.reset();
    showConfirmation(type, data.item, data.matches);
  } catch (err) {
    alert('No se pudo publicar: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = type === 'lost' ? 'Publicar objeto perdido' : 'Publicar objeto encontrado';
  }
}

function showConfirmation(type, item, matches) {
  document.getElementById('confirmText').textContent =
    type === 'lost'
      ? 'Tu objeto perdido ya está publicado. Te avisaremos con una notificación si aparece algo parecido.'
      : 'Gracias por reportarlo. Le avisamos a quien lo perdió si hay una posible coincidencia.';

  const matchesBox = document.getElementById('confirmMatches');
  if (matches && matches.length > 0) {
    matchesBox.innerHTML = `
      <div class="match-alert">
        <div class="match-alert-title">🟢 Posible coincidencia</div>
        ${matches.slice(0, 2).map((m) => `
          <div class="match-item">
            ${itemThumb(m)}
            <div class="item-info">
              <div class="item-name">${escapeHtml(m.nombre)}</div>
              <div class="item-meta">${escapeHtml(m.lugar || 'Sin lugar especificado')} · ${escapeHtml(m.reporterName)}</div>
            </div>
            <span class="match-score">${Math.round(m.score * 100)}% similar</span>
          </div>
        `).join('')}
        <button class="ghost-btn" onclick="openItem('${matches[0].id}')">Ver coincidencia</button>
      </div>
    `;
  } else {
    matchesBox.innerHTML = '';
  }

  showScreen('confirm');
}

// ---------- Buscar ----------
function setSearchTab(tab, btn) {
  currentSearchTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
  loadSearchResults();
}

let searchDebounce = null;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadSearchResults, 250);
});

async function loadSearchResults() {
  const q = document.getElementById('searchInput').value.trim();
  const params = new URLSearchParams({ type: currentSearchTab });
  if (q) params.set('q', q);

  const res = await fetch('/api/items?' + params.toString());
  const items = await res.json();
  const container = document.getElementById('searchResults');

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-note">No hay objetos ${currentSearchTab === 'found' ? 'encontrados' : 'perdidos'} que coincidan.</div>`;
    return;
  }

  container.innerHTML = items.map((item) => `
    <button class="item-card" onclick="openItem('${item.id}')">
      ${itemThumb(item)}
      <div class="item-info">
        <div class="item-name">${escapeHtml(item.nombre)}</div>
        <div class="item-meta">${escapeHtml(item.lugar || 'Sin lugar')} · ${escapeHtml(item.reporterName)} · ${timeAgo(item.createdAt)}</div>
        <span class="item-type-badge ${item.type}">${item.type === 'lost' ? 'Perdido' : 'Encontrado'}</span>
      </div>
    </button>
  `).join('');
}

// ---------- Detalle + coincidencias + chat ----------
async function openItem(id) {
  const res = await fetch('/api/items/' + id);
  const data = await res.json();
  if (!res.ok) { alert('No se pudo cargar el objeto.'); return; }

  renderDetail(data.item, data.matches);
  showScreen('detail');
  loadMessages(id);
}

function renderDetail(item, matches) {
  const photoHtml = item.foto
    ? `<img class="detail-photo" src="${item.foto}" alt="">`
    : `<div class="detail-photo-placeholder">${item.type === 'lost' ? '🔴' : '🟢'}</div>`;

  const matchesHtml = matches && matches.length
    ? `
      <div class="match-alert">
        <div class="match-alert-title">🟢 Posible coincidencia</div>
        ${matches.slice(0, 3).map((m) => `
          <div class="match-item">
            ${itemThumb(m)}
            <div class="item-info">
              <div class="item-name">${escapeHtml(m.nombre)}</div>
              <div class="item-meta">${escapeHtml(m.lugar || 'Sin lugar')} · ${escapeHtml(m.reporterName)}</div>
            </div>
            <span class="match-score">${Math.round(m.score * 100)}%</span>
          </div>
          <button class="ghost-btn" style="margin-bottom:10px" onclick="openItem('${m.id}')">Ver coincidencia</button>
        `).join('')}
      </div>
    `
    : '';

  const isMine = CURRENT_USER && item.userId === CURRENT_USER.id;

  document.getElementById('detailContent').innerHTML = `
    ${photoHtml}
    <span class="item-type-badge ${item.type}">${item.type === 'lost' ? 'Perdido' : 'Encontrado'}</span>
    ${item.resolved ? '<span class="item-type-badge resolved">Resuelto</span>' : ''}
    <h2 class="detail-title">${escapeHtml(item.nombre)}</h2>
    <div class="detail-row"><b>${item.type === 'lost' ? 'Perdido por' : 'Encontrado por'}:</b> ${escapeHtml(item.reporterName)}</div>
    <div class="detail-row"><b>Lugar:</b> ${escapeHtml(item.lugar || 'No especificado')}</div>
    <div class="detail-row">${timeAgo(item.createdAt)}</div>
    ${item.descripcion ? `<div class="detail-desc">${escapeHtml(item.descripcion)}</div>` : ''}

    ${matchesHtml}

    ${isMine && !item.resolved ? `
      <button class="resolve-btn" onclick="markResolved('${item.id}', '${item.type}')">
        ✅ ${item.type === 'lost' ? 'Ya lo recuperé' : 'Ya se lo llevaron'}
      </button>
    ` : ''}

    ${!isMine ? `
      <button class="contact-btn" onclick="openChat('${item.id}')">💬 Contactar</button>
      <div class="chat-box hidden" id="chatBox">
        <div class="chat-messages" id="chatMessages"></div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Escribe un mensaje...">
          <button onclick="sendMessage('${item.id}')">Enviar</button>
        </div>
      </div>
    ` : `
      <div class="chat-box" id="chatBox">
        <div class="detail-row" style="margin-bottom:10px;"><b>💬 Mensajes de contacto</b></div>
        <div class="chat-messages" id="chatMessages"></div>
      </div>
    `}
  `;
}

async function markResolved(id, type) {
  const confirmMsg = type === 'lost'
    ? '¿Ya recuperaste este objeto? Se quitará del buscador.'
    : '¿Ya vinieron a recoger este objeto? Se quitará del buscador.';
  if (!confirm(confirmMsg)) return;

  const res = await fetch(`/api/items/${id}/resolve`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) { alert('No se pudo actualizar. Intenta de nuevo.'); return; }

  alert('¡Listo! El objeto ya no aparecerá en el buscador.');
  goHome();
}

function openChat() {
  document.getElementById('chatBox').classList.remove('hidden');
  document.getElementById('chatInput').focus();
}

async function loadMessages(itemId) {
  const res = await fetch(`/api/items/${itemId}/messages`);
  const msgs = await res.json();
  const box = document.getElementById('chatMessages');
  if (!box) return;

  if (msgs.length === 0) {
    box.innerHTML = '<div class="empty-note">Todavía no hay mensajes.</div>';
    return;
  }
  box.innerHTML = msgs.map((m) => {
    const mine = CURRENT_USER && m.userId === CURRENT_USER.id;
    return `
      <div class="chat-bubble ${mine ? 'mine' : 'theirs'}">
        ${!mine ? `<div class="chat-sender">${escapeHtml(m.senderName)}</div>` : ''}
        ${escapeHtml(m.text)}
      </div>
    `;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

async function sendMessage(itemId) {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  await fetch(`/api/items/${itemId}/messages`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text }),
  });
  loadMessages(itemId);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chatInput') {
    const sendBtn = document.querySelector('.chat-input-row button');
    if (sendBtn) sendBtn.click();
  }
});

// ---------- Notificaciones ----------
async function refreshNotifications() {
  if (!AUTH_TOKEN) return;
  try {
    const res = await fetch('/api/notifications', { headers: authHeaders() });
    if (!res.ok) return;
    const list = await res.json();
    const unread = list.filter((n) => !n.read).length;
    const badge = document.getElementById('bellBadge');
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) { /* silencioso */ }
}

async function loadNotifications() {
  const res = await fetch('/api/notifications', { headers: authHeaders() });
  const list = await res.json();
  const container = document.getElementById('notificationsList');

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-note">Todavía no tienes notificaciones. Te avisamos aquí apenas alguien encuentre algo parecido a lo que perdiste.</div>';
    return;
  }

  container.innerHTML = list.map((n) => `
    <button class="item-card notif-card ${n.read ? '' : 'unread'}" onclick="openNotification('${n.id}', '${n.lostItemId}')">
      <div class="item-thumb">🟢</div>
      <div class="item-info">
        <div class="item-name">${escapeHtml(n.text)}</div>
        <div class="item-meta">${timeAgo(n.createdAt)}</div>
      </div>
    </button>
  `).join('');

  refreshNotifications();
}

async function openNotification(notifId, lostItemId) {
  await fetch(`/api/notifications/${notifId}/read`, { method: 'POST', headers: authHeaders() });
  openItem(lostItemId);
  refreshNotifications();
}

// ---------- Arranque ----------
checkSession();
