import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classChip, EmptyState } from "@/components/ui-bits";
import {
  CLASSES,
  DAYS,
  dayOfWeekOf,
  toLocalISO,
  type AttendanceStatus,
  type ClassType,
  type ScheduleSlot,
  type Student,
} from "@/lib/shared";
import { listAttendance, listStudents, setAttendance } from "@/lib/students.functions";

export function AttendanceTab() {
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

  // Auto-mark: học sinh có lịch học nhưng chưa có bản ghi -> tự đánh "Đi học"
  const autoRunRef = useRef<string>("");
  useEffect(() => {
    if (!autoMark) return;
    const key = `${date}|${scheduled.map((s) => s.id).join(",")}`;
    if (autoRunRef.current === key) return;
    autoRunRef.current = key;
    const missing = scheduled.filter((s) => !attMap.has(s.id));
    if (missing.length === 0) return;
    (async () => {
      for (const s of missing) {
        try { await setAtt({ data: { student_id: s.id, date, status: "Đi học", note: null, makeup_date: null } as any }); }
        catch { /* ignore */ }
      }
      qc.invalidateQueries({ queryKey: ["attendance", date] });
      toast.success(`Đã tự động điểm danh ${missing.length} học sinh`);
    })();
  }, [autoMark, date, scheduled, attMap, setAtt, qc]);

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Sổ điểm danh</CardTitle>
          <CardDescription>{DAYS[dow ?? 0]} · Chỉ hiển thị học sinh có lịch học ngày này.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
