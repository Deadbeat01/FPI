document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initSidebar('alumnos');
  init();
});

let allStudents      = [];
let activeStudents   = [];
let renderedStudents = [];

function init() {
  const courses      = DB.getCourses();
  const courseSelect = document.getElementById('filter-course');
  const gradeSelect  = document.getElementById('filter-grade');

  courses.forEach(course => {
    const opt = document.createElement('option');
    opt.value = course.id;
    opt.textContent = course.name;
    courseSelect.appendChild(opt);

    DB.getSections(course.id).forEach(section => {
      DB.getStudents(course.id, section.id).forEach(student => {
        allStudents.push({
          studentId:   student.id,
          name:        student.name,
          retired:     student.retired || false,
          courseId:    course.id,
          courseName:  course.name,
          courseColor: course.color || '#3B6FA0',
          sectionId:   section.id,
          grade:       section.grade  || '',
          letter:      section.letter || '',
        });
      });
    });
  });

  [...new Set(allStudents.map(s => s.grade).filter(Boolean))].sort()
    .forEach(g => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = g;
      gradeSelect.appendChild(opt);
    });

  courseSelect.addEventListener('change', refreshSectionDropdown);

  const searchHandler = (e) => {
    const q = e.target.value.trim().toLowerCase();
    const result = q
      ? activeStudents.filter(s => s.name.toLowerCase().includes(q))
      : activeStudents;
    renderTable(result);
  };
  document.getElementById('search-input').addEventListener('input', searchHandler);
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchHandler(e);
  });

  activeStudents = [...allStudents];
  renderTable(activeStudents);
}

function refreshSectionDropdown() {
  const courseId = document.getElementById('filter-course').value;
  const sel = document.getElementById('filter-section');
  sel.innerHTML = '<option value="">Todas</option>';
  if (!courseId) return;
  DB.getSections(courseId).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.grade}${s.letter}`;
    sel.appendChild(opt);
  });
}

function applyFilters() {
  const courseId  = document.getElementById('filter-course').value;
  const sectionId = document.getElementById('filter-section').value;
  const grade     = document.getElementById('filter-grade').value;
  const status    = document.getElementById('filter-status').value;

  activeStudents = allStudents.filter(s =>
    (!courseId  || s.courseId  === courseId)  &&
    (!sectionId || s.sectionId === sectionId) &&
    (!grade     || s.grade     === grade)     &&
    (status === '' || (status === 'activo' ? !s.retired : s.retired))
  );

  document.getElementById('search-input').value = '';
  renderTable(activeStudents);
}

function goToSection(courseId, sectionId) {
  STATE.setCourse(courseId);
  STATE.setSection(sectionId);
  window.location.href = 'seccionespecifica.html';
}

function openStudentPage(index) {
  const s = renderedStudents[index];
  if (!s) return;
  STATE.set('studentName',    s.name);
  STATE.set('studentCourses', JSON.stringify(s.courses));
  window.location.href = 'alumnoespecifico.html';
}

function groupByName(students) {
  const grouped = [];
  const nameMap  = new Map();
  students.forEach(s => {
    if (nameMap.has(s.name)) {
      const entry = grouped[nameMap.get(s.name)];
      if (!entry.courses.some(c => c.courseId === s.courseId && c.sectionId === s.sectionId)) {
        entry.courses.push({ studentId: s.studentId, courseId: s.courseId, sectionId: s.sectionId, courseName: s.courseName, courseColor: s.courseColor, grade: s.grade, letter: s.letter });
      }
    } else {
      nameMap.set(s.name, grouped.length);
      grouped.push({ name: s.name, retired: s.retired, courses: [{ studentId: s.studentId, courseId: s.courseId, sectionId: s.sectionId, courseName: s.courseName, courseColor: s.courseColor, grade: s.grade, letter: s.letter }] });
    }
  });
  return grouped;
}

function renderTable(students) {
  const grouped = groupByName(students);
  grouped.sort((a, b) => (a.retired ? 1 : 0) - (b.retired ? 1 : 0));
  renderedStudents = grouped;
  document.getElementById('student-counter').textContent = grouped.length;
  document.getElementById('students-tbody').innerHTML = grouped.length
    ? grouped.map((s, i) => {
        const grades  = [...new Set(s.courses.map(c => c.grade).filter(Boolean))].join(', ');
        const letters = [...new Set(s.courses.map(c => c.letter).filter(Boolean))].join(', ');
        const tags    = s.courses.map(c =>
          `<span class="course-tag" style="border-color:${c.courseColor};color:${c.courseColor}"
            onclick="goToSection('${c.courseId}','${c.sectionId}')">${c.courseName}</span>`
        ).join('');
        const statusBadge = s.retired
          ? '<span class="badge-retired">Retirado</span>'
          : '<span class="badge-active">Activo</span>';
        return `
        <tr class="${s.retired ? 'row-retired' : ''}">
          <td class="col-num">${i + 1}</td>
          <td class="name-cell">${escapeHtml(s.name)}</td>
          <td class="courses-cell">${tags}</td>
          <td>${escapeHtml(grades)}</td>
          <td>${escapeHtml(letters)}</td>
          <td>${statusBadge}</td>
          <td class="col-actions"><a href="#" class="dots-btn" onclick="openStudentPage(${i}); return false;">${iconDots()}</a></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7" class="empty-row">No se encontraron alumnos</td></tr>`;
}
