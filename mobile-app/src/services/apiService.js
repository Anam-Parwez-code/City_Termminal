// ============================================================
// FILE: src/services/apiService.js
// API SERVICE — COMPLETE FIXED VERSION
// ============================================================
// BUGS FIXED:
// 1. getAvailableSlots() function missing tha — add kiya
// 2. verifyPassport mein field name 'image' → 'imageBase64' fix
// 3. bookSlot mein slotId properly bheja
// 4. updatePassportData function add kiya (Screen 5 ke liye)
// ============================================================

import axios from 'axios';
import {
  API_BASE_URL,
  AI_BASE_URL,
  getSocketBaseUrl,
  getApiConnectionHint,
} from '../config/apiConfig';

export { API_BASE_URL, getSocketBaseUrl };

const BASE_URL = API_BASE_URL;

if (__DEV__) {
  console.log('[City Terminal] API →', BASE_URL);
  console.log('[City Terminal]', getApiConnectionHint());
}

// ── AXIOS INSTANCE ────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30 sec — passport scan ke liye zyada time
  headers: {
    'Content-Type': 'application/json',
  },
});

const aiApi = axios.create({
  baseURL: AI_BASE_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── RESPONSE INTERCEPTOR ─────────────────────────────────
// Har response ke baad yeh chalega
// response.data automatically return karega
api.interceptors.response.use(
  (response) => response.data, // { success, data, ... }
  (error) => {
    if (!error.response) {
      throw new Error(
        `Cannot reach server at ${BASE_URL}. ` +
          'On a real phone: same WiFi as PC, run "node server.js" in backend, then set mobile-app/.env → ' +
          'EXPO_PUBLIC_API_URL=http://YOUR_PC_IP:5000 (Windows: ipconfig → IPv4). Restart: npx expo start -c',
      );
    }
    const message = error.response?.data?.message || 'Something went wrong';
    const err = new Error(message);
    err.status = error.response?.status;
    err.payload = error.response?.data;
    throw err;
  }
);

aiApi.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (!error.response) {
      throw new Error('AI service not reachable. Check network/server.');
    }
    const message = error.response?.data?.detail || error.response?.data?.message || 'AI service failed';
    throw new Error(message);
  }
);

// ============================================================
// ALL API FUNCTIONS
// ============================================================
const apiService = {

  // ── SCREEN 3: BOOKING VERIFY ──────────────────────────
  // POST /api/bookings/verify
  // Backend: bookings table mein dhundhta hai
  verifyBooking: async ({ bookingId, airlineCode }) => {
    const result = await api.post('/bookings/verify', {
      bookingId,
      airlineCode,
    });
    return result;
    // Returns: { success: true, valid: true, bookingData: {...} }
  },

  getBookingDetails: async (bookingId) => {
    const result = await api.get(`/bookings/${bookingId}`);
    return result;
  },

  // ── SCREEN 4: PASSPORT SCAN ───────────────────────────
  // POST /api/passport/scan
  // BUG FIX: 'image' → 'imageBase64' field name match kiya backend se
  verifyPassport: async ({ imageBase64, bookingId }) => {
    const result = await api.post(
      '/passport/scan',
      {
        imageBase64,
        bookingId,
      },
      { timeout: 90000 },
    );
    return result;
  },

  // ── AI CHAT STREAM (SSE) ────────────────────────────────
  // React Native fetch stream parsing (text/event-stream)
  streamChat: async ({ message, bookingId, history = [], onEvent }) => {
    const response = await fetch(`${AI_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message, bookingId, history }),
    });

    if (!response.ok) {
      throw new Error(`Chat failed: ${response.status}`);
    }

    if (!response.body || !response.body.getReader) {
      throw new Error('Streaming is not supported on this runtime.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const eventBlock of events) {
        const line = eventBlock
          .split('\n')
          .find((l) => l.startsWith('data: '));
        if (!line) continue;

        try {
          const payload = JSON.parse(line.replace('data: ', '').trim());
          onEvent?.(payload);
          if (payload.type === 'done') return;
        } catch (_err) {
          // Ignore malformed chunks safely.
        }
      }
    }
  },

  // ── SCREEN 5: PASSPORT DATA UPDATE ───────────────────
  // PUT /api/bookings/:bookingId/passport
  // User ne verification screen pe data edit kiya → save karo
  updatePassportData: async ({ bookingId, passportNumber, verifiedName, dateOfBirth, nationality }) => {
    const result = await api.put(`/bookings/${bookingId}/passport`, {
      passportNumber,
      verifiedName,
      dateOfBirth,
      nationality,
    });
    return result;
  },

  // ── SCREEN 6: GET AVAILABLE SLOTS ────────────────────
  // GET /api/slots/available
  // BUG FIX: Yeh function missing tha — ab add kiya!
  getAvailableSlots: async ({ bookingId } = {}) => {
    const result = await api.get('/slots/available', {
      params: bookingId ? { bookingId } : {},
    });
    return result;
    // Returns: { success: true, slots: [...] }
  },

  recommendPickup: async (data) => {
    const result = await api.post('/ai/recommend-pickup', data);
    return result;
  },

  recommendSlot: async (data) => {
    const result = await api.post('/ai/recommend-slot', data);
    return result;
  },

  // ── SCREEN 6: BOOK A SLOT ────────────────────────────
  // POST /api/slots/book
  // BUG FIX: slotId properly bheja
  bookSlot: async ({ bookingId, slotId }) => {
    const result = await api.post('/slots/book', {
      bookingId,
      slotId, // ← FIXED: slotId bheja (slotTime ya locationId nahi)
    });
    return result;
    // Returns: { success: true, confirmation: { vehicleNumber, slotTime, qrCode, ... } }
  },

  assignVehicle: async ({ bookingId, pickupLocation, destinationTerminal, pickupCoordinates, pickupTime }) => {
    const result = await api.post('/otp/assign', {
      bookingId,
      pickupLocation,
      destinationTerminal,
      pickupCoordinates,
      pickupTime,
    });
    return result;
  },

  verifyVehicleId: async ({ bookingId, vehicleId }) => {
    const result = await api.post('/otp/verify-vehicle', {
      bookingId,
      vehicleId,
    });
    return result;
  },

  startAirportTrip: async ({ bookingId }) => {
    const result = await api.post('/otp/airport-trip', { bookingId });
    return result;
  },

  updateDriverGPS: async ({ bookingId, vehicleId, lat, lng }) => {
    const result = await api.put('/otp/driver-location', { bookingId, vehicleId, lat, lng });
    return result;
  },

  getOTPStatus: async (bookingId) => {
    const result = await api.get(`/otp/status/${bookingId}`);
    return result;
  },

  driverReachedAirport: async (bookingId) => {
    const result = await api.put(`/otp/reached/${bookingId}`);
    return result;
  },

  confirmPickupOtp: async ({ bookingId, otp }) => {
    const result = await api.post('/slots/confirm-pickup', {
      bookingId,
      otp,
    });
    return result;
  },

  // ── AI CHATBOT: LIVE STATUS + BILINGUAL SUPPORT ─────────
  // POST /chat (SSE stream) is handled by direct fetch/eventsource client.
  // This helper is non-streaming status fetch for Arrived / tracking screens.
  getLiveTripStatus: async ({ bookingId }) => {
    const result = await aiApi.post('/chat/live-status', { bookingId });
    return result;
  },

  // ── PRODUCTION PASSPORT OCR ──────────────────────────────
  // POST /passport/verify-real (AI service)
  verifyPassportReal: async ({ imageBase64, bookingId }) => {
    try {
      const result = await aiApi.post('/passport/verify-real', {
        imageBase64,
        bookingId,
      });
      return result;
    } catch (_err) {
      // Fallback to backend OCR route if AI service is down.
      const fallback = await api.post('/passport/scan', {
        imageBase64,
        bookingId,
      });
      return fallback;
    }
  },

};

export default apiService;
