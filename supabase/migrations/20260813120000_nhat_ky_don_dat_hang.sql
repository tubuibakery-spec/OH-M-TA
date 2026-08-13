-- ============================================================
-- Nhóm C — Đợt 19b: Nhật ký thay đổi hiển thị theo đơn đặt hàng NCC
--
-- don_dat_hang_ncc thiếu trong danh sách bảng gắn trg_fn_ghi_nhat_ky gốc
-- (20260802090500_tier1_toan_ven.sql) — chỉ cần thêm 1 trigger mới, không
-- sửa hàm. Đồng thời gắn nguoi_dung_email (snapshot, cùng cơ chế Đợt 14)
-- để hiển thị được tên người thực hiện dù RLS nguoi_dung_he_thong chặn
-- join sống.
-- ============================================================

alter table nhat_ky_he_thong add column if not exists nguoi_dung_email text default bao_mat.email_hien_tai();

drop trigger if exists trg_nhat_ky_don_dat_hang_ncc on don_dat_hang_ncc;
create trigger trg_nhat_ky_don_dat_hang_ncc
after insert or update or delete on don_dat_hang_ncc
for each row execute function trg_fn_ghi_nhat_ky();

-- Mở rộng có kiểm soát policy xem — KHÔNG mở đại trà. Giữ nguyên điều
-- kiện gốc (chỉ vai trò có quyền toàn cục he_thong.xem), thêm 1 nhánh
-- OR cho phép xem riêng log của bảng don_dat_hang_ncc nếu có mua_hang.xem.
drop policy if exists nhat_ky_he_thong_xem on nhat_ky_he_thong;
create policy nhat_ky_he_thong_xem on nhat_ky_he_thong for select to authenticated
  using (
    bao_mat.co_quyen_toan_cuc('he_thong', 'xem')
    or (bang_du_lieu = 'don_dat_hang_ncc' and bao_mat.co_quyen_moi_noi('mua_hang', 'xem'))
  );
