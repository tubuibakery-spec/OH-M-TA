-- Đợt 24: mở rộng loai_vat_tu (Bao bì/Dụng cụ) + điều kiện bảo quản.

alter table vat_tu drop constraint vat_tu_loai_vat_tu_check;
alter table vat_tu add constraint vat_tu_loai_vat_tu_check
  check (loai_vat_tu in ('nguyen_vat_lieu','ban_thanh_pham','thanh_pham','bao_bi','dung_cu'));

alter table vat_tu add column if not exists dieu_kien_bao_quan text
  check (dieu_kien_bao_quan in ('thuong','mat','dong_lanh'));
