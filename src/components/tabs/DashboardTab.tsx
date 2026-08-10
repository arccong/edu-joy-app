import { useMemo } from "react";
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
  History,
  PauseCircle,
  Plus,
  Repeat,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { classChip, EmptyState } from "@/components/ui-bits";
import { StudentDialog } from "@/components/StudentDialog";
import { RecordPaymentDialog } from "@/components/tabs/TuitionTab";
import { FinanceEntryDialog } from "@/components/tabs/FinanceTab";

import {
  DAYS,
  addScheduledDays,
  coursePrefix,
  fmtDate,
  formatMoney,
  slotsPerDayMap,
  toLocalISO,
  type AttendanceRow,
  type AttendanceStatus,
  type ScheduleChange,
  type ScheduleSlot,
  type Student,
  type TuitionPayment,
} from "@/lib/shared";
import { listAttendance, listAttendanceRange, listScheduleChanges, listStudents, setAttendance } from "@/lib/students.functions";
import { listPayments } from "@/lib/tuition.functions";
import { listLearningLogs } from "@/lib/learning.functions";
import { listExpenseCategories } from "@/lib/finance.functions";

type TodayItem = { s: Student; slot: ScheduleSlot };

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

export function DashboardTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const qc = useQueryClient();
  const fetchStudents = useServerFn(listStudents);
  const fetchAtt = useServerFn(listAttendance);
  const fetchAttRange = useServerFn(listAttendanceRange);
  const fetchPayments = useServerFn(listPayments);
  const fetchChanges = useServerFn(listScheduleChanges);
  const fetchLogs = useServerFn(listLearningLogs);
  const fetchCats = useServerFn(listExpenseCategories);
  const setAtt = useServerFn(setAttendance);

  const now = new Date();
  const todayISO = toLocalISO(now);
  const dow = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const from = new Date(now); from.setFullYear(from.getFullYear() - 2);
  const fromISO = toLocalISO(from);

  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchStudents() as any });
  const { data: attToday = [] } = useQuery<AttendanceRow[]>({ queryKey: ["attendance", todayISO], queryFn: () => fetchAtt({ data: { date: todayISO } }) as any });
  const { data: attRange = [] } = useQuery<AttendanceRow[]>({ queryKey: ["attendance-range", fromISO, todayISO], queryFn: () => fetchAttRange({ data: { from: fromISO, to: todayISO } }) as any });
  const { data: payments = [] } = useQuery<TuitionPayment[]>({ queryKey: ["payments"], queryFn: () => fetchPayments() as any });
  const { data: changes = [] } = useQuery<ScheduleChange[]>({ queryKey: ["schedule-changes"], queryFn: () => fetchChanges() as any });
  const { data: logs = [] } = useQuery<any[]>({ queryKey: ["learning-logs"], queryFn: () => fetchLogs() as any });
  const { data: cats = [] } = useQuery<any[]>({ queryKey: ["expense-cats"], queryFn: () => fetchCats() as any });

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s] as const)), [students]);

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
      if (r.status === "Đi học" && inCourse(s, r.date)) m.set(r.student_id, (m.get(r.student_id) ?? 0) + sessionsOnDate(s, r.date));
    }
    return m;
  }, [attRange, studentById]);
  const remainOf = (s: Student) => Math.max(0, (s.total_sessions ?? 0) - (attendedByStudent.get(s.id) ?? 0));

  const attMap = useMemo(() => new Map(attToday.map((r) => [r.student_id, r] as const)), [attToday]);
  const reservedToday = useMemo(() => new Set(attToday.filter((r) => r.status === "Bảo lưu").map((r) => r.student_id)), [attToday]);

  const todayItems = useMemo<TodayItem[]>(() => {
    const out: TodayItem[] = [];
    for (const s of students) {
      if (s.status === "Bảo lưu" || s.status === "Chuẩn bị") continue;
      if (reservedToday.has(s.id)) continue;
      if (!inCourse(s, todayISO)) continue;
      for (const sl of (s.schedule_slots ?? []) as ScheduleSlot[]) if (sl.day === dow) out.push({ s, slot: sl });
    }
    return out.sort((a, b) => a.slot.start.localeCompare(b.slot.start) || a.s.name.localeCompare(b.s.name, "vi"));
  }, [students, reservedToday, todayISO, dow]);

  const marked = todayItems.filter(({ s }) => attMap.has(s.id)).length;
  const rate = todayItems.length ? Math.round((marked / todayItems.length) * 100) : 0;
  const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const donePart = todayItems.filter(({ slot }) => nowMinutes >= minutesOf(slot.end)).length;

  const activeCount = students.filter((s) => s.status === "Đang học" && remainOf(s) > 0).length;
  const reserveCount = students.filter((s) => s.status === "Bảo lưu").length;
  const prepareCount = students.filter((s) => s.status === "Chuẩn bị").length;

  // Cảnh báo
  const expiring = useMemo(() => {
    const limit = toLocalISO(new Date(now.getTime() + 7 * 86400000));
    return students
      .filter((s) => s.status === "Đang học" && remainOf(s) > 0)
      .map((s) => ({ s, end: actualEndOf(s) }))
      .filter((x) => x.end && x.end >= todayISO && x.end <= limit)
      .sort((a, b) => a.end.localeCompare(b.end));
  }, [students, attendedByStudent]);

  const lowSessions = useMemo(
    () => students
      .filter((s) => s.status === "Đang học")
      .map((s) => ({ s, remain: remainOf(s) }))
      .filter((x) => x.remain > 0 && x.remain <= 2)
      .sort((a, b) => a.remain - b.remain),
    [students, attendedByStudent],
  );

  const unpaid = useMemo(() => {
    const paid = new Set(payments.map((p) => p.student_id));
    return students
      .filter((s) => (s.status === "Đang học" || s.status === "Hoàn thành") && !paid.has(s.id))
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  }, [students, payments]);

  const alertCount = expiring.length + lowSessions.length + unpaid.length;

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
      items.push({
        at: r.created_at,
        icon: r.status === "Bảo lưu" ? "reserve" : "att",
        text: r.status === "Bảo lưu"
          ? `${s.name} (${courseLabel(s)}) bảo lưu ngày ${fmtDate(r.date)}`
          : `${s.name} (${courseLabel(s)}) — ${r.status} ngày ${fmtDate(r.date)}`,
      });
    }
    for (const p of payments as any[]) {
      const s = studentById.get(p.student_id);
      if (!p.created_at) continue;
      items.push({ at: p.created_at, icon: "pay", text: `Đóng học phí ${formatMoney(Number(p.amount))}đ${s ? ` — ${s.name} (${courseLabel(s)})` : ""}` });
    }
    for (const c of changes) {
      const s = studentById.get(c.student_id);
      if (!c.created_at) continue;
      items.push({ at: c.created_at, icon: "sched", text: `Đổi lịch học${s ? ` — ${s.name} (${courseLabel(s)})` : ""} từ ${fmtDate(c.effective_from)}` });
    }
    for (const l of logs) {
      if (!l.created_at) continue;
      const s = l.student_id ? studentById.get(l.student_id) : undefined;
      items.push({ at: l.created_at, icon: "log", text: `Nhật ký ${l.class_type}: ${l.title || "(không tiêu đề)"}${s ? ` — ${s.name}` : ""}` });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 18);
  }, [attRange, payments, changes, logs, studentById]);

  const greeting = nowMinutes < 11 * 60 ? "Chào buổi sáng" : nowMinutes < 18 * 60 ? "Chào buổi chiều" : "Chào buổi tối";
  const summary = todayItems.length === 0
    ? `Hôm nay không có buổi học nào.${alertCount ? ` Có ${alertCount} việc cần xử lý.` : ""}`
    : `Hôm nay có ${todayItems.length} buổi học, ${marked} đã điểm danh, ${absentToday.length} nghỉ/bảo lưu${alertCount ? `, ${alertCount} việc cần xử lý` : ""}.`;

  const mut = useMutation({
    mutationFn: (v: { student_id: string; status: AttendanceStatus }) => setAtt({ data: { ...v, date: todayISO, note: null, makeup_date: null } as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", todayISO] });
      qc.invalidateQueries({ queryKey: ["attendance-range", fromISO, todayISO] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Lời chào + thao tác nhanh */}
      <Card className="shadow-card">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold sm:text-xl">{greeting}! 👋</h2>
            <p className="text-sm text-muted-foreground">{DAYS[dow]}, {fmtDate(todayISO)} — {summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RecordPaymentDialog
              students={students}
              trigger={<Button size="sm"><Wallet className="mr-1 h-4 w-4" />Ghi nhận học phí</Button>}
            />
            <StudentDialog trigger={<Button size="sm" variant="outline"><UserPlus className="mr-1 h-4 w-4" />Học sinh mới</Button>} />
            <FinanceEntryDialog
              cats={cats}
              students={students}
              defaultMonth={todayISO.slice(0, 7)}
              defaultClass={null}
              trigger={<Button size="sm" variant="outline"><Plus className="mr-1 h-4 w-4" />Thu / Chi</Button>}
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
          sub={`${expiring.length} sắp hết hạn · ${lowSessions.length} sắp hết buổi · ${unpaid.length} chưa đóng`}
          tone={alertCount > 0 ? "warning" : undefined}
          onClick={() => document.getElementById("dash-alerts")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lịch hôm nay + điểm danh nhanh */}
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-5 w-5 text-primary" />Lịch học hôm nay</CardTitle>
              <CardDescription>Điểm danh nhanh ngay tại đây</CardDescription>
            </CardHeader>
            <CardContent>
              {todayItems.length === 0 ? (
                <EmptyState text="Hôm nay không có lịch học." />
              ) : (
                <div className="space-y-2">
                  {todayItems.map(({ s, slot }, i) => {
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
                              <Badge variant="outline" className="text-[10px]">{courseLabel(s)}</Badge>
                              {classChip(s.class_type)}
                              {upcoming && <Badge className="bg-warning/15 text-[color:var(--warning)] text-[10px]" variant="outline">Sắp tới giờ</Badge>}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">⏰ {slot.start}–{slot.end}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {rec ? (
                              <Badge variant="outline" className={rec.status === "Đi học" ? "border-[color:var(--success)]/40 bg-success/15 text-[color:var(--success)]" : "text-muted-foreground"}>
                                {rec.status === "Đi học" ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : null}{rec.status}
                              </Badge>
                            ) : null}
                            <Button size="sm" variant={rec?.status === "Đi học" ? "default" : "outline"} disabled={!canCheckIn || mut.isPending}
                              onClick={() => mut.mutate({ student_id: s.id, status: "Đi học" })}>Đi học</Button>
                            <Button size="sm" variant={rec?.status === "Nghỉ có phép" ? "default" : "outline"} disabled={mut.isPending}
                              onClick={() => mut.mutate({ student_id: s.id, status: "Nghỉ có phép" })}>Nghỉ CP</Button>
                            <Button size="sm" variant={rec?.status === "Nghỉ không phép" ? "default" : "outline"} disabled={mut.isPending}
                              onClick={() => mut.mutate({ student_id: s.id, status: "Nghỉ không phép" })}>Nghỉ KP</Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><PauseCircle className="h-5 w-5 text-muted-foreground" />Nghỉ / Bảo lưu hôm nay</CardTitle>
            </CardHeader>
            <CardContent>
              {absentToday.length === 0 ? (
                <EmptyState text="Không có học sinh nghỉ hoặc bảo lưu hôm nay." />
              ) : (
                <div className="space-y-2">
                  {absentToday.map(({ s, reason }, i) => (
                    <div key={`${s.id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <Badge variant="outline" className="text-[10px]">{courseLabel(s)}</Badge>
                        {classChip(s.class_type)}
                      </div>
                      <span className="text-xs text-muted-foreground">{reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cảnh báo + hoạt động */}
        <div className="space-y-4">
          <Card id="dash-alerts" className="shadow-card scroll-mt-24">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-[color:var(--warning)]" />Cần xử lý</CardTitle>
              <CardDescription>{alertCount === 0 ? "Không có việc nào cần xử lý." : `${alertCount} mục`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <AlertGroup title="Chưa ghi nhận học phí" empty={unpaid.length === 0}>
                {unpaid.map((s) => (
                  <AlertRow key={s.id} s={s} right={`${formatMoney(Number(s.tuition))}đ`} students={students} />
                ))}
              </AlertGroup>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-primary" />Hoạt động gần đây</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <EmptyState text="Chưa có hoạt động nào." />
              ) : (
                <ol className="space-y-2.5">
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

function Kpi({ icon, label, value, sub, tone, onClick }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: "warning"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border bg-card p-3 text-left shadow-card transition hover:border-primary/40 hover:shadow-md sm:p-4">
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
      {empty ? <p className="text-sm text-muted-foreground">Không có.</p> : <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

function AlertRow({ s, right, students }: { s: Student; right: string; students: Student[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate font-medium">{s.name}</span>
        <Badge variant="outline" className="text-[10px]">{courseLabel(s)}</Badge>
        {classChip(s.class_type)}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{right}</span>
        <RecordPaymentDialog students={students} trigger={<Button size="sm" variant="outline">Ghi nhận</Button>} />
      </div>
    </div>
  );
}
