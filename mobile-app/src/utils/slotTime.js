const DUBAI_TZ = 'Asia/Dubai';

const pick = (...values) =>
  values.find((v) => v != null && String(v).trim() !== '' && String(v).trim() !== '--');

/** Best ISO/raw slot time from navigation params */
export function getPickupTimeFromParams(params = {}) {
  const raw = pick(
    params.pickupTimeIso,
    params.slotDetails?.slotTime,
    params.confirmation?.slotTime,
    params.confirmation?.slot_time,
    params.statusData?.slotTime,
    params.statusData?.slot_time,
    params.statusData?.pickupTime,
    params.statusData?.pickup_time,
  );
  if (raw) return raw;
  const label = params.selectedTimeSlot;
  if (label && /^\d{4}-\d{2}-\d{2}/.test(String(label))) return label;
  return null;
}

/** Human-readable pickup time (Dubai) — handles ISO, "14:30", or pre-formatted "2:30 PM" */
export function formatPickupTime(value) {
  if (value == null || value === '') return '--';
  const s = String(value).trim();
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)) return s;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const [h, m, sec] = s.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, sec || 0, 0);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: DUBAI_TZ,
    });
  }
  let d = new Date(s);
  if (Number.isNaN(d.getTime()) && s.includes(' ')) {
    d = new Date(s.replace(' ', 'T'));
  }
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: DUBAI_TZ,
    });
  }
  return s;
}

export function formatPickupDate(value) {
  if (value == null || value === '') return '--';
  const s = String(value).trim();
  let d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: DUBAI_TZ,
  });
}
