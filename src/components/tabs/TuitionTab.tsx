import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classChip, EmptyState } from "@/components/ui-bits";
import { CLASSES, fmtDate, fmtMonth, monthKey, toLocalISO, type ClassType, type Student, type TuitionPayment } from "@/lib/shared";
import { listStudents } from "@/lib/students.functions";
import { deletePayment, listPayments, upsertPayment } from "@/lib/tuition.functions";

export function TuitionTab() {
  const fetchList = useServerFn(listStudents);
  const fetchPay = useServerFn(listPayments);
  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchList() as any });
  const { data: payments = [] } = useQuery<TuitionPayment[]>({ queryKey: ["payments"], queryFn: () => fetchPay() as any });

  const now = new Date();
  const [month, setMonth] = useState<string>(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [cls, setCls] = useState<"Tất cả" | ClassType>("Tất cả");
  const [search, setSearch] = useState("");

  const stuMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const monthISO = month + "-01";
  const inMonth = useMemo(() => payments.filter((p) => p.month.slice(0, 7) === month), [payments, month]);

  const filtered = useMemo(() => {
    return inMonth.filter((p) => {
      const s = stuMap.get(p.student_id);
      if (!s) return false;
      if (cls !== "Tất cả" && s.class_type !== cls) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [inMonth, stuMap, cls, search]);

  const stats = useMemo(() => {
    const inClassScope = cls === "Tất cả" ? inMonth : inMonth.filter((p) => stuMap.get(p.student_id)?.class_type === cls);
    const total = inClassScope.reduce((a, b) => a + Number(b.amount), 0);
    const byClass: Record<ClassType, number> = { Piano: 0, "Múa": 0, "Vẽ": 0 };
    for (const p of inMonth) {
      const s = stuMap.get(p.student_id);
      if (!s) continue;
      byClass[s.class_type] += Number(p.amount);
    }
    return { total, byClass };
  }, [inMonth, cls, stuMap]);

  // Thống kê: học sinh đang học trong tháng — đã đóng vs chưa đóng
  const collection = useMemo(() => {
    const monthStart = new Date(monthISO + "T00:00:00");
    const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1); monthEnd.setDate(0);
    const scope = students.filter((s) => {
      if (cls !== "Tất cả" && s.class_type !== cls) return false;
      if (s.status === "Kết thúc") return false;
      const st = new Date(s.start_date + "T00:00:00");
      const en = new Date(s.end_date + "T00:00:00");
      return st <= monthEnd && en >= monthStart;
    });
    const paidIds = new Set(inMonth.map((p) => p.student_id));
    const paid = scope.filter((s) => paidIds.has(s.id));
    const unpaid = scope.filter((s) => !paidIds.has(s.id));
    const expected = scope.reduce((a, s) => a + Number(s.tuition), 0);
    const collected = inMonth
      .filter((p) => cls === "Tất cả" || stuMap.get(p.student_id)?.class_type === cls)
      .reduce((a, b) => a + Number(b.amount), 0);
    return { scope, paid, unpaid, expected, collected };
  }, [students, inMonth, cls, stuMap, monthISO]);

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />Học phí {fmtMonth(monthISO)}</CardTitle>
            <CardDescription>Danh sách đóng học phí theo tháng và thống kê.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
            <Select value={cls} onValueChange={(v) => setCls(v as any)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <PaymentDialog students={students} defaultMonth={monthISO} trigger={<Button><Plus className="mr-1 h-4 w-4" />Ghi nhận</Button>} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBox label={`Tổng ${cls === "Tất cả" ? "" : "lớp " + cls}`} value={stats.total} />
            <StatBox label="Piano" value={stats.byClass.Piano} tint="piano" />
            <StatBox label="Múa" value={stats.byClass["Múa"]} tint="mua" />
            <StatBox label="Vẽ" value={stats.byClass["Vẽ"]} tint="ve" />
          </div>

          <div className="mb-4 rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryBox label="Học sinh đang học" value={collection.scope.length} suffix="" />
              <SummaryBox label="Đã đóng" value={collection.paid.length} suffix={`/${collection.scope.length}`} tone="success" />
              <SummaryBox label="Chưa đóng" value={collection.unpaid.length} suffix={`/${collection.scope.length}`} tone="warning" />
              <SummaryBox label="Thu / Dự kiến" value={collection.collected} suffix={` / ${collection.expected.toLocaleString("vi-VN")}đ`} isMoney />
            </div>
            {collection.unpaid.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Học sinh chưa đóng học phí tháng này:</p>
                <div className="flex flex-wrap gap-1.5">
                  {collection.unpaid.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-[color:var(--warning)]">
                      {s.name} · {s.class_type}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm học sinh trong tháng..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState text="Chưa có ghi nhận đóng học phí phù hợp." />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Học sinh</TableHead>
                    <TableHead>Lớp</TableHead>
                    <TableHead>Tháng</TableHead>
                    <TableHead className="text-center">Kỳ</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Ngày đóng</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const s = stuMap.get(p.student_id)!;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{classChip(s.class_type)}</TableCell>
                        <TableCell>{fmtMonth(p.month)}</TableCell>
                        <TableCell className="text-center">{p.ky_index}</TableCell>
                        <TableCell className="text-right font-semibold">{Number(p.amount).toLocaleString("vi-VN")}đ</TableCell>
                        <TableCell>{fmtDate(p.paid_date)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{p.note}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <PaymentDialog students={students} defaultMonth={monthISO} existing={p} trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                            <DeletePaymentButton id={p.id} />
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

      <StudentTuitionLookup students={students} payments={payments} />
    </div>
  );
}

function StatBox({ label, value, tint }: { label: string; value: number; tint?: "piano" | "mua" | "ve" }) {
  const tintCls = tint === "piano" ? "bg-piano/10 text-piano" : tint === "mua" ? "bg-mua/10 text-mua" : tint === "ve" ? "bg-ve/20 text-[color:var(--ve-foreground)]" : "bg-primary/10 text-primary";
  return (
    <div className={`rounded-lg p-3 ${tintCls}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-bold">{value.toLocaleString("vi-VN")}đ</p>
    </div>
  );
}

function DeletePaymentButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deletePayment);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payments"] }); toast.success("Đã xóa"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm("Xóa ghi nhận này?") && mut.mutate()}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function PaymentDialog({
  students, defaultMonth, existing, trigger,
}: {
  students: Student[];
  defaultMonth: string;
  existing?: TuitionPayment;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(upsertPayment);

  const [studentId, setStudentId] = useState(existing?.student_id ?? students[0]?.id ?? "");
  const [month, setMonth] = useState(existing?.month.slice(0, 7) ?? defaultMonth.slice(0, 7));
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [paidDate, setPaidDate] = useState(existing?.paid_date ?? toLocalISO(new Date()));
  const [kyIndex, setKyIndex] = useState(existing?.ky_index ?? 1);
  const [note, setNote] = useState(existing?.note ?? "");

  // Auto-suggest month + amount from student
  const s = students.find((x) => x.id === studentId);
  const suggestMonth = s ? monthKey(s.start_date).slice(0, 7) : "";
  const suggestAmount = s?.tuition ?? 0;

  const mut = useMutation({
    mutationFn: () => save({ data: {
      id: existing?.id,
      student_id: studentId,
      month,
      amount: Number(amount),
      paid_date: paidDate,
      ky_index: Number(kyIndex),
      note: note || null,
    } as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success(existing ? "Đã cập nhật" : "Đã ghi nhận đóng học phí");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Sửa ghi nhận" : "Ghi nhận đóng học phí"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Học sinh</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.class_type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Tháng học phí</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              {suggestMonth && suggestMonth !== month && (
                <button type="button" className="text-left text-xs text-primary hover:underline" onClick={() => setMonth(suggestMonth)}>
                  Dùng tháng bắt đầu khóa: {suggestMonth}
                </button>
              )}
            </div>
            <div className="grid gap-1">
              <Label>Kỳ số</Label>
              <Input type="number" min={1} value={kyIndex} onChange={(e) => setKyIndex(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Số tiền (VNĐ)</Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              {suggestAmount && Number(amount) !== suggestAmount && (
                <button type="button" className="text-left text-xs text-primary hover:underline" onClick={() => setAmount(suggestAmount)}>
                  Dùng học phí khóa: {suggestAmount.toLocaleString("vi-VN")}đ
                </button>
              )}
            </div>
            <div className="grid gap-1">
              <Label>Ngày đóng</Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button onClick={() => {
            if (!studentId) return toast.error("Chọn học sinh");
            if (!month) return toast.error("Chọn tháng");
            mut.mutate();
          }} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentTuitionLookup({ students, payments }: { students: Student[]; payments: TuitionPayment[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const list = students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
    return list.map((s) => {
      const paid = payments.filter((p) => p.student_id === s.id);
      const total = paid.reduce((a, b) => a + Number(b.amount), 0);
      return { s, paid, total };
    });
  }, [q, students, payments]);

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" />Tra cứu học phí theo học sinh</CardTitle>
        <CardDescription>Xem số kỳ đã đóng và tổng tiền đến hiện tại.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Nhập tên học sinh..." value={q} onChange={(e) => setQ(e.target.value)} />
        {q.trim() && results.length === 0 && <EmptyState text="Không tìm thấy học sinh." />}
        <div className="space-y-3">
          {results.map(({ s, paid, total }) => (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {classChip(s.class_type)}
                    <span>{paid.length} kỳ · Tổng {total.toLocaleString("vi-VN")}đ</span>
                  </div>
                </div>
              </div>
              {paid.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {paid.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded border-l-2 border-primary bg-muted/40 px-2 py-1">
                      <span>{fmtMonth(p.month)} · Kỳ {p.ky_index} · {fmtDate(p.paid_date)}</span>
                      <span className="font-medium">{Number(p.amount).toLocaleString("vi-VN")}đ</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
