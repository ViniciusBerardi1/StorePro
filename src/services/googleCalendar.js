const CLIENT_ID = "473838587906-d64nbhadadfoh6alnsuo372o7romqgkt.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar";
const LS_KEY = "gcal_was_connected";

let _tokenClient = null;
let _token = null;
let _expiry = 0;
let _onTokenChange = null;
let _initialized = false;
let _refreshTimer = null;
let _silentAuthTimeout = null;

// Aguarda um novo token via Promise (usado para renovação automática)
let _pendingRefresh = null;

function _scheduleRefresh() {
  clearTimeout(_refreshTimer);
  const msAteExpirar = _expiry - Date.now();
  // Renova 2 minutos antes de expirar
  const delay = Math.max(msAteExpirar - 120_000, 10_000);
  _refreshTimer = setTimeout(() => {
    _tokenClient?.requestAccessToken({ prompt: "" });
  }, delay);
}

function _handleTokenResponse(response) {
  // Cancela timeout de auth silenciosa — recebemos resposta
  if (_silentAuthTimeout) {
    clearTimeout(_silentAuthTimeout);
    _silentAuthTimeout = null;
  }

  if (response.error) {
    _token = null;
    _expiry = 0;
    clearTimeout(_refreshTimer);
    localStorage.removeItem(LS_KEY);
    _onTokenChange?.(null);
    if (_pendingRefresh) {
      _pendingRefresh.reject(new Error("Falha ao renovar token: " + response.error));
      _pendingRefresh = null;
    }
    return;
  }
  _token = response.access_token;
  _expiry = Date.now() + (response.expires_in - 60) * 1000;
  localStorage.setItem(LS_KEY, "1");
  _onTokenChange?.(_token);
  _scheduleRefresh();
  if (_pendingRefresh) {
    _pendingRefresh.resolve(_token);
    _pendingRefresh = null;
  }
}

// Solicita renovação silenciosa e aguarda o novo token (com timeout de 8s)
function _renovarToken() {
  if (_pendingRefresh) return _pendingRefresh.promise;
  const p = {};
  p.promise = new Promise((resolve, reject) => {
    p.resolve = resolve;
    p.reject = reject;
  });
  _pendingRefresh = p;
  _tokenClient?.requestAccessToken({ prompt: "" });

  // Se o popup for bloqueado ou não houver resposta em 8s, cancela e desconecta
  const t = setTimeout(() => {
    if (_pendingRefresh === p) {
      _pendingRefresh = null;
      localStorage.removeItem(LS_KEY);
      _onTokenChange?.(null);
      p.reject(new Error("Sessão expirada. Clique em 'Entrar com Google' para reconectar."));
    }
  }, 8000);

  // Garante que o timeout seja limpo quando a promise resolver/rejeitar
  p.promise.then(
    () => clearTimeout(t),
    () => clearTimeout(t)
  ).catch(() => {});

  return p.promise;
}

export function initGoogleCalendar(onTokenChange) {
  _onTokenChange = onTokenChange;

  if (_initialized) {
    if (isGoogleConnected()) onTokenChange(_token);
    return;
  }

  if (!window.google?.accounts?.oauth2) {
    console.warn("Google Identity Services não carregado.");
    return;
  }

  _initialized = true;

  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: _handleTokenResponse,
  });

  if (localStorage.getItem(LS_KEY)) {
    _tokenClient.requestAccessToken({ prompt: "" });

    // Se o popup for bloqueado pelo browser e nenhum callback chegar em 5s,
    // assume falha, remove a flag e notifica a UI para mostrar TelaConectar.
    _silentAuthTimeout = setTimeout(() => {
      if (!isGoogleConnected()) {
        localStorage.removeItem(LS_KEY);
        _onTokenChange?.(null);
      }
      _silentAuthTimeout = null;
    }, 5000);
  }
}

export function googleSignIn() {
  _tokenClient?.requestAccessToken({ prompt: "select_account" });
}

export function googleSignOut() {
  if (_token) {
    window.google?.accounts?.oauth2?.revoke(_token, () => {});
    _token = null;
    _expiry = 0;
  }
  clearTimeout(_refreshTimer);
  localStorage.removeItem(LS_KEY);
  _onTokenChange?.(null);
}

export function isGoogleConnected() {
  return !!_token && Date.now() < _expiry;
}

async function apiFetch(path, options = {}) {
  // Se token expirado mas usuário já havia conectado, tenta renovar silenciosamente
  if (!isGoogleConnected()) {
    if (localStorage.getItem(LS_KEY)) {
      await _renovarToken();
    } else {
      throw new Error("Não autenticado.");
    }
  }

  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${_token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  // Token expirado no servidor (401) → renova e tenta de novo
  if (res.status === 401) {
    await _renovarToken();
    return apiFetch(path, options);
  }

  if (res.status === 204) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro ${res.status}`);
  }

  return res.json();
}

export async function getEventos(inicio, fim) {
  const params = new URLSearchParams({
    timeMin: inicio.toISOString(),
    timeMax: fim.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const data = await apiFetch(`/calendars/primary/events?${params}`);
  return data?.items || [];
}

export async function criarEvento(evento) {
  return apiFetch("/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify(evento),
  });
}

export async function atualizarEvento(id, evento) {
  return apiFetch(`/calendars/primary/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(evento),
  });
}

export async function deletarEvento(id) {
  await apiFetch(`/calendars/primary/events/${id}`, { method: "DELETE" });
}
