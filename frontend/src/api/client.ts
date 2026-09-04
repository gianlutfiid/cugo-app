import axios from "axios";

const backendUrl = process.env.REACT_APP_BACKEND_URL;
export const apiClient = axios.create({ baseURL: `${backendUrl}/api`, withCredentials: true, headers: { "Content-Type": "application/json" } });
apiClient.interceptors.response.use((response) => response, async (error) => {
  const original = error.config || {}; const status = error.response?.status; const url: string = original.url || "";
  const isAuthCall = url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/auth/logout") || url.includes("/auth/change-password");
  if (status === 401 && !original._retry && !isAuthCall) { original._retry = true; try { await apiClient.post("/auth/refresh"); return apiClient(original); } catch (refreshError) { return Promise.reject(error); } }
  return Promise.reject(error);
});
export function formatApiError(detail: unknown): string { if (detail == null) return "Something went wrong. Please try again."; if (typeof detail === "string") return detail; if (Array.isArray(detail)) return detail.map((e: any) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" "); if (typeof (detail as any).msg === "string") return (detail as any).msg; return String(detail); }

export interface HealthResponse { status: string; service: string; database: string; environment: string; }
export interface Membership { branch_id: string; role: string; }
export interface User { id: string; email: string; full_name: string | null; is_superadmin: boolean; is_active: boolean; last_login: string | null; memberships: Membership[]; }
export const getHealth = async (): Promise<HealthResponse> => (await apiClient.get<HealthResponse>("/health")).data;
export const apiLogin = async (email: string, password: string): Promise<User> => (await apiClient.post<User>("/auth/login", { email, password })).data;
export const apiLogout = async (): Promise<void> => { await apiClient.post("/auth/logout"); };
export const apiMe = async (): Promise<User> => (await apiClient.get<User>("/auth/me")).data;
export const apiChangePassword = async (current_password: string, new_password: string): Promise<{ message: string }> => (await apiClient.post<{ message: string }>("/auth/change-password", { current_password, new_password })).data;

export interface Branch { id: string; name: string; code: string; is_active: boolean; address: string | null; phone: string | null; timezone: string; created_at?: string; updated_at?: string; }
export const listBranches = async (): Promise<Branch[]> => (await apiClient.get<Branch[]>("/branches")).data;
export const getBranch = async (id: string): Promise<Branch> => (await apiClient.get<Branch>(`/branches/${id}`)).data;
export interface BranchCreatePayload { name: string; code: string; address: string | null; phone: string | null; timezone: string; }
export interface BranchUpdatePayload { name?: string; address?: string | null; phone?: string | null; timezone?: string; is_active?: boolean; }
export const adminCreateBranch = async (payload: BranchCreatePayload): Promise<Branch> => (await apiClient.post<Branch>("/branches", payload)).data;
export const adminUpdateBranch = async (id: string, payload: BranchUpdatePayload): Promise<Branch> => (await apiClient.patch<Branch>(`/branches/${id}`, payload)).data;

export interface Customer { id: string; branch_id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null; is_active: boolean; created_at: string; updated_at: string; }
export interface CustomerCreatePayload { branch_id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null; }
export interface CustomerUpdatePayload { name?: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; is_active?: boolean; }
export const listCustomers = async (params?: { branch_id?: string; q?: string; include_inactive?: boolean }): Promise<Customer[]> => (await apiClient.get<Customer[]>("/customers", { params })).data;
export const createCustomer = async (payload: CustomerCreatePayload): Promise<Customer> => (await apiClient.post<Customer>("/customers", payload)).data;
export const updateCustomer = async (id: string, payload: CustomerUpdatePayload): Promise<Customer> => (await apiClient.patch<Customer>(`/customers/${id}`, payload)).data;
export const getCustomer = async (id: string): Promise<Customer> => (await apiClient.get<Customer>(`/customers/${id}`)).data;

export type ServiceUnit = "kg" | "pcs" | "pasang" | "set" | string;
export const PRODUCTION_STAGES = ["washing", "ironing", "folding", "packing"] as const;
export type ProductionStage = typeof PRODUCTION_STAGES[number];
export interface ServiceCategory { id: string; branch_id: string; name: string; code: string; is_active: boolean; }
export interface ServiceCreatePayload { branch_id: string; category_id: string; name: string; code: string; unit: string; price: number; production_stages: string[]; }
export interface ServiceUpdatePayload { category_id?: string; name?: string; code?: string; unit?: string; price?: number; production_stages?: string[]; is_active?: boolean; }
export interface ServiceItem { id: string; branch_id: string; category_id: string; category_name: string; category_code: string; name: string; code: string; unit: string; price: number; production_stages: string[]; is_active: boolean; }
export const listServices = async (params?: { branch_id?: string; category_id?: string; include_inactive?: boolean }): Promise<ServiceItem[]> => (await apiClient.get<ServiceItem[]>("/services", { params })).data;
export const createService = async (payload: ServiceCreatePayload): Promise<ServiceItem> => (await apiClient.post<ServiceItem>("/services", payload)).data;
export const updateService = async (id: string, payload: ServiceUpdatePayload): Promise<ServiceItem> => (await apiClient.patch<ServiceItem>(`/services/${id}`, payload)).data;
export const createServiceCategory = async (payload: { branch_id: string; name: string; code: string }): Promise<ServiceCategory> => (await apiClient.post<ServiceCategory>("/services/categories", payload)).data;
export const listServiceCategories = async (branch_id?: string): Promise<ServiceCategory[]> => (await apiClient.get<ServiceCategory[]>("/services/categories", { params: { branch_id } })).data;
export const updateServiceCategory = async (id: string, payload: { name?: string; code?: string; is_active?: boolean }): Promise<ServiceCategory> => (await apiClient.patch<ServiceCategory>(`/services/categories/${id}`, payload)).data;

export interface OrderItem { id: string; service_id: string; line_number: number; service_name: string; service_code: string; unit: string; quantity: number; unit_price: number; subtotal: number; notes: string | null; }
export interface OrderListItem { id: string; branch_id: string; customer_id: string; customer_name: string; invoice_number: string; received_at: string; due_at: string | null; status: string; subtotal: number; discount: number; total: number; paid_amount: number; payment_status: string; }
export interface Order extends OrderListItem { customer_phone: string | null; payment_method: string | null; notes: string | null; items: OrderItem[]; created_at: string; updated_at: string; }
export interface OrderStatusLog { id: string; order_id: string; branch_id: string; from_status: string | null; to_status: string; changed_by_user_id: string; changed_by_name: string | null; changed_at: string; note: string | null; }
export interface OrderItemCreatePayload { service_id: string; quantity: number; notes: string | null; }
export interface OrderCreatePayload { branch_id: string; customer_id: string; received_at?: string | null; due_at?: string | null; discount: number; paid_amount: number; payment_method: string | null; notes: string | null; items: OrderItemCreatePayload[]; }
export interface OrderUpdatePayload { due_at?: string | null; discount?: number; paid_amount?: number; payment_method?: string | null; notes?: string | null; status?: string; }
export const listOrders = async (params?: { branch_id?: string; q?: string; order_status?: string; payment_status?: string }): Promise<OrderListItem[]> => (await apiClient.get<OrderListItem[]>("/orders", { params })).data;
export const getOrder = async (id: string): Promise<Order> => (await apiClient.get<Order>(`/orders/${id}`)).data;
export const getOrderHistory = async (id: string): Promise<OrderStatusLog[]> => (await apiClient.get<OrderStatusLog[]>(`/orders/${id}/history`)).data;
export const createOrder = async (payload: OrderCreatePayload): Promise<Order> => (await apiClient.post<Order>("/orders", payload)).data;
export const updateOrder = async (id: string, payload: OrderUpdatePayload): Promise<Order> => (await apiClient.patch<Order>(`/orders/${id}`, payload)).data;

export interface ProductionJob { id: string; order_id: string; branch_id: string; invoice_number: string; customer_name: string; stage: ProductionStage; status: "pending" | "in_progress" | "completed"; assigned_user_id: string | null; assigned_user_name: string | null; started_at: string | null; completed_at: string | null; notes: string | null; }
export const getProductionQueue = async (stage: string, branch_id?: string): Promise<ProductionJob[]> => (await apiClient.get<ProductionJob[]>("/production/queue", { params: { stage, branch_id } })).data;
export const claimProductionJob = async (jobId: string): Promise<ProductionJob> => (await apiClient.post<ProductionJob>(`/production/jobs/${jobId}/claim`)).data;
export const startProductionJob = async (jobId: string): Promise<ProductionJob> => (await apiClient.post<ProductionJob>(`/production/jobs/${jobId}/start`)).data;
export const completeProductionJob = async (jobId: string): Promise<ProductionJob> => (await apiClient.post<ProductionJob>(`/production/jobs/${jobId}/complete`)).data;
export const updateProductionJobNotes = async (jobId: string, notes: string | null): Promise<ProductionJob> => (await apiClient.patch<ProductionJob>(`/production/jobs/${jobId}/notes`, { notes })).data;

export interface KpiTarget { id: string; branch_id: string; stage: string; unit: string; daily_target: number; is_active: boolean; created_at: string; updated_at: string; }
export const listKpiTargets = async (branch_id?: string): Promise<KpiTarget[]> => (await apiClient.get<KpiTarget[]>("/kpi/targets", { params: { branch_id } })).data;
export const createKpiTarget = async (payload: { branch_id: string; stage: string; unit: string; daily_target: number }): Promise<KpiTarget> => (await apiClient.post<KpiTarget>("/kpi/targets", payload)).data;
export const updateKpiTarget = async (id: string, payload: { daily_target?: number; is_active?: boolean }): Promise<KpiTarget> => (await apiClient.patch<KpiTarget>(`/kpi/targets/${id}`, payload)).data;

export interface ProductionKpiSummary { period_start: string; period_end: string; completed_jobs: number; active_jobs: number; total_duration_minutes: number; average_duration_minutes: number; employees_count: number; quantity_by_unit: Record<string, number>; }
export interface ProductionKpiEmployee { user_id: string; employee_name: string; completed_jobs: number; active_jobs: number; total_duration_minutes: number; average_duration_minutes: number; active_days: number; quantity_by_unit: Record<string, number>; by_stage: Record<string, number>; quantity_by_stage: Record<string, Record<string, number>>; target_by_stage: Record<string, Record<string, number>>; achievement_by_stage: Record<string, Record<string, number>>; }
export interface ProductionKpi { summary: ProductionKpiSummary; employees: ProductionKpiEmployee[]; }
export const getProductionKpi = async (params: { start_date: string; end_date: string; branch_id?: string; user_id?: string }): Promise<ProductionKpi> => (await apiClient.get<ProductionKpi>("/kpi/production", { params })).data;

export interface KpiTargetConfig { id: string; branch_id: string; stage: string; unit: string; daily_target: number; is_active: boolean; created_at: string; updated_at: string; }
export interface FinanceSummary { period_start: string; period_end: string; revenue: number; cash_received: number; receivables: number; expenses: number; net_profit: number; order_count: number; expense_count: number; revenue_by_payment_method: Record<string, number>; expenses_by_category: Record<string, number>; }
export interface Expense { id: string; branch_id: string; transaction_date: string; category: string; description: string; amount: number; payment_method: string; notes: string | null; created_by_user_id: string; created_by_name: string | null; created_at: string; }
export const getFinanceSummary = async (params: { start_date: string; end_date: string; branch_id?: string }): Promise<FinanceSummary> => (await apiClient.get<FinanceSummary>("/finance/summary", { params })).data;
export const listExpenses = async (params?: { start_date?: string; end_date?: string; branch_id?: string }): Promise<Expense[]> => (await apiClient.get<Expense[]>("/finance/expenses", { params })).data;
export const createExpense = async (payload: { branch_id: string; transaction_date: string; category: string; description: string; amount: number; payment_method: string; notes: string | null }): Promise<Expense> => (await apiClient.post<Expense>("/finance/expenses", payload)).data;

export type BranchRole = "branch_admin" | "staff";
export interface AdminMembership { branch_id: string; branch_code: string; branch_name: string; role: BranchRole; }
export interface AdminUser { id: string; email: string; full_name: string | null; is_superadmin: boolean; is_active: boolean; last_login: string | null; created_at: string; updated_at?: string; memberships: AdminMembership[]; }
export interface MembershipInput { branch_id: string; role: BranchRole; }
export const adminListUsers = async (): Promise<AdminUser[]> => (await apiClient.get<AdminUser[]>("/users")).data;
export const adminCreateUser = async (payload: { email: string; full_name: string | null; memberships: MembershipInput[] }): Promise<{ user: AdminUser; initial_password: string }> => (await apiClient.post("/users", payload)).data;
export const adminUpdateUser = async (id: string, payload: { full_name?: string; is_active?: boolean }): Promise<AdminUser> => (await apiClient.patch<AdminUser>(`/users/${id}`, payload)).data;
export const adminUpsertMembership = async (id: string, payload: MembershipInput): Promise<AdminUser> => (await apiClient.post<AdminUser>(`/users/${id}/memberships`, payload)).data;
export const adminRemoveMembership = async (id: string, branchId: string): Promise<AdminUser> => (await apiClient.delete<AdminUser>(`/users/${id}/memberships/${branchId}`)).data;
export const adminResetPassword = async (id: string): Promise<{ initial_password: string }> => (await apiClient.post(`/users/${id}/reset-password`)).data;
