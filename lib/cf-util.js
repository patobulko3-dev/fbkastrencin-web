export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// E-mailové upozornenie pre klub. Primárne Resend (premenná RESEND_API_KEY), záloha FormSubmit.
export async function notify(env, subject, fields) {
  const to = env.MAIL_TO || 'patobulko3@gmail.com';
  const rows = Object.entries(fields).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `<tr><td style="padding:6px 12px;background:#f6eeee;font-weight:700;text-transform:capitalize">${esc(k)}</td><td style="padding:6px 12px">${esc(v)}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,sans-serif"><h2 style="color:#c21f26;margin:0 0 12px">${esc(subject)}</h2><table style="border-collapse:collapse;font-size:15px">${rows}</table><p style="color:#888;font-size:12px;margin-top:16px">Automatická správa z webu fbkastrencin.sk</p></div>`;
  if (env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.MAIL_FROM || 'AS Trenčín web <onboarding@resend.dev>', to: [to], subject, html }) });
      const t = await r.text(); if (r.ok) return 'resend ok ' + t.slice(0, 80); console.log('resend', r.status, t);
    } catch (e) { console.log('resend err', e && e.message); }
  }
  try {
    const r = await fetch('https://formsubmit.co/ajax/' + to, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://www.fbkastrencin.sk', Referer: 'https://www.fbkastrencin.sk/' },
      body: JSON.stringify(Object.assign({ _subject: subject, _template: 'table', _captcha: 'false' }, fields)) });
    return 'formsubmit ' + r.status + ' ' + (await r.text()).slice(0, 120);
  } catch (e) { return 'ERR ' + (e && e.message); }
}
