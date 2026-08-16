import { useCallback, useMemo, useRef, useState } from "react";
import { ClassSelect, useMyClasses } from "@/lib/class-scope";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccess } from "@/lib/access";
import {
  BookOpen,
  Check,
  ChevronsUpDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { classChip, EmptyState } from "@/components/ui-bits";
import {
  coursePrefix,
  dayOfWeekOf,
  fmtDate,
  slotsEffectiveOn,
  toLocalISO,
  type ClassType,
  type ScheduleChange,
  type Student,
} from "@/lib/shared";
import { listAttendance, listScheduleChanges, listStudents } from "@/lib/students.functions";
import {
  cleanupOrphanedLearningMedia,
  deleteLearningLog,
  listLearningLogs,
  setLogPublished,
  upsertLearningLog,
} from "@/lib/learning.functions";
import { createArtwork, listArtworks } from "@/lib/artworks.functions";
import { uploadLearningImage } from "@/lib/image-upload";
import { exportXlsx } from "@/lib/export";

export type Attachment = { kind: "image" | "video" | "link"; url: string; label?: string | null };
export type Artwork = {
  id: string;
  student_id: string;
  class_type: ClassType;
  title: string;
  cover_image_url: string | null;
  created_at: string;
};
export type LearningLog = {
  id: string;
  student_id: string | null;
  class_type: ClassType;
  date: string;
  title: string;
  content: string | null;
  attachments: Attachment[];
  is_class_wide: boolean;
  artwork_id: string | null;
  is_published: boolean;
};

export function LearningTab() {
  const { isOwner } = useAccess();
  const fetchStudents = useServerFn(listStudents);
  const fetchLogs = useServerFn(listLearningLogs);
  const fetchArtworks = useServerFn(listArtworks);
  const runCleanup = useServerFn(cleanupOrphanedLearningMedia);
  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ["students"],
    queryFn: () => fetchStudents() as any,
  });
  const { data: logs = [] } = useQuery<LearningLog[]>({
    queryKey: ["learning-logs"],
    queryFn: () => fetchLogs() as any,
  });
  const { data: artworks = [] } = useQuery<Artwork[]>({
    queryKey: ["artworks"],
    queryFn: () => fetchArtworks() as any,
  });

  const cleanupMut = useMutation({
    mutationFn: () => runCleanup() as Promise<{ deleted: number }>,
    onSuccess: (res) => {
      toast.success(
        res.deleted > 0 ? `Đã xóa ${res.deleted} ảnh không còn dùng đến.` : "Không có ảnh thừa nào để dọn dẹp.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [cls, setCls] = useState<ClassType>("Piano");
  const [studentId, setStudentId] = useState<string>("all");
  const [view, setView] = useState<"date" | "artwork">("date");
  const [date, setDate] = useState<string>(toLocalISO(new Date()));
  const todayISO = date;
  const [yClsFilter, setYClsFilter] = useState<ClassType | "Tất cả">("Tất cả");

  const stuMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const inClass = useMemo(() => students.filter((s) => s.class_type === cls), [students, cls]);

  const scoped = useMemo(() => {
    return logs.filter((l) => {
      if (l.class_type !== cls) return false;
      if (studentId === "all") return true;
      return l.is_class_wide || l.student_id === studentId;
    });
  }, [logs, cls, studentId]);

  const todayLogs = useMemo(() => scoped.filter((l) => l.date === todayISO), [scoped, todayISO]);
  const yesterdayISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISO(d);
  }, []);
  const yesterdayLogs = useMemo(
    () => logs.filter((l) => l.date === yesterdayISO && (yClsFilter === "Tất cả" || l.class_type === yClsFilter)),
    [logs, yesterdayISO, yClsFilter],
  );

  const nameOf = (l: LearningLog) =>
    l.is_class_wide ? `Cả lớp ${l.class_type}` : (stuMap.get(l.student_id ?? "")?.name ?? "—");

  const doExport = () => {
    if (scoped.length === 0) return toast.info("Không có dữ liệu để xuất");
    exportXlsx(`nhat-ky-hoc-tap-${cls}`, [
      {
        name: "Nhật ký",
        rows: [
          ["Ngày", "Lớp", "Học sinh", "Tác phẩm/Bài học", "Nội dung", "Đính kèm"],
          ...scoped.map((l) => [
            fmtDate(l.date),
            l.class_type,
            nameOf(l),
            l.title,
            l.content ?? "",
            (l.attachments ?? []).map((a) => a.url).join(" | "),
          ]),
        ],
      },
    ]);
    toast.success("Đã xuất nhật ký học tập");
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 shrink-0 text-primary" />
              Nhật ký học tập
            </CardTitle>
            <CardDescription>Tác phẩm/bài học hôm nay và lịch sử cả khóa.</CardDescription>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Select value={view} onValueChange={(v) => setView(v as "date" | "artwork")}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Xem theo ngày</SelectItem>
                <SelectItem value="artwork">Xem theo tác phẩm</SelectItem>
              </SelectContent>
            </Select>
            {view === "date" && (
              <DateInput
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full sm:w-[150px]"
              />
            )}
            <ClassSelect
              className="w-full sm:w-[120px]"
              value={cls}
              onChange={(v) => {
                setCls(v as ClassType);
                setStudentId("all");
              }}
            />
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả học sinh</SelectItem>
                {inClass.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {coursePrefix(s.class_type)}
                    {s.course_index ?? 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="w-full sm:w-auto" onClick={doExport}>
              <Download className="mr-1 h-4 w-4" />
              Xuất dữ liệu
            </Button>
            {isOwner && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={cleanupMut.isPending}
                onClick={() => cleanupMut.mutate()}
                title="Xóa các ảnh trong kho lưu trữ không còn được nhật ký nào tham chiếu tới"
              >
                {cleanupMut.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                Dọn dẹp ảnh
              </Button>
            )}
            <LogDialog
              students={inClass}
              cls={cls}
              defaultDate={date}
              artworks={artworks}
              trigger={
                <Button className="w-full sm:w-auto">
                  <Plus className="mr-1 h-4 w-4" />
                  Ghi nhật ký
                </Button>
              }
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {view === "artwork" ? (
            <ArtworkView
              artworks={artworks.filter(
                (a) => a.class_type === cls && (studentId === "all" || a.student_id === studentId),
              )}
              logs={scoped}
              students={inClass}
              stuMap={stuMap}
            />
          ) : (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Nhật ký ngày {fmtDate(todayISO)}</h3>
                {todayLogs.length === 0 ? (
                  <EmptyState text="Chưa có bài học nào cho ngày này." />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {todayLogs.map((l) => (
                      <LogCard key={l.id} log={l} name={nameOf(l)} students={inClass} artworks={artworks} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-5 w-5 text-primary" />Nhật ký hôm qua</CardTitle>
            <CardDescription>Các học sinh đã được ghi nhật ký ngày {fmtDate(yesterdayISO)}</CardDescription>
          </div>
          <ClassSelect value={yClsFilter} onChange={(v) => setYClsFilter(v as ClassType | "Tất cả")} allLabel="Tất cả lớp" className="w-full sm:w-auto sm:min-w-[140px]" />
        </CardHeader>
        <CardContent>
          {yesterdayLogs.length === 0 ? (
            <EmptyState text="Hôm qua chưa có học sinh nào được ghi nhật ký." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {yesterdayLogs.map((l) => {
                const owner = stuMap.get(l.student_id ?? "");
                const name = l.is_class_wide ? `Cả lớp ${l.class_type}` : (owner?.name ?? "—");
                return (
                  <LogCard
                    key={l.id}
                    log={l}
                    name={name}
                    students={l.is_class_wide ? students.filter((s) => s.class_type === l.class_type) : (owner ? [owner] : [])}
                    artworks={artworks}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Thumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img src={src} alt={alt} loading="lazy" onError={() => setOk(false)} className={className} />;
}

function PublishBadge({ log }: { log: LearningLog }) {
  const qc = useQueryClient();
  const setPub = useServerFn(setLogPublished);
  const mut = useMutation({
    mutationFn: (v: boolean) => setPub({ data: { id: log.id, is_published: v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      disabled={mut.isPending}
      onClick={() => mut.mutate(!log.is_published)}
      title="Bật/tắt công khai cho phụ huynh"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${log.is_published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
    >
      {log.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      {log.is_published ? "Đã công khai" : "Riêng tư"}
    </button>
  );
}

function LogCard({
  log,
  name,
  students,
  artworks,
  compact,
}: {
  log: LearningLog;
  name: string;
  students: Student[];
  artworks: Artwork[];
  compact?: boolean;
}) {
  const atts = log.attachments ?? [];
  const images = atts.filter((a) => a.kind === "image");
  const others = atts.filter((a) => a.kind !== "image");
  const artwork = artworks.find((a) => a.id === log.artwork_id);
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {images.length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-28 sm:shrink-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {images.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="shrink-0">
                <Thumb
                  src={a.url}
                  alt={a.label ?? log.title}
                  className="h-16 w-24 rounded-md border object-cover sm:h-20 sm:w-28"
                />
              </a>
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{fmtDate(log.date)}</span>
                {classChip(log.class_type)}
                <Badge variant="outline">{name}</Badge>
                <PublishBadge log={log} />
              </div>
              <p className="mt-1 font-semibold">{log.title}</p>
              {artwork && <p className="text-xs text-muted-foreground">Tác phẩm: {artwork.title}</p>}
              {log.content && (
                <p className={`mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground ${compact ? "line-clamp-2" : ""}`}>
                  {log.content}
                </p>
              )}
              {others.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {others.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-muted px-2 py-1 text-[11px] hover:bg-muted/70"
                    >
                      {a.kind === "video" ? "🎬" : "🔗"} {a.label || a.url.slice(0, 40)}
                    </a>
                  ))}
                </div>
              )}
        </div>
        <div className="flex shrink-0 gap-1">
          <LogDialog
            students={students}
            cls={log.class_type}
            artworks={artworks}
            existing={log}
            trigger={
              <Button size="icon" variant="ghost">
                <Pencil className="h-4 w-4" />
              </Button>
            }
          />
          <DeleteLogButton id={log.id} />
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}

function ArtworkView({
  artworks,
  logs,
  students,
  stuMap,
}: {
  artworks: Artwork[];
  logs: LearningLog[];
  students: Student[];
  stuMap: Map<string, Student>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (artworks.length === 0) return <EmptyState text="Chưa có tác phẩm nào. Tạo tác phẩm khi ghi nhật ký." />;
  const open = artworks.find((a) => a.id === openId) ?? null;
  const openLogs = open
    ? logs
        .filter((l) => l.artwork_id === open.id)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {artworks.map((a) => {
          const related = logs.filter((l) => l.artwork_id === a.id);
          const cover =
            a.cover_image_url ??
            related.flatMap((l) => l.attachments ?? []).find((x) => x.kind === "image")?.url ??
            null;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpenId(a.id)}
              className={`overflow-hidden rounded-lg border bg-card text-left transition hover:shadow-card ${openId === a.id ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex h-28 items-center justify-center bg-muted">
                {cover ? (
                  <Thumb src={cover} alt={a.title} className="h-28 w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="p-3">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {stuMap.get(a.student_id)?.name ?? "—"} · {related.length} buổi đã ghi
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {open && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Các buổi thuộc tác phẩm “{open.title}”</h3>
          {openLogs.length === 0 ? (
            <EmptyState text="Chưa có bản ghi nào cho tác phẩm này." />
          ) : (
            <div className="space-y-2">
              {openLogs.map((l) => (
                <LogCard
                  key={l.id}
                  log={l}
                  name={stuMap.get(l.student_id ?? "")?.name ?? "—"}
                  students={students}
                  artworks={artworks}
                  compact
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function DeleteLogButton({ id }: { id: string }) {
  const { canDelete } = useAccess();
  const qc = useQueryClient();
  const del = useServerFn(deleteLearningLog);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-logs"] });
      toast.success("Đã xóa");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!canDelete) return null;
  return (
    <Button
      size="icon"
      variant="ghost"
      className="text-destructive"
      onClick={() => confirm("Xóa mục nhật ký này?") && mut.mutate()}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function StudentCombobox({
  students,
  value,
  onChange,
}: {
  students: Student[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = students.find((s) => s.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {current ? `${current.name} · ${coursePrefix(current.class_type)}${current.course_index ?? 1}` : "Chọn học sinh"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Gõ tên để tìm..." />
          <CommandList>
            <CommandEmpty>Không tìm thấy học sinh.</CommandEmpty>
            <CommandGroup>
              {students.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.name} ${coursePrefix(s.class_type)}${s.course_index ?? 1}`}
                  onSelect={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")} />
                  {s.name} · {coursePrefix(s.class_type)}
                  {s.course_index ?? 1}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function LogDialog({
  students,
  cls,
  artworks,
  existing,
  trigger,
  defaultStudentId,
  defaultDate,
}: {
  students: Student[];
  cls: ClassType;
  artworks: Artwork[];
  existing?: LearningLog;
  trigger: React.ReactNode;
  defaultStudentId?: string;
  defaultDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(upsertLearningLog);
  const addArtwork = useServerFn(createArtwork);

  const classWideDefault = existing?.is_class_wide ?? cls === "Múa";
  const [isClassWide, setIsClassWide] = useState(classWideDefault);
  const [studentId, setStudentId] = useState(existing?.student_id ?? defaultStudentId ?? students[0]?.id ?? "");
  const [date, setDate] = useState(existing?.date ?? defaultDate ?? toLocalISO(new Date()));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [newUrl, setNewUrl] = useState("");
  const [newKind, setNewKind] = useState<Attachment["kind"]>("video");
  const [artworkId, setArtworkId] = useState<string>(existing?.artwork_id ?? "none");
  const [isPublished, setIsPublished] = useState<boolean>(existing?.is_published ?? false);
  const [newArtworkTitle, setNewArtworkTitle] = useState("");
  const [uploadState, setUploadState] = useState<"" | "optimizing" | "uploading">("");
  const fileRef = useRef<HTMLInputElement>(null);

  const myArtworks = useMemo(
    () => artworks.filter((a) => a.class_type === cls && (isClassWide || a.student_id === studentId)),
    [artworks, cls, studentId, isClassWide],
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    try {
      setUploadState("optimizing");
      for (const f of list) {
        setUploadState("optimizing");
        const url = await uploadLearningImage(f);
        setUploadState("uploading");
        setAttachments((a) => [...a, { kind: "image", url, label: f.name }]);
      }
      toast.success(`Đã tải lên ${list.length} ảnh`);
    } catch (e: any) {
      toast.error(e?.message ?? "Tải ảnh thất bại");
    } finally {
      setUploadState("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const createArtworkMut = useMutation({
    mutationFn: () =>
      addArtwork({
        data: {
          student_id: studentId,
          class_type: cls,
          title: newArtworkTitle.trim(),
          cover_image_url: attachments.find((a) => a.kind === "image")?.url ?? null,
        },
      }) as any,
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["artworks"] });
      setArtworkId(row?.id ?? "none");
      setNewArtworkTitle("");
      toast.success("Đã tạo tác phẩm");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fetchChanges = useServerFn(listScheduleChanges);
  const fetchAtt = useServerFn(listAttendance);
  const { data: changes = [] } = useQuery<ScheduleChange[]>({
    queryKey: ["schedule-changes"],
    queryFn: () => fetchChanges() as any,
    enabled: open,
  });
  const { data: attOfDate = [] } = useQuery<any[]>({
    queryKey: ["attendance", date],
    queryFn: () => fetchAtt({ data: { date } }) as any,
    enabled: open && !!date,
  });

  const attendedIds = useMemo(
    () => new Set(attOfDate.filter((r) => r.status === "Đi học").map((r) => r.student_id as string)),
    [attOfDate],
  );

  const isHighlightedDate = useCallback(
    (d: Date): boolean => {
      const s = students.find((x) => x.id === studentId);
      if (!s) return false;
      const iso = toLocalISO(d);
      if (iso < s.start_date || iso > s.end_date) return false;
      const dow = dayOfWeekOf(iso);
      const slots = slotsEffectiveOn(s, changes, iso);
      return dow !== null && slots.some((sl) => sl.day === dow);
    },
    [students, studentId, changes],
  );

  const validation = useMemo<{ ok: boolean; message?: string }>(() => {
    if (!date) return { ok: false, message: "Chọn ngày học." };
    if (isClassWide) {
      const any = students.some((s) => attendedIds.has(s.id));
      return any ? { ok: true } : { ok: false, message: "Chưa có học sinh nào của lớp được điểm danh trong ngày này." };
    }
    const s = students.find((x) => x.id === studentId);
    if (!s) return { ok: false, message: "Chọn học sinh." };
    const dow = dayOfWeekOf(date);
    const slots = slotsEffectiveOn(s, changes, date);
    const inSchedule = dow !== null && slots.some((sl) => sl.day === dow) && date >= s.start_date && date <= s.end_date;
    if (!inSchedule) return { ok: false, message: "Ngày này không nằm trong lịch học của học sinh." };
    if (!attendedIds.has(s.id)) return { ok: false, message: "Buổi học ngày này chưa được điểm danh." };
    return { ok: true };
  }, [date, isClassWide, students, studentId, changes, attendedIds]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: existing?.id,
          student_id: isClassWide ? null : studentId,
          class_type: cls,
          date,
          title,
          content: content || null,
          attachments,
          is_class_wide: isClassWide,
          artwork_id: artworkId === "none" ? null : artworkId,
          is_published: isPublished,
        } as any,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-logs"] });
      toast.success(existing ? "Đã cập nhật" : "Đã ghi nhật ký");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Sửa nhật ký" : `Ghi nhật ký lớp ${cls}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {cls === "Múa" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isClassWide} onCheckedChange={(v) => setIsClassWide(!!v)} />
              <span>Bài học chung cả lớp (áp dụng cho lớp Múa)</span>
            </label>
          )}
          {!isClassWide && (
            <div className="grid gap-1">
              <Label>Học sinh</Label>
              <StudentCombobox students={students} value={studentId} onChange={setStudentId} />
            </div>
          )}
          <div className="grid gap-1">
            <Label>Ngày học</Label>
            <DateInput
              value={date}
              onChange={(e) => setDate(e.target.value)}
              isHighlightedDate={!isClassWide && studentId ? isHighlightedDate : undefined}
              highlightHint="Ngày thuộc lịch học của học sinh"
            />
            {!validation.ok && <p className="text-xs text-destructive">{validation.message}</p>}
          </div>

          <div className="grid gap-1">
            <Label>Tác phẩm / Bài học</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vd: Für Elise — đoạn A" />
          </div>
          <div className="grid gap-1">
            <Label>Nội dung / Nhận xét</Label>
            <Textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tiến độ, lưu ý, bài tập về nhà..."
            />
          </div>
          {!isClassWide && (
            <div className="grid gap-2">
              <Label>Tác phẩm</Label>
              <Select value={artworkId} onValueChange={setArtworkId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Không gắn tác phẩm —</SelectItem>
                  {myArtworks.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  value={newArtworkTitle}
                  onChange={(e) => setNewArtworkTitle(e.target.value)}
                  placeholder="Tên tác phẩm mới..."
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!newArtworkTitle.trim() || !studentId || createArtworkMut.isPending}
                  onClick={() => createArtworkMut.mutate()}
                >
                  {createArtworkMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tạo mới"}
                </Button>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <Checkbox checked={isPublished} onCheckedChange={(v) => setIsPublished(!!v)} />
            Công khai cho phụ huynh xem
          </label>
          <div className="grid gap-2">
            <Label>Ảnh buổi học</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={!!uploadState} onClick={() => fileRef.current?.click()}>
                {uploadState ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                {uploadState === "optimizing"
                  ? "Đang tối ưu ảnh..."
                  : uploadState === "uploading"
                    ? "Đang tải lên..."
                    : "Tải ảnh lên"}
              </Button>
              <span className="text-xs text-muted-foreground">Chọn nhiều ảnh · tự nén & chuyển HEIC</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Link video / tài liệu ngoài</Label>
            <div className="flex min-w-0 gap-2">
              <Select value={newKind} onValueChange={(v) => setNewKind(v as Attachment["kind"])}>
                <SelectTrigger className="w-[110px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Ảnh</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="link">Link</SelectItem>
                </SelectContent>
              </Select>
              <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." className="min-w-0 flex-1" />

              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  if (!newUrl.trim()) return;
                  setAttachments((a) => [...a, { kind: newKind, url: newUrl.trim(), label: null }]);
                  setNewUrl("");
                }}
              >
                Thêm
              </Button>
            </div>
            {attachments.length > 0 && (
              <ul className="min-w-0 space-y-1">
                {attachments.map((a, i) => (
                  <li key={i} className="flex min-w-0 items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs">
                    {a.kind === "image" ? (
                      <Thumb
                        src={a.url}
                        alt="Ảnh đính kèm"
                        className="h-14 w-14 shrink-0 rounded border object-cover"
                      />
                    ) : (
                      <span className="shrink-0">{a.kind === "video" ? "🎬" : "🔗"}</span>
                    )}
                    <span className="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={a.url}>
                      {a.url}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title="Sao chép link"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(a.url);
                          toast.success("Đã sao chép link.");
                        } catch {
                          toast.error("Không sao chép được, thử chọn thủ công.");
                        }
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="shrink-0" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button
            disabled={mut.isPending || !validation.ok}
            onClick={() => {
              if (!title.trim()) return toast.error("Nhập tên tác phẩm/bài học");
              if (!isClassWide && !studentId) return toast.error("Chọn học sinh");
              if (!validation.ok) return toast.error(validation.message!);
              mut.mutate();
            }}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
