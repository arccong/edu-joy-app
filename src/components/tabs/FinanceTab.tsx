import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Download, Loader2, Pencil, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui-bits";
import { fmtMonth, formatMoney, parseMoney, type TuitionPayment } from "@/lib/shared";
import { listPayments } from "@/lib/tuition.functions";
import { deleteFinanceEntry, listExpenseCategories, listFinanceEntries, upsertFinanceEntry } from "@/lib/finance.functions";
import { exportXlsx } from "@/lib/export";

type Entry = { id: string; month: string; kind: "thu" | "chi"; category: string; amount: number; note: string | null; is_fixed: boolean };
type Category = { id: string; name: string; default_amount: number; sort_order: number; active: boolean };

export function FinanceTab() {
  const fetchPayments = useServerFn(listPayments);
  const fetchEntries = useServerFn(listFinanceEntries);
  const fetchCats = useServerFn(listExpenseCategories);

  const { data: payments = [] } = useQuery<TuitionPayment[]>({ queryKey: ["payments"], queryFn: () => fetchPayments() as any });
  const { data: entries = [] } = useQuery<Entry[]>({ queryKey: ["finance-entries"], queryFn: () => fetchEntries() as any });
  const { data: cats = [] } = useQuery<Category[]>({ queryKey: ["expense-cats"], queryFn: () => fetchCats() as any });

  const now = new Date();
  const [view, setView] = useState<"month" | "year">("month");
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, setYear] = useState(String(now.getFullYear()));

  const period = view === "month" ? month : year;
  const inPeriod = (iso: string) => (view === "month" ? iso.slice(0, 7) === month : iso.slice(0, 4) === year);

  const tuitionIncome = useMemo(
    () => payments.filter((p) => inPeriod(p.month)).reduce((a, b) => a + Number(b.amount), 0),
    [payments, view, month, year],
  );
  const periodEntries = useMemo(() => entries.filter((e) => inPeriod(e.month)), [entries, view, month, year]);
  const otherIncome = useMemo(() => periodEntries.filter((e) => e.kind === "thu").reduce((a, b) => a + Number(b.amount), 0), [periodEntries]);
  const expense = useMemo(() => periodEntries.filter((e) => e.kind === "chi").reduce((a, b) => a + Number(b.amount), 0), [periodEntries]);
  const income = tuitionIncome + otherIncome;
  const profit = income - expense;

  const byMonth = useMemo(() => {
    if (view !== "year") return [];
    const rows: { m: string; thu: number; chi: number }[] = [];
    for (let i = 1; i <= 12; i++) {
      const key = `${year}-${String(i).padStart(2, "0")}`;
      const thu =
        payments.filter((p) => p.month.slice(0, 7) === key).reduce((a, b) => a + Number(b.amount), 0) +
        entries.filter((e) => e.month.slice(0, 7) === key && e.kind === "thu").reduce((a, b) => a + Number(b.amount), 0);
      const chi = entries.filter((e) => e.month.slice(0, 7) === key && e.kind === "chi").reduce((a, b) => a + Number(b.amount), 0);
      if (thu || chi) rows.push({ m: key, thu, chi });
    }
    return rows;
  }, [view, year, payments, entries]);

  const doExport = () => {
    const label = view === "month" ? fmtMonth(month + "-01") : `Năm ${year}`;
    exportXlsx(`tai-chinh-${period}`, [
      {
        name: "Tổng hợp",
        rows: [
          ["Kỳ", label],
          ["Thu học phí", tuitionIncome],
          ["Thu khác", otherIncome],
          ["Tổng thu", income],
          ["Tổng chi", expense],
          ["Lợi nhuận", profit],
        ],
      },
      {
        name: "Chi tiết",
        rows: [
          ["Tháng", "Loại", "Khoản mục", "Số tiền", "Cố định", "Ghi chú"],
          ...periodEntries.map((e) => [
            e.month.slice(0, 7), e.kind === "thu" ? "Thu" : "Chi", e.category, Number(e.amount), e.is_fixed ? "x" : "", e.note ?? "",
          ]),
        ],
      },
    ]);
    toast.success("Đã xuất báo cáo tài chính");
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" />Tài chính</CardTitle>
            <CardDescription>Thu · Chi · Lợi nhuận theo tháng và theo năm.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={view} onValueChange={(v) => setView(v as "month" | "year")}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Theo tháng</SelectItem>
                <SelectItem value="year">Theo năm</SelectItem>
              </SelectContent>
            </Select>
            {view === "month" ? (
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
            ) : (
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-[110px]" />
            )}
            <Button variant="outline" onClick={doExport}><Download className="mr-1 h-4 w-4" />Xuất dữ liệu</Button>
            <EntryDialog cats={cats} defaultMonth={view === "month" ? month : `${year}-01`} trigger={<Button><Plus className="mr-1 h-4 w-4" />Thêm khoản</Button>} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Box label="Thu học phí" value={tuitionIncome} tone="success" />
            <Box label="Thu khác" value={otherIncome} tone="success" />
            <Box label="Tổng chi" value={expense} tone="danger" />
            <Box label="Lợi nhuận" value={profit} tone={profit >= 0 ? "primary" : "danger"} />
          </div>

          {view === "year" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Chi tiết theo tháng · {year}</h3>
              {byMonth.length === 0 ? <EmptyState text="Chưa có dữ liệu trong năm này." /> : (
                <div className="-mx-4 overflow-x-auto sm:mx-0">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Tháng</TableHead>
                      <TableHead className="text-right">Thu</TableHead>
                      <TableHead className="text-right">Chi</TableHead>
                      <TableHead className="text-right">Lợi nhuận</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {byMonth.map((r) => (
                        <TableRow key={r.m}>
                          <TableCell>{fmtMonth(r.m + "-01")}</TableCell>
                          <TableCell className="text-right text-[color:var(--success)]">{formatMoney(r.thu)}đ</TableCell>
                          <TableCell className="text-right text-destructive">{formatMoney(r.chi)}đ</TableCell>
                          <TableCell className="text-right font-semibold">{formatMoney(r.thu - r.chi)}đ</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Các khoản thu/chi đã nhập</h3>
            {periodEntries.length === 0 ? (
              <EmptyState text="Chưa có khoản thu/chi nào. Bấm 'Thêm khoản' để nhập." />
            ) : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Tháng</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Khoản mục</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {periodEntries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{e.month.slice(0, 7)}</TableCell>
                        <TableCell>
                          {e.kind === "thu"
                            ? <span className="inline-flex items-center gap-1 text-[color:var(--success)]"><TrendingUp className="h-3.5 w-3.5" />Thu</span>
                            : <span className="inline-flex items-center gap-1 text-destructive"><TrendingDown className="h-3.5 w-3.5" />Chi</span>}
                        </TableCell>
                        <TableCell className="font-medium">{e.category}{e.is_fixed && <span className="ml-1 rounded bg-muted px-1 text-[10px]">cố định</span>}</TableCell>
                        <TableCell className="text-right font-semibold">{formatMoney(Number(e.amount))}đ</TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{e.note}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <EntryDialog cats={cats} defaultMonth={e.month.slice(0, 7)} existing={e} trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                            <DeleteEntryButton id={e.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "primary" }) {
  const cls = tone === "success" ? "bg-success/10 text-[color:var(--success)]" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  return (
    <div className={`rounded-lg p-3 ${cls}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-bold">{formatMoney(value)}đ</p>
    </div>
  );
}

function DeleteEntryButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteFinanceEntry);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance-entries"] }); toast.success("Đã xóa"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm("Xóa khoản này?") && mut.mutate()}><Trash2 className="h-4 w-4" /></Button>;
}

function EntryDialog({ cats, defaultMonth, existing, trigger }: { cats: Category[]; defaultMonth: string; existing?: Entry; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(upsertFinanceEntry);

  const [kind, setKind] = useState<"thu" | "chi">(existing?.kind ?? "chi");
  const [month, setMonth] = useState(existing?.month.slice(0, 7) ?? defaultMonth);
  const [category, setCategory] = useState(existing?.category ?? "");
  const [amountStr, setAmountStr] = useState(existing ? formatMoney(Number(existing.amount)) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [isFixed, setIsFixed] = useState(existing?.is_fixed ?? false);

  const mut = useMutation({
    mutationFn: () => save({ data: {
      id: existing?.id, month, kind, category, amount: parseMoney(amountStr), note: note || null, is_fixed: isFixed,
    } as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-entries"] });
      toast.success(existing ? "Đã cập nhật" : "Đã thêm khoản");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Sửa khoản" : "Thêm khoản thu/chi"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Loại</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "thu" | "chi")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="thu">Thu</SelectItem>
                  <SelectItem value="chi">Chi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Tháng</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Khoản mục</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Vd: Lương giáo viên" />
            {kind === "chi" && cats.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {cats.filter((c) => c.active).map((c) => (
                  <button key={c.id} type="button" className="rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-muted/70"
                    onClick={() => { setCategory(c.name); setIsFixed(true); if (Number(c.default_amount) > 0) setAmountStr(formatMoney(Number(c.default_amount))); }}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-1">
            <Label>Số tiền (VNĐ)</Label>
            <Input inputMode="numeric" value={amountStr} onChange={(e) => setAmountStr(formatMoney(parseMoney(e.target.value)))} placeholder="0" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} />
            <span>Khoản cố định hàng tháng</span>
          </label>
          <div className="grid gap-1">
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button disabled={mut.isPending} onClick={() => {
            if (!category.trim()) return toast.error("Nhập tên khoản mục");
            if (parseMoney(amountStr) <= 0) return toast.error("Nhập số tiền");
            mut.mutate();
          }}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
