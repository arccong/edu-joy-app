/**
 * "Ghi nhớ đăng nhập" — cho phép người dùng chọn ở màn hình đăng nhập:
 *  - Bật (mặc định): phiên đăng nhập lưu vào localStorage — tồn tại lâu dài qua nhiều lần mở lại
 *    trình duyệt/app, chỉ mất khi tự bấm "Đăng xuất".
 *  - Tắt: phiên đăng nhập lưu vào sessionStorage — chỉ tồn tại trong phiên trình duyệt hiện tại,
 *    tự động yêu cầu đăng nhập lại sau khi đóng hẳn trình duyệt/tab.
 *
 * Cờ REMEMBER_KEY luôn nằm trong localStorage (không nhạy cảm, chỉ là true/false) để adapter biết
 * nên đọc/ghi phiên đăng nhập thật vào đâu.
 */

const REMEMBER_KEY = "lespaceart-remember-me";

export function getRememberMe(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(REMEMBER_KEY);
    return v !== "0"; // mặc định true (giữ đúng hành vi trước khi có tính năng này)
  } catch {
    return true;
  }
}

export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function activeStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return getRememberMe() ? window.localStorage : window.sessionStorage;
}

/** Storage adapter truyền vào Supabase client — tự động chọn đúng nơi lưu theo lựa chọn hiện tại. */
export const rememberAwareStorage = {
  getItem: (key: string) => activeStorage()?.getItem(key) ?? null,
  setItem: (key: string, value: string) => {
    activeStorage()?.setItem(key, value);
  },
  removeItem: (key: string) => {
    activeStorage()?.removeItem(key);
  },
};
