import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, type MyAccess } from "@/lib/auth.functions";

type Access = {
  loading: boolean;
  userId: string;
  email: string;
  role: "quan_ly" | "giao_vien" | null;
  isManager: boolean;
  /** Chủ trung tâm: Quản lý + quyền quản lý tài khoản Owner/Manager */
  isOwner: boolean;
  /** Các lớp được phép xem/sửa */
  classes: string[];
  /** Chỉ Quản lý mới được xóa dữ liệu */
  canDelete: boolean;
  avatarUrl: string | null;
};

const Ctx = createContext<Access>({
  loading: true,
  userId: "",
  email: "",
  role: null,
  isManager: false,
  isOwner: false,
  classes: [],
  canDelete: false,
  avatarUrl: null,
});

export function AccessProvider({ children }: { children: ReactNode }) {
  const fetchAccess = useServerFn(getMyAccess);
  const { data, isLoading } = useQuery<MyAccess>({
    queryKey: ["my-access"],
    queryFn: () => fetchAccess() as any,
    staleTime: 5 * 60 * 1000,
  });

  const isManager = data?.role === "quan_ly";
  const value: Access = {
    loading: isLoading,
    userId: data?.userId ?? "",
    email: data?.email ?? "",
    role: data?.role ?? null,
    isManager,
    isOwner: Boolean(data?.isOwner),
    classes: data?.classes ?? [],
    canDelete: isManager,
    avatarUrl: data?.avatarUrl ?? null,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}


export function useAccess() {
  return useContext(Ctx);
}
