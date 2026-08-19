import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, GraduationCap, Loader2, Pencil, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classChip, EmptyState } from "@/components/ui-bits";
import { NameSearchInput } from "@/components/NameSearchInput";
import { TrialStudentDialog } from "@/components/TrialStudentDialog";
import { useAccess } from "@/lib/access";
import { ClassSelect } from "@/lib/class-scope";
import { exportXlsx } from "@/lib/export";
import { fmtDate, hhmm, trialStatus, type ClassType, type TrialStudent } from "@/lib/shared";
import { deleteTrialStudent, listTrialStudents } from "@/lib/trials.functions";

export function useTrialStudents() {
  const fetchTrials = useServerFn(listTrialStudents);
  return useQuery<TrialStudent[]>({ queryKey: ["trial-students"], queryFn: () => fetchTrials() as any });
}

export function TrialStudentsCard({ onRegisterTrial }: { onRegisterTrial?: (t: TrialStudent) => void } = {}) {
  const { data: trials = [], isLoading } = useTrialStudents();
  const [statusFilter, setStatusFilter] = useState<"Tất cả" | "Học thử" | "Kết thúc" | "Đã đăng ký">("Tất cả");
  const [classFilter, setClassFilter] = useState<ClassType | "Tất cả">("Tất cả");
  const [nameSearch, setNameSearch] = useState("");

  const now = new Date();
  const [periodMode, setPeriodMode] = useState<"all" | "month" | "year">("all");
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, setYear] = useState(String(now.getFullYear()));

  const rows = useMemo(
    () =>
      trials.filter((t) => {
        if (classFilter !== "Tất cả" && t.class_type !== classFilter) return false;
        if (statusFilter !== "Tất cả" && trialStatus(t) !== statusFilter) return false;
        if (periodMode === "month" && t.trial_date.slice(0, 7) !== month) return false;
        if (periodMode === "year" && t.trial_date.slice(0, 4) !== year) return false;
        if (nameSearch.trim() && !t.name.toLowerCase().includes(nameSearch.trim().toLowerCase())) return false;
        return true;
      }),
    [trials, classFilter, statusFilter, periodMode, month, year, nameSearch],
  );

  // Gợi ý tên trong phạm vi lớp + trạng thái + kỳ hạn đang lọc (chưa áp lọc theo tên).
  const nameSuggestions = useMemo(
    () =>
      trials
        .filter((t) => {
          if (classFilter !== "Tất cả" && t.class_type !== classFilter) return false;
          if (statusFilter !== "Tất cả" && trialStatus(t) !== statusFilter) return false;
          if (periodMode === "month" && t.trial_date.slice(0, 7) !== month) return false;
          if (periodMode === "year" && t.trial_date.slice(0, 4) !== year) return false;
          return true;
        })
        .map((t) => t.name),
    [trials, classFilter, statusFilter, periodMode, month, year],
  );

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Danh sách học sinh học thử</CardTitle>
          <CardDescription>Học sinh đăng ký học thử 1 buổi trước khi vào học chính thức.</CardDescription>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:justify-end">
          <NameSearchInput
            value={nameSearch}
            onChange={setNameSearch}
            names={nameSuggestions}
            className="col-span-2 w-full sm:w-[220px]"
          />
          <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as typeof periodMode)}>
            <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả học sinh</SelectItem>
              <SelectItem value="month">Theo tháng</SelectItem>
              <SelectItem value="year">Theo năm</SelectItem>
            </SelectContent>
          </Select>
          {periodMode === "month" && (
            <DateInput variant="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full sm:w-[150px]" />
          )}
          {periodMode === "year" && (
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full sm:w-[110px]" />
          )}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Tất cả">Tất cả trạng thái</SelectItem>
              <SelectItem value="Học thử">Học thử</SelectItem>
              <SelectItem value="Kết thúc">Kết thúc</SelectItem>
              <SelectItem value="Đã đăng ký">Đã đăng ký</SelectItem>
            </SelectContent>
          </Select>
          <ClassSelect
            value={classFilter}
            onChange={(v) => setClassFilter(v as ClassType | "Tất cả")}
            allLabel="Tất cả lớp"
            className="w-full sm:w-auto sm:min-w-[140px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() =>
              exportXlsx("hoc-sinh-hoc-thu", [
                {
                  name: "Học thử",
                  rows: [
                    ["Họ tên", "Tuổi", "Lớp", "Giờ bắt đầu", "Giờ kết thúc", "Ngày học thử", "Trạng thái", "Điểm danh", "Số lần dời buổi"],
                    ...rows.map((t) => [
                      t.name,
                      t.age,
                      t.class_type,
                      hhmm(t.start_time),
                      hhmm(t.end_time),
                      fmtDate(t.trial_date),
                      trialStatus(t),
                      t.attendance_status ?? "Chưa điểm danh",
                      (t.reschedule_history ?? []).length,
                    ]),
                  ],
                },
              ])
            }
          >
            <Download className="mr-1 h-4 w-4" />Xuất dữ liệu
          </Button>
          <TrialStudentDialog
            trigger={<Button size="sm" className="w-full sm:w-auto"><GraduationCap className="mr-1 h-4 w-4" />Học thử</Button>}
          />
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />Đang tải...
          </div>
        ) : rows.length === 0 ? (
          <EmptyState text="Chưa có học sinh học thử nào." />
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Tuổi</TableHead>
                  <TableHead>Lớp</TableHead>
                  <TableHead>Lịch học (giờ)</TableHead>
                  <TableHead>Ngày học thử</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Điểm danh</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const st = trialStatus(t);
                  const alreadyRegistered = st === "Đã đăng ký";
                  const canRegister = t.attendance_status === "Đi học" && !alreadyRegistered;
                  const registerTitle = alreadyRegistered
                    ? "Học sinh đã đăng ký học chính thức"
                    : t.attendance_status === "Đi học"
                      ? "Đăng ký học chính thức cho học sinh này"
                      : "Chỉ đăng ký được sau khi điểm danh 'Đi học'";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{t.age}</TableCell>
                      <TableCell>{classChip(t.class_type)}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                          {hhmm(t.start_time)}–{hhmm(t.end_time)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(t.trial_date)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            st === "Học thử"
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : st === "Đã đăng ký"
                                ? "border-success/40 bg-success/10 text-[color:var(--success)]"
                                : "text-muted-foreground"
                          }
                        >
                          {st}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.attendance_status ? (
                          <Badge
                            variant="outline"
                            className={
                              t.attendance_status === "Đi học"
                                ? "border-success/40 bg-success/10 text-[color:var(--success)]"
                                : "border-destructive/40 bg-destructive/10 text-destructive"
                            }
                          >
                            {t.attendance_status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Chưa điểm danh</span>
                        )}
                        {(t.reschedule_history ?? []).length > 0 && (
                          <span className="ml-1 text-[11px] text-muted-foreground">· đã dời {(t.reschedule_history ?? []).length} lần</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className={canRegister ? "text-primary hover:bg-primary/10" : "opacity-40"}
                            disabled={!canRegister}
                            title={registerTitle}
                            onClick={() => {
                              if (!canRegister) return;
                              onRegisterTrial?.(t);
                            }}
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                          <TrialStudentDialog trial={t} trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                          <DeleteTrialButton id={t.id} name={t.name} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteTrialButton({ id, name }: { id: string; name: string }) {
  const { canDelete } = useAccess();
  const qc = useQueryClient();
  const del = useServerFn(deleteTrialStudent);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trial-students"] }); toast.success("Đã xóa học sinh học thử"); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!canDelete) return null;
  return (
    <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => { if (confirm(`Xóa học sinh học thử "${name}"?`)) mut.mutate(); }}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
