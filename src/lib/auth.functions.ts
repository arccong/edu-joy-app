import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ClassType = z.enum(["Piano", "Múa", "Vẽ"]);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function isManager(sb: any) {
  const { data, error } = await sb.rpc("is_manager");
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function assertManager(sb: any) {
  if (!(await isManager(sb))) throw new Error("Bạn không có quyền thực hiện thao tác này");
}

/** id của Chủ trung tâm hiện tại (luôn có đúng 1) */
async function ownerId(sb: any): Promise<string> {
  const { data, error } = await sb.from("center_owner").select("user_id").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.user_id ?? "";
}

async function assertOwner(sb: any, userId: string) {
  if ((await ownerId(sb)) !== userId) throw new Error("Chỉ Chủ trung tâm mới được thực hiện thao tác này");
}

export type MyAccess = {
  userId: string;
  email: string;
  role: "quan_ly" | "giao_vien" | null;
  isOwner: boolean;
  classes: string[];
};

/** Quyền của tài khoản đang đăng nhập. Người đầu tiên đăng nhập khi hệ thống chưa có Quản lý sẽ được cấp quyền Quản lý. */
export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccess> => {
    const sb = await admin();
    const userId = context.userId;
    const email = (context.claims as any)?.email ?? "";

    await sb.from("profiles").upsert({ id: userId, email }, { onConflict: "id" });

    let { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
    if (!roles || roles.length === 0) {
      const { count } = await sb
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "quan_ly");
      if (!count) {
        await sb.from("user_roles").insert({ user_id: userId, role: "quan_ly" });
        roles = [{ role: "quan_ly" }];
      }
    }

    const role = roles?.some((r: any) => r.role === "quan_ly")
      ? "quan_ly"
      : roles?.some((r: any) => r.role === "giao_vien")
        ? "giao_vien"
        : null;

    // Hệ thống luôn phải có đúng 1 Chủ trung tâm: nếu chưa có, Quản lý đầu tiên trở thành Chủ trung tâm.
    let owner = await ownerId(sb);
    if (!owner && role === "quan_ly") {
      await sb.from("center_owner").upsert({ id: 1, user_id: userId }, { onConflict: "id" });
      owner = userId;
    }

    const { data: classes } = await sb.from("teacher_classes").select("class_type").eq("user_id", userId);
    return {
      userId,
      email,
      role,
      isOwner: owner === userId,
      classes: role === "quan_ly" ? ["Piano", "Múa", "Vẽ"] : (classes ?? []).map((c: any) => c.class_type),
    };
  });


/** Tạo tài khoản Quản lý đầu tiên (chỉ dùng được khi hệ thống chưa có Quản lý nào). */
export const createFirstManager = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().email(),
      password: z.string().min(6).max(72),
      full_name: z.string().trim().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { count } = await sb.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "quan_ly");
    if (count) throw new Error("Hệ thống đã có tài khoản Quản lý. Vui lòng đăng nhập.");

    const { data: created, error } = await sb.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const uid = created?.user?.id as string;
    await sb.from("profiles").upsert({ id: uid, email: data.email, full_name: data.full_name ?? null });
    const { error: e2 } = await sb.from("user_roles").insert({ user_id: uid, role: "quan_ly" });
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

/** Hệ thống đã có Quản lý chưa? (dùng cho màn hình đăng nhập) */
export const managerExists = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { count } = await sb.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "quan_ly");
  return { exists: Boolean(count) };
});

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context.supabase);
    const sb = await admin();
    const owner = await ownerId(sb);
    const viewerIsOwner = owner === context.userId;
    const [{ data: profiles }, { data: roles }, { data: classes }] = await Promise.all([
      sb.from("profiles").select("*").order("created_at"),
      sb.from("user_roles").select("*"),
      sb.from("teacher_classes").select("*"),
    ]);
    return (profiles ?? [])
      .map((p: any) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        role: (roles ?? []).find((r: any) => r.user_id === p.id)?.role ?? null,
        is_owner: p.id === owner,
        classes: (classes ?? []).filter((c: any) => c.user_id === p.id).map((c: any) => c.class_type),
      }))
      // Quản lý chỉ thấy danh sách Giáo viên; danh sách Chủ trung tâm/Quản lý chỉ Chủ trung tâm thấy.
      .filter((u: any) => viewerIsOwner || u.role === "giao_vien");
  });


export const createTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().email(),
      password: z.string().min(6).max(72),
      full_name: z.string().trim().max(120).optional(),
      classes: z.array(ClassType).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase);
    const sb = await admin();
    const { data: created, error } = await sb.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const uid = created?.user?.id as string;
    await sb.from("profiles").upsert({ id: uid, email: data.email, full_name: data.full_name ?? null });
    await sb.from("user_roles").insert({ user_id: uid, role: "giao_vien" });
    await sb.from("teacher_classes").insert(data.classes.map((c) => ({ user_id: uid, class_type: c })));
    return { ok: true };
  });

export const updateTeacherClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), classes: z.array(ClassType) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase);
    const sb = await admin();
    await sb.from("teacher_classes").delete().eq("user_id", data.user_id);
    if (data.classes.length > 0) {
      const { error } = await sb
        .from("teacher_classes")
        .insert(data.classes.map((c) => ({ user_id: data.user_id, class_type: c })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase);
    if (data.user_id === context.userId) throw new Error("Không thể xóa chính tài khoản của bạn");
    const sb = await admin();
    const owner = await ownerId(sb);
    if (data.user_id === owner) throw new Error("Không thể xóa tài khoản Chủ trung tâm");

    const { data: target } = await sb.from("user_roles").select("role").eq("user_id", data.user_id).maybeSingle();
    if (target?.role === "quan_ly" && context.userId !== owner) {
      throw new Error("Chỉ Chủ trung tâm mới được xóa tài khoản Quản lý");
    }

    await sb.from("teacher_classes").delete().eq("user_id", data.user_id);
    await sb.from("user_roles").delete().eq("user_id", data.user_id);
    await sb.from("profiles").delete().eq("id", data.user_id);
    const { error } = await sb.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Tạo tài khoản Quản lý — chỉ Chủ trung tâm. */
export const createManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().email(),
      password: z.string().min(6).max(72),
      full_name: z.string().trim().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await admin();
    await assertOwner(sb, context.userId);
    const { data: created, error } = await sb.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const uid = created?.user?.id as string;
    await sb.from("profiles").upsert({ id: uid, email: data.email, full_name: data.full_name ?? null });
    const { error: e2 } = await sb.from("user_roles").insert({ user_id: uid, role: "quan_ly" });
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

/** Chuyển giao quyền Chủ trung tâm cho một Quản lý (yêu cầu nhập lại mật khẩu hiện tại). */
export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ new_owner_id: z.string().uuid(), password: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await admin();
    await assertOwner(sb, context.userId);

    const email = (context.claims as any)?.email as string | undefined;
    if (!email) throw new Error("Không xác định được email tài khoản hiện tại");

    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
    const verifier = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await verifier.auth.signInWithPassword({ email, password: data.password });
    if (signInError) throw new Error("Mật khẩu không đúng");

    const { error } = await sb.rpc("transfer_ownership", { _new_owner: data.new_owner_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

