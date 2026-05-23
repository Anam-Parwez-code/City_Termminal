require('dotenv').config();
const OpenAI = require('openai');

const PICKUP_LOCATIONS = [
  { id: 'mall_of_emirates', name: 'Mall of the Emirates', area: 'Al Barsha', terminalFit: ['T1', 'T3'], travelMinutes: { T1: 24, T2: 34, T3: 25, DWC: 38 } },
  { id: 'downtown_dubai', name: 'Downtown Dubai', area: 'Downtown', terminalFit: ['T1', 'T3'], travelMinutes: { T1: 18, T2: 24, T3: 20, DWC: 46 } },
  { id: 'dubai_marina', name: 'Dubai Marina / JBR', area: 'Marina', terminalFit: ['DWC'], travelMinutes: { T1: 32, T2: 42, T3: 34, DWC: 28 } },
  { id: 'city_walk', name: 'City Walk', area: 'Jumeirah', terminalFit: ['T1', 'T3'], travelMinutes: { T1: 17, T2: 25, T3: 19, DWC: 48 } },
  { id: 'deira_city_centre', name: 'Deira City Centre', area: 'Deira', terminalFit: ['T1', 'T2', 'T3'], travelMinutes: { T1: 9, T2: 12, T3: 11, DWC: 55 } },
];

const terminalCode = (value = '') => {
  const text = String(value).toUpperCase();
  if (text.includes('DWC') || text.includes('MAKTOUM')) return 'DWC';
  if (text.includes('T2') || text.includes('TERMINAL 2')) return 'T2';
  if (text.includes('T3') || text.includes('TERMINAL 3')) return 'T3';
  return 'T1';
};

const getHour = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.getHours();
  const match = String(value).match(/\b(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) : null;
};

const isPeakHour = (value) => {
  const hour = getHour(value);
  return hour != null && ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19));
};

const parseJsonObject = (text) => {
  const json = String(text || '').match(/\{[\s\S]*\}/)?.[0];
  return json ? JSON.parse(json) : null;
};

const getAiClient = (language) => {
  const isArabic = String(language || '').toLowerCase().startsWith('ar');
  const apiKey = isArabic ? process.env.JAIS_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: isArabic && process.env.JAIS_BASE_URL ? process.env.JAIS_BASE_URL : undefined,
  });
};

const getModel = (language) =>
  String(language || '').toLowerCase().startsWith('ar')
    ? (process.env.JAIS_MODEL || 'jais-30b-chat')
    : (process.env.OPENAI_RECOMMENDER_MODEL || 'gpt-4o');

const fallbackPickup = ({ flightTime, destinationTerminal }) => {
  const code = terminalCode(destinationTerminal);
  const peak = isPeakHour(flightTime);
  return PICKUP_LOCATIONS
    .map((location) => {
      const minutes = location.travelMinutes[code] || 35;
      const score = 100 - minutes - (peak && !location.terminalFit.includes(code) ? 10 : 0);
      return {
        locationId: location.id,
        score,
        reason_en: `${minutes} min to ${code}${peak ? ', peak traffic buffer considered' : ', smooth timing expected'}`,
        reason_ar: `${minutes} دقيقة إلى ${code}${peak ? '، تم احتساب ازدحام الذروة' : '، التوقيت مناسب'}`,
        traffic_warning: peak ? 'Peak traffic window in Dubai' : null,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
};

const fallbackSlot = ({ slots = [], flightTime, terminal, pickupLocation, travelTime }) => {
  const flight = new Date(flightTime);
  const travelMinutes = Number(travelTime) || 35;
  const peakBuffer = isPeakHour(flightTime) ? Math.ceil(travelMinutes * 0.2) : 0;
  const bufferMinutes = 180 + travelMinutes + peakBuffer;
  const ideal = Number.isNaN(flight.getTime())
    ? null
    : new Date(flight.getTime() - bufferMinutes * 60 * 1000);

  const available = slots.filter((slot) => {
    const capacity = Number(slot.total_capacity ?? slot.totalCapacity ?? 0);
    const booked = Number(slot.booked_count ?? slot.bookedCount ?? 0);
    return (slot.available ?? (capacity - booked)) > 0;
  });

  const scored = available
    .map((slot) => {
      const slotDate = new Date(slot.slot_time || slot.time);
      return {
        slot,
        diff: ideal && !Number.isNaN(slotDate.getTime()) ? Math.abs(slotDate.getTime() - ideal.getTime()) : 0,
      };
    })
    .sort((a, b) => a.diff - b.diff);

  const best = scored[0]?.slot || available[0] || slots[0] || {};
  const idealPickupTime = ideal
    ? ideal.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })
    : null;

  return {
    recommendedSlotId: best.id ?? null,
    reason_en: `Best match for ${pickupLocation || 'your pickup'} to ${terminal || 'the terminal'} with ${Math.round(bufferMinutes / 60 * 10) / 10}hr total buffer.`,
    reason_ar: `أفضل وقت مناسب من ${pickupLocation || 'موقع الاستلام'} إلى ${terminal || 'المبنى'} مع هامش إجمالي ${Math.round(bufferMinutes / 60 * 10) / 10} ساعة.`,
    idealPickupTime,
    bufferMinutes,
  };
};

const recommendPickup = async (req, res) => {
  const { flightTime, destinationTerminal, flightNumber, language } = req.body || {};
  try {
    const client = getAiClient(language);
    if (!client) {
      return res.json({ success: true, recommended: fallbackPickup(req.body || {}), fallback: true });
    }

    const prompt = `
You are an AI assistant for City Terminal Dubai airport service.
A passenger has flight ${flightNumber || 'unknown'} departing at ${flightTime || 'unknown'} from ${destinationTerminal || 'DXB'}.
Available pickup locations: ${JSON.stringify(PICKUP_LOCATIONS)}
Dubai traffic context: Sheikh Zayed Road peaks 7-9am and 5-7pm.
Al Khail Road is faster to Terminal 3. JBR is best for Marina hotels.

Recommend the TOP 2 best pickup locations for this passenger.
Consider: travel time to terminal, traffic at departure time, convenience.

Return ONLY valid JSON:
{"recommendations":[{"locationId":"mall_of_emirates","score":95,"reason_en":"25 min to DXB T3, no peak traffic at 14:00","reason_ar":"25 دقيقة إلى المبنى 3، لا ازدحام في الساعة 14:00","traffic_warning":null}]}
`;

    const completion = await client.chat.completions.create({
      model: getModel(language),
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
    return res.json({
      success: true,
      recommended: parsed?.recommendations || fallbackPickup(req.body || {}),
      poweredBy: String(language || '').startsWith('ar') ? 'JAIS LLM' : 'GPT-4o',
    });
  } catch (error) {
    console.warn('AI pickup recommendation failed:', error.message);
    return res.json({ success: true, recommended: null });
  }
};

const recommendSlot = async (req, res) => {
  const { flightNumber, flightTime, terminal, pickupLocation, travelTime, slots, language } = req.body || {};
  try {
    const client = getAiClient(language);
    if (!client) {
      return res.json({ success: true, recommendation: fallbackSlot(req.body || {}), fallback: true });
    }

    const prompt = `
You are a smart scheduler for City Terminal Dubai.
Passenger flight: ${flightNumber || 'unknown'} at ${flightTime || 'unknown'} from ${terminal || 'DXB'}.
Pickup location: ${pickupLocation || 'unknown'} - approximately ${travelTime || 35} minutes to ${terminal || 'terminal'}.
Dubai traffic rules: Add 20% buffer during peak hours (7-9am, 5-7pm).
Airport rule: Arrive minimum 3 hours before international flight.

Available slots: ${JSON.stringify((slots || []).map((s) => ({ id: s.id, time: s.slot_time, available: (s.total_capacity || 0) - (s.booked_count || 0) })))}

Calculate: flight_time - 3hr_buffer - travel_time - traffic_buffer = ideal_pickup_time
Choose the slot CLOSEST to ideal_pickup_time that has seats available.

Return ONLY valid JSON:
{"recommendedSlotId":3,"reason_en":"14:00 slot gives you 3.5hr buffer - perfect for FZ215 at 18:00","reason_ar":"فترة 14:00 تمنحك هامشاً 3.5 ساعة - مثالي لرحلة FZ215 الساعة 18:00","idealPickupTime":"14:00","bufferMinutes":210}
`;

    const completion = await client.chat.completions.create({
      model: getModel(language),
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });
    const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
    return res.json({
      success: true,
      recommendation: parsed || fallbackSlot(req.body || {}),
      poweredBy: String(language || '').startsWith('ar') ? 'JAIS LLM' : 'GPT-4o',
    });
  } catch (error) {
    console.warn('AI slot recommendation failed:', error.message);
    return res.json({ success: true, recommendation: null });
  }
};

module.exports = { recommendPickup, recommendSlot };
