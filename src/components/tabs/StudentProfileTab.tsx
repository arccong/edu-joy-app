import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Cropper from "react-easy-crop";
import {
  IdCard,
  Loader2,
  Pencil,
  Phone,
  Mail,
  Plus,
  Star,
  Trash2,
  Wallet,
  Sparkles,
  Maximize2,
  Columns2,
  ChevronLeft,
  ChevronRight,
  Camera,
  User,
  Images,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BirthDateInput } from "@/components/ui/birth-date-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classChip, EmptyState, statusBadge } from "@/components/ui-bits";
import { NameSearchInput } from "@/components/NameSearchInput";
import { useIsMobile } from "@/hooks/use-mobile";
import { cropImageToBlob, fileToRenderableUrl, uploadPersonAvatar } from "@/lib/image-upload";
import { listLearningLogs } from "@/lib/learning.functions";
import type { LearningLog } from "@/components/tabs/LearningTab";
import {
  addScheduledDays,
  coursePrefix,
  countsTowardSessions,
  describeSlots,
  effectiveStatus,
  fmtDate,
  formatMoney,
  groupByPerson,
  slotsPerDayMap,
  toLocalISO,
  type AttendanceRow,
  type ClassType,
  type PersonGroup,
  type Student,
  type StudentStatus,
  type TrialStudent,
} from "@/lib/shared";
import { ensurePersonId, listAttendanceRange, listStudents } from "@/lib/students.functions";
import { listPayments } from "@/lib/tuition.functions";
import { listTrialStudents } from "@/lib/trials.functions";
import {
  deleteGuardian,
  listGuardianLinks,
  listPeopleProfiles,
  setPersonAvatar,
  setPrimaryGuardian,
  unlinkGuardian,
  updatePersonProfile,
  upsertGuardian,
  type Guardian,
  type GuardianLink,
  type GuardianRelationship,
  type PersonProfile,
} from "@/lib/student-profile.functions";

const RELATIONSHIPS: GuardianRelationship[] = ["Bố", "Mẹ", "Ông nội", "Bà nội", "Ông ngoại", "Bà ngoại", "Khác"];
const PAGE_SIZE = 20;
const VIEW_MODE_KEY = "student-profile-view-mode";

function calcAge(birthDateISO: string | null | undefined, fallback: number): number {
  if (!birthDateISO) return fallback;
  const b = new Date(birthDateISO + "T00:00:00");
  if (isNaN(b.getTime())) return fallback;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function StudentProfileTab() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<"popup" | "split">(() => {
    if (typeof window === "undefined") return "popup";
    return (localStorage.getItem(VIEW_MODE_KEY) as "popup" | "split") || "popup";
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);
  // Mobile luôn hiện dạng popup bất kể lựa chọn đã lưu — chỉ Desktop mới có 2 chế độ.
  const effectiveMode: "popup" | "split" = isMobile ? "popup" : viewMode;

  const fetchStudents = useServerFn(listStudents);
  const fetchAttRange = useServerFn(listAttendanceRange);
  const fetchProfiles = useServerFn(listPeopleProfiles);
  const fetchPayments = useServerFn(listPayments);
  const fetchGuardianLinks = useServerFn(listGuardianLinks);
  const fetchTrials = useServerFn(listTrialStudents);
  const fetchLearningLogs = useServerFn(listLearningLogs);

  const { data: students = [], isLoading } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchStudents() as any });
  const { data: profiles = [] } = useQuery<PersonProfile[]>({ queryKey: ["people-profiles"], queryFn: () => fetchProfiles() as any });
  const { data: payments = [] } = useQuery<any[]>({ queryKey: ["payments"], queryFn: () => fetchPayments() as any });
  const { data: guardianLinks = [] } = useQuery<GuardianLink[]>({ queryKey: ["guardian-links"], queryFn: () => fetchGuardianLinks() as any });
  const { data: trials = [] } = useQuery<TrialStudent[]>({ queryKey: ["trial-students"], queryFn: () => fetchTrials() as any });
  const { data: learningLogs = [] } = useQuery<LearningLog[]>({ queryKey: ["learning-logs"], queryFn: () => fetchLearningLogs() as any });

  // Buổi đã học / trạng thái hiện tại — cùng công thức với StudentsTab (toLocalISO, không dùng
  // .toISOString() để tránh lệch múi giờ UTC/VN đã gặp trước đây).
  const today = new Date();
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 2);
  const to = new Date(today);
  const fromISO = toLocalISO(from);
  const toISO = toLocalISO(to);
  const { data: attendedRows = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance-range", fromISO, toISO],
    queryFn: () => fetchAttRange({ data: { from: fromISO, to: toISO } }) as any,
  });
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const sessionsOnDate = (s: Student | undefined, dateISO: string) => {
    if (!s) return 1;
    const dow = new Date(dateISO + "T00:00:00").getDay();
    const n = slotsPerDayMap(s.schedule_slots ?? []).get(dow) ?? 0;
    return n > 0 ? n : 1;
  };
  const inCourse = (s: Student | undefined, dateISO: string) => {
    if (!s?.start_date) return false;
    const actualEnd = addScheduledDays(s.end_date, s.schedule_slots ?? [], s.reserve_days ?? 0);
    return dateISO >= s.start_date && (!actualEnd || dateISO <= actualEnd);
  };
  const attendedByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of attendedRows) {
      const s = studentById.get(r.student_id);
      if (countsTowardSessions(r) && inCourse(s, r.date)) m.set(r.student_id, (m.get(r.student_id) ?? 0) + sessionsOnDate(s, r.date));
    }
    return m;
  }, [attendedRows, studentById]);
  const remainOf = (s: Student) => Math.max(0, s.total_sessions - (attendedByStudent.get(s.id) ?? 0));
  const statusOf = (s: Student): StudentStatus => effectiveStatus(s.status, remainOf(s));

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const paymentsByStudentId = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of payments) {
      if (!m.has(p.student_id)) m.set(p.student_id, []);
      m.get(p.student_id)!.push(p);
    }
    return m;
  }, [payments]);
  const guardiansByPersonId = useMemo(() => {
    const m = new Map<string, GuardianLink[]>();
    for (const l of guardianLinks) {
      if (!m.has(l.person_id)) m.set(l.person_id, []);
      m.get(l.person_id)!.push(l);
    }
    return m;
  }, [guardianLinks]);
  const trialByStudentId = useMemo(() => {
    const m = new Map<string, TrialStudent>();
    for (const t of trials) if (t.converted_student_id) m.set(t.converted_student_id, t);
    return m;
  }, [trials]);
  // Ảnh (attachments kind="image") trong nhật ký học tập, nhóm theo course row (student_id) — để tổng
  // hợp lại theo TỪNG NGƯỜI (gộp qua các course id của người đó) khi mở bộ chọn ảnh đại diện.
  const journalImagesByStudentId = useMemo(() => {
    const m = new Map<string, { url: string; label: string | null; date: string }[]>();
    for (const log of learningLogs) {
      if (!log.student_id) continue;
      const imgs = (log.attachments ?? []).filter((a) => a.kind === "image").map((a) => ({ url: a.url, label: a.label ?? null, date: log.date }));
      if (imgs.length === 0) continue;
      if (!m.has(log.student_id)) m.set(log.student_id, []);
      m.get(log.student_id)!.push(...imgs);
    }
    return m;
  }, [learningLogs]);

  const groups = useMemo(() => groupByPerson(students), [students]);

  const [nameSearch, setNameSearch] = useState("");
  const filteredGroups = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const realId = g.courses[0]?.person_id;
      const code = realId ? profileById.get(realId)?.student_code : undefined;
      return g.name.toLowerCase().includes(q) || (code ?? "").toLowerCase().includes(q);
    });
  }, [groups, nameSearch, profileById]);

  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [nameSearch]);
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const pageGroups = filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const activeGroup = groups.find((g) => g.key === openKey) ?? null;

  const buildDetailProps = (g: PersonGroup): DetailProps => ({
    group: g,
    profile: g.courses[0]?.person_id ? profileById.get(g.courses[0].person_id) : undefined,
    allPaymentsByStudentId: paymentsByStudentId,
    guardians: g.courses[0]?.person_id ? guardiansByPersonId.get(g.courses[0].person_id) ?? [] : [],
    trial: g.courses.map((c) => trialByStudentId.get(c.id)).find(Boolean) ?? null,
    journalImages: g.courses.flatMap((c) => journalImagesByStudentId.get(c.id) ?? []),
    statusOf,
  });

  const listCard = (
    <Card className="flex max-h-[75vh] flex-col overflow-hidden shadow-card">
      <CardHeader className="shrink-0">
        <CardTitle>Hồ sơ học sinh</CardTitle>
        <CardDescription>Thông tin cố định, phụ huynh và tổng quan hoạt động của từng học sinh.</CardDescription>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <NameSearchInput value={nameSearch} onChange={setNameSearch} names={groups.map((g) => g.name)} className="w-full sm:w-[260px]" />
          {!isMobile && (
            <div className="flex gap-1">
              <Button size="sm" variant={viewMode === "popup" ? "default" : "ghost"} className="h-7 px-2" onClick={() => setViewMode("popup")}>
                <Maximize2 className="mr-1 h-3.5 w-3.5" />
                Full
              </Button>
              <Button size="sm" variant={viewMode === "split" ? "default" : "ghost"} className="h-7 px-2" onClick={() => setViewMode("split")}>
                <Columns2 className="mr-1 h-3.5 w-3.5" />
                2 cột
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Đang tải...
          </div>
        ) : pageGroups.length === 0 ? (
          <EmptyState text="Chưa có học sinh nào." />
        ) : effectiveMode === "split" ? (
          <div className="space-y-1">
            {pageGroups.map((g) => {
              const realId = g.courses[0]?.person_id ?? null;
              const profile = realId ? profileById.get(realId) : undefined;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setOpenKey(g.key)}
                  className={`flex w-full items-center justify-between rounded-md border p-2.5 text-left text-sm transition-colors hover:bg-muted ${
                    openKey === g.key ? "border-primary/40 bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StudentAvatar url={profile?.avatar_url} name={g.name} size={32} />
                    <div>
                      <p className="font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{profile?.student_code ?? "—"}</p>
                    </div>
                  </div>
                  <IdCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã học sinh</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Tuổi</TableHead>
                  <TableHead>Giới tính</TableHead>
                  <TableHead>Lớp đang học</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageGroups.map((g) => {
                  const realId = g.courses[0]?.person_id ?? null;
                  const profile = realId ? profileById.get(realId) : undefined;
                  const currentCourses = g.courses.filter((c) => statusOf(c) === "Đang học" || statusOf(c) === "Chuẩn bị");
                  const classesNow = Array.from(new Set(currentCourses.map((c) => c.class_type)));
                  const overallStatus: StudentStatus = currentCourses.some((c) => statusOf(c) === "Đang học")
                    ? "Đang học"
                    : statusOf(g.courses[g.courses.length - 1]);
                  return (
                    <TableRow key={g.key} className="cursor-pointer" onClick={() => setOpenKey(g.key)}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{profile?.student_code ?? "—"}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <StudentAvatar url={profile?.avatar_url} name={g.name} size={28} />
                          {g.name}
                        </div>
                      </TableCell>
                      <TableCell>{calcAge(profile?.birth_date, g.age)}</TableCell>
                      <TableCell>{profile?.gender ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {classesNow.length ? classesNow.map((c) => <span key={c}>{classChip(c)}</span>) : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(overallStatus)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t p-3 text-sm">
          <span className="text-muted-foreground">
            Trang {page}/{totalPages} · {filteredGroups.length} học sinh
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );

  if (effectiveMode === "split") {
    return (
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {listCard}
        <Card className="max-h-[75vh] overflow-y-auto shadow-card">
          <CardContent className="p-5">
            {activeGroup ? (
              <StudentProfileDetailContent {...buildDetailProps(activeGroup)} />
            ) : (
              <EmptyState text="Chọn một học sinh bên trái để xem chi tiết." />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {listCard}
      {activeGroup && <StudentProfileDialog {...buildDetailProps(activeGroup)} open={!!activeGroup} onOpenChange={(v) => !v && setOpenKey(null)} />}
    </div>
  );
}

type DetailProps = {
  group: PersonGroup;
  profile: PersonProfile | undefined;
  allPaymentsByStudentId: Map<string, any[]>;
  guardians: GuardianLink[];
  trial: TrialStudent | null;
  journalImages: { url: string; label: string | null; date: string }[];
  statusOf: (s: Student) => StudentStatus;
};

/** Ảnh đại diện học sinh — hình tròn, fallback icon người nếu chưa có ảnh. */
function StudentAvatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="shrink-0 rounded-full border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground"
      style={{ width: size, height: size }}
    >
      <User style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

function StudentProfileDialog({
  open,
  onOpenChange,
  ...detailProps
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
} & DetailProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        {/* Tên/mã/avatar đã hiển thị ngay trong nội dung bên dưới — DialogTitle ở đây chỉ phục vụ
            accessibility (trình đọc màn hình), không hiện lại trùng lặp. */}
        <DialogHeader>
          <DialogTitle className="sr-only">Hồ sơ học sinh — {detailProps.group.name}</DialogTitle>
        </DialogHeader>
        <StudentProfileDetailContent {...detailProps} />
      </DialogContent>
    </Dialog>
  );
}

function StudentProfileDetailContent({
  group,
  profile,
  allPaymentsByStudentId,
  guardians,
  trial,
  journalImages,
  statusOf,
}: DetailProps) {
  const qc = useQueryClient();
  const ensurePersonIdFn = useServerFn(ensurePersonId);
  const updateProfileFn = useServerFn(updatePersonProfile);

  const realPersonId = group.courses[0]?.person_id ?? null;
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const initMut = useMutation({
    mutationFn: () => ensurePersonIdFn({ data: { student_id: group.courses[0].id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["people-profiles"] });
      toast.success("Đã khởi tạo hồ sơ cho học sinh này.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState(false);
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? "");
  const [gender, setGender] = useState<"Nam" | "Nữ" | "">(profile?.gender ?? "");

  const saveProfileMut = useMutation({
    mutationFn: () => {
      if (!realPersonId) throw new Error("Chưa có hồ sơ để lưu");
      return updateProfileFn({ data: { person_id: realPersonId, birth_date: birthDate || null, gender: gender || null } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people-profiles"] });
      toast.success("Đã lưu thông tin");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Tổng học phí đã đóng — toàn bộ + theo từng lớp (nếu học từ 2 lớp trở lên)
  const allPayments = useMemo(() => group.courses.flatMap((c) => allPaymentsByStudentId.get(c.id) ?? []), [group, allPaymentsByStudentId]);
  const totalPaid = useMemo(() => allPayments.reduce((s, p) => s + Number(p.amount || 0), 0), [allPayments]);
  const classesInvolved = useMemo(() => Array.from(new Set(group.courses.map((c) => c.class_type))) as ClassType[], [group]);
  const paidByClass = useMemo(() => {
    return classesInvolved.map((cls) => {
      const ids = new Set(group.courses.filter((c) => c.class_type === cls).map((c) => c.id));
      const sum = allPayments.filter((p) => ids.has(p.student_id)).reduce((s, p) => s + Number(p.amount || 0), 0);
      return { cls, sum };
    });
  }, [classesInvolved, group, allPayments]);

  // Lịch sử khóa học — mới nhất trước
  const history = useMemo(() => group.courses.slice().reverse(), [group]);

  const [guardianFormOpen, setGuardianFormOpen] = useState<Guardian | "new" | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="group relative"
          onClick={() => realPersonId && setAvatarPickerOpen(true)}
          disabled={!realPersonId}
          title={realPersonId ? "Đổi ảnh đại diện" : undefined}
        >
          <StudentAvatar url={profile?.avatar_url} name={group.name} size={64} />
          {realPersonId && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </div>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{group.name}</h3>
          {profile?.student_code && (
            <Badge variant="outline" className="font-mono text-xs font-normal">
              {profile.student_code}
            </Badge>
          )}
        </div>
      </div>

      {!realPersonId ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Học sinh này chưa có hồ sơ liên kết ổn định (dữ liệu cũ) — cần khởi tạo trước khi sửa thông tin hoặc thêm phụ huynh.
          <Button size="sm" className="ml-2" onClick={() => initMut.mutate()} disabled={initMut.isPending}>
            {initMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Khởi tạo hồ sơ
          </Button>
        </div>
      ) : (
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Thông tin cơ bản</p>
            {!editing && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Sửa
              </Button>
            )}
          </div>
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label className="text-xs">Ngày sinh</Label>
                <BirthDateInput value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Giới tính</Label>
                <Select value={gender || undefined} onValueChange={(v) => setGender(v as "Nam" | "Nữ")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn giới tính" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nam">Nam</SelectItem>
                    <SelectItem value="Nữ">Nữ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button size="sm" onClick={() => saveProfileMut.mutate()} disabled={saveProfileMut.isPending}>
                  {saveProfileMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Lưu
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Hủy
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Tuổi</p>
                <p>{calcAge(profile?.birth_date, group.age)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ngày sinh</p>
                <p>{profile?.birth_date ? fmtDate(profile.birth_date) : "Chưa có"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Giới tính</p>
                <p>{profile?.gender ?? "Chưa có"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mã học sinh</p>
                <p className="font-mono">{profile?.student_code ?? "—"}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {trial && (
        <p className="text-xs text-muted-foreground">
          Đã học thử ngày {fmtDate(trial.trial_date)} ({trial.class_type}) trước khi đăng ký học chính thức.
        </p>
      )}

      {/* Tổng học phí */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Wallet className="h-4 w-4" />
          Tổng học phí đã đóng
        </p>
        <p className="text-2xl font-bold" style={{ color: "#9c5f35" }}>
          {formatMoney(totalPaid)}đ
        </p>
        {classesInvolved.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {paidByClass.map(({ cls, sum }) => (
              <span key={cls}>
                {cls}: <span className="font-medium text-foreground">{formatMoney(sum)}đ</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Lịch sử khóa học */}
      <div>
        <p className="mb-2 text-sm font-semibold">Lịch sử các khóa đã học</p>
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Khóa</TableHead>
                <TableHead>Lớp</TableHead>
                <TableHead>Lịch học</TableHead>
                <TableHead>Bắt đầu</TableHead>
                <TableHead>Kết thúc</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {coursePrefix(c.class_type)}
                    {c.course_index}
                  </TableCell>
                  <TableCell>{classChip(c.class_type)}</TableCell>
                  <TableCell className="text-sm">{describeSlots(c.schedule_slots)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(c.start_date)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(c.end_date)}</TableCell>
                  <TableCell>{statusBadge(statusOf(c))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Phụ huynh */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Phụ huynh</p>
          {realPersonId && (
            <Button size="sm" variant="outline" onClick={() => setGuardianFormOpen("new")}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Thêm phụ huynh
            </Button>
          )}
        </div>
        {guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có thông tin phụ huynh.</p>
        ) : (
          <div className="space-y-2">
            {guardians.map((l) => (
              <GuardianRow key={l.id} link={l} personId={realPersonId!} onEdit={() => setGuardianFormOpen(l.guardian)} />
            ))}
          </div>
        )}
      </div>

      {/* Placeholder — tính năng sau này */}
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Tài khoản xem nhật ký học tập</p>
        <p className="mt-0.5 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Sắp ra mắt — phụ huynh sẽ đăng nhập xem nhật ký học tập bằng hình ảnh của con tại đây.
        </p>
      </div>

      {realPersonId && guardianFormOpen && (
        <GuardianFormDialog
          personId={realPersonId}
          existing={guardianFormOpen === "new" ? undefined : guardianFormOpen}
          open={!!guardianFormOpen}
          onOpenChange={(v) => !v && setGuardianFormOpen(null)}
        />
      )}

      {realPersonId && avatarPickerOpen && (
        <AvatarPickerDialog
          personId={realPersonId}
          journalImages={journalImages}
          open={avatarPickerOpen}
          onOpenChange={setAvatarPickerOpen}
        />
      )}
    </div>
  );
}

function GuardianRow({ link, personId, onEdit }: { link: GuardianLink; personId: string; onEdit: () => void }) {
  const qc = useQueryClient();
  const setPrimaryFn = useServerFn(setPrimaryGuardian);
  const unlinkFn = useServerFn(unlinkGuardian);
  const deleteGuardianFn = useServerFn(deleteGuardian);

  const primaryMut = useMutation({
    mutationFn: () => setPrimaryFn({ data: { person_id: personId, link_id: link.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardian-links"] });
      toast.success("Đã đặt làm đầu mối liên hệ chính");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: async () => {
      await unlinkFn({ data: { link_id: link.id } });
      await deleteGuardianFn({ data: { id: link.guardian_id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardian-links"] });
      toast.success("Đã xóa phụ huynh");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const g = link.guardian;
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{g.name}</span>
          <Badge variant="outline">{g.relationship}</Badge>
          {link.is_primary && (
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
              <Star className="mr-1 h-3 w-3" />
              Liên hệ chính
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {g.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {g.phone}
            </span>
          )}
          {g.email && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {g.email}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        {!link.is_primary && (
          <Button size="sm" variant="ghost" onClick={() => primaryMut.mutate()} disabled={primaryMut.isPending}>
            Đặt chính
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive"
          onClick={() => confirm(`Xóa phụ huynh "${g.name}"?`) && removeMut.mutate()}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function GuardianFormDialog({
  personId,
  existing,
  open,
  onOpenChange,
}: {
  personId: string;
  existing?: Guardian;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(upsertGuardian);
  const [name, setName] = useState(existing?.name ?? "");
  const [relationship, setRelationship] = useState<GuardianRelationship>(existing?.relationship ?? "Mẹ");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");

  const mut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: existing?.id,
          name: name.trim(),
          relationship,
          phone: phone || null,
          email: email || null,
          person_id: existing ? undefined : personId,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardian-links"] });
      toast.success(existing ? "Đã cập nhật phụ huynh" : "Đã thêm phụ huynh");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Sửa phụ huynh" : "Thêm phụ huynh"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Họ tên</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn A" />
          </div>
          <div className="grid gap-1">
            <Label>Vai trò với học sinh</Label>
            <Select value={relationship} onValueChange={(v) => setRelationship(v as GuardianRelationship)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Số điện thoại</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" />
          </div>
          <div className="grid gap-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@vidu.com" />
          </div>
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AvatarPickerDialog({
  personId,
  journalImages,
  open,
  onOpenChange,
}: {
  personId: string;
  journalImages: { url: string; label: string | null; date: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const setAvatarFn = useServerFn(setPersonAvatar);
  const [tab, setTab] = useState<"journal" | "upload">(journalImages.length > 0 ? "journal" : "upload");

  // Ảnh trong nhật ký thường lặp lại giữa các buổi (cùng 1 ảnh gắn nhiều lần) -> lọc trùng theo url,
  // mới nhất trước.
  const uniqueImages = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; label: string | null; date: string }[] = [];
    for (const img of [...journalImages].reverse()) {
      if (seen.has(img.url)) continue;
      seen.add(img.url);
      out.push(img);
    }
    return out;
  }, [journalImages]);

  // Trạng thái crop tròn dùng CHUNG cho cả 2 nguồn ảnh (chọn từ nhật ký hoặc tải lên máy) — chọn ảnh
  // nào cũng đều phải qua bước cắt tròn trước khi lưu, để tự chọn đúng vùng muốn hiển thị, tránh bị tự
  // động cắt giữa (object-cover) không như ý.
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixelCrop, setPixelCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const resetCrop = () => {
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

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!imgUrl || !pixelCrop) throw new Error("Vui lòng chọn và cắt ảnh trước.");
      const blob = await cropImageToBlob(imgUrl, pixelCrop, 320);
      const url = await uploadPersonAvatar(personId, blob);
      await setAvatarFn({ data: { person_id: personId, avatar_url: url } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people-profiles"] });
      toast.success("Đã cập nhật ảnh đại diện.");
      resetCrop();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Cập nhật ảnh đại diện thất bại."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetCrop();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Ảnh đại diện học sinh
          </DialogTitle>
        </DialogHeader>

        {imgUrl ? (
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
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={resetCrop}>
                Chọn ảnh khác
              </Button>
              <Button size="sm" className="ml-auto" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Lưu
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1">
              <Button size="sm" variant={tab === "journal" ? "default" : "ghost"} onClick={() => setTab("journal")}>
                <Images className="mr-1 h-3.5 w-3.5" />
                Từ nhật ký
              </Button>
              <Button size="sm" variant={tab === "upload" ? "default" : "ghost"} onClick={() => setTab("upload")}>
                <Upload className="mr-1 h-3.5 w-3.5" />
                Tải ảnh lên
              </Button>
            </div>

            {tab === "journal" ? (
              uniqueImages.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Chưa có ảnh nào trong nhật ký học tập của học sinh này.</p>
              ) : (
                <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto">
                  {uniqueImages.map((img) => (
                    <button
                      key={img.url}
                      type="button"
                      className="aspect-square overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                      onClick={() => setImgUrl(img.url)}
                    >
                      <img src={img.url} alt={img.label ?? ""} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40">
                {loadingFile ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                <span>Chọn ảnh từ điện thoại/máy tính</span>
                <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
