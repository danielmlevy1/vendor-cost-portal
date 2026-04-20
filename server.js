// =============================================================
// VENDOR COST PORTAL — Express Server
// Serves static files + REST API for fabric standard requests
// Sends daily digest email at 10am (Asia/Hong_Kong by default)
// =============================================================

const express    = require('express');
const path       = require('path');
const cron       = require('node-cron');
const nodemailer = require('nodemailer');

const { router: authRouter } = require('./auth');
const apiRouter            = require('./routes');
const apiSupportingRouter  = require('./routes-supporting');
const db                   = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Env config ─────────────────────────────────────────────────
const SMTP_HOST     = process.env.SMTP_HOST     || 'smtp.gmail.com';
const SMTP_PORT     = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER     = process.env.SMTP_USER     || '';
const SMTP_PASS     = process.env.SMTP_PASS     || '';
const FROM_EMAIL    = process.env.FROM_EMAIL    || SMTP_USER;
const COMPANY_NAME  = process.env.COMPANY_NAME  || 'Costing Team';
const PD_EMAIL      = process.env.PD_EMAIL      || '';          // PD team reply-to
const TZ            = process.env.EMAIL_TIMEZONE || 'Asia/Hong_Kong';
const CRON_TIME     = process.env.CRON_TIME      || '0 10 * * *'; // 10:00am daily

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));   // serves index.html, app.js, etc.

// ── Auth API ───────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── Core data API ──────────────────────────────────────────────
app.use('/api', apiRouter);
app.use('/api', apiSupportingRouter);

// Pull pending fabric requests from the DB, joined with the TC.
// Used by both the daily digest and any manual /send-digest trigger.
function loadPendingRequestsForDigest() {
  const rows = db.prepare(`
    SELECT r.id, r.tc_id, r.program_id, r.fabric_code, r.fabric_name,
           r.content, r.swatch_qty, r.style_numbers, r.requested_at,
           t.code AS tc_code, t.name AS tc_name, t.email AS tc_email,
           p.name AS program_name
    FROM fabric_requests r
    JOIN trading_companies t ON t.id = r.tc_id
    LEFT JOIN programs p     ON p.id = r.program_id
    WHERE r.status = 'outstanding'
    ORDER BY r.requested_at
  `).all();
  return rows.map(r => ({
    id:           r.id,
    tcId:         r.tc_id,
    tcName:       r.tc_name,
    tcEmail:      r.tc_email,
    programId:    r.program_id,
    programName:  r.program_name,
    fabricCode:   r.fabric_code,
    fabricName:   r.fabric_name,
    content:      r.content,
    swatchQty:    r.swatch_qty,
    styleNumbers: (() => { try { return JSON.parse(r.style_numbers || '[]'); } catch { return []; } })(),
    requestedAt:  r.requested_at,
  }));
}

// POST /api/send-digest — manually trigger the daily email digest
app.post('/api/send-digest', async (req, res) => {
  try {
    const result = await sendDailyDigest();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Digest error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Email: Daily Digest ────────────────────────────────────────
async function sendDailyDigest() {
  const allRequests = loadPendingRequestsForDigest();

  if (!allRequests.length) {
    console.log('[digest] No pending requests — skipping email send.');
    return { sent: 0, skipped: 'no pending requests' };
  }

  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('[digest] SMTP credentials not configured — skipping send.');
    return { sent: 0, skipped: 'smtp not configured' };
  }

  // Group by TC
  const byTC = {};
  allRequests.forEach(r => {
    if (!byTC[r.tcId]) byTC[r.tcId] = { tcId: r.tcId, tcName: r.tcName || r.tcId, tcEmail: r.tcEmail || '', requests: [] };
    byTC[r.tcId].requests.push(r);
  });

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ });
  let sentCount = 0;

  for (const tc of Object.values(byTC)) {
    if (!tc.tcEmail) {
      console.warn(`[digest] No email for TC ${tc.tcId} — skipping`);
      continue;
    }

    // Group requests by program
    const byProg = {};
    tc.requests.forEach(r => {
      const key = r.programName || r.programId || 'General';
      if (!byProg[key]) byProg[key] = [];
      byProg[key].push(r);
    });

    // Build plain-text + HTML body
    let textBody = `Hi ${tc.tcName},\n\nPlease find below outstanding fabric swatch requests as of ${dateStr}:\n\n`;
    let htmlRows = '';

    for (const [prog, reqs] of Object.entries(byProg)) {
      textBody += `PROGRAM: ${prog}\n${'─'.repeat(40)}\n`;
      htmlRows += `<tr><td colspan="5" style="background:#1e293b;color:#94a3b8;padding:8px 12px;font-size:0.8rem;letter-spacing:.06em;text-transform:uppercase">${prog}</td></tr>`;

      reqs.forEach(r => {
        const styles  = Array.isArray(r.styleNumbers) ? r.styleNumbers.join(', ') : (r.styleNumbers || '—');
        const reqDate = r.requestedAt ? new Date(r.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        textBody += `  Fabric Code:  ${r.fabricCode || '—'}\n  Fabric Name:  ${r.fabricName || '—'}\n  Content:      ${r.content || '—'}\n  Swatch Qty:   ${r.swatchQty || '—'}\n  Styles:       ${styles}\n  Requested:    ${reqDate}\n\n`;
        htmlRows += `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b">${r.fabricCode || '—'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b">${r.fabricName || '—'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8">${r.content || '—'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;font-weight:600">${r.swatchQty || '—'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-size:0.82rem">${styles}</td>
        </tr>`;
      });
    }

    const replyTo = PD_EMAIL || FROM_EMAIL;
    textBody += `\nPlease send swatches to our Product Development team at: ${replyTo}\n\nThank you,\n${COMPANY_NAME}`;

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',sans-serif;color:#e2e8f0">
    <div style="max-width:680px;margin:0 auto;padding:32px 16px">
      <div style="margin-bottom:24px">
        <div style="font-size:1.4rem;font-weight:700;color:#fff">🧵 Fabric Swatch Requests</div>
        <div style="color:#94a3b8;margin-top:4px">${dateStr}</div>
      </div>
      <p style="color:#94a3b8">Hi <strong style="color:#e2e8f0">${tc.tcName}</strong>,<br><br>
      Please find below outstanding fabric swatch requests for your upcoming costing programs.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a2744;border-radius:8px;overflow:hidden;margin:24px 0">
        <thead><tr style="background:#0f172a">
          <th style="padding:10px 12px;text-align:left;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Code</th>
          <th style="padding:10px 12px;text-align:left;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Fabric Name</th>
          <th style="padding:10px 12px;text-align:left;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Content</th>
          <th style="padding:10px 12px;text-align:center;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Swatch Qty</th>
          <th style="padding:10px 12px;text-align:left;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Styles</th>
        </tr></thead>
        <tbody>${htmlRows}</tbody>
      </table>
      <p style="color:#94a3b8">Please send swatches to our Product Development team at:
        <a href="mailto:${replyTo}" style="color:#6366f1">${replyTo}</a></p>
      <p style="color:#64748b;font-size:0.8rem">— ${COMPANY_NAME}</p>
    </div></body></html>`;

    try {
      await transporter.sendMail({
        from:    `"${COMPANY_NAME}" <${FROM_EMAIL}>`,
        to:      tc.tcEmail,
        replyTo: replyTo,
        subject: `Fabric Swatch Requests — ${tc.tcName} — ${dateStr}`,
        text:    textBody,
        html:    html,
      });
      console.log(`[digest] Sent to ${tc.tcEmail} (${tc.requests.length} requests)`);
      sentCount++;
    } catch (err) {
      console.error(`[digest] Failed to send to ${tc.tcEmail}:`, err.message);
    }
  }

  return { sent: sentCount, total: Object.keys(byTC).length };
}

// ── Cron: 10am daily in configured timezone ────────────────────
// node-cron uses system timezone; we translate the target TZ to a UTC cron expression dynamically
function scheduleCron() {
  // Calculate current UTC offset for the target timezone
  const now        = new Date();
  const tzOffset   = new Date(now.toLocaleString('en-US', { timeZone: TZ })) - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzHours    = Math.round(tzOffset / 3600000);
  const sendHourUTC = (10 - tzHours + 24) % 24;
  const cronExpr   = `0 ${sendHourUTC} * * *`;

  console.log(`[cron] Scheduled digest at 10:00am ${TZ} = ${sendHourUTC}:00 UTC (${cronExpr})`);

  cron.schedule(cronExpr, async () => {
    console.log(`[cron] Running daily fabric digest — ${new Date().toISOString()}`);
    try {
      const result = await sendDailyDigest();
      console.log('[cron] Digest complete:', result);
    } catch (err) {
      console.error('[cron] Digest error:', err);
    }
  });
}

// ── Fallback: serve index.html for any non-API path ────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// ── Start ──────────────────────────────────────────────────────
scheduleCron();
app.listen(PORT, () => {
  console.log(`\n🚀 Vendor Cost Portal running at http://localhost:${PORT}`);
  console.log(`   Daily email digest: 10:00am ${TZ}`);
  console.log(`   SMTP: ${SMTP_USER || '(not configured — set SMTP_USER and SMTP_PASS env vars)'}\n`);
});
