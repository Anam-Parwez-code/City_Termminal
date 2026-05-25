import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import adminService from '../services/adminService';

const getLiveParts = (live) => {
  const vehicle = live?.live?.vehicle || live?.vehicle || {};
  const flight = live?.live?.flight || live?.live?.booking || live?.flight || live?.booking || {};
  return { vehicle, flight };
};

const buildLocalReply = ({ text, bookingId, live, isRTL }) => {
  const lower = String(text || '').toLowerCase();
  const { vehicle, flight } = getLiveParts(live);
  const vehicleStatus = vehicle?.status || vehicle?.vehicle_status || 'not assigned yet';
  const location = vehicle?.current_location || vehicle?.location || vehicle?.pickup_location || 'not available';
  const flightStatus = flight?.status || flight?.flight_status || 'not available';

  if (isRTL) {
    if (!bookingId) return 'Please share your booking ID first so I can check live trip details.';
    return `Booking ${bookingId}: vehicle ${vehicleStatus}, location ${location}, flight ${flightStatus}.`;
  }

  if (!bookingId) {
    return 'Please share your booking ID first. After that I can help with vehicle status, QR/barcode, flight, pickup point, and slots.';
  }

  if (lower.includes('qr') || lower.includes('barcode') || lower.includes('code')) {
    return `For booking ${bookingId}, your QR/barcode is shown after slot confirmation. If the vehicle is assigned, open the booking confirmation or barcode screen and keep it ready for pickup.`;
  }

  if (lower.includes('vehicle') || lower.includes('driver') || lower.includes('car') || lower.includes('van')) {
    return `Booking ${bookingId}: vehicle status is ${vehicleStatus}. Current location: ${location}.`;
  }

  if (lower.includes('flight')) {
    return `Booking ${bookingId}: flight status is ${flightStatus}. If this looks outdated, refresh tracking once your airport network is stable.`;
  }

  if (lower.includes('slot') || lower.includes('time')) {
    return `For booking ${bookingId}, choose the earliest available pickup slot that gives you enough buffer for luggage and immigration. If no slot appears, refresh slots or try again in a minute.`;
  }

  if (lower.includes('pickup') || lower.includes('location') || lower.includes('terminal')) {
    return `For booking ${bookingId}, follow the pickup location shown in the app. If your terminal changes, update the pickup point before confirming the slot.`;
  }

  if (lower.includes('passport') || lower.includes('verify')) {
    return 'Passport scan is currently in demo mode, so any uploaded photo can continue to verification. Please review/edit the details on the verification screen before moving ahead.';
  }

  return `I can help with booking ${bookingId}. Ask me about vehicle status, QR/barcode, flight status, pickup location, passport verification, or available slots.`;
};

const ChatSupportScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const [bookingId, setBookingId] = useState(route?.params?.bookingId ?? '');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: isRTL
        ? 'مرحبا! أستطيع مساعدتك في حالة المركبة، الرحلة، الحجز، رمز QR، وموقع الاستلام.'
        : 'Hi! I can help with your vehicle, flight status, booking QR, pickup location, and slot availability.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!bookingId) {
      adminService.getCurrentBookingId().then((savedBookingId) => {
        if (mounted && savedBookingId) setBookingId(savedBookingId);
      });
    }
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  const historyForApi = useMemo(
    () =>
      messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.text })),
    [messages]
  );

  const upsertAssistantDraft = (draftText) => {
    setMessages((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex((m) => m.id === 'assistant-draft');
      if (idx >= 0) copy[idx] = { ...copy[idx], text: draftText };
      else copy.push({ id: 'assistant-draft', role: 'assistant', text: draftText });
      return copy;
    });
  };

  const finalizeAssistantDraft = () => {
    setMessages((prev) =>
      prev.map((m) => (m.id === 'assistant-draft' ? { ...m, id: `assistant-${Date.now()}` } : m))
    );
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setInput('');
    setIsSending(true);
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', text }]);

    let assistantText = '';
    try {
      await apiService.streamChat({
        message: text,
        bookingId,
        history: historyForApi,
        onEvent: (event) => {
          if (event.type === 'text') {
            assistantText += event.content || '';
            upsertAssistantDraft(assistantText);
          }
          if (event.type === 'error') {
            assistantText = event.content || (isRTL ? 'حدث خطأ. حاول مرة أخرى.' : 'Something went wrong.');
            upsertAssistantDraft(assistantText);
          }
          if (event.type === 'done') {
            if (!assistantText.trim()) {
              assistantText = isRTL
                ? 'الخدمة متاحة، لكن لم يصل رد واضح. حاول مرة أخرى.'
                : 'Service is available, but no response text arrived. Please try again.';
              upsertAssistantDraft(assistantText);
            }
            finalizeAssistantDraft();
          }
        },
      });
      if (assistantText.trim()) {
        finalizeAssistantDraft();
      } else {
        throw new Error('Empty chat response');
      }
    } catch (_err) {
      let live = null;
      try {
        if (bookingId) {
          live = await apiService.getLiveTripStatus({ bookingId });
        }
      } catch (_liveErr) {
        // Local support still works when the AI/live-status service is down.
      }
      const fallbackText = buildLocalReply({ text, bookingId, live, isRTL });
      upsertAssistantDraft(fallbackText);
      finalizeAssistantDraft();
    } finally {
      setIsSending(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={[styles.msgBubble, item.role === 'user' ? styles.userBubble : styles.botBubble]}>
      <Text style={[styles.msgText, isRTL && styles.textRight]}>{item.text}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>{isRTL ? 'مساعدة ذكية' : 'AI Support'}</Text>
          {!!bookingId && <Text style={styles.subtitle}>{bookingId}</Text>}
        </View>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
      />

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, isRTL && styles.textRight]}
          placeholder={isRTL ? 'اكتب سؤالك...' : 'Ask about vehicle, QR, flight, slots...'}
          placeholderTextColor="#94A3B8"
          value={input}
          onChangeText={setInput}
          editable={!isSending}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={isSending}>
          {isSending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.sendText}>{isRTL ? 'إرسال' : 'Send'}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F10' },
  list: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { color: '#FFF', fontSize: 20 },
  title: { color: '#F8FAFC', fontSize: 19, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#94A3B8', fontSize: 11, textAlign: 'center', marginTop: 2 },
  listContent: { paddingHorizontal: 16, paddingBottom: 14 },
  msgBubble: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    maxWidth: '85%',
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#EF3340' },
  botBubble: { alignSelf: 'flex-start', backgroundColor: '#191A1E', borderWidth: 1, borderColor: '#2E3138' },
  msgText: { color: '#F8FAFC', fontSize: 14, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#2E3138',
    backgroundColor: '#141518',
  },
  input: {
    flex: 1,
    maxHeight: 96,
    backgroundColor: '#1A1A1D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E3138',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    backgroundColor: '#009A44',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 68,
    alignItems: 'center',
  },
  sendText: { color: '#FFF', fontWeight: '700' },
  textRight: { textAlign: 'right' },
});

export default ChatSupportScreen;
