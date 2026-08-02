-- ============================================================
-- KIỂM CHỨNG RLS — chứng minh dữ liệu KHÔNG rò giữa các chi nhánh.
--
-- Cách chạy: dán toàn bộ file vào Supabase SQL Editor rồi Run.
-- Toàn bộ nằm trong transaction và kết thúc bằng ROLLBACK
-- => không để lại dữ liệu rác. Nếu có lỗi rò rỉ, script raise exception.
--
-- Mẹo: script dùng đường "fallback theo email" trong bao_mat.nguoi_dung_id()
-- nên không cần tạo tài khoản thật trong auth.users.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Dữ liệu thử: 2 chi nhánh, 2 người dùng, mỗi người 1 chi nhánh
-- ------------------------------------------------------------

insert into chi_nhanh (id, ma_chi_nhanh, ten_chi_nhanh, loai_chi_nhanh) values
  ('11111111-1111-1111-1111-111111111111', 'TEST_MYTHAI', 'TEST Mỹ Thái', 'cua_hang'),
  ('22222222-2222-2222-2222-222222222222', 'TEST_PTB',    'TEST PTB',     'cua_hang');

insert into don_vi_tinh (id, ma_dvt, ten_dvt)
values ('33333333-3333-3333-3333-333333333333', 'TEST_KG', 'Kilogram');

insert into vat_tu (id, ma_vat_tu, ten_vat_tu, loai_vat_tu, don_vi_tinh_id)
values ('44444444-4444-4444-4444-444444444444', 'TEST_BOT', 'Bột mì test',
        'nguyen_vat_lieu', '33333333-3333-3333-3333-333333333333');

insert into ton_kho (chi_nhanh_id, vat_tu_id, so_luong_ton) values
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 100),
  ('22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 200);

insert into phieu_nhap_kho (id, so_phieu, chi_nhanh_id) values
  ('55555555-5555-5555-5555-555555555555', 'TEST-PN-MYTHAI', '11111111-1111-1111-1111-111111111111'),
  ('66666666-6666-6666-6666-666666666666', 'TEST-PN-PTB',    '22222222-2222-2222-2222-222222222222');

insert into nguoi_dung_he_thong (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'test.mythai@example.com'),
  ('88888888-8888-8888-8888-888888888888', 'test.ptb@example.com');

insert into nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id, chi_nhanh_id)
select '77777777-7777-7777-7777-777777777777', vt.id, '11111111-1111-1111-1111-111111111111'
from vai_tro_he_thong vt where vt.ma_vai_tro = 'quan_ly_chi_nhanh';

insert into nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id, chi_nhanh_id)
select '88888888-8888-8888-8888-888888888888', vt.id, '22222222-2222-2222-2222-222222222222'
from vai_tro_he_thong vt where vt.ma_vai_tro = 'quan_ly_chi_nhanh';

-- ------------------------------------------------------------
-- 2. Đóng vai quản lý Mỹ Thái
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"test.mythai@example.com","role":"authenticated"}';

do $$
declare v int;
begin
  -- Nhận diện đúng người dùng?
  if bao_mat.nguoi_dung_id() is null then
    raise exception 'FAIL: không nhận diện được người dùng từ JWT';
  end if;

  -- 2.1 Tồn kho: chỉ thấy chi nhánh mình
  select count(*) into v from ton_kho;
  if v <> 1 then
    raise exception 'FAIL: quản lý Mỹ Thái thấy % dòng ton_kho (mong đợi 1)', v;
  end if;

  select count(*) into v from ton_kho
   where chi_nhanh_id = '22222222-2222-2222-2222-222222222222';
  if v <> 0 then
    raise exception 'FAIL: RÒ TỒN KHO chi nhánh PTB sang Mỹ Thái';
  end if;

  -- 2.2 Phiếu nhập: chỉ thấy chi nhánh mình
  select count(*) into v from phieu_nhap_kho;
  if v <> 1 then
    raise exception 'FAIL: thấy % phiếu nhập (mong đợi 1)', v;
  end if;

  -- 2.3 Danh sách chi nhánh: chỉ chi nhánh mình
  select count(*) into v from chi_nhanh
   where ma_chi_nhanh like 'TEST_%';
  if v <> 1 then
    raise exception 'FAIL: thấy % chi nhánh TEST (mong đợi 1)', v;
  end if;

  -- 2.4 View báo cáo cũng phải bị chặn (security_invoker)
  select count(*) into v from bao_cao_xuat_nhap_ton
   where vat_tu_id = '44444444-4444-4444-4444-444444444444';
  if v <> 1 then
    raise exception 'FAIL: VIEW bao_cao_xuat_nhap_ton rò dữ liệu — thấy % dòng (mong đợi 1). '
                    'Kiểm tra security_invoker.', v;
  end if;

  select count(*) into v from gia_tri_ton_kho
   where chi_nhanh_id = '22222222-2222-2222-2222-222222222222';
  if v <> 0 then
    raise exception 'FAIL: VIEW gia_tri_ton_kho rò giá trị tồn của chi nhánh khác';
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Ghi dữ liệu sang chi nhánh khác phải bị từ chối
-- ------------------------------------------------------------

do $$
declare v_loi boolean := false;
begin
  begin
    insert into phieu_nhap_kho (so_phieu, chi_nhanh_id)
    values ('TEST-CHEO', '22222222-2222-2222-2222-222222222222');
  exception when insufficient_privilege or check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: tạo được phiếu nhập cho CHI NHÁNH KHÁC';
  end if;
end $$;

do $$
declare v_so int;
begin
  begin
    -- Không có policy UPDATE trên ton_kho => 0 dòng bị ảnh hưởng
    update ton_kho set so_luong_ton = 999
     where chi_nhanh_id = '11111111-1111-1111-1111-111111111111';
    get diagnostics v_so = row_count;
  exception when insufficient_privilege then
    v_so := 0;
  end;
  if v_so <> 0 then
    raise exception 'FAIL: sửa được ton_kho trực tiếp % dòng (phải đi qua hàm fn_*)', v_so;
  end if;
end $$;

-- Không được tự gán thêm vai trò cho mình (leo thang đặc quyền)
do $$
declare v_loi boolean := false;
begin
  begin
    insert into nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id, chi_nhanh_id)
    select '77777777-7777-7777-7777-777777777777', vt.id, null
    from vai_tro_he_thong vt where vt.ma_vai_tro = 'admin';
  exception when insufficient_privilege or check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: tự gán được vai trò admin — LEO THANG ĐẶC QUYỀN';
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Đổi sang quản lý PTB — phải thấy đúng phần của mình
-- ------------------------------------------------------------

set local request.jwt.claims =
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"test.ptb@example.com","role":"authenticated"}';

do $$
declare v numeric;
begin
  select so_luong_ton into v from ton_kho
   where vat_tu_id = '44444444-4444-4444-4444-444444444444';
  if v is distinct from 200 then
    raise exception 'FAIL: quản lý PTB thấy tồn = % (mong đợi 200)', v;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. Người chưa đăng nhập (anon) không thấy gì
-- ------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare v int;
begin
  begin
    select count(*) into v from ton_kho;
  exception when insufficient_privilege then
    v := 0;   -- bị chặn ở tầng GRANT — càng tốt
  end;
  if v <> 0 then
    raise exception 'FAIL: anon đọc được % dòng ton_kho', v;
  end if;
end $$;

reset role;

do $$ begin raise notice '✅ TẤT CẢ KIỂM TRA RLS ĐỀU ĐẠT'; end $$;

rollback;
