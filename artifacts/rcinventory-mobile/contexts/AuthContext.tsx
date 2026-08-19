import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  getCurrentEmployee,
  login as loginApi,
  setAuthTokenGetter,
} from "@workspace/api-client-react";
import type { EmployeeWithStore } from "@workspace/api-client-react";

const TOKEN_KEY = "rc_auth_token";

let _memToken: string | null = null;
setAuthTokenGetter(() => _memToken);

type AuthContextType = {
  currentUser: EmployeeWithStore | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<EmployeeWithStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(TOKEN_KEY)
      .then(async (token) => {
        if (!token) return;
        _memToken = token;
        try {
          const emp = await getCurrentEmployee();
          if (!cancelled) setCurrentUser(emp);
        } catch {
          _memToken = null;
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginApi({ username, password });
    _memToken = result.token;
    await AsyncStorage.setItem(TOKEN_KEY, result.token);
    setCurrentUser(result.employee);
  }, []);

  const logout = useCallback(async () => {
    _memToken = null;
    await AsyncStorage.removeItem(TOKEN_KEY);
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
