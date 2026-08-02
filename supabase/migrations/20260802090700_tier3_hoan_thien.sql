-- ============================================================
-- 08. TIER 3 — HOÀN THIỆN
--
--   8.1 updated_at cho mọi bảng
--   8.2 Sinh số chứng từ tập trung (hết race condition)
--   8.3 Ràng buộc duy nhất còn thiếu
--   8.4 Hao hụt & số mẻ (2 cột đang khai báo nhưng không dùng)
--   8.5 Chống vòng lặp công thức
--   8.6 Index cho khóa ngoại
--   8.7 Trả hàng nhà cung cấp
--   8.8 Storage bucket cho chứng từ đính kèm
--   8.9 Realtime + tác vụ định kỳ
-- ============================================================

-- ------------------------------------------------------------
-- 8.1 updated_at
-- Trước đây KHÔNG bảng nào có => không sync incremental,
-- không biết bản ghi sửa lần cuối lúc nào.
-- ------------------------------------------------------------

create or replace function trg_fn_cap_nhat_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

do $$
declare b text;
begin
  for b in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname <> 'nhat_ky_he_thong'      -- append-only, không sửa
  loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', b);
    execute format('drop trigger if exists trg_updated_at_%s on public.%I', b, b);
    execute format('create trigger trg_updated_at_%s before update on public.%I
                    for each row execute function trg_fn_cap_nhat_updated_at()', b, b);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 8.2 SINH SỐ CHỨNG TỪ
-- Bản gốc để "so_phieu not null unique" cho app tự lo => hai chi nhánh
-- tạo cùng lúc sẽ đụng số hoặc phải retry.
-- ------------------------------------------------------------

create table if not exists bo_dem_chung_tu (
  tien_to text not null,
  ky text not null,                     -- YYMM
  so_hien_tai int not null default 0,
  primary key (tien_to, ky)
);

create or replace function fn_sinh_so_phieu(p_tien_to text, p_ngay timestamptz default now())
returns text as $$
declare
  v_ky text := to_char(p_ngay, 'YYMM');
  v_so int;
begin
  insert into bo_dem_chung_tu (tien_to, ky, so_hien_tai)
  values (p_tien_to, v_ky, 1)
  on conflict (tien_to, ky)
  do update set so_hien_tai = bo_dem_chung_tu.so_hien_tai + 1
  returning so_hien_tai into v_so;

  return p_tien_to || '-' || v_ky || '-' || lpad(v_so::text, 4, '0');
end;
$$ language plpgsql;

-- Trigger dùng chung: tg_argv[0] = tên cột, tg_argv[1] = tiền tố
create or replace function trg_fn_sinh_so_chung_tu() returns trigger as $$
declare
  v_cot text := tg_argv[0];
  v_tien_to text := tg_argv[1];
  v_json jsonb;
begin
  v_json := to_jsonb(new);
  if nullif(v_json ->> v_cot, '') is null then
    new := jsonb_populate_record(
             new,
             v_json || jsonb_build_object(v_cot, fn_sinh_so_phieu(v_tien_to))
           );
  end if;
  return new;
end;
$$ language plpgsql;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('phieu_nhap_kho',    'so_phieu',      'PN'),
      ('phieu_xuat_kho',    'so_phieu',      'PX'),
      ('phieu_san_xuat',    'so_phieu',      'PSX'),
      ('phieu_kiem_ke',     'so_phieu',      'KK'),
      ('don_dat_hang_ncc',  'so_don',        'DDH'),
      ('hoa_don_ban',       'so_hoa_don',    'HD'),
      ('don_hang_b2b',      'so_don_hang',   'DH'),
      ('hoa_don_b2b',       'so_hoa_don',    'HDB'),
      ('phieu_thu_cong_no', 'so_phieu_thu',  'PT'),
      ('phieu_chi_ncc',     'so_phieu_chi',  'PC'),
      ('chuyen_giao_hang',  'ma_chuyen',     'CGH')
    ) t(bang, cot, tien_to)
  loop
    -- Cột phải cho phép NULL thì trigger mới điền được
    execute format('alter table public.%I alter column %I drop not null', r.bang, r.cot);
    execute format('drop trigger if exists trg_so_ct_%s on public.%I', r.bang, r.bang);
    execute format(
      'create trigger trg_so_ct_%s before insert on public.%I
       for each row execute function trg_fn_sinh_so_chung_tu(%L, %L)',
      r.bang, r.bang, r.cot, r.tien_to);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 8.3 RÀNG BUỘC DUY NHẤT CÒN THIẾU
-- ------------------------------------------------------------

-- Một nguyên liệu chỉ xuất hiện một dòng trong mỗi công thức
create unique index if not exists uq_chi_tiet_cong_thuc
  on chi_tiet_cong_thuc (cong_thuc_id, vat_tu_id);

-- Mỗi vật tư chỉ có MỘT công thức đang áp dụng
create unique index if not exists uq_cong_thuc_dang_ap_dung
  on cong_thuc_san_xuat (vat_tu_dau_ra_id) where dang_ap_dung;

-- Không trùng bậc giá B2B
create unique index if not exists uq_chi_tiet_bang_gia_b2b
  on chi_tiet_bang_gia_b2b (bang_gia_id, vat_tu_id, so_luong_tu);

-- Không trùng tiêu chí chất lượng
create unique index if not exists uq_tieu_chuan_chat_luong
  on tieu_chuan_chat_luong (vat_tu_id, ten_tieu_chi);

-- ------------------------------------------------------------
-- 8.4 HAO HỤT & SỐ MẺ
-- cong_thuc_san_xuat.ty_le_hao_hut_phan_tram và phieu_san_xuat.so_me
-- được khai báo trong schema gốc nhưng KHÔNG hàm nào dùng tới.
-- ------------------------------------------------------------

create or replace function fn_tao_dinh_muc_san_xuat(p_phieu_id uuid) returns int as $$
declare
  v_so int;
begin
  insert into chi_tiet_san_xuat_dau_vao
    (phieu_san_xuat_id, vat_tu_id, so_luong_dinh_muc, so_luong_thuc_te)
  select ps.id,
         ct.vat_tu_id,
         round(ct.so_luong_dinh_muc * ps.so_me
               * (1 + coalesce(cts.ty_le_hao_hut_phan_tram, 0) / 100), 3),
         round(ct.so_luong_dinh_muc * ps.so_me
               * (1 + coalesce(cts.ty_le_hao_hut_phan_tram, 0) / 100), 3)
  from phieu_san_xuat ps
  join cong_thuc_san_xuat cts on cts.id = ps.cong_thuc_id
  join chi_tiet_cong_thuc ct on ct.cong_thuc_id = cts.id
  where ps.id = p_phieu_id
    and not exists (select 1 from chi_tiet_san_xuat_dau_vao d
                     where d.phieu_san_xuat_id = ps.id);

  get diagnostics v_so = row_count;
  return v_so;
end;
$$ language plpgsql;

-- Tạo phiếu sản xuất => tự nạp định mức nguyên liệu theo công thức × số mẻ × hao hụt
create or replace function trg_fn_phieu_san_xuat_nap_dinh_muc() returns trigger as $$
begin
  perform fn_tao_dinh_muc_san_xuat(new.id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_san_xuat_nap_dinh_muc on phieu_san_xuat;
create trigger trg_phieu_san_xuat_nap_dinh_muc
after insert on phieu_san_xuat
for each row execute function trg_fn_phieu_san_xuat_nap_dinh_muc();

-- Không nhập sản lượng thực tế => lấy sản lượng lý thuyết (đầu ra × số mẻ)
create or replace function trg_fn_phieu_san_xuat_san_luong() returns trigger as $$
begin
  if new.trang_thai = 'hoan_thanh' and new.so_luong_thuc_te is null then
    select cts.so_luong_dau_ra * new.so_me into new.so_luong_thuc_te
    from cong_thuc_san_xuat cts where cts.id = new.cong_thuc_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_san_xuat_san_luong on phieu_san_xuat;
create trigger trg_phieu_san_xuat_san_luong
before update on phieu_san_xuat
for each row execute function trg_fn_phieu_san_xuat_san_luong();

-- ------------------------------------------------------------
-- 8.5 CHỐNG VÒNG LẶP CÔNG THỨC
-- Không có ràng buộc này thì A cần B, B cần A => rpc_no_bom chạy tới
-- giới hạn 5 cấp và trả số liệu sai âm thầm.
-- ------------------------------------------------------------

create or replace function trg_fn_kiem_tra_vong_lap_bom() returns trigger as $$
declare
  v_dau_ra uuid;
  v_ten text;
begin
  select vat_tu_dau_ra_id into v_dau_ra
  from cong_thuc_san_xuat where id = new.cong_thuc_id;

  if new.vat_tu_id = v_dau_ra then
    raise exception 'Công thức không thể chứa chính sản phẩm đầu ra của nó.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from rpc_no_bom(new.vat_tu_id, 1) b where b.ra_vat_tu_id = v_dau_ra
  ) then
    select ten_vat_tu into v_ten from vat_tu where id = new.vat_tu_id;
    raise exception 'Vòng lặp công thức: "%" (trực tiếp hoặc gián tiếp) đã cần tới sản phẩm đầu ra.', v_ten
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_kiem_tra_vong_lap_bom on chi_tiet_cong_thuc;
create trigger trg_kiem_tra_vong_lap_bom
before insert or update on chi_tiet_cong_thuc
for each row execute function trg_fn_kiem_tra_vong_lap_bom();

-- ------------------------------------------------------------
-- 8.6 INDEX CHO KHÓA NGOẠI
-- Thiếu index FK => JOIN chậm và ON DELETE CASCADE quét toàn bảng.
-- ------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as bang,
           a.attname as cot,
           'idx_fk_' || c.conrelid::regclass::text || '_' || a.attname as ten_idx
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    join lateral unnest(c.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and n.nspname = 'public'
      and array_length(c.conkey, 1) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indkey[0] = a.attnum
      )
  loop
    execute format('create index if not exists %I on %s (%I)',
                   left(replace(r.ten_idx, '.', '_'), 63), r.bang, r.cot);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 8.7 TRẢ HÀNG NHÀ CUNG CẤP
-- ------------------------------------------------------------

alter table phieu_xuat_kho drop constraint if exists phieu_xuat_kho_loai_xuat_check;
alter table phieu_xuat_kho add constraint phieu_xuat_kho_loai_xuat_check
  check (loai_xuat in ('dieu_chuyen','ban_hang','huy_hang','tra_ncc','khac'));

alter table the_kho drop constraint if exists the_kho_loai_giao_dich_check;
alter table the_kho add constraint the_kho_loai_giao_dich_check
  check (loai_giao_dich in ('nhap_mua','san_xuat_nhap','san_xuat_xuat',
                            'dieu_chuyen_di','dieu_chuyen_den','ban_hang',
                            'huy_hang','dieu_chinh','ban_b2b','tra_ncc'));

alter table phieu_xuat_kho
  add column if not exists nha_cung_cap_id uuid references nha_cung_cap(id),
  add column if not exists phieu_nhap_goc_id uuid references phieu_nhap_kho(id);

alter table chi_tiet_phieu_xuat
  add column if not exists don_gia numeric(14,2);

alter table chi_tiet_phieu_xuat
  add column if not exists thanh_tien numeric(14,2)
    generated always as (so_luong * coalesce(don_gia, 0)) stored;

-- Bản này THAY THẾ trg_fn_phieu_xuat_gui của migration 06: thêm nhánh 'tra_ncc'.
create or replace function trg_fn_phieu_xuat_gui() returns trigger as $$
declare
  r record;
  v_loai text;
begin
  if new.trang_thai = 'da_gui' and old.trang_thai is distinct from 'da_gui' then
    v_loai := case new.loai_xuat
                when 'huy_hang' then 'huy_hang'
                when 'tra_ncc'  then 'tra_ncc'
                else 'dieu_chuyen_di'
              end;
    for r in
      select vat_tu_id, so_luong, lo_hang_id from chi_tiet_phieu_xuat where phieu_xuat_id = new.id
    loop
      if r.lo_hang_id is not null then
        perform fn_capnhat_ton_kho(
          new.kho_xuat_id, r.vat_tu_id, -r.so_luong,
          v_loai, new.id, 'phieu_xuat_kho', r.lo_hang_id
        );
      else
        perform fn_xuat_fefo(
          new.kho_xuat_id, r.vat_tu_id, r.so_luong,
          v_loai, new.id, 'phieu_xuat_kho'
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

-- Công nợ phải trả NCC = mua − đã chi − giá trị hàng đã trả lại
create or replace view cong_no_phai_tra_theo_ncc
with (security_invoker = on) as
with mua as (
  select ncc.id as nha_cung_cap_id, ncc.ten_ncc,
         coalesce(sum(pn.tong_tien), 0) as tong_mua
  from nha_cung_cap ncc
  left join phieu_nhap_kho pn on pn.nha_cung_cap_id = ncc.id and pn.trang_thai = 'da_duyet'
  group by ncc.id, ncc.ten_ncc
),
chi as (
  select nha_cung_cap_id, coalesce(sum(so_tien), 0) as da_tra
  from phieu_chi_ncc group by nha_cung_cap_id
),
tra as (
  select px.nha_cung_cap_id, coalesce(sum(ct.thanh_tien), 0) as gia_tri_tra
  from phieu_xuat_kho px
  join chi_tiet_phieu_xuat ct on ct.phieu_xuat_id = px.id
  where px.loai_xuat = 'tra_ncc' and px.trang_thai in ('da_gui', 'da_nhan')
    and px.nha_cung_cap_id is not null
  group by px.nha_cung_cap_id
)
-- ⚠️ Thứ tự cột phải giữ nguyên 3 cột đầu + con_no như bản cũ:
-- CREATE OR REPLACE VIEW không cho đổi tên/vị trí cột đã có, và
-- bi_tong_quan_thang đang đọc cột con_no của view này.
select m.ten_ncc,
       m.tong_mua,
       coalesce(c.da_tra, 0) as da_tra,
       m.tong_mua - coalesce(c.da_tra, 0) - coalesce(t.gia_tri_tra, 0) as con_no,
       coalesce(t.gia_tri_tra, 0) as gia_tri_tra_lai
from mua m
left join chi c on c.nha_cung_cap_id = m.nha_cung_cap_id
left join tra t on t.nha_cung_cap_id = m.nha_cung_cap_id
where m.tong_mua - coalesce(c.da_tra, 0) - coalesce(t.gia_tri_tra, 0) <> 0
order by con_no desc;

-- ------------------------------------------------------------
-- 8.8 STORAGE — CHỨNG TỪ ĐÍNH KÈM
-- Đường dẫn quy ước: <chi_nhanh_id>/<loai_chung_tu>/<ten_file>
-- => phân quyền file theo đúng chi nhánh như dữ liệu.
-- ------------------------------------------------------------

create or replace function bao_mat.cac_chi_nhanh_text() returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(x::text), '{}'::text[]) from unnest(bao_mat.cac_chi_nhanh()) x
$$;

grant execute on function bao_mat.cac_chi_nhanh_text() to authenticated;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'Bỏ qua phần Storage — không phải môi trường Supabase.';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('chung-tu', 'chung-tu', false)
  on conflict (id) do nothing;

  execute $p$drop policy if exists chung_tu_xem on storage.objects$p$;
  execute $p$
    create policy chung_tu_xem on storage.objects for select to authenticated
    using (bucket_id = 'chung-tu'
           and (storage.foldername(name))[1] = any (bao_mat.cac_chi_nhanh_text()))
  $p$;

  execute $p$drop policy if exists chung_tu_tai_len on storage.objects$p$;
  execute $p$
    create policy chung_tu_tai_len on storage.objects for insert to authenticated
    with check (bucket_id = 'chung-tu'
                and (storage.foldername(name))[1] = any (bao_mat.cac_chi_nhanh_text()))
  $p$;

  execute $p$drop policy if exists chung_tu_xoa on storage.objects$p$;
  execute $p$
    create policy chung_tu_xoa on storage.objects for delete to authenticated
    using (bucket_id = 'chung-tu'
           and (storage.foldername(name))[1] = any (bao_mat.cac_chi_nhanh_text()))
  $p$;
end $$;

-- ------------------------------------------------------------
-- 8.9 REALTIME + TÁC VỤ ĐỊNH KỲ
-- ------------------------------------------------------------

-- Realtime vẫn tôn trọng RLS: client chỉ nhận thay đổi của chi nhánh mình.
do $$
declare b text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Bỏ qua Realtime — chưa có publication supabase_realtime.';
    return;
  end if;

  foreach b in array array['ton_kho', 'don_hang_b2b', 'phieu_xuat_kho', 'ca_ban_hang']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = b
    ) then
      execute format('alter publication supabase_realtime add table public.%I', b);
    end if;
  end loop;
end $$;

-- pg_cron: bật extension trong Dashboard → Database → Extensions rồi chạy khối này.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'Bỏ qua lịch chạy tự động — chưa bật extension pg_cron.';
    return;
  end if;

  perform cron.unschedule(jobname)
    from cron.job where jobname in ('danh_dau_cong_no_qua_han', 'tong_hop_doanh_so_ngay');

  perform cron.schedule('danh_dau_cong_no_qua_han', '5 0 * * *',
                        $c$select fn_cap_nhat_cong_no_qua_han()$c$);
  perform cron.schedule('tong_hop_doanh_so_ngay', '15 0 * * *',
                        $c$select fn_tong_hop_doanh_so(current_date - 1)$c$);
end $$;

-- ------------------------------------------------------------
-- 8.10 RPC CHO ỨNG DỤNG
-- Các hàm fn_* bị thu hồi quyền gọi ở 8.11. Những tác vụ app CẦN gọi
-- được bọc lại thành rpc_*, tự kiểm tra quyền trước khi chạy.
-- ------------------------------------------------------------

create or replace function rpc_nap_kiem_ke(p_phieu_id uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cn uuid;
begin
  select chi_nhanh_id into v_cn from phieu_kiem_ke where id = p_phieu_id;
  if v_cn is null then
    raise exception 'Không tìm thấy phiếu kiểm kê.';
  end if;
  if not bao_mat.co_quyen_cn('kho', 'sua', v_cn) then
    raise exception 'Không có quyền kiểm kê tại chi nhánh này.'
      using errcode = 'insufficient_privilege';
  end if;
  return fn_nap_kiem_ke(p_phieu_id);
end;
$$;

create or replace function rpc_tong_hop_doanh_so(p_ngay date default current_date - 1)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not bao_mat.co_quyen_toan_cuc('ban_le', 'tao') then
    raise exception 'Chỉ vai trò toàn hệ thống được tổng hợp doanh số.'
      using errcode = 'insufficient_privilege';
  end if;
  return fn_tong_hop_doanh_so(p_ngay);
end;
$$;

-- ------------------------------------------------------------
-- 8.11 KHÓA LẠI CÁC HÀM MỚI
-- ------------------------------------------------------------

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

grant execute on function rpc_nap_kiem_ke(uuid) to authenticated;
grant execute on function rpc_tong_hop_doanh_so(date) to authenticated;
