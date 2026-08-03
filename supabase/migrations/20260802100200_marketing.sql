-- ============================================================
-- 12. MARKETING — chương trình khuyến mãi
--
-- Thiết kế có chủ đích: KHÔNG tự động áp giảm giá qua trigger.
-- Chương trình khuyến mãi chỉ là "mẫu quy tắc" để người bán hàng CHỌN
-- tại thời điểm bán, ứng dụng tự tính số tiền giảm gợi ý rồi điền vào
-- đúng cột giam_gia đã có sẵn (hoa_don_ban.giam_gia) — không thêm
-- logic trigger tự động tính lại tổng tiền (rủi ro cao, đã thấy hậu
-- quả với lỗi UPSERT/CHECK constraint ở ton_kho_lo cùng đợt này).
-- khuyen_mai_id chỉ để LƯU VẾT chương trình nào đã dùng, phục vụ báo
-- cáo hiệu quả khuyến mãi — không phải nguồn chân lý của số tiền giảm.
--
--   12.1 Module quyền mới "marketing"
--   12.2 Bảng chương trình khuyến mãi
--   12.3 Lưu vết trên hoa_don_ban / don_hang_b2b
--   12.4 View hiệu quả khuyến mãi
--   12.5 RLS
-- ============================================================

-- ------------------------------------------------------------
-- 12.1 MODULE QUYỀN MỚI
-- ------------------------------------------------------------

insert into quyen_he_thong (module, hanh_dong)
select 'marketing', h.hanh_dong
from (values ('xem'),('tao'),('sua'),('xoa'),('duyet')) h(hanh_dong)
on conflict (module, hanh_dong) do nothing;

select bao_mat.gan_quyen('admin',             'marketing', array['xem','tao','sua','xoa','duyet']);
select bao_mat.gan_quyen('giam_doc',          'marketing', array['xem','duyet']);
select bao_mat.gan_quyen('quan_ly_chi_nhanh', 'marketing', array['xem','tao','sua','xoa','duyet']);
select bao_mat.gan_quyen('thu_ngan',          'marketing', array['xem']);
select bao_mat.gan_quyen('sale_b2b',          'marketing', array['xem']);
select bao_mat.gan_quyen('ke_toan',           'marketing', array['xem']);

-- ------------------------------------------------------------
-- 12.2 CHƯƠNG TRÌNH KHUYẾN MÃI
-- ------------------------------------------------------------

create table if not exists chuong_trinh_khuyen_mai (
  id uuid primary key default gen_random_uuid(),
  ma_ctkm text unique,
  ten_ctkm text not null,
  mo_ta text,
  loai_giam text not null check (loai_giam in ('phan_tram', 'so_tien')),
  gia_tri_giam numeric(14,2) not null check (gia_tri_giam > 0),
  -- Với loai_giam='phan_tram', gia_tri_giam là % (0-100). Ràng buộc mềm
  -- bằng CHECK riêng bên dưới thay vì ép chung với so_tien.
  ap_dung_kenh text not null default 'ca_hai'
      check (ap_dung_kenh in ('ban_le', 'b2b', 'ca_hai')),
  gia_tri_don_toi_thieu numeric(14,2) not null default 0,
  ap_dung_tu date not null default current_date,
  ap_dung_den date,
  dang_hoat_dong boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (loai_giam <> 'phan_tram' or gia_tri_giam <= 100)
);

create index if not exists idx_ctkm_hoat_dong on chuong_trinh_khuyen_mai (dang_hoat_dong)
  where dang_hoat_dong;

drop trigger if exists trg_updated_at_chuong_trinh_khuyen_mai on chuong_trinh_khuyen_mai;
create trigger trg_updated_at_chuong_trinh_khuyen_mai
before update on chuong_trinh_khuyen_mai
for each row execute function trg_fn_cap_nhat_updated_at();

drop trigger if exists trg_so_ct_chuong_trinh_khuyen_mai on chuong_trinh_khuyen_mai;
create trigger trg_so_ct_chuong_trinh_khuyen_mai
before insert on chuong_trinh_khuyen_mai
for each row execute function trg_fn_sinh_so_chung_tu('ma_ctkm', 'KM');

-- ------------------------------------------------------------
-- 12.3 LƯU VẾT ĐÃ DÙNG CHƯƠNG TRÌNH NÀO (chỉ để báo cáo)
-- ------------------------------------------------------------

alter table hoa_don_ban
  add column if not exists khuyen_mai_id uuid references chuong_trinh_khuyen_mai(id);

alter table don_hang_b2b
  add column if not exists khuyen_mai_id uuid references chuong_trinh_khuyen_mai(id);

create index if not exists idx_hoa_don_ban_km on hoa_don_ban (khuyen_mai_id) where khuyen_mai_id is not null;
create index if not exists idx_don_hang_b2b_km on don_hang_b2b (khuyen_mai_id) where khuyen_mai_id is not null;

-- ------------------------------------------------------------
-- 12.4 VIEW HIỆU QUẢ KHUYẾN MÃI
-- ------------------------------------------------------------

create or replace view hieu_qua_khuyen_mai
with (security_invoker = on) as
select km.id as khuyen_mai_id, km.ma_ctkm, km.ten_ctkm, km.ap_dung_kenh,
       count(distinct hd.id) as so_hoa_don_ban_le,
       coalesce(sum(hd.giam_gia), 0) as tong_giam_ban_le,
       coalesce(sum(hd.thanh_tien), 0) as doanh_thu_ban_le_sau_giam,
       count(distinct dh.id) as so_don_b2b,
       coalesce(sum(dh.tong_tien), 0) as doanh_thu_b2b
from chuong_trinh_khuyen_mai km
left join hoa_don_ban hd on hd.khuyen_mai_id = km.id and hd.trang_thai = 'hoan_thanh'
left join don_hang_b2b dh on dh.khuyen_mai_id = km.id and dh.trang_thai <> 'da_huy'
group by km.id, km.ma_ctkm, km.ten_ctkm, km.ap_dung_kenh;

-- ------------------------------------------------------------
-- 12.5 RLS — danh mục dùng chung, đọc rộng, ghi chỉ vai trò toàn cục.
-- ------------------------------------------------------------

select bao_mat.gen_policy_danh_muc('chuong_trinh_khuyen_mai', 'marketing');

grant select on hieu_qua_khuyen_mai to authenticated;

do $$
declare v_thieu text;
begin
  select string_agg(c.relname, ', ')
    into v_thieu
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_thieu is not null then
    raise exception 'Các bảng sau CHƯA bật RLS: %', v_thieu;
  end if;
end $$;
