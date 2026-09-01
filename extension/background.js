const CLICKHOUSE_URL = 'https://play.clickhouse.com/?user=play';
const CLICKHOUSE_TABLES = [
  'github.events',
  'github.github_events',
  'github_events'
];

function validOwner(value) {
  return typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value);
}

function validRepo(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value);
}

function requireRepo(owner, repo) {
  if (!validOwner(owner) || !validRepo(repo)) throw new Error('Repository non valida');
}

function sqlString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { /* handled below */ }
  }
  if (!response.ok) {
    const message = body?.message || body?.error || text.slice(0, 300) || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (body === null) throw new Error(`Risposta JSON non valida da ${new URL(url).hostname}`);
  return body;
}

async function runClickHouse(query) {
  const response = await fetch(CLICKHOUSE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Accept': 'application/json'
    },
    body: query,
    cache: 'no-store'
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`ClickHouse HTTP ${response.status}: ${text.slice(0, 240)}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('ClickHouse ha restituito una risposta non valida');
  }
}

function rowsToUsers(json, source) {
  return (json?.data || []).map((row) => ({
    login: row.login,
    starredAt: row.starred_at ? String(row.starred_at).replace(' ', 'T') + 'Z' : null,
    source
  })).filter((row) => row.login);
}

function makeArchiveQuery(table, owner, repo, repoId, mode) {
  const fullName = `${owner}/${repo}`;
  let repoFilter;

  if (mode === 'id' && repoId) {
    // repo_id is immutable across owner/repository renames and transfers.
    repoFilter = `repo_id = ${sqlString(String(repoId))}`;
  } else {
    repoFilter = `repo_name = ${sqlString(fullName)}`;
  }

  return `
SELECT
  actor_login AS login,
  max(created_at) AS starred_at
FROM ${table}
WHERE event_type = 'WatchEvent'
  AND ${repoFilter}
  AND actor_login != ''
GROUP BY actor_login
ORDER BY starred_at DESC
FORMAT JSON`;
}

async function queryOneTable(table, owner, repo, repoId) {
  const results = [];
  const errors = [];

  if (repoId) {
    try {
      const json = await runClickHouse(makeArchiveQuery(table, owner, repo, repoId, 'id'));
      results.push(...rowsToUsers(json, `${table}:repo_id`));
    } catch (error) {
      errors.push(`repo_id: ${error.message}`);
    }
  }

  // Also query the current name. This catches rows from tables/eras where repo_id is absent or malformed.
  try {
    const json = await runClickHouse(makeArchiveQuery(table, owner, repo, repoId, 'name'));
    results.push(...rowsToUsers(json, `${table}:repo_name`));
  } catch (error) {
    errors.push(`repo_name: ${error.message}`);
  }

  if (!results.length && errors.length >= (repoId ? 2 : 1)) {
    throw new Error(`${table}: ${errors.join('; ')}`);
  }

  return { table, users: results, errors };
}

async function queryArchive(owner, repo, repoId) {
  const settled = await Promise.allSettled(
    CLICKHOUSE_TABLES.map((table) => queryOneTable(table, owner, repo, repoId))
  );

  const users = [];
  const sources = [];
  const errors = [];

  settled.forEach((result, index) => {
    const table = CLICKHOUSE_TABLES[index];
    if (result.status === 'fulfilled') {
      users.push(...result.value.users);
      if (result.value.users.length) sources.push({ table, rows: result.value.users.length });
      if (result.value.errors?.length) errors.push(...result.value.errors.map((e) => `${table}: ${e}`));
    } else {
      errors.push(result.reason?.message || `${table}: errore sconosciuto`);
    }
  });

  if (!users.length && errors.length) {
    throw new Error(`Archivi pubblici non raggiungibili o senza risultati: ${errors.join(' | ')}`);
  }

  return { users, sources, errors };
}

async function queryRecentEvents(owner, repo) {
  const result = new Map();
  for (let page = 1; page <= 3; page++) {
    try {
      const rows = await fetchJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/events?per_page=100&page=${page}`, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2026-03-10'
        },
        cache: 'no-store'
      });
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const event of rows) {
        if (event?.type !== 'WatchEvent' || event?.payload?.action !== 'started' || !event?.actor?.login) continue;
        const login = event.actor.login;
        result.set(login.toLowerCase(), {
          login,
          starredAt: event.created_at || null,
          avatarUrl: event.actor.avatar_url || null,
          source: 'github-recent-events'
        });
      }
      if (rows.length < 100) break;
    } catch {
      break;
    }
  }
  return [...result.values()];
}

async function queryRepoMeta(owner, repo) {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10'
      },
      cache: 'no-store'
    });
    return {
      id: data?.id != null ? String(data.id) : null,
      stars: Number.isFinite(data?.stargazers_count) ? data.stargazers_count : null,
      htmlUrl: data?.html_url || `https://github.com/${owner}/${repo}`,
      private: Boolean(data?.private),
      fullName: data?.full_name || `${owner}/${repo}`
    };
  } catch {
    return { id: null, stars: null, htmlUrl: `https://github.com/${owner}/${repo}`, private: false, fullName: `${owner}/${repo}` };
  }
}

function mergeUsers(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const user of list || []) {
      if (!user?.login) continue;
      const key = user.login.toLowerCase();
      const old = map.get(key);
      if (!old) {
        map.set(key, { ...user, sources: user.source ? [user.source] : [] });
        continue;
      }

      const oldTime = old.starredAt ? Date.parse(old.starredAt) || 0 : 0;
      const newTime = user.starredAt ? Date.parse(user.starredAt) || 0 : 0;
      const sources = new Set([...(old.sources || []), ...(user.sources || []), old.source, user.source].filter(Boolean));

      map.set(key, {
        ...old,
        ...user,
        login: old.login || user.login,
        starredAt: newTime >= oldTime ? (user.starredAt || old.starredAt || null) : old.starredAt,
        avatarUrl: user.avatarUrl || old.avatarUrl || null,
        source: sources.size > 1 ? 'multiple-public-sources' : (user.source || old.source || null),
        sources: [...sources]
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    const ta = a.starredAt ? Date.parse(a.starredAt) || 0 : 0;
    const tb = b.starredAt ? Date.parse(b.starredAt) || 0 : 0;
    if (tb !== ta) return tb - ta;
    return a.login.localeCompare(b.login);
  });
}

async function reconstruct(owner, repo) {
  requireRepo(owner, repo);
  const [meta, recent] = await Promise.all([
    queryRepoMeta(owner, repo),
    queryRecentEvents(owner, repo)
  ]);

  let archive = { users: [], sources: [], errors: [] };
  let archiveError = null;
  try {
    archive = await queryArchive(owner, repo, meta.id);
  } catch (error) {
    archiveError = error.message;
  }

  const users = mergeUsers(archive.users, recent);
  if (!users.length && archiveError) throw new Error(archiveError);

  let coverageState = 'unknown';
  if (Number.isFinite(meta.stars)) {
    if (users.length < meta.stars) coverageState = 'historical-list-incomplete';
    else if (users.length > meta.stars) coverageState = 'contains-historical-unstarred-users';
    else coverageState = 'same-count-not-proof-of-membership';
  }

  return {
    schemaVersion: 3,
    owner,
    repo,
    repoId: meta.id,
    users,
    recoveredAt: new Date().toISOString(),
    currentStarCount: meta.stars,
    recoveredIdentityCount: users.length,
    coverageState,
    archiveSources: archive.sources,
    archiveErrors: archive.errors,
    archiveError,
    recentEventUsers: recent.length,
    caveat: 'Questa è la massima ricostruzione da fonti pubbliche disponibile, non la membership live. WatchEvent registra la star aggiunta ma non esiste un evento pubblico equivalente per identificare con certezza una star rimossa.'
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return;
  (async () => {
    if (message.type === 'reconstruct-stargazers') {
      return { ok: true, snapshot: await reconstruct(message.owner, message.repo) };
    }
    throw new Error('Messaggio non supportato');
  })().then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error?.message || String(error) });
  });
  return true;
});
