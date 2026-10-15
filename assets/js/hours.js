// Business hours: a weekly schedule in the business's own time zone.
//   site.hours = { enabled, timezone: 'America/New_York', note: '',
//                  week: { mon: '08:00-18:00', …, sat: '09:00-13:00', sun: '' } }
// An empty day is closed. The contact section, the footer, the hours element
// and Google's business details use it; the live site adds “Open now”.

export const DAYS = [['mon', 'Monday', 'Mon'], ['tue', 'Tuesday', 'Tue'], ['wed', 'Wednesday', 'Wed'],
  ['thu', 'Thursday', 'Thu'], ['fri', 'Friday', 'Fri'], ['sat', 'Saturday', 'Sat'], ['sun', 'Sunday', 'Sun']];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// [openMinute, closeMinute] for 'HH:MM-HH:MM', or null when closed or not valid.
// Closing at 00:00 means open until midnight.
export function parseRange(v) {
  const m = String(v || '').trim().match(/^(\d\d:\d\d)\s*-\s*(\d\d:\d\d)$/);
  if (!m || !TIME.test(m[1]) || !TIME.test(m[2])) return null;
  const open = toMin(m[1]);
  const close = toMin(m[2]) || 1440;
  return close > open ? [open, close] : null;
}

export const hasHours = (hours) => !!hours?.enabled && DAYS.some(([k]) => parseRange(hours.week?.[k]));

// 480 → '8am', 810 → '1:30pm', 1440 → 'midnight'
export function fmtTime(min) {
  if (min % 1440 === 0) return min ? 'midnight' : '12am';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

const fmtRange = (r) => (r ? `${fmtTime(r[0])}–${fmtTime(r[1])}` : 'Closed');

// Consecutive days with the same hours: [{ days: [index…], range }]
function groups(hours) {
  const out = [];
  DAYS.forEach(([k], i) => {
    const range = parseRange(hours.week?.[k]);
    const last = out[out.length - 1];
    if (last && String(last.range) === String(range)) last.days.push(i);
    else out.push({ days: [i], range });
  });
  return out;
}

// 'Mon–Fri 8am–6pm · Sat 9am–1pm · Sun closed'
export function hoursSummary(hours) {
  if (!hasHours(hours)) return '';
  return groups(hours).map(({ days, range }) => {
    const first = DAYS[days[0]][2];
    const label = days.length === 1 ? first : `${first}–${DAYS[days[days.length - 1]][2]}`;
    return `${label} ${range ? fmtRange(range) : 'closed'}`;
  }).join(' · ');
}

// The weekday (0 = Monday) and minute of the day where the business is.
export function localNow(timezone, now = new Date()) {
  const read = (timeZone) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return { day: DAYS.findIndex((d) => d[2] === get('weekday')), min: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
  };
  try { return read(timezone || undefined); } catch { return read(undefined); }
}

// { open, text }, e.g. { open: true, text: 'Open now · until 6pm' } or
// { open: false, text: 'Closed · opens tomorrow 8am' }; null without hours.
export function openStatus(hours, now = new Date()) {
  if (!hasHours(hours)) return null;
  const { day, min } = localNow(hours.timezone, now);
  const range = (i) => parseRange(hours.week?.[DAYS[(i + 7) % 7][0]]);
  const today = range(day);
  if (today && min >= today[0] && min < today[1]) return { open: true, text: `Open now · until ${fmtTime(today[1])}` };
  if (today && min < today[0]) return { open: false, text: `Closed · opens ${fmtTime(today[0])}` };
  for (let i = 1; i <= 7; i++) {
    const r = range(day + i);
    if (r) return { open: false, text: `Closed · opens ${i === 1 ? 'tomorrow' : DAYS[(day + i) % 7][2]} ${fmtTime(r[0])}` };
  }
  return { open: false, text: 'Closed' };
}

// What the live site needs to work out “Open now” in the browser.
export const statusData = (hours) => JSON.stringify({ enabled: true, timezone: hours.timezone || '', week: hours.week || {} });

// The “Open now” badge. The live site fills it in the visitor's browser (pages
// are built once, the time keeps moving); the editor shows the status right away.
export function openBadge(hours, esc, edit = false) {
  const st = edit ? openStatus(hours) : null;
  return `<span class="open-status${st ? (st.open ? ' is-open' : ' is-closed') : ''}" data-open-status data-hours="${esc(statusData(hours))}">${st ? esc(st.text) : ''}</span>`;
}

// schema.org openingHoursSpecification, one entry per group of days with the same hours.
export function openingHoursLd(hours) {
  if (!hasHours(hours)) return [];
  const byRange = new Map();
  DAYS.forEach(([k, full]) => {
    const r = parseRange(hours.week?.[k]);
    if (!r) return;
    const key = String(r);
    if (!byRange.has(key)) byRange.set(key, { r, days: [] });
    byRange.get(key).days.push(full);
  });
  const hhmm = (m) => (m === 1440 ? '23:59' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return [...byRange.values()].map(({ r, days }) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens: hhmm(r[0]), closes: hhmm(r[1]) }));
}

// The week as a list. The live site marks today's row.
export function hoursTable(hours, esc) {
  return `<dl class="hours"${hours.timezone ? ` data-tz="${esc(hours.timezone)}"` : ''}>${DAYS.map(([k, full]) =>
    `<div class="hours__row" data-day="${k}"><dt>${full}</dt><dd>${fmtRange(parseRange(hours.week?.[k]))}</dd></div>`).join('')}</dl>`;
}

// Things in the schedule worth fixing: [{ day, message }]
export function hoursProblems(hours) {
  if (!hours?.enabled) return [];
  const out = DAYS.filter(([k]) => String(hours.week?.[k] || '').trim() && !parseRange(hours.week[k]))
    .map(([k, full]) => ({ day: k, message: `The business hours for ${full} don’t make sense: the closing time must be after the opening time.` }));
  if (!out.length && !hasHours(hours)) out.push({ day: '', message: 'Business hours are turned on but every day is closed.' });
  return out;
}
