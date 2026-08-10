-- ============================================================
-- TT99/2025/TT-BTC — Chứng từ có người lập
--
-- Phụ lục I TT99 (Phiếu Thu 01-TT, Phiếu Chi 02-TT...) yêu cầu chứng từ
-- có người lập. Dùng cột SNAPSHOT văn bản (không FK+join) vì RLS của
-- nguoi_dung_he_thong/nhan_vien chỉ cho xem chính mình hoặc cần quyền
-- he_thong/nhan_su riêng — một kế toán viên bình thường (chỉ có quyền
-- tai_chinh) sẽ không join được tên/email của người khác.
--
-- PostgreSQL không cho phép subquery trực tiếp trong DEFAULT expression,
-- nên bọc vào 1 hàm SQL (giống pattern bao_mat.nguoi_dung_id()).
-- ============================================================

create or replace function bao_mat.email_hien_tai() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select email from nguoi_dung_he_thong where id = bao_mat.nguoi_dung_id()
$$;

alter table but_toan add column if not exists nguoi_lap_email text
  default bao_mat.email_hien_tai();
alter table phieu_thu_cong_no add column if not exists nguoi_lap_email text
  default bao_mat.email_hien_tai();
alter table phieu_chi_ncc add column if not exists nguoi_lap_email text
  default bao_mat.email_hien_tai();
alter table chi_phi add column if not exists nguoi_lap_email text
  default bao_mat.email_hien_tai();

-- CREATE OR REPLACE VIEW chỉ cho phép thêm cột ở CUỐI danh sách (không
-- được chèn giữa) — nguoi_lap_email phải là cột cuối cùng.
create or replace view so_cai
with (security_invoker = on) as
select bt.id as but_toan_id, bt.so_but_toan, bt.ngay_hach_toan, bt.dien_giai, bt.nguon_goc_loai,
       bt.chi_nhanh_id, cn.ten_chi_nhanh,
       ct.tai_khoan_id, tk.so_hieu, tk.ten_tai_khoan, tk.loai as loai_tai_khoan,
       ct.no, ct.co,
       bt.nguoi_lap_email
from chi_tiet_but_toan ct
join but_toan bt on bt.id = ct.but_toan_id
join he_thong_tai_khoan tk on tk.id = ct.tai_khoan_id
left join chi_nhanh cn on cn.id = bt.chi_nhanh_id;
