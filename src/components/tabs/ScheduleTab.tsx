import { Fragment, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CLASSES,
  DAYS_ORDER,
  DAYS_SHORT,
  addDays,
  fmtDate,
  startOfWeek,
  toLocalISO,
  type AttendanceRow,
  type ClassType,
  type ScheduleSlot,
  type Student,
} from "@/lib/shared";
import { listAttendanceRange, listStudents } from "@/lib/students.functions";

type TimeRow = { label: string; start: string; end: string; ca: "sang" | "chieu" };

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }) {
  return a.start < b.end && b.start < a.end;
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function fromMin(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Chia mỗi slot thành các row 1 giờ; gom unique và sắp xếp. */
function buildTimeRows(slots: { start: string; end: string }[]): TimeRow[] {
  const set = new Set<string>();
  for (const s of slots) {
    let cur = toMin(s.start);
    const end = toMin(s.end);
    while (cur < end) {
      const nxt = Math.min(cur + 60, end);
      set.add(`${fromMin(cur)}|${fromMin(nxt)}`);
      cur = nxt;
    }
  }
  const arr: TimeRow[] = Array.from(set)
    .map((k) => {
      const [start, end] = k.split("|");
      return { start, end, label: `${start}–${end}`, ca: toMin(start) < 12 * 60 ? ("sang" as const) : ("chieu" as const) };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  return arr;
}

export function ScheduleTab() {
  const fetchList = useServerFn(listStudents);
  const fetchAtt = useServerFn(listAttendanceRange);
  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchList() as any });

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [cls, setCls] = useState<ClassType>("Piano");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [nameSearch, setNameSearch] = useState<string>("");

  const weekEnd = addDays(weekStart, 6);
  const fromISO = toLocalISO(weekStart);
  const toISO = toLocalISO(weekEnd);

  const { data: attRows = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance-range", fromISO, toISO],
    queryFn: () => fetchAtt({ data: { from: fromISO, to: toISO } }) as any,
  });

  // Map: studentId -> map<dateISO, status>
  const attByStudentDate = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const r of attRows) {
      if (!m.has(r.student_id)) m.set(r.student_id, new Map());
      m.get(r.student_id)!.set(r.date, r.status);
    }
    return m;
  }, [attRows]);

  const inClass = useMemo(() => students.filter((s) => s.class_type === cls), [students, cls]);
  const filteredStudents = useMemo(() => {
    let list = inClass;
    if (studentFilter !== "all") list = list.filter((s) => s.id === studentFilter);
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [inClass, studentFilter, nameSearch]);

  const TIME_ROWS = useMemo(() => {
    const slots: { start: string; end: string }[] = [];
    for (const s of inClass) for (const sl of (s.schedule_slots ?? [])) slots.push({ start: sl.start, end: sl.end });
    const rows = buildTimeRows(slots);
    if (rows.length === 0) {
      return [
        { label: "9:00–10:00", start: "09:00", end: "10:00", ca: "sang" as const },
        { label: "16:00–17:00", start: "16:00", end: "17:00", ca: "chieu" as const },
      ] satisfies TimeRow[];
    }
    return rows;
  }, [inClass]);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);

  const exportImg = async () => {
    if (!frameRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(frameRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      const suffix = studentFilter === "all" ? cls : `${cls}-${(inClass.find((s) => s.id === studentFilter)?.name ?? "").replace(/\s+/g, "_")}`;
      link.download = `TKB-${suffix}-${fromISO}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Đã xuất ảnh thời khóa biểu");
    } catch (e) {
      toast.error("Lỗi xuất ảnh: " + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Thời khóa biểu tuần</CardTitle>
          <CardDescription>
            Từ {fmtDate(fromISO)} đến {fmtDate(toISO)}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Tuần này</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <Input
            placeholder="Tìm theo tên học sinh..."
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            className="w-[200px]"
          />
          <Select value={studentFilter} onValueChange={setStudentFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Chọn học sinh..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả học sinh</SelectItem>
              {inClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={exportImg} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Xuất ảnh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={cls} onValueChange={(v) => { setCls(v as ClassType); setStudentFilter("all"); }}>
          <TabsList className="mb-4">
            {CLASSES.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <div ref={frameRef} className="rounded-lg border bg-white p-4">
          <div className="mb-3 text-center">
            <h3 className="text-lg font-bold">Thời khóa biểu lớp {cls}</h3>
            <p className="text-xs text-muted-foreground">Tuần từ {fmtDate(fromISO)} đến {fmtDate(toISO)}{studentFilter !== "all" ? ` · ${inClass.find((s) => s.id === studentFilter)?.name}` : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-[110px] border bg-muted p-2 text-left text-xs font-semibold">Giờ</th>
                  {DAYS_ORDER.map((d, i) => {
                    const date = addDays(weekStart, i);
                    return (
                      <th key={d} className="border bg-muted p-2 text-center text-xs font-semibold">
                        <div>{DAYS_SHORT[d]}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">{date.getDate()}/{date.getMonth() + 1}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {TIME_ROWS.map((row, rIdx) => {
                  const isFirstOfSession = rIdx === 0 || TIME_ROWS[rIdx - 1].ca !== row.ca;
                  return (
                    <Fragment key={row.label}>
                      {isFirstOfSession && (
                        <tr>
                          <td colSpan={8} className={`border px-2 py-1 text-xs font-semibold uppercase ${row.ca === "sang" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"}`}>
                            {row.ca === "sang" ? "Ca sáng" : "Ca chiều"}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="border bg-muted/40 p-2 text-xs font-medium">{row.label}</td>
                        {DAYS_ORDER.map((dow, i) => {
                          const date = addDays(weekStart, i);
                          const dateISO = toLocalISO(date);
                          const cellStudents: Array<{ s: Student; slot: ScheduleSlot; dim: boolean }> = [];
                          for (const s of filteredStudents) {
                            const slots = (s.schedule_slots ?? []) as ScheduleSlot[];
                            for (const sl of slots) {
                              if (sl.day !== dow) continue;
                              if (!overlaps(sl, row)) continue;
                              const attStatus = attByStudentDate.get(s.id)?.get(dateISO);
                              const dim = attStatus === "Nghỉ có phép" || s.status === "Bảo lưu";
                              cellStudents.push({ s, slot: sl, dim });
                            }
                          }
                          return (
                            <td key={dow} className="border p-1 align-top">
                              <div className="space-y-1">
                                {cellStudents.map(({ s, slot, dim }, idx) => (
                                  <div key={idx} className={`rounded border-l-2 border-primary bg-primary/5 px-1.5 py-1 text-[11px] leading-tight ${dim ? "opacity-50" : ""}`}>
                                    <div className="font-medium">{s.name}</div>
                                    <div className="text-[10px] text-muted-foreground">{slot.start}–{slot.end}</div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span>• Học sinh nghỉ có phép hoặc đang bảo lưu sẽ mờ 50%</span>
            <span>• Lịch tự cập nhật từ thông tin học sinh và điểm danh</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
