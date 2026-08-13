-- ============================================================
-- Nhóm C — Đợt 19c: Đánh giá sao thủ công cho NCC
-- ============================================================

alter table nha_cung_cap add column if not exists diem_danh_gia numeric(2,1) check (diem_danh_gia between 0 and 5);
