// =========================================
// SHARED UTILITIES — app.js
// =========================================

// ---- DATABASE (JSON via servidor Express) ----
const DB = {
  _data: null,

  async init() {
    if (DB._data) return;
    const user = DB.get('currentUser');
    const headers = user?.id ? { 'X-User-Id': user.id } : {};
    const res = await fetch('/api/db', { headers });
    if (!res.ok) throw new Error('Error al conectar con el servidor');
    DB._data = await res.json();
    DB._migrateStudentKeys();
  },

  // Migra claves antiguas courseId_sectionId → clave global grade_letter
  _migrateStudentKeys() {
    if (!DB._data.students || !DB._data.sections) return;
    const oldToNew = {};
    for (const [cid, secs] of Object.entries(DB._data.sections)) {
      (secs || []).forEach(sec => {
        oldToNew[`${cid}_${sec.id}`] = `${sec.grade}_${sec.letter}`;
      });
    }
    if (!Object.keys(DB._data.students).some(k => oldToNew[k])) return;
    const next = {};
    for (const [key, students] of Object.entries(DB._data.students)) {
      const nk = oldToNew[key] || key;
      if (!next[nk]) {
        next[nk] = students;
      } else {
        students.forEach(s => { if (!next[nk].find(e => e.id === s.id)) next[nk].push(s); });
      }
    }
    DB._data.students = next;
    DB._persist();
  },

  // Clave global de sección: grade_letter (ej: "3°_A")
  _sectionGlobalKey(courseId, sectionId) {
    const sec = (DB._data.sections?.[courseId] || []).find(s => s.id === sectionId);
    return sec ? `${sec.grade}_${sec.letter}` : `${courseId}_${sectionId}`;
  },

  _persistTimer: null,
  _persist() {
    clearTimeout(DB._persistTimer);
    DB._persistTimer = setTimeout(() => {
      const user = DB.get('currentUser');
      if (!user?.id) return;
      fetch('/api/db', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(DB._data),
      }).catch(err => console.error('Error guardando datos:', err));
    }, 400);
  },

  // Estado de sesión/UI → sigue en localStorage
  get(key)        { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },

  // ---- Cursos ----
  getCourses()          { return DB._data.courses || []; },
  saveCourses(c)        { DB._data.courses = c; DB._persist(); },

  // ---- Secciones ----
  getSections(courseId) { return (DB._data.sections?.[courseId]) || []; },
  saveSections(courseId, s) {
    if (!DB._data.sections) DB._data.sections = {};
    DB._data.sections[courseId] = s;
    DB._persist();
  },

  // ---- Alumnos (clave global: grade_letter compartida entre cursos) ----
  getStudents(courseId, sectionId) {
    const key = DB._sectionGlobalKey(courseId, sectionId);
    return (DB._data.students?.[key]) || [];
  },
  saveStudents(courseId, sectionId, s) {
    if (!DB._data.students) DB._data.students = {};
    const key = DB._sectionGlobalKey(courseId, sectionId);
    DB._data.students[key] = s;
    DB._persist();
  },

  // ---- Actividades ----
  getActivities(courseId, sectionId) {
    return (DB._data.activities?.[`${courseId}_${sectionId}`]) || [];
  },
  saveActivities(courseId, sectionId, a) {
    if (!DB._data.activities) DB._data.activities = {};
    DB._data.activities[`${courseId}_${sectionId}`] = a;
    DB._persist();
  },

  // ---- Notas ----
  getGrades(courseId, sectionId) {
    return (DB._data.grades?.[`${courseId}_${sectionId}`]) || {};
  },
  saveGrades(courseId, sectionId, g) {
    if (!DB._data.grades) DB._data.grades = {};
    DB._data.grades[`${courseId}_${sectionId}`] = g;
    DB._persist();
  },

  // ---- Usuarios ----
  getUsers()   { return DB._data.users || []; },
  saveUsers(u) { DB._data.users = u; DB._persist(); },

  // ---- Referencia de horarios ----
  getScheduleReference() {
    return DB._data.scheduleReference || { days: [], timeSlots: [] };
  },

  // ---- Helpers de borrado ----
  removeStudentGrades(courseId, sectionId, studentId) {
    const grades = DB.getGrades(courseId, sectionId);
    delete grades[studentId];
    DB.saveGrades(courseId, sectionId, grades);
  },

  deleteSectionData(courseId, sectionId) {
    const key = `${courseId}_${sectionId}`;
    if (DB._data.activities) delete DB._data.activities[key];
    if (DB._data.grades)     delete DB._data.grades[key];
    // Alumnos NO se borran: pertenecen a la sección global (grade_letter)
    // El llamador es responsable de persistir
  },

  deleteCourseData(courseId) {
    DB.getSections(courseId).forEach(sec => DB.deleteSectionData(courseId, sec.id));
    if (DB._data.sections) delete DB._data.sections[courseId];
    DB._persist();
  },
};

// Carga datos y maneja errores de conexión
async function dbReady() {
  try {
    await DB.init();
    return true;
  } catch {
    document.body.innerHTML = `
      <div style="padding:3rem;font-family:sans-serif;max-width:480px;margin:auto;text-align:center">
        <h2 style="color:#b85450">Error de conexión</h2>
        <p>No se pudo conectar al servidor. Asegúrate de ejecutar:</p>
        <pre style="background:#f5f5f5;padding:1rem;border-radius:6px;text-align:left">npm install
npm start</pre>
        <p style="color:#888;font-size:13px">Luego abre <strong>http://localhost:3000</strong></p>
      </div>`;
    return false;
  }
}

// ---- ID GENERATION ----
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---- EYE TOGGLE (campos de contraseña) ----
function toggleEye(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.classList.toggle('visible', show);
}

// ---- XSS PREVENTION ----
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- TOAST ----
function showToast(msg, type = 'default', duration = 2800) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;flex-shrink:0"><circle cx="8" cy="8" r="7"/></svg>${msg}`;
  container.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// ---- CONFIRM DIALOG ----
function showConfirm(title, text, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-title">${escapeHtml(title)}</div>
      <div class="confirm-text">${escapeHtml(text)}</div>
      <div class="confirm-actions">
        <button class="btn btn-secondary btn-sm" id="conf-cancel">Cancelar</button>
        <button class="btn btn-danger btn-sm" id="conf-ok">Eliminar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#conf-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#conf-ok').onclick = () => { onConfirm(); overlay.remove(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ---- MODAL HELPERS ----
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

// ---- SIDEBAR ----
const SIDEBAR_HTML = (activePage) => `
<div class="sidebar-profile">
  <div class="profile-avatar" id="sidebar-avatar">P</div>
  <div class="profile-info">
    <div class="profile-name" id="sidebar-name">Profesor</div>
    <div class="profile-email" id="sidebar-email">docente@escuela.edu</div>
  </div>
</div>
<div class="sidebar-divider"></div>
<nav class="sidebar-nav">
  <a class="nav-item ${activePage === 'inicio' ? 'active' : ''}" href="inicio.html">
    ${iconBook()}
    <span>Cursos</span>
  </a>
  <a class="nav-item ${activePage === 'alumnos' ? 'active' : ''}" href="alumnos.html">
    ${iconUsers()}
    <span>Alumnos</span>
  </a>
  <a class="nav-item ${activePage === 'horarios' ? 'active' : ''}" href="horarios.html">
    ${iconCalendar()}
    <span>Horarios</span>
  </a>
  <div class="nav-item" id="nav-config" onclick="toggleSubnav('config-sub', this)">
    ${iconSettings()}
    <span>Configuración</span>
    ${iconChevron()}
  </div>
  <div class="nav-subitems" id="config-sub">
    <div class="nav-subitem nav-subitem-icon" onclick="toggleDarkMode()" id="btn-darkmode">
      <span id="darkmode-icon"></span>
      <span id="darkmode-label"></span>
    </div>
    <a class="nav-subitem nav-subitem-icon ${activePage === 'cuenta' ? 'active' : ''}" href="cuenta.html">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><circle cx="8" cy="6" r="3"/><path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5"/></svg>
      <span>Editar cuenta</span>
    </a>
  </div>
  <div class="nav-item" id="nav-ayuda" onclick="toggleSubnav('ayuda-sub', this)">
    ${iconHelp()}
    <span>Ayuda</span>
    ${iconChevron()}
  </div>
  <div class="nav-subitems" id="ayuda-sub">
    <a class="nav-subitem" href="contactanos.html">Contáctanos</a>
    <a class="nav-subitem ${activePage === 'tutorial' ? 'active' : ''}" href="tutorial.html">Tutorial</a>
  </div>
</nav>
<div class="sidebar-divider"></div>
<div class="sidebar-bottom">
  <div class="nav-item logout" onclick="doLogout()">
    ${iconLogout()}
    <span>Cerrar sesión</span>
  </div>
  <div class="sidebar-version">v 6.0</div>
</div>`;

function initSidebar(activePage) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = SIDEBAR_HTML(activePage);

  const session  = DB.get('currentUser') || { username: 'Usuario', email: '' };
  const fullUser = (DB._data?.users || []).find(u => u.id === session.id) || session;

  document.getElementById('sidebar-name').textContent  = fullUser.displayName || fullUser.username;
  document.getElementById('sidebar-email').textContent = fullUser.email;
  _renderSidebarAvatar(fullUser);

  _syncDarkModeLabel();
}

function _renderSidebarAvatar(user) {
  const el = document.getElementById('sidebar-avatar');
  if (!el) return;
  const label = user.displayName || user.username || 'U';
  if (user.photo) {
    el.textContent = '';
    const img = document.createElement('img');
    img.src = user.photo;
    img.alt = label;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block';
    el.appendChild(img);
  } else {
    el.textContent = label.charAt(0).toUpperCase();
  }
}

function doLogout() {
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

// ---- DARK MODE ----
(function () {
  if (localStorage.getItem('darkMode') === 'true') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('darkMode', String(!isDark));
  _syncDarkModeLabel();
}

function _syncDarkModeLabel() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const icon  = document.getElementById('darkmode-icon');
  const label = document.getElementById('darkmode-label');
  if (!icon || !label) return;
  label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
  icon.innerHTML = isDark
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`;
}

function toggleSubnav(id, item) {
  const sub = document.getElementById(id);
  if (!sub) return;
  const isOpen = sub.classList.contains('open');
  sub.classList.toggle('open', !isOpen);
  item.classList.toggle('expanded', !isOpen);
}

// ---- CLOSE DROPDOWNS ON OUTSIDE CLICK ----
document.addEventListener('click', (e) => {
  document.querySelectorAll('.dropdown-menu.open').forEach(menu => {
    if (!menu.closest('.dropdown-wrapper').contains(e.target)) {
      menu.classList.remove('open');
    }
  });
});

// ---- SVG ICONS ----
function iconBook() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`;
}
function iconUsers() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`;
}
function iconCalendar() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
}
function iconSettings() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 00-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;
}
function iconHelp() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}
function iconLogout() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
}
function iconChevron() {
  return `<svg class="nav-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 4 10 8 6 12"/></svg>`;
}
function iconDots() {
  return `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>`;
}
// ---- GRADE SCALE & TIME HELPERS ----
const GRADE_VALUE = { 'AD': 4, 'A': 3, 'B': 2, 'C': 1, '-': null };

function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ---- NAVIGATION STATE ----
const STATE = {
  get(k) { return sessionStorage.getItem(k); },
  set(k, v) { sessionStorage.setItem(k, v); },
  setCourse(id) { sessionStorage.setItem('courseId', id); },
  getCourse() { return sessionStorage.getItem('courseId'); },
  setSection(id) { sessionStorage.setItem('sectionId', id); },
  getSection() { return sessionStorage.getItem('sectionId'); },
};
