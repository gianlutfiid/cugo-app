import axios from "axios";

const backendUrl = process.env.REACT_APP_BACKEND_URL;

export const apiClient = axios.create({
  baseURL: `${backendUrl}/api`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// On a 401 for a non-auth request, try refreshing the access token once.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const url: string = original.url || "";
    const isAuthCall =
      url.includes("/auth/login") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/logout");

    if (status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        await apiClient.post("/auth/refresh");
        return apiClient(original);
      } catch (refreshError) {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiError(detail: unknown): string {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e: any) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  }
  if (typeof (detail as any).msg === "string") return (detail as any).msg;
  return String(detail);
}

export interface HealthResponse {
  status: string;
  service: string;
  database: string;
  environment: string;
}

export interface Membership {
  branch_id: string;
  role: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_superadmin: boolean;
  is_active: boolean;
  last_login: string | null;
  memberships: Membership[];
}

export const getHealth = async (): Promise<HealthResponse> => {
  const { data } = await apiClient.get<HealthResponse>("/health");
  return data;
};

export const apiLogin = async (email: string, password: string): Promise<User> => {
  const { data } = await apiClient.post<User>("/auth/login", { email, password });
  return data;
};

export const apiLogout = async (): Promise<void> => {
  await apiClient.post("/auth/logout");
};

export const apiMe = async (): Promise<User> => {
  const { data } = await apiClient.get<User>("/auth/me");
  return data;
};
