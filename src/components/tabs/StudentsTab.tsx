import { useMemo, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, Users, Music, Sparkles, Palette, Columns3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classChip, EmptyState, statusBadge } from "@/components/ui-bits";
import { StudentDialog } from "@/components/StudentDialog";
import {
  CLASSES,
  DAYS_SHORT,
  fmtDate,
  formatMoney,
  type ClassType,
  type Student,
  type StudentStatus,
  type AttendanceRow,
} from "@/lib/shared";
import { deleteStudent, listAttendanceRange, listStudents } from "@/lib/students.functions";

const ALL_COLS = [
  { key: "name", label: "Họ tên" },
  { key: "age", label: "Tuổi" },
  { key: "class", label: "Lớp" },
  { key: "tuition", label: "Học phí" },
  { key: "schedule", label: "Lịch học (giờ)" },
  { key: "perDay", label: "Ca/ngày" },
  { key: "total", label: "Tổng buổi" },
  { key: "remain", label: "Buổi còn lại" },
  { key: "term", label: "Kỳ học" },
  { key: "status", label: "Trạng thái" },
  { key: "actions", label: "Thao tác" },
] as const;
type ColKey = typeof ALL_COLS[number]["key"];
const DEFAULT_COLS: ColKey[] = ALL_COLS.map((c) => c.key);

export function StudentsTab() {
  const fetchList = useServerFn(listStudents);
  const fetchAttRange = useServerFn(listAttendanceRange);
  const { data: students = [], isLoading } = useQuery({ queryKey: ["students"], queryFn: () => fetchList() });

  const [filter, setFilter] = useState<"Tất cả" | ClassType>("Tất cả");
  const [visible, setVisible] = useState<Set<ColKey>>(() => {
    if (typeof window === "undefined") return new Set(DEFAULT_COLS);
    try {
      const raw = localStorage.getItem("students-cols");
      if (raw) return new Set(JSON.parse(raw) as ColKey[]);
    } catch { /* ignore */ }
    return new Set(DEFAULT_COLS);
  });
  useEffect(() => {
    try { localStorage.setItem("students-cols", JSON.stringify(Array.from(visible))); } catch { /* ignore */ }
  }, [visible]);

  // Lấy toàn bộ điểm danh 2 năm gần để đếm 'Buổi còn lại'
  const today = new Date();
  const from = new Date(today); from.setFullYear(from.getFullYear() - 2);
  const to = new Date(today);
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = to.toISOString().slice(0, 10);
  const { data: attendedRows = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance-range", fromISO, toISO],
    queryFn: () => fetchAttRange({ data: { from: fromISO, to: toISO } }) as any,
  });

  const attendedByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of attendedRows) if (r.status === "Đi học") m.set(r.student_id, (m.get(r.student_id) ?? 0) + 1);
    return m;
  }, [attendedRows]);

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

  const show = (k: ColKey) => visible.has(k);

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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm"><Columns3 className="mr-1 h-4 w-4" />Cột</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Hiện/ẩn cột</p>
                <div className="space-y-1.5">
                  {ALL_COLS.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                      <Checkbox checked={visible.has(c.key)} onCheckedChange={(v) => {
                        setVisible((prev) => {
                          const n = new Set(prev);
                          if (v) n.add(c.key); else n.delete(c.key);
                          return n;
                        });
                      }} />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
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
                    {show("name") && <TableHead>Họ tên</TableHead>}
                    {show("age") && <TableHead>Tuổi</TableHead>}
                    {show("class") && <TableHead>Lớp</TableHead>}
                    {show("tuition") && <TableHead>Học phí</TableHead>}
                    {show("schedule") && <TableHead>Lịch học (giờ)</TableHead>}
                    {show("perDay") && <TableHead className="text-center">Ca/ngày</TableHead>}
                    {show("total") && <TableHead className="text-center">Tổng buổi</TableHead>}
                    {show("remain") && <TableHead className="text-center">Buổi còn lại</TableHead>}
                    {show("term") && <TableHead>Kỳ học</TableHead>}
                    {show("status") && <TableHead>Trạng thái</TableHead>}
                    {show("actions") && <TableHead className="text-right">Thao tác</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filtered as Student[]).map((s) => {
                    const attended = attendedByStudent.get(s.id) ?? 0;
                    const remain = Math.max(0, (s.total_sessions ?? 0) - attended);
                    return (
                      <TableRow key={s.id}>
                        {show("name") && <TableCell className="font-medium">{s.name}</TableCell>}
                        {show("age") && <TableCell>{s.age}</TableCell>}
                        {show("class") && <TableCell>{classChip(s.class_type)}</TableCell>}
                        {show("tuition") && <TableCell>{Number(s.tuition).toLocaleString("vi-VN")}đ</TableCell>}
                        {show("schedule") && (
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(s.schedule_slots ?? []).length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                (s.schedule_slots ?? [])
                                  .slice()
                                  .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
                                  .map((sl, i) => (
                                    <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                                      {DAYS_SHORT[sl.day]} ({sl.start}–{sl.end})
                                    </span>
                                  ))
                              )}
                            </div>
                          </TableCell>
                        )}
                        {show("perDay") && <TableCell className="text-center">{s.sessions_per_day ?? 1}</TableCell>}
                        {show("total") && <TableCell className="text-center">{s.total_sessions ?? "—"}</TableCell>}
                        {show("remain") && (
                          <TableCell className="text-center">
                            <span className={`font-semibold ${remain <= 5 ? "text-[color:var(--warning)]" : ""}`}>{remain}</span>
                            <span className="ml-1 text-xs text-muted-foreground">/{s.total_sessions}</span>
                          </TableCell>
                        )}
                        {show("term") && (
                          <TableCell className="text-sm text-muted-foreground">
                            {fmtDate(s.start_date)} → {fmtDate(s.end_date)}
                          </TableCell>
                        )}
                        {show("status") && <TableCell>{statusBadge(s.status)}</TableCell>}
                        {show("actions") && (
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              <StudentDialog student={s} trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                              <DeleteStudentButton id={s.id} name={s.name} />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeleteStudentButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteStudent);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["students"] }); toast.success("Đã xóa học sinh"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => { if (confirm(`Xóa học sinh "${name}"?`)) mut.mutate(); }}>
      <Trash2 className="h-4 w-4" />
    </Button>
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
