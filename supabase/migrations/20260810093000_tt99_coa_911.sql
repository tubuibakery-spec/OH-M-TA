-- ============================================================
-- TT99/2025/TT-BTC — Cập nhật hệ thống tài khoản
--
-- 1. Đổi tên TK 112 theo TT99 (giữ nguyên số hiệu, không ảnh hưởng
--    dữ liệu/view nào vì mọi nơi tham chiếu qua so_hieu).
-- 2. Thêm loại tài khoản mới 'xac_dinh_kqkd' — TT99 xếp "Xác định
--    kết quả kinh doanh" là 1 trong 9 nhóm tài khoản, tách biệt
--    khỏi tài sản/nợ/vốn/doanh thu/chi phí.
-- 3. Thêm TK 911, sửa rpc_ket_chuyen_thang (Đợt 11) để kết chuyển
--    ĐÚNG 2 bước qua 911 (DT/CP -> 911 -> 421) thay vì tắt thẳng
--    DT/CP -> 421 như thiết kế rút gọn ban đầu.
-- ============================================================

update he_thong_tai_khoan set ten_tai_khoan = 'Tiền gửi không kỳ hạn' where so_hieu = '112';

alter table he_thong_tai_khoan drop constraint if exists he_thong_tai_khoan_loai_check;
alter table he_thong_tai_khoan add constraint he_thong_tai_khoan_loai_check
  check (loai in ('tai_san','no_phai_tra','von_chu_so_huu','doanh_thu','chi_phi','xac_dinh_kqkd'));

insert into he_thong_tai_khoan (so_hieu, ten_tai_khoan, loai, ben_no_la_tang) values
  ('911', 'Xác định kết quả kinh doanh', 'xac_dinh_kqkd', true)
on conflict (so_hieu) do nothing;

-- bang_can_doi_ke_toan (loại in tai_san/no_phai_tra/von_chu_so_huu) và
-- bao_cao_lai_lo (loại in doanh_thu/chi_phi) đã tự loại trừ 911 — không
-- cần CREATE OR REPLACE VIEW lại 2 view đó.

create or replace function rpc_ket_chuyen_thang(p_thang date)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_thang date := date_trunc('month', p_thang)::date;
  v_cuoi_thang date := (v_thang + interval '1 month' - interval '1 day')::date;
  v_id uuid;
  v_dong jsonb := '[]'::jsonb;
  v_tong_dt numeric := 0;
  v_tong_cp numeric := 0;
  r record;
begin
  if not bao_mat.co_quyen_moi_noi('tai_chinh', 'duyet') then
    raise exception 'Không có quyền kết chuyển kỳ kế toán.' using errcode = 'insufficient_privilege';
  end if;

  insert into ky_ket_chuyen (thang) values (v_thang)
  on conflict (thang) do update set thang = excluded.thang
  returning but_toan_nguon_id into v_id;

  -- Bước 1: kết chuyển từng TK doanh thu/chi phí về 911
  -- (Nợ TK doanh thu/Có 911 cho phần doanh thu; Nợ 911/Có TK chi phí cho phần chi phí)
  for r in
    select tk.so_hieu, tk.loai,
      case when tk.loai = 'doanh_thu' then sum(ct.co) - sum(ct.no) else sum(ct.no) - sum(ct.co) end as so_tien
    from chi_tiet_but_toan ct
    join but_toan bt on bt.id = ct.but_toan_id
    join he_thong_tai_khoan tk on tk.id = ct.tai_khoan_id
    where tk.loai in ('doanh_thu', 'chi_phi')
      and bt.ngay_hach_toan between v_thang and v_cuoi_thang
      and bt.nguon_goc_loai <> 'ket_chuyen'
    group by tk.so_hieu, tk.loai
    having (case when tk.loai = 'doanh_thu' then sum(ct.co) - sum(ct.no) else sum(ct.no) - sum(ct.co) end) <> 0
  loop
    if r.loai = 'doanh_thu' then
      v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', r.so_hieu, 'no', r.so_tien, 'co', 0));
      v_tong_dt := v_tong_dt + r.so_tien;
    else
      v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', r.so_hieu, 'no', 0, 'co', r.so_tien));
      v_tong_cp := v_tong_cp + r.so_tien;
    end if;
  end loop;

  if v_tong_dt = 0 and v_tong_cp = 0 then
    perform fn_ghi_but_toan('ket_chuyen', v_id, v_cuoi_thang, null, null, null);  -- xóa kết chuyển cũ nếu tháng không còn phát sinh
    return;
  end if;

  -- Đối ứng phía 911 cho bước 1: Có 911 = tổng doanh thu, Nợ 911 = tổng chi phí
  -- (2 dòng riêng — 1 dòng bút toán không được vừa Nợ vừa Có).
  if v_tong_cp > 0 then
    v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', '911', 'no', v_tong_cp, 'co', 0));
  end if;
  if v_tong_dt > 0 then
    v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', '911', 'no', 0, 'co', v_tong_dt));
  end if;

  -- Bước 2: kết chuyển số dư ròng 911 sang 421 (lãi: Nợ 911/Có 421 — lỗ: Nợ 421/Có 911)
  if v_tong_dt > v_tong_cp then
    v_dong := v_dong || jsonb_build_array(
      jsonb_build_object('so_hieu', '911', 'no', v_tong_dt - v_tong_cp, 'co', 0),
      jsonb_build_object('so_hieu', '421', 'no', 0, 'co', v_tong_dt - v_tong_cp));
  elsif v_tong_cp > v_tong_dt then
    v_dong := v_dong || jsonb_build_array(
      jsonb_build_object('so_hieu', '911', 'no', 0, 'co', v_tong_cp - v_tong_dt),
      jsonb_build_object('so_hieu', '421', 'no', v_tong_cp - v_tong_dt, 'co', 0));
  end if;
  -- Sau bước 1+2: tổng Nợ 911 = tổng Có 911 = 2 x max(v_tong_dt, v_tong_cp) -> số dư 911 luôn
  -- về 0 (đúng bản chất tài khoản trung gian). Toàn mảng v_dong vẫn cân Nợ=Có tổng thể
  -- (fn_ghi_but_toan tự raise exception nếu lệch).

  perform fn_ghi_but_toan('ket_chuyen', v_id, v_cuoi_thang,
    'Kết chuyển lãi/lỗ tháng ' || to_char(v_thang, 'MM/YYYY'), null, v_dong);
end;
$$;
