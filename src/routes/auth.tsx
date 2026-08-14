import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { Eye, EyeOff, GraduationCap, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/lib/branding";
import { useLabel } from "@/lib/labels";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFirstManager, managerExists } from "@/lib/auth.functions";
import { useBrand } from "@/lib/branding";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Đăng nhập — Quản lý học sinh Piano · Múa · Vẽ" },
      { name: "description", content: "Đăng nhập hệ thống quản lý học sinh, điểm danh, học phí và tài chính của trung tâm nghệ thuật." },
      { property: "og:title", content: "Đăng nhập — Quản lý học sinh" },
      { property: "og:description", content: "Đăng nhập để quản lý học sinh, điểm danh và học phí." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const t = useLabel();
  const { data: brand } = useBrand();
  const hideTitle = !!brand?.hide_login_title;
  const checkManager = useServerFn(managerExists);
  const setupManager = useServerFn(createFirstManager);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { data: mgr, refetch } = useQuery<{ exists: boolean }>({
    queryKey: ["manager-exists"],
    queryFn: () => checkManager() as any,
  });
  const setupMode = mgr?.exists === false;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const login = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "Email hoặc mật khẩu không đúng" : error.message);
    },
    onSuccess: () => {
      toast.success("Đăng nhập thành công");
      navigate({ to: "/", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setup = useMutation({
    mutationFn: async () => {
      await setupManager({ data: { email: email.trim(), password, full_name: fullName || undefined } as any });
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Đã tạo tài khoản Quản lý");
      refetch();
      navigate({ to: "/", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = login.isPending || setup.isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 px-4">
      <Toaster position="top-right" richColors />
      <div className="w-full max-w-md space-y-10">
        <div className="flex flex-col items-center space-y-2 text-center">
          <BrandLogo
            className="h-16 w-auto max-w-[240px] object-contain"
            fallback={
              <div className="flex h-16 w-[180px] items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <GraduationCap className="h-5 w-5" />
              </div>
            }
          />
          {(!hideTitle || setupMode) && (
            <h1 className="text-lg font-semibold text-foreground">
              {setupMode ? "Tạo tài khoản Quản lý đầu tiên" : t("auth.title")}
            </h1>
          )}
          <p className="text-sm text-muted-foreground">
            {setupMode
              ? "Hệ thống chưa có tài khoản Quản lý. Hãy tạo tài khoản chủ trung tâm."
              : t("auth.subtitle")}
          </p>
        </div>

        <div className="space-y-4">
          {setupMode && (
            <div className="grid gap-1">
              <Label>Họ tên</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
            </div>
          )}
          <div className="grid gap-1">
            <Label>Email</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@vidu.com"
              className="bg-card"
            />
          </div>
          <div className="grid gap-1">
            <Label>Mật khẩu</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete={setupMode ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !pending) (setupMode ? setup : login).mutate();
                }}
                placeholder="••••••"
                className="bg-card pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button
            className="w-full rounded-full"
            disabled={pending || !email || password.length < 6}
            onClick={() => (setupMode ? setup : login).mutate()}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : setupMode ? (
              <ShieldCheck className="mr-2 h-4 w-4" />
            ) : (
              <LogIn className="mr-2 h-4 w-4" />
            )}
            {setupMode ? "Tạo tài khoản Quản lý" : "Đăng nhập"}
          </Button>
        </div>
      </div>
    </div>
  );
}
