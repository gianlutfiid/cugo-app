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
      url.includes("/auth/logout") ||
      url.includes("/auth/change-password");

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

export const apiChangePassword = async (
  current_password: string,
  new_password: string
): Promise<{ message: string }> => {
  const { data } = await apiClient.post<{ message: string }>("/auth/change-password", {
    current_password,
    new_password,
  });
  return data;
};

// ---- Branches ----
export interface Branch {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  address: string | null;
  phone: string | null;
  timezone: string;
}

export const listBranches = async (): Promise<Branch[]> => {
  const { data } = await apiClient.get<Branch[]>("/branches");
  return data;
};

// ---- Admin user management ----
export type BranchRole = "branch_admin" | "staff";

export interface AdminMembership {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  role: BranchRole;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_superadmin: boolean;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  memberships: AdminMembership[];
}

export interface MembershipInput {
  branch_id: string;
  role: BranchRole;
}

export const adminListUsers = async (): Promise<AdminUser[]> => {
  const { data } = await apiClient.get<AdminUser[]>("/users");
  return data;
};

export const adminCreateUser = async (payload: {
  email: string;
  full_name: string | null;
  memberships: MembershipInput[];
}): Promise<{ user: AdminUser; initial_password: string }> => {
  const { data } = await apiClient.post("/users", payload);
  return data;
};

export const adminUpdateUser = async (
  id: string,
  payload: { full_name?: string; is_active?: boolean }
): Promise<AdminUser> => {
  const { data } = await apiClient.patch<AdminUser>(`/users/${id}`, payload);
  return data;
};

export const adminUpsertMembership = async (
  id: string,
  payload: MembershipInput
): Promise<AdminUser> => {
  const { data } = await apiClient.post<AdminUser>(`/users/${id}/memberships`, payload);
  return data;
};

export const adminRemoveMembership = async (
  id: string,
  branchId: string
): Promise<AdminUser> => {
  const { data } = await apiClient.delete<AdminUser>(`/users/${id}/memberships/${branchId}`);
  return data;
};

export const adminResetPassword = async (
  id: string
): Promise<{ initial_password: string }> => {
  const { data } = await apiClient.post(`/users/${id}/reset-password`);
  return data;
};
