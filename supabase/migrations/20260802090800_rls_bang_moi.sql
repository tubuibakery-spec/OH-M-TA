-- ============================================================
-- 09. RLS + PHÂN QUYỀN CHO CÁC BẢNG MỚI (Tier 1/2/3)
--
-- Dùng lại đúng 4 khuôn policy của migration 04 — nguyên tắc
-- "quyền AND chi nhánh" không đổi.
-- ============================================================

-- ------------------------------------------------------------
-- 9.1 MODULE MỚI: du_bao
-- ------------------------------------------------------------

insert into quyen_he_thong (module, hanh_dong)
select 'du_bao', h.hanh_dong
from (values ('xem'),('tao'),('sua'),('xoa'),('duyet')) h(hanh_dong)
on conflict (module, hanh_dong) do nothing;

select bao_mat.gan_quyen('admin',             'du_bao', array['xem','tao','sua','xoa','duyet']);
select bao_mat.gan_quyen('giam_doc',          'du_bao', array['xem','duyet']);
select bao_mat.gan_quyen('quan_ly_chi_nhanh', 'du_bao', array['xem','tao','sua','xoa','duyet']);
select bao_mat.gan_quyen('thu_kho',           'du_bao', array['xem','tao','sua']);
select bao_mat.gan_quyen('bep',               'du_bao', array['xem']);
select bao_mat.gan_quyen('ke_toan',           'du_bao', array['xem']);

-- ------------------------------------------------------------
-- 9.2 HÀM TRA CHI NHÁNH CỦA CHỨNG TỪ CHA MỚI
-- ------------------------------------------------------------

create or replace function bao_mat.cn_don_dat_ncc(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from don_dat_hang_ncc where id = p_id $$;

create or replace function bao_mat.cn_phieu_kiem_ke(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from phieu_kiem_ke where id = p_id $$;

grant execute on function bao_mat.cn_don_dat_ncc(uuid) to authenticated;
grant execute on function bao_mat.cn_phieu_kiem_ke(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9.3 ÁP POLICY
-- ------------------------------------------------------------

-- Danh mục (ghi = vai trò toàn hệ thống)
select bao_mat.gen_policy_danh_muc('ly_do_huy',        'danh_muc');
-- Giá NCC là dữ liệu mua hàng nhạy cảm => đọc theo quyền mua_hang,
-- KHÔNG để chung với danh_muc (thu ngân không cần thấy giá nhập).
select bao_mat.gen_policy_danh_muc('gia_nha_cung_cap', 'mua_hang');

-- Bảng gắn chi nhánh
select bao_mat.gen_policy_chi_nhanh('don_dat_hang_ncc', 'mua_hang');
select bao_mat.gen_policy_chi_nhanh('du_bao_ban',       'du_bao');
select bao_mat.gen_policy_chi_nhanh('doanh_so_thuc_te', 'ban_le');
select bao_mat.gen_policy_chi_nhanh('phieu_kiem_ke',    'kho');
select bao_mat.gen_policy_chi_nhanh('ca_ban_hang',      'ban_le');

-- Bảng chi tiết
select bao_mat.gen_policy_con('chi_tiet_don_dat_hang_ncc', 'mua_hang',
                              'don_dat_hang_id',  'bao_mat.cn_don_dat_ncc');
select bao_mat.gen_policy_con('chi_tiet_phieu_kiem_ke',    'kho',
                              'phieu_kiem_ke_id', 'bao_mat.cn_phieu_kiem_ke');

-- Tồn theo lô: CHỈ ĐỌC, giống ton_kho.
-- Mọi thay đổi đi qua fn_capnhat_ton_kho / fn_xuat_fefo (SECURITY DEFINER).
alter table ton_kho_lo enable row level security;
drop policy if exists ton_kho_lo_xem on ton_kho_lo;
create policy ton_kho_lo_xem on ton_kho_lo for select to authenticated
  using (chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'xem'))));

-- Bộ đếm số chứng từ: nội bộ, không ai đọc/ghi trực tiếp.
-- Bật RLS và cố ý KHÔNG tạo policy nào.
alter table bo_dem_chung_tu enable row level security;

-- ------------------------------------------------------------
-- 9.4 CẤP QUYỀN BẢNG CHO CÁC BẢNG MỚI
-- (migration 04 chỉ cấp cho các bảng tồn tại lúc đó)
-- ------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- bo_dem_chung_tu không cần cho authenticated dù có RLS chặn
revoke all on bo_dem_chung_tu from authenticated;

-- ------------------------------------------------------------
-- 9.5 KIỂM TRA CUỐI — mọi bảng public phải bật RLS
-- ------------------------------------------------------------

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

-- Kiểm tra thêm: bảng nào bật RLS mà KHÔNG có policy nào thì phải là
-- bảng cố ý khóa hoàn toàn — liệt kê ra để rà bằng mắt.
do $$
declare v_ds text;
begin
  select string_agg(c.relname, ', ')
    into v_ds
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if v_ds is not null then
    raise notice 'Bảng bật RLS nhưng không có policy (chỉ ghi/đọc qua hàm): %', v_ds;
  end if;
end $$;
