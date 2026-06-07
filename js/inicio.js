// =========================================
// INICIO.JS — Lógica de la pantalla de cursos
// =========================================

const COLORS = ['#3B6FA0','#4A8C6F','#B85450','#D4A843','#7B5EA7','#C0704A','#3A8B8B','#8B6A3A','#5E8B4A','#884A7B'];

let selectedColor = COLORS[0];
let editingCourseId = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initSidebar('inicio');
  renderColorPicker();
  renderCourses();
  renderUpcomingNotifications();
});

// ---- COLOR PICKER ----
function renderColorPicker() {
  const cont = document.getElementById('color-picker');
  cont.innerHTML = COLORS.map(c => `
    <div class="color-opt ${c === selectedColor ? 'selected' : ''}"
         style="background:${c}"
         onclick="selectColor('${c}', this)"></div>
  `).join('');
}

function selectColor(color, el) {
  selectedColor = color;
  document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

// ---- COMPETENCIAS ----
const MAX_COMPS = 5;

function renderCompetencias(comps) {
  const cont = document.getElementById('competencias-container');
  cont.innerHTML = '';
  comps.forEach(c => addCompetenciaRow(c));
  updateAddCompBtn();
}

function addCompetenciaRow(value) {
  const cont = document.getElementById('competencias-container');
  const row = document.createElement('div');
  row.className = 'competencia-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Nombre de la competencia *" value="${escapeHtml(value)}" />
    <button class="btn-remove-comp" onclick="removeCompetencia(this)" title="Eliminar">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="2" y1="8" x2="14" y2="8"/></svg>
    </button>`;
  cont.appendChild(row);
}

function addCompetencia() {
  const cont = document.getElementById('competencias-container');
  if (cont.querySelectorAll('.competencia-row').length >= MAX_COMPS) return;
  addCompetenciaRow('');
  updateAddCompBtn();
}

function removeCompetencia(btn) {
  const cont = document.getElementById('competencias-container');
  if (cont.querySelectorAll('.competencia-row').length <= 1) {
    showToast('El curso debe tener al menos 1 competencia', 'error');
    return;
  }
  btn.parentElement.remove();
  updateAddCompBtn();
}

function updateAddCompBtn() {
  const cont = document.getElementById('competencias-container');
  const btn = document.getElementById('btn-add-comp');
  if (!btn) return;
  btn.style.display = cont.querySelectorAll('.competencia-row').length >= MAX_COMPS ? 'none' : '';
}

function getCompetencias() {
  return Array.from(document.querySelectorAll('#competencias-container .competencia-row input'))
    .map(i => i.value.trim()).filter(Boolean);
}

function validateCompetencias(comps) {
  return comps.length >= 1;
}

const MAX_COURSES = 3;

// ---- OPEN MODAL ----
function openCourseModal(courseId = null) {
  if (!courseId && DB.getCourses().length >= MAX_COURSES) {
    showToast(`Solo se permiten ${MAX_COURSES} cursos como máximo`, 'error');
    return;
  }
  editingCourseId = courseId;
  selectedColor = COLORS[0];
  document.getElementById('comp-required-hint').classList.remove('visible');

  if (courseId) {
    const course = DB.getCourses().find(c => c.id === courseId);
    if (!course) return;
    document.getElementById('course-modal-title').textContent = 'Editar curso';
    document.getElementById('course-name').value = course.name;
    selectedColor = course.color || COLORS[0];
    renderColorPicker();
    const comps = (course.competencias && course.competencias[1]) || [];
    renderCompetencias(comps.length ? comps : ['']);
  } else {
    document.getElementById('course-modal-title').textContent = 'Crear curso';
    document.getElementById('course-name').value = '';
    selectedColor = COLORS[0];
    renderColorPicker();
    renderCompetencias(['']);
  }
  openModal('course-modal');
}

// ---- SAVE COURSE ----
function saveCourse() {
  const name = document.getElementById('course-name').value.trim();
  if (!name) { showToast('El nombre del curso es requerido', 'error'); return; }

  const compsArray = getCompetencias();

  if (!validateCompetencias(compsArray)) {
    document.getElementById('comp-required-hint').classList.add('visible');
    showToast('Ingresa al menos una competencia', 'error');
    return;
  }
  document.getElementById('comp-required-hint').classList.remove('visible');

  const competencias = { 1: compsArray, 2: compsArray, 3: compsArray, 4: compsArray };

  const courses = DB.getCourses();

  if (!editingCourseId && courses.length >= MAX_COURSES) {
    showToast(`Solo se permiten ${MAX_COURSES} cursos como máximo`, 'error'); return;
  }

  const nameLower = name.toLowerCase();
  const duplicado = courses.some(c => c.name.toLowerCase() === nameLower && c.id !== editingCourseId);
  if (duplicado) { showToast('Ya existe un curso con ese nombre', 'error'); return; }

  const data = { name, color: selectedColor, competencias };

  if (editingCourseId) {
    const idx = courses.findIndex(c => c.id === editingCourseId);
    if (idx !== -1) courses[idx] = { ...courses[idx], ...data };
    showToast('Curso actualizado', 'success');
  } else {
    const cu = DB.get('currentUser');
    courses.push({ id: uid(), ...data, userId: cu?.id || null, createdAt: Date.now() });
    showToast('Curso creado', 'success');
  }

  DB.saveCourses(courses);
  closeModal('course-modal');
  renderCourses();
  renderUpcomingNotifications();
}

// ---- DELETE COURSE ----
function deleteCourse(id) {
  showConfirm('Eliminar curso', '¿Estás seguro? Se perderán todas las secciones y datos asociados.', () => {
    DB.deleteCourseData(id);
    DB.saveCourses(DB.getCourses().filter(c => c.id !== id));
    renderCourses();
    renderUpcomingNotifications();
    showToast('Curso eliminado');
  });
}

// ---- RENDER COURSES ----
function renderCourses() {
  const courses = DB.getCourses();
  const grid = document.getElementById('courses-grid');
  const empty = document.getElementById('empty-state');

  const btnCreate = document.getElementById('btn-create-course');
  if (btnCreate) {
    const atLimit = courses.length >= MAX_COURSES;
    btnCreate.style.opacity       = atLimit ? '0.5' : '';
    btnCreate.style.pointerEvents = '';
    btnCreate.title               = atLimit ? `Límite de ${MAX_COURSES} cursos alcanzado` : '';
  }

  if (!courses.length) {
    empty.style.display = 'flex';
    grid.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = courses.map(course => {
    const sections = DB.getSections(course.id);
    return `
    <div class="course-card" id="card-${course.id}">
      <div class="card-color-bg" style="background:${course.color}" onclick="goToSections('${course.id}')">
        <div class="dropdown-wrapper" onclick="event.stopPropagation()" style="align-self:flex-start">
          <button class="card-menu-btn" onclick="toggleDropdown('menu-${course.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>
          </button>
          <div class="dropdown-menu" id="menu-${course.id}">
            <button class="dropdown-item" onclick="closeDropdown('menu-${course.id}');openCourseModal('${course.id}')">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"/></svg>
              Editar curso
            </button>
            <button class="dropdown-item danger" onclick="closeDropdown('menu-${course.id}');deleteCourse('${course.id}')">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M6 7v5M10 7v5"/><rect x="3" y="4" width="10" height="10" rx="1"/></svg>
              Borrar curso
            </button>
          </div>
        </div>
      </div>
      <div class="card-footer" style="background:${course.color}dd" onclick="goToSections('${course.id}')">
        <span class="card-name">${escapeHtml(course.name)}</span>
        <span class="card-sections-count">${sections.length} secc.</span>
      </div>
    </div>`;
  }).join('');
}

// ---- NOTIFICATIONS: próximas actividades ----
function renderUpcomingNotifications() {
  const courses = DB.getCourses();
  const today = new Date();
  today.setHours(0,0,0,0);
  const in14 = new Date(today); in14.setDate(in14.getDate() + 14);

  const upcoming = [];
  courses.forEach(course => {
    const sections = DB.getSections(course.id);
    sections.forEach(sec => {
      const activities = DB.getActivities(course.id, sec.id);
      activities.forEach(act => {
        if (!act.dueDate) return;
        const due = new Date(act.dueDate + 'T00:00:00');
        if (due >= today && due <= in14) {
          upcoming.push({ courseId: course.id, sectionId: sec.id, course: course.name, section: `${sec.grade}"${sec.letter}"`, act: act.name, due, color: course.color });
        }
      });
    });
  });

  upcoming.sort((a,b) => a.due - b.due);

  const cont = document.getElementById('notif-list');
  if (!upcoming.length) {
    cont.innerHTML = '<div class="notif-empty">No hay evaluaciones próximas</div>';
    return;
  }

  cont.innerHTML = upcoming.slice(0,8).map(u => {
    const diff = Math.ceil((u.due - today) / 86400000);
    const diffStr = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `En ${diff} días`;
    return `<div onclick="goToSection('${u.courseId}','${u.sectionId}')" style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border-light);cursor:pointer;border-radius:4px;transition:background 0.15s" onmouseenter="this.style.background='var(--surface-alt)'" onmouseleave="this.style.background=''">
      <div style="width:8px;height:8px;border-radius:50%;background:${u.color};flex-shrink:0;margin-top:5px"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(u.act)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escapeHtml(u.course)} · ${escapeHtml(u.section)}</div>
      </div>
      <div style="font-size:11px;font-weight:600;color:${diff <= 2 ? 'var(--red)' : 'var(--yellow)'};white-space:nowrap">${diffStr}</div>
    </div>`;
  }).join('');
}

// ---- DROPDOWN ----
function toggleDropdown(id) {
  const menu = document.getElementById(id);
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}

function closeDropdown(id) {
  document.getElementById(id)?.classList.remove('open');
}

function goToSections(courseId) {
  STATE.setCourse(courseId);
  window.location.href = 'secciones.html';
}

function goToSection(courseId, sectionId) {
  STATE.setCourse(courseId);
  STATE.setSection(sectionId);
  window.location.href = 'seccionespecifica.html';
}
