const currentUrl = document.getElementById('current-url');
const currentTitle = document.getElementById('current-title');
const navStatus = document.getElementById('nav-status');
const eventLog = document.getElementById('event-log');

function updateMeta(label) {
  if (currentUrl instanceof HTMLElement) {
    currentUrl.textContent = window.location.href;
  }
  if (currentTitle instanceof HTMLElement) {
    currentTitle.textContent = document.title;
  }
  if (navStatus instanceof HTMLElement) {
    navStatus.textContent = label;
  }
}

function appendLog(message) {
  if (!(eventLog instanceof HTMLElement)) {
    return;
  }
  const lines = eventLog.textContent ? `${eventLog.textContent}\n${message}` : message;
  eventLog.textContent = lines;
}

function bindClick(id, handler) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    return;
  }
  element.addEventListener('click', handler);
}

document.getElementById('fixture-button')?.addEventListener('click', () => {
  appendLog('fixture-button clicked');
});

document.getElementById('fixture-checkbox')?.addEventListener('change', (event) => {
  const target = event.currentTarget;
  if (target instanceof HTMLInputElement) {
    appendLog(`fixture-checkbox changed: ${String(target.checked)}`);
  }
});

document.getElementById('fixture-select')?.addEventListener('change', (event) => {
  const target = event.currentTarget;
  if (target instanceof HTMLSelectElement) {
    appendLog(`fixture-select changed: ${target.value}`);
  }
});

bindClick('push-state', () => {
  history.pushState({ via: 'pushState' }, '', '/pushed?mode=push#push-state');
  document.title = 'Orbit CSP Fixture (PushState)';
  updateMeta('pushState applied');
  appendLog(`pushState -> ${window.location.href}`);
});

bindClick('replace-state', () => {
  history.replaceState({ via: 'replaceState' }, '', '/replaced?mode=replace#replace-state');
  document.title = 'Orbit CSP Fixture (ReplaceState)';
  updateMeta('replaceState applied');
  appendLog(`replaceState -> ${window.location.href}`);
});

bindClick('hash-nav', () => {
  window.location.hash = 'hash-only';
  document.title = 'Orbit CSP Fixture (Hash)';
  updateMeta('hash navigation applied');
  appendLog(`hash navigation -> ${window.location.href}`);
});

window.addEventListener('popstate', () => {
  updateMeta('popstate observed');
  appendLog(`popstate -> ${window.location.href}`);
});

updateMeta('fixture loaded');
appendLog(`loaded -> ${window.location.href}`);
