import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  setAuthTokenGetter,
  login as loginApi,
  getCurrentEmployee,
} from "@workspace/api-client-react";
import type { EmployeeWithStore } from "@workspace/api-client-react";

const TOKEN_KEY = "rc_auth_token";

// Register auth token getter at module init so every API call picks it up.
setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));

type AuthContextType = {
  currentUser: EmployeeWithStore | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<EmployeeWithStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }
    getCurrentEmployee()
      .then((emp) => setCurrentUser(emp))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setCurrentUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginApi({ username, password });
    localStorage.setItem(TOKEN_KEY, result.token);
    setCurrentUser(result.employee);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
