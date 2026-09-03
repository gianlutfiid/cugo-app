import axios from "axios";

const backendUrl = process.env.REACT_APP_BACKEND_URL;

export const apiClient = axios.create({
  baseURL: `${backendUrl}/api`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

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
  created_at?: string;
  updated_at?: string;
}

export const listBranches = async (): Promise<Branch[]> => {
  const { data } = await apiClient.get<Branch[]>("/branches");
  return data;
};

export const getBranch = async (id: string): Promise<Branch> => {
  const { data } = await apiClient.get<Branch>(`/branches/${id}`);
  return data;
};

export interface BranchCreatePayload {
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  timezone: string;
}

export interface BranchUpdatePayload {
  name?: string;
  address?: string | null;
  phone?: string | null;
  timezone?: string;
  is_active?: boolean;
}

export const adminCreateBranch = async (payload: BranchCreatePayload): Promise<Branch> => {
  const { data } = await apiClient.post<Branch>("/branches", payload);
  return data;
};

export const adminUpdateBranch = async (
  id: string,
  payload: BranchUpdatePayload
): Promise<Branch> => {
  const { data } = await apiClient.patch<Branch>(`/branches/${id}`, payload);
  return data;
};

// ---- Customers ----
export interface Customer {
  id: string;
  branch_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreatePayload {
  branch_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export interface CustomerUpdatePayload {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export const listCustomers = async (params?: {
  branch_id?: string;
  q?: string;
  include_inactive?: boolean;
}): Promise<Customer[]> => {
  const { data } = await apiClient.get<Customer[]>("/customers", { params });
  return data;
};

export const createCustomer = async (payload: CustomerCreatePayload): Promise<Customer> => {
  const { data } = await apiClient.post<Customer>("/customers", payload);
  return data;
};

export const updateCustomer = async (
  id: string,
  payload: CustomerUpdatePayload
): Promise<Customer> => {
  const { data } = await apiClient.patch<Customer>(`/customers/${id}`, payload);
  return data;
};

export const getCustomer = async (id: string): Promise<Customer> => {
  const { data } = await apiClient.get<Customer>(`/customers/${id}`);
  return data;
};

// ---- Services ----
export type ServiceUnit = "kg" | "pcs" | "pasang" | "set" | string;

export interface ServiceCategory {
  id: string;
  branch_id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export interface ServiceItem {
  id: string;
  branch_id: string;
  category_id: string;
  category_name: string;
  category_code: string;
  name: string;
  code: string;
  unit: string;
  price: number;
  is_active: boolean;
}

export const listServices = async (params?: {
  branch_id?: string;
  category_id?: string;
  include_inactive?: boolean;
}): Promise<ServiceItem[]> => {
  const { data } = await apiClient.get<ServiceItem[]>("/services", { params });
  return data;
};

// ---- Orders / invoices ----
export interface OrderItem {
  id: string;
  service_id: string;
  line_number: number;
  service_name: string;
  service_code: string;
  unit: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
}

export interface OrderListItem {
  id: string;
  branch_id: string;
  customer_id: string;
  customer_name: string;
  invoice_number: string;
  received_at: string;
  due_at: string | null;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  payment_status: string;
}

export interface Order extends OrderListItem {
  customer_phone: string | null;
  payment_method: string | null;
  notes: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderStatusLog {
  id: string;
  order_id: string;
  branch_id: string;
  from_status: string | null;
  to_status: string;
  changed_by_user_id: string;
  changed_by_name: string | null;
  changed_at: string;
  note: string | null;
}

export interface OrderItemCreatePayload {
  service_id: string;
  quantity: number;
  notes: string | null;
}

export interface OrderCreatePayload {
  branch_id: string;
  customer_id: string;
  received_at?: string | null;
  due_at?: string | null;
  discount: number;
  paid_amount: number;
  payment_method: string | null;
  notes: string | null;
  items: OrderItemCreatePayload[];
}

export interface OrderUpdatePayload {
  due_at?: string | null;
  discount?: number;
  paid_amount?: number;
  payment_method?: string | null;
  notes?: string | null;
  status?: string;
}

export const listOrders = async (params?: {
  branch_id?: string;
  q?: string;
  order_status?: string;
  payment_status?: string;
}): Promise<OrderListItem[]> => {
  const { data } = await apiClient.get<OrderListItem[]>("/orders", { params });
  return data;
};

export const getOrder = async (id: string): Promise<Order> => {
  const { data } = await apiClient.get<Order>(`/orders/${id}`);
  return data;
};

export const getOrderHistory = async (id: string): Promise<OrderStatusLog[]> => {
  const { data } = await apiClient.get<OrderStatusLog[]>(`/orders/${id}/history`);
  return data;
};

export const createOrder = async (payload: OrderCreatePayload): Promise<Order> => {
  const { data } = await apiClient.post<Order>("/orders", payload);
  return data;
};

export const updateOrder = async (id: string, payload: OrderUpdatePayload): Promise<Order> => {
  const { data } = await apiClient.patch<Order>(`/orders/${id}`, payload);
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
