import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Cropper from "react-easy-crop";
import {
  Loader2,
  Pencil,
  Mail,
  MapPin,
  Plus,
  Trash2,
  Wallet,
  CalendarOff,
  CalendarDays,
  Maximize2,
  Columns2,
  ChevronLeft,
  ChevronRight,
  Camera,
  User,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { BirthDateInput } from "@/components/ui/birth-date-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classChip, EmptyState } from "@/components/ui-bits";
import { NameSearchInput } from "@/components/NameSearchInput";
import { useIsMobile } from "@/hooks/use-mobile";
import { cropImageToBlob, fileToRenderableUrl, uploadPersonAvatar } from "@/lib/image-upload";
import {
  DAYS,
  DAYS_ORDER,
  addScheduledDays,
  countsTowardSessions,
  formatMoney,
  fmtDate,
  hhmm,
  parseMoney,
  slotsPerDayMap,
  toLocalISO,
  type AttendanceRow,
  type ClassType,
  type Student,
  fmtMonth,
} from "@/lib/shared";
import { listAttendanceRange, listStudents } from "@/lib/students.functions";
import { listFinanceEntries } from "@/lib/finance.functions";
import {
  deleteTeacherLeave,
  ensureTeacherCode,
  listClassScheduleTeachers,
  listTeacherLeaves,
  listTeachers,
  setTeacherAvatar,
  updateTeacherProfile,
  upsertTeacherLeave,
  type TeacherProfile,
} from "@/lib/teacher-profile.functions";

const PAGE_SIZE = 20;
const VIEW_MODE_KEY = "teacher-profile-view-mode";

type TeacherSlot = { class_type: ClassType; day_of_week: number; start_time: string; end_time: string };
type ClassScheduleTeacherLink = TeacherSlot & { id: string; teacher_id: string };
type TeacherLeave = { id: string; teacher_id: string; start_date: string; end_date: string; reason: string | null };
type TeacherWithClasses = TeacherProfile & { classes: ClassType[] };

function slotKey(s: TeacherSlot): string {
  return `${s.class_type}|${s.day_of_week}|${s.start_time}|${s.end_time}`;
}

function calcAge(birthDateISO: string | null | undefined): number | null {
  if (!birthDateISO) return null;
  const b = new Date(birthDateISO + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Ngày đầu tuần (Thứ 2) chứa ngày cho trước */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay(); // 0=CN
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Số ngày (số buổi lịch, tính cả 2 đầu) mà [aStart,aEnd] chồng lấn với [bStart,bEnd] */
function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  if (s > e) return 0;
  const ms = new Date(e + "T00:00:00").getTime() - new Date(s + "T00:00:00").getTime();
  return Math.round(ms / 86400000) + 1;
}

function TeacherAvatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return <img src={url} alt={name} className="shrink-0 rounded-full border object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground" style={{ width: size, height: size }}>
      <User style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

export function TeacherProfileTab() {
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
  const effectiveMode: "popup" | "split" = isMobile ? "popup" : viewMode;

  const fetchTeachers = useServerFn(listTeachers);
  const fetchStudents = useServerFn(listStudents);
  const fetchAttRange = useServerFn(listAttendanceRange);
  const fetchLinks = useServerFn(listClassScheduleTeachers);
  const fetchLeaves = useServerFn(listTeacherLeaves);
  const fetchFinanceEntries = useServerFn(listFinanceEntries);

  const { data: teachers = [], isLoading } = useQuery<TeacherWithClasses[]>({ queryKey: ["teachers"], queryFn: () => fetchTeachers() as any });
  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchStudents() as any });
  const { data: links = [] } = useQuery<ClassScheduleTeacherLink[]>({ queryKey: ["class-schedule-teachers"], queryFn: () => fetchLinks() as any });
  const { data: leaves = [] } = useQuery<TeacherLeave[]>({ queryKey: ["teacher-leaves"], queryFn: () => fetchLeaves() as any });
  const { data: financeEntries = [] } = useQuery<any[]>({ queryKey: ["finance-entries"], queryFn: () => fetchFinanceEntries() as any });

  const today = new Date();
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 2);
  const fromISO = toLocalISO(from);
  const toISO = toLocalISO(today);
  const { data: attendedRows = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance-range", fromISO, toISO],
    queryFn: () => fetchAttRange({ data: { from: fromISO, to: toISO } }) as any,
  });

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const inCourse = (s: Student | undefined, dateISO: string) => {
    if (!s?.start_date) return false;
    const actualEnd = addScheduledDays(s.end_date, s.schedule_slots ?? [], s.reserve_days ?? 0);
    return dateISO >= s.start_date && (!actualEnd || dateISO <= actualEnd);
  };

  const [nameSearch, setNameSearch] = useState("");
  const filteredTeachers = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => (t.full_name ?? "").toLowerCase().includes(q) || (t.teacher_code ?? "").toLowerCase().includes(q) || (t.email ?? "").toLowerCase().includes(q));
  }, [teachers, nameSearch]);

  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [nameSearch]);
  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / PAGE_SIZE));
  const pageTeachers = filteredTeachers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [openId, setOpenId] = useState<string | null>(null);
  const activeTeacher = teachers.find((t) => t.id === openId) ?? null;

  const buildDetailProps = (t: TeacherWithClasses): TeacherDetailProps => ({
    teacher: t,
    links: links.filter((l) => l.teacher_id === t.id),
    leaves: leaves.filter((l) => l.teacher_id === t.id),
    financeEntries: financeEntries.filter((e: any) => e.teacher_id === t.id && e.kind === "chi"),
    students,
    attendedRows,
    studentById,
    inCourse,
  });

  const listCard = (
    <Card className="flex max-h-[75vh] flex-col overflow-hidden shadow-card">
      <CardHeader className="shrink-0">
        <CardTitle>Hồ sơ giáo viên</CardTitle>
        <CardDescription>Thông tin cố định, ca dạy, buổi đã dạy, nghỉ phép và lương thưởng của từng giáo viên.</CardDescription>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <NameSearchInput value={nameSearch} onChange={setNameSearch} names={teachers.map((t) => t.full_name ?? "")} className="w-full sm:w-[260px]" />
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
        ) : pageTeachers.length === 0 ? (
          <EmptyState text="Chưa có giáo viên nào." />
        ) : effectiveMode === "split" ? (
          <div className="space-y-1">
            {pageTeachers.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpenId(t.id)}
                className={`flex w-full items-center gap-2 rounded-md border p-2.5 text-left text-sm transition-colors hover:bg-muted ${
                  openId === t.id ? "border-primary/40 bg-primary/5" : ""
                }`}
              >
                <TeacherAvatar url={t.avatar_url} name={t.full_name ?? t.email ?? ""} size={32} />
                <div>
                  <p className="font-medium">{t.full_name || t.email}</p>
                  <p className="text-xs text-muted-foreground">{t.teacher_code ?? "—"}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã giáo viên</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Lớp phụ trách</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageTeachers.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenId(t.id)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.teacher_code ?? "—"}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <TeacherAvatar url={t.avatar_url} name={t.full_name ?? t.email ?? ""} size={28} />
                        {t.full_name || "(chưa đặt tên)"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.classes.length ? t.classes.map((c) => <span key={c}>{classChip(c)}</span>) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t p-3 text-sm">
          <span className="text-muted-foreground">
            Trang {page}/{totalPages} · {filteredTeachers.length} giáo viên
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
            {activeTeacher ? <TeacherProfileDetailContent {...buildDetailProps(activeTeacher)} /> : <EmptyState text="Chọn một giáo viên bên trái để xem chi tiết." />}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {listCard}
      {activeTeacher && (
        <Dialog open={!!activeTeacher} onOpenChange={(v) => !v && setOpenId(null)}>
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="sr-only">Hồ sơ giáo viên — {activeTeacher.full_name}</DialogTitle>
            </DialogHeader>
            <TeacherProfileDetailContent {...buildDetailProps(activeTeacher)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

type TeacherDetailProps = {
  teacher: TeacherWithClasses;
  links: ClassScheduleTeacherLink[];
  leaves: TeacherLeave[];
  financeEntries: any[];
  students: Student[];
  attendedRows: AttendanceRow[];
  studentById: Map<string, Student>;
  inCourse: (s: Student | undefined, dateISO: string) => boolean;
};

function TeacherProfileDetailContent({ teacher, links, leaves, financeEntries, students, attendedRows, studentById, inCourse }: TeacherDetailProps) {
  const qc = useQueryClient();
  const ensureCodeFn = useServerFn(ensureTeacherCode);
  const updateProfileFn = useServerFn(updateTeacherProfile);

  useEffect(() => {
    if (!teacher.teacher_code) {
      ensureCodeFn({ data: { teacher_id: teacher.id } }).then(() => qc.invalidateQueries({ queryKey: ["teachers"] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.id, teacher.teacher_code]);

  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [birthDate, setBirthDate] = useState(teacher.birth_date ?? "");
  const [gender, setGender] = useState<"Nam" | "Nữ" | "">(teacher.gender ?? "");
  const [address, setAddress] = useState(teacher.address ?? "");

  const saveMut = useMutation({
    mutationFn: () => updateProfileFn({ data: { teacher_id: teacher.id, birth_date: birthDate || null, gender: gender || null, address: address || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      toast.success("Đã lưu thông tin");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Ca dạy trong tuần — chính là các dòng đã gán (links) của giáo viên này, sắp theo thứ rồi giờ.
  const myShifts = useMemo(
    () => links.slice().sort((a, b) => DAYS_ORDER.indexOf(a.day_of_week) - DAYS_ORDER.indexOf(b.day_of_week) || a.start_time.localeCompare(b.start_time)),
    [links],
  );

  // Buổi đã dạy = số cặp (ca, ngày) có ít nhất 1 học sinh được điểm danh (tính buổi) đúng vào ca đó.
  // So khớp theo CHỒNG LẤN giờ (không phải trùng khớp tuyệt đối) — vì 1 ca gán cho giáo viên luôn là
  // khối 1 giờ (theo đúng từng hàng trên Thời khóa biểu), trong khi 1 học sinh có thể vẫn lưu nguyên 1
  // khối 2 giờ liền (VD 09:00-11:00) trong lịch học của họ; khối 2 giờ đó chồng lấn với CẢ 2 ca 1 giờ
  // (09:00-10:00 và 10:00-11:00), nên cần tính chồng lấn thay vì đòi khớp y hệt.
  const taughtDates = useMemo(() => {
    const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;
    const out: { slotKey: string; date: string }[] = [];
    for (const slot of myShifts) {
      const matchingIds = new Set(
        students
          .filter((s) => s.class_type === slot.class_type && (s.schedule_slots ?? []).some((sl) => sl.day === slot.day_of_week && overlaps(sl.start, sl.end, slot.start_time, slot.end_time)))
          .map((s) => s.id),
      );
      if (matchingIds.size === 0) continue;
      const seenDates = new Set<string>();
      for (const r of attendedRows) {
        if (!matchingIds.has(r.student_id) || seenDates.has(r.date)) continue;
        if (!countsTowardSessions(r)) continue;
        const s = studentById.get(r.student_id);
        if (!inCourse(s, r.date)) continue;
        if (new Date(r.date + "T00:00:00").getDay() !== slot.day_of_week) continue;
        seenDates.add(r.date);
        out.push({ slotKey: slotKey(slot), date: r.date });
      }
    }
    return out;
  }, [myShifts, students, attendedRows, studentById, inCourse]);

  const now = new Date();
  const todayISO = toLocalISO(now);
  const weekStartISO = toLocalISO(startOfWeek(now));
  const monthPrefix = todayISO.slice(0, 7);
  const yearPrefix = todayISO.slice(0, 4);
  const taughtCount = {
    today: taughtDates.filter((d) => d.date === todayISO).length,
    week: taughtDates.filter((d) => d.date >= weekStartISO && d.date <= todayISO).length,
    month: taughtDates.filter((d) => d.date.slice(0, 7) === monthPrefix).length,
    year: taughtDates.filter((d) => d.date.slice(0, 4) === yearPrefix).length,
  };

  // Nghỉ phép — số NGÀY nghỉ chồng lấn với tuần/tháng/năm hiện tại.
  const monthStartISO = `${monthPrefix}-01`;
  const monthEndISO = toLocalISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const yearStartISO = `${yearPrefix}-01-01`;
  const yearEndISO = `${yearPrefix}-12-31`;
  const leaveDaysIn = (aStart: string, aEnd: string) => leaves.reduce((sum, l) => sum + overlapDays(l.start_date, l.end_date, aStart, aEnd), 0);
  const leaveCount = {
    week: leaveDaysIn(weekStartISO, todayISO),
    month: leaveDaysIn(monthStartISO, monthEndISO),
    year: leaveDaysIn(yearStartISO, yearEndISO),
  };

  const [leaveFormOpen, setLeaveFormOpen] = useState<TeacherLeave | "new" | null>(null);

  // Tổng lương đã nhận — từ finance_entries (khoản "Chi lương" nhập ở Tab Tài chính), hiển thị lại ở
  // đây, không nhập liệu tại Hồ sơ.
  const salaryTotal = financeEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const salaryRows = financeEntries.slice().sort((a, b) => String(b.month).localeCompare(String(a.month)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="group relative" onClick={() => setAvatarPickerOpen(true)} title="Đổi ảnh đại diện">
          <TeacherAvatar url={teacher.avatar_url} name={teacher.full_name ?? ""} size={64} />
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{teacher.full_name || "(chưa đặt tên)"}</h3>
          {teacher.teacher_code && (
            <Badge variant="outline" className="font-mono text-xs font-normal">
              {teacher.teacher_code}
            </Badge>
          )}
        </div>
      </div>

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
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs">Địa chỉ hiện tại</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Số nhà, đường, phường/xã, tỉnh/thành..." />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
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
              <p>{calcAge(teacher.birth_date) ?? "Chưa có"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ngày sinh</p>
              <p>{teacher.birth_date ? fmtDate(teacher.birth_date) : "Chưa có"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Giới tính</p>
              <p>{teacher.gender ?? "Chưa có"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="flex items-center gap-1 truncate">
                <Mail className="h-3 w-3 shrink-0" />
                {teacher.email}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <p className="text-xs text-muted-foreground">Địa chỉ hiện tại</p>
              <p className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {teacher.address || "Chưa có"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Lớp phụ trách */}
      <div>
        <p className="mb-2 text-sm font-semibold">Lớp phụ trách</p>
        <div className="flex flex-wrap gap-1">
          {teacher.classes.length ? teacher.classes.map((c) => <span key={c}>{classChip(c)}</span>) : <span className="text-sm text-muted-foreground">Chưa phân lớp.</span>}
        </div>
      </div>

      {/* Ca dạy trong tuần */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="h-4 w-4" />
          Ca dạy trong tuần
        </p>
        {myShifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa được gán ca dạy nào — vào Tab Lịch học, chọn xem theo "Giáo viên" để gán.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {myShifts.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                {classChip(s.class_type)}
                <span>
                  {DAYS[s.day_of_week]}, {hhmm(s.start_time)}–{hhmm(s.end_time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buổi đã dạy */}
      <div>
        <p className="mb-2 text-sm font-semibold">Số buổi đã dạy</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ["Hôm nay", taughtCount.today],
            ["Tuần này", taughtCount.week],
            ["Tháng này", taughtCount.month],
            ["Năm nay", taughtCount.year],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-md border p-2.5 text-center">
              <p className="text-xl font-bold" style={{ color: "#9c5f35" }}>
                {value}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Nghỉ phép */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarOff className="h-4 w-4" />
            Nghỉ phép
          </p>
          <Button size="sm" variant="outline" onClick={() => setLeaveFormOpen("new")}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Ghi nhận nghỉ phép
          </Button>
        </div>
        <div className="mb-2 grid grid-cols-3 gap-2">
          {([
            ["Tuần này", leaveCount.week],
            ["Tháng này", leaveCount.month],
            ["Năm nay", leaveCount.year],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-md border p-2.5 text-center">
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">ngày · {label}</p>
            </div>
          ))}
        </div>
        {leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có bản ghi nghỉ phép nào.</p>
        ) : (
          <div className="space-y-1.5">
            {leaves.map((l) => (
              <TeacherLeaveRow key={l.id} leave={l} onEdit={() => setLeaveFormOpen(l)} />
            ))}
          </div>
        )}
      </div>

      {/* Lương thưởng */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Wallet className="h-4 w-4" />
            Lương đã nhận
          </p>
          <p className="text-2xl font-bold" style={{ color: "#9c5f35" }}>
            {formatMoney(salaryTotal)}đ
          </p>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">Ghi nhận trả lương thực hiện ở Tab Tài chính (khoản "Chi lương giáo viên") — mục này chỉ hiển thị lại.</p>
        {salaryRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có khoản chi lương nào.</p>
        ) : (
          <div className="space-y-1.5">
            {salaryRows.map((e) => (
              <div key={e.id} className="rounded-md border p-2.5 text-sm">
                <p className="font-medium">{formatMoney(e.amount)}đ</p>
                <p className="text-xs text-muted-foreground">
                  {fmtMonth(e.month)}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {avatarPickerOpen && <TeacherAvatarPickerDialog teacherId={teacher.id} open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen} />}
      {leaveFormOpen && (
        <TeacherLeaveFormDialog
          teacherId={teacher.id}
          existing={leaveFormOpen === "new" ? undefined : leaveFormOpen}
          open={!!leaveFormOpen}
          onOpenChange={(v) => !v && setLeaveFormOpen(null)}
        />
      )}
    </div>
  );
}

function TeacherLeaveRow({ leave, onEdit }: { leave: TeacherLeave; onEdit: () => void }) {
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteTeacherLeave);
  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: leave.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-leaves"] });
      toast.success("Đã xóa bản ghi nghỉ phép");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-center justify-between rounded-md border p-2.5 text-sm">
      <div>
        <p className="font-medium">
          {fmtDate(leave.start_date)} → {fmtDate(leave.end_date)}
        </p>
        {leave.reason && <p className="text-xs text-muted-foreground">{leave.reason}</p>}
      </div>
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm("Xóa bản ghi nghỉ phép này?") && delMut.mutate()}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TeacherLeaveFormDialog({
  teacherId,
  existing,
  open,
  onOpenChange,
}: {
  teacherId: string;
  existing?: TeacherLeave;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(upsertTeacherLeave);
  const [startDate, setStartDate] = useState(existing?.start_date ?? toLocalISO(new Date()));
  const [endDate, setEndDate] = useState(existing?.end_date ?? toLocalISO(new Date()));
  const [reason, setReason] = useState(existing?.reason ?? "");

  const mut = useMutation({
    mutationFn: () => saveFn({ data: { id: existing?.id, teacher_id: teacherId, start_date: startDate, end_date: endDate, reason: reason || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-leaves"] });
      toast.success(existing ? "Đã cập nhật" : "Đã ghi nhận nghỉ phép");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Sửa nghỉ phép" : "Ghi nhận nghỉ phép"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Từ ngày</Label>
              <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Đến ngày</Label>
              <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Lý do</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: nghỉ ốm, việc gia đình..." />
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || endDate < startDate}>
            {mut.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeacherAvatarPickerDialog({ teacherId, open, onOpenChange }: { teacherId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const setAvatarFn = useServerFn(setTeacherAvatar);
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
      setImgUrl(await fileToRenderableUrl(f));
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
      const url = await uploadPersonAvatar(teacherId, blob);
      await setAvatarFn({ data: { teacher_id: teacherId, avatar_url: url } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
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
            Ảnh đại diện giáo viên
          </DialogTitle>
        </DialogHeader>

        {!imgUrl ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40">
            {loadingFile ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            <span>Chọn ảnh từ điện thoại/máy tính</span>
            <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
