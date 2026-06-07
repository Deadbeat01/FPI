// =========================================
// LOGIN.JS
// =========================================

const _recovery = { code: null, email: null, userId: null };

// ---- USER STORAGE ----
function getUsers()        { return DB.getUsers(); }
function saveUsers(list)   { DB.saveUsers(list); }

async function initDefaultUser() {
  if (!getUsers().length) {
    try {
      await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: 'admin', email: 'admin@escuela.edu', password: 'admin123' }),
      });
    } catch {
      // Sin servidor: guardar local para modo offline
      saveUsers([{ id: 'user_default', username: 'admin', email: 'admin@escuela.edu', password: 'admin123', createdAt: Date.now() }]);
    }
  }
}

// ---- CARD SWITCHING ----
function switchCard(id) {
  document.querySelectorAll('.lcard').forEach(c => c.classList.remove('active'));
  const target = document.getElementById(id);
  if (!target) return;
  target.classList.add('active');
  const first = target.querySelector('input:not([readonly]):not([tabindex="-1"])');
  if (first) setTimeout(() => first.focus(), 40);
}

// ---- MODAL 1: LOGIN ----
async function doLogin() {
  const username = document.getElementById('l-user').value.trim();
  const password = document.getElementById('l-pass').value;

  if (!username || !password) { showToast('Completa todos los campos', 'error'); return; }

  try {
    const res  = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Usuario o contraseña incorrectos', 'error'); return; }

    DB.set('currentUser', { id: data.id, username: data.username, displayName: data.displayName, email: data.email, rol: data.rol });
    showToast(`Bienvenido, ${data.displayName || data.username}`, 'success');
    const dest = data.rol === 'admin' ? 'admin-dashboard.html' : 'inicio.html';
    setTimeout(() => { window.location.href = dest; }, 900);
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}

// ---- MODAL 2: CREAR CUENTA ----
async function doRegister() {
  const username = document.getElementById('r-user').value.trim();
  const email    = document.getElementById('r-email').value.trim().toLowerCase();
  const pass     = document.getElementById('r-pass').value;
  const pass2    = document.getElementById('r-pass2').value;

  if (!username || !email || !pass || !pass2) { showToast('Completa todos los campos', 'error'); return; }
  if (username.length < 3)  { showToast('El usuario debe tener al menos 3 caracteres', 'error'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast('Ingresa un correo electrónico válido', 'error'); return; }
  if (pass.length < 6)      { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
  if (pass !== pass2)       { showToast('Las contraseñas no coinciden', 'error'); return; }

  try {
    const res  = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, email, password: pass }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al crear la cuenta', 'error'); return; }

    showToast('Cuenta creada correctamente', 'success');
    document.getElementById('r-user').value  = '';
    document.getElementById('r-email').value = '';
    document.getElementById('r-pass').value  = '';
    document.getElementById('r-pass2').value = '';
    switchCard('modal-login');
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}

// ---- MODAL 3: RECUPERAR CONTRASEÑA ----
async function doRecover() {
  const email = document.getElementById('rec-email').value.trim().toLowerCase();

  if (!email) { showToast('Ingresa tu correo electrónico', 'error'); return; }

  const user = getUsers().find(u => u.email === email);
  if (!user) { showToast('No existe una cuenta con ese correo', 'error'); return; }

  _recovery.code   = String(Math.floor(100000 + Math.random() * 900000));
  _recovery.email  = email;
  _recovery.userId = user.id;

  try {
    const res  = await fetch('/api/send-code', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ toEmail: email, code: _recovery.code }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Error al enviar el código', 'error'); return;
    }
    showToast(`Código enviado a ${email}`, 'success');
  } catch {
    // Fallback sin conexión: mostrar código en pantalla
    showToast(`Código de verificación: ${_recovery.code}`, 'default', 9000);
  }

  document.getElementById('code-email-lbl').textContent = email;
  _clearCodeDigits();
  switchCard('modal-code');
  setTimeout(() => {
    const first = document.querySelector('.code-digit');
    if (first) first.focus();
  }, 60);
}

// ---- MODAL 4: INGRESAR CÓDIGO ----
async function doResendCode() {
  if (!_recovery.email) return;
  _recovery.code = String(Math.floor(100000 + Math.random() * 900000));

  try {
    const res = await fetch('/api/send-code', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ toEmail: _recovery.email, code: _recovery.code }),
    });
    if (res.ok) {
      showToast(`Código reenviado a ${_recovery.email}`, 'success');
    } else {
      showToast(`Nuevo código: ${_recovery.code}`, 'default', 9000);
    }
  } catch {
    showToast(`Nuevo código: ${_recovery.code}`, 'default', 9000);
  }

  _clearCodeDigits();
  setTimeout(() => {
    const first = document.querySelector('.code-digit');
    if (first) first.focus();
  }, 40);
}

function doVerifyCode() {
  const digits  = [...document.querySelectorAll('.code-digit')];
  const entered = digits.map(d => d.value).join('');

  if (entered.length < 6) {
    showToast('Ingresa el código completo de 6 dígitos', 'error'); return;
  }
  if (entered !== _recovery.code) {
    showToast('Código incorrecto. Inténtalo de nuevo.', 'error');
    _clearCodeDigits();
    digits[0].focus();
    return;
  }

  const user = getUsers().find(u => u.id === _recovery.userId);
  if (user) {
    document.getElementById('reset-email').value = user.email;
    document.getElementById('reset-user').value  = user.username;
  }
  document.getElementById('reset-pass').value  = '';
  document.getElementById('reset-pass2').value = '';

  showToast('Código verificado correctamente', 'success');
  switchCard('modal-reset');
}

// ---- MODAL 5: RESTABLECER CONTRASEÑA ----
async function doReset() {
  const pass  = document.getElementById('reset-pass').value;
  const pass2 = document.getElementById('reset-pass2').value;

  if (!pass || !pass2)   { showToast('Completa todos los campos', 'error'); return; }
  if (pass.length < 6)   { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
  if (pass !== pass2)    { showToast('Las contraseñas no coinciden', 'error'); return; }
  if (!_recovery.userId) { showToast('Error: sesión expirada', 'error'); return; }

  try {
    const res  = await fetch('/api/auth/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: _recovery.userId, newPassword: pass }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error al restablecer la contraseña', 'error'); return; }

    const user = getUsers().find(u => u.id === _recovery.userId);
    const savedUsername = user?.username || '';
    _recovery.code = _recovery.email = _recovery.userId = null;
    showToast('Contraseña restablecida. Inicia sesión.', 'success');
    document.getElementById('rec-email').value = '';
    document.getElementById('l-user').value    = savedUsername;
    document.getElementById('l-pass').value    = '';
    switchCard('modal-login');
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  }
}

// ---- HELPERS ----
function _clearCodeDigits() {
  document.querySelectorAll('.code-digit').forEach(d => {
    d.value = '';
    d.classList.remove('filled');
  });
}

// ---- CODE INPUT BEHAVIOUR ----
document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initDefaultUser();

  const digits = [...document.querySelectorAll('.code-digit')];

  digits.forEach((input, idx) => {
    input.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[val.length - 1] : '';
      e.target.classList.toggle('filled', !!e.target.value);

      if (e.target.value && idx < digits.length - 1) {
        digits[idx + 1].focus();
      }

      if (digits.every(d => d.value)) {
        setTimeout(doVerifyCode, 220);
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        digits[idx - 1].value = '';
        digits[idx - 1].classList.remove('filled');
        digits[idx - 1].focus();
      }
      if (e.key === 'Enter') doVerifyCode();
    });

    input.addEventListener('paste', e => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '').slice(0, 6);
      [...pasted].forEach((char, i) => {
        if (digits[idx + i]) {
          digits[idx + i].value = char;
          digits[idx + i].classList.add('filled');
        }
      });
      const next = digits.find((d, i) => i >= idx && !d.value);
      (next || digits[digits.length - 1]).focus();
    });
  });
});
