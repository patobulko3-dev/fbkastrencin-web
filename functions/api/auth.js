// Prihlásenie do administrácie (Decap CMS) cez GitHub – krok 1: presmerovanie na GitHub.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const gh = new URL('https://github.com/login/oauth/authorize');
  gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  gh.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  gh.searchParams.set('scope', url.searchParams.get('scope') || 'repo,user');
  gh.searchParams.set('state', state);
  return new Response(null, { status: 302, headers: { location: gh.toString(), 'set-cookie': `gh_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
}
