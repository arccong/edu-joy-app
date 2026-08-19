-- "Khoản chi cố định hàng tháng": lưu MẪU của khoản chi cố định (đơn giá, số lượng, danh mục...).
-- Mỗi tháng cụ thể vẫn là 1 dòng trong finance_entries như bình thường (để sửa/xóa từng tháng riêng lẻ
-- được, và để các trang báo cáo/xuất Excel hiện có không cần đổi gì) — recurring_expenses chỉ là "khuôn"
-- để tự sinh thêm dòng cho các tháng sau, và là nơi lưu giá trị MỚI NHẤT khi người dùng sửa đổi.
CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  class_type text,
  unit_amount numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  note text,
  start_month date NOT NULL,
  -- Tháng gần nhất đã có dòng finance_entries tương ứng (dùng để biết sinh tiếp từ tháng nào, KHÔNG
  -- dựa vào việc "tháng đó có dòng hay không" — để nếu người dùng xóa 1 dòng finance_entries thuộc
  -- chuỗi này, hệ thống sẽ không tự sinh lại dòng đã bị xóa đó).
  last_materialized_month date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.recurring_expenses TO service_role;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_recurring_expenses_updated_at BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "recurring_expenses_manager_only" ON public.recurring_expenses FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;

ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS recurring_expense_id uuid REFERENCES public.recurring_expenses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_entries_recurring ON public.finance_entries(recurring_expense_id, month);
