document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initSidebar('alumnos');
  init();
});

let studentName    = '';
let studentCourses = [];

const BIMESTRES = [1, 2, 3, 4];
const ACT_TYPE_LABEL = { practica: 'Práctica', exposicion: 'Exposición', trabajo: 'Trabajo' };
const GV = { AD: 4, A: 3, B: 2, C: 1 };

function init() {
  studentName = STATE.get('studentName') || '';
  try { studentCourses = JSON.parse(STATE.get('studentCourses') || '[]'); } catch { studentCourses = []; }

  document.getElementById('bc-student').textContent = studentName || 'Alumno';
  document.getElementById('page-title').textContent  = studentName || 'Alumno';

  // Mostrar la sección global del alumno antes del nombre
  if (studentCourses.length) {
    const c = studentCourses[0];
    document.getElementById('student-section-label').textContent = `${c.grade}${c.letter}`;
  }

  renderSections();
  loadObservation();
}

// ---- OBSERVACIONES ----
function _getStudentRecord() {
  if (!studentCourses.length) return null;
  const c = studentCourses[0];
  return DB.getStudents(c.courseId, c.sectionId).find(s => s.id === c.studentId) || null;
}

function loadObservation() {
  const student = _getStudentRecord();
  const obs     = student?.observation || '';
  const display = document.getElementById('obs-display');
  display.textContent = obs || 'No hay observaciones';
  display.className   = obs ? 'obs-display' : 'obs-display obs-empty';
  document.getElementById('obs-textarea').value           = obs;
  document.getElementById('obs-char-count').textContent   = obs.length;
}

function saveObservation() {
  const obs = document.getElementById('obs-textarea').value.trim();
  if (!studentCourses.length) return;
  const c        = studentCourses[0];
  const students = DB.getStudents(c.courseId, c.sectionId);
  const idx      = students.findIndex(s => s.id === c.studentId);
  if (idx === -1) return;
  students[idx].observation = obs;
  DB.saveStudents(c.courseId, c.sectionId, students);
  loadObservation();
  showToast('Observación guardada', 'success');
}

function gradeBadgeClass(v) {
  return { AD: 'grade-ad', A: 'grade-a', B: 'grade-b', C: 'grade-c' }[v] || '';
}

function gradeChip(v) {
  if (!v || v === '-') return `<span class="no-grade-dash">—</span>`;
  return `<span class="promedio-badge ${gradeBadgeClass(v)}">${v}</span>`;
}

function calcAvg(gradesObj, acts) {
  const vals = acts.map(a => GV[gradesObj[a.id]]).filter(v => v != null);
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg >= 3.5) return 'AD';
  if (avg >= 2.5) return 'A';
  if (avg >= 1.5) return 'B';
  return 'C';
}

function renderSections() {
  const container = document.getElementById('sections-container');
  if (!studentCourses.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No hay datos disponibles.</p>';
    return;
  }

  container.innerHTML = studentCourses.map(c => {
    const section = DB.getSections(c.courseId).find(s => s.id === c.sectionId);
    const allActs = DB.getActivities(c.courseId, c.sectionId);
    const grades  = (DB.getGrades(c.courseId, c.sectionId)[c.studentId]) || {};

    const bimBlocks = BIMESTRES.map(bim => {
      const bimActs = allActs.filter(a => a.bimestre === bim);
      if (!bimActs.length) return '';

      const bimAvg   = calcAvg(grades, bimActs);
      const comps    = (section?.competencias?.[bim]) || [];
      const compIdxs = [...new Set(bimActs.map(a => a.competenciaIdx))].sort((a, b) => a - b);

      const compBlocks = compIdxs.map(compIdx => {
        const compActs = bimActs.filter(a => a.competenciaIdx === compIdx);
        if (!compActs.length) return '';
        const compName = comps[compIdx] || `Competencia ${compIdx + 1}`;
        const compAvg  = calcAvg(grades, compActs);

        return `
          <div class="comp-block">
            <div class="comp-header">
              <span class="comp-label">${escapeHtml(compName)}</span>
              ${compAvg ? `<span class="promedio-badge ${gradeBadgeClass(compAvg)} comp-avg">${compAvg}</span>` : ''}
            </div>
            <div class="act-list">
              ${compActs.map(a => `
                <div class="act-row">
                  <span class="act-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
                  ${gradeChip(grades[a.id] || '-')}
                </div>`).join('')}
            </div>
          </div>`;
      }).join('');

      return `
        <div class="bim-block">
          <div class="bim-header">
            <span class="bim-label">Bimestre ${bim}</span>
            ${bimAvg ? `<span class="promedio-badge ${gradeBadgeClass(bimAvg)} bim-avg">Promedio: ${bimAvg}</span>` : ''}
          </div>
          <div class="comp-list">
            ${compBlocks}
          </div>
        </div>`;
    }).join('');

    const hasContent = allActs.length > 0;

    return `
      <div class="section-card">
        <div class="section-card-header" style="--card-color:${c.courseColor}">
          <span class="section-course-name">${escapeHtml(c.courseName)}</span>
        </div>
        <div class="section-card-body">
          ${hasContent ? bimBlocks : '<p class="no-acts">Sin actividades registradas.</p>'}
        </div>
      </div>`;
  }).join('');
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast('Error al cargar jsPDF', 'error'); return; }

  const doc = new jsPDF();
  const sectionLabel = studentCourses.length
    ? `${studentCourses[0].grade}${studentCourses[0].letter}  `
    : '';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${sectionLabel}${studentName}`, 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-PE')}`, 14, 25);

  let y = 32;

  studentCourses.forEach(c => {
    const allActs = DB.getActivities(c.courseId, c.sectionId);
    const grades  = (DB.getGrades(c.courseId, c.sectionId)[c.studentId]) || {};

    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(c.courseName, 14, y);
    y += 7;
    doc.setFont('helvetica', 'normal');

    BIMESTRES.forEach(bim => {
      const acts = allActs.filter(a => a.bimestre === bim);
      if (!acts.length) return;

      if (y > 255) { doc.addPage(); y = 20; }

      const avg  = calcAvg(grades, acts);
      const head = [['Actividad', 'Tipo', 'Nota']];
      const body = acts.map(a => [
        a.name,
        ACT_TYPE_LABEL[a.type] || a.type || '',
        grades[a.id] || '—',
      ]);
      if (avg) body.push(['', 'Promedio bimestral', avg]);

      doc.autoTable({
        head,
        body,
        startY: y,
        margin: { left: 14, right: 14 },
        styles:     { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [59, 111, 160] },
        didParseCell(data) {
          if (data.section === 'body') {
            const note = data.row.raw[2];
            const fills = { AD: [209,250,229], A: [219,234,254], B: [254,243,199], C: [254,226,226] };
            if (data.column.index === 2 && fills[note]) data.cell.styles.fillColor = fills[note];
          }
        },
      });
      y = doc.lastAutoTable.finalY + 5;
    });

    y += 6;
  });

  // ---- Observaciones ----
  const obsText = _getStudentRecord()?.observation || '';
  if (y > 255) { doc.addPage(); y = 20; }
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Observaciones', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (obsText) {
    const lines = doc.splitTextToSize(obsText, 182);
    lines.forEach(line => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(line, 14, y);
      y += 5;
    });
  } else {
    doc.setTextColor(160, 160, 160);
    doc.text('Sin observaciones', 14, y);
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`${studentName}_notas.pdf`);
  showToast('PDF generado', 'success');
}
