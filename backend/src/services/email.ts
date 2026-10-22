import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { Booking, BookingPassenger, City, EmailJob, Operator, Refund, Trip, User } from '../models';
import { publicAppOrigin } from '../utils/network';

// ---------- queue ----------
export type EmailTemplate =
  | 'booking_confirmation'
  | 'payment_failed'
  | 'cancellation_pending'
  | 'cancellation_completed'
  | 'cancellation_final'
  | 'refund_completed'
  | 'departure_reminder'
  | 'password_reset'
  | 'welcome';

export async function enqueueEmail(to: string, template: EmailTemplate, bookingId: unknown, data: Record<string, unknown> = {}, dedupeKey?: string) {
  try {
    await EmailJob.create({ to, template, bookingId: bookingId ? String(bookingId) : undefined, data, dedupeKey });
    setImmediate(() => processEmailQueue().catch((e) => console.warn('[email] immediate process error:', e.message)));
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return; // duplicate dedupeKey: already queued
    throw e;
  }
}

const MAX_ATTEMPTS = 5;
let transport: nodemailer.Transporter | null = null;
const getTransport = () => {
  if (transport) return transport;
  if (env.SMTP_HOST && env.EMAIL_PROVIDER === 'smtp') {
    transport = env.SMTP_HOST.includes('gmail')
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        })
      : nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        });
  } else {
    transport = nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
};
export const emailConfigured = () => (env.EMAIL_PROVIDER === 'resend' ? !!env.RESEND_API_KEY : !!env.SMTP_HOST);

async function deliver(msg: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer; cid?: string }[] }) {
  if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return;
  }
  await getTransport().sendMail({ from: env.EMAIL_FROM, ...msg });
}

/** Cron worker: claims due jobs, renders at send time, retries with exponential backoff, logs status. */
export async function processEmailQueue(limit = 10) {
  for (let i = 0; i < limit; i++) {
    const job = await EmailJob.findOneAndUpdate(
      { status: 'queued', nextAttemptAt: { $lte: new Date() } },
      { $set: { status: 'sending' }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, new: true },
    );
    if (!job) return;
    try {
      const msg = await renderEmail(job.template as EmailTemplate, job.bookingId ?? undefined, (job.data ?? {}) as Record<string, any>);
      if (!msg) {
        job.status = 'failed';
        job.lastError = 'Nothing to render';
      } else {
        await deliver({ to: job.to, ...msg });
        job.status = emailConfigured() ? 'sent' : 'logged';
        job.lastError = undefined;
        console.log(`[email] ${job.status} ${job.template} -> ${job.to} (${msg.subject})`);
      }
    } catch (e) {
      job.lastError = (e as Error).message;
      if (job.attempts >= MAX_ATTEMPTS) job.status = 'failed';
      else {
        job.status = 'queued';
        job.nextAttemptAt = new Date(Date.now() + 30_000 * 2 ** (job.attempts - 1));
      }
      console.warn(`[email] attempt ${job.attempts} failed for ${job.template}: ${job.lastError}`);
    }
    await job.save();
  }
}

// ---------- rendering ----------
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmt = (d?: Date | null) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—';

export async function loadBookingBundle(bookingId: string) {
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) return null;
  const [trip, passengers, user, operator] = await Promise.all([
    Trip.findById(booking.tripId).lean(),
    BookingPassenger.find({ bookingId }).lean(),
    User.findById(booking.userId).lean(),
    Operator.findById(booking.operatorId).lean(),
  ]);
  if (!trip) return null;
  const [from, to] = await Promise.all([City.findById(trip.fromCityId).lean(), City.findById(trip.toCityId).lean()]);
  const boarding = trip.boarding.find((b: any) => b.pointId === booking.boardingPointId);
  const dropping = trip.dropping.find((b: any) => b.pointId === booking.droppingPointId);
  return { booking, trip, passengers, user, operator, from, to, boarding, dropping };
}

export const qrPayload = (pnr: string, _bookingId?: string, requestOrigin?: string | null) => {
  const { origin } = publicAppOrigin({ configured: env.PUBLIC_APP_URL, requestOrigin, fallback: env.CLIENT_URL });
  return `${origin}/ticket/verify/${pnr}`;
};

function shell(title: string, body: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#F4F4F8;padding:32px 16px;">
  <div style="max-width:580px;margin:auto;background:#ffffff;border-radius:24px;border:2px solid #000000;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.08);">
    <div style="background:#FF1840;color:#ffffff;padding:22px 28px;border-bottom:2px solid #000000;">
      <div style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;">BusGo <span style="color:#FFF0F3;">South</span></div>
      <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.9);margin-top:2px;">Official Booking &amp; E-Ticket Services</div>
    </div>
    <div style="padding:28px;color:#111827;line-height:1.6;">
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#111827;">${title}</h2>
      ${body}
    </div>
    <div style="padding:18px 28px;background:#FAFAFA;border-top:2px solid #000000;color:#6B7280;font-size:12px;line-height:1.5;">
      <p style="margin:0 0 4px;font-weight:700;color:#111827;">Need help with your journey?</p>
      <p style="margin:0;">Reply directly to this email or track your bus anytime at <a href="${env.CLIENT_URL}" style="color:#FF1840;font-weight:800;text-decoration:none;">BusGo South Web App</a>.</p>
    </div>
  </div>
</div>`;
}

const POLICY_TEXT =
  'Cancelling puts your booking in “Cancellation Pending” until another passenger books your seat. Then you are refunded the ticket price minus the operator’s cancellation fee. If nobody books it before the cutoff, the operator’s fallback policy applies and you are notified of the final decision.';

async function renderEmail(template: EmailTemplate, bookingId: string | undefined, data: Record<string, any>) {
  if (template === 'welcome') {
    return {
      subject: 'Welcome to BusGo South – your account is ready',
      html: shell(`Welcome aboard, ${data.name ?? 'traveller'}!`, `<p>Your BusGo South account has been created with <b>${data.email}</b>.</p>
        <p>Search buses across Tamil Nadu, Bengaluru and Kerala, pick your seat and get your e-ticket by email.</p>
        <p><a href="${env.CLIENT_URL}/home" style="background:#FF1840;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Book your first trip</a></p>
        <p style="font-size:12px;color:#5B6075">If you did not create this account, please reply to this email.</p>`),
    };
  }
  if (template === 'password_reset') {
    return {
      subject: 'Reset your BusGo South password',
      html: shell('Reset your password', `<p>Hi ${data.name ?? 'there'},</p><p>We received a request to reset your password. This link works once and expires in 30 minutes.</p>
        <p><a href="${data.link}" style="background:#FF1840;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Choose a new password</a></p>
        <p style="font-size:12px;color:#5B6075">If you did not ask for this, you can ignore this email. Your password stays the same.</p>`),
    };
  }
  const b = bookingId ? await loadBookingBundle(bookingId) : null;
  if (!b) return null;
  const { booking, trip, passengers, from, to, boarding, dropping, operator } = b;
  const route = `${from?.name} → ${to?.name}`;
  const seats = passengers.map((p) => `<b>${p.name}</b> (${p.age} yrs, ${p.gender}) &nbsp;·&nbsp; Seat <b style="color:#FF1840;">${p.seatLabel}</b>`).join('<br/>');
  const distance =
    booking.distanceKm != null && booking.durationMin != null
      ? `${booking.distanceKm} km · ${Math.floor(booking.durationMin / 60)}h ${booking.durationMin % 60}m ${booking.estimateSource === 'ai' ? '(approximate, AI estimate)' : '(live road estimate)'}`
      : 'Estimate unavailable';
  const track = `${env.CLIENT_URL}/track/${booking._id}`;

  switch (template) {
    case 'booking_confirmation': {
      const qrBuffer = await QRCode.toBuffer(qrPayload(booking.pnr, String(booking._id)), {
        margin: 1,
        width: 200,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      const pdf = await buildTicketPdf(String(booking._id));
      return {
        subject: `🎫 Booking Confirmed – PNR ${booking.pnr} – ${route}`,
        html: shell(
          'Your Ticket Booking is Successful!',
          `<div style="display:inline-block;background:#E6F4EA;border:1px solid #137333;color:#137333;font-size:13px;font-weight:800;padding:6px 14px;border-radius:20px;margin-bottom:16px;">
            ✓ Payment Received · Ticket Confirmed
          </div>

          <div style="border:1px solid #E5E7EB;border-radius:18px;background:#FAFAFA;padding:22px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #E5E7EB;padding-bottom:14px;margin-bottom:16px;">
              <div>
                <div style="font-size:11px;font-weight:800;color:#6B7280;text-transform:uppercase;letter-spacing:0.8px;">PNR NUMBER</div>
                <div style="font-size:24px;font-weight:900;color:#FF1840;letter-spacing:1px;margin-top:2px;">${booking.pnr}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:11px;font-weight:800;color:#6B7280;text-transform:uppercase;">OPERATOR</div>
                <div style="font-size:16px;font-weight:800;color:#111827;margin-top:2px;">${operator?.name ?? 'Express'}</div>
              </div>
            </div>

            <div style="font-size:20px;font-weight:900;color:#111827;margin-bottom:6px;">${route}</div>
            <div style="font-size:13px;color:#4B5563;margin-bottom:14px;">
              <b>Departs:</b> ${fmt(trip.departureTime)} &nbsp;·&nbsp; <b>Arrives:</b> ${fmt(booking.arrivalTime)}
            </div>

            <div style="border-top:1px dashed #D1D5DB;padding-top:14px;margin-bottom:14px;font-size:13px;color:#374151;line-height:1.7;">
              <div><b>Boarding Point:</b> ${boarding?.name ?? '—'} (${fmt(boarding?.time)})</div>
              <div><b>Dropping Point:</b> ${dropping?.name ?? '—'}</div>
              <div><b>Journey Telemetry:</b> ${distance}</div>
            </div>

            <div style="border-top:1px dashed #D1D5DB;padding-top:14px;margin-bottom:16px;">
              <div style="font-size:11px;font-weight:800;color:#6B7280;text-transform:uppercase;margin-bottom:6px;">Passenger Details &amp; Seats</div>
              <div style="font-size:14px;color:#111827;line-height:1.8;">${seats}</div>
            </div>

            <div style="border-top:2px solid #111827;padding-top:14px;display:flex;justify-content:space-between;align-items:center;">
              <div style="font-size:14px;font-weight:800;color:#111827;">Total Amount Paid</div>
              <div style="font-size:22px;font-weight:900;color:#FF1840;">${inr(booking.price?.total ?? 0)} <span style="font-size:11px;color:#6B7280;font-weight:600;">(Incl. GST)</span></div>
            </div>
          </div>

          <div style="text-align:center;margin:24px 0 20px;">
            <div style="font-size:12px;font-weight:800;color:#6B7280;margin-bottom:8px;text-transform:uppercase;">BOARDING PASS QR CODE</div>
            <div style="display:inline-block;padding:8px;background:#ffffff;border:2px solid #111827;border-radius:16px;">
              <img src="cid:boarding_qr" width="180" height="180" alt="QR E-ticket" style="display:block;border-radius:8px;" />
            </div>
            <div style="font-size:11px;color:#6B7280;margin-top:6px;">Present this QR code or your attached PDF to conductor</div>
          </div>

          <div style="text-align:center;margin-bottom:22px;">
            <a href="${env.CLIENT_URL}/booking/${booking._id}" style="display:inline-block;background:#FF1840;color:#ffffff;font-size:15px;font-weight:800;padding:14px 34px;border-radius:14px;text-decoration:none;box-shadow:0 4px 14px rgba(255,24,64,0.35);">
              View E-Ticket &amp; Live Tracking →
            </a>
          </div>

          <div style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:12px;padding:12px 16px;font-size:12px;color:#9F1239;line-height:1.5;margin-bottom:12px;">
            <b>📄 Printable PDF Ticket Attached:</b> Your complete e-ticket with barcode, passenger details and terms is attached to this email.
          </div>
          <div style="font-size:11px;color:#6B7280;line-height:1.4;">
            <b>Cancellation Policy:</b> ${POLICY_TEXT}
          </div>`,
        ),
        attachments: [
          { filename: `ticket-${booking.pnr}.pdf`, content: pdf },
          { filename: `boarding-qr.png`, content: qrBuffer, cid: 'boarding_qr' },
        ],
      };
    }
    case 'payment_failed':
      return {
        subject: `Payment failed for ${route}`,
        html: shell('Payment was not completed', `<p>We could not confirm your payment for <b>${route}</b>. ${data.reason ? `Reason: ${data.reason}.` : ''} Your seats are held only for a few minutes – please try again from the app.</p>`),
      };
    case 'cancellation_pending':
      return {
        subject: `Cancellation requested – PNR ${booking.pnr}`,
        html: shell(
          'Cancellation pending',
          `<p>We received your request for <b>${route}</b> (PNR ${booking.pnr}). Your seat has <b>not</b> been released yet — we are awaiting a replacement booking.</p>
          <p>If a replacement books: ticket ${inr(data.ticketAmount)} − fee ${inr(data.fee)} = <b>refund ${inr(data.refundAmount)}</b>.</p>
          <p>Decision deadline: ${fmt(data.cutoffAt)}. After that the operator’s fallback policy (${data.fallbackPolicy === 'reject' ? 'cancellation rejected' : 'standard terms'}) applies.</p>`,
        ),
      };
    case 'cancellation_completed':
      return {
        subject: `Booking cancelled – refund started – PNR ${booking.pnr}`,
        html: shell(
          'Cancellation completed',
          `<p>Your seat on <b>${route}</b> was taken by another passenger, so your booking is cancelled.</p>
          <p>Ticket ${inr(data.ticketAmount)} − deduction ${inr(data.deduction)} = <b>refund ${inr(data.refundAmount)}</b>.</p>
          <p>Refund status: <b>Processing</b>. We will email you again when it completes.</p>`,
        ),
      };
    case 'cancellation_final':
      return {
        subject: `Final decision on your cancellation – PNR ${booking.pnr}`,
        html: shell(
          'Cancellation decision',
          data.outcome === 'rejected'
            ? `<p>No replacement passenger booked your seat before the cutoff, and the operator’s policy is to <b>reject</b> the cancellation. Your booking for <b>${route}</b> stays <b>confirmed</b> and no refund is due.</p>`
            : `<p>No replacement passenger booked your seat before the cutoff, so the operator’s standard terms were applied to <b>${route}</b>.</p>
              <p>Ticket ${inr(data.ticketAmount)} − deduction ${inr(data.deduction)} = <b>refund ${inr(data.refundAmount)}</b>${data.refundAmount > 0 ? ' (processing)' : ''}.</p>`,
        ),
      };
    case 'refund_completed': {
      const r = data.refundId ? await Refund.findById(data.refundId).lean() : null;
      return {
        subject: `Refund completed – PNR ${booking.pnr}`,
        html: shell('Your refund is complete', `<p>${inr(r?.amount ?? data.refundAmount ?? 0)} has been refunded for <b>${route}</b> (PNR ${booking.pnr}). Reference: ${r?.reference ?? '—'}.</p>`),
      };
    }
    case 'departure_reminder':
      return {
        subject: `Reminder: ${route} departs at ${fmt(boarding?.time ?? trip.departureTime)}`,
        html: shell('Your bus leaves soon', `<p>Board at <b>${boarding?.name}</b> (${boarding?.landmark ?? ''}) by ${fmt(boarding?.time ?? trip.departureTime)}.</p><p>PNR ${booking.pnr} · ${seats}</p><p><a href="${track}">Track my bus</a></p>`),
      };
  }
}

// ---------- PDF ticket ----------
export async function buildTicketPdf(bookingId: string): Promise<Buffer> {
  const b = await loadBookingBundle(bookingId);
  if (!b) throw new Error('Booking not found');
  const { booking, trip, passengers, from, to, boarding, dropping, operator } = b;
  const qr = await QRCode.toBuffer(qrPayload(booking.pnr, String(booking._id)), { margin: 1, width: 200 });
  const doc = new PDFDocument({ size: 'A5', margin: 36 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
  doc.rect(0, 0, doc.page.width, 56).fill('#FF1840');
  doc.fillColor('#fff').fontSize(20).text('BusGo South – E-Ticket', 36, 18);
  doc.fillColor('#000').fontSize(12).moveDown(2.5);
  doc.fontSize(16).text(`${from?.name} to ${to?.name}`).fontSize(11).moveDown(0.4);
  doc.text(`PNR: ${booking.pnr}`).text(`Operator: ${operator?.name}`);
  doc.text(`Departure: ${fmt(trip.departureTime)}`).text(`Arrival: ${fmt(booking.arrivalTime)}`);
  doc.text(booking.distanceKm != null ? `Distance: ${booking.estimateSource === 'ai' ? '~' : ''}${booking.distanceKm} km · ${Math.floor((booking.durationMin ?? 0) / 60)}h ${(booking.durationMin ?? 0) % 60}m${booking.estimateSource === 'ai' ? ' (approx.)' : ''}` : 'Distance: estimate unavailable');
  doc.text(`Boarding: ${boarding?.name ?? '-'} (${fmt(boarding?.time)})`).text(`Dropping: ${dropping?.name ?? '-'}`).moveDown(0.6);
  doc.fontSize(12).text('Passengers', { underline: true }).fontSize(11);
  for (const p of passengers) doc.text(`${p.name}, ${p.age}, ${p.gender} - Seat ${p.seatLabel}`);
  doc.moveDown(0.6).text(`Fare ${inr(booking.price!.base!)}  GST ${inr(booking.price!.gst!)}  Total ${inr(booking.price!.total!)}`);
  doc.image(qr, doc.page.width - 36 - 110, 90, { width: 110 });
  doc.moveDown().fontSize(8).fillColor('#555').text(POLICY_TEXT, { width: doc.page.width - 72 });
  doc.end();
  return done;
}
