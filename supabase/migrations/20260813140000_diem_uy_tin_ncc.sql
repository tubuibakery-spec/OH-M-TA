-- ============================================================
-- Nhóm C — Đợt 19d: Chấm điểm NCC tự tính từ lịch sử giao dịch
--
-- Tính từ dữ liệu don_dat_hang_ncc/phieu_nhap_kho đã có sẵn — không cần
-- bảng mới. security_invoker=on, dựa trên các bảng đã có RLS cho phép
-- mua_hang/danh_muc — không cần policy riêng.
-- ============================================================

create or replace view diem_uy_tin_ncc
with (security_invoker = on) as
select ncc.id as nha_cung_cap_id, ncc.ten_ncc,
  count(dd.id) filter (where dd.trang_thai = 'hoan_thanh') as so_don_hoan_thanh,
  count(dd.id) filter (where dd.trang_thai = 'da_huy') as so_don_huy,
  count(dd.id) filter (where dd.trang_thai in ('hoan_thanh','nhan_mot_phan')) as so_don_da_giao,
  count(dd.id) filter (
    where dd.trang_thai in ('hoan_thanh','nhan_mot_phan') and dd.ngay_giao_du_kien is not null
      and exists (select 1 from phieu_nhap_kho pn where pn.don_dat_hang_id = dd.id
                  and pn.trang_thai = 'da_duyet' and pn.ngay_nhap::date > dd.ngay_giao_du_kien)
  ) as so_don_giao_tre
from nha_cung_cap ncc
left join don_dat_hang_ncc dd on dd.nha_cung_cap_id = ncc.id
group by ncc.id, ncc.ten_ncc;
