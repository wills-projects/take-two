async function authRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('The sign-in service returned an invalid response.');
  }

  if (!response.ok) {
    const error = new Error(body.error || 'The sign-in service is temporarily unavailable.');
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function signIn(email, password) {
  const result = await authRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return result.user;
}

export async function readCurrentUser() {
  try {
    const result = await authRequest('/api/auth/session');
    return result.user;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

export function clearCurrentUser() {
  return authRequest('/api/auth/logout', { method: 'POST' });
}
