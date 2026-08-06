-- ============================================================
-- Bổ sung nha_cung_cap_id vào view cong_no_phai_tra_theo_ncc
-- Lý do: trang "Công nợ phải trả NCC" cần nha_cung_cap_id để insert
-- phieu_chi_ncc, nhưng view gốc (tier3) chỉ trả ten_ncc — join lại theo
-- tên rủi ro trùng NCC. CREATE OR REPLACE VIEW chỉ cho phép THÊM cột ở
-- cuối, không được đổi tên/vị trí 4 cột đã có (bi_tong_quan_thang đang
-- đọc cột con_no) — nên nha_cung_cap_id phải nằm SAU CÙNG.
-- ============================================================

create or replace view cong_no_phai_tra_theo_ncc
with (security_invoker = on) as
with mua as (
  select ncc.id as nha_cung_cap_id, ncc.ten_ncc,
         coalesce(sum(pn.tong_tien), 0) as tong_mua
  from nha_cung_cap ncc
  left join phieu_nhap_kho pn on pn.nha_cung_cap_id = ncc.id and pn.trang_thai = 'da_duyet'
  group by ncc.id, ncc.ten_ncc
),
chi as (
  select nha_cung_cap_id, coalesce(sum(so_tien), 0) as da_tra
  from phieu_chi_ncc group by nha_cung_cap_id
),
tra as (
  select px.nha_cung_cap_id, coalesce(sum(ct.thanh_tien), 0) as gia_tri_tra
  from phieu_xuat_kho px
  join chi_tiet_phieu_xuat ct on ct.phieu_xuat_id = px.id
  where px.loai_xuat = 'tra_ncc' and px.trang_thai in ('da_gui', 'da_nhan')
    and px.nha_cung_cap_id is not null
  group by px.nha_cung_cap_id
)
select m.ten_ncc,
       m.tong_mua,
       coalesce(c.da_tra, 0) as da_tra,
       m.tong_mua - coalesce(c.da_tra, 0) - coalesce(t.gia_tri_tra, 0) as con_no,
       coalesce(t.gia_tri_tra, 0) as gia_tri_tra_lai,
       m.nha_cung_cap_id
from mua m
left join chi c on c.nha_cung_cap_id = m.nha_cung_cap_id
left join tra t on t.nha_cung_cap_id = m.nha_cung_cap_id
where m.tong_mua - coalesce(c.da_tra, 0) - coalesce(t.gia_tri_tra, 0) <> 0
order by con_no desc;
