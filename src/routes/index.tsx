import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  GraduationCap,
  Users,
  CalendarDays,
  ClipboardCheck,
  Bell,
  Send,
  Settings as SettingsIcon,
  Plus,
  Pencil,
  Trash2,
  Music,
  Palette,
  Sparkles,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  listStudents,
  upsertStudent,
  deleteStudent,
  listSchedule,
  listAttendance,
  setAttendance,
} from "@/lib/students.functions";
import {
  getTelegramStatus,
  saveTelegramConfig,
  sendTodayScheduleTelegram,
  sendExpiringTelegram,
  sendCustomTelegram,
} from "@/lib/telegram.functions";

export const Route = createFileRoute("/")({
  component: App,
});

type ClassType = "Piano" | "Múa" | "Vẽ";
type StudentStatus = "Đang học" | "Nghỉ phép" | "Bảo lưu";
type AttendanceStatus = "Đi học" | "Nghỉ có phép" | "Nghỉ không phép";

interface Student {
  id: string;
  name: string;
  age: number;
  class_type: ClassType;
  tuition: number;
  start_date: string;
  end_date: string;
  status: StudentStatus;
  reserve_days: number;
  total_sessions: number;
  schedule_days: number[];
  sessions_per_day: 1 | 2;
}

function defaultSessionsFor(c: ClassType) {
  return c === "Piano" ? 48 : 24;
}

/** Tính ngày kết thúc: đi từ start_date, mỗi ngày trùng weekday cộng sessions_per_day buổi,
 * dừng khi tổng buổi >= total_sessions. */
function computeEndDate(startISO: string, days: number[], perDay: number, total: number): string | null {
  if (!startISO || days.length === 0 || perDay < 1 || total < 1) return null;
  const start = new Date(startISO + "T00:00:00");
  if (isNaN(start.getTime())) return null;
  let count = 0;
  const cursor = new Date(start);
  for (let i = 0; i < 365 * 5; i++) {
    if (days.includes(cursor.getDay())) {
      count += perDay;
      if (count >= total) return cursor.toISOString().slice(0, 10);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

function dayOfWeekOf(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d.getDay();
}

const CLASSES: ClassType[] = ["Piano", "Múa", "Vẽ"];
const DAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];

function classIcon(c: ClassType) {
  if (c === "Piano") return <Music className="h-4 w-4" />;
  if (c === "Múa") return <Sparkles className="h-4 w-4" />;
  return <Palette className="h-4 w-4" />;
}

function classChip(c: ClassType) {
  const styles: Record<ClassType, string> = {
    Piano: "bg-piano text-piano-foreground",
    "Múa": "bg-mua text-mua-foreground",
    "Vẽ": "bg-ve text-ve-foreground",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[c]}`}>
      {classIcon(c)} {c}
    </span>
  );
}

function statusBadge(s: StudentStatus) {
  const map: Record<StudentStatus, string> = {
    "Đang học": "bg-success/15 text-[color:var(--success)] border-[color:var(--success)]/30",
    "Nghỉ phép": "bg-warning/15 text-[color:var(--warning)] border-[color:var(--warning)]/30",
    "Bảo lưu": "bg-primary/10 text-primary border-primary/30",
  };
  return <Badge variant="outline" className={map[s]}>{s}</Badge>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("vi-VN");
}

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <Header />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="students" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap gap-1 bg-muted/60 p-1">
            <TabsTrigger value="students" className="flex-1 min-w-[110px] gap-1.5"><Users className="h-4 w-4" />Học sinh</TabsTrigger>
            <TabsTrigger value="schedule" className="flex-1 min-w-[110px] gap-1.5"><CalendarDays className="h-4 w-4" />Thời khóa biểu</TabsTrigger>
            <TabsTrigger value="attendance" className="flex-1 min-w-[110px] gap-1.5"><ClipboardCheck className="h-4 w-4" />Điểm danh</TabsTrigger>
            <TabsTrigger value="notifications" className="flex-1 min-w-[110px] gap-1.5"><Bell className="h-4 w-4" />Thông báo</TabsTrigger>
            <TabsTrigger value="settings" className="flex-1 min-w-[110px] gap-1.5"><SettingsIcon className="h-4 w-4" />Cài đặt</TabsTrigger>
          </TabsList>
          <TabsContent value="students" className="mt-6"><StudentsTab /></TabsContent>
          <TabsContent value="schedule" className="mt-6"><ScheduleTab /></TabsContent>
          <TabsContent value="attendance" className="mt-6"><AttendanceTab /></TabsContent>
          <TabsContent value="notifications" className="mt-6"><NotificationsTab /></TabsContent>
          <TabsContent value="settings" className="mt-6"><SettingsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="gradient-hero text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/15 p-2.5 backdrop-blur">
            <GraduationCap className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Quản lý học sinh</h1>
            <p className="text-sm text-white/85">Piano · Múa · Vẽ</p>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------- STUDENTS TAB ---------------------------- */

function StudentsTab() {
  const fetchList = useServerFn(listStudents);
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: () => fetchList(),
  });

  const [filter, setFilter] = useState<"Tất cả" | ClassType>("Tất cả");
  const filtered = useMemo(
    () => (filter === "Tất cả" ? students : (students as Student[]).filter((s) => s.class_type === filter)),
    [students, filter],
  );

  const stats = useMemo(() => {
    const list = students as Student[];
    return {
      total: list.length,
      piano: list.filter((s) => s.class_type === "Piano").length,
      mua: list.filter((s) => s.class_type === "Múa").length,
      ve: list.filter((s) => s.class_type === "Vẽ").length,
    };
  }, [students]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tổng học sinh" value={stats.total} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Piano" value={stats.piano} icon={<Music className="h-4 w-4" />} tint="piano" />
        <StatCard label="Múa" value={stats.mua} icon={<Sparkles className="h-4 w-4" />} tint="mua" />
        <StatCard label="Vẽ" value={stats.ve} icon={<Palette className="h-4 w-4" />} tint="ve" />
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Danh sách học sinh</CardTitle>
            <CardDescription>Thêm, sửa, xóa và theo dõi trạng thái học sinh.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <StudentDialog trigger={<Button><Plus className="mr-1 h-4 w-4" />Thêm học sinh</Button>} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Đang tải...</div>
          ) : filtered.length === 0 ? (
            <EmptyState text="Chưa có học sinh nào. Bấm 'Thêm học sinh' để bắt đầu." />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Họ tên</TableHead>
                    <TableHead>Tuổi</TableHead>
                    <TableHead>Lớp</TableHead>
                    <TableHead>Học phí</TableHead>
                    <TableHead>Lịch học</TableHead>
                    <TableHead className="text-center">Ca/ngày</TableHead>
                    <TableHead className="text-center">Buổi/khóa</TableHead>
                    <TableHead>Kỳ học</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filtered as Student[]).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.age}</TableCell>
                      <TableCell>{classChip(s.class_type)}</TableCell>
                      <TableCell>{Number(s.tuition).toLocaleString("vi-VN")}đ</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(s.schedule_days ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            (s.schedule_days ?? [])
                              .slice()
                              .sort((a, b) => a - b)
                              .map((d) => (
                                <span key={d} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                                  {DAYS[d]}
                                </span>
                              ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{s.sessions_per_day ?? 1}</TableCell>
                      <TableCell className="text-center">{s.total_sessions ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(s.start_date)} → {fmtDate(s.end_date)}
                      </TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <StudentDialog student={s} trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                          <DeleteStudentButton id={s.id} name={s.name} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon, tint }: { label: string; value: number; icon: React.ReactNode; tint?: "piano" | "mua" | "ve" }) {
  const tintCls = tint === "piano" ? "bg-piano/10 text-piano" : tint === "mua" ? "bg-mua/10 text-mua" : tint === "ve" ? "bg-ve/20 text-[color:var(--ve-foreground)]" : "bg-primary/10 text-primary";
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${tintCls}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

function StudentDialog({ student, trigger }: { student?: Student; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const upsert = useServerFn(upsertStudent);
  const mut = useMutation({
    mutationFn: (v: Omit<Student, "id"> & { id?: string }) => upsert({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(student ? "Đã cập nhật học sinh" : "Đã thêm học sinh");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [form, setForm] = useState<Omit<Student, "id"> & { id?: string }>(() => {
    const cls = student?.class_type ?? "Piano";
    return {
      id: student?.id,
      name: student?.name ?? "",
      age: student?.age ?? 8,
      class_type: cls,
      tuition: student?.tuition ?? 500000,
      start_date: student?.start_date ?? new Date().toISOString().slice(0, 10),
      end_date: student?.end_date ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      status: student?.status ?? "Đang học",
      reserve_days: student?.reserve_days ?? 0,
      total_sessions: student?.total_sessions ?? defaultSessionsFor(cls),
      schedule_days: student?.schedule_days ?? [],
      sessions_per_day: (student?.sessions_per_day ?? 1) as 1 | 2,
    };
  });

  // Tự tính ngày kết thúc khi đủ dữ liệu (bỏ qua khi user đang chỉnh tay ngày kết thúc)
  const autoEnd = useMemo(
    () => computeEndDate(form.start_date, form.schedule_days, form.sessions_per_day, form.total_sessions),
    [form.start_date, form.schedule_days, form.sessions_per_day, form.total_sessions],
  );
  const sessionsPerWeek = form.schedule_days.length * form.sessions_per_day;

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      schedule_days: f.schedule_days.includes(d)
        ? f.schedule_days.filter((x) => x !== d)
        : [...f.schedule_days, d].sort((a, b) => a - b),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{student ? "Sửa học sinh" : "Thêm học sinh mới"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Tên học sinh</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tuổi</Label>
              <Input type="number" min={1} max={120} value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label>Lớp học</Label>
              <Select
                value={form.class_type}
                onValueChange={(v) => {
                  const cls = v as ClassType;
                  setForm((f) => ({ ...f, class_type: cls, total_sessions: defaultSessionsFor(cls) }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Học phí (VNĐ)</Label>
              <Input type="number" min={0} value={form.tuition} onChange={(e) => setForm({ ...form, tuition: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label>Tổng số buổi/khóa</Label>
              <Input
                type="number"
                min={1}
                value={form.total_sessions}
                onChange={(e) => setForm({ ...form, total_sessions: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">Mặc định Piano 48, Múa/Vẽ 24.</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Lịch học (chọn các thứ trong tuần)</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_ORDER.map((d) => {
                const active = form.schedule_days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    {DAYS[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Số ca/ngày</Label>
              <Select
                value={String(form.sessions_per_day)}
                onValueChange={(v) => setForm({ ...form, sessions_per_day: Number(v) as 1 | 2 })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 ca</SelectItem>
                  <SelectItem value="2">2 ca</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Số buổi/tuần</Label>
              <div className={`rounded-md border px-3 py-2 text-sm ${sessionsPerWeek < 2 ? "border-destructive/50 text-destructive" : "bg-muted/40"}`}>
                {sessionsPerWeek} buổi/tuần {sessionsPerWeek < 2 && "(tối thiểu 2)"}
              </div>
            </div>
          </div>

          {(() => {
            const startDow = dayOfWeekOf(form.start_date);
            const endDow = dayOfWeekOf(form.end_date);
            const startInvalid = startDow !== null && form.schedule_days.length > 0 && !form.schedule_days.includes(startDow);
            const endInvalid = endDow !== null && form.schedule_days.length > 0 && !form.schedule_days.includes(endDow);
            return (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Ngày bắt đầu</Label>
                    <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={startInvalid ? "border-destructive" : ""} />
                    {startInvalid && <p className="text-xs text-destructive">Ngày bắt đầu không trùng lịch học. Chọn 1 ngày là {form.schedule_days.map((d) => DAYS[d]).join(", ")}.</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label>Ngày kết thúc (tự tính)</Label>
                    <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={endInvalid ? "border-destructive" : ""} />
                    {endInvalid && <p className="text-xs text-destructive">Ngày kết thúc không trùng lịch học.</p>}
                    {autoEnd && autoEnd !== form.end_date && (
                      <button
                        type="button"
                        className="text-left text-xs text-primary hover:underline"
                        onClick={() => setForm((f) => ({ ...f, end_date: autoEnd }))}
                      >
                        Dùng ngày tính tự động: {fmtDate(autoEnd)}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Trạng thái</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as StudentStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Đang học">Đang học</SelectItem>
                        <SelectItem value="Nghỉ phép">Nghỉ phép</SelectItem>
                        <SelectItem value="Bảo lưu">Bảo lưu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.status === "Bảo lưu" && (
                    <div className="grid gap-2">
                      <Label>Số ngày bảo lưu</Label>
                      <Input type="number" min={0} value={form.reserve_days} onChange={(e) => setForm({ ...form, reserve_days: Number(e.target.value) })} />
                    </div>
                  )}
                </div>
                {form.status === "Bảo lưu" && (
                  <p className="rounded-md bg-primary/5 p-2 text-xs text-primary">
                    Ngày kết thúc sẽ tự động được cộng thêm số ngày bảo lưu.
                  </p>
                )}
              </>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button
            onClick={() => {
              if (!form.name.trim()) return toast.error("Vui lòng nhập tên học sinh");
              if (form.schedule_days.length === 0) return toast.error("Vui lòng chọn ít nhất 1 ngày trong tuần");
              if (sessionsPerWeek < 2) return toast.error("Học sinh phải học tối thiểu 2 buổi/tuần");
              const finalEnd = autoEnd && !form.end_date ? autoEnd : form.end_date;
              const sDow = dayOfWeekOf(form.start_date);
              const eDow = dayOfWeekOf(finalEnd);
              if (sDow === null || !form.schedule_days.includes(sDow)) {
                return toast.error("Ngày bắt đầu không trùng lịch học. Vui lòng sửa ngày bắt đầu hoặc lịch học.");
              }
              if (eDow === null || !form.schedule_days.includes(eDow)) {
                return toast.error("Ngày kết thúc không trùng lịch học. Vui lòng sửa ngày kết thúc hoặc lịch học.");
              }
              mut.mutate({ ...form, end_date: finalEnd });
            }}
            disabled={mut.isPending}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStudentButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteStudent);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success("Đã xóa học sinh");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      size="icon"
      variant="ghost"
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => {
        if (confirm(`Xóa học sinh "${name}"?`)) mut.mutate();
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

/* ---------------------------- SCHEDULE TAB ---------------------------- */

function ScheduleTab() {
  const fetchSched = useServerFn(listSchedule);
  const { data = [], isLoading } = useQuery({ queryKey: ["schedule"], queryFn: () => fetchSched() });

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Thời khóa biểu tuần</CardTitle>
        <CardDescription>Lịch học cố định của 3 lớp Piano, Múa, Vẽ.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {DAYS_ORDER.map((dow) => {
              const items = (data as any[]).filter((s) => s.day_of_week === dow);
              return (
                <div key={dow} className="rounded-lg border bg-card p-3">
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">{DAYS[dow]}</p>
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70">—</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((s) => (
                        <div key={s.id} className="rounded-md border bg-background p-2">
                          <div className="mb-1">{classChip(s.class_type)}</div>
                          <p className="text-sm font-medium">{String(s.start_time).slice(0, 5)} - {String(s.end_time).slice(0, 5)}</p>
                          {s.location && <p className="text-xs text-muted-foreground">📍 {s.location}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------- ATTENDANCE TAB ---------------------------- */

function AttendanceTab() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classFilter, setClassFilter] = useState<"Tất cả" | ClassType>("Tất cả");

  const fetchList = useServerFn(listStudents);
  const fetchAtt = useServerFn(listAttendance);
  const setAtt = useServerFn(setAttendance);
  const qc = useQueryClient();

  const { data: students = [] } = useQuery({ queryKey: ["students"], queryFn: () => fetchList() });
  const { data: attRows = [] } = useQuery({
    queryKey: ["attendance", date],
    queryFn: () => fetchAtt({ data: { date } }),
  });

  const attMap = useMemo(() => {
    const m = new Map<string, AttendanceStatus>();
    (attRows as any[]).forEach((r) => m.set(r.student_id, r.status));
    return m;
  }, [attRows]);

  const filtered = (students as Student[]).filter((s) => s.status === "Đang học" && (classFilter === "Tất cả" || s.class_type === classFilter));

  const mut = useMutation({
    mutationFn: (v: { student_id: string; status: AttendanceStatus }) => setAtt({ data: { ...v, date } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", date] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Sổ điểm danh</CardTitle>
          <CardDescription>Chọn trạng thái điểm danh cho từng học sinh trong ngày.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[160px]" />
          <Select value={classFilter} onValueChange={(v) => setClassFilter(v as typeof classFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
              {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <EmptyState text="Không có học sinh đang học phù hợp bộ lọc." />
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const current = attMap.get(s.id);
              const opts: { v: AttendanceStatus; cls: string }[] = [
                { v: "Đi học", cls: "bg-success text-white" },
                { v: "Nghỉ có phép", cls: "bg-warning text-white" },
                { v: "Nghỉ không phép", cls: "bg-danger text-white" },
              ];
              return (
                <div key={s.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <div className="mt-0.5">{classChip(s.class_type)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {opts.map((o) => (
                      <Button
                        key={o.v}
                        size="sm"
                        variant={current === o.v ? "default" : "outline"}
                        className={current === o.v ? o.cls : ""}
                        onClick={() => mut.mutate({ student_id: s.id, status: o.v })}
                      >
                        {o.v}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------- NOTIFICATIONS TAB ---------------------------- */

function NotificationsTab() {
  const fetchList = useServerFn(listStudents);
  const fetchSched = useServerFn(listSchedule);
  const sendSched = useServerFn(sendTodayScheduleTelegram);
  const sendExp = useServerFn(sendExpiringTelegram);

  const { data: students = [] } = useQuery({ queryKey: ["students"], queryFn: () => fetchList() });
  const { data: schedule = [] } = useQuery({ queryKey: ["schedule"], queryFn: () => fetchSched() });

  const expiring = useMemo(() => {
    const now = new Date();
    const in5 = new Date();
    in5.setDate(now.getDate() + 5);
    return (students as Student[])
      .filter((s) => s.status === "Đang học")
      .filter((s) => {
        const e = new Date(s.end_date);
        return e >= new Date(now.toDateString()) && e <= in5;
      })
      .sort((a, b) => a.end_date.localeCompare(b.end_date));
  }, [students]);

  const todayDow = new Date().getDay();
  const todaySchedule = (schedule as any[]).filter((s) => s.day_of_week === todayDow);

  const mutSched = useMutation({ mutationFn: () => sendSched(), onSuccess: () => toast.success("Đã gửi lịch học hôm nay qua Telegram"), onError: (e: Error) => toast.error(e.message) });
  const mutExp = useMutation({ mutationFn: () => sendExp(), onSuccess: () => toast.success("Đã gửi nhắc học phí qua Telegram"), onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Lịch học hôm nay</CardTitle>
            <CardDescription>{DAYS[todayDow]}, {new Date().toLocaleDateString("vi-VN")}</CardDescription>
          </div>
          <Button size="sm" onClick={() => mutSched.mutate()} disabled={mutSched.isPending}>
            {mutSched.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Gửi Telegram
          </Button>
        </CardHeader>
        <CardContent>
          {todaySchedule.length === 0 ? (
            <EmptyState text="Hôm nay không có lịch học." />
          ) : (
            <div className="space-y-2">
              {todaySchedule.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-3">
                    {classChip(s.class_type)}
                    <span className="font-medium">{String(s.start_time).slice(0, 5)} - {String(s.end_time).slice(0, 5)}</span>
                  </div>
                  {s.location && <span className="text-sm text-muted-foreground">📍 {s.location}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-[color:var(--warning)]" />Sắp hết hạn học phí</CardTitle>
            <CardDescription>Trong vòng 5 ngày tới</CardDescription>
          </div>
          <Button size="sm" onClick={() => mutExp.mutate()} disabled={mutExp.isPending}>
            {mutExp.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Gửi Telegram
          </Button>
        </CardHeader>
        <CardContent>
          {expiring.length === 0 ? (
            <EmptyState text="Không có học sinh nào sắp hết hạn." />
          ) : (
            <div className="space-y-2">
              {expiring.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {classChip(s.class_type)}
                      <span>Hết hạn: {fmtDate(s.end_date)}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{Number(s.tuition).toLocaleString("vi-VN")}đ</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card lg:col-span-2">
        <CardHeader>
          <CardTitle>Gửi tin nhắn tùy chỉnh</CardTitle>
          <CardDescription>Soạn nội dung bất kỳ và gửi ngay vào nhóm Telegram.</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomTelegramForm />
        </CardContent>
      </Card>
    </div>
  );
}

function CustomTelegramForm() {
  const [text, setText] = useState("");
  const send = useServerFn(sendCustomTelegram);
  const mut = useMutation({
    mutationFn: () => send({ data: { text } }),
    onSuccess: () => { toast.success("Đã gửi tin nhắn"); setText(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <Textarea rows={4} placeholder="Nhập nội dung tin nhắn..." value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end">
        <Button onClick={() => text.trim() ? mut.mutate() : toast.error("Vui lòng nhập nội dung")} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Gửi Telegram
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------- SETTINGS TAB ---------------------------- */

function SettingsTab() {
  const getStatus = useServerFn(getTelegramStatus);
  const save = useServerFn(saveTelegramConfig);
  const qc = useQueryClient();

  const { data: status } = useQuery({ queryKey: ["tg-status"], queryFn: () => getStatus() });
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");

  const mut = useMutation({
    mutationFn: () => save({ data: { bot_token: token, chat_id: chatId } }),
    onSuccess: () => {
      toast.success("Đã lưu cấu hình Telegram");
      qc.invalidateQueries({ queryKey: ["tg-status"] });
      setToken("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-card max-w-2xl">
      <CardHeader>
        <CardTitle>Cấu hình Telegram Bot</CardTitle>
        <CardDescription>
          Token và Chat ID được lưu bảo mật ở backend, không lộ ra trình duyệt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Trạng thái: {status?.configured ? (
            <span className="text-[color:var(--success)]">Đã cấu hình ✓</span>
          ) : (
            <span className="text-[color:var(--warning)]">Chưa cấu hình</span>
          )}</p>
          {status?.chat_id && <p className="mt-1 text-xs text-muted-foreground">Chat ID hiện tại: {status.chat_id}</p>}
        </div>

        <div className="grid gap-2">
          <Label>Bot Token</Label>
          <Input
            type="password"
            placeholder={status?.has_token ? "•••••••• (đã có, nhập để thay)" : "123456:ABC-..."}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Lấy từ @BotFather trên Telegram.</p>
        </div>

        <div className="grid gap-2">
          <Label>Chat ID nhóm</Label>
          <Input placeholder="-1001234567890" value={chatId} onChange={(e) => setChatId(e.target.value)} />
          <p className="text-xs text-muted-foreground">Thêm bot vào nhóm rồi dùng @userinfobot hoặc getUpdates để lấy Chat ID.</p>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => {
              if (!token.trim() || !chatId.trim()) return toast.error("Vui lòng nhập cả Token và Chat ID");
              mut.mutate();
            }}
            disabled={mut.isPending}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu cấu hình
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
