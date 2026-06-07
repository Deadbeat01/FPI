// =========================================
// ADMIN-BLOQUEADAS.JS
// =========================================

document.addEventListener('DOMContentLoaded', () => {
  if (!adminReady()) return;
  initAdminSidebar('bloqueadas');
  loadBlocked();
});

async function loadBlocked() {
  const tbody = document.getElementById('blocked-tbody');
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">Cargando...</td></tr>`;
  try {
    const res  = await fetch('/api/admin/blocked', { headers: adminHeaders() });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al cargar', 'error'); return; }
    renderBlocked(data);
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}

function renderBlocked(list) {
  const tbody = document.getElementById('blocked-tbody');
  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="4">
        <div class="admin-empty">
          <div class="admin-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
              <line x1="12" y1="16" x2="12" y2="18"/>
            </svg>
          </div>
          <div class="admin-empty-title">Sin cuentas bloqueadas</div>
          <div class="admin-empty-text">Ningún docente tiene el acceso restringido en este momento.</div>
        </div>
      </td></tr>`;
    return;
  }

  const now = Date.now();
  tbody.innerHTML = list.map(u => {
    const aun_bloqueado = u.bloqueadoHasta && u.bloqueadoHasta > now;
    const mins = aun_bloqueado ? Math.ceil((u.bloqueadoHasta - now) / 60000) : 0;
    return `
      <tr id="brow-${u.id}">
        <td>
          <div class="user-cell-name">${escapeHtml(u.displayName || u.username)}</div>
          <div class="user-cell-email">@${escapeHtml(u.username)} · ${escapeHtml(u.email || '—')}</div>
        </td>
        <td style="text-align:center">
          <span class="badge badge-blocked">${u.intentos} / 5</span>
        </td>
        <td>
          ${aun_bloqueado
            ? `<span style="color:var(--red);font-size:13px;font-weight:500">${fmtDateTime(u.bloqueadoHasta)}</span>
               <span style="font-size:11px;color:var(--text-muted);margin-left:6px">(${mins} min restantes)</span>`
            : `<span style="color:var(--text-muted);font-size:12.5px">Bloqueo expirado · ${fmtDateTime(u.bloqueadoHasta)}</span>`
          }
        </td>
        <td style="text-align:center">
          <button class="btn btn-primary btn-sm" onclick="unblockAccount('${u.id}', '${escapeHtml(u.displayName || u.username)}')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12">
              <rect x="3" y="8" width="10" height="7" rx="1.5"/>
              <path d="M5 8V5a3 3 0 015.74-1.2"/>
            </svg>
            Desbloquear
          </button>
        </td>
      </tr>`;
  }).join('');
}

async function unblockAccount(id, displayName) {
  try {
    const res  = await fetch(`/api/admin/accounts/${id}/unblock`, { method: 'PUT', headers: adminHeaders() });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al desbloquear', 'error'); return; }
    showToast(`Cuenta de "${displayName}" desbloqueada`, 'success');
    loadBlocked();
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}
