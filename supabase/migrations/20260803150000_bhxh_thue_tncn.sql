-- ============================================================
-- BHXH bắt buộc + thuế TNCN cho Bảng lương
--
-- Chính sách đã chốt với chủ chuỗi:
--   1. Diện đóng BHXH bắt buộc: chỉ nhân viên HĐLĐ chính thức, đã ký
--      đủ 1 tháng tính đến cuối tháng chấm lương.
--   2. Mức lương đóng BHXH = luôn bằng luong_co_ban.
--   3. Thuế TNCN tính đầy đủ theo biểu lũy tiến từng phần + giảm trừ
--      gia cảnh (bản thân + người phụ thuộc).
--
-- thuc_linh trước đây là generated column thuần theo công thức đơn
-- giản (không BHXH/thuế). Công thức mới cần đọc nhan_vien.loai_hop_dong/
-- ngay_ky_hd_chinh_thuc (khác bảng — generated column không cho phép)
-- và có nhiều bước phụ thuộc nhau (BHXH -> thu nhập tính thuế -> thuế
-- TNCN -> thực lĩnh) mà PostgreSQL không cho một generated column tham
-- chiếu một generated column khác. Giải pháp: snapshot 2 trường từ
-- nhan_vien vào bang_luong lúc tạo (giống luong_co_ban đã snapshot sẵn),
-- rồi dùng trigger tính toàn bộ chuỗi phụ thuộc.
-- ============================================================

-- 1a. Mở rộng nhan_vien
alter table nhan_vien
  add column if not exists loai_hop_dong text not null default 'chinh_thuc'
    check (loai_hop_dong in ('thu_viec', 'thoi_vu', 'chinh_thuc')),
  add column if not exists ngay_ky_hd_chinh_thuc date,
  add column if not exists so_nguoi_phu_thuoc int not null default 0
    check (so_nguoi_phu_thuoc >= 0);

-- 1b. Mở rộng bang_luong + bỏ generated expression của thuc_linh
alter table bang_luong
  add column if not exists dien_dong_bhxh boolean not null default false,
  add column if not exists so_nguoi_phu_thuoc int not null default 0,
  add column if not exists luong_dong_bhxh numeric(14,2) not null default 0,
  add column if not exists bhxh_nld numeric(14,2) not null default 0,
  add column if not exists thu_nhap_tinh_thue numeric(14,2) not null default 0,
  add column if not exists thue_tncn numeric(14,2) not null default 0;

-- Giữ nguyên giá trị lịch sử đã lưu, từ nay tính bởi trigger (xem 1d).
alter table bang_luong alter column thuc_linh drop expression;

-- 1c. Thuế TNCN lũy tiến từng phần (biểu 7 bậc, "trừ nhanh" theo bậc
-- 5/10/15/20/25/30/35%, ngưỡng 5-10-18-32-52-80 triệu; giảm trừ bản
-- thân 11tr + 4.4tr/người phụ thuộc). Hard-code như các mức khác trong
-- hệ thống — cần sửa migration nếu luật thay đổi mức.
create or replace function fn_tinh_thue_tncn(p_thu_nhap_tinh_thue numeric)
returns numeric language sql immutable as $$
  select round(case
    when p_thu_nhap_tinh_thue <= 0 then 0
    when p_thu_nhap_tinh_thue <= 5000000 then p_thu_nhap_tinh_thue * 0.05
    when p_thu_nhap_tinh_thue <= 10000000 then p_thu_nhap_tinh_thue * 0.10 - 250000
    when p_thu_nhap_tinh_thue <= 18000000 then p_thu_nhap_tinh_thue * 0.15 - 750000
    when p_thu_nhap_tinh_thue <= 32000000 then p_thu_nhap_tinh_thue * 0.20 - 1650000
    when p_thu_nhap_tinh_thue <= 52000000 then p_thu_nhap_tinh_thue * 0.25 - 3250000
    when p_thu_nhap_tinh_thue <= 80000000 then p_thu_nhap_tinh_thue * 0.30 - 5850000
    else p_thu_nhap_tinh_thue * 0.35 - 9850000
  end)
$$;

-- 1d. Trigger tính toàn bộ chuỗi phụ thuộc (thay vai trò generated column cũ)
create or replace function trg_fn_bang_luong_tinh_luong() returns trigger as $$
declare
  v_luong_thang numeric;
  v_giam_tru numeric;
begin
  v_luong_thang := round(new.luong_co_ban * new.so_ngay_cong / new.so_ngay_chuan) + new.phu_cap - new.khau_tru;

  if new.dien_dong_bhxh then
    new.luong_dong_bhxh := new.luong_co_ban;
    new.bhxh_nld := round(new.luong_dong_bhxh * 0.105);  -- 8% BHXH + 1.5% BHYT + 1% BHTN
  else
    new.luong_dong_bhxh := 0;
    new.bhxh_nld := 0;
  end if;

  v_giam_tru := 11000000 + new.so_nguoi_phu_thuoc * 4400000;
  new.thu_nhap_tinh_thue := greatest(v_luong_thang - new.bhxh_nld - v_giam_tru, 0);
  new.thue_tncn := fn_tinh_thue_tncn(new.thu_nhap_tinh_thue);

  new.thuc_linh := v_luong_thang - new.bhxh_nld - new.thue_tncn;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bang_luong_tinh_luong on bang_luong;
create trigger trg_bang_luong_tinh_luong
before insert or update on bang_luong
for each row execute function trg_fn_bang_luong_tinh_luong();

-- 1e. rpc_tao_bang_luong: snapshot dien_dong_bhxh + so_nguoi_phu_thuoc
-- từ nhan_vien tại thời điểm tạo. Giữ nguyên chữ ký + cơ chế upsert.
create or replace function rpc_tao_bang_luong(p_nhan_vien_id uuid, p_thang date)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_luong numeric;
  v_cong numeric;
  v_thang_dau date := date_trunc('month', p_thang)::date;
  v_loai_hd text;
  v_ngay_ky date;
  v_dien_bhxh boolean;
  v_so_phu_thuoc int;
begin
  if not bao_mat.co_quyen_moi_noi('nhan_su', 'tao') then
    raise exception 'Không có quyền tạo bảng lương.' using errcode = 'insufficient_privilege';
  end if;

  select luong_co_ban, loai_hop_dong, ngay_ky_hd_chinh_thuc, so_nguoi_phu_thuoc
    into v_luong, v_loai_hd, v_ngay_ky, v_so_phu_thuoc
    from nhan_vien where id = p_nhan_vien_id;
  if v_luong is null then
    raise exception 'Không tìm thấy nhân viên.';
  end if;

  v_cong := fn_dem_cong_thang(p_nhan_vien_id, v_thang_dau);

  -- Đủ điều kiện đóng BHXH bắt buộc: HĐLĐ chính thức + đã ký từ đầu
  -- tháng chấm lương trở về trước (ước lượng "đủ 1 tháng" theo tháng,
  -- không tính chính xác theo ngày — đủ dùng cho quy mô hiện tại).
  v_dien_bhxh := v_loai_hd = 'chinh_thuc' and v_ngay_ky is not null and v_ngay_ky <= v_thang_dau;

  insert into bang_luong (nhan_vien_id, thang, luong_co_ban, so_ngay_cong, dien_dong_bhxh, so_nguoi_phu_thuoc)
  values (p_nhan_vien_id, v_thang_dau, v_luong, v_cong, v_dien_bhxh, coalesce(v_so_phu_thuoc, 0))
  on conflict (nhan_vien_id, thang)
  do update set luong_co_ban = excluded.luong_co_ban, so_ngay_cong = excluded.so_ngay_cong,
                dien_dong_bhxh = excluded.dien_dong_bhxh, so_nguoi_phu_thuoc = excluded.so_nguoi_phu_thuoc
  returning id into v_id;

  return v_id;
end;
$$;

-- Khoá lại các hàm mới trong migration này (cùng quy ước với các
-- migration khác — mặc định PostgreSQL cấp EXECUTE cho PUBLIC lúc
-- CREATE FUNCTION, phải revoke tay).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('fn_tinh_thue_tncn', 'trg_fn_bang_luong_tinh_luong')
  loop
    execute format('alter function %s security definer', r.sig);
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
