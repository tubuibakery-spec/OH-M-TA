-- ============================================================
-- Nhóm C — Đợt 18: Phê duyệt nội bộ theo hạn mức
--
-- don_dat_hang_ncc đã có sẵn cột nguoi_duyet_id/ngay_duyet từ Tier2
-- nhưng chưa từng được dùng — kích hoạt bằng 2 trạng thái mới.
-- ============================================================

alter table don_dat_hang_ncc drop constraint if exists don_dat_hang_ncc_trang_thai_check;
alter table don_dat_hang_ncc add constraint don_dat_hang_ncc_trang_thai_check
  check (trang_thai in ('nhap','cho_duyet','da_gui','da_xac_nhan','nhan_mot_phan','hoan_thanh','da_huy','tu_choi'));

-- Ngưỡng duyệt dùng chung 1 giá trị (không phân theo vai trò/chi nhánh —
-- đủ dùng, tránh phình phạm vi). Để trống = không bắt buộc duyệt.
alter table cau_hinh_cong_ty add column if not exists han_muc_duyet_don_mua numeric(14,2);

-- KHÔNG cần gan_quyen('mua_hang','duyet') cho giam_doc/quan_ly_chi_nhanh —
-- cả 2 vai trò đã có sẵn hành động 'duyet' trên module 'mua_hang' từ vòng
-- lặp seed gốc (20260802090400_seed_vai_tro_quyen.sql dòng 71-90), xác nhận
-- lại trước khi viết migration này để tránh insert thừa.
