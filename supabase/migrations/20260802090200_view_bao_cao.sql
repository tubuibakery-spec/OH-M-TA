-- ============================================================
-- 03. VIEW BÁO CÁO
-- Nguồn: schema_full_1.sql (mục Q) — giữ nguyên truy vấn.
--
-- 🔴 QUAN TRỌNG: mặc định view chạy bằng quyền của CHỦ SỞ HỮU view
-- (postgres) => BỎ QUA RLS. Nếu để mặc định, nhân viên chi nhánh A
-- select vào bao_cao_xuat_nhap_ton sẽ thấy dữ liệu TOÀN BỘ chi nhánh.
-- Vì vậy mọi view đều bật security_invoker = on (PostgreSQL 15+,
-- Supabase hiện dùng PG15/17) để RLS của bảng gốc được áp dụng.
-- ============================================================

create or replace view bao_cao_xuat_nhap_ton
with (security_invoker = on) as
select
  ck.chi_nhanh_id, cn.ten_chi_nhanh, ck.vat_tu_id, vt.ten_vat_tu, vt.loai_vat_tu,
  coalesce(sum(case when tk.loai_giao_dich in ('nhap_mua','san_xuat_nhap','dieu_chuyen_den') then tk.so_luong else 0 end), 0) as tong_nhap,
  coalesce(sum(case when tk.loai_giao_dich in ('san_xuat_xuat','dieu_chuyen_di','ban_hang','huy_hang','ban_b2b') then abs(tk.so_luong) else 0 end), 0) as tong_xuat,
  ck.so_luong_ton as ton_hien_tai
from ton_kho ck
join chi_nhanh cn on cn.id = ck.chi_nhanh_id
join vat_tu vt on vt.id = ck.vat_tu_id
left join the_kho tk on tk.chi_nhanh_id = ck.chi_nhanh_id and tk.vat_tu_id = ck.vat_tu_id
group by ck.chi_nhanh_id, cn.ten_chi_nhanh, ck.vat_tu_id, vt.ten_vat_tu, vt.loai_vat_tu, ck.so_luong_ton;

create or replace view canh_bao_ton_thap
with (security_invoker = on) as
select cn.ten_chi_nhanh, vt.ten_vat_tu, tk.so_luong_ton, vt.ton_toi_thieu
from ton_kho tk
join vat_tu vt on vt.id = tk.vat_tu_id
join chi_nhanh cn on cn.id = tk.chi_nhanh_id
where tk.so_luong_ton <= vt.ton_toi_thieu;

create or replace view ton_kho_kha_dung
with (security_invoker = on) as
select tk.*, (tk.so_luong_ton - tk.so_luong_giu_cho) as so_luong_kha_dung
from ton_kho tk;

create or replace view bao_cao_ton_kha_dung
with (security_invoker = on) as
select cn.ten_chi_nhanh, vt.ten_vat_tu, tk.so_luong_ton, tk.so_luong_giu_cho,
       (tk.so_luong_ton - tk.so_luong_giu_cho) as so_luong_kha_dung
from ton_kho tk
join chi_nhanh cn on cn.id = tk.chi_nhanh_id
join vat_tu vt on vt.id = tk.vat_tu_id;

create or replace view cong_no_qua_han
with (security_invoker = on) as
select kh.ten_doanh_nghiep, hd.so_hoa_don, hd.han_thanh_toan, hd.con_lai
from hoa_don_b2b hd
join khach_hang_b2b kh on kh.id = hd.khach_hang_b2b_id
where hd.con_lai > 0 and hd.han_thanh_toan < current_date;

create or replace view giay_phep_sap_het_han
with (security_invoker = on) as
select cn.ten_chi_nhanh, gp.loai_giay_phep, gp.ngay_het_han
from giay_phep gp
left join chi_nhanh cn on cn.id = gp.chi_nhanh_id
where gp.ngay_het_han between current_date and current_date + interval '30 days';

create or replace view tai_san_den_han_bao_tri
with (security_invoker = on) as
select ts.ma_tai_san, ts.ten_tai_san, cn.ten_chi_nhanh, ts.bao_tri_ke_tiep
from tai_san ts
left join chi_nhanh cn on cn.id = ts.chi_nhanh_id
where ts.bao_tri_ke_tiep <= current_date + interval '7 days';

create or replace view doanh_thu_theo_ngay
with (security_invoker = on) as
select ngay, kenh, sum(thanh_tien) as doanh_thu
from (
  select ngay_ban::date as ngay, kenh_ban as kenh, thanh_tien
  from hoa_don_ban where trang_thai = 'hoan_thanh'
  union all
  select ngay_xuat_hoa_don as ngay, 'b2b' as kenh, tong_tien as thanh_tien
  from hoa_don_b2b
) t
group by ngay, kenh
order by ngay;

create or replace view loi_nhuan_gop_theo_ngay
with (security_invoker = on) as
with ban_le as (
  select hb.ngay_ban::date as ngay, hb.kenh_ban as kenh,
         sum(ct.thanh_tien) as doanh_thu,
         sum(ct.so_luong * coalesce(ct.gia_von_tai_ban, 0)) as gia_von
  from chi_tiet_hoa_don_ban ct
  join hoa_don_ban hb on hb.id = ct.hoa_don_id
  where hb.trang_thai = 'hoan_thanh'
  group by hb.ngay_ban::date, hb.kenh_ban
),
b2b as (
  select hd.ngay_xuat_hoa_don as ngay, 'b2b' as kenh,
         sum(cd.thanh_tien) as doanh_thu,
         sum(cd.so_luong * coalesce(cd.gia_von_tai_ban, 0)) as gia_von
  from hoa_don_b2b hd
  join don_hang_b2b dh on dh.id = hd.don_hang_id
  join chi_tiet_don_hang_b2b cd on cd.don_hang_id = dh.id
  group by hd.ngay_xuat_hoa_don
)
select ngay, kenh, doanh_thu, gia_von,
       (doanh_thu - gia_von) as loi_nhuan_gop,
       round(100.0 * (doanh_thu - gia_von) / nullif(doanh_thu,0), 1) as bien_loi_nhuan_gop_pct
from (select * from ban_le union all select * from b2b) x
order by ngay;

create or replace view chi_tiet_cong_no_ncc
with (security_invoker = on) as
select pn.id as phieu_nhap_id, pn.so_phieu, ncc.id as nha_cung_cap_id, ncc.ten_ncc,
       pn.tong_tien, coalesce(sum(pc.so_tien),0) as da_tra,
       pn.tong_tien - coalesce(sum(pc.so_tien),0) as con_no
from phieu_nhap_kho pn
join nha_cung_cap ncc on ncc.id = pn.nha_cung_cap_id
left join phieu_chi_ncc pc on pc.phieu_nhap_id = pn.id
where pn.trang_thai = 'da_duyet'
group by pn.id, pn.so_phieu, ncc.id, ncc.ten_ncc, pn.tong_tien
having pn.tong_tien - coalesce(sum(pc.so_tien),0) > 0;

create or replace view cong_no_phai_tra_theo_ncc
with (security_invoker = on) as
select ten_ncc, sum(tong_tien) as tong_mua, sum(da_tra) as da_tra, sum(con_no) as con_no
from chi_tiet_cong_no_ncc
group by ten_ncc
order by con_no desc;

create or replace view gia_tri_ton_kho
with (security_invoker = on) as
select cn.id as chi_nhanh_id, cn.ten_chi_nhanh,
       sum(tk.so_luong_ton * tk.gia_von_binh_quan) as gia_tri_ton
from ton_kho tk
join chi_nhanh cn on cn.id = tk.chi_nhanh_id
group by cn.id, cn.ten_chi_nhanh;

create or replace view dong_tien_theo_ngay
with (security_invoker = on) as
with thu as (
  select ngay_ban::date as ngay, thanh_tien as so_tien
  from hoa_don_ban where trang_thai = 'hoan_thanh'
  union all
  select ngay_thu::date as ngay, so_tien from phieu_thu_cong_no
),
chi as (
  select ngay_chi::date as ngay, so_tien from phieu_chi_ncc
  union all
  select ngay_phat_sinh as ngay, so_tien from chi_phi
)
select coalesce(t.ngay, c.ngay) as ngay,
       coalesce(t.tong_thu,0) as tong_thu,
       coalesce(c.tong_chi,0) as tong_chi,
       coalesce(t.tong_thu,0) - coalesce(c.tong_chi,0) as dong_tien_rong
from (select ngay, sum(so_tien) as tong_thu from thu group by ngay) t
full outer join (select ngay, sum(so_tien) as tong_chi from chi group by ngay) c
  on t.ngay = c.ngay
order by 1;

create or replace view bi_tong_quan_thang
with (security_invoker = on) as
select
  date_trunc('month', current_date)::date as thang,
  (select coalesce(sum(doanh_thu),0) from doanh_thu_theo_ngay
     where ngay >= date_trunc('month', current_date)) as doanh_thu_thang,
  (select coalesce(sum(loi_nhuan_gop),0) from loi_nhuan_gop_theo_ngay
     where ngay >= date_trunc('month', current_date)) as loi_nhuan_gop_thang,
  (select coalesce(sum(con_lai),0) from hoa_don_b2b
     where trang_thai_thanh_toan != 'da_thanh_toan') as cong_no_phai_thu,
  (select coalesce(sum(con_no),0) from cong_no_phai_tra_theo_ncc) as cong_no_phai_tra,
  (select coalesce(sum(gia_tri_ton),0) from gia_tri_ton_kho) as gia_tri_ton_kho;

create or replace view chi_phi_san_xuat_thuc_te
with (security_invoker = on) as
select ps.so_phieu, ps.ngay_san_xuat, cts.ten_cong_thuc,
       ps.so_luong_thuc_te, ps.tong_chi_phi_thuc_te,
       round(ps.tong_chi_phi_thuc_te / nullif(ps.so_luong_thuc_te,0), 2) as gia_von_don_vi
from phieu_san_xuat ps
join cong_thuc_san_xuat cts on cts.id = ps.cong_thuc_id
where ps.trang_thai = 'hoan_thanh';
