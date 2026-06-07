// =========================================
// ADMIN-DASHBOARD.JS
// =========================================

document.addEventListener('DOMContentLoaded', () => {
  if (!adminReady()) return;
  initAdminSidebar('dashboard');
  loadDashboard();
});

async function loadDashboard() {
  try {
    const res  = await fetch('/api/admin/stats', { headers: adminHeaders() });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al cargar estadísticas', 'error'); return; }

    // Stat cards globales
    document.getElementById('stat-cuentas').textContent  = data.global.total_cuentas;
    document.getElementById('stat-cursos').textContent   = data.global.total_cursos;
    document.getElementById('stat-secciones').textContent = data.global.total_secciones;
    document.getElementById('stat-alumnos').textContent  = data.global.total_alumnos;

    document.getElementById('dash-loading').textContent = '';

    // Tabla por docente
    const tbody = document.getElementById('dash-tbody');
    if (!data.perUser.length) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="admin-empty">
            <div class="admin-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <div class="admin-empty-title">Sin docentes registrados</div>
            <div class="admin-empty-text">Aún no hay cuentas de docentes en el sistema.</div>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = data.perUser.map(u => `
      <tr>
        <td>
          <div class="user-cell-name">${escapeHtml(u.nombre_display || u.usuario)}</div>
          <div class="user-cell-email">${escapeHtml(u.usuario)} · ${escapeHtml(u.correo || '—')}</div>
        </td>
        <td class="stat-num">${u.total_cursos}</td>
        <td class="stat-num">${u.total_secciones}</td>
        <td class="stat-num">${u.total_alumnos}</td>
        <td style="text-align:center">
          <span class="badge ${u.activo ? 'badge-active' : 'badge-inactive'}">
            ${u.activo ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td style="color:var(--text-muted);font-size:12.5px">${fmtDate(u.creado_en)}</td>
      </tr>`).join('');
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}
