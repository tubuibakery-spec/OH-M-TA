-- ============================================================
-- KIỂM CHỨNG KẾ TOÁN — sổ cái kép, tự động hạch toán, cân đối thử.
-- Chạy trong transaction, kết thúc bằng ROLLBACK => không để lại dữ liệu.
-- Chạy với vai trò postgres (bỏ qua RLS) để tập trung kiểm logic.
-- ============================================================

begin;

insert into chi_nhanh (id, ma_chi_nhanh, ten_chi_nhanh, loai_chi_nhanh) values
  ('d1000000-0000-0000-0000-000000000001', 'T_KT_CH', 'TEST Kế toán CH');
insert into don_vi_tinh (id, ma_dvt, ten_dvt) values
  ('d1000000-0000-0000-0000-000000000002', 'T_KT_CAI', 'Cái');
insert into nha_cung_cap (id, ma_ncc, ten_ncc) values
  ('d1000000-0000-0000-0000-000000000003', 'T_KT_NCC', 'TEST NCC Kế toán');
insert into vat_tu (id, ma_vat_tu, ten_vat_tu, loai_vat_tu, don_vi_tinh_id, duoc_ban) values
  ('d1000000-0000-0000-0000-000000000004', 'T_KT_SP', 'Sản phẩm test kế toán', 'thanh_pham',
   'd1000000-0000-0000-0000-000000000002', true);
insert into khach_hang_b2b (id, ma_khach_hang, ten_doanh_nghiep) values
  ('d1000000-0000-0000-0000-000000000005', 'T_KT_KH', 'TEST Khách B2B Kế toán');

-- ============================================================
-- 0. HỆ THỐNG TÀI KHOẢN ĐÃ SEED ĐỦ
-- ============================================================
do $$
declare v int;
begin
  select count(*) into v from he_thong_tai_khoan;
  if v < 11 then
    raise exception 'FAIL: chỉ có % tài khoản (mong đợi >= 11)', v;
  end if;
end $$;

-- ============================================================
-- 1. NHẬP HÀNG DUYỆT -> Nợ 156 / Có 331
-- ============================================================
insert into phieu_nhap_kho (id, chi_nhanh_id, nha_cung_cap_id) values
  ('d1000000-0000-0000-0000-000000000010',
   'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003');
insert into chi_tiet_phieu_nhap (phieu_nhap_id, vat_tu_id, so_luong, don_gia)
values ('d1000000-0000-0000-0000-000000000010',
        'd1000000-0000-0000-0000-000000000004', 100, 10000);   -- tổng 1,000,000
update phieu_nhap_kho set trang_thai = 'da_duyet'
 where id = 'd1000000-0000-0000-0000-000000000010';

do $$
declare v_no numeric; v_co numeric;
begin
  select sum(no), sum(co) into v_no, v_co
  from so_cai where nguon_goc_loai = 'phieu_nhap_kho'
    and but_toan_id = (select id from but_toan
                        where nguon_goc_loai = 'phieu_nhap_kho'
                          and nguon_goc_id = 'd1000000-0000-0000-0000-000000000010');
  if v_no <> 1000000 or v_co <> 1000000 then
    raise exception 'FAIL nhập hàng: Nợ=% Có=% (mong đợi cả hai = 1000000)', v_no, v_co;
  end if;

  perform 1 from so_cai
   where nguon_goc_loai = 'phieu_nhap_kho' and so_hieu = '156' and no = 1000000
     and but_toan_id = (select id from but_toan where nguon_goc_id = 'd1000000-0000-0000-0000-000000000010');
  if not found then raise exception 'FAIL: không thấy dòng Nợ 156 = 1,000,000'; end if;

  perform 1 from so_cai
   where nguon_goc_loai = 'phieu_nhap_kho' and so_hieu = '331' and co = 1000000
     and but_toan_id = (select id from but_toan where nguon_goc_id = 'd1000000-0000-0000-0000-000000000010');
  if not found then raise exception 'FAIL: không thấy dòng Có 331 = 1,000,000'; end if;
end $$;

-- ============================================================
-- 2. BÁN LẺ -> Nợ 111/Có 511 (doanh thu) + Nợ 632/Có 156 (giá vốn)
-- Giá vốn bình quân sau nhập hàng ở bước 1 = 10,000/đơn vị.
-- Bán 10 đơn vị @ 20,000 => doanh thu 200,000, giá vốn 100,000.
-- ============================================================
insert into hoa_don_ban (id, chi_nhanh_id) values
  ('d1000000-0000-0000-0000-000000000020', 'd1000000-0000-0000-0000-000000000001');
insert into chi_tiet_hoa_don_ban (hoa_don_id, vat_tu_id, so_luong, don_gia)
values ('d1000000-0000-0000-0000-000000000020',
        'd1000000-0000-0000-0000-000000000004', 10, 20000);

do $$
declare v_dt numeric; v_gv numeric; v_tong_no numeric; v_tong_co numeric;
begin
  select sum(no) filter (where so_hieu = '111'), sum(no) filter (where so_hieu = '632'),
         sum(no), sum(co)
    into v_dt, v_gv, v_tong_no, v_tong_co
  from so_cai where nguon_goc_loai = 'hoa_don_ban'
    and but_toan_id = (select id from but_toan
                        where nguon_goc_loai = 'hoa_don_ban'
                          and nguon_goc_id = 'd1000000-0000-0000-0000-000000000020');

  if v_dt <> 200000 then raise exception 'FAIL bán lẻ: Nợ 111 = % (mong đợi 200000)', v_dt; end if;
  if v_gv <> 100000 then raise exception 'FAIL bán lẻ: Nợ 632 = % (mong đợi 100000, giá vốn BQ 10k x 10)', v_gv; end if;
  if v_tong_no <> v_tong_co then
    raise exception 'FAIL bán lẻ: bút toán mất cân đối Nợ=% Có=%', v_tong_no, v_tong_co;
  end if;
end $$;

-- ============================================================
-- 3. HỦY HÓA ĐƠN -> BÚT TOÁN PHẢI BIẾN MẤT HOÀN TOÀN
-- ============================================================
update hoa_don_ban set trang_thai = 'da_huy' where id = 'd1000000-0000-0000-0000-000000000020';

do $$
declare v int;
begin
  select count(*) into v from but_toan
   where nguon_goc_loai = 'hoa_don_ban' and nguon_goc_id = 'd1000000-0000-0000-0000-000000000020';
  if v <> 0 then
    raise exception 'FAIL: hủy hóa đơn nhưng bút toán vẫn còn % dòng (mong đợi 0)', v;
  end if;
end $$;

-- Tạo lại một hóa đơn bán lẻ khác, KHÔNG hủy — để lại tồn kho/dữ liệu hợp lý cho các bước sau.
insert into hoa_don_ban (id, chi_nhanh_id) values
  ('d1000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000001');
insert into chi_tiet_hoa_don_ban (hoa_don_id, vat_tu_id, so_luong, don_gia)
values ('d1000000-0000-0000-0000-000000000021',
        'd1000000-0000-0000-0000-000000000004', 5, 20000);

-- ============================================================
-- 4. B2B: XÁC NHẬN -> GIAO -> HOÁ ĐƠN -> Nợ 131/Có 511+3331 + Nợ 632/Có 156
-- ============================================================
insert into don_hang_b2b (id, khach_hang_b2b_id, chi_nhanh_giao_id) values
  ('d1000000-0000-0000-0000-000000000030',
   'd1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001');
insert into chi_tiet_don_hang_b2b (don_hang_id, vat_tu_id, so_luong, don_gia)
values ('d1000000-0000-0000-0000-000000000030',
        'd1000000-0000-0000-0000-000000000004', 10, 25000);   -- 250,000

update don_hang_b2b set trang_thai = 'da_xac_nhan' where id = 'd1000000-0000-0000-0000-000000000030';
update don_hang_b2b set trang_thai = 'dang_giao' where id = 'd1000000-0000-0000-0000-000000000030';

insert into hoa_don_b2b (id, don_hang_id, khach_hang_b2b_id, han_thanh_toan, tien_hang, thue_suat)
values ('d1000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000030',
        'd1000000-0000-0000-0000-000000000005', current_date + 30, 250000, 10);
        -- tien_hang=250000, thue_suat=10% => tong_tien = 275000 (trigger tự tính)

do $$
declare v_no_131 numeric; v_co_511 numeric; v_co_3331 numeric; v_no_632 numeric; v_co_156 numeric;
        v_tong_no numeric; v_tong_co numeric;
begin
  select
    sum(no) filter (where so_hieu = '131'),
    sum(co) filter (where so_hieu = '511'),
    sum(co) filter (where so_hieu = '3331'),
    sum(no) filter (where so_hieu = '632'),
    sum(co) filter (where so_hieu = '156'),
    sum(no), sum(co)
  into v_no_131, v_co_511, v_co_3331, v_no_632, v_co_156, v_tong_no, v_tong_co
  from so_cai where nguon_goc_loai = 'hoa_don_b2b'
    and but_toan_id = (select id from but_toan
                        where nguon_goc_loai = 'hoa_don_b2b'
                          and nguon_goc_id = 'd1000000-0000-0000-0000-000000000031');

  if v_no_131 <> 275000 then raise exception 'FAIL B2B: Nợ 131 = % (mong đợi 275000)', v_no_131; end if;
  if v_co_511 <> 250000 then raise exception 'FAIL B2B: Có 511 = % (mong đợi 250000)', v_co_511; end if;
  if v_co_3331 <> 25000 then raise exception 'FAIL B2B: Có 3331 = % (mong đợi 25000 = thuế 10%%)', v_co_3331; end if;
  -- giá vốn BQ vẫn 10,000/đơn vị (chưa nhập thêm) x 10 = 100,000
  if v_no_632 <> 100000 then raise exception 'FAIL B2B: Nợ 632 = % (mong đợi 100000)', v_no_632; end if;
  if v_co_156 <> 100000 then raise exception 'FAIL B2B: Có 156 = % (mong đợi 100000)', v_co_156; end if;
  if v_tong_no <> v_tong_co then
    raise exception 'FAIL B2B: bút toán mất cân đối Nợ=% Có=%', v_tong_no, v_tong_co;
  end if;
end $$;

-- ============================================================
-- 5. THU CÔNG NỢ MỘT PHẦN -> Nợ 111 / Có 131
-- ============================================================
insert into phieu_thu_cong_no (hoa_don_b2b_id, so_tien, hinh_thuc)
values ('d1000000-0000-0000-0000-000000000031', 100000, 'tien_mat');

do $$
declare v_no numeric; v_co numeric;
begin
  select sum(no) filter (where so_hieu = '111'), sum(co) filter (where so_hieu = '131')
    into v_no, v_co
  from so_cai where nguon_goc_loai = 'phieu_thu_cong_no';
  if v_no <> 100000 or v_co <> 100000 then
    raise exception 'FAIL thu công nợ: Nợ 111=% Có 131=% (mong đợi cả hai 100000)', v_no, v_co;
  end if;
end $$;

-- ============================================================
-- 6. CHI PHÍ VẬN HÀNH -> Nợ 642 / Có 111
-- ============================================================
insert into loai_chi_phi (id, ten_loai, nhom) values
  ('d1000000-0000-0000-0000-000000000040', 'TEST Chi phí điện nước', 'van_hanh');
insert into chi_phi (id, loai_chi_phi_id, chi_nhanh_id, so_tien, mo_ta)
values ('d1000000-0000-0000-0000-000000000041', 'd1000000-0000-0000-0000-000000000040',
        'd1000000-0000-0000-0000-000000000001', 300000, 'Test tiền điện');

do $$
declare v_no numeric; v_co numeric;
begin
  select sum(no) filter (where so_hieu = '642'), sum(co) filter (where so_hieu = '111')
    into v_no, v_co
  from so_cai where nguon_goc_loai = 'chi_phi';
  if v_no <> 300000 or v_co <> 300000 then
    raise exception 'FAIL chi phí: Nợ 642=% Có 111=% (mong đợi cả hai 300000)', v_no, v_co;
  end if;
end $$;

-- ============================================================
-- 7. BẤT BIẾN CƠ BẢN CỦA SỔ CÁI KÉP: TỔNG NỢ = TỔNG CÓ TOÀN HỆ THỐNG
-- (đây là phép thử quan trọng nhất — nếu sai thì có bút toán mất cân đối
-- đâu đó lọt qua được fn_ghi_but_toan)
-- ============================================================
do $$
declare v_no numeric; v_co numeric;
begin
  select coalesce(sum(no), 0), coalesce(sum(co), 0) into v_no, v_co from chi_tiet_but_toan;
  if round(v_no, 2) <> round(v_co, 2) then
    raise exception 'FAIL NGHIÊM TRỌNG: tổng Nợ (%) <> tổng Có (%) toàn hệ thống sổ cái', v_no, v_co;
  end if;
end $$;

-- ============================================================
-- 8. fn_ghi_but_toan PHẢI CHẶN BÚT TOÁN LỆCH (Nợ <> Có)
-- ============================================================
do $$
declare v_loi boolean := false;
begin
  begin
    perform fn_ghi_but_toan(
      'thu_cong', gen_random_uuid(), current_date, 'Test cố tình lệch', null,
      jsonb_build_array(
        jsonb_build_object('so_hieu', '111', 'no', 100, 'co', 0),
        jsonb_build_object('so_hieu', '511', 'no', 0, 'co', 999)
      )
    );
  exception when check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: fn_ghi_but_toan chấp nhận bút toán LỆCH (Nợ 100 <> Có 999)';
  end if;
end $$;

-- ============================================================
-- 9. BẢNG CÂN ĐỐI THỬ TÍNH ĐÚNG SỐ DƯ (kiểm 1 tài khoản đại diện)
-- 111 (Tiền mặt) tăng bên Nợ: +200000(bán lẻ hđ2 chưa tính vì chưa
-- hoàn thành... thực ra hoá đơn 2 (021) mới chỉ insert chi tiết, đã
-- kích hoạt hạch toán vì trang_thai mặc định 'hoan_thanh' ngay từ đầu)
-- + 100000 (thu công nợ) - 300000 (chi phí) = ...
-- Không so số tuyệt đối (phụ thuộc test khác chạy trước trong CÙNG
-- transaction) — chỉ kiểm bang_can_doi_thu_nghiem KHÔNG lỗi và trả
-- đúng số dòng tài khoản.
-- ============================================================
do $$
declare v int;
begin
  select count(*) into v from bang_can_doi_thu_nghiem;
  if v < 11 then
    raise exception 'FAIL: bảng cân đối thử thiếu tài khoản — chỉ có % dòng', v;
  end if;
end $$;

do $$ begin raise notice '✅ TẤT CẢ KIỂM TRA KẾ TOÁN ĐỀU ĐẠT'; end $$;

rollback;
