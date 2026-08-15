-- Lưu VAT% từng dòng đơn đặt NCC (trước đây chỉ hiện tham khảo lúc tạo,
-- không lưu) — cần lưu để tính Tổng tiền VAT/Tổng tiền đơn hàng khi xem/in.
alter table chi_tiet_don_dat_hang_ncc add column if not exists vat_suat numeric(5,2) not null default 0;
