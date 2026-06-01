require('dotenv').config();
const Tesseract = require('tesseract.js');
const OpenAI = require('openai');
const pool = require('../config/db');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
});

const emptyPassport = () => ({
  name: null,
  passportNumber: null,
  dateOfBirth: null,
  nationality: null,
  expiryDate: null,
  gender: null,
  confidence: 0,
});

const normalizeBase64 = (imageBase64) => {
  if (!imageBase64) return '';
  if (imageBase64.startsWith('data:') && imageBase64.includes(',')) {
    return imageBase64.split(',')[1];
  }
  return imageBase64;
};

const scanPassport = async (req, res) => {
  try {
    const { imageBase64, bookingId } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        message: 'Passport image is required (imageBase64)',
      });
    }

    const method = process.env.PASSPORT_SCAN_METHOD || 'auto';
    let extractedData;

    if ((method === 'openai' || method === 'auto') && process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy-key') {
      try {
        extractedData = await scanWithOpenAI(imageBase64);
      } catch (openAiError) {
        console.warn('OpenAI passport scan failed, falling back to OCR:', openAiError.message);
      }
    }

    if (!hasRequiredPassportData(extractedData)) {
      extractedData = await scanWithTesseract(imageBase64);
    }

    const normalized = normalizePassportPayload(extractedData);

    if (!hasMinimumPassportData(normalized)) {
      return res.status(422).json({
        success: false,
        message: 'Could not read passport number clearly. Retake with MRZ lines at the bottom visible.',
        data: normalized,
      });
    }

    normalized.needsReview = !hasRequiredPassportData(normalized);
    let nameMismatch = false;

    if (bookingId && pool.isDbReachable && pool.isDbReachable()) {
      try {
        const booking = await pool.query(
          `SELECT passenger_name, passport_number, date_of_birth
           FROM bookings
           WHERE UPPER(booking_id) = UPPER($1)
           LIMIT 1`,
          [bookingId]
        );

        if (booking.rows.length > 0) {
          const row = booking.rows[0];
          if (row.passenger_name && normalized.name && !namesMatch(normalized.name, row.passenger_name)) {
            nameMismatch = true;
            normalized.needsReview = true;
          }
          if (
            row.passport_number &&
            normalized.passportNumber &&
            normalizeToken(row.passport_number) !== normalizeToken(normalized.passportNumber)
          ) {
            nameMismatch = true;
            normalized.needsReview = true;
          }
        }
      } catch (dbErr) {
        console.warn('Booking lookup skipped for passport scan:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: normalized,
      method,
      nameMismatch,
    });
  } catch (error) {
    console.error('Passport scan error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Passport scanning failed. Please retake photo with the MRZ lines clearly visible.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

const normalizeToken = (value) =>
  String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalizeName = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const namesMatch = (passportName, bookingName) => {
  const pass = normalizeName(passportName);
  const book = normalizeName(bookingName);
  if (!pass || !book) return false;
  if (pass === book) return true;
  const passParts = pass.split(' ').filter((part) => part.length > 1);
  const bookParts = book.split(' ').filter((part) => part.length > 1);
  if (passParts.length === 0 || bookParts.length === 0) return false;
  const matches = bookParts.filter((part) => passParts.includes(part)).length;
  return matches >= Math.min(2, bookParts.length);
};

const scanWithTesseract = async (imageBase64) => {
  const imageBuffer = Buffer.from(normalizeBase64(imageBase64), 'base64');
  const texts = [];

  for (const psm of ['6', '11', '3']) {
    try {
      const { data } = await Tesseract.recognize(imageBuffer, 'eng', {
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789< -/.,',
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: psm,
      });
      if (data?.text) texts.push(data.text);
    } catch (ocrErr) {
      console.warn(`Tesseract PSM ${psm} failed:`, ocrErr.message);
    }
  }

  const rawText = texts.join('\n');
  if (process.env.NODE_ENV === 'development') {
    console.log('Raw OCR text (first 400 chars):', rawText.slice(0, 400));
  }

  const mrz = parseMRZ(rawText);
  const visual = parseVisualText(rawText);
  const merged = {
    ...visual,
    ...Object.fromEntries(
      Object.entries(mrz).filter(([, value]) => value !== null && value !== undefined && value !== '')
    ),
    confidence: hasRequiredPassportData(mrz) ? 0.9 : hasMinimumPassportData(mrz) ? 0.75 : 0.55,
  };
  return merged;
};

const scanWithOpenAI = async (imageBase64) => {
  const response = await openai.chat.completions.create({
    model: process.env.PASSPORT_VISION_MODEL || 'gpt-4o',
    temperature: 0,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            'Extract passport data from the image.',
            'Read both the visual inspection zone and the MRZ at the bottom.',
            'Return ONLY strict JSON with keys:',
            '{"name":null,"passportNumber":null,"dateOfBirth":null,"nationality":null,"expiryDate":null,"gender":null,"confidence":0}',
            'Use YYYY-MM-DD for dates. Use null for unclear fields. Do not guess.',
          ].join(' '),
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${normalizeBase64(imageBase64)}`,
            detail: 'high',
          },
        },
      ],
    }],
  });

  const text = response.choices[0].message.content || '{}';
  const json = text.match(/\{[\s\S]*\}/)?.[0] || '{}';
  return JSON.parse(json);
};

const repairMrzLine = (line) =>
  String(line || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[«‹＜]/g, '<')
    .replace(/[^A-Z0-9<]/g, '');

const mrzDate = (value, type = 'birth') => {
  const s = String(value || '').replace(/[OQD]/g, '0').replace(/[IL]/g, '1');
  if (!/^\d{6}$/.test(s)) return null;

  const yy = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const currentYY = new Date().getFullYear() % 100;
  let yyyy;
  if (type === 'expiry') {
    yyyy = yy < currentYY - 5 ? 2100 + yy : 2000 + yy;
  } else {
    yyyy = yy <= currentYY ? 2000 + yy : 1900 + yy;
  }

  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
};

const parseMRZ = (rawText) => {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(repairMrzLine)
    .filter((line) => line.length >= 20 && line.includes('<'));

  const candidates = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    const first = lines[i];
    const second = lines[i + 1];
    const looksLikeNameLine = first.includes('<<') && /[A-Z]{3,}/.test(first.replace(/</g, ''));
    const looksLikeDataLine = /^[A-Z0-9<]{6,}/.test(second) && /\d{6}/.test(second);
    if (((first.startsWith('P<') || first.startsWith('P')) || looksLikeNameLine) && second.length >= 28 && looksLikeDataLine) {
      const normalizedFirst = first.startsWith('P') ? first : `P<${first}`;
      candidates.push([normalizedFirst.padEnd(44, '<').slice(0, 44), second.padEnd(44, '<').slice(0, 44)]);
    }
  }

  if (candidates.length === 0) return emptyPassport();

  const [line1, line2] = candidates[candidates.length - 1];
  const namePart = line1.slice(5);
  const [surnameRaw = '', givenRaw = ''] = namePart.split('<<');
  const surname = surnameRaw.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const givenName = givenRaw.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const fullName = `${givenName} ${surname}`.replace(/\s+/g, ' ').trim() || surname || null;
  const genderChar = line2.charAt(20);

  return {
    name: titleCase(fullName),
    passportNumber: line2.slice(0, 9).replace(/</g, '').replace(/[O]/g, '0') || null,
    nationality: line2.slice(10, 13).replace(/</g, '') || line1.slice(2, 5).replace(/</g, '') || null,
    dateOfBirth: mrzDate(line2.slice(13, 19), 'birth'),
    expiryDate: mrzDate(line2.slice(21, 27), 'expiry'),
    gender: genderChar === 'M' || genderChar === 'F' ? genderChar : null,
    confidence: 0.9,
  };
};

const titleCase = (value) => {
  if (!value) return null;
  return String(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
};

const parseDateToken = (value) => {
  const text = String(value || '').toUpperCase();
  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };

  let m = text.match(/\b(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s/-]*(\d{2,4})\b/);
  if (m) {
    const yyyy = m[3].length === 4 ? Number(m[3]) : (Number(m[3]) <= 30 ? 2000 + Number(m[3]) : 1900 + Number(m[3]));
    return `${yyyy}-${monthMap[m[2]]}-${String(m[1]).padStart(2, '0')}`;
  }

  m = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;

  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const yyyy = m[3].length === 4 ? Number(m[3]) : (Number(m[3]) <= 30 ? 2000 + Number(m[3]) : 1900 + Number(m[3]));
    return `${yyyy}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }

  return null;
};

const parseVisualText = (rawText) => {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const upper = text.toUpperCase();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const dateMatches = [...upper.matchAll(/\b(?:\d{1,2}\s*(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s/-]*\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g)];
  const dates = dateMatches.map((match) => parseDateToken(match[0])).filter(Boolean);
  const passportMatch =
    upper.match(/\b[A-Z][0-9]{7,8}\b/) ||
    upper.match(/\b[A-Z]{2}[0-9]{6,7}\b/) ||
    upper.match(/\b[0-9]{8,9}\b/);
  const nationalityMatch = upper.match(/\b(INDIAN|INDIA|BRITISH|UNITED KINGDOM|AMERICAN|USA|PAKISTANI|PAKISTAN|PHILIPPINES|FILIPINO|EMIRATI|UAE|NEPALI|BANGLADESHI|SRI LANKAN|EGYPTIAN|JORDANIAN|SAUDI)\b/);

  let guessedName = null;
  for (const line of lines) {
    const normalized = line.replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized.length < 5 || normalized.length > 45) continue;
    if (/passport|nationality|date|birth|expiry|authority|republic|surname|given|sex|place/i.test(normalized)) continue;
    const words = normalized.split(' ');
    if (words.length >= 2 && words.every((word) => word.length > 1)) {
      guessedName = titleCase(normalized);
      break;
    }
  }

  return {
    name: guessedName,
    passportNumber: passportMatch ? passportMatch[0] : null,
    dateOfBirth: dates[0] || null,
    nationality: nationalityMatch ? titleCase(nationalityMatch[0]) : null,
    expiryDate: dates.length > 1 ? dates[dates.length - 1] : null,
    gender: /\bF\b/.test(upper) ? 'F' : /\bM\b/.test(upper) ? 'M' : null,
    confidence: 0.55,
  };
};

const hasRequiredPassportData = (data) => {
  if (!data) return false;
  return Boolean(data.name && data.passportNumber && data.dateOfBirth && data.nationality);
};

const hasMinimumPassportData = (data) => {
  if (!data) return false;
  const passNo = String(data.passportNumber || '').replace(/\s/g, '');
  return (
    passNo.length >= 6 &&
    Boolean(String(data.name || '').trim() || String(data.dateOfBirth || '').trim())
  );
};

const normalizePassportPayload = (data) => {
  const merged = { ...emptyPassport(), ...(data || {}) };
  return {
    ...merged,
    name: merged.name || null,
    passportNumber: merged.passportNumber || null,
    dateOfBirth: merged.dateOfBirth || null,
    nationality: merged.nationality || null,
    expiryDate: merged.expiryDate || null,
    gender: merged.gender || null,
    confidence: Number(merged.confidence || 0),
  };
};

module.exports = { scanPassport };
