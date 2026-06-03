export function getToken() {
  return localStorage.getItem('access_token');
}

export function setToken(token) {
  localStorage.setItem('access_token', token);
}

export function removeToken() {
  localStorage.removeItem('access_token');
}

export function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
    ...extra,
  };
}

export async function apiFetch(url, options = {}, onUnauth) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    if (onUnauth) onUnauth();
    else window.location.href = 'http://localhost:8010/';
    return null;
  }
  return res;
}
