-- ============================================================
-- KIỂM CHỨNG SALE/CRM
-- Chạy trong transaction, kết thúc bằng ROLLBACK => không để lại dữ liệu.
-- Chạy với vai trò postgres (bỏ qua RLS) để tập trung kiểm logic nghiệp vụ.
-- ============================================================

begin;

insert into khach_hang_b2b (id, ma_khach_hang, ten_doanh_nghiep) values
  ('c0000000-0000-0000-0000-000000000001', 'T_CRM_KH', 'TEST Khách CRM');

insert into nhan_vien (id, ma_nv, ho_ten, vai_tro) values
  ('c0000000-0000-0000-0000-000000000002', 'T_CRM_NV', 'Nhân viên Sale Test', 'quan_ly');

-- ============================================================
-- 1. TỰ SINH MÃ CƠ HỘI
-- ============================================================
insert into co_hoi_ban_hang (id, khach_hang_b2b_id, ten_co_hoi, gia_tri_uoc_tinh, nhan_vien_phu_trach_id)
values ('c0000000-0000-0000-0000-000000000010',
        'c0000000-0000-0000-0000-000000000001', 'Đơn thử nghiệm', 5000000,
        'c0000000-0000-0000-0000-000000000002');

do $$
declare v text;
begin
  select ma_co_hoi into v from co_hoi_ban_hang where id = 'c0000000-0000-0000-0000-000000000010';
  if v is null or v not like 'CH-%' then
    raise exception 'FAIL: mã cơ hội không tự sinh (nhận được %)', coalesce(v, 'NULL');
  end if;
end $$;

-- ============================================================
-- 2. ĐI QUA CÁC GIAI ĐOẠN PIPELINE — BÌNH THƯỜNG
-- ============================================================
update co_hoi_ban_hang set giai_doan = 'danh_gia' where id = 'c0000000-0000-0000-0000-000000000010';
update co_hoi_ban_hang set giai_doan = 'bao_gia' where id = 'c0000000-0000-0000-0000-000000000010';
update co_hoi_ban_hang set giai_doan = 'dam_phan' where id = 'c0000000-0000-0000-0000-000000000010';

do $$
declare v text;
begin
  select giai_doan into v from co_hoi_ban_hang where id = 'c0000000-0000-0000-0000-000000000010';
  if v <> 'dam_phan' then
    raise exception 'FAIL: giai đoạn = % (mong đợi dam_phan)', v;
  end if;
end $$;

-- ============================================================
-- 3. PIPELINE VIEW TÍNH ĐÚNG GIÁ TRỊ CÓ TRỌNG SỐ
-- ============================================================
do $$
declare v_so int; v_gia_tri numeric; v_trong_so numeric;
begin
  select so_co_hoi, tong_gia_tri, gia_tri_co_trong_so
    into v_so, v_gia_tri, v_trong_so
  from pipeline_ban_hang where giai_doan = 'dam_phan';

  if v_so <> 1 or v_gia_tri <> 5000000 then
    raise exception 'FAIL: pipeline_ban_hang sai — so_co_hoi=% tong_gia_tri=%', v_so, v_gia_tri;
  end if;
  -- xác suất mặc định 20% -> trọng số = 5,000,000 * 20% = 1,000,000
  if v_trong_so <> 1000000 then
    raise exception 'FAIL: giá trị có trọng số = % (mong đợi 1000000)', v_trong_so;
  end if;
end $$;

-- ============================================================
-- 4. CHỐT THÀNH CÔNG — SAU ĐÓ KHÔNG ĐƯỢC ĐỔI GIAI ĐOẠN NỮA
-- ============================================================
update co_hoi_ban_hang set giai_doan = 'thanh_cong' where id = 'c0000000-0000-0000-0000-000000000010';

do $$
declare v_loi boolean := false;
begin
  begin
    update co_hoi_ban_hang set giai_doan = 'danh_gia' where id = 'c0000000-0000-0000-0000-000000000010';
  exception when check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: đổi được giai đoạn của cơ hội đã CHỐT (phải bị khoá)';
  end if;
end $$;

-- Cơ hội đã chốt phải biến mất khỏi pipeline (không còn "đang mở")
do $$
declare v int;
begin
  select count(*) into v from pipeline_ban_hang where giai_doan = 'dam_phan';
  if v <> 0 then
    raise exception 'FAIL: cơ hội đã chốt vẫn còn hiện trong pipeline đang mở';
  end if;
end $$;

-- ============================================================
-- 5. LỊCH SỬ CHĂM SÓC + LỊCH HẸN SẮP TỚI
-- ============================================================
insert into hoat_dong_cham_soc
  (khach_hang_b2b_id, co_hoi_id, loai_hoat_dong, noi_dung, nguoi_thuc_hien_id, ngay_hen_tiep_theo)
values
  ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000010',
   'goi_dien', 'Gọi xác nhận đơn hàng', 'c0000000-0000-0000-0000-000000000002',
   current_date + 3);

do $$
declare v int;
begin
  select count(*) into v from lich_hen_cham_soc_sap_toi
   where khach_hang_b2b_id = 'c0000000-0000-0000-0000-000000000001';
  if v <> 1 then
    raise exception 'FAIL: lịch hẹn sắp tới không hiện — thấy % dòng (mong đợi 1)', v;
  end if;
end $$;

-- Hẹn trong quá khứ không được hiện trong "sắp tới"
insert into hoat_dong_cham_soc
  (khach_hang_b2b_id, loai_hoat_dong, noi_dung, ngay_hen_tiep_theo)
values
  ('c0000000-0000-0000-0000-000000000001', 'email', 'Đã liên hệ tuần trước', current_date - 5);

do $$
declare v int;
begin
  select count(*) into v from lich_hen_cham_soc_sap_toi
   where khach_hang_b2b_id = 'c0000000-0000-0000-0000-000000000001';
  if v <> 1 then
    raise exception 'FAIL: lịch hẹn quá khứ bị lẫn vào "sắp tới" — thấy % dòng (mong đợi vẫn 1)', v;
  end if;
end $$;

do $$ begin raise notice '✅ TẤT CẢ KIỂM TRA SALE/CRM ĐỀU ĐẠT'; end $$;

rollback;
