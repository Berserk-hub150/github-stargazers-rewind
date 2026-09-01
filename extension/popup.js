const PREFIX = 'rgs:archive:';
const repoEl = document.getElementById('repo');
const countEl = document.getElementById('count');
const starsEl = document.getElementById('stars');
const updatedEl = document.getElementById('updated');
const refreshBtn = document.getElementById('refresh');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
let repo = null;

function parseRepo(urlString) {
  try {
    const url = new URL(urlString);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch { return null; }
}
function key() { return `${PREFIX}${repo.owner}/${repo.repo}`.toLowerCase(); }
function status(text) { statusEl.textContent = text; }

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  repo = parseRepo(tab?.url || '');
  if (!repo) {
    repoEl.textContent = 'Apri una repository GitHub.';
    refreshBtn.disabled = true;
    clearBtn.disabled = true;
    return;
  }
  repoEl.textContent = `${repo.owner}/${repo.repo}`;
  const snapshot = (await chrome.storage.local.get(key()))[key()] || null;
  countEl.textContent = snapshot?.users?.length?.toLocaleString() || '0';
  starsEl.textContent = Number.isFinite(snapshot?.currentStarCount) ? snapshot.currentStarCount.toLocaleString() : '—';
  updatedEl.textContent = snapshot?.recoveredAt ? `Aggiornato: ${new Date(snapshot.recoveredAt).toLocaleString()}` : 'Nessuna cache';
  clearBtn.disabled = !snapshot;
}

refreshBtn.addEventListener('click', async () => {
  if (!repo) return;
  refreshBtn.disabled = true;
  status('Ricostruzione in corso…');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'reconstruct-stargazers', owner: repo.owner, repo: repo.repo });
    if (!response?.ok) throw new Error(response?.error || 'Errore');
    await chrome.storage.local.set({ [key()]: response.snapshot });
    status(`Recuperati ${response.snapshot.users.length.toLocaleString()} utenti.`);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.reload(tab.id);
    await load();
  } catch (error) {
    status(error.message || String(error));
  } finally { refreshBtn.disabled = false; }
});

clearBtn.addEventListener('click', async () => {
  if (!repo) return;
  await chrome.storage.local.remove(key());
  status('Cache cancellata.');
  await load();
});

load().catch((error) => status(error.message || String(error)));
