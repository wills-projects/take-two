async function dataRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  let body;
  try {
    body = await response.json();
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    throw new Error(
      `The shared diary endpoint returned a non-JSON response (HTTP ${response.status}, ${contentType}). Check the Vercel API deployment and routing.`,
    );
  }

  if (!response.ok && response.status !== 409) {
    const error = new Error(body.error || 'The shared diary service is temporarily unavailable.');
    error.status = response.status;
    throw error;
  }
  return { ...body, conflict: response.status === 409 };
}

export function loadSharedData() {
  return dataRequest('/api/data');
}

export function saveSharedData(data, expectedRevision) {
  return dataRequest('/api/data', {
    method: 'PUT',
    body: JSON.stringify({
      expectedRevision,
      films: data.films,
      watchlist: data.watchlist,
    }),
  });
}
