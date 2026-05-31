import { Platform } from 'react-native';
import apiService from './apiService';

const NATIONALITY_NAMES = {
  IND: 'India',
  PAK: 'Pakistan',
  ARE: 'United Arab Emirates',
  UAE: 'United Arab Emirates',
  USA: 'United States',
  GBR: 'United Kingdom',
  UK: 'United Kingdom',
  CAN: 'Canada',
  AUS: 'Australia',
  SAU: 'Saudi Arabia',
  EGY: 'Egypt',
  NPL: 'Nepal',
  BGD: 'Bangladesh',
  LKA: 'Sri Lanka',
  PHL: 'Philippines',
  JOR: 'Jordan',
  KWT: 'Kuwait',
  QAT: 'Qatar',
  OMN: 'Oman',
  BHR: 'Bahrain',
  ZAF: 'South Africa',
  FRA: 'France',
  DEU: 'Germany',
  ITA: 'Italy',
  ESP: 'Spain',
  CHN: 'China',
  JPN: 'Japan',
  KOR: 'South Korea',
  MYS: 'Malaysia',
  SGP: 'Singapore',
  THA: 'Thailand',
  IRN: 'Iran',
  IRQ: 'Iraq',
  SYR: 'Syria',
  LBN: 'Lebanon',
  TUR: 'Turkey',
  RUS: 'Russia',
  UKR: 'Ukraine',
  NGA: 'Nigeria',
  KEN: 'Kenya',
  ETH: 'Ethiopia',
};

const titleCase = (value) => {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
};

export const formatNationality = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (upper.length === 3 && NATIONALITY_NAMES[upper]) {
    return `${NATIONALITY_NAMES[upper]} (${upper})`;
  }
  if (/^[A-Z]{3}$/.test(upper) && !NATIONALITY_NAMES[upper]) {
    return upper;
  }
  return titleCase(raw);
};

const normalizePassportResult = (data = {}, method = 'ocr') => ({
  name: data.name || null,
  passportNumber: data.passportNumber || data.passport_number || null,
  dateOfBirth: data.dateOfBirth || data.date_of_birth || data.dob || null,
  nationality: formatNationality(data.nationality) || data.nationality || null,
  nationalityCode: data.nationalityCode || null,
  expiryDate: data.expiryDate || data.expiry_date || null,
  gender: data.gender || null,
  confidence: Number(data.confidence ?? 0.7),
  mode: method,
});

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
  const yyyy =
    type === 'expiry'
      ? yy < currentYY - 5
        ? 2100 + yy
        : 2000 + yy
      : yy <= currentYY
        ? 2000 + yy
        : 1900 + yy;
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
};

const parseMRZ = (rawText) => {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(repairMrzLine)
    .filter((line) => line.length >= 28 && line.includes('<'));

  let line1 = null;
  let line2 = null;
  for (let i = 0; i < lines.length - 1; i += 1) {
    const first = lines[i];
    const second = lines[i + 1];
    const looksLikeNameLine = first.includes('<<') && /[A-Z]{3,}/.test(first.replace(/</g, ''));
    const looksLikeDataLine = /^[A-Z0-9<]{6,}/.test(second) && /\d{6}/.test(second);
    if (
      ((first.startsWith('P<') || first.startsWith('P')) || looksLikeNameLine) &&
      second.length >= 28 &&
      looksLikeDataLine
    ) {
      line1 = (first.startsWith('P') ? first : `P<${first}`).padEnd(44, '<').slice(0, 44);
      line2 = second.padEnd(44, '<').slice(0, 44);
    }
  }

  if (!line1 || !line2) return null;

  const namePart = line1.slice(5);
  const [surnameRaw = '', givenRaw = ''] = namePart.split('<<');
  const surname = surnameRaw.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const givenName = givenRaw.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const fullName = `${givenName} ${surname}`.replace(/\s+/g, ' ').trim() || surname;
  const natCode = line2.slice(10, 13).replace(/</g, '') || line1.slice(2, 5).replace(/</g, '');

  return {
    name: titleCase(fullName),
    passportNumber: line2.slice(0, 9).replace(/</g, '').replace(/O/g, '0') || null,
    nationality: natCode,
    nationalityCode: natCode,
    dateOfBirth: mrzDate(line2.slice(13, 19), 'birth'),
    expiryDate: mrzDate(line2.slice(21, 27), 'expiry'),
    gender: line2.charAt(20) === 'M' || line2.charAt(20) === 'F' ? line2.charAt(20) : null,
    confidence: 0.88,
  };
};

const parseVisualFallback = (rawText) => {
  const upper = String(rawText || '').toUpperCase();
  const lines = String(rawText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const passportMatch = upper.match(/\b[A-Z]{1,2}[0-9]{6,8}\b/) || upper.match(/\b[0-9]{8,9}\b/);
  const natWord = upper.match(
    /\b(INDIAN|PAKISTANI|EMIRATI|BRITISH|AMERICAN|FILIPINO|NEPALI|BANGLADESHI|SRI LANKAN|EGYPTIAN|SAUDI|JORDANIAN)\b/,
  );

  let guessedName = null;
  for (const line of lines) {
    const normalized = line.replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized.length < 5 || normalized.length > 45) continue;
    if (/passport|nationality|date|birth|expiry|authority|surname|given/i.test(normalized)) continue;
    const words = normalized.split(' ');
    if (words.length >= 2 && words.every((w) => w.length > 1)) {
      guessedName = titleCase(normalized);
      break;
    }
  }

  return {
    name: guessedName,
    passportNumber: passportMatch ? passportMatch[0] : null,
    nationality: natWord ? titleCase(natWord[0]) : null,
    confidence: 0.5,
  };
};

const hasRequiredFields = (data) =>
  Boolean(data?.name && data?.passportNumber && data?.dateOfBirth && data?.nationality);

const scanWithDeviceTesseract = async (imageBase64) => {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: () => {},
  });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789< -/.,',
    });
    const dataUrl = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;
    const { data } = await worker.recognize(dataUrl);
    const rawText = data?.text || '';
    const mrz = parseMRZ(rawText);
    const visual = parseVisualFallback(rawText);
    const merged = {
      ...visual,
      ...Object.fromEntries(Object.entries(mrz || {}).filter(([, v]) => v)),
    };
    if (!merged.nationality && merged.nationalityCode) {
      merged.nationality = merged.nationalityCode;
    }
    return normalizePassportResult(merged, 'device-tesseract');
  } finally {
    await worker.terminate();
  }
};

/** Scan passport: backend Tesseract first, device Tesseract on web if backend unavailable */
export async function scanPassportFromImage({ imageBase64, bookingId }) {
  if (!imageBase64) {
    throw new Error('Passport image is missing.');
  }

  try {
    const result = await apiService.verifyPassport({ imageBase64, bookingId });
    if (result?.success && result?.data) {
      const normalized = normalizePassportResult(result.data, result.method || 'backend-tesseract');
      if (!hasRequiredFields(normalized)) {
        const err = new Error(
          'Passport details not found clearly. Ensure name, number, date of birth and nationality are visible.',
        );
        err.partialData = normalized;
        throw err;
      }
      return normalized;
    }
    throw new Error(result?.message || 'Passport scan failed.');
  } catch (backendErr) {
    if (Platform.OS === 'web') {
      try {
        const local = await scanWithDeviceTesseract(imageBase64);
        if (hasRequiredFields(local)) return local;
        throw new Error(
          'Could not read passport clearly. Use a flat, well-lit photo with the MRZ lines at the bottom visible.',
        );
      } catch (localErr) {
        throw localErr;
      }
    }
    const msg =
      backendErr?.payload?.message ||
      backendErr?.message ||
      'Passport scan failed. Check backend is running and try again.';
    const err = new Error(msg);
    if (backendErr?.payload?.data) {
      err.partialData = normalizePassportResult(backendErr.payload.data);
    }
    throw err;
  }
}
