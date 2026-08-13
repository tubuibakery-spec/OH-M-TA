-- ============================================================
-- Nhóm C — Đợt 19a: Trao đổi nội bộ trên đơn đặt hàng NCC
-- ============================================================

create table if not exists ghi_chu_don_dat_hang (
  id uuid primary key default gen_random_uuid(),
  don_dat_hang_id uuid not null references don_dat_hang_ncc(id) on delete cascade,
  nguoi_dung_email text default bao_mat.email_hien_tai(),
  noi_dung text not null,
  created_at timestamptz not null default now()
);

-- don_dat_hang_ncc trước giờ dùng gen_policy_chi_nhanh trực tiếp (có cột
-- chi_nhanh_id riêng) nên chưa từng cần hàm cn — bảng con mới này cần hàm
-- cn_don_dat_hang lần đầu.
create or replace function bao_mat.cn_don_dat_hang(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from don_dat_hang_ncc where id = p_id
$$;

select bao_mat.gen_policy_con('ghi_chu_don_dat_hang', 'mua_hang', 'don_dat_hang_id', 'bao_mat.cn_don_dat_hang');
