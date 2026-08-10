-- ============================================================
-- TT99/2025/TT-BTC — Thuế GTGT đầu vào cho Nhập hàng (kích hoạt TK 133)
--
-- phieu_nhap_kho trước giờ không có cột thuế — hàng nhập được hạch toán
-- "Nợ 156 = tong_tien / Có 331 = tong_tien" (trg_fn_ke_toan_phieu_nhap),
-- tức nếu NCC xuất hoá đơn có VAT, khoản thuế bị gộp thẳng vào giá vốn
-- hàng tồn kho thay vì tách ra TK 133 (đã thêm từ Đợt 6 nhưng chưa dùng).
-- Theo đúng pattern đã có ở hoa_don_ban/hoa_don_b2b (1 mức thue_suat/hoá
-- đơn, không tách nhiều mức theo dòng hàng).
--
-- tong_tien giữ nguyên ý nghĩa "tiền hàng trước thuế" (không đổi cách
-- NhapHang.jsx tính tổng từ chi_tiet_phieu_nhap) — phiếu cũ có
-- thue_suat mặc định 0 nên tong_thanh_toan = tong_tien, không ảnh hưởng
-- dữ liệu lịch sử.
-- ============================================================

alter table phieu_nhap_kho add column if not exists thue_suat numeric(5,2) not null default 0;
alter table phieu_nhap_kho add column if not exists tien_thue numeric(14,2)
  generated always as (round(tong_tien * thue_suat / 100, 0)) stored;
alter table phieu_nhap_kho add column if not exists tong_thanh_toan numeric(14,2)
  generated always as (tong_tien + round(tong_tien * thue_suat / 100, 0)) stored;

-- QUAN TRỌNG: fn_ghi_but_toan đã bị REVOKE khỏi authenticated (chỉ gọi được
-- từ hàm SECURITY DEFINER khác, xem "khóa lại toàn bộ hàm mới" ở cuối
-- 20260802100100_ke_toan.sql) — CREATE OR REPLACE FUNCTION KHÔNG tự giữ lại
-- security definer/search_path của hàm gốc, nên PHẢI khai báo lại tường
-- minh, nếu không trigger sẽ chạy dưới quyền authenticated và bị chặn với
-- lỗi "permission denied for function fn_ghi_but_toan".
create or replace function trg_fn_ke_toan_phieu_nhap() returns trigger as $$
declare
  v_dong jsonb;
begin
  if new.trang_thai = 'da_duyet' and old.trang_thai is distinct from 'da_duyet' and new.tong_tien > 0 then
    v_dong := jsonb_build_array(
      jsonb_build_object('so_hieu', '156', 'no', new.tong_tien, 'co', 0)
    );
    if new.tien_thue > 0 then
      v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', '133', 'no', new.tien_thue, 'co', 0));
    end if;
    v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', '331', 'no', 0, 'co', new.tong_thanh_toan));

    perform fn_ghi_but_toan(
      'phieu_nhap_kho', new.id, new.ngay_nhap::date,
      'Nhập hàng ' || new.so_phieu, new.chi_nhanh_id, v_dong
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Đổi nguồn cột tong_mua từ tong_tien (tiền hàng trước thuế) sang
-- tong_thanh_toan (tổng thực nợ NCC, gồm thuế) — công ty nợ NCC số tiền
-- ĐÃ GỒM THUẾ, không phải chỉ tiền hàng. An toàn với dữ liệu cũ vì
-- tong_thanh_toan = tong_tien khi thue_suat = 0 (mặc định).
create or replace view cong_no_phai_tra_theo_ncc
with (security_invoker = on) as
with mua as (
  select ncc.id as nha_cung_cap_id, ncc.ten_ncc,
         coalesce(sum(pn.tong_thanh_toan), 0) as tong_mua
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
