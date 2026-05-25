/**
 * Translates Supabase auth error messages from English to Hebrew.
 *
 * Supabase always returns English error strings (e.g. "Invalid login
 * credentials"). End-users in a Hebrew app need them in their language.
 * Pass any unknown error through unchanged.
 */
export function translateAuthError(message: string): string {
  if (!message) return "שגיאה לא ידועה";

  const m = message.toLowerCase();

  // Sign in / password
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "כתובת דוא״ל או סיסמה שגויים";
  if (m.includes("email not confirmed"))
    return "כתובת הדוא״ל עדיין לא אומתה — בדוק/י את תיבת הדואר";
  if (m.includes("invalid email"))
    return "כתובת הדוא״ל אינה תקינה";

  // Sign up
  if (m.includes("user already registered") || m.includes("already registered"))
    return "כתובת הדוא״ל כבר רשומה במערכת — נסה/י להתחבר";
  if (m.includes("password should be at least"))
    return "הסיסמה קצרה מדי — לפחות 6 תווים";
  if (m.includes("weak password") || m.includes("password is too weak"))
    return "הסיסמה חלשה מדי — הוסף/י אותיות גדולות, מספרים או סימנים";
  if (m.includes("signup is disabled"))
    return "ההרשמה זמנית סגורה — נסה/י שוב מאוחר יותר";

  // Rate limiting / sending
  if (m.includes("email rate limit exceeded") || m.includes("over_email_send_rate_limit"))
    return "נשלחו יותר מדי בקשות אימייל. המתן/י מספר דקות ונסה/י שוב";
  if (m.includes("rate limit") || m.includes("too many"))
    return "יותר מדי בקשות — המתן/י כמה דקות";

  // Magic link / OTP
  if (m.includes("otp expired") || m.includes("token expired"))
    return "הקישור פג תוקף — בקש/י קישור חדש";
  if (m.includes("invalid otp") || m.includes("invalid token"))
    return "הקישור אינו תקף";

  // OAuth
  if (m.includes("user cancelled") || m.includes("cancelled by user"))
    return "ההתחברות בוטלה";
  if (m.includes("oauth"))
    return "התחברות חיצונית נכשלה — נסה/י שוב";

  // Network
  if (m.includes("network") || m.includes("failed to fetch"))
    return "שגיאת רשת — בדוק/י חיבור לאינטרנט";
  if (m.includes("timeout"))
    return "פג זמן הבקשה — נסה/י שוב";

  return message; // unknown — show as-is so we can debug
}

/**
 * Heuristic password strength estimator. Returns 0-4 (weak to strong).
 * Not for cryptographic guarantees — visual feedback only.
 */
export function passwordStrength(pw: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tone: "destructive" | "warning" | "success";
} {
  if (!pw || pw.length < 6) return { score: 0, label: "חלשה מאוד", tone: "destructive" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score: 1, label: "חלשה", tone: "destructive" };
  if (score === 2) return { score: 2, label: "בינונית", tone: "warning" };
  if (score === 3) return { score: 3, label: "טובה", tone: "success" };
  return { score: 4, label: "חזקה מאוד", tone: "success" };
}
