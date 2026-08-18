import { useMemo, useState } from "react";
import { useLabel } from "@/lib/labels";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  GraduationCap,
  History,
  Maximize2,
  Minimize2,
  PauseCircle,
  Plus,
  Repeat,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { classChip, EmptyState } from "@/components/ui-bits";
import { RecordPaymentDialog } from "@/components/tabs/TuitionTab";
import { EntryDialog as FinanceEntryDialog } from "@/components/tabs/FinanceTab";
import { useTrialStudents } from "@/components/tabs/TrialStudentsCard";
import { TrialStudentDialog } from "@/components/TrialStudentDialog";

import {
  DAYS,
  addScheduledDays,
  coursePrefix,
  fmtDate,
  formatMoney,
  slotsPerDayMap,
  toLocalISO,
  hhmm,
  trialStatus,
  countsTowardSessions,
  computeMakeupEntries,
  type MakeupEntry,
  type AttendanceRow,
  type AttendanceStatus,
  type ScheduleChange,
  type ScheduleSlot,
  type Student,
  type TrialStudent,
  type TuitionPayment,
} from "@/lib/shared";
import {
  listAttendance,
  listAttendanceRange,
  listMakeupsInRange,
  listScheduleChanges,
  listStudents,
  setAttendance,
  upsertStudent,
} from "@/lib/students.functions";
import { setTrialAttendance } from "@/lib/trials.functions";
import { listPayments } from "@/lib/tuition.functions";
import { listLearningLogs } from "@/lib/learning.functions";
import { listExpenseCategories } from "@/lib/finance.functions";

type TodayItem = { s: Student; slot: ScheduleSlot };
type TodayRow =
  | { kind: "student"; s: Student; slot: ScheduleSlot; start: string; end: string }
  | { kind: "trial"; t: TrialStudent; start: string; end: string }
  | { kind: "makeup"; m: MakeupEntry; start: string; end: string };

function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.round(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

function courseLabel(s: Student) {
  return `${coursePrefix(s.class_type)}${s.course_index ?? 1}`;
}

const COLLAPSE_THRESHOLD = 6; // từ 6 dữ kiện trở lên mới cần thu gọn + cuộn

function FullToggle({ full, onChange }: { full: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1.5" title={full ? "Đang hiện đầy đủ — bấm để thu gọn" : "Đang thu gọn — bấm để hiện đầy đủ"}>
      {full ? <Maximize2 className="h-3.5 w-3.5 text-primary" /> : <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />}
      <Switch checked={full} onCheckedChange={onChange} className="scale-90" />
    </label>
  );
}

export function DashboardTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const t = useLabel();
  const qc = useQueryClient();
  // Mặc định: Desktop (≥1024px, khớp breakpoint lg dùng cho lưới 2 cột) = thu gọn; Mobile = hiện đầy đủ.
  // Chỉ tính 1 lần lúc mở trang, không ghi nhớ qua lần sau (theo đúng yêu cầu).
  const isDesktopDefault = () => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true);
  const [fullSchedule, setFullSchedule] = useState(() => !isDesktopDefault());
  const [fullAbsent, setFullAbsent] = useState(() => !isDesktopDefault());
  const [fullAlerts, setFullAlerts] = useState(() => !isDesktopDefault());
  const [fullActivity, setFullActivity] = useState(() => !isDesktopDefault());
  // Nếu BẤT KỲ bảng nào đang mở Full, các bảng còn lại (đang thu gọn) bỏ giới hạn 374px — để tự
  // giãn theo, lấp khoảng trắng bằng dữ liệu thật của chính nó thay vì bị cắt cứng ở 374px.
  const anyFull = fullSchedule || fullAbsent || fullAlerts || fullActivity;
  const fetchStudents = useServerFn(listStudents);
  const fetchAtt = useServerFn(listAttendance);
  const fetchAttRange = useServerFn(listAttendanceRange);
  const fetchMakeups = useServerFn(listMakeupsInRange);
  const fetchPayments = useServerFn(listPayments);
  const fetchChanges = useServerFn(listScheduleChanges);
  const fetchLogs = useServerFn(listLearningLogs);
  const fetchCats = useServerFn(listExpenseCategories);
  const setAtt = useServerFn(setAttendance);
  const setTrialAtt = useServerFn(setTrialAttendance);
  const saveStudent = useServerFn(upsertStudent);

  const now = new Date();
  const todayISO = toLocalISO(now);
  const dow = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 2);
  const fromISO = toLocalISO(from);

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ["students"],
    queryFn: () => fetchStudents() as any,
  });
  const { data: attToday = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance", todayISO],
    queryFn: () => fetchAtt({ data: { date: todayISO } }) as any,
  });
  const { data: attRange = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance-range", fromISO, todayISO],
    queryFn: () => fetchAttRange({ data: { from: fromISO, to: todayISO } }) as any,
  });
  const { data: makeupRowsToday = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["makeups-range", todayISO, todayISO],
    queryFn: () => fetchMakeups({ data: { from: todayISO, to: todayISO } }) as any,
  });
  const { data: payments = [] } = useQuery<TuitionPayment[]>({
    queryKey: ["payments"],
    queryFn: () => fetchPayments() as any,
  });
  const { data: changes = [] } = useQuery<ScheduleChange[]>({
    queryKey: ["schedule-changes"],
    queryFn: () => fetchChanges() as any,
  });
  const { data: logs = [] } = useQuery<any[]>({ queryKey: ["learning-logs"], queryFn: () => fetchLogs() as any });
  const { data: cats = [] } = useQuery<any[]>({ queryKey: ["expense-cats"], queryFn: () => fetchCats() as any });
  const { data: trials = [] } = useTrialStudents();

  const activeStudents = useMemo(() => students.filter((s) => s.status !== "Kết thúc"), [students]);
  const studentById = useMemo(() => new Map(activeStudents.map((s) => [s.id, s] as const)), [activeStudents]);

  const sessionsOnDate = (s: Student | undefined, dateISO: string) => {
    if (!s) return 1;
    const d = new Date(dateISO + "T00:00:00").getDay();
    const n = slotsPerDayMap(s.schedule_slots ?? []).get(d) ?? 0;
    return n > 0 ? n : 1;
  };
  const actualEndOf = (s: Student) => addScheduledDays(s.end_date, s.schedule_slots ?? [], s.reserve_days ?? 0);
  const inCourse = (s: Student | undefined, dateISO: string) => {
    if (!s?.start_date) return false;
    const e = actualEndOf(s);
    return dateISO >= s.start_date && (!e || dateISO <= e);
  };

  const attendedByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of attRange) {
      const s = studentById.get(r.student_id);
      if (countsTowardSessions(r) && inCourse(s, r.date))
        m.set(r.student_id, (m.get(r.student_id) ?? 0) + sessionsOnDate(s, r.date));
    }
    return m;
  }, [attRange, studentById]);
  const remainOf = (s: Student) => Math.max(0, (s.total_sessions ?? 0) - (attendedByStudent.get(s.id) ?? 0));

  const attMap = useMemo(() => new Map(attToday.map((r) => [r.student_id, r] as const)), [attToday]);
  const reservedToday = useMemo(
    () => new Set(attToday.filter((r) => r.status === "Bảo lưu").map((r) => r.student_id)),
    [attToday],
  );

  const todayItems = useMemo<TodayItem[]>(() => {
    const out: TodayItem[] = [];
    for (const s of activeStudents) {
      if (s.status === "Bảo lưu" || s.status === "Chuẩn bị") continue;
      if (reservedToday.has(s.id)) continue;
      if (!inCourse(s, todayISO)) continue;
      for (const sl of (s.schedule_slots ?? []) as ScheduleSlot[]) if (sl.day === dow) out.push({ s, slot: sl });
    }
    return out.sort((a, b) => a.slot.start.localeCompare(b.slot.start) || a.s.name.localeCompare(b.s.name, "vi"));
  }, [activeStudents, reservedToday, todayISO, dow]);

  const marked = todayItems.filter(({ s }) => attMap.has(s.id)).length;
  const rate = todayItems.length ? Math.round((marked / todayItems.length) * 100) : 0;
  const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const donePart = todayItems.filter(({ slot }) => nowMinutes >= minutesOf(slot.end)).length;

  const trialToday = useMemo(
    () => (trials as TrialStudent[]).filter((t) => t.trial_date === todayISO && trialStatus(t, todayISO) === "Học thử"),
    [trials, todayISO],
  );

  const makeupToday = useMemo(
    () => computeMakeupEntries(students, makeupRowsToday, todayISO, todayISO),
    [students, makeupRowsToday, todayISO],
  );

  const todayRows = useMemo<TodayRow[]>(() => {
    const rows: TodayRow[] = [
      ...todayItems.map(({ s, slot }) => ({ kind: "student" as const, s, slot, start: slot.start, end: slot.end })),
      ...trialToday.map((t) => ({ kind: "trial" as const, t, start: hhmm(t.start_time), end: hhmm(t.end_time) })),
      ...makeupToday.map((m) => ({ kind: "makeup" as const, m, start: m.slot.start, end: m.slot.end })),
    ];
    return rows.sort((a, b) => {
      const byTime = a.start.localeCompare(b.start);
      if (byTime !== 0) return byTime;
      const nameOf = (r: TodayRow) =>
        r.kind === "student" ? r.s.name : r.kind === "trial" ? r.t.name : r.m.student.name;
      return nameOf(a).localeCompare(nameOf(b), "vi");
    });
  }, [todayItems, trialToday, makeupToday]);

  const activeCount = activeStudents.filter((s) => s.status === "Đang học" && remainOf(s) > 0).length;
  const reserveCount = activeStudents.filter((s) => s.status === "Bảo lưu").length;
  const prepareCount = activeStudents.filter((s) => s.status === "Chuẩn bị").length;

  // Cảnh báo
  const expiring = useMemo(() => {
    const limit = toLocalISO(new Date(now.getTime() + 7 * 86400000));
    return activeStudents
      .filter((s) => s.status === "Đang học" && remainOf(s) > 0)
      .map((s) => ({ s, end: actualEndOf(s) }))
      .filter((x) => x.end && x.end >= todayISO && x.end <= limit)
      .sort((a, b) => a.end.localeCompare(b.end));
  }, [activeStudents, attendedByStudent]);

  const lowSessions = useMemo(
    () =>
      activeStudents
        .filter((s) => s.status === "Đang học")
        .map((s) => ({ s, remain: remainOf(s) }))
        .filter((x) => x.remain > 0 && x.remain <= 2)
        .sort((a, b) => a.remain - b.remain),
    [activeStudents, attendedByStudent],
  );

  const unpaid = useMemo(() => {
    const paid = new Set(payments.map((p) => p.student_id));
    return activeStudents
      .filter((s) => s.status === "Đang học" && remainOf(s) > 0 && !paid.has(s.id))
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  }, [activeStudents, payments]);

  const completedNeedRenewal = useMemo(() => {
    const bySameOwner = (s: Student, o: Student) =>
      s.person_id
        ? s.person_id === o.person_id
        : s.name.trim().toLowerCase() === o.name.trim().toLowerCase() && s.age === o.age;
    return (
      activeStudents
        .filter((s) => (s.status === "Đang học" && remainOf(s) <= 0) || s.status === "Hoàn thành")
        // Bỏ qua nếu đã có khóa mới hơn (Chuẩn bị/Đang học/Bảo lưu) đăng ký sau khóa này — coi như đã gia hạn
        .filter(
          (s) =>
            !activeStudents.some(
              (o) =>
                o.id !== s.id &&
                bySameOwner(s, o) &&
                (o.course_index ?? 1) > (s.course_index ?? 1) &&
                (o.status === "Đang học" || o.status === "Chuẩn bị" || o.status === "Bảo lưu"),
            ),
        )
        .sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""))
    );
  }, [activeStudents]);

  const minutesOfSlot = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  const missingAttendance = useMemo(
    () =>
      todayItems
        .filter(({ s, slot }) => nowMinutes >= minutesOfSlot(slot.end) && !attMap.has(s.id))
        .sort((a, b) => a.slot.end.localeCompare(b.slot.end)),
    [todayItems, attMap, nowMinutes],
  );

  const upcomingTrials = useMemo(() => {
    const limit = toLocalISO(new Date(Date.now() + 7 * 86400000));
    return (trials as any[])
      .filter((t) => trialStatus(t, todayISO) === "Học thử" && t.trial_date >= todayISO && t.trial_date <= limit)
      .sort(
        (a, b) => a.trial_date.localeCompare(b.trial_date) || String(a.start_time).localeCompare(String(b.start_time)),
      );
  }, [trials, todayISO]);

  const alertCount =
    expiring.length +
    lowSessions.length +
    unpaid.length +
    completedNeedRenewal.length +
    missingAttendance.length +
    upcomingTrials.length;

  // Nghỉ / bảo lưu hôm nay
  const absentToday = useMemo(() => {
    const rows: Array<{ s: Student; reason: string }> = [];
    for (const r of attToday) {
      const s = studentById.get(r.student_id);
      if (!s) continue;
      if (r.status === "Bảo lưu") rows.push({ s, reason: "Bảo lưu" });
      else if (r.status === "Nghỉ có phép") rows.push({ s, reason: "Nghỉ có phép" });
      else if (r.status === "Nghỉ không phép") rows.push({ s, reason: "Nghỉ không phép" });
    }
    return rows;
  }, [attToday, studentById]);

  // Hoạt động gần đây
  const activities = useMemo(() => {
    const items: Array<{ at: string; icon: "att" | "pay" | "sched" | "reserve" | "log"; text: string }> = [];
    for (const r of attRange) {
      const s = studentById.get(r.student_id);
      if (!s || !r.created_at) continue;
      if (r.status === "Đi học") continue;
      items.push({
        at: r.created_at,
        icon: r.status === "Bảo lưu" ? "reserve" : "att",
        text:
          r.status === "Bảo lưu"
            ? `${s.name} (${courseLabel(s)}) bảo lưu ngày ${fmtDate(r.date)}`
            : `${s.name} (${courseLabel(s)}) — ${r.status} ngày ${fmtDate(r.date)}`,
      });
    }
    for (const p of payments as any[]) {
      const s = studentById.get(p.student_id);
      if (!p.created_at) continue;
      items.push({
        at: p.created_at,
        icon: "pay",
        text: `Đóng học phí ${formatMoney(Number(p.amount))}đ${s ? ` — ${s.name} (${courseLabel(s)})` : ""}`,
      });
    }
    for (const c of changes) {
      const s = studentById.get(c.student_id);
      if (!c.created_at) continue;
      items.push({
        at: c.created_at,
        icon: "sched",
        text: `Đổi lịch học${s ? ` — ${s.name} (${courseLabel(s)})` : ""} từ ${fmtDate(c.effective_from)}`,
      });
    }
    for (const l of logs) {
      if (!l.created_at) continue;
      const s = l.student_id ? studentById.get(l.student_id) : undefined;
      items.push({
        at: l.created_at,
        icon: "log",
        text: `Nhật ký ${l.class_type}: ${l.title || "(không tiêu đề)"}${s ? ` — ${s.name}` : ""}`,
      });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 18);
  }, [attRange, payments, changes, logs, studentById]);

  const greeting = nowMinutes < 11 * 60 ? "Chào buổi sáng" : nowMinutes < 18 * 60 ? "Chào buổi chiều" : "Chào buổi tối";
  const summary =
    todayItems.length === 0
      ? `Hôm nay không có buổi học nào.${alertCount ? ` Có ${alertCount} việc cần xử lý.` : ""}`
      : `Hôm nay có ${todayItems.length} buổi học, ${marked} đã điểm danh, ${absentToday.length} nghỉ/bảo lưu${alertCount ? `, ${alertCount} việc cần xử lý` : ""}.`;

  const mut = useMutation({
    mutationFn: (v: { student_id: string; status: AttendanceStatus }) =>
      setAtt({ data: { ...v, date: todayISO, note: null, makeup_date: null } as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", todayISO] });
      qc.invalidateQueries({ queryKey: ["attendance-range", fromISO, todayISO] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trialMut = useMutation({
    mutationFn: (v: { id: string; status: "Đi học" | "Nghỉ không phép" }) =>
      setTrialAtt({ data: { id: v.id, status: v.status, note: null, makeup_date: null } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trial-students"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const endStudentMut = useMutation({
    mutationFn: (s: Student) => saveStudent({ data: { ...s, status: "Kết thúc" } as any }),
    onSuccess: () => {
      toast.success("Đã đặt trạng thái Kết thúc.");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Lời chào + thao tác nhanh */}
      <Card className="shadow-card">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold sm:text-xl" suppressHydrationWarning>
              {greeting}! 👋
            </h2>
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              {DAYS[dow]}, {fmtDate(todayISO)} — {summary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RecordPaymentDialog
              students={students}
              trigger={
                <Button size="sm">
                  <Wallet className="mr-1 h-4 w-4" />
                  {t("btn.payment")}
                </Button>
              }
            />

            <FinanceEntryDialog
              cats={cats}
              students={students}
              defaultMonth={todayISO.slice(0, 7)}
              defaultClass={null}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="mr-1 h-4 w-4" />
                  {t("btn.finance")}
                </Button>
              }
            />
            <TrialStudentDialog
              trigger={
                <Button size="sm" variant="outline">
                  <GraduationCap className="mr-1 h-4 w-4" />
                  {t("btn.new_student")}
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Học sinh đang học"
          value={String(activeCount)}
          sub={`${reserveCount} bảo lưu · ${prepareCount} chuẩn bị`}
          onClick={() => onNavigate("students")}
        />
        <Kpi
          icon={<CalendarDays className="h-4 w-4" />}
          label="Lịch học hôm nay"
          value={String(todayItems.length)}
          sub={`${donePart} đã qua · ${Math.max(0, todayItems.length - donePart)} còn lại`}
          onClick={() => onNavigate("schedule")}
        />
        <Kpi
          icon={<ClipboardCheck className="h-4 w-4" />}
          label="Tỷ lệ điểm danh"
          value={`${rate}%`}
          sub={`${marked}/${todayItems.length} đã điểm danh`}
          onClick={() => onNavigate("attendance")}
        />
        <Kpi
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Cần xử lý"
          value={String(alertCount)}
          sub={`${upcomingTrials.length} học thử · ${expiring.length} sắp hết hạn · ${lowSessions.length} sắp hết buổi · ${completedNeedRenewal.length} hoàn thành khóa · ${unpaid.length} chưa đóng · ${missingAttendance.length} chưa điểm danh`}
          tone={alertCount > 0 ? "warning" : undefined}
          onClick={() => document.getElementById("dash-alerts")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
        {/* Lịch hôm nay + điểm danh nhanh */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="min-w-0 shadow-card">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-5 w-5 text-primary" />
                  Lịch học hôm nay
                </CardTitle>
                <CardDescription>Điểm danh nhanh ngay tại đây</CardDescription>
              </div>
              <FullToggle full={fullSchedule} onChange={setFullSchedule} />
            </CardHeader>
            <CardContent className="min-w-0">
              {todayRows.length === 0 ? (
                <EmptyState text="Hôm nay không có lịch học." />
              ) : (
                <div
                  className={cn(
                    "space-y-2 overflow-y-auto pr-1",
                    !fullSchedule && todayRows.length >= COLLAPSE_THRESHOLD && "max-h-[374px]",
                    !fullSchedule && todayRows.length >= COLLAPSE_THRESHOLD && anyFull && "lg:max-h-none",
                  )}
                >
                  {todayRows.map((row, i) => {
                    if (row.kind === "trial") {
                      const t = row.t;
                      const done = !!t.attendance_status;
                      return (
                        <div key={`trial-${t.id}-${i}`} className="rounded-lg border border-dashed bg-card p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{t.name}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  Học thử
                                </Badge>
                                {classChip(t.class_type)}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                ⏰ {row.start}–{row.end}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {done ? (
                                <Badge
                                  variant="outline"
                                  className={
                                    t.attendance_status === "Đi học"
                                      ? "border-[color:var(--success)]/40 bg-success/15 text-[color:var(--success)]"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {t.attendance_status === "Đi học" ? (
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  ) : null}
                                  {t.attendance_status}
                                </Badge>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={trialMut.isPending}
                                    onClick={() => trialMut.mutate({ id: t.id, status: "Đi học" })}
                                  >
                                    Đã đến học
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={trialMut.isPending}
                                    onClick={() => trialMut.mutate({ id: t.id, status: "Nghỉ không phép" })}
                                  >
                                    Vắng mặt
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (row.kind === "makeup") {
                      const m = row.m;
                      const mrec = attMap.get(m.student.id);
                      return (
                        <div
                          key={`makeup-${m.attendanceId}-${i}`}
                          className="rounded-lg border border-dashed bg-card p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{m.student.name}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {courseLabel(m.student)}
                                </Badge>
                                {classChip(m.student.class_type)}
                                <Badge
                                  variant="outline"
                                  className="border-[color:var(--warning)]/40 text-[10px] text-[color:var(--warning)]"
                                >
                                  Học bù
                                </Badge>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                ⏰ {row.start}–{row.end} · Bù cho buổi nghỉ {fmtDate(m.originalDate)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {mrec ? (
                                <Badge
                                  variant="outline"
                                  className={
                                    mrec.status === "Đi học"
                                      ? "border-[color:var(--success)]/40 bg-success/15 text-[color:var(--success)]"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {mrec.status === "Đi học" ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : null}
                                  {mrec.status === "Đi học" ? "Đi học" : "Vắng mặt"}
                                </Badge>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={mut.isPending}
                                    onClick={() => mut.mutate({ student_id: m.student.id, status: "Đi học" })}
                                  >
                                    Đi học
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={mut.isPending}
                                    onClick={() => mut.mutate({ student_id: m.student.id, status: "Nghỉ không phép" })}
                                  >
                                    Vắng mặt
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const { s, slot } = row;
                    const rec = attMap.get(s.id);
                    const startM = minutesOf(slot.start);
                    const canCheckIn = nowMinutes >= startM - 20;
                    const upcoming = !rec && nowMinutes < startM && startM - nowMinutes <= 60;
                    return (
                      <div key={`${s.id}-${i}`} className="rounded-lg border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{s.name}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {courseLabel(s)}
                              </Badge>
                              {classChip(s.class_type)}
                              {upcoming && (
                                <Badge
                                  className="bg-warning/15 text-[color:var(--warning)] text-[10px]"
                                  variant="outline"
                                >
                                  Sắp tới giờ
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              ⏰ {slot.start}–{slot.end}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {rec ? (
                              <Badge
                                variant="outline"
                                className={
                                  rec.status === "Đi học"
                                    ? "border-[color:var(--success)]/40 bg-success/15 text-[color:var(--success)]"
                                    : "text-muted-foreground"
                                }
                              >
                                {rec.status === "Đi học" ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : null}
                                {rec.status}
                              </Badge>
                            ) : null}
                            <Button
                              size="sm"
                              variant={rec?.status === "Đi học" ? "default" : "outline"}
                              disabled={!canCheckIn || mut.isPending}
                              onClick={() => mut.mutate({ student_id: s.id, status: "Đi học" })}
                            >
                              Đi học
                            </Button>
                            <Button
                              size="sm"
                              variant={rec?.status === "Nghỉ có phép" ? "default" : "outline"}
                              disabled={mut.isPending}
                              onClick={() => mut.mutate({ student_id: s.id, status: "Nghỉ có phép" })}
                            >
                              Nghỉ CP
                            </Button>
                            <Button
                              size="sm"
                              variant={rec?.status === "Nghỉ không phép" ? "default" : "outline"}
                              disabled={mut.isPending}
                              onClick={() => mut.mutate({ student_id: s.id, status: "Nghỉ không phép" })}
                            >
                              Nghỉ KP
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="dash-alerts" className="flex min-w-0 flex-1 flex-col shadow-card scroll-mt-24">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5 text-[color:var(--warning)]" />
                  Cần xử lý
                </CardTitle>
                <CardDescription>
                  {alertCount === 0 ? "Không có việc nào cần xử lý." : `${alertCount} mục`}
                </CardDescription>
              </div>
              <FullToggle full={fullAlerts} onChange={setFullAlerts} />
            </CardHeader>
            <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div
                className={cn(
                  "min-h-0 flex-1 space-y-4 overflow-y-auto pr-1",
                  !fullAlerts && alertCount >= COLLAPSE_THRESHOLD && "max-h-[374px]",
                  !fullAlerts && alertCount >= COLLAPSE_THRESHOLD && anyFull && "lg:max-h-none",
                )}
              >
                <AlertGroup title="Chưa điểm danh (ca đã kết thúc hôm nay)" empty={missingAttendance.length === 0}>
                  {missingAttendance.map(({ s, slot }, i) => (
                    <div
                      key={`miss-${s.id}-${i}`}
                      className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium">{s.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {courseLabel(s)}
                        </Badge>
                        <span className="shrink-0">{classChip(s.class_type)}</span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        Ca {slot.start}–{slot.end}
                      </span>
                    </div>
                  ))}
                </AlertGroup>
                <AlertGroup title="Sắp hết hạn khóa (7 ngày tới)" empty={expiring.length === 0}>
                  {expiring.map(({ s, end }) => (
                    <AlertRow key={s.id} s={s} right={`Hết hạn: ${fmtDate(end)}`} students={students} />
                  ))}
                </AlertGroup>
                <AlertGroup title="Sắp hết buổi (còn ≤ 2)" empty={lowSessions.length === 0}>
                  {lowSessions.map(({ s, remain }) => (
                    <AlertRow key={s.id} s={s} right={`Còn ${remain} buổi`} students={students} />
                  ))}
                </AlertGroup>
                <AlertGroup title="Các buổi học thử sắp tới" empty={upcomingTrials.length === 0}>
                  {upcomingTrials.map((t: any) => (
                    <div
                      key={`trial-${t.id}`}
                      className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium">{t.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Học thử
                        </Badge>
                        <span className="shrink-0">{classChip(t.class_type)}</span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(t.trial_date)} · {hhmm(t.start_time)}–{hhmm(t.end_time)}
                      </span>
                    </div>
                  ))}
                </AlertGroup>
                <AlertGroup title="Học sinh đã hoàn thành khóa" empty={completedNeedRenewal.length === 0}>
                  {completedNeedRenewal.map((s) => (
                    <CompletedRow
                      key={s.id}
                      s={s}
                      students={students}
                      onEnd={(st) => endStudentMut.mutate(st)}
                      ending={endStudentMut.isPending}
                    />
                  ))}
                </AlertGroup>
                <AlertGroup title="Chưa ghi nhận học phí" empty={unpaid.length === 0}>
                  {unpaid.map((s) => (
                    <AlertRow key={s.id} s={s} right={`${formatMoney(Number(s.tuition))}đ`} students={students} />
                  ))}
                </AlertGroup>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cảnh báo + hoạt động */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="min-w-0 shadow-card">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PauseCircle className="h-5 w-5 text-muted-foreground" />
                Nghỉ / Bảo lưu hôm nay
              </CardTitle>
              <FullToggle full={fullAbsent} onChange={setFullAbsent} />
            </CardHeader>
            <CardContent className="min-w-0">
              {absentToday.length === 0 ? (
                <EmptyState text="Không có học sinh nghỉ hoặc bảo lưu hôm nay." />
              ) : (
                <div
                  className={cn(
                    "space-y-2 overflow-y-auto pr-1",
                    !fullAbsent && absentToday.length >= COLLAPSE_THRESHOLD && "max-h-[374px]",
                    !fullAbsent && absentToday.length >= COLLAPSE_THRESHOLD && anyFull && "lg:max-h-none",
                  )}
                >
                  {absentToday.map(({ s, reason }, i) => (
                    <div
                      key={`${s.id}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {courseLabel(s)}
                        </Badge>
                        {classChip(s.class_type)}
                      </div>
                      <span className="text-xs text-muted-foreground">{reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-w-0 flex-1 flex-col shadow-card">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-5 w-5 text-primary" />
                Hoạt động gần đây
              </CardTitle>
              <FullToggle full={fullActivity} onChange={setFullActivity} />
            </CardHeader>
            <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col">
              {activities.length === 0 ? (
                <EmptyState text="Chưa có hoạt động nào." />
              ) : (
                <ol
                  className={cn(
                    "min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1",
                    // Mobile: dù đang bật Full vẫn cuộn nếu ≥10 mục, tránh trang dài vô hạn — quy tắc
                    // này CHỈ áp dụng cho Mobile (lg:max-h-none hủy nó khi lên màn hình Desktop).
                    fullActivity && activities.length >= 10 && "max-h-[420px] lg:max-h-none",
                    !fullActivity && activities.length >= COLLAPSE_THRESHOLD && "max-h-[374px]",
                    !fullActivity && activities.length >= COLLAPSE_THRESHOLD && anyFull && "lg:max-h-none",
                  )}
                >
                  {activities.map((a, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        {a.icon === "att" && <ClipboardCheck className="h-3.5 w-3.5" />}
                        {a.icon === "pay" && <Coins className="h-3.5 w-3.5" />}
                        {a.icon === "sched" && <Repeat className="h-3.5 w-3.5" />}
                        {a.icon === "reserve" && <PauseCircle className="h-3.5 w-3.5" />}
                        {a.icon === "log" && <BookOpen className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{a.text}</span>
                        <span className="text-xs text-muted-foreground">{relTime(a.at)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: "warning";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border bg-card p-3 text-left shadow-card transition hover:border-primary/40 hover:shadow-md sm:p-4"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={tone === "warning" ? "text-[color:var(--warning)]" : "text-primary"}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${tone === "warning" ? "text-[color:var(--warning)]" : ""}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</p>
    </button>
  );
}

function AlertGroup({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {empty ? (
        <p className="text-sm text-muted-foreground">Không có.</p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  );
}

function CompletedRow({
  s,
  students,
  onEnd,
  ending,
}: {
  s: Student;
  students: Student[];
  onEnd: (s: Student) => void;
  ending: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5 p-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="truncate font-medium">{s.name}</span>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {courseLabel(s)}
        </Badge>
        <span className="shrink-0">{classChip(s.class_type)}</span>
        <Badge
          variant="outline"
          className="shrink-0 border-[color:var(--warning)]/40 text-[10px] text-[color:var(--warning)]"
        >
          Hoàn thành khóa
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
        <RecordPaymentDialog
          students={students}
          defaultStudentId={s.id}
          trigger={
            <Button size="sm" variant="outline" className="shrink-0">
              Ghi nhận
            </Button>
          }
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={ending}
          onClick={() => {
            if (
              window.confirm(
                `Xác nhận học sinh "${s.name}" KHÔNG tiếp tục học nữa và chuyển sang trạng thái "Kết thúc"?`,
              )
            ) {
              onEnd(s);
            }
          }}
        >
          Kết thúc
        </Button>
      </div>
    </div>
  );
}

function AlertRow({ s, right, students }: { s: Student; right: string; students: Student[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="truncate font-medium">{s.name}</span>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {courseLabel(s)}
        </Badge>
        <span className="shrink-0">{classChip(s.class_type)}</span>
      </div>
      <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:shrink-0 sm:items-center sm:justify-end sm:gap-2">
        <span className="whitespace-nowrap text-xs text-muted-foreground">{right}</span>
        <RecordPaymentDialog
          students={students}
          defaultStudentId={s.id}
          trigger={
            <Button size="sm" variant="outline" className="shrink-0">
              Ghi nhận
            </Button>
          }
        />
      </div>
    </div>
  );
}
