// =========================================
// HORARIOS.JS
// =========================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initSidebar('horarios');
  renderScheduleGrid();
});

function getOccupiedSlots(startTime, endTime, allSlots) {
  const start = toMin(startTime);
  const end   = toMin(endTime);
  return allSlots.filter(s => {
    const m = toMin(s);
    return m >= start && m < end;
  });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderScheduleGrid() {
  const courses  = DB.getCourses();
  const ref      = DB.getScheduleReference();
  const allDays  = ref.days;
  const allSlots = ref.timeSlots;
  const wrapper  = document.getElementById('schedule-table-wrapper');
  const empty    = document.getElementById('empty-state');

  // Collect entries from section schedules
  const items = []; // { course, sectionId, label, schedule }
  courses.forEach(course => {
    DB.getSections(course.id).forEach(section => {
      if (section.schedule && section.schedule.days && section.schedule.days.length) {
        items.push({
          course,
          sectionId: section.id,
          label: `${section.grade}${section.letter}`,
          schedule: section.schedule,
        });
      }
    });
  });

  // Fallback: legacy course-level schedule
  if (!items.length) {
    courses.forEach(course => {
      if (course.schedule && course.schedule.days && course.schedule.days.length) {
        items.push({ course, sectionId: null, label: '', schedule: course.schedule });
      }
    });
  }

  if (!items.length) {
    wrapper.style.display = 'none';
    empty.style.display   = 'flex';
    return;
  }

  // Grilla de 30 minutos para precisión sub-hora
  // map[day][slot] = { course, label, startTime, endTime, span } | 'skip'
  const map = {};
  allDays.forEach(d => { map[d] = {}; });

  items.forEach(({ course, sectionId, label, schedule }) => {
    const { days = [], times = {} } = schedule;
    days.forEach(day => {
      const t         = times[day] || {};
      const startTime = t.start || schedule.startTime;
      const endTime   = t.end   || schedule.endTime;
      if (!startTime || !endTime) return;

      const slots = getOccupiedSlots(startTime, endTime, allSlots);
      slots.forEach((slot, i) => {
        if (map[day][slot]) return;
        map[day][slot] = i === 0
          ? { course, sectionId, label, startTime, endTime, span: slots.length }
          : 'skip';
      });
    });
  });

  // Calcular el índice del último slot usado
  const usedSlotSet = new Set();
  items.forEach(({ schedule }) => {
    const { days = [], times = {} } = schedule;
    days.forEach(day => {
      const t = times[day] || {};
      const start = t.start || schedule.startTime;
      const end   = t.end   || schedule.endTime;
      if (start && end) getOccupiedSlots(start, end, allSlots).forEach(s => usedSlotSet.add(s));
    });
  });

  // Siempre empezar desde 07:00 (índice 0); mostrar hasta 1 slot después del último usado
  const usedIndices = [...usedSlotSet].map(s => allSlots.indexOf(s)).filter(i => i >= 0);
  const lastUsedIdx = usedIndices.length ? Math.max(...usedIndices) : 0;
  const endIdx      = Math.min(lastUsedIdx + 1, allSlots.length - 1);
  const visibleSlots = allSlots.slice(0, endIdx + 1);

  // Build table
  const thead = `
    <thead>
      <tr>
        <th class="time-col">Hora</th>
        ${allDays.map(d => `<th>${d}</th>`).join('')}
      </tr>
    </thead>`;

  const rows = visibleSlots.map(slot => {
    const isHalf = slot.endsWith(':30');
    const cells = allDays.map(day => {
      const entry = map[day][slot];
      if (entry === 'skip') return '';
      if (!entry) return `<td class="empty-slot${isHalf ? ' half-slot' : ''}"></td>`;

      const { course, sectionId, label, startTime, endTime, span } = entry;
      const hex = course.color || '#3B6FA0';
      const bg  = hexToRgba(hex, 0.10);
      const clickable = sectionId
        ? `onclick="goToSection('${course.id}','${sectionId}')" style="background:${bg}; border-left:3px solid ${hex}; cursor:pointer;"`
        : `style="background:${bg}; border-left:3px solid ${hex};"`;

      return `
        <td class="course-slot" rowspan="${span}" ${clickable}>
          <div class="slot-name">${escapeHtml(course.name)}</div>
          ${label ? `<div class="slot-sections">${escapeHtml(label)}</div>` : ''}
          <div class="slot-time">${startTime} – ${endTime}</div>
        </td>`;
    }).join('');

    return `<tr class="${isHalf ? 'half-hour-row' : ''}"><td class="time-cell${isHalf ? ' half-time-cell' : ''}">${isHalf ? '' : slot}</td>${cells}</tr>`;
  }).join('');

  document.getElementById('schedule-table').innerHTML = thead + `<tbody>${rows}</tbody>`;
}

function goToSection(courseId, sectionId) {
  STATE.setCourse(courseId);
  STATE.setSection(sectionId);
  window.location.href = 'seccionespecifica.html';
}
