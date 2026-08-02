-- ============================================================
-- KIỂM CHỨNG NGHIỆP VỤ — Tier 1/2/3
--
-- Dán vào Supabase SQL Editor rồi Run. Chạy trong transaction và
-- kết thúc bằng ROLLBACK => không để lại dữ liệu.
-- Chạy với vai trò postgres (bỏ qua RLS) để tập trung kiểm logic;
-- phần cô lập chi nhánh đã có tests/kiem_tra_rls.sql lo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Dữ liệu nền
-- ------------------------------------------------------------
insert into chi_nhanh (id, ma_chi_nhanh, ten_chi_nhanh, loai_chi_nhanh) values
  ('a0000000-0000-0000-0000-000000000001', 'T_CH', 'TEST Cửa hàng', 'cua_hang');

insert into don_vi_tinh (id, ma_dvt, ten_dvt) values
  ('a0000000-0000-0000-0000-000000000002', 'T_CAI', 'Cái');

insert into nha_cung_cap (id, ma_ncc, ten_ncc) values
  ('a0000000-0000-0000-0000-000000000003', 'T_NCC', 'TEST NCC');

-- Thành phẩm bán được (mô hình BTC → cửa hàng)
insert into vat_tu (id, ma_vat_tu, ten_vat_tu, loai_vat_tu, don_vi_tinh_id, duoc_ban) values
  ('a0000000-0000-0000-0000-000000000010', 'T_BANH', 'Bánh test', 'thanh_pham',
   'a0000000-0000-0000-0000-000000000002', true);

-- Nguyên vật liệu (KHÔNG được bán)
insert into vat_tu (id, ma_vat_tu, ten_vat_tu, loai_vat_tu, don_vi_tinh_id) values
  ('a0000000-0000-0000-0000-000000000011', 'T_BOT', 'Bột test', 'nguyen_vat_lieu',
   'a0000000-0000-0000-0000-000000000002');

-- ============================================================
-- 1. SỐ CHỨNG TỪ TỰ SINH (Tier 3)
-- ============================================================
insert into phieu_nhap_kho (id, chi_nhanh_id, nha_cung_cap_id) values
  ('a0000000-0000-0000-0000-000000000020',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003');

do $$
declare v text;
begin
  select so_phieu into v from phieu_nhap_kho where id = 'a0000000-0000-0000-0000-000000000020';
  if v is null or v not like 'PN-%' then
    raise exception 'FAIL: số phiếu không tự sinh (nhận được %)', coalesce(v, 'NULL');
  end if;
end $$;

-- ============================================================
-- 2. TỔNG TIỀN TỰ CỘNG DỒN (Tier 1)
-- ============================================================
insert into chi_tiet_phieu_nhap (phieu_nhap_id, vat_tu_id, so_luong, don_gia, han_su_dung)
values ('a0000000-0000-0000-0000-000000000020',
        'a0000000-0000-0000-0000-000000000010', 10, 10000, current_date + 10);

do $$
declare v numeric;
begin
  select tong_tien into v from phieu_nhap_kho where id = 'a0000000-0000-0000-0000-000000000020';
  if v <> 100000 then
    raise exception 'FAIL: tổng tiền phiếu nhập = % (mong đợi 100000)', v;
  end if;
end $$;

-- ============================================================
-- 3. LÔ HÀNG TỰ TẠO KHI DUYỆT + GIÁ VỐN BÌNH QUÂN (Tier 1)
-- ============================================================
update phieu_nhap_kho set trang_thai = 'da_duyet'
 where id = 'a0000000-0000-0000-0000-000000000020';

-- Phiếu nhập thứ hai: HSD SỚM HƠN, giá cao hơn
insert into phieu_nhap_kho (id, chi_nhanh_id, nha_cung_cap_id) values
  ('a0000000-0000-0000-0000-000000000021',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003');
insert into chi_tiet_phieu_nhap (phieu_nhap_id, vat_tu_id, so_luong, don_gia, han_su_dung)
values ('a0000000-0000-0000-0000-000000000021',
        'a0000000-0000-0000-0000-000000000010', 10, 12000, current_date + 5);
update phieu_nhap_kho set trang_thai = 'da_duyet'
 where id = 'a0000000-0000-0000-0000-000000000021';

do $$
declare v_ton numeric; v_gia numeric; v_so_lo int;
begin
  select so_luong_ton, gia_von_binh_quan into v_ton, v_gia
  from ton_kho
  where chi_nhanh_id = 'a0000000-0000-0000-0000-000000000001'
    and vat_tu_id = 'a0000000-0000-0000-0000-000000000010';

  if v_ton <> 20 then
    raise exception 'FAIL: tồn = % (mong đợi 20)', v_ton;
  end if;
  -- (10×10000 + 10×12000) / 20 = 11000
  if round(v_gia) <> 11000 then
    raise exception 'FAIL: giá vốn bình quân = % (mong đợi 11000)', v_gia;
  end if;

  select count(*) into v_so_lo from ton_kho_lo
   where vat_tu_id = 'a0000000-0000-0000-0000-000000000010' and so_luong_ton > 0;
  if v_so_lo <> 2 then
    raise exception 'FAIL: có % lô tồn (mong đợi 2 — lô phải tự tạo khi duyệt phiếu nhập)', v_so_lo;
  end if;
end $$;

-- ============================================================
-- 4. FEFO — LÔ HẾT HẠN TRƯỚC PHẢI XUẤT TRƯỚC (Tier 1)
-- ============================================================
insert into hoa_don_ban (id, chi_nhanh_id) values
  ('a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001');

insert into chi_tiet_hoa_don_ban (hoa_don_id, vat_tu_id, so_luong, don_gia)
values ('a0000000-0000-0000-0000-000000000030',
        'a0000000-0000-0000-0000-000000000010', 12, 20000);

do $$
declare v_som numeric; v_muon numeric; v_ton numeric;
begin
  -- Lô HSD sớm (+5 ngày) phải hết sạch
  select tkl.so_luong_ton into v_som
  from ton_kho_lo tkl join lo_hang lh on lh.id = tkl.lo_hang_id
  where lh.han_su_dung = current_date + 5;

  -- Lô HSD muộn (+10 ngày) còn 8
  select tkl.so_luong_ton into v_muon
  from ton_kho_lo tkl join lo_hang lh on lh.id = tkl.lo_hang_id
  where lh.han_su_dung = current_date + 10;

  if coalesce(v_som, -1) <> 0 then
    raise exception 'FAIL FEFO: lô hết hạn sớm còn % (mong đợi 0)', v_som;
  end if;
  if coalesce(v_muon, -1) <> 8 then
    raise exception 'FAIL FEFO: lô hết hạn muộn còn % (mong đợi 8)', v_muon;
  end if;

  select so_luong_ton into v_ton from ton_kho
   where vat_tu_id = 'a0000000-0000-0000-0000-000000000010';
  if v_ton <> 8 then
    raise exception 'FAIL: tồn tổng = % (mong đợi 8)', v_ton;
  end if;
end $$;

-- Tổng tiền hóa đơn tự cộng
do $$
declare v numeric;
begin
  select tong_tien_hang into v from hoa_don_ban
   where id = 'a0000000-0000-0000-0000-000000000030';
  if v <> 240000 then
    raise exception 'FAIL: tổng tiền hóa đơn = % (mong đợi 240000)', v;
  end if;
end $$;

-- ============================================================
-- 5. HỦY HÓA ĐƠN PHẢI HOÀN KHO (Tier 1 — bản gốc bỏ sót)
-- ============================================================
update hoa_don_ban set trang_thai = 'da_huy'
 where id = 'a0000000-0000-0000-0000-000000000030';

do $$
declare v numeric;
begin
  select so_luong_ton into v from ton_kho
   where vat_tu_id = 'a0000000-0000-0000-0000-000000000010';
  if v <> 20 then
    raise exception 'FAIL: hủy hóa đơn không hoàn kho — tồn = % (mong đợi 20)', v;
  end if;
end $$;

-- ============================================================
-- 6. CHẶN BÁN NGUYÊN VẬT LIỆU (Tier 1 — mô hình BTC → cửa hàng)
-- ============================================================
do $$
declare v_loi boolean := false;
begin
  begin
    insert into hoa_don_ban (id, chi_nhanh_id) values
      ('a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001');
    insert into chi_tiet_hoa_don_ban (hoa_don_id, vat_tu_id, so_luong, don_gia)
    values ('a0000000-0000-0000-0000-000000000031',
            'a0000000-0000-0000-0000-000000000011', 1, 5000);
  exception when check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: bán được nguyên vật liệu (phải bị chặn)';
  end if;
end $$;

-- ============================================================
-- 7. KIỂM KÊ (Tier 2)
-- ============================================================
insert into phieu_kiem_ke (id, chi_nhanh_id) values
  ('a0000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000001');

select fn_nap_kiem_ke('a0000000-0000-0000-0000-000000000040');

do $$
declare v int;
begin
  select count(*) into v from chi_tiet_phieu_kiem_ke
   where phieu_kiem_ke_id = 'a0000000-0000-0000-0000-000000000040';
  if v = 0 then
    raise exception 'FAIL: nạp kiểm kê không chốt được dòng tồn nào';
  end if;
end $$;

-- Đếm thực tế thiếu 3 ở lô HSD muộn
update chi_tiet_phieu_kiem_ke ct
   set so_luong_thuc_te = ct.so_luong_he_thong - 3
  from lo_hang lh
 where ct.phieu_kiem_ke_id = 'a0000000-0000-0000-0000-000000000040'
   and lh.id = ct.lo_hang_id
   and lh.han_su_dung = current_date + 10;

-- Các dòng còn lại: đếm đúng
update chi_tiet_phieu_kiem_ke
   set so_luong_thuc_te = so_luong_he_thong
 where phieu_kiem_ke_id = 'a0000000-0000-0000-0000-000000000040'
   and so_luong_thuc_te is null;

update phieu_kiem_ke set trang_thai = 'da_duyet'
 where id = 'a0000000-0000-0000-0000-000000000040';

do $$
declare v numeric;
begin
  select so_luong_ton into v from ton_kho
   where vat_tu_id = 'a0000000-0000-0000-0000-000000000010';
  if v <> 17 then
    raise exception 'FAIL: duyệt kiểm kê không áp chênh lệch — tồn = % (mong đợi 17)', v;
  end if;
end $$;

-- ============================================================
-- 8. ĐƠN ĐẶT NCC + HÀNG ĐANG VỀ (Tier 2)
-- ============================================================
insert into don_dat_hang_ncc (id, nha_cung_cap_id, chi_nhanh_id, trang_thai) values
  ('a0000000-0000-0000-0000-000000000050',
   'a0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001', 'da_gui');

insert into chi_tiet_don_dat_hang_ncc
  (don_dat_hang_id, vat_tu_id, so_luong_mua, he_so_quy_doi, don_gia)
values ('a0000000-0000-0000-0000-000000000050',
        'a0000000-0000-0000-0000-000000000010', 5, 2, 20000);   -- 5 thùng × 2 = 10 cái

do $$
declare v numeric; v_tong numeric;
begin
  select so_luong_dang_ve into v from hang_dang_ve
   where vat_tu_id = 'a0000000-0000-0000-0000-000000000010';
  if coalesce(v, 0) <> 10 then
    raise exception 'FAIL: hàng đang về = % (mong đợi 10)', v;
  end if;

  select tong_tien into v_tong from don_dat_hang_ncc
   where id = 'a0000000-0000-0000-0000-000000000050';
  if v_tong <> 100000 then
    raise exception 'FAIL: tổng tiền đơn đặt = % (mong đợi 100000)', v_tong;
  end if;
end $$;

-- Nhận đủ hàng => đơn chuyển sang hoàn thành, hết "đang về"
insert into phieu_nhap_kho (id, chi_nhanh_id, nha_cung_cap_id, don_dat_hang_id) values
  ('a0000000-0000-0000-0000-000000000051',
   'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000050');
insert into chi_tiet_phieu_nhap (phieu_nhap_id, vat_tu_id, so_luong, don_gia)
values ('a0000000-0000-0000-0000-000000000051',
        'a0000000-0000-0000-0000-000000000010', 10, 20000);
update phieu_nhap_kho set trang_thai = 'da_duyet'
 where id = 'a0000000-0000-0000-0000-000000000051';

do $$
declare v_tt text; v_ve numeric;
begin
  select trang_thai into v_tt from don_dat_hang_ncc
   where id = 'a0000000-0000-0000-0000-000000000050';
  if v_tt <> 'hoan_thanh' then
    raise exception 'FAIL: đơn đặt vẫn ở trạng thái % sau khi nhận đủ', v_tt;
  end if;

  select coalesce(sum(so_luong_dang_ve), 0) into v_ve from hang_dang_ve
   where vat_tu_id = 'a0000000-0000-0000-0000-000000000010';
  if v_ve <> 0 then
    raise exception 'FAIL: vẫn còn % hàng đang về sau khi nhận đủ', v_ve;
  end if;
end $$;

-- ============================================================
-- 9. CÔNG NỢ B2B HAI CHIỀU (Tier 1 — bản gốc chỉ tăng)
-- ============================================================
insert into khach_hang_b2b (id, ma_khach_hang, ten_doanh_nghiep, han_muc_cong_no) values
  ('a0000000-0000-0000-0000-000000000060', 'T_KH', 'TEST Khách B2B', 1000000);

insert into hoa_don_b2b (id, khach_hang_b2b_id, han_thanh_toan, tien_hang) values
  ('a0000000-0000-0000-0000-000000000061', 'a0000000-0000-0000-0000-000000000060',
   current_date + 30, 500000);

do $$
declare v numeric;
begin
  select du_no_hien_tai into v from khach_hang_b2b
   where id = 'a0000000-0000-0000-0000-000000000060';
  if v <> 500000 then
    raise exception 'FAIL: dư nợ sau khi xuất hóa đơn = % (mong đợi 500000)', v;
  end if;
end $$;

-- Thu một phần
insert into phieu_thu_cong_no (hoa_don_b2b_id, so_tien, hinh_thuc) values
  ('a0000000-0000-0000-0000-000000000061', 200000, 'tien_mat');

do $$
declare v numeric; v_tt text;
begin
  select du_no_hien_tai into v from khach_hang_b2b
   where id = 'a0000000-0000-0000-0000-000000000060';
  if v <> 300000 then
    raise exception 'FAIL: dư nợ sau khi thu 200k = % (mong đợi 300000)', v;
  end if;

  select trang_thai_thanh_toan into v_tt from hoa_don_b2b
   where id = 'a0000000-0000-0000-0000-000000000061';
  if v_tt <> 'thanh_toan_mot_phan' then
    raise exception 'FAIL: trạng thái thanh toán = % (mong đợi thanh_toan_mot_phan)', v_tt;
  end if;
end $$;

-- Hủy hóa đơn => dư nợ phải về 0 (đây là chỗ bản gốc bị trôi vĩnh viễn)
update hoa_don_b2b set trang_thai = 'da_huy'
 where id = 'a0000000-0000-0000-0000-000000000061';

do $$
declare v numeric;
begin
  select du_no_hien_tai into v from khach_hang_b2b
   where id = 'a0000000-0000-0000-0000-000000000060';
  if v <> 0 then
    raise exception 'FAIL: hủy hóa đơn nhưng dư nợ vẫn = % (mong đợi 0)', v;
  end if;
end $$;

-- Vượt hạn mức phải bị chặn
do $$
declare v_loi boolean := false;
begin
  begin
    insert into hoa_don_b2b (khach_hang_b2b_id, han_thanh_toan, tien_hang)
    values ('a0000000-0000-0000-0000-000000000060', current_date + 30, 2000000);
  exception when check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: vượt hạn mức công nợ nhưng vẫn xuất được hóa đơn';
  end if;
end $$;

-- ============================================================
-- 10. VÒNG LẶP CÔNG THỨC BỊ CHẶN (Tier 3)
-- ============================================================
insert into vat_tu (id, ma_vat_tu, ten_vat_tu, loai_vat_tu, don_vi_tinh_id) values
  ('a0000000-0000-0000-0000-000000000070', 'T_BTP_A', 'BTP A', 'ban_thanh_pham',
   'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000071', 'T_BTP_B', 'BTP B', 'ban_thanh_pham',
   'a0000000-0000-0000-0000-000000000002');

insert into cong_thuc_san_xuat (id, vat_tu_dau_ra_id, ten_cong_thuc, so_luong_dau_ra) values
  ('a0000000-0000-0000-0000-000000000072', 'a0000000-0000-0000-0000-000000000070', 'CT A', 1),
  ('a0000000-0000-0000-0000-000000000073', 'a0000000-0000-0000-0000-000000000071', 'CT B', 1);

-- A cần B — hợp lệ
insert into chi_tiet_cong_thuc (cong_thuc_id, vat_tu_id, so_luong_dinh_muc) values
  ('a0000000-0000-0000-0000-000000000072', 'a0000000-0000-0000-0000-000000000071', 1);

-- B cần A — tạo vòng lặp, phải bị chặn
do $$
declare v_loi boolean := false;
begin
  begin
    insert into chi_tiet_cong_thuc (cong_thuc_id, vat_tu_id, so_luong_dinh_muc) values
      ('a0000000-0000-0000-0000-000000000073', 'a0000000-0000-0000-0000-000000000070', 1);
  exception when check_violation then
    v_loi := true;
  end;
  if not v_loi then
    raise exception 'FAIL: tạo được vòng lặp công thức A→B→A';
  end if;
end $$;

-- ============================================================
-- 11. NHẬT KÝ HỆ THỐNG CÓ GHI (Tier 1)
-- ============================================================
do $$
declare v int;
begin
  select count(*) into v from nhat_ky_he_thong
   where bang_du_lieu in ('phieu_nhap_kho', 'hoa_don_ban', 'hoa_don_b2b');
  if v = 0 then
    raise exception 'FAIL: nhat_ky_he_thong không ghi được dòng nào';
  end if;
end $$;

do $$ begin raise notice '✅ TẤT CẢ KIỂM TRA NGHIỆP VỤ ĐỀU ĐẠT'; end $$;

rollback;
