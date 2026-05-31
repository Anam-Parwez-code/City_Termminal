import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  saveDriverSession,
  clearDriverSession,
  loadDriverSession,
  saveLastEnteredDriverId,
  normalizeDriverIdKey,
} from '../sessionStorage';

async function persistAuthSession(session, name, driverId) {
  const did = normalizeDriverIdKey(driverId);
  if (did) await saveLastEnteredDriverId(did);
  await saveDriverSession({
    email: session.user?.email || '',
    driverName: name || '',
    driverId: did,
    authToken: session.access_token || '',
  });
}

export async function signUpDriver({ email, password, name, driverId }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  const normalizedId = normalizeDriverIdKey(driverId);
  if (!normalizedId) throw new Error('Driver ID is required');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: password.trim(),
    options: {
      data: {
        full_name: name.trim(),
        driver_id: normalizedId,
      },
    },
  });
  if (error) throw new Error(error.message || 'Sign up failed');
  if (data.session) {
    await persistAuthSession(data.session, name, normalizedId);
  }
  return data;
}

export async function signInDriver({ email, password, driverIdFallback }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const enteredId = normalizeDriverIdKey(driverIdFallback);
  if (!enteredId) {
    throw new Error('Please enter your Driver ID (e.g. DR-105).');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: password.trim(),
  });
  if (error) throw new Error(error.message || 'Login failed');

  const meta = data.user?.user_metadata || {};
  const name = meta.full_name || meta.name || '';

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      driver_id: enteredId,
      full_name: name || meta.full_name,
    },
  });
  if (updateError) {
    console.warn('updateUser driver_id:', updateError.message);
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn('refreshSession:', refreshError.message);
  }

  const session = refreshed?.session || data.session;
  await persistAuthSession(session, name, enteredId);
  return { ...data, session };
}

export async function signOutDriver() {
  if (supabase) {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('supabase signOut:', e?.message);
    }
  }
  await clearDriverSession();
}

/** Sync ct_driver_* keys from Supabase — does not change boot route */
export async function restoreAuthSession() {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  let user = data.session.user;
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) user = userData.user;
  } catch (_e) {
    /* use session user */
  }

  const meta = user?.user_metadata || {};
  const local = await loadDriverSession();
  const metaId = normalizeDriverIdKey(meta.driver_id);
  const driverId = local.lastEnteredDriverId || local.driverId || metaId || '';

  await persistAuthSession(data.session, local.driverName || meta.full_name || meta.name || '', driverId);
  return data.session;
}

export async function hasActiveDriverSession() {
  if (!isSupabaseConfigured()) return false;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return false;
    const local = await loadDriverSession();
    return Boolean(local.authToken || data.session.access_token);
  } catch {
    return false;
  }
}
