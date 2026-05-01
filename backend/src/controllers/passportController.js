// ============================================================
// FILE: backend/src/controllers/passportController.js
// FINAL FIXED VERSION
// ============================================================
// BUGS FIXED:
// Field name 'image' → 'imageBase64' fix kiya
// Mobile app aur backend ka field name match kiya
// ============================================================

require('dotenv').config();
const Tesseract = require('tesseract.js');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
});

// ============================================================
// MAIN FUNCTION
// POST /api/passport/scan
// ============================================================
const scanPassport = async (req, res) => {
  try {
    // ── REQUEST DATA ─────────────────────────────────────
    // FIXED: 'imageBase64' — mobile app yahi field bhejti hai
    const { imageBase64, bookingId } = req.body;

    // ── VALIDATE ─────────────────────────────────────────
    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        message: 'Passport image is required (imageBase64)',
      });
    }

    // ── METHOD SELECT ─────────────────────────────────────
    const method = process.env.PASSPORT_SCAN_METHOD || 'tesseract';
    console.log(`📸 Passport scan method: ${method}`);

    // ── SCAN ─────────────────────────────────────────────
    let extractedData;

    if (method === 'openai') {
      extractedData = await scanWithOpenAI(imageBase64);
    } else if (method === 'tesseract') {
      extractedData = await scanWithTesseract(imageBase64);
    } else {
      // default: mock — testing ke liye
      extractedData = getMockData();
    }

    // ── RESPONSE ─────────────────────────────────────────
    return res.status(200).json({
      success: true,
      data: extractedData,
      method: method,
    });

  } catch (error) {
    console.error('❌ Passport scan error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Passport scanning failed. Please retake photo.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ── TESSERACT ────────────────────────────────────────────
const scanWithTesseract = async (imageBase64) => {
  console.log('🔍 Tesseract OCR starting...');
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const p = Math.round(m.progress * 100);
        if (p % 25 === 0) console.log(`OCR: ${p}%`);
      }
    },
  });
  console.log('Raw OCR text:', text);
  const mrzParsed = parseMRZ(text);
  if (hasAnyPassportData(mrzParsed)) {
    return mrzParsed;
  }
  return parseVisualText(text);
};

// ── OPENAI ───────────────────────────────────────────────
const scanWithOpenAI = async (imageBase64) => {
  console.log('🤖 OpenAI Vision starting...');
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy-key') {
    throw new Error('OPENAI_API_KEY not set in .env');
  }
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract passport data. Return ONLY JSON: {"name":"","passportNumber":"","dateOfBirth":"YYYY-MM-DD","nationality":"","expiryDate":"YYYY-MM-DD","gender":"M/F"}. Use null for unclear fields.',
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
            detail: 'high',
          },
        },
      ],
    }],
  });
  const text = response.choices[0].message.content
    .replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(text);
};

// ── MRZ PARSER ───────────────────────────────────────────
const parseMRZ = (rawText) => {
  try {
    const lines = rawText
      .split('\n')
      .map(l => l.trim().replace(/\s+/g, ''))
      .filter(l => l.length >= 30 && /^[A-Z0-9<]+$/.test(l));

    console.log('MRZ lines:', lines);

    if (lines.length >= 2) {
      const line1 = lines[lines.length - 2];
      const line2 = lines[lines.length - 1];

      const namePart = line1.substring(5);
      const doubleAngle = namePart.indexOf('<<');
      let surname = '', givenName = '';

      if (doubleAngle !== -1) {
        surname = namePart.substring(0, doubleAngle).replace(/</g, ' ').trim();
        givenName = namePart.substring(doubleAngle + 2).replace(/</g, ' ').trim();
      } else {
        surname = namePart.replace(/</g, ' ').trim();
      }

      const fullName = `${givenName} ${surname}`.trim();

      const convertDate = (s) => {
        if (!s || s.length !== 6) return null;
        const yy = parseInt(s.substring(0, 2));
        const mm = s.substring(2, 4);
        const dd = s.substring(4, 6);
        const yyyy = yy <= 30 ? `20${s.substring(0, 2)}` : `19${s.substring(0, 2)}`;
        return `${yyyy}-${mm}-${dd}`;
      };

      const genderChar = line2.charAt(20);

      return {
        name: fullName || null,
        passportNumber: line2.substring(0, 9).replace(/</g, '') || null,
        dateOfBirth: convertDate(line2.substring(13, 19)),
        nationality: line2.substring(10, 13).replace(/</g, '') || null,
        expiryDate: convertDate(line2.substring(21, 27)),
        gender: genderChar === 'M' ? 'M' : genderChar === 'F' ? 'F' : null,
      };
    }

    console.log('⚠️ No MRZ found');
    return { name: null, passportNumber: null, dateOfBirth: null, nationality: null, expiryDate: null, gender: null };

  } catch (e) {
    console.error('MRZ parse error:', e);
    return { name: null, passportNumber: null, dateOfBirth: null, nationality: null, expiryDate: null, gender: null };
  }
};

const hasAnyPassportData = (data) => {
  if (!data) return false;
  return Boolean(data.name || data.passportNumber || data.dateOfBirth || data.nationality || data.expiryDate);
};

const toIsoDateFromDmy = (day, monthStr, year2) => {
  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const mm = monthMap[String(monthStr || '').toUpperCase()];
  if (!mm) return null;
  const yy = Number(year2);
  const yyyy = Number.isNaN(yy) ? null : (yy <= 30 ? 2000 + yy : 1900 + yy);
  if (!yyyy) return null;
  return `${yyyy}-${mm}-${String(day).padStart(2, '0')}`;
};

const parseVisualText = (rawText) => {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const upper = text.toUpperCase();

  const passportMatch =
    upper.match(/\b[A-Z][0-9]{7,8}\b/) ||
    upper.match(/\b[0-9]{8,9}\b/);

  const dobMatch = upper.match(/\b(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\/\s-]*(\d{2})\b/);
  const expiryMatch = upper.match(/\b(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\/\s-]*(\d{2})\b/g);

  const nationalityMatch =
    upper.match(/\b(INDIAN|INDIA|UNITED KINGDOM|BRITISH|PHILIPPINES|FILIPINO|UAE|EMIRATI)\b/);

  // Try to extract likely name line: uppercase words between passport heading and date line.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let guessedName = null;
  for (const line of lines) {
    const normalized = line.replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    if (normalized.length < 5 || normalized.length > 40) continue;
    if (/passport|nationality|date|authority|republic|citizen/i.test(normalized)) continue;
    const words = normalized.split(' ');
    if (words.length >= 2 && words.every((w) => /^[A-Za-z]+$/.test(w))) {
      guessedName = normalized;
      break;
    }
  }

  const dobIso = dobMatch ? toIsoDateFromDmy(dobMatch[1], dobMatch[2], dobMatch[3]) : null;
  const allDateMatches = Array.isArray(expiryMatch) ? expiryMatch : [];
  const expiryCandidate = allDateMatches.length > 1 ? allDateMatches[allDateMatches.length - 1] : null;
  const expiryParts = expiryCandidate
    ? expiryCandidate.match(/(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\/\s-]*(\d{2})/)
    : null;
  const expiryIso = expiryParts ? toIsoDateFromDmy(expiryParts[1], expiryParts[2], expiryParts[3]) : null;

  return {
    name: guessedName,
    passportNumber: passportMatch ? passportMatch[0].replace(/\s+/g, '') : null,
    dateOfBirth: dobIso,
    nationality: nationalityMatch ? nationalityMatch[0] : null,
    expiryDate: expiryIso,
    gender: upper.includes(' F ') ? 'F' : upper.includes(' M ') ? 'M' : null,
  };
};

// ── MOCK DATA ─────────────────────────────────────────────
const getMockData = () => {
  console.log('🎭 Mock data returning');
  return {
    name: 'Anam Parwez',
    passportNumber: 'A1234567',
    dateOfBirth: '1998-05-15',
    nationality: 'Indian',
    expiryDate: '2028-05-14',
    gender: 'F',
  };
};

module.exports = { scanPassport };