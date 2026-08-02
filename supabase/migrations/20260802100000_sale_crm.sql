-- ============================================================
-- 10. SALE / CRM — mở rộng trên nền khach_hang_b2b đã có
--
--   10.1 Cơ hội bán hàng (pipeline)
--   10.2 Lịch sử chăm sóc khách hàng
--   10.3 View báo cáo pipeline
--   10.4 RLS
-- ============================================================

-- ------------------------------------------------------------
-- 10.1 CƠ HỘI BÁN HÀNG
-- ------------------------------------------------------------

create table if not exists co_hoi_ban_hang (
  id uuid primary key default gen_random_uuid(),
  ma_co_hoi text unique,
  khach_hang_b2b_id uuid not null references khach_hang_b2b(id),
  ten_co_hoi text not null,
  gia_tri_uoc_tinh numeric(14,2) not null default 0,
  giai_doan text not null default 'tiep_can'
      check (giai_doan in ('tiep_can','danh_gia','bao_gia','dam_phan','thanh_cong','that_bai')),
  xac_suat_phan_tram int not null default 20 check (xac_suat_phan_tram between 0 and 100),
  ngay_du_kien_chot date,
  nhan_vien_phu_trach_id uuid references nhan_vien(id),
  don_hang_id uuid references don_hang_b2b(id),
  ly_do_that_bai text,
  ghi_chu text,
  created_at timestamptz not null default now()
);

create index if not exists idx_co_hoi_khach_hang on co_hoi_ban_hang (khach_hang_b2b_id);
create index if not exists idx_co_hoi_giai_doan on co_hoi_ban_hang (giai_doan) where giai_doan not in ('thanh_cong','that_bai');

comment on column co_hoi_ban_hang.xac_suat_phan_tram is
  'Ước tính chủ quan của người phụ trách — dùng để tính giá trị pipeline có trọng số, không phải số liệu thống kê.';

-- Đóng cơ hội thì khoá lại giai đoạn — không cho "mở lại" một cách bất cẩn.
-- Muốn làm lại thì tạo cơ hội mới, giữ lịch sử cơ hội cũ nguyên vẹn.
create or replace function trg_fn_co_hoi_khoa_khi_dong() returns trigger as $$
begin
  if old.giai_doan in ('thanh_cong', 'that_bai') and new.giai_doan <> old.giai_doan then
    raise exception 'Cơ hội đã ở giai đoạn "%" — không thể đổi giai đoạn nữa. Tạo cơ hội mới nếu cần làm lại.',
      old.giai_doan
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_co_hoi_khoa_khi_dong on co_hoi_ban_hang;
create trigger trg_co_hoi_khoa_khi_dong
before update on co_hoi_ban_hang
for each row execute function trg_fn_co_hoi_khoa_khi_dong();

-- Tự sinh mã cơ hội, dùng chung bộ đếm với các chứng từ khác (Tier 3).
drop trigger if exists trg_so_ct_co_hoi_ban_hang on co_hoi_ban_hang;
create trigger trg_so_ct_co_hoi_ban_hang
before insert on co_hoi_ban_hang
for each row execute function trg_fn_sinh_so_chung_tu('ma_co_hoi', 'CH');

-- updated_at (đồng bộ với mọi bảng khác trong hệ thống — xem migration 08)
alter table co_hoi_ban_hang add column if not exists updated_at timestamptz not null default now();
drop trigger if exists trg_updated_at_co_hoi_ban_hang on co_hoi_ban_hang;
create trigger trg_updated_at_co_hoi_ban_hang
before update on co_hoi_ban_hang
for each row execute function trg_fn_cap_nhat_updated_at();

-- ------------------------------------------------------------
-- 10.2 LỊCH SỬ CHĂM SÓC KHÁCH HÀNG
-- ------------------------------------------------------------

create table if not exists hoat_dong_cham_soc (
  id uuid primary key default gen_random_uuid(),
  khach_hang_b2b_id uuid not null references khach_hang_b2b(id),
  co_hoi_id uuid references co_hoi_ban_hang(id),
  loai_hoat_dong text not null default 'goi_dien'
      check (loai_hoat_dong in ('goi_dien','gap_mat','email','khac')),
  noi_dung text not null,
  ngay_thuc_hien timestamptz not null default now(),
  nguoi_thuc_hien_id uuid references nhan_vien(id),
  ket_qua text,
  ngay_hen_tiep_theo date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hoat_dong_khach_hang on hoat_dong_cham_soc (khach_hang_b2b_id, ngay_thuc_hien desc);
create index if not exists idx_hoat_dong_co_hoi on hoat_dong_cham_soc (co_hoi_id) where co_hoi_id is not null;
create index if not exists idx_hoat_dong_hen_toi on hoat_dong_cham_soc (ngay_hen_tiep_theo)
  where ngay_hen_tiep_theo is not null;

drop trigger if exists trg_updated_at_hoat_dong_cham_soc on hoat_dong_cham_soc;
create trigger trg_updated_at_hoat_dong_cham_soc
before update on hoat_dong_cham_soc
for each row execute function trg_fn_cap_nhat_updated_at();

-- ------------------------------------------------------------
-- 10.3 VIEW BÁO CÁO PIPELINE
-- ------------------------------------------------------------

create or replace view pipeline_ban_hang
with (security_invoker = on) as
select ch.giai_doan,
       count(*) as so_co_hoi,
       sum(ch.gia_tri_uoc_tinh) as tong_gia_tri,
       sum(ch.gia_tri_uoc_tinh * ch.xac_suat_phan_tram / 100.0) as gia_tri_co_trong_so
from co_hoi_ban_hang ch
where ch.giai_doan not in ('thanh_cong', 'that_bai')
group by ch.giai_doan;

create or replace view lich_hen_cham_soc_sap_toi
with (security_invoker = on) as
select hd.id, hd.khach_hang_b2b_id, kh.ten_doanh_nghiep, hd.ngay_hen_tiep_theo,
       hd.noi_dung, hd.nguoi_thuc_hien_id, nv.ho_ten as nguoi_thuc_hien
from hoat_dong_cham_soc hd
join khach_hang_b2b kh on kh.id = hd.khach_hang_b2b_id
left join nhan_vien nv on nv.id = hd.nguoi_thuc_hien_id
where hd.ngay_hen_tiep_theo is not null
  and hd.ngay_hen_tiep_theo >= current_date
order by hd.ngay_hen_tiep_theo;

-- ------------------------------------------------------------
-- 10.4 RLS — cùng quy tắc phạm vi với khach_hang_b2b: nhân viên
-- phụ trách hoặc vai trò toàn hệ thống mới thấy được.
-- ------------------------------------------------------------

create or replace function bao_mat.duoc_xem_co_hoi(p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id) from co_hoi_ban_hang where id = p_id
$$;

grant execute on function bao_mat.duoc_xem_co_hoi(uuid) to authenticated;

alter table co_hoi_ban_hang enable row level security;

drop policy if exists co_hoi_ban_hang_xem on co_hoi_ban_hang;
create policy co_hoi_ban_hang_xem on co_hoi_ban_hang for select to authenticated
  using (bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));

drop policy if exists co_hoi_ban_hang_them on co_hoi_ban_hang;
create policy co_hoi_ban_hang_them on co_hoi_ban_hang for insert to authenticated
  with check (bao_mat.co_quyen_moi_noi('b2b', 'tao') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));

drop policy if exists co_hoi_ban_hang_sua on co_hoi_ban_hang;
create policy co_hoi_ban_hang_sua on co_hoi_ban_hang for update to authenticated
  using (bao_mat.co_quyen_moi_noi('b2b', 'sua') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id))
  with check (bao_mat.co_quyen_moi_noi('b2b', 'sua') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));

drop policy if exists co_hoi_ban_hang_xoa on co_hoi_ban_hang;
create policy co_hoi_ban_hang_xoa on co_hoi_ban_hang for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('b2b', 'xoa'));

alter table hoat_dong_cham_soc enable row level security;

drop policy if exists hoat_dong_cham_soc_xem on hoat_dong_cham_soc;
create policy hoat_dong_cham_soc_xem on hoat_dong_cham_soc for select to authenticated
  using (bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));

drop policy if exists hoat_dong_cham_soc_them on hoat_dong_cham_soc;
create policy hoat_dong_cham_soc_them on hoat_dong_cham_soc for insert to authenticated
  with check (bao_mat.co_quyen_moi_noi('b2b', 'tao') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));

drop policy if exists hoat_dong_cham_soc_sua on hoat_dong_cham_soc;
create policy hoat_dong_cham_soc_sua on hoat_dong_cham_soc for update to authenticated
  using (bao_mat.co_quyen_moi_noi('b2b', 'sua') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id))
  with check (bao_mat.co_quyen_moi_noi('b2b', 'sua') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));

drop policy if exists hoat_dong_cham_soc_xoa on hoat_dong_cham_soc;
create policy hoat_dong_cham_soc_xoa on hoat_dong_cham_soc for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('b2b', 'xoa'));

-- Khoá lại các hàm mới, đúng khuôn của migration 06/07/08.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'fn\_%' or p.proname like 'trg\_fn\_%')
  loop
    execute format('alter function %s security definer', r.sig);
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

grant select, insert, update, delete on co_hoi_ban_hang, hoat_dong_cham_soc to authenticated;

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
