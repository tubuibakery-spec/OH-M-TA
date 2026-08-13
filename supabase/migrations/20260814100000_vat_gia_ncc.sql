-- ============================================================
-- Nhóm D — Đợt 21: VAT trên bảng giá NCC (tham khảo, không tự
-- áp vào rpc_de_xuat_dat_hang hay NhapHang.jsx — phiếu nhập đã có
-- cơ chế thue_suat riêng nhập tay từ Đợt 16).
--
-- Pattern giống hệt phieu_nhap_kho.thue_suat/tien_thue (Đợt 16) —
-- default 0 không đổi dữ liệu cũ.
-- ============================================================

alter table gia_nha_cung_cap add column if not exists vat_suat numeric(5,2) not null default 0;
alter table gia_nha_cung_cap add column if not exists don_gia_da_vat numeric(14,2)
  generated always as (round(don_gia * (1 + vat_suat / 100), 0)) stored;
