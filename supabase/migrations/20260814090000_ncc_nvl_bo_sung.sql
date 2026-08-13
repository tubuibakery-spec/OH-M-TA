-- ============================================================
-- Nhóm D — Đợt 20: Đối chiếu Order auto — NCC bổ sung Email,
-- NVL bổ sung Nhóm + hao hụt sơ chế/vận hành
--
-- Mặc định 100% (không hao hụt) cho 2 cột tỷ lệ — an toàn với dữ
-- liệu cũ, giữ nguyên hành vi hiện tại cho tới khi chỉnh tay.
-- ============================================================

alter table nha_cung_cap add column if not exists email text;

alter table vat_tu add column if not exists nhom text;
alter table vat_tu add column if not exists ty_le_thu_hoi_so_che_pct numeric(5,2) not null default 100
  check (ty_le_thu_hoi_so_che_pct > 0 and ty_le_thu_hoi_so_che_pct <= 100);
alter table vat_tu add column if not exists ty_le_su_dung_van_hanh_pct numeric(5,2) not null default 100
  check (ty_le_su_dung_van_hanh_pct > 0 and ty_le_su_dung_van_hanh_pct <= 100);
