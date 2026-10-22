/**
 * Remembers that a sign-in code was sent, so the code screen survives a page
 * reload. On iPhone a home-screen app is often reloaded while you switch to
 * Mail to read the code, which would otherwise drop you back at the email step.
 */
const STORAGE_KEY = "glactivity:pending-sign-in";
const CHANGE_EVENT = "glactivity:pending-sign-in-change";

// Codes are valid for an hour; offer the code screen for a bit less than that.
const PENDING_FOR_MS = 45 * 60_000;

type Pending = { email: string; sentAt: number };

// Fallback for when storage is unavailable (e.g. some private browsing modes).
let inMemory: Pending | null = null;

function read(): Pending | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return inMemory;
  }
}

/** The email a code was recently sent to, if any. Snapshot for useSyncExternalStore. */
export function getPendingEmail(): string | null {
  const pending = read();
  return pending && Date.now() - pending.sentAt < PENDING_FOR_MS ? pending.email : null;
}

export function setPendingEmail(email: string | null) {
  inMemory = email ? { email, sentAt: Date.now() } : null;
  try {
    if (inMemory) localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemory));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the in-memory copy still covers this visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToPendingEmail(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
