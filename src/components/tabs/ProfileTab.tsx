import { useState } from "react";
import { GraduationCap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentProfileTab } from "@/components/tabs/StudentProfileTab";
import { TeacherProfileTab } from "@/components/tabs/TeacherProfileTab";

/**
 * "Hồ sơ" — nơi tập trung hồ sơ nhân sự + học sinh của trung tâm. Giao diện từng phần (Hồ sơ giáo viên /
 * Hồ sơ học sinh) giữ nguyên như cũ, chỉ thêm 2 nút chọn ở đầu trang để chuyển qua lại.
 */
export function ProfileTab() {
  const [section, setSection] = useState<"students" | "teachers">("students");
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        <Button size="sm" variant={section === "students" ? "default" : "ghost"} onClick={() => setSection("students")}>
          <Users className="mr-1.5 h-4 w-4" />
          Hồ sơ học sinh
        </Button>
        <Button size="sm" variant={section === "teachers" ? "default" : "ghost"} onClick={() => setSection("teachers")}>
          <GraduationCap className="mr-1.5 h-4 w-4" />
          Hồ sơ giáo viên
        </Button>
      </div>
      {section === "students" ? <StudentProfileTab /> : <TeacherProfileTab />}
    </div>
  );
}
