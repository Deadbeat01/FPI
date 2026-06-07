// =========================================
// CUENTA.JS — Lógica de edición de cuenta
// =========================================

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initSidebar('cuenta');

  // Expandir el subnav de Configuración
  const sub = document.getElementById('config-sub');
  const btn = document.getElementById('nav-config');
  if (sub) sub.classList.add('open');
  if (btn) btn.classList.add('expanded');

  currentUser = DB.get('currentUser');
  if (!currentUser) { window.location.href = 'login.html'; return; }

  renderAccountInfo();
});

// ---- INFO INICIAL ----
function renderAccountInfo() {
  const users  = DB.getUsers();
  const user   = users.find(u => u.id === currentUser.id);
  if (!user) { window.location.href = 'login.html'; return; }

  document.getElementById('acct-display-name').textContent  = user.displayName || user.username;
  document.getElementById('acct-email-display').textContent = user.email || 'Sin correo';
  document.getElementById('new-email').placeholder          = user.email || 'correo@gmail.com';

  renderAvatarPreview(user);
  document.getElementById('btn-remove-photo').style.display = user.photo ? '' : 'none';
}

function renderAvatarPreview(user) {
  const el    = document.getElementById('acct-avatar');
  const label = user.displayName || user.username || 'U';
  if (user.photo) {
    el.textContent = '';
    const img = document.createElement('img');
    img.src = user.photo;
    img.alt = label;
    el.appendChild(img);
  } else {
    el.textContent = label.charAt(0).toUpperCase();
  }
}

// ---- FOTO DE PERFIL ----
function handleAvatarFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Selecciona un archivo de imagen válido', 'error'); return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    _resizeImage(e.target.result, 240, (dataUrl) => {
      _persistPhoto(dataUrl);
    });
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function _resizeImage(src, maxPx, cb) {
  const img = new Image();
  img.onload = () => {
    const size = Math.min(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width  = maxPx;
    canvas.height = maxPx;
    const ctx = canvas.getContext('2d');
    const sx = (img.width  - size) / 2;
    const sy = (img.height - size) / 2;
    ctx.drawImage(img, sx, sy, size, size, 0, 0, maxPx, maxPx);
    cb(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.src = src;
}

function _persistPhoto(dataUrl) {
  const users = DB.getUsers();
  const idx   = users.findIndex(u => u.id === currentUser.id);
  if (idx === -1) return;

  users[idx].photo = dataUrl;
  DB.saveUsers(users);

  currentUser.photo = dataUrl;
  DB.set('currentUser', currentUser);

  renderAvatarPreview(users[idx]);
  _renderSidebarAvatar(users[idx]);
  document.getElementById('btn-remove-photo').style.display = '';
  showToast('Foto de perfil actualizada', 'success');
}

function removePhoto() {
  const users = DB.getUsers();
  const idx   = users.findIndex(u => u.id === currentUser.id);
  if (idx === -1) return;

  delete users[idx].photo;
  DB.saveUsers(users);

  delete currentUser.photo;
  DB.set('currentUser', currentUser);

  renderAvatarPreview(users[idx]);
  _renderSidebarAvatar(users[idx]);
  document.getElementById('btn-remove-photo').style.display = 'none';
  showToast('Foto de perfil eliminada', 'success');
}

// ---- NOMBRE DE VISUALIZACIÓN ----
function saveDisplayName() {
  const newDisplay = document.getElementById('new-display-name').value.trim();

  if (!newDisplay) { showToast('Ingresa el nombre de visualización', 'error'); return; }
  if (newDisplay.length < 3) { showToast('El nombre debe tener al menos 3 caracteres', 'error'); return; }

  const users = DB.getUsers();
  const idx   = users.findIndex(u => u.id === currentUser.id);
  if (idx === -1) return;

  if (newDisplay === (users[idx].displayName || users[idx].username)) {
    showToast('Ese ya es tu nombre de visualización actual', 'error'); return;
  }

  users[idx].displayName = newDisplay;
  DB.saveUsers(users);

  currentUser.displayName = newDisplay;
  DB.set('currentUser', currentUser);

  document.getElementById('acct-display-name').textContent  = newDisplay;
  document.getElementById('new-display-name').value         = '';
  document.getElementById('new-display-name').placeholder   = newDisplay;
  const sidebarName = document.getElementById('sidebar-name');
  if (sidebarName) sidebarName.textContent = newDisplay;

  renderAvatarPreview(users[idx]);
  _renderSidebarAvatar(users[idx]);
  showToast('Nombre de visualización actualizado', 'success');
}

// ---- CORREO ELECTRÓNICO ----
function saveEmail() {
  const newEmail = document.getElementById('new-email').value.trim().toLowerCase();

  if (!newEmail) { showToast('Ingresa el nuevo correo', 'error'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    showToast('Ingresa un correo electrónico válido', 'error'); return;
  }

  const users = DB.getUsers();
  const idx   = users.findIndex(u => u.id === currentUser.id);
  if (idx === -1) return;

  if (newEmail === users[idx].email) {
    showToast('Ese ya es tu correo actual', 'error'); return;
  }
  if (users.some((u, i) => i !== idx && u.email === newEmail)) {
    showToast('Ese correo ya está en uso', 'error'); return;
  }

  users[idx].email = newEmail;
  DB.saveUsers(users);

  currentUser.email = newEmail;
  DB.set('currentUser', currentUser);

  document.getElementById('acct-email-display').textContent = newEmail;
  document.getElementById('new-email').value       = '';
  document.getElementById('new-email').placeholder = newEmail;
  const sidebarEmail = document.getElementById('sidebar-email');
  if (sidebarEmail) sidebarEmail.textContent = newEmail;
  showToast('Correo actualizado', 'success');
}

// ---- CONTRASEÑA ----
async function savePassword() {
  const currentPass = document.getElementById('current-pass').value;
  const newPass     = document.getElementById('new-pass').value;
  const confirmPass = document.getElementById('confirm-pass').value;

  if (!currentPass || !newPass || !confirmPass) { showToast('Completa todos los campos', 'error'); return; }
  if (newPass.length < 6)    { showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error'); return; }
  if (newPass !== confirmPass){ showToast('Las contraseñas no coinciden', 'error'); return; }
  if (newPass === currentPass){ showToast('La nueva contraseña debe ser diferente a la actual', 'error'); return; }

  try {
    const res  = await fetch('/api/auth/change-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: currentUser.id, currentPassword: currentPass, newPassword: newPass }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al cambiar la contraseña', 'error'); return; }

    document.getElementById('current-pass').value = '';
    document.getElementById('new-pass').value     = '';
    document.getElementById('confirm-pass').value = '';
    showToast('Contraseña actualizada', 'success');
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}

// ---- ELIMINAR CUENTA ----
function confirmDeleteAccount() {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-title">Eliminar cuenta</div>
      <div class="confirm-text">Esta acción es permanente e irreversible. Se eliminarán todos tus cursos y datos asociados.</div>
      <input type="password" id="delete-pass-input" class="form-control"
             placeholder="Ingresa tu contraseña para confirmar"
             style="margin:12px 0 0;width:100%;box-sizing:border-box">
      <div class="confirm-actions">
        <button class="btn btn-secondary btn-sm" id="conf-cancel">Cancelar</button>
        <button class="btn btn-danger btn-sm" id="conf-ok">Eliminar mi cuenta</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#delete-pass-input');
  overlay.querySelector('#conf-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#conf-ok').onclick = async () => {
    const pass = input.value;
    if (!pass) { showToast('Ingresa tu contraseña', 'error'); input.focus(); return; }
    overlay.remove();
    await deleteAccount(pass);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#conf-ok').click(); });
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  setTimeout(() => input.focus(), 50);
}

async function deleteAccount(password) {
  try {
    const res = await fetch('/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al eliminar la cuenta', 'error'); return; }
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}
