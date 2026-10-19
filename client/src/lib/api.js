let viewUserId = null;

/** Admins can switch whose data they are looking at; reads include it as ?userId=. */
export function setViewUser(id) {
  viewUserId = id;
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  const query = { ...(params || {}) };
  if (viewUserId !== null && method === 'GET' && query.userId === undefined) query.userId = viewUserId;
  if (viewUserId !== null && method === 'POST' && path.startsWith('/insights')) query.userId = viewUserId;
  if (viewUserId !== null && method === 'POST' && path === '/holdings/refresh-prices') query.userId = viewUserId;
  if (viewUserId && viewUserId !== 'all' && method === 'POST' && body && typeof body === 'object' && body.user_id === undefined) {
    body = { ...body, user_id: viewUserId };
  }
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
