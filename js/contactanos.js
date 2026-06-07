document.addEventListener('DOMContentLoaded', async () => {
  if (!await dbReady()) return;
  initSidebar('ayuda');

  const user = DB.get('currentUser') || { username: '', email: '' };

  // Pre-fill name from account
  if (user.username) {
    document.getElementById('ct-name').value = user.username;
  }

  // Populate account email option
  const accountOpt = document.getElementById('ct-email-account-opt');
  accountOpt.value       = 'account';
  accountOpt.textContent = user.email
    ? `Correo de mi cuenta (${user.email})`
    : 'Sin correo de cuenta';
  if (!user.email) accountOpt.disabled = true;
});

function onEmailSelectChange() {
  const sel    = document.getElementById('ct-email-select');
  const custom = document.getElementById('ct-email-custom');
  const isOther = sel.value === 'other';
  custom.style.display = isOther ? 'block' : 'none';
  if (isOther) custom.focus();
  else custom.value = '';
}

function updateCharCount() {
  const msg     = document.getElementById('ct-message');
  const counter = document.querySelector('.ct-char-counter');
  const used    = document.getElementById('ct-char-used');
  const len     = msg.value.length;
  used.textContent = len;
  counter.classList.toggle('near-limit', len >= 240 && len < 300);
  counter.classList.toggle('at-limit',   len >= 300);
}

async function submitForm() {
  const name    = document.getElementById('ct-name').value.trim();
  const sel     = document.getElementById('ct-email-select');
  const custom  = document.getElementById('ct-email-custom');
  const subject = document.getElementById('ct-subject').value.trim();
  const message = document.getElementById('ct-message').value.trim();

  let email = '';
  if (sel.value === 'other') {
    email = custom.value.trim();
  } else {
    const user = DB.get('currentUser') || {};
    email = user.email || '';
  }

  if (!name)    { showToast('Ingresa tu nombre',             'error'); return; }
  if (!email)   { showToast('Ingresa un correo electrónico', 'error'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    showToast('Ingresa un correo electrónico válido', 'error'); return;
  }
  if (!subject) { showToast('Ingresa el asunto',  'error'); return; }
  if (!message) { showToast('Escribe tu mensaje', 'error'); return; }

  const btn      = document.querySelector('.ct-submit-btn');
  const origHTML = btn.innerHTML;
  btn.disabled   = true;
  btn.textContent = 'Enviando…';

  try {
    const res  = await fetch('/api/contact', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fromName: name, fromEmail: email, subject, message }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Error al enviar el mensaje', 'error'); return;
    }
    showToast('Mensaje enviado. Te responderemos pronto.', 'success', 3500);
    clearForm();
  } catch {
    showToast('No se pudo conectar con el servidor', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
}

function clearForm() {
  const user = DB.get('currentUser') || { username: '', email: '' };
  document.getElementById('ct-name').value    = user.username || '';
  document.getElementById('ct-subject').value = '';
  document.getElementById('ct-message').value = '';
  document.getElementById('ct-email-select').value = 'account';
  document.getElementById('ct-email-custom').style.display = 'none';
  document.getElementById('ct-email-custom').value = '';
  document.getElementById('ct-char-used').textContent = '0';
  const counter = document.querySelector('.ct-char-counter');
  counter.classList.remove('near-limit', 'at-limit');
}
