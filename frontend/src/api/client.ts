import axios from "axios";

const backendUrl = process.env.REACT_APP_BACKEND_URL;

export const apiClient = axios.create({
  baseURL: `${backendUrl}/api`,
  headers: { "Content-Type": "application/json" },
});

export interface HealthResponse {
  status: string;
  service: string;
  database: string;
  environment: string;
}

export const getHealth = async (): Promise<HealthResponse> => {
  const { data } = await apiClient.get<HealthResponse>("/health");
  return data;
};
