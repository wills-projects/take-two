const users = [
  { id: 'will', name: 'Will', email: 'williampaullee@gmail.com', password: 'test123' },
  { id: 'lynn', name: 'Lynn', email: 'xulynn19@gmail.com', password: 'test123' },
];

const sessionKey = 'take-two-user';

export function authenticate(email, password) {
  const user = users.find(
    (candidate) =>
      candidate.email.toLowerCase() === email.trim().toLowerCase() &&
      candidate.password === password,
  );

  if (!user) return null;

  return { id: user.id, name: user.name, email: user.email };
}

export function readCurrentUser() {
  try {
    const stored = window.localStorage.getItem(sessionKey);
    if (!stored) return null;
    const user = JSON.parse(stored);
    return users.some((candidate) => candidate.id === user.id)
      ? { id: user.id, name: user.name, email: user.email }
      : null;
  } catch (error) {
    console.error('Could not read the local Take Two session.', error);
    return null;
  }
}

export function saveCurrentUser(user) {
  // Prototype-only client authentication; replace with a server session before production.
  window.localStorage.setItem(sessionKey, JSON.stringify(user));
}

export function clearCurrentUser() {
  window.localStorage.removeItem(sessionKey);
}
