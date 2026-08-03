-- ============================================================
-- KIỂM CHỨNG MARKETING — chương trình khuyến mãi
-- Chạy trong transaction, kết thúc bằng ROLLBACK => không để lại dữ liệu.
-- ============================================================

begin;

insert into chi_nhanh (id, ma_chi_nhanh, ten_chi_nhanh, loai_chi_nhanh) values
  ('e1000000-0000-0000-0000-000000000001', 'T_MK_CH', 'TEST Marketing CH', 'cua_hang');

-- ============================================================
-- 1. TỰ SINH MÃ CHƯƠNG TRÌNH
-- ============================================================
insert into chuong_trinh_khuyen_mai (id, ten_ctkm, loai_giam, gia_tri_giam, ap_dung_kenh)
values ('e1000000-0000-0000-0000-000000000010', 'Giảm 10% cuối tuần', 'phan_tram', 10, 'ban_le');

do $$
declare v text;
begin
  select ma_ctkm into v from chuong_trinh_khuyen_mai
   where id = 'e1000000-0000-0000-0000-000000000010';
  if v is null or v not like 'KM-%' then
    raise exception 'FAIL: mã chương trình không tự sinh (nhận được %)', coalesce(v, 'NULL');
  end if;
end $$;

-- ============================================================
-- 2. GIẢM % KHÔNG ĐƯỢC VƯỢT 100
-- ============================================================
do $$
declare v_loi boolean := false;
begin
  begin
    insert into chuong_trinh_khuyen_mai (ten_ctkm, loai_giam, gia_tri_giam)
    values ('Test giảm sai', 'phan_tram', 150);
  exception when check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: tạo được chương trình giảm 150%% (phải bị chặn)';
  end if;
end $$;

-- Giảm theo số tiền cố định thì không bị giới hạn 100
insert into chuong_trinh_khuyen_mai (id, ten_ctkm, loai_giam, gia_tri_giam)
values ('e1000000-0000-0000-0000-000000000011', 'Giảm 500k đơn lớn', 'so_tien', 500000);

-- ============================================================
-- 3. LƯU VẾT TRÊN HÓA ĐƠN BÁN LẺ + VIEW HIỆU QUẢ TÍNH ĐÚNG
-- ============================================================
insert into don_vi_tinh (id, ma_dvt, ten_dvt) values
  ('e1000000-0000-0000-0000-000000000002', 'T_MK_CAI', 'Cái');
insert into vat_tu (id, ma_vat_tu, ten_vat_tu, loai_vat_tu, don_vi_tinh_id, duoc_ban) values
  ('e1000000-0000-0000-0000-000000000003', 'T_MK_SP', 'Sản phẩm test marketing', 'thanh_pham',
   'e1000000-0000-0000-0000-000000000002', true);

-- Nhập trước 10 đơn vị để có tồn kho — nếu không, bán hàng ở bước sau
-- sẽ bị fn_capnhat_ton_kho chặn vì không đủ tồn (đúng thiết kế).
insert into nha_cung_cap (id, ma_ncc, ten_ncc) values
  ('e1000000-0000-0000-0000-000000000004', 'T_MK_NCC', 'TEST NCC Marketing');
insert into phieu_nhap_kho (id, chi_nhanh_id, nha_cung_cap_id) values
  ('e1000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000004');
insert into chi_tiet_phieu_nhap (phieu_nhap_id, vat_tu_id, so_luong, don_gia)
values ('e1000000-0000-0000-0000-000000000005',
        'e1000000-0000-0000-0000-000000000003', 10, 100000);
update phieu_nhap_kho set trang_thai = 'da_duyet'
 where id = 'e1000000-0000-0000-0000-000000000005';

insert into hoa_don_ban (id, chi_nhanh_id, giam_gia, khuyen_mai_id) values
  ('e1000000-0000-0000-0000-000000000020', 'e1000000-0000-0000-0000-000000000001',
   20000, 'e1000000-0000-0000-0000-000000000010');
insert into chi_tiet_hoa_don_ban (hoa_don_id, vat_tu_id, so_luong, don_gia)
values ('e1000000-0000-0000-0000-000000000020',
        'e1000000-0000-0000-0000-000000000003', 1, 200000);
-- tong_tien_hang tự cộng = 200000, giam_gia = 20000 => thanh_tien = 180000

do $$
declare v_so int; v_giam numeric; v_dt numeric;
begin
  select so_hoa_don_ban_le, tong_giam_ban_le, doanh_thu_ban_le_sau_giam
    into v_so, v_giam, v_dt
  from hieu_qua_khuyen_mai where khuyen_mai_id = 'e1000000-0000-0000-0000-000000000010';

  if v_so <> 1 then raise exception 'FAIL: so_hoa_don_ban_le = % (mong đợi 1)', v_so; end if;
  if v_giam <> 20000 then raise exception 'FAIL: tong_giam_ban_le = % (mong đợi 20000)', v_giam; end if;
  if v_dt <> 180000 then raise exception 'FAIL: doanh_thu_ban_le_sau_giam = % (mong đợi 180000)', v_dt; end if;
end $$;

do $$ begin raise notice '✅ TẤT CẢ KIỂM TRA MARKETING ĐỀU ĐẠT'; end $$;

rollback;
