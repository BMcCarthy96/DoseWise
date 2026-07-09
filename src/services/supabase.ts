import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// createClient throws synchronously on an empty/invalid URL, which would
// crash the whole app at import time before Supabase is configured. Falling
// back to a placeholder keeps construction safe; without real credentials,
// auth/session calls simply resolve to "no session" or fail gracefully,
// which every call site here already handles.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
