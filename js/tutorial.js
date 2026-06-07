// =========================================
// TUTORIAL.JS
// =========================================

(async () => {
  if (!await dbReady()) return;

  const session = DB.get('currentUser');
  if (!session) { window.location.href = 'login.html'; return; }

  initSidebar('tutorial');
})();
