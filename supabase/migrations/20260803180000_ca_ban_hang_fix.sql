-- ============================================================
-- Vá ca_ban_hang trước khi thêm UI:
--   1. trg_fn_dong_ca đang tính tien_mat_he_thong từ hoa_don_ban.thanh_tien
--      (trước thuế) thay vì tong_thanh_toan (đã gồm VAT) — nếu chi nhánh
--      bật VAT, tiền mặt thực thu từ khách luôn cao hơn tien_mat_he_thong
--      đúng bằng phần thuế, làm chenh_lech lệch dương giả tạo vĩnh viễn.
--   2. Chưa có ràng buộc "1 chi nhánh chỉ 1 ca đang mở" — thêm partial
--      unique index (UI vẫn tự kiểm tra trước để báo lỗi thân thiện).
-- ============================================================

-- Giữ nguyên security definer + search_path pinned + revoke khỏi
-- public/anon/authenticated như bản gốc (áp bởi vòng lặp khoá hàm ở
-- cuối 20260802090600_tier2_nghiep_vu.sql) — CREATE OR REPLACE không
-- tự kế thừa các thuộc tính này từ ALTER FUNCTION trước đó, phải khai
-- lại tường minh, nếu không hàm sẽ âm thầm rơi về security invoker.
create or replace function trg_fn_dong_ca() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.trang_thai = 'da_dong' and old.trang_thai = 'dang_mo' then
    new.gio_dong := coalesce(new.gio_dong, now());
    new.tien_mat_he_thong := coalesce((
      select sum(tong_thanh_toan) from hoa_don_ban
      where ca_ban_hang_id = new.id
        and trang_thai = 'hoan_thanh'
        and hinh_thuc_thanh_toan = 'tien_mat'
    ), 0);
  end if;
  return new;
end;
$$;

revoke all on function trg_fn_dong_ca() from public, anon, authenticated;

create unique index if not exists idx_ca_dang_mo
  on ca_ban_hang (chi_nhanh_id) where trang_thai = 'dang_mo';
