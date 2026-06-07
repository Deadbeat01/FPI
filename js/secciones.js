// =========================================
// SECCIONES.JS — Lógica de la pantalla de secciones
// =========================================

const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];

let courseId = null;
let currentCourse = null;
let editingSectionId = null;
let activeGradeFilter = 'Todos';
let selectedDays = [];
let dayTimes = {};

document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initSidebar('inicio');
  courseId = STATE.getCourse();
  if (!courseId) { window.location.href = 'inicio.html'; return; }

  const courses = DB.getCourses();
  currentCourse = courses.find(c => c.id === courseId);
  if (!currentCourse) { window.location.href = 'inicio.html'; return; }

  document.getElementById('course-title').textContent = currentCourse.name;
  document.getElementById('breadcrumb-course').textContent = currentCourse.name;
  document.getElementById('course-schedule').textContent = 'Secciones del curso';

  renderScheduleUI();
  renderGradeFilter();
  renderSections();
});

// ---- FILTRO POR GRADO ----
function renderGradeFilter() {
  const sections = DB.getSections(courseId);
  const grades = ['Todos', ...new Set(sections.map(s => s.grade))].sort((a, b) => {
    if (a === 'Todos') return -1;
    return a.localeCompare(b);
  });

  const bar = document.getElementById('grade-filter-bar');
  const label = bar.querySelector('span');
  bar.innerHTML = '';
  bar.appendChild(label);

  grades.forEach(g => {
    const btn = document.createElement('button');
    btn.className = `grade-filter-btn ${g === activeGradeFilter ? 'active' : ''}`;
    btn.textContent = g;
    btn.onclick = () => {
      activeGradeFilter = g;
      bar.querySelectorAll('.grade-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSections();
    };
    bar.appendChild(btn);
  });
}

// ---- CALCULAR PROMEDIO DE SECCIÓN ----
// Devuelve la letra promedio dominante entre todos los alumnos y todas las notas de la sección
function calcSectionAvg(sectionId) {
  const students = DB.getStudents(courseId, sectionId).filter(s => !s.retired);
  const grades = DB.getGrades(courseId, sectionId);
  const activities = DB.getActivities(courseId, sectionId);

  if (!students.length || !activities.length) return null;

  let totalVal = 0;
  let totalCount = 0;

  students.forEach(s => {
    const sGrades = grades[s.id] || {};
    activities.forEach(act => {
      const val = GRADE_VALUE[sGrades[act.id]];
      if (val !== null && val !== undefined) {
        totalVal += val;
        totalCount++;
      }
    });
  });

  if (!totalCount) return null;
  const avg = totalVal / totalCount;

  // Convertir promedio numérico a letra
  if (avg >= 3.5) return 'AD';
  if (avg >= 2.5) return 'A';
  if (avg >= 1.5) return 'B';
  return 'C';
}

function avgBadgeClass(letter) {
  if (!letter) return 'grade-none';
  return { 'AD': 'grade-ad', 'A': 'grade-a', 'B': 'grade-b', 'C': 'grade-c' }[letter] || 'grade-none';
}

// ---- SCHEDULE UI ----
function renderScheduleUI() {
  const daysCont = document.getElementById('schedule-days');
  if (!daysCont) return;
  daysCont.innerHTML = DAYS.map(d => `
    <div class="day-toggle ${selectedDays.includes(d) ? 'selected' : ''}"
         onclick="toggleDay('${d}', this)">${d}</div>
  `).join('');
  renderDayTimesSection();
}

function renderDayTimesSection() {
  const cont = document.getElementById('schedule-times');
  if (!cont) return;
  if (!selectedDays.length) { cont.innerHTML = ''; return; }

  cont.innerHTML =
    `<div class="schedule-times-header">
      <span></span><span>Hora inicio</span><span>Hora fin</span>
    </div>` +
    selectedDays.map(day => {
      const idx = DAYS.indexOf(day);
      return `<div class="schedule-day-row">
        <span class="schedule-day-label">${day}</span>
        <input type="time" class="form-control" id="st-start-${idx}" min="07:00" max="22:00" />
        <input type="time" class="form-control" id="st-end-${idx}"   min="07:00" max="22:00" />
      </div>`;
    }).join('');

  selectedDays.forEach(day => {
    const idx = DAYS.indexOf(day);
    const t = dayTimes[day] || { start: '08:00', end: '09:00' };
    const s = document.getElementById(`st-start-${idx}`);
    const e = document.getElementById(`st-end-${idx}`);
    if (s) s.value = t.start;
    if (e) e.value = t.end;
  });
}

function toggleDay(day, el) {
  if (selectedDays.includes(day)) {
    selectedDays = selectedDays.filter(d => d !== day);
    delete dayTimes[day];
    el.classList.remove('selected');
  } else {
    selectedDays.push(day);
    selectedDays.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
    dayTimes[day] = { start: '08:00', end: '09:00' };
    el.classList.add('selected');
  }
  renderDayTimesSection();
}

function getSchedule() {
  const times = {};
  selectedDays.forEach(day => {
    const idx = DAYS.indexOf(day);
    const s = document.getElementById(`st-start-${idx}`);
    const e = document.getElementById(`st-end-${idx}`);
    times[day] = { start: s ? s.value : '08:00', end: e ? e.value : '09:00' };
  });
  return { days: [...selectedDays], times };
}

function setSchedule(schedule) {
  if (!schedule) return;
  selectedDays = (schedule.days || []).filter(d => DAYS.includes(d));
  dayTimes = {};
  selectedDays.forEach(day => {
    dayTimes[day] = (schedule.times && schedule.times[day])
      ? schedule.times[day]
      : { start: '08:00', end: '09:00' };
  });
  renderScheduleUI();
}

// ---- SECTION COMPETENCIAS ----
function renderSectionBimestres() {
  const cont = document.getElementById('section-bimestres-container');
  if (!cont) return;
  const courseComps = (currentCourse.competencias && currentCourse.competencias[1]) || [];
  cont.innerHTML = [1,2,3,4].map(b => `
    <div class="bimestre-block">
      <div class="bimestre-header" onclick="toggleSectionBimestre(${b})">
        <span>Bimestre ${b}</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="4 6 8 10 12 6"/></svg>
      </div>
      <div class="bimestre-body ${b === 1 ? 'open' : ''}" id="sec-bim-body-${b}">
        ${courseComps.length
          ? courseComps.map((c, i) => `
            <label class="comp-checkbox-row">
              <input type="checkbox" id="sec-comp-${b}-${i}" />
              <span>${c}</span>
            </label>`).join('')
          : '<p style="font-size:12.5px;color:var(--text-muted);font-style:italic;padding:4px 0">El curso no tiene competencias definidas.</p>'
        }
      </div>
    </div>
  `).join('');
}

function toggleSectionBimestre(b) {
  document.getElementById(`sec-bim-body-${b}`).classList.toggle('open');
}

function getSectionCompetencias() {
  const courseComps = (currentCourse.competencias && currentCourse.competencias[1]) || [];
  const result = {};
  [1,2,3,4].forEach(b => {
    result[b] = courseComps.filter((c, i) => {
      const cb = document.getElementById(`sec-comp-${b}-${i}`);
      return cb && cb.checked;
    });
  });
  return result;
}

function setSectionCompetencias(competencias) {
  const courseComps = (currentCourse.competencias && currentCourse.competencias[1]) || [];
  [1,2,3,4].forEach(b => {
    const assigned = (competencias && competencias[b]) || [];
    courseComps.forEach((c, i) => {
      const cb = document.getElementById(`sec-comp-${b}-${i}`);
      if (cb) cb.checked = assigned.includes(c);
    });
  });
}

function validateSectionCompetencias(competencias) {
  const courseComps = (currentCourse.competencias && currentCourse.competencias[1]) || [];
  if (!courseComps.length) return true;
  for (let b = 1; b <= 4; b++) {
    if (!competencias[b] || !competencias[b].length) return false;
  }
  return true;
}

// ---- MODAL ----
function openSectionModal(sectionId = null) {
  editingSectionId = sectionId;
  selectedDays = [];
  dayTimes = {};
  renderSectionBimestres();
  document.getElementById('section-comp-hint').classList.remove('visible');

  const courseComps = (currentCourse.competencias && currentCourse.competencias[1]) || [];
  const allComps = {};
  [1,2,3,4].forEach(b => { allComps[b] = [...courseComps]; });

  if (sectionId) {
    const section = DB.getSections(courseId).find(s => s.id === sectionId);
    if (!section) return;
    document.getElementById('section-modal-title').textContent = 'Editar sección';
    document.getElementById('section-grade').value = section.grade;
    document.getElementById('section-letter').value = section.letter;
    if (section.schedule) setSchedule(section.schedule);
    else renderScheduleUI();
    setSectionCompetencias(section.competencias || allComps);
  } else {
    document.getElementById('section-modal-title').textContent = 'Agregar sección';
    document.getElementById('section-grade').value = '';
    document.getElementById('section-letter').value = '';
    renderScheduleUI();
    setSectionCompetencias(allComps);
  }
  openModal('section-modal');
}

// ---- DETECCIÓN DE CONFLICTOS DE HORARIO ----
// Compara el schedule propuesto contra todas las secciones de todos los cursos.
// Devuelve array de objetos { day, courseName, sectionLabel, time } para cada solapamiento.
function getScheduleConflicts(schedule, excludeSectionId) {
  const conflicts = [];
  const { days = [], times = {} } = schedule;
  if (!days.length) return conflicts;

  DB.getCourses().forEach(course => {
    DB.getSections(course.id).forEach(sec => {
      if (sec.id === excludeSectionId) return;
      if (!sec.schedule || !sec.schedule.days || !sec.schedule.days.length) return;

      days.forEach(day => {
        if (!sec.schedule.days.includes(day)) return;

        const t1 = times[day];
        const t2 = sec.schedule.times && sec.schedule.times[day];
        if (!t1?.start || !t1?.end || !t2?.start || !t2?.end) return;

        const s1 = toMin(t1.start), e1 = toMin(t1.end);
        const s2 = toMin(t2.start), e2 = toMin(t2.end);

        if (s1 < e2 && s2 < e1) {
          conflicts.push({
            day,
            courseName: course.name,
            sectionLabel: `${sec.grade} "${sec.letter}"`,
            time: `${t2.start}–${t2.end}`,
          });
        }
      });
    });
  });

  return conflicts;
}

function validateScheduleTimes() {
  for (const day of selectedDays) {
    const idx   = DAYS.indexOf(day);
    const sEl   = document.getElementById(`st-start-${idx}`);
    const eEl   = document.getElementById(`st-end-${idx}`);
    if (!sEl?.value || !eEl?.value) {
      showToast(`Ingresa el horario para ${day}`, 'error'); return false;
    }
    const sMin  = toMin(sEl.value);
    const eMin  = toMin(eEl.value);
    if (sMin < 7 * 60)   { showToast(`Hora mínima 07:00 (${day})`, 'error'); return false; }
    if (eMin > 22 * 60)  { showToast(`Hora máxima 22:00 (${day})`, 'error'); return false; }
    if (sMin >= eMin)    { showToast(`La hora fin debe ser mayor a la de inicio (${day})`, 'error'); return false; }
  }
  return true;
}

function saveSection() {
  const grade = document.getElementById('section-grade').value;
  const letter = document.getElementById('section-letter').value;
  if (!grade || !letter) { showToast('Completa todos los campos', 'error'); return; }
  if (selectedDays.length && !validateScheduleTimes()) return;

  const sectionComps = getSectionCompetencias();
  if (!validateSectionCompetencias(sectionComps)) {
    document.getElementById('section-comp-hint').classList.add('visible');
    for (let b = 1; b <= 4; b++) {
      if (!sectionComps[b] || !sectionComps[b].length) {
        document.getElementById(`sec-bim-body-${b}`).classList.add('open');
      }
    }
    showToast('Selecciona al menos 1 competencia por bimestre', 'error');
    return;
  }
  document.getElementById('section-comp-hint').classList.remove('visible');

  const schedule = getSchedule();

  const conflicts = getScheduleConflicts(schedule, editingSectionId);
  if (conflicts.length) {
    const detail = conflicts
      .map(c => `${c.day}: ${c.courseName} – ${c.sectionLabel} (${c.time})`)
      .join(' | ');
    showToast(`Conflicto de horario → ${detail}`, 'error', 5000);
    return;
  }

  const sections = DB.getSections(courseId);

  if (editingSectionId) {
    const duplicate = sections.find(s => s.id !== editingSectionId && s.grade === grade && s.letter === letter);
    if (duplicate) { showToast('Esa sección ya existe en este curso', 'error'); return; }
    const idx = sections.findIndex(s => s.id === editingSectionId);
    if (idx !== -1) {
      sections[idx].grade = grade;
      sections[idx].letter = letter;
      sections[idx].schedule = schedule;
      sections[idx].competencias = sectionComps;
    }
    showToast('Sección actualizada', 'success');
  } else {
    const exists = sections.find(s => s.grade === grade && s.letter === letter);
    if (exists) { showToast('Esa sección ya existe', 'error'); return; }
    const linkedGlobally = DB.getCourses()
      .filter(c => c.id !== courseId)
      .some(c => DB.getSections(c.id).some(s => s.grade === grade && s.letter === letter));
    sections.push({ id: uid(), grade, letter, schedule, competencias: sectionComps, createdAt: Date.now() });
    showToast(
      linkedGlobally
        ? `Sección creada y vinculada a la lista de alumnos de ${grade}"${letter}"`
        : 'Sección creada',
      linkedGlobally ? 'default' : 'success',
      linkedGlobally ? 4000 : 2800
    );
  }

  DB.saveSections(courseId, sections);
  closeModal('section-modal');
  renderGradeFilter();
  renderSections();
}

function deleteSection(id) {
  showConfirm('Eliminar sección', '¿Eliminar esta sección? Se perderán las actividades y notas de este curso. Los alumnos de la sección global no se eliminarán.', () => {
    DB.deleteSectionData(courseId, id);
    DB.saveSections(courseId, DB.getSections(courseId).filter(s => s.id !== id));
    renderGradeFilter();
    renderSections();
    showToast('Sección eliminada');
  });
}

// ---- RENDER SECTIONS ----
function renderSections() {
  let sections = DB.getSections(courseId);

  // Aplicar filtro de grado
  if (activeGradeFilter !== 'Todos') {
    sections = sections.filter(s => s.grade === activeGradeFilter);
  }

  const grid = document.getElementById('sections-grid');
  const empty = document.getElementById('empty-state');

  if (!sections.length) {
    empty.style.display = 'flex';
    grid.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = sections.map(s => {
    const students = DB.getStudents(courseId, s.id).filter(st => !st.retired);
    const avgLetter = calcSectionAvg(s.id);
    const badgeCls = avgBadgeClass(avgLetter);

    return `
    <div class="section-card">
      <div class="section-badge" onclick="goToSection('${s.id}')">${s.letter}</div>
      <div class="section-info" onclick="goToSection('${s.id}')">
        <div class="section-name">${s.grade} &quot;${s.letter}&quot;</div>
        <div class="section-grade">${students.length} alumno${students.length !== 1 ? 's' : ''}</div>
        <div class="section-avg-row">
          <span class="section-avg-label">Promedio:</span>
          <span class="section-avg-badge ${badgeCls}">
            ${avgLetter || '—'}
          </span>
        </div>
      </div>
      <div class="section-card-actions">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openSectionModal('${s.id}')" title="Editar">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"/></svg>
        </button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteSection('${s.id}')" title="Eliminar" style="color:var(--red)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M6 7v5M10 7v5"/><rect x="3" y="4" width="10" height="10" rx="1"/></svg>
        </button>
        <button class="btn btn-primary btn-sm" onclick="goToSection('${s.id}')">Ver sección</button>
      </div>
    </div>`;
  }).join('');
}

function goToSection(sectionId) {
  STATE.setSection(sectionId);
  window.location.href = 'seccionespecifica.html';
}
