(() => {
  const PANEL_ID = 'rgs-panel';
  const ARCHIVE_PREFIX = 'rgs:archive:';
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const PAGE_SIZE = 50;
  let lastUrl = location.href;
  let renderTimer = null;
  let requestInFlight = null;
  let page = 1;
  let filter = '';

  function repoFromLocation() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length < 3 || parts[2] !== 'stargazers') return null;
    return { owner: parts[0], repo: parts[1] };
  }

  function keyFor(owner, repo) {
    return `${ARCHIVE_PREFIX}${owner}/${repo}`.toLowerCase();
  }

  function extractVisibleStargazers() {
    const seen = new Map();
    const candidates = document.querySelectorAll(
      'a[data-hovercard-type="user"], a[data-hovercard-url*="/users/"][href^="/"]'
    );
    for (const anchor of candidates) {
      const href = anchor.getAttribute('href');
      if (!href || !/^\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/?$/.test(href)) continue;
      const login = href.replace(/^\//, '').replace(/\/$/, '');
      if (!login) continue;
      seen.set(login.toLowerCase(), login);
    }
    return [...seen.values()];
  }

  function restoreGitHubMain() {
    document.querySelectorAll('[data-rgs-hidden="true"]').forEach((el) => {
      el.hidden = false;
      el.removeAttribute('data-rgs-hidden');
    });
  }

  function hideGitHub404(panel) {
    const main = document.querySelector('main');
    if (!main) return;
    for (const child of [...main.children]) {
      if (child === panel) continue;
      child.hidden = true;
      child.setAttribute('data-rgs-hidden', 'true');
    }
  }

  function mountPanel(panel, replace404 = false) {
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();
    const main = document.querySelector('main') || document.body;
    main.prepend(panel);
    if (replace404) hideGitHub404(panel);
  }

  function panelShell() {
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'rgs-panel';
    return panel;
  }

  function header(titleText, subtitleText) {
    const wrap = document.createElement('div');
    wrap.className = 'rgs-header';
    const texts = document.createElement('div');
    const title = document.createElement('h1');
    title.className = 'rgs-title';
    title.textContent = titleText;
    const subtitle = document.createElement('p');
    subtitle.className = 'rgs-subtitle';
    subtitle.textContent = subtitleText;
    texts.append(title, subtitle);
    wrap.append(texts);
    return { wrap, texts };
  }

  function button(label, handler, secondary = false) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `rgs-btn${secondary ? ' rgs-btn-secondary' : ''}`;
    el.textContent = label;
    el.addEventListener('click', handler);
    return el;
  }

  function renderLoading(repo) {
    restoreGitHubMain();
    const panel = panelShell();
    const h = header('GitHub Stargazers Rewind', `Ricostruisco gli stargazer pubblici di ${repo.owner}/${repo.repo}…`);
    const spinner = document.createElement('div');
    spinner.className = 'rgs-loading';
    spinner.innerHTML = '<span class="rgs-spinner" aria-hidden="true"></span><span>Interrogo gli archivi WatchEvent tramite repo_id immutabile e nome corrente…</span>';
    panel.append(h.wrap, spinner);
    mountPanel(panel, true);
  }

  function renderError(repo, message) {
    restoreGitHubMain();
    const panel = panelShell();
    const h = header('GitHub Stargazers Rewind', 'Non sono riuscito a ricostruire la lista.');
    const error = document.createElement('div');
    error.className = 'rgs-error';
    error.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'rgs-actions';
    actions.append(button('Riprova', () => recoverAndRender(repo, true)));
    h.wrap.append(actions);
    panel.append(h.wrap, error);
    mountPanel(panel, true);
  }

  function sourceLabel(user) {
    if (user.source === 'recent') return 'evento GitHub recente';
    if (user.source === 'archive+recent') return 'archivio + evento recente';
    return 'archivio pubblico';
  }

  function renderRecovered(repo, snapshot) {
    restoreGitHubMain();
    const panel = panelShell();
    const recovered = snapshot.users?.length || 0;
    const total = Number.isFinite(snapshot.currentStarCount) ? snapshot.currentStarCount : null;
    const summary = total !== null
      ? `${recovered.toLocaleString()} utenti ricostruiti · ${total.toLocaleString()} star attuali indicate da GitHub`
      : `${recovered.toLocaleString()} utenti ricostruiti dagli eventi pubblici`;
    const h = header(`Stargazers · ${repo.owner}/${repo.repo}`, summary);
    const actions = document.createElement('div');
    actions.className = 'rgs-actions';
    actions.append(button('Aggiorna dati', () => recoverAndRender(repo, true), true));
    h.wrap.append(actions);
    panel.append(h.wrap);

    const warning = document.createElement('div');
    warning.className = 'rgs-notice';
    warning.textContent = 'Massima ricostruzione pubblica disponibile. Uso anche il repo_id immutabile per recuperare eventi precedenti a rename/transfer. Non può comunque provare la membership live: GitHub pubblica WatchEvent per la star aggiunta, ma non un evento inverso equivalente per la rimozione.';
    panel.append(warning);

    const toolbar = document.createElement('div');
    toolbar.className = 'rgs-toolbar';
    const search = document.createElement('input');
    search.className = 'rgs-search';
    search.type = 'search';
    search.placeholder = 'Cerca username…';
    search.value = filter;
    search.addEventListener('input', () => {
      filter = search.value;
      page = 1;
      renderRecovered(repo, snapshot);
      const next = document.querySelector('.rgs-search');
      next?.focus();
      if (next) next.setSelectionRange(next.value.length, next.value.length);
    });
    toolbar.append(search);
    panel.append(toolbar);

    const needle = filter.trim().toLowerCase();
    const users = (snapshot.users || []).filter((u) => !needle || u.login.toLowerCase().includes(needle));
    const pages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
    page = Math.min(Math.max(page, 1), pages);
    const start = (page - 1) * PAGE_SIZE;
    const pageUsers = users.slice(start, start + PAGE_SIZE);

    const list = document.createElement('div');
    list.className = 'rgs-list';
    for (const user of pageUsers) {
      const row = document.createElement('div');
      row.className = 'rgs-user-row';
      const link = document.createElement('a');
      link.className = 'rgs-user-link';
      link.href = `https://github.com/${encodeURIComponent(user.login)}`;
      const avatar = document.createElement('img');
      avatar.className = 'rgs-avatar';
      avatar.src = user.avatarUrl || `https://github.com/${encodeURIComponent(user.login)}.png?size=96`;
      avatar.alt = '';
      avatar.loading = 'lazy';
      const info = document.createElement('div');
      info.className = 'rgs-user-info';
      const login = document.createElement('strong');
      login.textContent = user.login;
      const meta = document.createElement('span');
      const when = user.starredAt ? ` · ${new Date(user.starredAt).toLocaleDateString()}` : '';
      meta.textContent = `${sourceLabel(user)}${when}`;
      info.append(login, meta);
      link.append(avatar, info);
      row.append(link);
      list.append(row);
    }
    if (!pageUsers.length) {
      const empty = document.createElement('div');
      empty.className = 'rgs-empty';
      empty.textContent = 'Nessun username corrisponde alla ricerca.';
      list.append(empty);
    }
    panel.append(list);

    const pager = document.createElement('div');
    pager.className = 'rgs-pager';
    const prev = button('← Precedenti', () => { page--; renderRecovered(repo, snapshot); }, true);
    const next = button('Successivi →', () => { page++; renderRecovered(repo, snapshot); }, true);
    prev.disabled = page <= 1;
    next.disabled = page >= pages;
    const label = document.createElement('span');
    label.textContent = `Pagina ${page} di ${pages} · ${users.length.toLocaleString()} utenti`;
    pager.append(prev, label, next);
    panel.append(pager);

    const footer = document.createElement('div');
    footer.className = 'rgs-footer';
    const when = snapshot.recoveredAt ? new Date(snapshot.recoveredAt).toLocaleString() : '—';
    footer.textContent = `Dati ricostruiti: ${when}${snapshot.archiveTable ? ` · ${snapshot.archiveTable}` : ''}${snapshot.recentEventUsers ? ` · ${snapshot.recentEventUsers} eventi recenti` : ''}`;
    panel.append(footer);
    mountPanel(panel, true);
  }

  async function getCached(repo) {
    const key = keyFor(repo.owner, repo.repo);
    const data = (await chrome.storage.local.get(key))[key] || null;
    if (!data?.recoveredAt || !Array.isArray(data.users)) return null;
    const age = Date.now() - Date.parse(data.recoveredAt);
    return age <= CACHE_TTL_MS ? data : null;
  }

  async function recover(repo, force = false) {
    if (!force) {
      const cached = await getCached(repo);
      if (cached) return cached;
    }
    if (requestInFlight) return requestInFlight;
    requestInFlight = (async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'reconstruct-stargazers',
        owner: repo.owner,
        repo: repo.repo
      });
      if (!response?.ok) throw new Error(response?.error || 'Ricostruzione fallita');
      const snapshot = response.snapshot;
      await chrome.storage.local.set({ [keyFor(repo.owner, repo.repo)]: snapshot });
      return snapshot;
    })();
    try { return await requestInFlight; }
    finally { requestInFlight = null; }
  }

  async function recoverAndRender(repo, force = false) {
    renderLoading(repo);
    try {
      const snapshot = await recover(repo, force);
      renderRecovered(repo, snapshot);
    } catch (error) {
      renderError(repo, error?.message || String(error));
    }
  }

  async function render() {
    const repo = repoFromLocation();
    if (!repo) return;
    const visible = extractVisibleStargazers();
    if (visible.length > 0) {
      restoreGitHubMain();
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    await recoverAndRender(repo, false);
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render().catch(console.error), 300);
  }

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      page = 1;
      filter = '';
      restoreGitHubMain();
      scheduleRender();
      return;
    }
    if (repoFromLocation() && !document.getElementById(PANEL_ID) && !requestInFlight) scheduleRender();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleRender);
  document.addEventListener('turbo:load', scheduleRender);
  scheduleRender();
})();
