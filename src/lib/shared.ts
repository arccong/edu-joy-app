export type ClassType = "Piano" | "Múa" | "Vẽ";
export type StudentStatus = "Đang học" | "Nghỉ phép" | "Bảo lưu";
export type AttendanceStatus = "Đi học" | "Nghỉ có phép" | "Nghỉ không phép";

export interface ScheduleSlot {
  day: number; // 0..6 (0=CN)
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface Student {
  id: string;
  name: string;
  age: number;
  class_type: ClassType;
  tuition: number;
  start_date: string;
  end_date: string;
  status: StudentStatus;
  reserve_days: number;
  total_sessions: number;
  schedule_days: number[];
  sessions_per_day: 1 | 2;
  schedule_slots: ScheduleSlot[];
}

export interface AttendanceRow {
  id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  makeup_date: string | null;
  created_at: string;
}

export interface TuitionPayment {
  id: string;
  student_id: string;
  month: string; // YYYY-MM-01
  amount: number;
  paid_date: string;
  ky_index: number;
  note: string | null;
}

export const CLASSES: ClassType[] = ["Piano", "Múa", "Vẽ"];
export const DAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
export const DAYS_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function defaultSessionsFor(c: ClassType) {
  return c === "Piano" ? 48 : 24;
}

export function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("vi-VN");
}

export function dayOfWeekOf(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? null : d.getDay();
}

/** Đếm số buổi tối đa mỗi thứ (0..6) trong slots */
export function slotsPerDayMap(slots: ScheduleSlot[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of slots) m.set(s.day, (m.get(s.day) ?? 0) + 1);
  return m;
}

export function uniqueDays(slots: ScheduleSlot[]): number[] {
  return Array.from(new Set(slots.map((s) => s.day))).sort((a, b) => a - b);
}

export function maxPerDay(slots: ScheduleSlot[]): 1 | 2 {
  let mx = 1;
  const m = slotsPerDayMap(slots);
  for (const v of m.values()) if (v > mx) mx = v;
  return (mx >= 2 ? 2 : 1) as 1 | 2;
}

/** Tổng buổi/tuần từ slots */
export function weeklySessions(slots: ScheduleSlot[]): number {
  return slots.length;
}

/** Tính ngày kết thúc dựa trên schedule_slots + total_sessions */
export function computeEndDate(startISO: string, slots: ScheduleSlot[], total: number): string | null {
  if (!startISO || slots.length === 0 || total < 1) return null;
  const perDay = slotsPerDayMap(slots);
  const start = new Date(startISO + "T00:00:00");
  if (isNaN(start.getTime())) return null;
  let count = 0;
  const cursor = new Date(start);
  for (let i = 0; i < 365 * 6; i++) {
    const dow = cursor.getDay();
    const inc = perDay.get(dow) ?? 0;
    if (inc > 0) {
      count += inc;
      if (count >= total) return toLocalISO(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

/** Ngày đầu tuần (Thứ 2) của tuần chứa d */
export function startOfWeek(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const dow = c.getDay(); // 0=CN
  const diff = dow === 0 ? -6 : 1 - dow;
  c.setDate(c.getDate() + diff);
  return c;
}

export function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7) + "-01";
}

export function fmtMonth(monthISO: string) {
  const d = new Date(monthISO + "T00:00:00");
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function classChipStyles(c: ClassType) {
  return {
    Piano: "bg-piano text-piano-foreground",
    "Múa": "bg-mua text-mua-foreground",
    "Vẽ": "bg-ve text-ve-foreground",
  }[c];
}

/** Kiểm tra hs có bảo lưu vào ngày date không (tạm hiểu: status=Bảo lưu & date < end_date - reserve_days? — đơn giản hoá: nếu status=Bảo lưu thì mờ) */
export function isReservedOn(_dateISO: string, status: StudentStatus): boolean {
  return status === "Bảo lưu";
}
