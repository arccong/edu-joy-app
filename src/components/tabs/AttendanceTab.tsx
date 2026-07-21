import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { classChip, EmptyState } from "@/components/ui-bits";
import {
  CLASSES,
  DAYS,
  DAYS_SHORT,
  addScheduledDays,
  coursePrefix,
  dayOfWeekOf,
  fmtDate,
  slotsPerDayMap,
  toLocalISO,
  type AttendanceStatus,
  type ClassType,
  type ScheduleSlot,
  type Student,
} from "@/lib/shared";
import { deleteAttendance, listAttendance, listAttendanceByStudent, listAttendanceRange, listStudents, setAttendance } from "@/lib/students.functions";
import { Badge } from "@/components/ui/badge";

export function AttendanceTab() {
  const [mode, setMode] = useState<"date" | "student">("date");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
          <Button size="sm" variant={mode === "date" ? "default" : "ghost"} onClick={() => setMode("date")}>Theo ngày</Button>
          <Button size="sm" variant={mode === "student" ? "default" : "ghost"} onClick={() => setMode("student")}>Theo học sinh</Button>
        </div>
      </div>
      {mode === "date" ? <ByDateView /> : <ByStudentView />}
    </div>
  );
}

function ByDateView() {

  const [date, setDate] = useState(toLocalISO(new Date()));
  const [classFilter, setClassFilter] = useState<"Tất cả" | ClassType>("Tất cả");
  const [autoMark, setAutoMark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("att-auto") === "1";
  });
  useEffect(() => {
    try { localStorage.setItem("att-auto", autoMark ? "1" : "0"); } catch { /* ignore */ }
  }, [autoMark]);

  const fetchList = useServerFn(listStudents);
  const fetchAtt = useServerFn(listAttendance);
  const setAtt = useServerFn(setAttendance);
  const qc = useQueryClient();

  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchList() as any });
  const { data: attRows = [] } = useQuery<any[]>({
    queryKey: ["attendance", date],
    queryFn: () => fetchAtt({ data: { date } }) as any,
  });

  const attMap = useMemo(() => {
    const m = new Map<string, { status: AttendanceStatus; note: string | null; makeup_date: string | null }>();
    for (const r of attRows) m.set(r.student_id, { status: r.status, note: r.note ?? null, makeup_date: r.makeup_date ?? null });
    return m;
  }, [attRows]);

  const dow = dayOfWeekOf(date);
  const scheduled = useMemo(() => {
    if (dow === null) return [];
    return (students as Student[])
      .filter((s) => s.status !== "Bảo lưu")
      .filter((s) => (classFilter === "Tất cả" || s.class_type === classFilter))
      .filter((s) => (s.schedule_slots ?? []).some((sl: ScheduleSlot) => sl.day === dow));
  }, [students, dow, classFilter]);

  const mut = useMutation({
    mutationFn: (v: { student_id: string; status: AttendanceStatus; note?: string | null; makeup_date?: string | null }) =>
      setAtt({ data: { ...v, date } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", date] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-mark: chỉ điểm danh sau khi đã tới giờ học của slot đó.
  // Trường hợp ngày trong quá khứ: điểm danh toàn bộ buổi chưa có bản ghi.
  const autoRunRef = useRef<string>("");
  useEffect(() => {
    if (!autoMark) return;
    const key = `${date}|${scheduled.map((s) => s.id).join(",")}`;
    if (autoRunRef.current === key) return;
    autoRunRef.current = key;

    const now = new Date();
    const todayISO = toLocalISO(now);
    const isPast = date < todayISO;
    const isToday = date === todayISO;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const missing = scheduled.filter((s) => {
      if (attMap.has(s.id)) return false;
      if (isPast) return true;
      if (!isToday) return false; // ngày tương lai: không tự điểm danh
      const slot = (s.schedule_slots ?? []).find((sl) => sl.day === dow);
      if (!slot) return false;
      const [sh, sm] = slot.start.split(":").map(Number);
      return nowMinutes >= sh * 60 + sm; // chỉ tự điểm danh sau khi tới giờ học
    });
    if (missing.length === 0) return;
    (async () => {
      for (const s of missing) {
        try { await setAtt({ data: { student_id: s.id, date, status: "Đi học", note: null, makeup_date: null } as any }); }
        catch { /* ignore */ }
      }
      qc.invalidateQueries({ queryKey: ["attendance", date] });
      toast.success(`Đã tự động điểm danh ${missing.length} học sinh`);
    })();
  }, [autoMark, date, scheduled, attMap, setAtt, qc, dow]);

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Sổ điểm danh</CardTitle>
          <CardDescription>{DAYS[dow ?? 0]} · Chỉ hiển thị học sinh có lịch học ngày này.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BackfillButton students={students as Student[]} />
          <label className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
            <Switch checked={autoMark} onCheckedChange={setAutoMark} />
            <span className="font-medium">Tự động điểm danh</span>
          </label>
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
        {scheduled.length === 0 ? (
          <EmptyState text="Ngày này không có học sinh nào có lịch học." />
        ) : (
          <div className="space-y-2">
            {scheduled.map((s) => {
              const rec = attMap.get(s.id);
              const slot = (s.schedule_slots ?? []).find((sl: ScheduleSlot) => sl.day === dow);
              return (
                <AttendanceRow
                  key={s.id}
                  student={s}
                  slot={slot}
                  rec={rec}
                  onChange={(status, extra) => mut.mutate({ student_id: s.id, status, ...extra })}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceRow({
  student, slot, rec, onChange,
}: {
  student: Student;
  slot?: ScheduleSlot;
  rec?: { status: AttendanceStatus; note: string | null; makeup_date: string | null };
  onChange: (status: AttendanceStatus, extra: { note?: string | null; makeup_date?: string | null }) => void;
}) {
  const [note, setNote] = useState(rec?.note ?? "");
  const [makeup, setMakeup] = useState(rec?.makeup_date ?? "");
  const current = rec?.status;

  const opts: { v: AttendanceStatus; cls: string }[] = [
    { v: "Đi học", cls: "bg-success text-white" },
    { v: "Nghỉ có phép", cls: "bg-warning text-white" },
    { v: "Nghỉ không phép", cls: "bg-danger text-white" },
    { v: "Bảo lưu", cls: "bg-primary text-primary-foreground" },
  ];

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{student.name}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {classChip(student.class_type)}
              {slot && <span>⏰ {slot.start}–{slot.end}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => (
            <Button
              key={o.v}
              size="sm"
              variant={current === o.v ? "default" : "outline"}
              className={current === o.v ? o.cls : ""}
              onClick={() => onChange(o.v, o.v === "Nghỉ có phép" ? { note, makeup_date: makeup || null } : { note: null, makeup_date: null })}
            >
              {o.v}
            </Button>
          ))}
        </div>
      </div>
      {current === "Nghỉ có phép" && (
        <div className="mt-3 grid gap-3 rounded-md border border-warning/40 bg-warning/5 p-3 sm:grid-cols-[1fr_180px]">
          <div className="grid gap-1">
            <Label className="text-xs">Nội dung phép</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vd: Ốm, đi du lịch..." />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Ngày học bù</Label>
            <Input type="date" value={makeup} onChange={(e) => setMakeup(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button size="sm" onClick={() => onChange("Nghỉ có phép", { note, makeup_date: makeup || null })}>
              Lưu ghi chú & học bù
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type BackfillRow = {
  key: string;
  student: Student;
  date: string;
  dow: number;
  slot: ScheduleSlot;
  selected: boolean;
  status: AttendanceStatus;
};

function BackfillButton({ students }: { students: Student[] }) {
  const [open, setOpen] = useState(false);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISO(d);
  }, []);
  const defaultFrom = useMemo(() => {
    const dates = students.map((s) => s.start_date).filter(Boolean).sort();
    if (dates.length === 0) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return toLocalISO(d);
    }
    return dates[0];
  }, [students]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(yesterday);
  const [scope, setScope] = useState<"Tất cả" | ClassType>("Tất cả");
  const [studentId, setStudentId] = useState<string>("all");
  const [rows, setRows] = useState<BackfillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const fetchRange = useServerFn(listAttendanceRange);
  const setAtt = useServerFn(setAttendance);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(yesterday);
    }
  }, [open, defaultFrom, yesterday]);

  const filteredStudents = useMemo(() => {
    let list = students.filter((s) => s.status !== "Kết thúc" && s.status !== "Bảo lưu");
    if (scope !== "Tất cả") list = list.filter((s) => s.class_type === scope);
    if (studentId !== "all") list = list.filter((s) => s.id === studentId);
    return list;
  }, [students, scope, studentId]);

  async function loadRows() {
    if (!from || !to || from > to) {
      toast.error("Khoảng ngày không hợp lệ");
      return;
    }
    setLoading(true);
    try {
      const existing = (await fetchRange({ data: { from, to } })) as { student_id: string; date: string }[];
      const has = new Set(existing.map((r) => `${r.student_id}|${r.date}`));
      const result: BackfillRow[] = [];
      const start = new Date(from + "T00:00:00");
      const end = new Date(to + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = toLocalISO(d);
        const dow = d.getDay();
        for (const s of filteredStudents) {
          if (iso < s.start_date || iso > s.end_date) continue;
          const slots = (s.schedule_slots ?? []).filter((sl) => sl.day === dow);
          for (const slot of slots) {
            const key = `${s.id}|${iso}|${slot.start}`;
            if (has.has(`${s.id}|${iso}`)) continue;
            result.push({ key, student: s, date: iso, dow, slot, selected: true, status: "Đi học" });
          }
        }
      }
      result.sort((a, b) => a.date.localeCompare(b.date) || a.student.name.localeCompare(b.student.name));
      setRows(result);
      if (result.length === 0) toast.info("Không có buổi nào cần bù");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  async function saveAll() {
    const picks = rows.filter((r) => r.selected);
    if (picks.length === 0) return;
    setSaving(true);
    setProgress(0);
    let ok = 0;
    let fail = 0;
    // gộp theo (student_id, date) — chỉ lưu 1 bản ghi/ngày (schema unique)
    const dedup = new Map<string, BackfillRow>();
    for (const r of picks) dedup.set(`${r.student.id}|${r.date}`, r);
    const list = Array.from(dedup.values());
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      try {
        await setAtt({
          data: {
            student_id: r.student.id,
            date: r.date,
            status: r.status,
            note: null,
            makeup_date: null,
          } as any,
        });
        ok++;
      } catch {
        fail++;
      }
      setProgress(i + 1);
    }
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["attendance"] });
    toast.success(`Đã lưu ${ok} buổi${fail ? `, lỗi ${fail}` : ""}`);
    setRows([]);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">Điểm danh bù</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Điểm danh bù hàng loạt</DialogTitle>
          <DialogDescription>Liệt kê các buổi học đã qua chưa điểm danh trong khoảng ngày đã chọn.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <div className="grid gap-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Lớp</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Học sinh</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {students
                  .filter((s) => scope === "Tất cả" || s.class_type === scope)
                  .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={loadRows} disabled={loading}>{loading ? "Đang tải..." : "Quét buổi thiếu"}</Button>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => setRows((rs) => rs.map((r) => ({ ...r, selected: !!v })))}
            />
            <span>Chọn tất cả ({selectedCount}/{rows.length})</span>
            <div className="ml-auto flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => r.selected ? { ...r, status: "Đi học" } : r))}>Đặt = Đi học</Button>
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => r.selected ? { ...r, status: "Nghỉ có phép" } : r))}>Đặt = Nghỉ CP</Button>
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => r.selected ? { ...r, status: "Nghỉ không phép" } : r))}>Đặt = Nghỉ KP</Button>
            </div>
          </div>
        )}

        <div className="mt-2 max-h-[400px] overflow-auto rounded-md border">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu. Bấm "Quét buổi thiếu" để bắt đầu.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs">
                <tr>
                  <th className="w-10 p-2"></th>
                  <th className="p-2 text-left">Ngày</th>
                  <th className="p-2 text-left">Thứ</th>
                  <th className="p-2 text-left">Học sinh</th>
                  <th className="p-2 text-left">Lớp</th>
                  <th className="p-2 text-left">Khung giờ</th>
                  <th className="p-2 text-left">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={r.selected}
                        onCheckedChange={(v) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, selected: !!v } : x))}
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="p-2">{DAYS_SHORT[r.dow]}</td>
                    <td className="p-2">{r.student.name}</td>
                    <td className="p-2">{classChip(r.student.class_type)}</td>
                    <td className="p-2 whitespace-nowrap">{r.slot.start}–{r.slot.end}</td>
                    <td className="p-2">
                      <Select
                        value={r.status}
                        onValueChange={(v) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, status: v as AttendanceStatus } : x))}
                      >
                        <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Đi học">Đi học</SelectItem>
                          <SelectItem value="Nghỉ có phép">Nghỉ có phép</SelectItem>
                          <SelectItem value="Nghỉ không phép">Nghỉ không phép</SelectItem>
                          <SelectItem value="Bảo lưu">Bảo lưu</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="mt-3">
          {saving && <span className="mr-auto text-xs text-muted-foreground">Đang lưu {progress}/{rows.filter((r) => r.selected).length}...</span>}
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Hủy</Button>
          <Button onClick={saveAll} disabled={saving || selectedCount === 0}>Lưu {selectedCount} buổi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

