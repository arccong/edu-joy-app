import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { toast, Toaster } from "sonner";
import { GraduationCap, Users, CalendarDays, ClipboardCheck, Bell, Settings as SettingsIcon, Wallet, Loader2, Send, BookOpen, Coins, LayoutDashboard, LogOut, UserPlus, Trash2, ShieldCheck, Crown, Repeat, KeyRound, Eye, EyeOff, Camera, IdCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import { listUsers, createTeacher, createManager, updateTeacherClasses, deleteUser, transferOwnership, changeUserRole, updateOwnAvatar } from "@/lib/auth.functions";
import { fileToRenderableUrl, cropImageToBlob, uploadAvatarImage } from "@/lib/image-upload";
import { type TrialStudent } from "@/lib/shared";
import Cropper from "react-easy-crop";

import { StudentsTab } from "@/components/tabs/StudentsTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { ScheduleTab } from "@/components/tabs/ScheduleTab";
import { AttendanceTab } from "@/components/tabs/AttendanceTab";
import { TuitionTab } from "@/components/tabs/TuitionTab";
import { NotificationsTab } from "@/components/tabs/NotificationsTab";
import { LearningTab } from "@/components/tabs/LearningTab";
import { FinanceTab } from "@/components/tabs/FinanceTab";
import { DashboardTab } from "@/components/tabs/DashboardTab";

import { BrandingCard } from "@/components/BrandingCard";
import { LabelsCard } from "@/components/LabelsCard";
import { useLabel } from "@/lib/labels";
import { BrandLogo } from "@/lib/branding";

import { getTelegramStatus, saveTelegramConfig, sendCustomTelegram } from "@/lib/telegram.functions";

export const Route = createFileRoute("/_authenticated/")({
  component: App,
  head: () => ({
    meta: [
      { title: "Quản lý học sinh — Piano · Múa · Vẽ" },
      { name: "description", content: "Quản lý học sinh, thời khóa biểu, điểm danh, học phí, nhật ký học tập và tài chính cho trung tâm Piano, Múa, Vẽ." },
      { property: "og:title", content: "Quản lý học sinh — Piano · Múa · Vẽ" },
      { property: "og:description", content: "Quản lý học sinh, điểm danh, học phí và tài chính trung tâm nghệ thuật." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ALL_TABS = [
  { value: "dashboard", label: "Tổng quan", labelKey: "tab.dashboard", Icon: LayoutDashboard },
  { value: "students", label: "Học sinh", labelKey: "tab.students", Icon: Users },
  { value: "schedule", label: "Lịch học", labelKey: "tab.schedule", Icon: CalendarDays },
  { value: "attendance", label: "Điểm danh", labelKey: "tab.attendance", Icon: ClipboardCheck },
  { value: "learning", label: "Nhật ký học tập", labelKey: "tab.learning", Icon: BookOpen },
  { value: "tuition", label: "Học phí", labelKey: "tab.tuition", Icon: Wallet },
  { value: "profile", label: "Hồ sơ", labelKey: null, Icon: IdCard, managerOnly: true },
  { value: "finance", label: "Tài chính", labelKey: null, Icon: Coins, managerOnly: true },
  { value: "notifications", label: "Thông báo", labelKey: "tab.notifications", Icon: Bell },
  { value: "settings", label: "Cài đặt", labelKey: null, Icon: SettingsIcon, managerOnly: true },
] as const;

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Đã đổi mật khẩu thành công.");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Đổi mật khẩu thất bại."),
  });

  const submit = () => {
    if (newPassword.length < 6) return toast.error("Mật khẩu mới cần tối thiểu 6 ký tự.");
    if (newPassword !== confirmPassword) return toast.error("Xác nhận mật khẩu không khớp.");
    mut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setNewPassword(""); setConfirmPassword(""); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />Đổi mật khẩu</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Mật khẩu mới</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="pr-10"
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Nhập lại mật khẩu mới</Label>
            <Input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Đổi mật khẩu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvatarDialog({ open, onOpenChange, currentUrl }: { open: boolean; onOpenChange: (v: boolean) => void; currentUrl: string | null }) {
  const qc = useQueryClient();
  const access = useAccess();
  const updateAvatar = useServerFn(updateOwnAvatar);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixelCrop, setPixelCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const reset = () => {
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImgUrl(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPixelCrop(null);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && !/\.(heic|heif)$/i.test(f.name)) {
      toast.error("Vui lòng chọn 1 file ảnh.");
      return;
    }
    setLoadingFile(true);
    try {
      const url = await fileToRenderableUrl(f);
      setImgUrl(url);
    } catch {
      toast.error("Không đọc được ảnh này, thử ảnh khác.");
    } finally {
      setLoadingFile(false);
    }
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (!imgUrl || !pixelCrop) throw new Error("Vui lòng chọn và cắt ảnh trước.");
      const blob = await cropImageToBlob(imgUrl, pixelCrop, 320);
      const url = await uploadAvatarImage(access.userId, blob);
      await updateAvatar({ data: { avatar_url: url } } as any);
    },
    onSuccess: () => {
      toast.success("Đã cập nhật ảnh đại diện.");
      qc.invalidateQueries({ queryKey: ["my-access"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Cập nhật ảnh đại diện thất bại."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-primary" />Đổi ảnh đại diện</DialogTitle>
        </DialogHeader>

        {!imgUrl ? (
          <div className="grid gap-3">
            {currentUrl && (
              <div className="flex justify-center">
                <img src={currentUrl} alt="Ảnh đại diện hiện tại" className="h-24 w-24 rounded-full object-cover" />
              </div>
            )}
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40">
              {loadingFile ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
              <span>Chọn ảnh từ điện thoại/máy tính</span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="relative h-64 w-full overflow-hidden rounded-md bg-muted">
              <Cropper
                image={imgUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, areaPixels) => setPixelCrop(areaPixels)}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Thu phóng</Label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <Button variant="ghost" size="sm" className="w-fit" onClick={reset}>Chọn ảnh khác</Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={() => mut.mutate()} disabled={!imgUrl || !pixelCrop || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu ảnh đại diện
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountMenu() {
  const access = useAccess();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initial = (access.email || "?").charAt(0).toUpperCase();
  const roleLabel = access.isOwner ? "Chủ trung tâm" : access.isManager ? "Quản lý" : access.role === "giao_vien" ? "Giáo viên" : "Chưa phân quyền";

  const AvatarPic = ({ className }: { className?: string }) =>
    access.avatarUrl ? (
      <img src={access.avatarUrl} alt="Ảnh đại diện" className={cn("h-full w-full object-cover", className)} />
    ) : (
      <>{initial}</>
    );

  return (
    <>
      {/* Desktop: avatar riêng (bấm đổi ảnh) + nút email riêng (bấm mở menu) */}
      <div className="hidden items-center gap-1.5 sm:flex">
        <button
          type="button"
          onClick={() => setAvatarOpen(true)}
          title="Đổi ảnh đại diện"
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-primary-foreground transition hover:opacity-80"
        >
          <AvatarPic />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <span className="max-w-[160px] truncate">{access.email || "Tài khoản"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="space-y-1">
              <div className="truncate text-sm">{access.email}</div>
              <div className="flex flex-wrap gap-1">
                <Badge variant={access.isManager ? "default" : "secondary"}>{roleLabel}</Badge>
                {!access.isManager && access.classes.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
              <KeyRound className="mr-2 h-4 w-4" /> Đổi mật khẩu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { void handleSignOut(); }}>
              <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: chỉ 1 avatar, bấm vào mở menu đầy đủ (gồm cả mục Đổi avatar) */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Tài khoản"
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-primary-foreground transition hover:opacity-80"
            >
              <AvatarPic />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="space-y-1">
              <div className="truncate text-sm">{access.email}</div>
              <div className="flex flex-wrap gap-1">
                <Badge variant={access.isManager ? "default" : "secondary"}>{roleLabel}</Badge>
                {!access.isManager && access.classes.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setAvatarOpen(true)}>
              <Camera className="mr-2 h-4 w-4" /> Đổi ảnh đại diện
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
              <KeyRound className="mr-2 h-4 w-4" /> Đổi mật khẩu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { void handleSignOut(); }}>
              <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      <AvatarDialog open={avatarOpen} onOpenChange={setAvatarOpen} currentUrl={access.avatarUrl} />
    </>
  );
}

function App() {
  const [tab, setTab] = useState<string>("dashboard");
  // Học sinh học thử đang chờ "Đăng ký" học chính thức — bấm nút Đăng ký ở trang Học sinh sẽ set state
  // này rồi chuyển sang trang Học phí; TuitionTab đọc state này để tự mở dialog "Ghi nhận học phí" ở
  // chế độ "Học sinh mới" với thông tin điền sẵn.
  const [trialToRegister, setTrialToRegister] = useState<TrialStudent | null>(null);
  const access = useAccess();
  const t = useLabel();
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => !("managerOnly" in t && t.managerOnly) || access.isManager),
    [access.isManager],
  );

  useEffect(() => {
    if (!access.loading && !tabs.some((t) => t.value === tab)) setTab("dashboard");
  }, [access.loading, tabs, tab]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Toaster position="top-right" richColors />
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <BrandLogo
            className="h-9 w-auto max-w-[132px] shrink-0 object-contain sm:h-11 sm:max-w-[164px]"
            fallback={
              <div className="flex h-9 w-[108px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-card sm:h-11 sm:w-[132px]">
                <GraduationCap className="h-5 w-5" />
              </div>
            }
          />

          <div className="min-w-0">
            <h1
              className="truncate text-lg font-bold sm:text-xl"
              style={{ fontFamily: `"${t("app.font")}", var(--font-sans)` }}
            >
              {t("app.name")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
          </div>
          <div className="ml-auto"><AccountMenu /></div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          {/* Mobile: dropdown gọn */}
          <div className="sm:hidden">
            <Select value={tab} onValueChange={setTab}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tabs.map(({ value, label, labelKey, Icon }) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{labelKey ? t(labelKey) : label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tablet/Desktop */}
          <TabsList className="hidden h-auto w-full gap-1 sm:flex">
            {tabs.map(({ value, label, labelKey, Icon }) => (
              <TabsTrigger key={value} value={value} className="min-w-0 flex-1 py-1.5">
                <Icon className="mr-1 h-4 w-4 shrink-0" />
                <span className="truncate">{labelKey ? t(labelKey) : label}</span>
              </TabsTrigger>
            ))}
          </TabsList>


          <TabsContent value="dashboard"><DashboardTab onNavigate={setTab} /></TabsContent>
          <TabsContent value="students" forceMount className={tab === "students" ? "" : "hidden"}>
            <StudentsTab
              onRegisterTrial={(trial) => {
                setTrialToRegister(trial);
                setTab("tuition");
              }}
            />
          </TabsContent>
          <TabsContent value="schedule" forceMount className={tab === "schedule" ? "" : "hidden"}><ScheduleTab /></TabsContent>
          <TabsContent value="attendance" forceMount className={tab === "attendance" ? "" : "hidden"}><AttendanceTab /></TabsContent>
          <TabsContent value="learning" forceMount className={tab === "learning" ? "" : "hidden"}><LearningTab /></TabsContent>
          <TabsContent value="tuition" forceMount className={tab === "tuition" ? "" : "hidden"}>
            <TuitionTab
              pendingTrialRegistration={trialToRegister}
              onConsumePendingTrial={() => setTrialToRegister(null)}
            />
          </TabsContent>
          <TabsContent value="profile" forceMount className={tab === "profile" ? "" : "hidden"}>
            <ProfileTab />
          </TabsContent>
          <TabsContent value="finance"><FinanceTab /></TabsContent>
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
          <TabsContent value="settings">
            <div className="space-y-6">
              {access.isOwner ? (
                <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
                  <AdminAccountsCard />
                  <UsersCard />
                  <TransferOwnershipCard />
                  <TelegramCard />
                </div>
              ) : (
                <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
                  <UsersCard />
                  <TelegramCard />
                </div>
              )}
              {access.isOwner && <BrandingCard />}
              {access.isOwner && <LabelsCard />}
            </div>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}

const CLASS_OPTIONS = ["Piano", "Múa", "Vẽ"] as const;

type UserRow = { id: string; email: string | null; full_name: string | null; role: string | null; is_owner: boolean; classes: string[] };

function roleLabel(u: UserRow) {
  if (u.is_owner) return "Chủ trung tâm";
  if (u.role === "quan_ly") return "Quản lý";
  if (u.role === "giao_vien") return "Giáo viên";
  return "Chưa phân quyền";
}

function useUsers() {
  const fetchUsers = useServerFn(listUsers);
  return useQuery<UserRow[]>({ queryKey: ["users"], queryFn: () => fetchUsers() as any });
}

function DeleteUserButton({ user, onDelete, disabled }: { user: UserRow; onDelete: (id: string) => void; disabled?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive" disabled={disabled}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa tài khoản?</AlertDialogTitle>
          <AlertDialogDescription>
            Tài khoản {user.email} sẽ bị xóa vĩnh viễn và không thể đăng nhập nữa.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction onClick={() => onDelete(user.id)}>Xóa</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Chỉ Chủ trung tâm: đổi vai trò Quản lý ↔ Giáo viên */
function ChangeRoleButton({ user }: { user: UserRow }) {
  const qc = useQueryClient();
  const change = useServerFn(changeUserRole);
  const target: "quan_ly" | "giao_vien" = user.role === "quan_ly" ? "giao_vien" : "quan_ly";
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(user.classes ?? []);

  const mut = useMutation({
    mutationFn: () => change({ data: { user_id: user.id, role: target, classes: target === "giao_vien" ? picked : [] } as any }),
    onSuccess: () => {
      toast.success(target === "giao_vien" ? "Đã chuyển thành Giáo viên" : "Đã chuyển thành Quản lý");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["my-access"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (user.is_owner) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setPicked(user.classes ?? []); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Repeat className="mr-2 h-4 w-4" />
          {target === "giao_vien" ? "Chuyển thành Giáo viên" : "Chuyển thành Quản lý"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Đổi vai trò tài khoản</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tài khoản <span className="font-medium text-foreground">{user.full_name || user.email}</span> sẽ chuyển từ{" "}
            <span className="font-medium text-foreground">{user.role === "quan_ly" ? "Quản lý" : "Giáo viên"}</span> sang{" "}
            <span className="font-medium text-foreground">{target === "quan_ly" ? "Quản lý" : "Giáo viên"}</span>.
          </p>
          <div className="rounded-lg border border-[color:var(--warning)]/40 bg-muted/40 p-3 text-sm">
            ⚠️ Quyền truy cập của tài khoản này sẽ thay đổi ngay lập tức sau khi lưu.
            {target === "quan_ly"
              ? " Các lớp phụ trách hiện tại sẽ bị gỡ bỏ."
              : " Tài khoản sẽ chỉ còn xem/sửa được dữ liệu của các lớp được chọn."}
          </div>
          {target === "giao_vien" && (
            <div className="grid gap-2">
              <Label>Lớp phụ trách (bắt buộc)</Label>
              <div className="flex flex-wrap gap-4">
                {CLASS_OPTIONS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={picked.includes(c)}
                      onCheckedChange={(v) => setPicked((prev) => (v ? [...prev, c] : prev.filter((x) => x !== c)))}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || (target === "giao_vien" && picked.length === 0)}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Xác nhận đổi vai trò
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function UsersCard() {
  const access = useAccess();
  const qc = useQueryClient();
  const addTeacher = useServerFn(createTeacher);
  const setClasses = useServerFn(updateTeacherClasses);
  const removeUser = useServerFn(deleteUser);

  const { data: users, isLoading } = useUsers();
  const teachers = (users ?? []).filter((u) => u.role === "giao_vien");

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [classes, setClassesState] = useState<string[]>([]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: () => addTeacher({ data: { email, password, full_name: fullName || undefined, classes } as any }),
    onSuccess: () => {
      toast.success("Đã tạo tài khoản Giáo viên");
      setOpen(false); setEmail(""); setPassword(""); setFullName(""); setClassesState([]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleClass = useMutation({
    mutationFn: (v: { user_id: string; classes: string[] }) => setClasses({ data: v as any }),
    onSuccess: () => { toast.success("Đã cập nhật lớp phụ trách"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (user_id: string) => removeUser({ data: { user_id } as any }),
    onSuccess: () => { toast.success("Đã xóa tài khoản"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Tài khoản Giáo viên</CardTitle>
            <CardDescription>Tạo và phân lớp phụ trách cho Giáo viên</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="mr-2 h-4 w-4" />Thêm Giáo viên</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Thêm tài khoản Giáo viên</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-1">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="giaovien@email.com" />
                </div>
                <div className="grid gap-1">
                  <Label>Mật khẩu (tối thiểu 6 ký tự)</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label>Họ tên</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Lớp phụ trách</Label>
                  <div className="flex flex-wrap gap-4">
                    {CLASS_OPTIONS.map((c) => (
                      <label key={c} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={classes.includes(c)}
                          onCheckedChange={(v) => setClassesState((prev) => (v ? [...prev, c] : prev.filter((x) => x !== c)))}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => create.mutate()}
                  disabled={create.isPending || !email || password.length < 6 || classes.length === 0}
                >
                  {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tạo tài khoản
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {!isLoading && teachers.length === 0 && <p className="text-sm text-muted-foreground">Chưa có tài khoản Giáo viên nào.</p>}
        {teachers.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.full_name || u.email}</div>
              <div className="truncate text-xs text-muted-foreground">{u.email}</div>
            </div>
            <Badge variant="secondary">Giáo viên</Badge>
            <div className="flex flex-wrap gap-3">
              {CLASS_OPTIONS.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={u.classes.includes(c)}
                    disabled={toggleClass.isPending}
                    onCheckedChange={(v) =>
                      toggleClass.mutate({
                        user_id: u.id,
                        classes: v ? [...u.classes, c] : u.classes.filter((x) => x !== c),
                      })
                    }
                  />
                  {c}
                </label>
              ))}
            </div>
            {access.isOwner && <ChangeRoleButton user={u} />}
            <DeleteUserButton user={u} onDelete={(id) => del.mutate(id)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Chỉ Chủ trung tâm thấy: quản lý tài khoản Chủ trung tâm / Quản lý */
function AdminAccountsCard() {
  const access = useAccess();
  const qc = useQueryClient();
  const addManager = useServerFn(createManager);
  const removeUser = useServerFn(deleteUser);

  const { data: users, isLoading } = useUsers();
  const admins = (users ?? []).filter((u) => u.role === "quan_ly");

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: () => addManager({ data: { email, password, full_name: fullName || undefined } as any }),
    onSuccess: () => {
      toast.success("Đã tạo tài khoản Quản lý");
      setOpen(false); setEmail(""); setPassword(""); setFullName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (user_id: string) => removeUser({ data: { user_id } as any }),
    onSuccess: () => { toast.success("Đã xóa tài khoản"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-primary" />Tài khoản Chủ trung tâm & Quản lý</CardTitle>
            <CardDescription>Chỉ Chủ trung tâm thấy và thao tác được mục này</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="mr-2 h-4 w-4" />Thêm Quản lý</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Thêm tài khoản Quản lý</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-1">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="quanly@email.com" />
                </div>
                <div className="grid gap-1">
                  <Label>Mật khẩu (tối thiểu 6 ký tự)</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label>Họ tên</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending || !email || password.length < 6}>
                  {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tạo tài khoản
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {admins.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.full_name || u.email}</div>
              <div className="truncate text-xs text-muted-foreground">{u.email}</div>
            </div>
            <Badge variant={u.is_owner ? "default" : "secondary"}>{roleLabel(u)}</Badge>
            {u.is_owner ? (
              <span className="text-xs text-muted-foreground">Không thể xóa</span>
            ) : (
              <>
                <ChangeRoleButton user={u} />
                <DeleteUserButton user={u} onDelete={(id) => del.mutate(id)} disabled={u.id === access.userId} />
              </>
            )}

          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Chỉ Chủ trung tâm thấy: chuyển giao quyền */
function TransferOwnershipCard() {
  const qc = useQueryClient();
  const transfer = useServerFn(transferOwnership);
  const { data: users } = useUsers();
  const candidates = (users ?? []).filter((u) => u.role === "quan_ly" && !u.is_owner);

  const [target, setTarget] = useState("");
  const [password, setPassword] = useState("");

  const mut = useMutation({
    mutationFn: () => transfer({ data: { new_owner_id: target, password } as any }),
    onSuccess: () => {
      toast.success("Đã chuyển giao quyền Chủ trung tâm");
      setTarget(""); setPassword("");
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["my-access"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-card border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-destructive" />Chuyển giao quyền Chủ trung tâm</CardTitle>
        <CardDescription>
          Hành động này <span className="font-semibold text-destructive">không thể tự hoàn tác</span>. Sau khi chuyển giao, bạn trở thành Quản lý và chỉ Chủ trung tâm mới có thể chuyển lại quyền cho bạn.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có tài khoản Quản lý nào để chuyển giao. Hãy tạo tài khoản Quản lý trước.</p>
        ) : (
          <>
            <div className="grid gap-1">
              <Label>Chọn tài khoản Quản lý nhận quyền</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue placeholder="Chọn tài khoản" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name ? `${u.full_name} — ${u.email}` : u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Nhập lại mật khẩu hiện tại của bạn để xác nhận</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!target || !password || mut.isPending}>
                  {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Chuyển giao quyền
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xác nhận chuyển giao quyền Chủ trung tâm?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tài khoản được chọn sẽ trở thành Chủ trung tâm. Tài khoản của bạn tự động chuyển thành Quản lý — vẫn dùng app bình thường nhưng mất quyền quản lý tài khoản Chủ trung tâm/Quản lý. Bạn không thể tự lấy lại quyền này.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction onClick={() => mut.mutate()}>Tôi hiểu, chuyển giao</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}


function TelegramCard() {

  const fetchStatus = useServerFn(getTelegramStatus);
  const save = useServerFn(saveTelegramConfig);
  const sendTest = useServerFn(sendCustomTelegram);
  const qc = useQueryClient();
  const { data } = useQuery<{ configured: boolean; chat_id: string | null }>({ queryKey: ["tg-status"], queryFn: () => fetchStatus() as any });

  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  useEffect(() => { if (data?.chat_id) setChatId(data.chat_id); }, [data?.chat_id]);

  const mut = useMutation({
    mutationFn: () => save({ data: { bot_token: botToken || null, chat_id: chatId || null } as any }),
    onSuccess: () => { toast.success("Đã lưu cấu hình Telegram"); qc.invalidateQueries({ queryKey: ["tg-status"] }); setBotToken(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: () => sendTest({ data: { text: "🔔 Test kết nối Telegram từ hệ thống Quản lý học sinh." } }),
    onSuccess: () => toast.success("Đã gửi tin nhắn thử"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SettingsIcon className="h-5 w-5 text-primary" />Cấu hình Telegram</CardTitle>
        <CardDescription>
          Trạng thái: {data?.configured ? <span className="font-semibold text-[color:var(--success)]">Đã cấu hình</span> : <span className="text-muted-foreground">Chưa cấu hình</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1">
          <Label>Bot Token</Label>
          <Input type="password" placeholder={data?.configured ? "•••••••••• (để trống nếu không đổi)" : "123456:ABC-..."} value={botToken} onChange={(e) => setBotToken(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label>Chat ID nhóm</Label>
          <Input placeholder="-1001234567890" value={chatId} onChange={(e) => setChatId(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Lưu cấu hình
          </Button>
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !data?.configured}>
            {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Gửi thử
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
