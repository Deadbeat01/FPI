// =========================================
// ADMIN.JS — Utilidades compartidas del panel admin
// =========================================

// Verifica sesión admin; redirige a login si no es admin
function adminReady() {
  const user = _getAdminUser();
  if (!user || user.rol !== 'admin') {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function _getAdminUser() {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
}

// Headers para todas las llamadas admin
function adminHeaders() {
  const user = _getAdminUser();
  return {
    'Content-Type': 'application/json',
    'X-User-Id': user?.id || '',
  };
}

function adminLogout() {
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

// Renderiza el sidebar admin y marca la página activa
function initAdminSidebar(activePage) {
  const el = document.getElementById('admin-sidebar');
  if (!el) return;

  const user = _getAdminUser();

  el.innerHTML = `
    <div class="admin-brand">
      <div class="admin-brand-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </div>
      <div>
        <div class="admin-brand-title">Panel Admin</div>
        <div class="admin-brand-sub">${escapeHtml(user?.displayName || 'Administrador')}</div>
      </div>
    </div>

    <nav class="admin-nav">
      <a class="admin-nav-item ${activePage === 'dashboard' ? 'active' : ''}" href="admin-dashboard.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        Dashboard
      </a>
      <a class="admin-nav-item ${activePage === 'cuentas' ? 'active' : ''}" href="admin-cuentas.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
        Gestión de cuentas
      </a>
      <a class="admin-nav-item ${activePage === 'bloqueadas' ? 'active' : ''}" href="admin-bloqueadas.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        Cuentas bloqueadas
      </a>
      <div class="admin-nav-divider"></div>
      <div class="admin-nav-item" onclick="toggleDarkMode()" style="cursor:pointer">
        <span id="admin-darkmode-icon" style="display:flex;align-items:center"></span>
        <span id="admin-darkmode-label"></span>
      </div>
    </nav>

    <div class="admin-sidebar-footer">
      <button class="admin-nav-item" onclick="adminLogout()" style="color:var(--red)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Cerrar sesión
      </button>
    </div>`;

  _syncAdminDarkLabel();
}

function _syncAdminDarkLabel() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const icon  = document.getElementById('admin-darkmode-icon');
  const label = document.getElementById('admin-darkmode-label');
  if (!icon || !label) return;
  label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
  icon.innerHTML = isDark
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`;
}

// Sobrescribe toggleDarkMode para sincronizar también el label del admin
const _origToggle = typeof toggleDarkMode === 'function' ? toggleDarkMode : null;
function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('darkMode', String(!isDark));
  _syncAdminDarkLabel();
}

// Formatea timestamp ms a fecha legible
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Formatea timestamp ms a fecha + hora
function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
