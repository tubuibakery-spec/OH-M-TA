-- ============================================================
-- Nhóm D — Đợt 23: Giá bán cho vật tư được bán (duoc_ban=true)
--
-- gia_ban nullable — vật tư chưa niêm yết giá thì để trống,
-- BanLe.jsx vẫn cho nhập tay như hành vi cũ (không phá luồng cũ).
-- ============================================================

alter table vat_tu add column if not exists gia_ban numeric(14,2);
alter table vat_tu add column if not exists thue_suat_ban numeric(5,2) not null default 0;
alter table vat_tu add column if not exists gia_ban_da_vat numeric(14,2)
  generated always as (
    case when gia_ban is null then null else round(gia_ban * (1 + thue_suat_ban / 100), 0) end
  ) stored;
