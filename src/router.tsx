import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Trước đây KHÔNG có cấu hình gì (mặc định của react-query) — dữ liệu chỉ tự làm mới khi tab
        // MẤT rồi LẤY LẠI focus (refetchOnWindowFocus mặc định vẫn bật, nhưng nếu người dùng để nguyên
        // 1 tab desktop đang mở, không chuyển đi đâu, sự kiện đó không bao giờ xảy ra) — nên thao tác
        // trên điện thoại không hiện lên desktop (và ngược lại) trừ khi bấm F5. Thêm refetchInterval để
        // TỰ ĐỘNG làm mới định kỳ các dữ liệu đang hiển thị trên màn hình, mô phỏng đồng bộ gần thời gian
        // thực giữa các thiết bị mà không cần dựng hạ tầng Realtime (Supabase Realtime/WebSocket).
        refetchInterval: 15000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
