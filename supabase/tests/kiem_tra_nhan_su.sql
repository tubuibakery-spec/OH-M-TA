-- ============================================================
-- KIỂM CHỨNG NHÂN SỰ & HÀNH CHÍNH
-- Chạy trong transaction, kết thúc bằng ROLLBACK => không để lại dữ liệu.
-- Chạy với vai trò postgres (bỏ qua RLS) để tập trung kiểm logic;
-- phần "không tự duyệt đơn của chính mình" là RLS, không test được ở
-- đây (bỏ qua RLS khi chạy postgres) — kiểm bằng mắt qua giao diện.
-- ============================================================

begin;

insert into chi_nhanh (id, ma_chi_nhanh, ten_chi_nhanh, loai_chi_nhanh) values
  ('f1000000-0000-0000-0000-000000000001', 'T_NS_CH', 'TEST Nhân sự CH', 'cua_hang');

insert into nhan_vien (id, ma_nv, ho_ten, chi_nhanh_id, vai_tro, luong_co_ban, ngay_vao_lam) values
  ('f1000000-0000-0000-0000-000000000002', 'T_NS_NV', 'Nhân viên Test', 'f1000000-0000-0000-0000-000000000001',
   'bep', 9000000, '2026-01-01');
insert into nhan_vien (id, ma_nv, ho_ten, chi_nhanh_id, vai_tro) values
  ('f1000000-0000-0000-0000-000000000003', 'T_NS_QL', 'Quản lý Test', 'f1000000-0000-0000-0000-000000000001',
   'quan_ly');

-- ============================================================
-- 1. CHẤM CÔNG TRỰC TIẾP
-- ============================================================
insert into cham_cong (nhan_vien_id, ngay, trang_thai, nguoi_ghi_id) values
  ('f1000000-0000-0000-0000-000000000002', '2026-08-01', 'di_lam', 'f1000000-0000-0000-0000-000000000003'),
  ('f1000000-0000-0000-0000-000000000002', '2026-08-02', 'di_lam', 'f1000000-0000-0000-0000-000000000003'),
  ('f1000000-0000-0000-0000-000000000002', '2026-08-03', 'nua_ngay', 'f1000000-0000-0000-0000-000000000003');

do $$
declare v int;
begin
  select count(*) into v from cham_cong where nhan_vien_id = 'f1000000-0000-0000-0000-000000000002';
  if v <> 3 then raise exception 'FAIL: chấm công có % dòng (mong đợi 3)', v; end if;
end $$;

-- Không chấm công trùng ngày cho cùng 1 nhân viên
do $$
declare v_loi boolean := false;
begin
  begin
    insert into cham_cong (nhan_vien_id, ngay, trang_thai)
    values ('f1000000-0000-0000-0000-000000000002', '2026-08-01', 'di_lam');
  exception when unique_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: chấm công trùng ngày vẫn tạo được (phải bị chặn)';
  end if;
end $$;

-- ============================================================
-- 2. ĐƠN XIN NGHỈ PHÉP -> DUYỆT -> TỰ ĐỘNG GHI CHẤM CÔNG
-- ============================================================
insert into don_xin_nghi_phep (id, nhan_vien_id, tu_ngay, den_ngay, so_ngay, ly_do) values
  ('f1000000-0000-0000-0000-000000000010', 'f1000000-0000-0000-0000-000000000002',
   '2026-08-10', '2026-08-12', 3, 'Test nghỉ phép');

do $$
declare v text;
begin
  select so_don into v from don_xin_nghi_phep where id = 'f1000000-0000-0000-0000-000000000010';
  if v is null or v not like 'NP-%' then
    raise exception 'FAIL: số đơn nghỉ phép không tự sinh (nhận được %)', coalesce(v, 'NULL');
  end if;
end $$;

update don_xin_nghi_phep set trang_thai = 'da_duyet', nguoi_duyet_id = 'f1000000-0000-0000-0000-000000000003'
 where id = 'f1000000-0000-0000-0000-000000000010';

do $$
declare v int;
begin
  select count(*) into v from cham_cong
   where nhan_vien_id = 'f1000000-0000-0000-0000-000000000002'
     and ngay between '2026-08-10' and '2026-08-12'
     and trang_thai = 'nghi_phep';
  if v <> 3 then
    raise exception 'FAIL: duyệt nghỉ phép 3 ngày nhưng chỉ ghi được % dòng chấm công "nghi_phep"', v;
  end if;
end $$;

-- Ngày không được lớn hơn ngày kết thúc
do $$
declare v_loi boolean := false;
begin
  begin
    insert into don_xin_nghi_phep (nhan_vien_id, tu_ngay, den_ngay, so_ngay)
    values ('f1000000-0000-0000-0000-000000000002', '2026-08-20', '2026-08-15', 1);
  exception when check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: tạo được đơn nghỉ phép có ngày kết thúc trước ngày bắt đầu';
  end if;
end $$;

-- ============================================================
-- 3. ĐẾM CÔNG THÁNG
-- Trong tháng 08/2026: 2 ngày di_lam (=2) + 1 ngày nua_ngay (=0.5)
-- + 3 ngày nghi_phep (=3, vì nghỉ phép được duyệt tính có lương) = 5.5
-- ============================================================
do $$
declare v numeric;
begin
  v := fn_dem_cong_thang('f1000000-0000-0000-0000-000000000002', '2026-08-01');
  if v <> 5.5 then
    raise exception 'FAIL: đếm công tháng 8 = % (mong đợi 5.5)', v;
  end if;
end $$;

-- ============================================================
-- 4. TẠO BẢNG LƯƠNG — thực lĩnh tính đúng
-- Lương cơ bản 9,000,000, công 5.5/26 ngày chuẩn:
-- round(9000000 * 5.5 / 26) = round(1,903,846.15..) = 1,903,846
-- ============================================================
do $$
declare v_id uuid; v_thuc_linh numeric; v_cong numeric;
begin
  v_id := rpc_tao_bang_luong('f1000000-0000-0000-0000-000000000002', '2026-08-15');

  select thuc_linh, so_ngay_cong into v_thuc_linh, v_cong from bang_luong where id = v_id;

  if v_cong <> 5.5 then
    raise exception 'FAIL: bảng lương ghi so_ngay_cong = % (mong đợi 5.5)', v_cong;
  end if;
  if v_thuc_linh <> 1903846 then
    raise exception 'FAIL: thực lĩnh = % (mong đợi 1903846)', v_thuc_linh;
  end if;
end $$;

-- Gọi lại lần 2 với cùng nhân viên/tháng phải CẬP NHẬT chứ không nhân bản dòng
do $$
declare v int;
begin
  perform rpc_tao_bang_luong('f1000000-0000-0000-0000-000000000002', '2026-08-01');
  select count(*) into v from bang_luong
   where nhan_vien_id = 'f1000000-0000-0000-0000-000000000002' and thang = '2026-08-01';
  if v <> 1 then
    raise exception 'FAIL: gọi rpc_tao_bang_luong 2 lần tạo ra % dòng (mong đợi 1, phải upsert)', v;
  end if;
end $$;

do $$ begin raise notice '✅ TẤT CẢ KIỂM TRA NHÂN SỰ ĐỀU ĐẠT'; end $$;

rollback;
