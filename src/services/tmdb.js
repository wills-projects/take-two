async function apiRequest(path, signal) {
  const response = await fetch(path, { signal });
  let body;

  try {
    body = await response.json();
  } catch (error) {
    throw new Error('The movie service returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error(body.error || 'The movie service is temporarily unavailable.');
  }

  return body;
}

export async function searchMovies(query, page = 1, signal) {
  const params = new URLSearchParams({
    query: query.trim(),
    page: String(page),
  });
  return apiRequest(`/api/movies/search?${params}`, signal);
}

export async function getRandomRecommendation(excludedIds) {
  const params = new URLSearchParams({
    exclude: excludedIds.filter((id) => Number.isSafeInteger(Number(id))).join(','),
  });
  return apiRequest(`/api/movies/recommendation?${params}`);
}

export async function getMovieRuntimes(ids, signal) {
  const params = new URLSearchParams({ ids: ids.join(',') });
  return apiRequest(`/api/movies/runtimes?${params}`, signal);
}
