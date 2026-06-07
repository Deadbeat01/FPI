// =========================================
// SECCIONESPECIFICA.JS — Lógica pantalla de sección
// =========================================

// ---- EQUIVALENCIAS ----
const GRADE_OPTIONS = ['AD', 'A', 'B', 'C', '-'];

const ACT_TYPE_ICON = {
  practica:  '📄',
  exposicion:'🖥️',
  trabajo:   '👥',
};
const ACT_TYPE_LABEL = {
  practica: 'Práctica',
  exposicion: 'Exposición',
  trabajo: 'Trabajo',
};

// ---- STATE ----
let courseId, sectionId, currentCourse, currentSection;
let selectedStudentId = null;
let filteredStudents   = [];
let editingRowId       = null;   // id del alumno cuya fila está en edición
let editingRowSnapshot = null;   // copia de datos antes de editar
let selectedActType    = 'practica';
let editingActivityId  = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initSidebar('inicio');
  courseId  = STATE.getCourse();
  sectionId = STATE.getSection();
  if (!courseId || !sectionId) { window.location.href = 'inicio.html'; return; }

  currentCourse  = DB.getCourses().find(c => c.id === courseId);
  currentSection = DB.getSections(courseId).find(s => s.id === sectionId);
  if (!currentCourse || !currentSection) { window.location.href = 'inicio.html'; return; }

  document.getElementById('bc-course').textContent   = currentCourse.name;
  document.getElementById('bc-section').textContent  = `${currentSection.grade} "${currentSection.letter}"`;
  document.getElementById('page-title').textContent   = currentCourse.name;
  document.getElementById('page-subtitle').textContent = `${currentSection.grade} "${currentSection.letter}"`;

  populateCompetenciaFilters();
  applyFilters();
});

// ---- HELPER: competencias de la sección para un bimestre ----
function getSectionComps(bim) {
  return (currentSection.competencias && currentSection.competencias[bim])
    || (currentCourse.competencias && currentCourse.competencias[bim])
    || [];
}

// ---- POPULATE FILTERS ----
function populateCompetenciaFilters() {
  const bim = parseInt(document.getElementById('filter-bimestre').value);
  const sel = document.getElementById('filter-competencia');
  if (bim === 0) {
    sel.innerHTML = `<option value="">Todas las competencias</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const comps = getSectionComps(bim);
  sel.innerHTML = `<option value="">Todas las competencias</option>` +
    comps.map((c, i) => `<option value="${i}">${c || 'Competencia ' + (i+1)}</option>`).join('');
}


function getSelectedCompIdx() {
  const val = document.getElementById('filter-competencia').value;
  return val === '' ? null : parseInt(val);
}

function getFilteredActivities(bim, compIdx) {
  const activities = DB.getActivities(courseId, sectionId);
  return activities.filter(a => {
    if (a.bimestre !== bim) return false;
    if (compIdx !== null && a.competenciaIdx !== compIdx) return false;
    return true;
  });
}

// ---- PROMEDIO DE UN ALUMNO EN UN CONJUNTO DE ACTIVIDADES ----
function calcStudentAvg(studentId, activities) {
  const grades = DB.getGrades(courseId, sectionId);
  const sG = grades[studentId] || {};
  let total = 0, count = 0;
  activities.forEach(act => {
    const v = GRADE_VALUE[sG[act.id]];
    if (v !== null && v !== undefined) { total += v; count++; }
  });
  if (!count) return null;
  const avg = total / count;
  if (avg >= 3.5) return 'AD';
  if (avg >= 2.5) return 'A';
  if (avg >= 1.5) return 'B';
  return 'C';
}

function gradeBadgeClass(letter) {
  if (!letter) return 'grade-none';
  return { 'AD':'grade-ad','A':'grade-a','B':'grade-b','C':'grade-c' }[letter] || 'grade-none';
}

// ---- APPLY FILTERS ----
function applyFilters() {
  const bim     = parseInt(document.getElementById('filter-bimestre').value);
  const compIdx = getSelectedCompIdx();
  const search  = document.getElementById('search-input').value.toLowerCase().trim();
  const sortBy  = document.getElementById('sort-by').value;

  const allStudents = DB.getStudents(courseId, sectionId).filter(s => !s.retired);

  let result = search
    ? allStudents.filter(s => s.name.toLowerCase().includes(search))
    : [...allStudents];

  if (sortBy === 'avg') {
    const AVG_ORDER = { 'AD': 4, 'A': 3, 'B': 2, 'C': 1 };
    const sortActs = bim === 0
      ? DB.getActivities(courseId, sectionId)
      : getFilteredActivities(bim, compIdx);
    result.sort((a, b) => {
      const valA = AVG_ORDER[calcStudentAvg(a.id, sortActs)] ?? 0;
      const valB = AVG_ORDER[calcStudentAvg(b.id, sortActs)] ?? 0;
      return valB - valA;
    });
  } else {
    result.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  filteredStudents = result;

  document.getElementById('student-count').textContent = allStudents.length;
  const note = document.getElementById('filtered-note');
  note.textContent = (result.length !== allStudents.length)
    ? `(mostrando ${result.length} de ${allStudents.length})`
    : '';

  const empty   = document.getElementById('empty-students');
  const wrapper = document.getElementById('table-wrapper');

  if (!allStudents.length) {
    empty.style.display = 'flex';
    wrapper.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  wrapper.style.display = '';

  if (bim === 0) {
    renderTableAll();
  } else {
    renderTable(bim, compIdx);
  }
}

// ---- RENDER TABLE ----
function renderTable(bim, compIdx) {
  const activities = getFilteredActivities(bim, compIdx);
  const comps      = getSectionComps(bim);
  const grades     = DB.getGrades(courseId, sectionId);

  // Solo mostrar botón gráficas si hay competencia individual seleccionada
  const showChartBtn = compIdx !== null;

  let compsToShow = [];
  if (compIdx !== null) {
    compsToShow = [{ idx: compIdx, name: comps[compIdx] || `Competencia ${compIdx+1}` }];
  } else {
    compsToShow = comps.map((name, idx) => ({ idx, name: name || `Competencia ${idx+1}` }));
  }

  // ---- HEAD ----
  const head = document.getElementById('table-head');
  let headerHTML = `<tr>
    <th style="width:40px"></th>
    <th style="min-width:170px">Alumno</th>`;

  compsToShow.forEach(comp => {
    const compActs = activities.filter(a => a.competenciaIdx === comp.idx);
    const actCount = Math.max(compActs.length, 3);
    // Cabecera de competencia (colspan)
    headerHTML += `<th colspan="${actCount + 1}" class="th-comp-header">
      <span title="${comp.name}">${comp.name}</span>
    </th>`;
  });

  if (showChartBtn) headerHTML += `<th style="width:40px"></th>`;
  headerHTML += `</tr><tr>
    <th></th>
    <th></th>`;

  compsToShow.forEach(comp => {
    const compActs = activities.filter(a => a.competenciaIdx === comp.idx);
    const actCount = Math.max(compActs.length, 3);
    for (let i = 0; i < actCount; i++) {
      const act = compActs[i];
      const typeIcon = act ? (ACT_TYPE_ICON[act.type] || '') : '';
      const dueTxt  = act && act.dueDate ? `<br><span class="act-due">${formatDate(act.dueDate)}</span>` : '';
      headerHTML += `<th style="min-width:80px;text-align:center" title="${act ? escapeHtml(act.name) : ''}">
        ${typeIcon ? `<span class="act-type-icon">${typeIcon}</span> ` : ''}${act ? escapeHtml(act.name) : `Act. ${i+1}`}${dueTxt}
      </th>`;
    }
    headerHTML += `<th style="min-width:70px;text-align:center">Promedio</th>`;
  });

  if (showChartBtn) headerHTML += `<th></th>`;
  headerHTML += `</tr>`;
  head.innerHTML = headerHTML;

  // ---- BODY ----
  const body = document.getElementById('table-body');
  if (!filteredStudents.length) {
    const colSpan = 2 + compsToShow.reduce((acc, comp) => {
      const c = activities.filter(a => a.competenciaIdx === comp.idx).length;
      return acc + Math.max(c, 3) + 1;
    }, 0) + (showChartBtn ? 1 : 0);
    body.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;padding:24px;color:var(--text-muted);font-style:italic">No se encontraron alumnos</td></tr>`;
    return;
  }

  body.innerHTML = filteredStudents.map(student => buildStudentRow(student, compsToShow, activities, grades, showChartBtn)).join('');
}

function buildStudentRow(student, compsToShow, activities, grades, showChartBtn) {
  const sGrades  = grades[student.id] || {};
  const isEditing = editingRowId === student.id;

  let rowHTML = `<tr class="student-row ${selectedStudentId === student.id ? 'row-selected' : ''} ${isEditing ? 'editing-row' : ''}"
    data-id="${student.id}"
    onclick="${isEditing ? '' : `selectStudent('${student.id}')`}">`;

  // ---- Botón editar / guardar ----
  if (isEditing) {
    rowHTML += `<td onclick="event.stopPropagation()">
      <button class="btn-save-row" onclick="saveRowEdit('${student.id}')" title="Guardar cambios">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="2 8 6 12 14 4"/></svg>
      </button>
    </td>`;
  } else {
    rowHTML += `<td onclick="event.stopPropagation()">
      <button class="btn btn-ghost btn-sm btn-icon" onclick="startRowEdit('${student.id}')" title="Editar fila">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"/></svg>
      </button>
    </td>`;
  }

  // ---- Nombre ----
  if (isEditing) {
    rowHTML += `<td onclick="event.stopPropagation()">
      <input type="text" class="row-name-input" id="edit-name-${student.id}" value="${escapeHtml(student.name)}" />
    </td>`;
  } else {
    rowHTML += `<td style="font-weight:500;white-space:nowrap">${escapeHtml(student.name)}</td>`;
  }

  // ---- Notas por competencia ----
  compsToShow.forEach(comp => {
    const compActs = activities.filter(a => a.competenciaIdx === comp.idx);
    const actCount = Math.max(compActs.length, 3);
    let actGradeLetters = [];

    for (let i = 0; i < actCount; i++) {
      const act  = compActs[i];
      const actId = act ? act.id : null;
      const currentVal = act ? (sGrades[actId] || '-') : '-';
      actGradeLetters.push(currentVal);
      const overdue = act && isDatePassed(act.dueDate) && currentVal === '-';

      if (isEditing && act) {
        // Combobox con opciones de nota
        const opts = GRADE_OPTIONS.map(o =>
          `<option value="${o}" ${o === currentVal ? 'selected' : ''}>${o}</option>`
        ).join('');
        rowHTML += `<td onclick="event.stopPropagation()" style="text-align:center">
          <select class="grade-select${overdue ? ' grade-overdue' : ''}" id="edit-grade-${student.id}-${actId}"
            data-val="${currentVal}"
            onchange="this.setAttribute('data-val', this.value)">
            ${opts}
          </select>
        </td>`;
      } else {
        rowHTML += `<td style="text-align:center" onclick="event.stopPropagation()">
          ${act ? (overdue ? `<span class="overdue-dot" title="Sin calificar · vencida"></span>` : gradeChip(currentVal)) : '<span style="color:var(--text-light);font-size:12px">—</span>'}
        </td>`;
      }
    }

    // Promedio de competencia
    const avgLetter = calcStudentAvg(student.id, compActs);
    rowHTML += `<td style="text-align:center" id="prom-${student.id}-${comp.idx}">
      ${avgLetter ? `<span class="promedio-badge ${gradeBadgeClass(avgLetter)}">${avgLetter}</span>` : '<span style="color:var(--text-light)">—</span>'}
    </td>`;
  });

  // ---- Botón gráficas ----
  if (showChartBtn) {
    rowHTML += `<td onclick="event.stopPropagation()">
      <button class="btn btn-ghost btn-sm btn-icon" onclick="openChartModal('${student.id}')" title="Ver gráfica">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><rect x="2" y="8" width="3" height="6"/><rect x="6.5" y="5" width="3" height="9"/><rect x="11" y="2" width="3" height="12"/></svg>
      </button>
    </td>`;
  }

  rowHTML += `</tr>`;
  return rowHTML;
}

// Chip visual para una nota
function gradeChip(val) {
  if (!val || val === '-') return `<span style="color:var(--text-light);font-size:12px">—</span>`;
  const cls = gradeBadgeClass(val);
  return `<span class="promedio-badge ${cls}" style="font-size:12px">${val}</span>`;
}

// ---- RENDER TABLE — TODOS LOS BIMESTRES ----
function renderTableAll() {
  const allActivities = DB.getActivities(courseId, sectionId);

  const head = document.getElementById('table-head');
  head.innerHTML = `<tr>
    <th style="width:40px"></th>
    <th style="min-width:170px">Alumno</th>
    <th style="text-align:center;min-width:90px">Bimestre 1</th>
    <th style="text-align:center;min-width:90px">Bimestre 2</th>
    <th style="text-align:center;min-width:90px">Bimestre 3</th>
    <th style="text-align:center;min-width:90px">Bimestre 4</th>
    <th style="text-align:center;min-width:110px;background:var(--accent-subtle);color:var(--accent)">Promedio Anual</th>
  </tr>`;

  const body = document.getElementById('table-body');
  if (!filteredStudents.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);font-style:italic">No se encontraron alumnos</td></tr>`;
    return;
  }

  body.innerHTML = filteredStudents.map(student => {
    const bimAvgs = [1,2,3,4].map(b => {
      const acts = allActivities.filter(a => a.bimestre === b);
      return calcStudentAvg(student.id, acts);
    });
    const annualAvg = calcStudentAvg(student.id, allActivities);
    const isEditing = editingRowId === student.id;

    let row = `<tr class="student-row ${selectedStudentId === student.id ? 'row-selected' : ''} ${isEditing ? 'editing-row' : ''}"
      data-id="${student.id}" onclick="${isEditing ? '' : `selectStudent('${student.id}')`}">`;

    if (isEditing) {
      row += `<td onclick="event.stopPropagation()">
        <button class="btn-save-row" onclick="saveRowEditAll('${student.id}')" title="Guardar">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="2 8 6 12 14 4"/></svg>
        </button></td>`;
      row += `<td onclick="event.stopPropagation()">
        <input type="text" class="row-name-input" id="edit-name-${student.id}" value="${escapeHtml(student.name)}" />
      </td>`;
    } else {
      row += `<td onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="startRowEdit('${student.id}')" title="Editar nombre">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"/></svg>
        </button></td>`;
      row += `<td style="font-weight:500;white-space:nowrap">${escapeHtml(student.name)}</td>`;
    }

    bimAvgs.forEach(avg => {
      row += `<td style="text-align:center">
        ${avg ? `<span class="promedio-badge ${gradeBadgeClass(avg)}">${avg}</span>` : '<span style="color:var(--text-light)">—</span>'}
      </td>`;
    });

    row += `<td style="text-align:center;background:var(--accent-subtle)">
      ${annualAvg ? `<span class="promedio-badge ${gradeBadgeClass(annualAvg)}" style="font-size:13px">${annualAvg}</span>` : '<span style="color:var(--text-light)">—</span>'}
    </td></tr>`;
    return row;
  }).join('');
}

function saveRowEditAll(studentId) {
  const nameInput = document.getElementById(`edit-name-${studentId}`);
  const newName = nameInput ? nameInput.value.trim() : null;
  if (!newName) { showToast('El nombre no puede estar vacío', 'error'); return; }

  const students = DB.getStudents(courseId, sectionId);
  const idx = students.findIndex(s => s.id === studentId);
  if (idx !== -1) students[idx].name = newName;
  DB.saveStudents(courseId, sectionId, students);

  editingRowId = null;
  editingRowSnapshot = null;
  showToast('Nombre actualizado', 'success');
  applyFiltersNoScroll();
}

// ---- INLINE EDITING ----
function startRowEdit(studentId) {
  if (editingRowId && editingRowId !== studentId) {
    cancelRowEdit();
  }
  editingRowSnapshot = {
    name: DB.getStudents(courseId, sectionId).find(s => s.id === studentId)?.name || '',
  };
  editingRowId = studentId;
  selectedStudentId = null;
  document.getElementById('btn-retire').style.display = 'none';
  applyFiltersNoScroll();
}

function cancelRowEdit() {
  editingRowId = null;
  editingRowSnapshot = null;
  applyFiltersNoScroll();
}

function saveRowEdit(studentId) {
  const nameInput = document.getElementById(`edit-name-${studentId}`);
  const newName   = nameInput ? nameInput.value.trim() : null;
  if (!newName) { showToast('El nombre no puede estar vacío', 'error'); return; }

  // Guardar nombre
  const students = DB.getStudents(courseId, sectionId);
  const idx = students.findIndex(s => s.id === studentId);
  if (idx !== -1) students[idx].name = newName;
  DB.saveStudents(courseId, sectionId, students);

  // Guardar notas de los selects visibles
  const grades = DB.getGrades(courseId, sectionId);
  if (!grades[studentId]) grades[studentId] = {};

  const bim      = parseInt(document.getElementById('filter-bimestre').value) || 1;
  const compIdx  = getSelectedCompIdx();
  const activities = getFilteredActivities(bim, compIdx);

  activities.forEach(act => {
    const sel = document.getElementById(`edit-grade-${studentId}-${act.id}`);
    if (sel) grades[studentId][act.id] = sel.value;
  });

  DB.saveGrades(courseId, sectionId, grades);

  editingRowId = null;
  editingRowSnapshot = null;
  showToast('Cambios guardados', 'success');
  applyFiltersNoScroll();
}

// applyFilters sin resetear el scroll
function applyFiltersNoScroll() {
  syncEditingUIState();
  applyFilters();
}

function syncEditingUIState() {
  document.querySelector('.main-content').classList.toggle('row-editing', !!editingRowId);
}

// ---- SELECT STUDENT (for retire) ----
function selectStudent(studentId) {
  if (editingRowId) return; // no seleccionar si hay fila editando
  if (selectedStudentId === studentId) {
    selectedStudentId = null;
    document.querySelectorAll('.student-row').forEach(r => r.classList.remove('row-selected'));
    document.getElementById('btn-retire').style.display = 'none';
  } else {
    selectedStudentId = studentId;
    document.querySelectorAll('.student-row').forEach(r => r.classList.remove('row-selected'));
    document.querySelectorAll(`.student-row[data-id="${studentId}"]`).forEach(r => r.classList.add('row-selected'));
    document.getElementById('btn-retire').style.display = '';
  }
}

function retireSelected() {
  if (!selectedStudentId) return;
  const s = DB.getStudents(courseId, sectionId).find(s => s.id === selectedStudentId);
  showConfirm('Retirar alumno', `¿Retirar a "${s?.name}"? Se eliminará de todos los cursos que compartan esta sección.`, () => {
    const students = DB.getStudents(courseId, sectionId);
    const idx = students.findIndex(st => st.id === selectedStudentId);
    if (idx !== -1) {
      students[idx].retired = true;
      DB.saveStudents(courseId, sectionId, students);
    }
    selectedStudentId = null;
    document.getElementById('btn-retire').style.display = 'none';
    applyFilters();
    showToast('Alumno retirado');
  });
}

// ---- ADD STUDENT ----
function openAddStudentModal() {
  document.getElementById('student-name').value = '';
  openModal('add-student-modal');
}

function getAllStudentNames() {
  const names = new Set();
  const seen  = new Set();
  DB.getCourses().forEach(course => {
    DB.getSections(course.id).forEach(sec => {
      const key = `${sec.grade}_${sec.letter}`;
      if (seen.has(key)) return;
      seen.add(key);
      DB.getStudents(course.id, sec.id).forEach(s => names.add(s.name.toLowerCase()));
    });
  });
  return names;
}

function saveStudent() {
  const name = document.getElementById('student-name').value.trim();
  if (!name) { showToast('Ingresa el nombre del alumno', 'error'); return; }

  if (getAllStudentNames().has(name.toLowerCase())) {
    showToast('Este alumno ya está registrado en el sistema', 'error'); return;
  }

  const students = DB.getStudents(courseId, sectionId);
  students.push({ id: uid(), name });
  DB.saveStudents(courseId, sectionId, students);
  closeModal('add-student-modal');
  applyFilters();
  showToast('Alumno agregado', 'success');
}

// ---- ACTIVITIES MODAL ----
function openActivitiesModal() {
  const bim = parseInt(document.getElementById('filter-bimestre').value) || 1;
  document.getElementById('act-filter-bim').value = bim;
  populateActModalComps();
  renderActivitiesModal();
  openModal('activities-modal');
}

function populateActModalComps() {
  const bim   = parseInt(document.getElementById('act-filter-bim').value) || 1;
  const comps = getSectionComps(bim);
  const sel   = document.getElementById('act-filter-comp');
  sel.innerHTML = comps.length
    ? comps.map((c, i) => `<option value="${i}">${c || 'Competencia ' + (i+1)}</option>`).join('')
    : `<option value="">Sin competencias en este bimestre</option>`;
}

function renderActivitiesModal() {
  const bim     = parseInt(document.getElementById('act-filter-bim').value) || 1;
  const compIdx = parseInt(document.getElementById('act-filter-comp').value);
  const activities = DB.getActivities(courseId, sectionId);
  const filtered   = activities.filter(a => a.bimestre === bim && a.competenciaIdx === compIdx);
  const list = document.getElementById('activities-list');

  if (!filtered.length) {
    list.innerHTML = `<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:13px;font-style:italic">Sin actividades para esta competencia</div>`;
    return;
  }

  list.innerHTML = filtered.map(a => `
    <div class="actividad-item">
      <div class="actividad-info">
        <div class="actividad-name">${ACT_TYPE_ICON[a.type] || ''} ${escapeHtml(a.name)}</div>
        <div class="actividad-meta">
          ${ACT_TYPE_LABEL[a.type] || ''}
          ${a.dueDate ? ` · <span class="act-due">${formatDate(a.dueDate)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="openEditActivityForm('${a.id}')">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z"/></svg>
          Editar
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteActivity('${a.id}')">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><rect x="3" y="4" width="10" height="10" rx="1"/></svg>
          Borrar
        </button>
      </div>
    </div>`).join('');
}

function openCreateActivityForm() {
  editingActivityId = null;
  document.getElementById('editing-act-id').value = '';
  document.getElementById('create-act-form-title').textContent = 'Nueva actividad';
  document.getElementById('save-act-btn').textContent = 'Crear actividad';
  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('act-name').value = '';
  const dueDateInputC = document.getElementById('act-due-date');
  dueDateInputC.value = '';
  dueDateInputC.min   = todayStr;
  selectedActType = 'practica';
  document.querySelectorAll('.act-type-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.type === 'practica');
  });
  document.getElementById('create-act-form').style.display = 'block';
  document.getElementById('act-name').focus();
}

function openEditActivityForm(actId) {
  const activity = DB.getActivities(courseId, sectionId).find(a => a.id === actId);
  if (!activity) return;
  editingActivityId = actId;
  document.getElementById('editing-act-id').value = actId;
  document.getElementById('create-act-form-title').textContent = 'Editar actividad';
  document.getElementById('save-act-btn').textContent = 'Guardar cambios';
  document.getElementById('act-name').value = activity.name;
  const dueDateInputE = document.getElementById('act-due-date');
  dueDateInputE.value = activity.dueDate || '';
  dueDateInputE.min   = new Date().toISOString().slice(0, 10);
  selectedActType = activity.type || 'practica';
  document.querySelectorAll('.act-type-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.type === selectedActType);
  });
  document.getElementById('create-act-form').style.display = 'block';
  document.getElementById('act-name').focus();
}

function closeActivityForm() {
  editingActivityId = null;
  document.getElementById('editing-act-id').value = '';
  document.getElementById('create-act-form').style.display = 'none';
}

function selectActType(type, el) {
  selectedActType = type;
  document.querySelectorAll('.act-type-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
}

function saveActivity() {
  const name = document.getElementById('act-name').value.trim();
  if (!name) { showToast('Ingresa el nombre de la actividad', 'error'); return; }
  const bim     = parseInt(document.getElementById('act-filter-bim').value) || 1;
  const compIdx = parseInt(document.getElementById('act-filter-comp').value);
  if (isNaN(compIdx)) { showToast('No hay competencias definidas para este bimestre', 'error'); return; }
  const dueDate = document.getElementById('act-due-date').value;
  if (!dueDate) { showToast('Selecciona la fecha de vencimiento', 'error'); return; }
  const activities = DB.getActivities(courseId, sectionId);

  if (editingActivityId) {
    const duplicate = activities.find(a => a.id !== editingActivityId && a.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { showToast('Ya existe una actividad con ese nombre', 'error'); return; }
    const idx = activities.findIndex(a => a.id === editingActivityId);
    if (idx !== -1) {
      activities[idx] = { ...activities[idx], name, type: selectedActType, dueDate };
    }
    DB.saveActivities(courseId, sectionId, activities);
    closeActivityForm();
    renderActivitiesModal();
    applyFilters();
    showToast('Actividad actualizada', 'success');
  } else {
    const compActivities = activities.filter(a => a.bimestre === bim && a.competenciaIdx === compIdx);
    if (compActivities.length >= 8) { showToast('Límite de 8 actividades por competencia alcanzado', 'error'); return; }
    const duplicate = activities.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { showToast('Ya existe una actividad con ese nombre', 'error'); return; }
    activities.push({ id: uid(), name, bimestre: bim, competenciaIdx: compIdx, type: selectedActType, dueDate });
    DB.saveActivities(courseId, sectionId, activities);
    closeActivityForm();
    renderActivitiesModal();
    applyFilters();
    showToast('Actividad creada', 'success');
  }
}

function deleteActivity(actId) {
  showConfirm('Eliminar actividad', '¿Eliminar esta actividad? Se perderán las notas asociadas.', () => {
    const activities = DB.getActivities(courseId, sectionId).filter(a => a.id !== actId);
    DB.saveActivities(courseId, sectionId, activities);
    renderActivitiesModal();
    applyFilters();
    showToast('Actividad eliminada');
  });
}

// ---- DATE HELPERS ----
function isDatePassed(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') < today;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ---- EXPORT PDF ----
function exportPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast('Error al cargar jsPDF', 'error'); return; }

  const bim      = parseInt(document.getElementById('filter-bimestre').value);
  const students = filteredStudents.length ? filteredStudents : DB.getStudents(courseId, sectionId);
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFont('helvetica');
  doc.setFontSize(16);
  doc.text(`${currentCourse.name} — ${currentSection.grade} "${currentSection.letter}"`, 14, 18);
  doc.setFontSize(10);

  if (bim === 0) {
    const allActivities = DB.getActivities(courseId, sectionId);
    doc.text(`Todos los bimestres | Generado: ${new Date().toLocaleDateString('es-PE')}`, 14, 25);
    const head = [['N°', 'Alumno', 'Bim. 1', 'Bim. 2', 'Bim. 3', 'Bim. 4', 'Promedio Anual']];
    const body = students.map((s, i) => {
      const bimAvgs = [1,2,3,4].map(b => calcStudentAvg(s.id, allActivities.filter(a => a.bimestre === b)) || '—');
      return [i + 1, s.name, ...bimAvgs, calcStudentAvg(s.id, allActivities) || '—'];
    });
    doc.autoTable({ head, body, startY: 30, styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [59, 111, 160] } });
    doc.save(`${currentCourse.name}_${currentSection.grade}${currentSection.letter}_Todos.pdf`);
  } else {
    const compIdx  = getSelectedCompIdx();
    const activities = getFilteredActivities(bim, compIdx);
    const grades   = DB.getGrades(courseId, sectionId);
    doc.text(`Bimestre ${bim} | Generado: ${new Date().toLocaleDateString('es-PE')}`, 14, 25);
    const head = [['N°', 'Alumno', ...activities.map(a => a.name), 'Promedio']];
    const body = students.map((s, i) => {
      const sG = grades[s.id] || {};
      return [i + 1, s.name, ...activities.map(a => sG[a.id] || '—'), calcStudentAvg(s.id, activities) || '—'];
    });
    doc.autoTable({ head, body, startY: 30, styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [59, 111, 160] } });
    doc.save(`${currentCourse.name}_${currentSection.grade}${currentSection.letter}_B${bim}.pdf`);
  }
  showToast('PDF generado', 'success');
}

// ---- EXPORT EXCEL ----
async function exportExcel() {
  if (!window.ExcelJS) { showToast('Error al cargar ExcelJS', 'error'); return; }

  const bim      = parseInt(document.getElementById('filter-bimestre').value);
  const students = filteredStudents.length ? filteredStudents : DB.getStudents(courseId, sectionId);

  const wb = new ExcelJS.Workbook();
  let sheetName, fileName;

  // ---- helpers de estilo ----
  const borderThin = { style: 'thin', color: { argb: 'FFCCCCCC' } };
  const allBorders = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };

  const GRADE_FILL = {
    AD: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } },
    A:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } },
    B:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
    C:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
  };
  const GRADE_FONT_COLOR = { AD: 'FF065F46', A: 'FF1E40AF', B: 'FF92400E', C: 'FF991B1B' };

  function styleHeader(cell) {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B6FA0' } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = allBorders;
  }

  function styleData(cell, isAlumno, gradeVal, isAnual) {
    if (isAnual) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E6F5' } };
      cell.font = { bold: true, size: 10, color: { argb: 'FF1E3A5F' } };
    } else if (gradeVal && GRADE_FILL[gradeVal]) {
      cell.fill = GRADE_FILL[gradeVal];
      cell.font = { size: 10, color: { argb: GRADE_FONT_COLOR[gradeVal] } };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cell.font = { size: 10 };
    }
    cell.alignment = { horizontal: isAlumno ? 'left' : 'center', vertical: 'middle' };
    cell.border = allBorders;
  }

  function addTitleRow(ws, text, colCount) {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, colCount);
    row.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } };
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    row.height = 20;
  }

  // ---- bim === 0: tabla resumen ----
  if (bim === 0) {
    sheetName = 'Todos';
    fileName  = `${currentCourse.name}_${currentSection.grade}${currentSection.letter}_Todos.xlsx`;
    const ws  = wb.addWorksheet(sheetName);
    const allActivities = DB.getActivities(courseId, sectionId);
    const headers = ['N°', 'Alumno', 'Bimestre 1', 'Bimestre 2', 'Bimestre 3', 'Bimestre 4', 'Promedio Anual'];

    addTitleRow(ws, `${currentCourse.name} — ${currentSection.grade} "${currentSection.letter}"`, headers.length);
    addTitleRow(ws, `Todos los bimestres | Generado: ${new Date().toLocaleDateString('es-PE')}`, headers.length);

    const hRow = ws.addRow(headers);
    hRow.height = 22;
    hRow.eachCell(cell => styleHeader(cell));

    students.forEach((s, i) => {
      const bimAvgs = [1,2,3,4].map(b => calcStudentAvg(s.id, allActivities.filter(a => a.bimestre === b)) || '—');
      const anual   = calcStudentAvg(s.id, allActivities) || '—';
      const dRow    = ws.addRow([i + 1, s.name, ...bimAvgs, anual]);
      dRow.height   = 18;
      dRow.eachCell((cell, colNum) => {
        const isAlumno = colNum === 2;
        const isAnual  = colNum === headers.length;
        const gradeVal = colNum >= 3 && !isAnual ? cell.value : null;
        styleData(cell, isAlumno, gradeVal, isAnual);
      });
    });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 32;
    for (let c = 3; c <= headers.length; c++) ws.getColumn(c).width = 16;

  // ---- bim > 0: tabla de actividades ----
  } else {
    const compIdx    = getSelectedCompIdx();
    const activities = getFilteredActivities(bim, compIdx);
    const grades     = DB.getGrades(courseId, sectionId);
    sheetName = `B${bim}`;
    fileName  = `${currentCourse.name}_${currentSection.grade}${currentSection.letter}_B${bim}.xlsx`;
    const ws  = wb.addWorksheet(sheetName);
    const headers = ['N°', 'Alumno', ...activities.map(a => `[${ACT_TYPE_LABEL[a.type] || ''}] ${a.name}`), 'Promedio'];

    addTitleRow(ws, `${currentCourse.name} — ${currentSection.grade} "${currentSection.letter}"`, headers.length);
    addTitleRow(ws, `Bimestre ${bim} | Generado: ${new Date().toLocaleDateString('es-PE')}`, headers.length);

    const hRow = ws.addRow(headers);
    hRow.height = 22;
    hRow.eachCell(cell => styleHeader(cell));

    students.forEach((s, i) => {
      const sG    = grades[s.id] || {};
      const avg   = calcStudentAvg(s.id, activities) || '—';
      const vals  = activities.map(a => sG[a.id] || '—');
      const dRow  = ws.addRow([i + 1, s.name, ...vals, avg]);
      dRow.height = 18;
      dRow.eachCell((cell, colNum) => {
        const isAlumno = colNum === 2;
        const isAnual  = colNum === headers.length;
        const actIdx   = colNum - 3;
        const gradeVal = !isAlumno && !isAnual && actIdx >= 0 ? cell.value : null;
        styleData(cell, isAlumno, gradeVal, isAnual);
      });
    });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 32;
    for (let c = 3; c <= headers.length; c++) ws.getColumn(c).width = 20;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = fileName;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Excel generado', 'success');
}

// ---- IMPORTAR ALUMNOS DESDE EXCEL ----
let _importCandidates = []; // nombres leídos del archivo

function triggerImportExcel() {
  const input = document.getElementById('excel-file-input');
  input.value = '';
  input.click();
}

async function handleExcelFile(input) {
  const file = input.files[0];
  if (!file) return;

  if (!window.ExcelJS) {
    showToast('Error: librería Excel no cargada', 'error'); return;
  }

  try {
    const wb    = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const sheet = wb.worksheets[0];
    if (!sheet) { showToast('El archivo no tiene hojas', 'error'); return; }

    const HEADER_WORDS = ['nombre', 'alumno', 'student', 'name', 'apellido', 'n°', 'nro', 'num', '#'];
    const names = [];

    sheet.eachRow((row, rowNum) => {
      const val = String(row.getCell(1).text || '').trim();
      if (!val) return;
      // saltar primera fila si parece encabezado
      if (rowNum === 1 && HEADER_WORDS.some(w => val.toLowerCase().includes(w))) return;
      names.push(val);
    });

    if (!names.length) { showToast('No se encontraron nombres en la primera columna', 'error'); return; }

    _importCandidates = names;
    renderImportPreview(names);
    openModal('import-excel-modal');
  } catch {
    showToast('No se pudo leer el archivo Excel', 'error');
  }
}

function renderImportPreview(names) {
  const existing = getAllStudentNames();
  const list     = document.getElementById('import-preview-list');
  const note     = document.getElementById('import-duplicate-note');
  const hasDups  = names.some(n => existing.has(n.toLowerCase()));

  note.style.display = hasDups ? '' : 'none';
  if (hasDups) {
    note.textContent = 'Los nombres ya registrados en cualquier sección serán omitidos.';
  }

  list.innerHTML = names.map((name, i) => {
    const isDup = existing.has(name.toLowerCase());
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;
                    background:var(--bg);border:1px solid var(--border-light);cursor:pointer;
                    ${isDup ? 'opacity:0.5' : ''}">
        <input type="checkbox" data-idx="${i}" ${isDup ? '' : 'checked'}
               ${isDup ? 'disabled' : ''}
               style="width:15px;height:15px;flex-shrink:0" />
        <span style="font-size:13px;flex:1">${name}</span>
        ${isDup ? '<span style="font-size:11px;color:var(--text-muted)">ya registrado</span>' : ''}
      </label>`;
  }).join('');

  const checkedCount = list.querySelectorAll('input[type=checkbox]:checked').length;
  document.getElementById('btn-confirm-import').textContent = `Importar ${checkedCount}`;

  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = list.querySelectorAll('input[type=checkbox]:checked').length;
      document.getElementById('btn-confirm-import').textContent = `Importar ${n}`;
    });
  });
}

function confirmImport() {
  const list     = document.getElementById('import-preview-list');
  const checked  = [...list.querySelectorAll('input[type=checkbox]:checked')];
  const selected = checked.map(cb => _importCandidates[parseInt(cb.dataset.idx)]).filter(Boolean);

  if (!selected.length) { showToast('Selecciona al menos un alumno', 'error'); return; }

  const globalNames = getAllStudentNames();
  const students    = DB.getStudents(courseId, sectionId);

  let added = 0;
  selected.forEach(name => {
    if (!globalNames.has(name.toLowerCase())) {
      students.push({ id: uid(), name });
      globalNames.add(name.toLowerCase());
      added++;
    }
  });

  DB.saveStudents(courseId, sectionId, students);
  closeModal('import-excel-modal');
  applyFilters();
  showToast(`${added} alumno${added !== 1 ? 's' : ''} importado${added !== 1 ? 's' : ''}`, 'success');
}

// ---- CHART MODAL ----
function openChartModal(studentId) {
  const compIdx = getSelectedCompIdx();
  if (compIdx === null) return;

  const bim      = parseInt(document.getElementById('filter-bimestre').value) || 1;
  const acts     = getFilteredActivities(bim, compIdx);
  const student  = DB.getStudents(courseId, sectionId).find(s => s.id === studentId);
  const sGrades  = (DB.getGrades(courseId, sectionId)[studentId]) || {};
  const comps    = getSectionComps(bim);
  const compName = comps[compIdx] || `Competencia ${compIdx + 1}`;

  document.getElementById('chart-modal-title').textContent    = student?.name || 'Alumno';
  document.getElementById('chart-modal-subtitle').textContent = `Bimestre ${bim} · ${compName}`;

  const avg      = calcStudentAvg(studentId, acts);
  const avgBadge = document.getElementById('chart-avg-badge');
  if (avg) {
    avgBadge.className   = `promedio-badge ${gradeBadgeClass(avg)}`;
    avgBadge.textContent = `Promedio: ${avg}`;
    avgBadge.style.display = 'inline-block';
  } else {
    avgBadge.style.display = 'none';
  }

  // Promedio numérico exacto para posicionar la línea en el eje Y
  const numVals = acts.map(a => GRADE_VALUE[sGrades[a.id]]).filter(v => v != null);
  const numAvg  = numVals.length ? numVals.reduce((s, v) => s + v, 0) / numVals.length : null;

  openModal('chart-modal');
  requestAnimationFrame(() => drawGradeChart(acts, sGrades, numAvg));
}

function drawGradeChart(activities, sGrades, numAvg) {
  const canvas = document.getElementById('chart-canvas');
  const ctx    = canvas.getContext('2d');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Ajustar canvas al ancho disponible en el modal body (restando padding para evitar scroll)
  const body = document.getElementById('chart-modal-body');
  const bodyStyle = window.getComputedStyle(body);
  const paddingLeft = parseFloat(bodyStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(bodyStyle.paddingRight) || 0;
  const cssW = body.clientWidth - paddingLeft - paddingRight - 2;
  const cssH = 260;
  const dpr  = window.devicePixelRatio || 1;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.scale(dpr, dpr);

  // Paleta de colores (respeta dark mode)
  const C = {
    text:  isDark ? '#E0EAF5' : '#1E2A36',
    muted: isDark ? '#7E96B0' : '#6B7B8D',
    grid:  isDark ? '#2A3A50' : '#EAE5DE',
    axis:  isDark ? '#3A4F63' : '#DDD6CC',
    avg:   isDark ? '#5A8DC0' : '#3B6FA0',
    bg:    isDark ? '#1C2738' : '#FFFFFF',
  };
  const BARS = {
    AD: { fill: '#D1FAE5', stroke: '#34D399', label: '#065F46' },
    A:  { fill: '#DBEAFE', stroke: '#60A5FA', label: '#1E40AF' },
    B:  { fill: '#FEF3C7', stroke: '#FBBF24', label: '#92400E' },
    C:  { fill: '#FEE2E2', stroke: '#F87171', label: '#991B1B' },
    '-':{ fill: isDark ? '#243044' : '#F0EDE8', stroke: isDark ? '#3A4F63' : '#CCC7BD', label: isDark ? '#4A6070' : '#9AABB8' },
  };

  const PAD    = { top: 28, right: 20, bottom: 72, left: 50 };
  const chartW = cssW - PAD.left - PAD.right;
  const chartH = cssH - PAD.top - PAD.bottom;

  // Fondo
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  // Líneas de cuadrícula + etiquetas eje Y
  [{ v: 1, l: 'C' }, { v: 2, l: 'B' }, { v: 3, l: 'A' }, { v: 4, l: 'AD' }].forEach(({ v, l }) => {
    const y = PAD.top + chartH - (v / 4) * chartH;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + chartW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle     = C.muted;
    ctx.font          = '11px DM Sans,sans-serif';
    ctx.textAlign     = 'right';
    ctx.textBaseline  = 'middle';
    ctx.fillText(l, PAD.left - 8, y);
  });

  // Ejes X e Y
  ctx.strokeStyle = C.axis;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + chartH);
  ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
  ctx.stroke();

  // Sin actividades
  if (!activities.length) {
    ctx.fillStyle    = C.muted;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = '13px DM Sans,sans-serif';
    ctx.fillText('Sin actividades en esta competencia', cssW / 2, PAD.top + chartH / 2);
    return;
  }

  // Barras
  const n      = activities.length;
  const groupW = chartW / n;
  const barW   = Math.min(groupW * 0.55, 60);

  activities.forEach((act, i) => {
    const g   = sGrades[act.id] || '-';
    const val = GRADE_VALUE[g] ?? 0;
    const pal = BARS[g] ?? BARS['-'];
    const cx  = PAD.left + groupW * i + groupW / 2;
    const x   = cx - barW / 2;
    const bH  = val > 0 ? (val / 4) * chartH : 3;
    const y   = PAD.top + chartH - bH;
    const r   = Math.min(5, barW / 4);

    ctx.fillStyle   = pal.fill;
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    if (val > 0) {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.arcTo(x + barW, y, x + barW, y + r, r);
      ctx.lineTo(x + barW, PAD.top + chartH);
      ctx.lineTo(x, PAD.top + chartH);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Etiqueta de nota encima de la barra
      ctx.fillStyle    = pal.label;
      ctx.font         = 'bold 12px DM Sans,sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(g, cx, y - 4);
    } else {
      // Sin nota: franja pequeña en la base
      ctx.beginPath();
      ctx.rect(x, PAD.top + chartH - 3, barW, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Nombre de actividad (etiqueta rotada -45°)
    ctx.save();
    ctx.translate(cx, PAD.top + chartH + 10);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = C.muted;
    ctx.font         = '11px DM Sans,sans-serif';
    const maxLabelPx = PAD.bottom - 14;
    let label = act.name;
    while (label.length > 3 && ctx.measureText(label).width > maxLabelPx) {
      label = label.slice(0, -1);
    }
    if (label.length < act.name.length) label = label.slice(0, -1) + '…';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  // Línea de promedio (posición numérica exacta)
  if (numAvg !== null) {
    const avgY = PAD.top + chartH - (numAvg / 4) * chartH;
    ctx.strokeStyle = C.avg;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.left + 4, avgY);
    ctx.lineTo(PAD.left + chartW, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle    = C.avg;
    ctx.font         = 'bold 10px DM Sans,sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('promedio', PAD.left + chartW, avgY - 4);
  }
}
