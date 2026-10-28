// Formuláre webu (odkaz klubu, nábor). Uloží do KV (väzba FORMS) a voliteľne pošle e-mail (väzba MAIL + premenná MAIL_TO).
import { json } from '../../lib/cf-util.js';

const FORMS = { 'odkaz-klubu': 'Odkaz klubu', nabor: 'Nábor – prihláška' };

export async function onRequestPost({ request, env }) {
  let data = {};
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) data = await request.json();
  else for (const [k, v] of (await request.formData()).entries()) data[k] = String(v);
  const form = data['form-name'];
  if (!FORMS[form]) return json({ error: 'form' }, 400);
  if (data['bot-field']) return json({ ok: true }); // robot
  delete data['form-name']; delete data['bot-field'];
  for (const k of Object.keys(data)) data[k] = String(data[k]).slice(0, 2000);
  if (!Object.values(data).some((v) => v.trim())) return json({ error: 'empty' }, 400);
  const at = new Date().toISOString();
  const rec = { form, at, data };
  if (env.FORMS) await env.FORMS.put(`${form}:${at}:${crypto.randomUUID().slice(0, 6)}`, JSON.stringify(rec));
  if (env.MAIL && env.MAIL_TO) {
    try {
      const { EmailMessage } = await import('cloudflare:email');
      const from = env.MAIL_FROM || 'web@fbkastrencin.sk';
      const body = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n');
      const subj = `${FORMS[form]} – fbkastrencin.sk`;
      const raw = [`From: AS Trencin web <${from}>`, `To: ${env.MAIL_TO}`, `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subj)))}?=`,
        `Message-ID: <${crypto.randomUUID()}@fbkastrencin.sk>`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit', '', body, '', `Prijaté: ${at}`].join('\r\n');
      await env.MAIL.send(new EmailMessage(from, env.MAIL_TO, raw));
    } catch (e) { console.log('mail', e && e.message); }
  }
  if (!env.FORMS && !(env.MAIL && env.MAIL_TO)) return json({ error: 'storage' }, 500);
  return json({ ok: true });
}
export const onRequest = () => json({ error: 'method' }, 405);
