// Prihlásenie do administrácie – krok 2: výmena kódu za token a odovzdanie tokenu Decap CMS.
const page = (status, content) => `<!doctype html><meta charset="utf-8"><body><p>Prihlasujem…</p><script>
(function(){var msg=${JSON.stringify(`authorization:github:${status}:`)}+${JSON.stringify(JSON.stringify(content))};
function recv(e){ window.opener.postMessage(msg, e.origin); window.removeEventListener('message',recv,false); setTimeout(function(){window.close();},300); }
window.addEventListener('message',recv,false); window.opener && window.opener.postMessage('authorizing:github','*');})();
</script>`;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const ck = (request.headers.get('cookie') || '').match(/gh_state=([^;]+)/);
  const html = (s, c) => new Response(page(s, c), { headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'gh_state=; Path=/api; Max-Age=0' } });
  if (!code || !ck || ck[1] !== state) return html('error', { message: 'Neplatné prihlásenie, skús znova.' });
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'fbkastrencin-cms' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const j = await r.json();
  if (!j.access_token) return html('error', { message: j.error_description || 'GitHub odmietol prihlásenie.' });
  return html('success', { token: j.access_token, provider: 'github' });
}
