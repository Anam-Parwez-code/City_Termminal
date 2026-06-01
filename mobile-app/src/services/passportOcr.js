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

export const normalizePassportResult = (data = {}, method = 'ocr') => ({
  name: data.name || null,
  passportNumber: data.passportNumber || data.passport_number || null,
  dateOfBirth: data.dateOfBirth || data.date_of_birth || data.dob || null,
  nationality: formatNationality(data.nationality) || data.nationality || null,
  nationalityCode: data.nationalityCode || null,
  expiryDate: data.expiryDate || data.expiry_date || null,
  gender: data.gender || null,
  confidence: Number(data.confidence ?? 0.55),
  mode: method,
  needsReview: Boolean(data.needsReview),
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

const parseVisualDate = (text) => {
  const upper = String(text || '').toUpperCase();
  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  let m = upper.match(/\b(\d{1,2})[\s./-]*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s./-]*(\d{2,4})\b/);
  if (m) {
    const yyyy = m[3].length === 4 ? Number(m[3]) : (Number(m[3]) <= 30 ? 2000 + Number(m[3]) : 1900 + Number(m[3]));
    return `${yyyy}-${monthMap[m[2]]}-${String(m[1]).padStart(2, '0')}`;
  }
  m = upper.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = upper.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const yyyy = m[3].length === 4 ? Number(m[3]) : (Number(m[3]) <= 30 ? 2000 + Number(m[3]) : 1900 + Number(m[3]));
    return `${yyyy}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return null;
};

export const parseMRZ = (rawText) => {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(repairMrzLine)
    .filter((line) => line.length >= 20 && line.includes('<'));

  const candidates = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    const first = lines[i];
    const second = lines[i + 1];
    const looksLikeNameLine =
      first.includes('<<') || (first.startsWith('P') && first.length >= 20);
    const looksLikeDataLine = /\d{6}/.test(second) && /[A-Z0-9<]{8,}/.test(second);
    if (looksLikeNameLine && second.length >= 20 && looksLikeDataLine) {
      const line1 = (first.startsWith('P') ? first : `P<XXX${first}`).padEnd(44, '<').slice(0, 44);
      const line2 = second.padEnd(44, '<').slice(0, 44);
      candidates.push([line1, line2]);
    }
  }

  if (candidates.length === 0) return null;

  const [line1, line2] = candidates[candidates.length - 1];
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
  const passportMatch =
    upper.match(/\b[A-Z][0-9]{7,8}\b/) ||
    upper.match(/\b[A-Z]{2}[0-9]{6,7}\b/) ||
    upper.match(/\b[0-9]{8,9}\b/);
  const natWord = upper.match(
    /\b(INDIAN|PAKISTANI|EMIRATI|BRITISH|AMERICAN|FILIPINO|NEPALI|BANGLADESHI|SRI LANKAN|EGYPTIAN|SAUDI|JORDANIAN|IND|PAK|UAE|USA|GBR)\b/,
  );
  const dob = parseVisualDate(upper);

  let guessedName = null;
  for (const line of lines) {
    const normalized = line.replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized.length < 4 || normalized.length > 50) continue;
    if (/passport|nationality|date|birth|expiry|authority|surname|given|republic|sex|place|country/i.test(normalized)) {
      continue;
    }
    const words = normalized.split(' ').filter((w) => w.length > 1);
    if (words.length >= 2) {
      guessedName = titleCase(normalized);
      break;
    }
  }

  return {
    name: guessedName,
    passportNumber: passportMatch ? passportMatch[0] : null,
    nationality: natWord ? titleCase(natWord[0]) : null,
    dateOfBirth: dob,
    confidence: 0.5,
  };
};

export const mergeOcrResults = (...parts) => {
  const merged = {};
  for (const part of parts) {
    if (!part) continue;
    Object.entries(part).forEach(([key, value]) => {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        merged[key] = value;
      }
    });
  }
  if (!merged.nationality && merged.nationalityCode) {
    merged.nationality = merged.nationalityCode;
  }
  return merged;
};

export const fieldCount = (data) =>
  ['name', 'passportNumber', 'dateOfBirth', 'nationality'].filter((k) => {
    const v = k === 'nationality' ? formatNationality(data?.[k]) || data?.[k] : data?.[k];
    return v && String(v).trim();
  }).length;

/** Enough to open Verification and let user fix missing fields */
export const hasMinimumPassportData = (data) =>
  Boolean(data?.passportNumber && String(data.passportNumber).trim().length >= 6) &&
  Boolean((data?.name && String(data.name).trim()) || (data?.dateOfBirth && String(data.dateOfBirth).trim()));

export const hasFullPassportData = (data) => fieldCount(data) >= 4;

const scanWithDeviceTesseract = async (imageBase64) => {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: () => {} });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789< -/.,',
      tessedit_pageseg_mode: PSM?.AUTO || '3',
    });
    const dataUrl = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;
    const { data } = await worker.recognize(dataUrl);
    const rawText = data?.text || '';
    const mrz = parseMRZ(rawText);
    const visual = parseVisualFallback(rawText);
    const merged = mergeOcrResults(visual, mrz);
    return normalizePassportResult(merged, 'device-tesseract');
  } finally {
    await worker.terminate();
  }
};

const extractFromBackendPayload = (payload, method) => {
  const raw = payload?.data || payload;
  return normalizePassportResult(raw, method || payload?.method || 'backend-tesseract');
};

/** Scan passport: backend OCR → device OCR (web) → merged best result */
export async function scanPassportFromImage({ imageBase64, bookingId }) {
  if (!imageBase64) {
    throw new Error('Passport image is missing.');
  }

  let backendResult = null;
  let backendError = null;

  try {
    const result = await apiService.verifyPassport({ imageBase64, bookingId });
    if (result?.success && result?.data) {
      backendResult = extractFromBackendPayload(result, result.method);
    } else if (result?.data) {
      backendResult = extractFromBackendPayload(result, result.method);
    }
  } catch (err) {
    backendError = err;
    if (err?.payload?.data) {
      backendResult = extractFromBackendPayload(
        { data: err.payload.data, method: err.payload.method },
        err.payload.method,
      );
    }
  }

  let deviceResult = null;
  if (Platform.OS === 'web') {
    try {
      deviceResult = await scanWithDeviceTesseract(imageBase64);
    } catch (deviceErr) {
      console.warn('Device OCR failed:', deviceErr?.message);
    }
  }

  const merged = normalizePassportResult(
    mergeOcrResults(backendResult, deviceResult),
    deviceResult ? 'merged-ocr' : backendResult?.mode || 'backend-tesseract',
  );

  if (hasMinimumPassportData(merged)) {
    merged.needsReview = !hasFullPassportData(merged);
    return merged;
  }

  if (backendResult && hasMinimumPassportData(backendResult)) {
    return normalizePassportResult({ ...backendResult, needsReview: true }, backendResult.mode);
  }

  const msg =
    backendError?.payload?.message ||
    backendError?.message ||
    'Could not read passport. Use a flat photo with MRZ lines at the bottom visible.';
  const err = new Error(msg);
  err.partialData = merged;
  throw err;
}
