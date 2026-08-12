import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, GraduationCap, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classChip, EmptyState } from "@/components/ui-bits";
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

export function TrialStudentsCard() {
  const { data: trials = [], isLoading } = useTrialStudents();
  const [statusFilter, setStatusFilter] = useState<"Tất cả" | "Học thử" | "Kết thúc">("Tất cả");
  const [classFilter, setClassFilter] = useState<ClassType | "Tất cả">("Tất cả");

  const rows = useMemo(
    () =>
      trials.filter(
        (t) =>
          (classFilter === "Tất cả" || t.class_type === classFilter) &&
          (statusFilter === "Tất cả" || trialStatus(t) === statusFilter),
      ),
    [trials, classFilter, statusFilter],
  );

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Danh sách học sinh học thử</CardTitle>
            <CardDescription>Học sinh đăng ký học thử 1 buổi trước khi vào học chính thức.</CardDescription>
          </div>
          <TrialStudentDialog
            trigger={<Button size="sm"><GraduationCap className="mr-1 h-4 w-4" />Học thử</Button>}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-auto min-w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Tất cả">Tất cả trạng thái</SelectItem>
              <SelectItem value="Học thử">Học thử</SelectItem>
              <SelectItem value="Kết thúc">Kết thúc</SelectItem>
            </SelectContent>
          </Select>
          <ClassSelect
            value={classFilter}
            onChange={(v) => setClassFilter(v as ClassType | "Tất cả")}
            allLabel="Tất cả lớp"
            className="w-auto min-w-[140px]"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportXlsx("hoc-sinh-hoc-thu", [
                {
                  name: "Học thử",
                  rows: [
                    ["Họ tên", "Tuổi", "Lớp", "Giờ bắt đầu", "Giờ kết thúc", "Ngày học thử", "Trạng thái"],
                    ...rows.map((t) => [
                      t.name,
                      t.age,
                      t.class_type,
                      hhmm(t.start_time),
                      hhmm(t.end_time),
                      fmtDate(t.trial_date),
                      trialStatus(t),
                    ]),
                  ],
                },
              ])
            }
          >
            <Download className="mr-1 h-4 w-4" />Xuất dữ liệu
          </Button>
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
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trials.map((t) => {
                  const st = trialStatus(t);
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
                          className={st === "Học thử" ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"}
                        >
                          {st}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
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
