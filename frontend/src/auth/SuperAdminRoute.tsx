import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="centered-screen">
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_superadmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default SuperAdminRoute;
