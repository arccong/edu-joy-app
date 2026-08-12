import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClassSelect, useMyClasses } from "@/lib/class-scope";
import { hhmm, toLocalISO, type ClassType, type TrialStudent } from "@/lib/shared";
import { upsertTrialStudent } from "@/lib/trials.functions";

export function TrialStudentDialog({ trial, trigger }: { trial?: TrialStudent; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(upsertTrialStudent);
  const my = useMyClasses();

  const [form, setForm] = useState(() => ({
    id: trial?.id,
    name: trial?.name ?? "",
    age: trial?.age ?? 8,
    class_type: (trial?.class_type ?? my[0] ?? "Piano") as ClassType,
    start_time: hhmm(trial?.start_time ?? "09:00"),
    end_time: hhmm(trial?.end_time ?? "11:00"),
    trial_date: trial?.trial_date ?? toLocalISO(new Date()),
  }));

  const mut = useMutation({
    mutationFn: () => save({ data: form } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trial-students"] });
      toast.success(trial ? "Đã cập nhật học sinh học thử" : "Đã thêm học sinh học thử");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trial ? "Sửa học sinh học thử" : "Thêm học sinh học thử"}</DialogTitle>
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
            <ClassSelect label="Lớp học" value={form.class_type} onChange={(v) => setForm((f) => ({ ...f, class_type: v as ClassType }))} />
          </div>
          <div className="grid gap-2">
            <Label>Ngày học thử</Label>
            <Input type="date" value={form.trial_date} onChange={(e) => setForm({ ...form, trial_date: e.target.value })} />
            <p className="text-xs text-muted-foreground">Chỉ 1 buổi học thử duy nhất, không lặp lại theo tuần.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Giờ bắt đầu</Label>
              <Input type="time" step={900} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Giờ kết thúc</Label>
              <Input type="time" step={900} value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>
          <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            Trạng thái tự động là "Học thử" và chuyển thành "Kết thúc" khi đã qua ngày học thử.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button
            disabled={mut.isPending}
            onClick={() => {
              if (!form.name.trim()) return toast.error("Vui lòng nhập tên học sinh");
              if (form.start_time >= form.end_time) return toast.error("Khung giờ không hợp lệ");
              mut.mutate();
            }}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
