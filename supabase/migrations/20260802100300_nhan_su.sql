-- ============================================================
-- 13. NHÂN SỰ & HÀNH CHÍNH — mảnh cuối cùng trong bánh xe SAP
--
--   13.1 Mở rộng hồ sơ nhân viên
--   13.2 Chấm công
--   13.3 Đơn xin nghỉ phép (duyệt tự ghi công nghỉ phép)
--   13.4 Bảng lương cơ bản
--   13.5 RLS
-- ============================================================

-- ------------------------------------------------------------
-- 13.1 MỞ RỘNG HỒ SƠ NHÂN VIÊN
-- ------------------------------------------------------------

alter table nhan_vien
  add column if not exists ngay_sinh date,
  add column if not exists cccd text,
  add column if not exists dia_chi text,
  add column if not exists so_dien_thoai text,
  add column if not exists email text,
  add column if not exists ngay_vao_lam date,
  add column if not exists luong_co_ban numeric(14,2) not null default 0,
  add column if not exists so_tai_khoan_ngan_hang text,
  add column if not exists ten_ngan_hang text;

-- Tra chi nhánh của một nhân viên (dùng cho RLS 3 bảng bên dưới).
create or replace function bao_mat.cn_nhan_vien(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from nhan_vien where id = p_id $$;

grant execute on function bao_mat.cn_nhan_vien(uuid) to authenticated;

-- ------------------------------------------------------------
-- 13.2 CHẤM CÔNG
-- Chỉ quản lý/HR ghi (không cho nhân viên tự chấm công của mình —
-- tránh gian lận). Mỗi nhân viên/ngày chỉ một dòng.
-- ------------------------------------------------------------

create table if not exists cham_cong (
  id uuid primary key default gen_random_uuid(),
  nhan_vien_id uuid not null references nhan_vien(id),
  ngay date not null default current_date,
  trang_thai text not null default 'di_lam'
      check (trang_thai in ('di_lam', 'nua_ngay', 'nghi_phep', 'nghi_khong_phep', 'nghi_le')),
  gio_vao time,
  gio_ra time,
  ghi_chu text,
  nguoi_ghi_id uuid references nhan_vien(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nhan_vien_id, ngay)
);

create index if not exists idx_cham_cong_nhan_vien on cham_cong (nhan_vien_id, ngay);

drop trigger if exists trg_updated_at_cham_cong on cham_cong;
create trigger trg_updated_at_cham_cong
before update on cham_cong
for each row execute function trg_fn_cap_nhat_updated_at();

-- ------------------------------------------------------------
-- 13.3 ĐƠN XIN NGHỈ PHÉP
-- Nhân viên tự nộp đơn cho chính mình; quản lý/HR duyệt. Duyệt xong
-- TỰ ĐỘNG ghi "nghỉ phép" vào chấm công cho từng ngày trong khoảng —
-- không cần nhập tay hai lần.
-- ------------------------------------------------------------

create table if not exists don_xin_nghi_phep (
  id uuid primary key default gen_random_uuid(),
  so_don text unique,
  nhan_vien_id uuid not null references nhan_vien(id),
  tu_ngay date not null,
  den_ngay date not null,
  so_ngay numeric(4,1) not null check (so_ngay > 0),
  ly_do text,
  trang_thai text not null default 'cho_duyet'
      check (trang_thai in ('cho_duyet', 'da_duyet', 'tu_choi')),
  nguoi_duyet_id uuid references nhan_vien(id),
  ngay_duyet timestamptz,
  ghi_chu_duyet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (den_ngay >= tu_ngay)
);

create index if not exists idx_nghi_phep_nhan_vien on don_xin_nghi_phep (nhan_vien_id);

drop trigger if exists trg_updated_at_don_xin_nghi_phep on don_xin_nghi_phep;
create trigger trg_updated_at_don_xin_nghi_phep
before update on don_xin_nghi_phep
for each row execute function trg_fn_cap_nhat_updated_at();

drop trigger if exists trg_so_ct_don_xin_nghi_phep on don_xin_nghi_phep;
create trigger trg_so_ct_don_xin_nghi_phep
before insert on don_xin_nghi_phep
for each row execute function trg_fn_sinh_so_chung_tu('so_don', 'NP');

create or replace function trg_fn_duyet_nghi_phep() returns trigger as $$
declare
  v_ngay date;
begin
  if new.trang_thai = 'da_duyet' and old.trang_thai is distinct from 'da_duyet' then
    new.ngay_duyet := now();
    v_ngay := new.tu_ngay;
    while v_ngay <= new.den_ngay loop
      insert into cham_cong (nhan_vien_id, ngay, trang_thai, nguoi_ghi_id)
      values (new.nhan_vien_id, v_ngay, 'nghi_phep', new.nguoi_duyet_id)
      on conflict (nhan_vien_id, ngay)
      do update set trang_thai = 'nghi_phep', nguoi_ghi_id = new.nguoi_duyet_id, updated_at = now();
      v_ngay := v_ngay + 1;
    end loop;
  elsif new.trang_thai = 'tu_choi' and old.trang_thai is distinct from 'tu_choi' then
    new.ngay_duyet := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_duyet_nghi_phep on don_xin_nghi_phep;
create trigger trg_duyet_nghi_phep
before update on don_xin_nghi_phep
for each row execute function trg_fn_duyet_nghi_phep();

-- ------------------------------------------------------------
-- 13.4 BẢNG LƯƠNG CƠ BẢN
-- Lương = lương cơ bản × (số ngày công / số ngày chuẩn) + phụ cấp − khấu trừ.
-- KHÔNG tính bảo hiểm/thuế TNCN — đó là nghiệp vụ kế toán chuyên sâu
-- ngoài phạm vi bản này; số "thực lĩnh" ở đây là lương gộp sau phụ
-- cấp/khấu trừ đơn giản, không phải lương thực nhận sau thuế.
-- ------------------------------------------------------------

create table if not exists bang_luong (
  id uuid primary key default gen_random_uuid(),
  so_bang_luong text unique,
  nhan_vien_id uuid not null references nhan_vien(id),
  thang date not null,                          -- luôn là ngày 1 đầu tháng
  luong_co_ban numeric(14,2) not null default 0,
  so_ngay_cong numeric(5,1) not null default 0,
  so_ngay_chuan int not null default 26 check (so_ngay_chuan > 0),
  phu_cap numeric(14,2) not null default 0,
  khau_tru numeric(14,2) not null default 0,
  thuc_linh numeric(14,2) generated always as (
    round(luong_co_ban * so_ngay_cong / so_ngay_chuan) + phu_cap - khau_tru
  ) stored,
  trang_thai text not null default 'nhap' check (trang_thai in ('nhap', 'da_chi_tra')),
  ngay_chi_tra date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nhan_vien_id, thang)
);

create index if not exists idx_bang_luong_thang on bang_luong (thang);

drop trigger if exists trg_updated_at_bang_luong on bang_luong;
create trigger trg_updated_at_bang_luong
before update on bang_luong
for each row execute function trg_fn_cap_nhat_updated_at();

drop trigger if exists trg_so_ct_bang_luong on bang_luong;
create trigger trg_so_ct_bang_luong
before insert on bang_luong
for each row execute function trg_fn_sinh_so_chung_tu('so_bang_luong', 'BL');

-- Đếm công trong tháng: đi làm=1, nửa ngày=0.5, nghỉ lễ=1 (nghỉ có
-- lương), nghỉ phép=1 (nghỉ có lương, đã được duyệt), nghỉ không phép=0.
create or replace function fn_dem_cong_thang(p_nhan_vien_id uuid, p_thang date)
returns numeric as $$
  select coalesce(sum(
    case trang_thai
      when 'di_lam' then 1
      when 'nua_ngay' then 0.5
      when 'nghi_le' then 1
      when 'nghi_phep' then 1
      else 0
    end
  ), 0)
  from cham_cong
  where nhan_vien_id = p_nhan_vien_id
    and ngay >= date_trunc('month', p_thang)::date
    and ngay < (date_trunc('month', p_thang) + interval '1 month')::date
$$ language sql stable;

-- Tạo/tính lại bảng lương của một nhân viên cho một tháng — dùng số
-- công đã chấm, lương cơ bản hiện tại. Gọi lại nhiều lần thì cập nhật
-- so_ngay_cong/luong_co_ban mới nhất (idempotent), không nhân bản dòng.
create or replace function rpc_tao_bang_luong(p_nhan_vien_id uuid, p_thang date)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_luong numeric;
  v_cong numeric;
  v_thang_dau date := date_trunc('month', p_thang)::date;
begin
  if not bao_mat.co_quyen_moi_noi('nhan_su', 'tao') then
    raise exception 'Không có quyền tạo bảng lương.' using errcode = 'insufficient_privilege';
  end if;

  select luong_co_ban into v_luong from nhan_vien where id = p_nhan_vien_id;
  if v_luong is null then
    raise exception 'Không tìm thấy nhân viên.';
  end if;

  v_cong := fn_dem_cong_thang(p_nhan_vien_id, v_thang_dau);

  insert into bang_luong (nhan_vien_id, thang, luong_co_ban, so_ngay_cong)
  values (p_nhan_vien_id, v_thang_dau, v_luong, v_cong)
  on conflict (nhan_vien_id, thang)
  do update set luong_co_ban = excluded.luong_co_ban, so_ngay_cong = excluded.so_ngay_cong
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function rpc_tao_bang_luong(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 13.5 RLS
-- Xem: chính mình HOẶC quản lý/HR đúng chi nhánh của nhân viên đó
-- HOẶC toàn cục (kể cả khi nhân viên không thuộc chi nhánh nào).
-- Ghi chấm công/bảng lương: chỉ quản lý/HR. Đơn nghỉ phép: nhân viên
-- tự tạo cho chính mình, quản lý/HR duyệt.
-- ------------------------------------------------------------

alter table cham_cong enable row level security;

drop policy if exists cham_cong_xem on cham_cong;
create policy cham_cong_xem on cham_cong for select to authenticated
  using (
    nhan_vien_id = bao_mat.nhan_vien_id()
    or bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'xem')))
    or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'xem'))
  );

drop policy if exists cham_cong_them on cham_cong;
create policy cham_cong_them on cham_cong for insert to authenticated
  with check (
    bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'tao')))
    or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'tao'))
  );

drop policy if exists cham_cong_sua on cham_cong;
create policy cham_cong_sua on cham_cong for update to authenticated
  using (
    bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'sua')))
    or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'sua'))
  )
  with check (
    bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'sua')))
    or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'sua'))
  );

drop policy if exists cham_cong_xoa on cham_cong;
create policy cham_cong_xoa on cham_cong for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('nhan_su', 'xoa'));

alter table don_xin_nghi_phep enable row level security;

drop policy if exists nghi_phep_xem on don_xin_nghi_phep;
create policy nghi_phep_xem on don_xin_nghi_phep for select to authenticated
  using (
    nhan_vien_id = bao_mat.nhan_vien_id()
    or bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'xem')))
    or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'xem'))
  );

drop policy if exists nghi_phep_them on don_xin_nghi_phep;
create policy nghi_phep_them on don_xin_nghi_phep for insert to authenticated
  with check (
    nhan_vien_id = bao_mat.nhan_vien_id()
    or bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'tao')))
  );

-- Duyệt: chỉ quản lý/HR có quyền 'duyet' đúng phạm vi — KHÔNG cho tự
-- duyệt đơn của chính mình dù có quyền (tránh xung đột lợi ích).
drop policy if exists nghi_phep_sua on don_xin_nghi_phep;
create policy nghi_phep_sua on don_xin_nghi_phep for update to authenticated
  using (
    nhan_vien_id <> bao_mat.nhan_vien_id()
    and (
      bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'duyet')))
      or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'duyet'))
    )
  )
  with check (
    nhan_vien_id <> bao_mat.nhan_vien_id()
    and (
      bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'duyet')))
      or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'duyet'))
    )
  );

drop policy if exists nghi_phep_xoa on don_xin_nghi_phep;
create policy nghi_phep_xoa on don_xin_nghi_phep for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('nhan_su', 'xoa'));

alter table bang_luong enable row level security;

drop policy if exists bang_luong_xem on bang_luong;
create policy bang_luong_xem on bang_luong for select to authenticated
  using (
    nhan_vien_id = bao_mat.nhan_vien_id()
    or bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'xem')))
    or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'xem'))
  );

-- Không có policy insert cho authenticated — TẠO CHỈ QUA rpc_tao_bang_luong
-- (đã tự kiểm quyền bên trong). Sửa (phụ cấp/khấu trừ/đánh dấu đã chi trả)
-- vẫn cho phép trực tiếp qua policy update bình thường.
drop policy if exists bang_luong_sua on bang_luong;
create policy bang_luong_sua on bang_luong for update to authenticated
  using (
    bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'sua')))
    or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'sua'))
  )
  with check (
    bao_mat.cn_nhan_vien(nhan_vien_id) in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'sua')))
    or (bao_mat.cn_nhan_vien(nhan_vien_id) is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'sua'))
  );

drop policy if exists bang_luong_xoa on bang_luong;
create policy bang_luong_xoa on bang_luong for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('nhan_su', 'xoa'));

grant select, insert, update, delete on cham_cong, don_xin_nghi_phep to authenticated;
grant select, update, delete on bang_luong to authenticated;

-- Khoá lại toàn bộ hàm mới trong migration này.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'fn\_%' or p.proname like 'trg\_fn\_%')
      and p.proname not like 'rpc\_%'
  loop
    execute format('alter function %s security definer', r.sig);
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

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
