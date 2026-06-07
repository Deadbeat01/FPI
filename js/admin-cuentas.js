// =========================================
// ADMIN-CUENTAS.JS
// =========================================

let _allAccounts = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!adminReady()) return;
  initAdminSidebar('cuentas');
  loadAccounts();
});

async function loadAccounts() {
  try {
    const res  = await fetch('/api/admin/accounts', { headers: adminHeaders() });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al cargar cuentas', 'error'); return; }
    _allAccounts = data;
    renderAccounts(_allAccounts);
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}

function filterAccounts() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  const filtered = q
    ? _allAccounts.filter(u =>
        u.username.toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      )
    : _allAccounts;
  renderAccounts(filtered);
}

function renderAccounts(list) {
  const tbody = document.getElementById('accounts-tbody');
  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="5">
        <div class="admin-empty">
          <div class="admin-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          </div>
          <div class="admin-empty-title">Sin resultados</div>
          <div class="admin-empty-text">No se encontraron cuentas con ese criterio.</div>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(u => `
    <tr id="row-${u.id}">
      <td>
        <div class="user-cell-name">${escapeHtml(u.displayName || u.username)}</div>
        <div class="user-cell-email">@${escapeHtml(u.username)}</div>
      </td>
      <td style="color:var(--text-muted);font-size:12.5px">${escapeHtml(u.email || '—')}</td>
      <td style="text-align:center">
        <span class="badge ${u.activo ? 'badge-active' : 'badge-inactive'}" id="badge-${u.id}">
          ${u.activo ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td style="color:var(--text-muted);font-size:12.5px">${fmtDate(u.createdAt)}</td>
      <td>
        <div class="table-actions" style="justify-content:center">
          <button class="btn btn-secondary btn-sm" onclick="toggleStatus('${u.id}', ${u.activo})"
                  id="btn-toggle-${u.id}" title="${u.activo ? 'Desactivar cuenta' : 'Activar cuenta'}">
            ${u.activo
              ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12"><circle cx="8" cy="8" r="6"/><line x1="5" y1="8" x2="11" y2="8"/></svg> Desactivar`
              : `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></svg> Activar`
            }
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteAccount('${u.id}', '${escapeHtml(u.displayName || u.username)}')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><rect x="3" y="4" width="10" height="10" rx="1"/></svg>
            Eliminar
          </button>
        </div>
      </td>
    </tr>`).join('');
}

async function toggleStatus(id, currentActivo) {
  const newActivo = !currentActivo;
  try {
    const res = await fetch(`/api/admin/accounts/${id}/status`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ activo: newActivo }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al cambiar estado', 'error'); return; }

    // Actualizar en memoria y re-renderizar solo la fila
    const idx = _allAccounts.findIndex(u => u.id === id);
    if (idx !== -1) _allAccounts[idx].activo = newActivo;
    filterAccounts();
    showToast(newActivo ? 'Cuenta activada' : 'Cuenta desactivada', 'success');
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}

function deleteAccount(id, displayName) {
  showConfirm(
    'Eliminar cuenta',
    `¿Eliminar la cuenta de "${displayName}"? Esta acción es permanente.`,
    async () => {
      try {
        const res  = await fetch(`/api/admin/accounts/${id}`, { method: 'DELETE', headers: adminHeaders() });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Error al eliminar', 'error'); return; }
        _allAccounts = _allAccounts.filter(u => u.id !== id);
        filterAccounts();
        showToast('Cuenta eliminada', 'success');
      } catch {
        showToast('No se pudo conectar con el servidor', 'error');
      }
    }
  );
}
