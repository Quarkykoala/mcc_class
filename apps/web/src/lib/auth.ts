const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');

type AuthSession = {
    user: { id: string; email: string };
    access_token: string;
    roles: string[];
};

type AuthChangeCallback = (event: string, session: AuthSession | null) => void;

let currentSession: AuthSession | null = null;
const listeners: Set<AuthChangeCallback> = new Set();

const TOKEN_KEY = 'mcc_auth_token';

function notifyListeners(event: string) {
    for (const cb of listeners) {
        cb(event, currentSession);
    }
}

function loadFromStorage(): AuthSession | null {
    try {
        const stored = localStorage.getItem(TOKEN_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        // ignore
    }
    return null;
}

function saveToStorage(session: AuthSession | null) {
    if (session) {
        localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

export const auth = {
    async signInWithPassword({ email, password }: { email: string; password: string }): Promise<{ data?: AuthSession; error?: string }> {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                return { error: data.error || 'Login failed' };
            }
            currentSession = {
                user: data.user,
                access_token: data.access_token,
                roles: data.roles || [],
            };
            saveToStorage(currentSession);
            notifyListeners('SIGNED_IN');
            return { data: currentSession };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Login failed';
            return { error: message };
        }
    },

    async signOut(): Promise<void> {
        currentSession = null;
        saveToStorage(null);
        notifyListeners('SIGNED_OUT');
    },

    async getSession(): Promise<{ data: { session: AuthSession | null } }> {
        if (!currentSession) {
            currentSession = loadFromStorage();
            if (currentSession) {
                try {
                    const res = await fetch(`${API_BASE}/auth/me`, {
                        headers: { Authorization: `Bearer ${currentSession.access_token}` },
                    });
                    if (!res.ok) {
                        currentSession = null;
                        saveToStorage(null);
                    }
                } catch {
                    currentSession = null;
                    saveToStorage(null);
                }
            }
        }
        return { data: { session: currentSession } };
    },

    onAuthStateChange(callback: AuthChangeCallback): { data: { subscription: { unsubscribe: () => void } } } {
        listeners.add(callback);
        return {
            data: {
                subscription: {
                    unsubscribe: () => {
                        listeners.delete(callback);
                    },
                },
            },
        };
    },

    getAccessToken(): string | null {
        return currentSession?.access_token ?? loadFromStorage()?.access_token ?? null;
    },
};

export default auth;
