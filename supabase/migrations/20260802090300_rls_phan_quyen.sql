-- ============================================================
-- 04. RLS — CÔ LẬP DỮ LIỆU GIỮA CÁC CHI NHÁNH
--
-- Nguyên tắc:
--   1. Danh tính  : auth.uid() -> nguoi_dung_he_thong.auth_user_id
--   2. Phạm vi    : nguoi_dung_vai_tro.chi_nhanh_id
--                     NULL  = vai trò toàn hệ thống
--                     có giá trị = vai trò CHỈ ở chi nhánh đó
--   3. Quyền      : vai_tro_quyen -> quyen_he_thong (module, hanh_dong)
--   4. Mỗi policy = "có quyền (module, hành động)" AND "đúng chi nhánh của dòng dữ liệu"
--      => một quản lý Mỹ Thái có quyền 'kho.xem' cũng KHÔNG đọc được tồn kho PTB.
--
-- Bảng tồn kho / thẻ kho / lịch sử giữ chỗ: CHỈ ĐỌC với mọi user.
-- Mọi thay đổi đi qua hàm fn_* (SECURITY DEFINER) do trigger gọi.
--
-- KHÔNG dùng "force row level security" — các hàm SECURITY DEFINER
-- thuộc sở hữu postgres cần bỏ qua RLS để không đệ quy.
-- ============================================================

-- ------------------------------------------------------------
-- 4.1 BỔ SUNG CẤU TRÚC BẮT BUỘC CHO RLS
-- ------------------------------------------------------------

-- Nối tài khoản đăng nhập Supabase với người dùng nghiệp vụ.
alter table nguoi_dung_he_thong
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- ⚠️ SỬA THIẾT KẾ: PK cũ (nguoi_dung_id, vai_tro_id) khiến MỘT người
-- không thể giữ cùng một vai trò ở HAI chi nhánh (vd quản lý kiêm nhiệm
-- Mỹ Thái + PTB). Chuyển sang PK riêng + unique có tính chi_nhanh_id.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'nguoi_dung_vai_tro'::regclass and contype = 'p'
      and conname = 'nguoi_dung_vai_tro_pkey'
      and array_length(conkey, 1) = 2
  ) then
    alter table nguoi_dung_vai_tro drop constraint nguoi_dung_vai_tro_pkey;
  end if;
end $$;

alter table nguoi_dung_vai_tro
  add column if not exists id uuid not null default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'nguoi_dung_vai_tro'::regclass and contype = 'p'
  ) then
    alter table nguoi_dung_vai_tro add primary key (id);
  end if;
end $$;

create unique index if not exists uq_nguoi_dung_vai_tro_chi_nhanh
  on nguoi_dung_vai_tro (
    nguoi_dung_id, vai_tro_id,
    coalesce(chi_nhanh_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ------------------------------------------------------------
-- 4.2 SCHEMA HÀM BẢO MẬT
-- Đặt ngoài "public" để PostgREST không phơi ra thành RPC.
-- ------------------------------------------------------------

create schema if not exists bao_mat;
grant usage on schema bao_mat to authenticated, service_role;

-- Người dùng nghiệp vụ tương ứng phiên đăng nhập hiện tại.
create or replace function bao_mat.nguoi_dung_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select nd.id
  from nguoi_dung_he_thong nd
  where nd.trang_thai = 'hoat_dong'
    and auth.uid() is not null
    and (
      nd.auth_user_id = auth.uid()
      -- fallback khi chưa map auth_user_id: khớp theo email trong JWT
      or (nd.auth_user_id is null
          and lower(nd.email) = lower(nullif(
                nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '')))
    )
  limit 1
$$;

create or replace function bao_mat.nhan_vien_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select nhan_vien_id from nguoi_dung_he_thong where id = bao_mat.nguoi_dung_id()
$$;

-- Quản trị toàn hệ thống (vai trò gán ở phạm vi NULL).
create or replace function bao_mat.la_quan_tri() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from nguoi_dung_vai_tro ndvt
    join vai_tro_he_thong vt on vt.id = ndvt.vai_tro_id
    where ndvt.nguoi_dung_id = bao_mat.nguoi_dung_id()
      and ndvt.chi_nhanh_id is null
      and vt.ma_vai_tro in ('admin', 'giam_doc')
  )
$$;

-- Có quyền (module, hành động) ở BẤT KỲ phạm vi nào.
-- Dùng cho bảng danh mục / bảng không gắn chi nhánh.
create or replace function bao_mat.co_quyen_moi_noi(p_module text, p_hanh_dong text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select bao_mat.la_quan_tri() or exists (
    select 1
    from nguoi_dung_vai_tro ndvt
    join vai_tro_quyen vtq on vtq.vai_tro_id = ndvt.vai_tro_id
    join quyen_he_thong q on q.id = vtq.quyen_id
    where ndvt.nguoi_dung_id = bao_mat.nguoi_dung_id()
      and q.module = p_module and q.hanh_dong = p_hanh_dong
  )
$$;

-- Có quyền ở phạm vi TOÀN HỆ THỐNG (vai trò gán với chi_nhanh_id null).
-- Dùng cho: sửa danh mục dùng chung, xem dữ liệu không thuộc chi nhánh nào.
create or replace function bao_mat.co_quyen_toan_cuc(p_module text, p_hanh_dong text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select bao_mat.la_quan_tri() or exists (
    select 1
    from nguoi_dung_vai_tro ndvt
    join vai_tro_quyen vtq on vtq.vai_tro_id = ndvt.vai_tro_id
    join quyen_he_thong q on q.id = vtq.quyen_id
    where ndvt.nguoi_dung_id = bao_mat.nguoi_dung_id()
      and ndvt.chi_nhanh_id is null
      and q.module = p_module and q.hanh_dong = p_hanh_dong
  )
$$;

-- ⭐ HÀM LÕI CHỐNG LỘ DỮ LIỆU CHÉO CHI NHÁNH.
-- Trả về danh sách chi nhánh mà user được phép (module, hành động) này.
-- Vai trò toàn hệ thống => tất cả chi nhánh; ngược lại => đúng chi nhánh được gán.
create or replace function bao_mat.cn_duoc_phep(p_module text, p_hanh_dong text)
returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when bao_mat.co_quyen_toan_cuc(p_module, p_hanh_dong)
      then (select coalesce(array_agg(id), '{}'::uuid[]) from chi_nhanh)
    else (
      select coalesce(array_agg(distinct ndvt.chi_nhanh_id), '{}'::uuid[])
      from nguoi_dung_vai_tro ndvt
      join vai_tro_quyen vtq on vtq.vai_tro_id = ndvt.vai_tro_id
      join quyen_he_thong q on q.id = vtq.quyen_id
      where ndvt.nguoi_dung_id = bao_mat.nguoi_dung_id()
        and ndvt.chi_nhanh_id is not null
        and q.module = p_module and q.hanh_dong = p_hanh_dong
    )
  end
$$;

-- Tiện ích: kiểm tra quyền tại MỘT chi nhánh cụ thể.
-- Dùng trong trigger nghiệp vụ (vd chặn 'duyet' phiếu của chi nhánh khác).
create or replace function bao_mat.co_quyen_cn(p_module text, p_hanh_dong text, p_chi_nhanh uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_chi_nhanh = any (bao_mat.cn_duoc_phep(p_module, p_hanh_dong)), false)
$$;

-- Các chi nhánh user được gán (bất kể quyền) — dùng cho danh sách chi nhánh.
create or replace function bao_mat.cac_chi_nhanh() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when bao_mat.la_quan_tri()
      then (select coalesce(array_agg(id), '{}'::uuid[]) from chi_nhanh)
    else (
      select coalesce(array_agg(distinct chi_nhanh_id), '{}'::uuid[])
      from nguoi_dung_vai_tro
      where nguoi_dung_id = bao_mat.nguoi_dung_id() and chi_nhanh_id is not null
    )
  end
$$;

-- Tra chi nhánh của chứng từ cha (SECURITY DEFINER: không kích hoạt RLS lồng nhau).
create or replace function bao_mat.cn_phieu_nhap(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from phieu_nhap_kho where id = p_id $$;

create or replace function bao_mat.cn_phieu_san_xuat(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from phieu_san_xuat where id = p_id $$;

create or replace function bao_mat.cn_hoa_don_ban(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from hoa_don_ban where id = p_id $$;

create or replace function bao_mat.cn_don_hang_b2b(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_giao_id from don_hang_b2b where id = p_id $$;

create or replace function bao_mat.cn_tai_san(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from tai_san where id = p_id $$;

-- Phiếu xuất kho có HAI đầu (kho xuất / kho nhận) — bên nào cũng được thao tác.
create or replace function bao_mat.duoc_thao_tac_phieu_xuat(p_id uuid, p_hanh_dong text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from phieu_xuat_kho px
    where px.id = p_id
      and (px.kho_xuat_id = any (bao_mat.cn_duoc_phep('kho', p_hanh_dong))
        or px.kho_nhan_id = any (bao_mat.cn_duoc_phep('kho', p_hanh_dong)))
  )
$$;

-- Chuyến giao hàng: điểm đi / điểm đến / tài xế phụ trách.
create or replace function bao_mat.duoc_thao_tac_chuyen(p_id uuid, p_hanh_dong text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from chuyen_giao_hang c
    where c.id = p_id
      and (c.diem_di_id  = any (bao_mat.cn_duoc_phep('logistics', p_hanh_dong))
        or c.diem_den_id = any (bao_mat.cn_duoc_phep('logistics', p_hanh_dong))
        or (p_hanh_dong = 'xem' and c.tai_xe_id is not null
            and c.tai_xe_id = bao_mat.nhan_vien_id()))
  )
$$;

-- Khách B2B: xem toàn bộ nếu có quyền toàn cục, ngược lại chỉ khách mình phụ trách.
create or replace function bao_mat.duoc_xem_kh_b2b(p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select bao_mat.co_quyen_toan_cuc('b2b', 'xem')
      or (bao_mat.co_quyen_moi_noi('b2b', 'xem') and exists (
            select 1 from khach_hang_b2b k
            where k.id = p_id
              and k.nhan_vien_phu_trach_id is not null
              and k.nhan_vien_phu_trach_id = bao_mat.nhan_vien_id()))
$$;

create or replace function bao_mat.kh_cua_hoa_don_b2b(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select khach_hang_b2b_id from hoa_don_b2b where id = p_id $$;

grant execute on all functions in schema bao_mat to authenticated, service_role;

-- ------------------------------------------------------------
-- 4.3 BỘ SINH POLICY
-- Ba khuôn mẫu dưới đây tạo policy cho phần lớn bảng.
-- Đọc kỹ thân hàm: đây chính là nội dung policy được sinh ra.
-- ------------------------------------------------------------

-- Khuôn A — DANH MỤC DÙNG CHUNG: ai có quyền 'xem' ở bất kỳ đâu thì đọc được;
-- chỉ vai trò TOÀN HỆ THỐNG mới được sửa (tránh chi nhánh sửa danh mục chung).
create or replace function bao_mat.gen_policy_danh_muc(p_bang text, p_module text)
returns void language plpgsql as $body$
begin
  execute format('alter table public.%I enable row level security', p_bang);

  execute format('drop policy if exists %I on public.%I', p_bang || '_xem', p_bang);
  execute format($f$create policy %I on public.%I for select to authenticated
      using (bao_mat.co_quyen_moi_noi(%L, 'xem'))$f$, p_bang || '_xem', p_bang, p_module);

  execute format('drop policy if exists %I on public.%I', p_bang || '_them', p_bang);
  execute format($f$create policy %I on public.%I for insert to authenticated
      with check (bao_mat.co_quyen_toan_cuc(%L, 'tao'))$f$, p_bang || '_them', p_bang, p_module);

  execute format('drop policy if exists %I on public.%I', p_bang || '_sua', p_bang);
  execute format($f$create policy %I on public.%I for update to authenticated
      using (bao_mat.co_quyen_toan_cuc(%L, 'sua'))
      with check (bao_mat.co_quyen_toan_cuc(%L, 'sua'))$f$,
      p_bang || '_sua', p_bang, p_module, p_module);

  execute format('drop policy if exists %I on public.%I', p_bang || '_xoa', p_bang);
  execute format($f$create policy %I on public.%I for delete to authenticated
      using (bao_mat.co_quyen_toan_cuc(%L, 'xoa'))$f$, p_bang || '_xoa', p_bang, p_module);
end;
$body$;

-- Khuôn B — BẢNG NGHIỆP VỤ KHÔNG GẮN CHI NHÁNH: quyền ở bất kỳ phạm vi nào là đủ.
create or replace function bao_mat.gen_policy_chung(p_bang text, p_module text)
returns void language plpgsql as $body$
begin
  execute format('alter table public.%I enable row level security', p_bang);

  execute format('drop policy if exists %I on public.%I', p_bang || '_xem', p_bang);
  execute format($f$create policy %I on public.%I for select to authenticated
      using (bao_mat.co_quyen_moi_noi(%L, 'xem'))$f$, p_bang || '_xem', p_bang, p_module);

  execute format('drop policy if exists %I on public.%I', p_bang || '_them', p_bang);
  execute format($f$create policy %I on public.%I for insert to authenticated
      with check (bao_mat.co_quyen_moi_noi(%L, 'tao'))$f$, p_bang || '_them', p_bang, p_module);

  execute format('drop policy if exists %I on public.%I', p_bang || '_sua', p_bang);
  execute format($f$create policy %I on public.%I for update to authenticated
      using (bao_mat.co_quyen_moi_noi(%L, 'sua'))
      with check (bao_mat.co_quyen_moi_noi(%L, 'sua'))$f$,
      p_bang || '_sua', p_bang, p_module, p_module);

  execute format('drop policy if exists %I on public.%I', p_bang || '_xoa', p_bang);
  execute format($f$create policy %I on public.%I for delete to authenticated
      using (bao_mat.co_quyen_moi_noi(%L, 'xoa'))$f$, p_bang || '_xoa', p_bang, p_module);
end;
$body$;

-- Khuôn C — BẢNG GẮN CHI NHÁNH (quan trọng nhất).
-- p_cho_phep_null = true khi cột chi nhánh nullable (dòng "toàn công ty"):
-- các dòng đó chỉ hiện với vai trò toàn hệ thống.
create or replace function bao_mat.gen_policy_chi_nhanh(
  p_bang text, p_module text,
  p_cot text default 'chi_nhanh_id',
  p_cho_phep_null boolean default false
) returns void language plpgsql as $body$
declare
  v_xem text := ''; v_tao text := ''; v_sua text := ''; v_xoa text := '';
begin
  if p_cho_phep_null then
    v_xem := format(' or (%I is null and bao_mat.co_quyen_toan_cuc(%L, ''xem''))', p_cot, p_module);
    v_tao := format(' or (%I is null and bao_mat.co_quyen_toan_cuc(%L, ''tao''))', p_cot, p_module);
    v_sua := format(' or (%I is null and bao_mat.co_quyen_toan_cuc(%L, ''sua''))', p_cot, p_module);
    v_xoa := format(' or (%I is null and bao_mat.co_quyen_toan_cuc(%L, ''xoa''))', p_cot, p_module);
  end if;

  execute format('alter table public.%I enable row level security', p_bang);

  execute format('drop policy if exists %I on public.%I', p_bang || '_xem', p_bang);
  execute format($f$create policy %I on public.%I for select to authenticated
      using (%I in (select unnest(bao_mat.cn_duoc_phep(%L, 'xem')))%s)$f$,
      p_bang || '_xem', p_bang, p_cot, p_module, v_xem);

  execute format('drop policy if exists %I on public.%I', p_bang || '_them', p_bang);
  execute format($f$create policy %I on public.%I for insert to authenticated
      with check (%I in (select unnest(bao_mat.cn_duoc_phep(%L, 'tao')))%s)$f$,
      p_bang || '_them', p_bang, p_cot, p_module, v_tao);

  -- USING + WITH CHECK cùng lúc: chặn "chuyển" một dòng sang chi nhánh khác.
  execute format('drop policy if exists %I on public.%I', p_bang || '_sua', p_bang);
  execute format($f$create policy %I on public.%I for update to authenticated
      using (%I in (select unnest(bao_mat.cn_duoc_phep(%L, 'sua')))%s)
      with check (%I in (select unnest(bao_mat.cn_duoc_phep(%L, 'sua')))%s)$f$,
      p_bang || '_sua', p_bang, p_cot, p_module, v_sua, p_cot, p_module, v_sua);

  execute format('drop policy if exists %I on public.%I', p_bang || '_xoa', p_bang);
  execute format($f$create policy %I on public.%I for delete to authenticated
      using (%I in (select unnest(bao_mat.cn_duoc_phep(%L, 'xoa')))%s)$f$,
      p_bang || '_xoa', p_bang, p_cot, p_module, v_xoa);
end;
$body$;

-- Khuôn D — BẢNG CHI TIẾT: lấy chi nhánh từ chứng từ cha qua hàm p_ham_cn.
create or replace function bao_mat.gen_policy_con(
  p_bang text, p_module text, p_cot_fk text, p_ham_cn text,
  p_cho_phep_null boolean default false
) returns void language plpgsql as $body$
declare
  v_null text := '';
begin
  if p_cho_phep_null then
    v_null := format(' or (%s(%I) is null and bao_mat.co_quyen_toan_cuc(%L, ''xem''))',
                     p_ham_cn, p_cot_fk, p_module);
  end if;

  execute format('alter table public.%I enable row level security', p_bang);

  execute format('drop policy if exists %I on public.%I', p_bang || '_xem', p_bang);
  execute format($f$create policy %I on public.%I for select to authenticated
      using (%s(%I) in (select unnest(bao_mat.cn_duoc_phep(%L, 'xem')))%s)$f$,
      p_bang || '_xem', p_bang, p_ham_cn, p_cot_fk, p_module, v_null);

  execute format('drop policy if exists %I on public.%I', p_bang || '_them', p_bang);
  execute format($f$create policy %I on public.%I for insert to authenticated
      with check (%s(%I) in (select unnest(bao_mat.cn_duoc_phep(%L, 'tao'))))$f$,
      p_bang || '_them', p_bang, p_ham_cn, p_cot_fk, p_module);

  execute format('drop policy if exists %I on public.%I', p_bang || '_sua', p_bang);
  execute format($f$create policy %I on public.%I for update to authenticated
      using (%s(%I) in (select unnest(bao_mat.cn_duoc_phep(%L, 'sua'))))
      with check (%s(%I) in (select unnest(bao_mat.cn_duoc_phep(%L, 'sua'))))$f$,
      p_bang || '_sua', p_bang, p_ham_cn, p_cot_fk, p_module, p_ham_cn, p_cot_fk, p_module);

  execute format('drop policy if exists %I on public.%I', p_bang || '_xoa', p_bang);
  execute format($f$create policy %I on public.%I for delete to authenticated
      using (%s(%I) in (select unnest(bao_mat.cn_duoc_phep(%L, 'xoa'))))$f$,
      p_bang || '_xoa', p_bang, p_ham_cn, p_cot_fk, p_module);
end;
$body$;

-- ------------------------------------------------------------
-- 4.4 ÁP DỤNG KHUÔN MẪU
-- ------------------------------------------------------------

-- Danh mục dùng chung (sửa = vai trò toàn hệ thống)
select bao_mat.gen_policy_danh_muc('don_vi_tinh',           'danh_muc');
select bao_mat.gen_policy_danh_muc('vat_tu',                'danh_muc');
select bao_mat.gen_policy_danh_muc('nha_cung_cap',          'danh_muc');
select bao_mat.gen_policy_danh_muc('loai_chi_phi',          'tai_chinh');
select bao_mat.gen_policy_danh_muc('cong_thuc_san_xuat',    'cong_thuc');
select bao_mat.gen_policy_danh_muc('chi_tiet_cong_thuc',    'cong_thuc');
select bao_mat.gen_policy_danh_muc('bang_gia_b2b',          'b2b');
select bao_mat.gen_policy_danh_muc('chi_tiet_bang_gia_b2b', 'b2b');
select bao_mat.gen_policy_danh_muc('tieu_chuan_chat_luong', 'qa_qc');
select bao_mat.gen_policy_danh_muc('phuong_tien',           'logistics');

-- Bảng nghiệp vụ không gắn chi nhánh
select bao_mat.gen_policy_chung('khach_hang',          'ban_le');
select bao_mat.gen_policy_chung('lo_hang',             'qa_qc');
select bao_mat.gen_policy_chung('kiem_tra_chat_luong', 'qa_qc');
select bao_mat.gen_policy_chung('phieu_chi_ncc',       'cong_no');

-- Bảng gắn chi nhánh
select bao_mat.gen_policy_chi_nhanh('phieu_nhap_kho',   'mua_hang');
select bao_mat.gen_policy_chi_nhanh('phieu_san_xuat',   'san_xuat');
select bao_mat.gen_policy_chi_nhanh('hoa_don_ban',      'ban_le');
select bao_mat.gen_policy_chi_nhanh('nhat_ky_nhiet_do', 'qa_qc');
select bao_mat.gen_policy_chi_nhanh('tai_san',   'tai_san',   'chi_nhanh_id', true);
select bao_mat.gen_policy_chi_nhanh('giay_phep', 'phap_ly',   'chi_nhanh_id', true);
select bao_mat.gen_policy_chi_nhanh('hop_dong',  'phap_ly',   'chi_nhanh_id', true);
select bao_mat.gen_policy_chi_nhanh('chi_phi',   'tai_chinh', 'chi_nhanh_id', true);

-- Bảng chi tiết (theo chi nhánh của chứng từ cha)
select bao_mat.gen_policy_con('chi_tiet_phieu_nhap',        'mua_hang', 'phieu_nhap_id',     'bao_mat.cn_phieu_nhap');
select bao_mat.gen_policy_con('chi_tiet_san_xuat_dau_vao',  'san_xuat', 'phieu_san_xuat_id', 'bao_mat.cn_phieu_san_xuat');
select bao_mat.gen_policy_con('chi_tiet_hoa_don_ban',       'ban_le',   'hoa_don_id',        'bao_mat.cn_hoa_don_ban');
select bao_mat.gen_policy_con('chi_tiet_don_hang_b2b',      'b2b',      'don_hang_id',       'bao_mat.cn_don_hang_b2b');
select bao_mat.gen_policy_con('phieu_bao_tri',              'tai_san',  'tai_san_id',        'bao_mat.cn_tai_san', true);

-- Bộ sinh policy chỉ dành cho lúc migrate — cắt quyền gọi của người dùng cuối.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'bao_mat' and p.proname like 'gen\_policy\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4.5 CÁC BẢNG CẦN POLICY RIÊNG
-- ------------------------------------------------------------

-- ===== TỒN KHO / THẺ KHO / GIỮ CHỖ: CHỈ ĐỌC =====
-- Không có policy insert/update/delete => authenticated không ghi trực tiếp được.
-- Ghi chỉ xảy ra bên trong fn_capnhat_ton_kho / fn_nhap_kho_cap_nhat_gia_von /
-- fn_giu_cho_kho (SECURITY DEFINER, xem 4.6).
alter table ton_kho enable row level security;
drop policy if exists ton_kho_xem on ton_kho;
create policy ton_kho_xem on ton_kho for select to authenticated
  using (chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'xem'))));

alter table the_kho enable row level security;
drop policy if exists the_kho_xem on the_kho;
create policy the_kho_xem on the_kho for select to authenticated
  using (chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'xem'))));

alter table lich_su_giu_cho enable row level security;
drop policy if exists lich_su_giu_cho_xem on lich_su_giu_cho;
create policy lich_su_giu_cho_xem on lich_su_giu_cho for select to authenticated
  using (chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'xem'))));

-- ===== PHIẾU XUẤT KHO: hai đầu kho =====
alter table phieu_xuat_kho enable row level security;

drop policy if exists phieu_xuat_kho_xem on phieu_xuat_kho;
create policy phieu_xuat_kho_xem on phieu_xuat_kho for select to authenticated
  using (kho_xuat_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'xem')))
      or kho_nhan_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'xem'))));

drop policy if exists phieu_xuat_kho_them on phieu_xuat_kho;
create policy phieu_xuat_kho_them on phieu_xuat_kho for insert to authenticated
  with check (kho_xuat_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'tao'))));

-- Kho nhận cần sửa để xác nhận "da_nhan" => cho phép cả hai đầu.
drop policy if exists phieu_xuat_kho_sua on phieu_xuat_kho;
create policy phieu_xuat_kho_sua on phieu_xuat_kho for update to authenticated
  using (kho_xuat_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'sua')))
      or kho_nhan_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'sua'))))
  with check (kho_xuat_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'sua')))
      or kho_nhan_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'sua'))));

drop policy if exists phieu_xuat_kho_xoa on phieu_xuat_kho;
create policy phieu_xuat_kho_xoa on phieu_xuat_kho for delete to authenticated
  using (kho_xuat_id in (select unnest(bao_mat.cn_duoc_phep('kho', 'xoa'))));

alter table chi_tiet_phieu_xuat enable row level security;
drop policy if exists chi_tiet_phieu_xuat_xem on chi_tiet_phieu_xuat;
create policy chi_tiet_phieu_xuat_xem on chi_tiet_phieu_xuat for select to authenticated
  using (bao_mat.duoc_thao_tac_phieu_xuat(phieu_xuat_id, 'xem'));
drop policy if exists chi_tiet_phieu_xuat_them on chi_tiet_phieu_xuat;
create policy chi_tiet_phieu_xuat_them on chi_tiet_phieu_xuat for insert to authenticated
  with check (bao_mat.duoc_thao_tac_phieu_xuat(phieu_xuat_id, 'tao'));
drop policy if exists chi_tiet_phieu_xuat_sua on chi_tiet_phieu_xuat;
create policy chi_tiet_phieu_xuat_sua on chi_tiet_phieu_xuat for update to authenticated
  using (bao_mat.duoc_thao_tac_phieu_xuat(phieu_xuat_id, 'sua'))
  with check (bao_mat.duoc_thao_tac_phieu_xuat(phieu_xuat_id, 'sua'));
drop policy if exists chi_tiet_phieu_xuat_xoa on chi_tiet_phieu_xuat;
create policy chi_tiet_phieu_xuat_xoa on chi_tiet_phieu_xuat for delete to authenticated
  using (bao_mat.duoc_thao_tac_phieu_xuat(phieu_xuat_id, 'xoa'));

-- ===== LOGISTICS =====
alter table chuyen_giao_hang enable row level security;
drop policy if exists chuyen_giao_hang_xem on chuyen_giao_hang;
create policy chuyen_giao_hang_xem on chuyen_giao_hang for select to authenticated
  using (diem_di_id  in (select unnest(bao_mat.cn_duoc_phep('logistics', 'xem')))
      or diem_den_id in (select unnest(bao_mat.cn_duoc_phep('logistics', 'xem')))
      or (tai_xe_id is not null and tai_xe_id = bao_mat.nhan_vien_id()));
drop policy if exists chuyen_giao_hang_them on chuyen_giao_hang;
create policy chuyen_giao_hang_them on chuyen_giao_hang for insert to authenticated
  with check (diem_di_id in (select unnest(bao_mat.cn_duoc_phep('logistics', 'tao'))));
drop policy if exists chuyen_giao_hang_sua on chuyen_giao_hang;
create policy chuyen_giao_hang_sua on chuyen_giao_hang for update to authenticated
  using (diem_di_id  in (select unnest(bao_mat.cn_duoc_phep('logistics', 'sua')))
      or diem_den_id in (select unnest(bao_mat.cn_duoc_phep('logistics', 'sua')))
      or (tai_xe_id is not null and tai_xe_id = bao_mat.nhan_vien_id()))
  with check (diem_di_id  in (select unnest(bao_mat.cn_duoc_phep('logistics', 'sua')))
      or diem_den_id in (select unnest(bao_mat.cn_duoc_phep('logistics', 'sua')))
      or (tai_xe_id is not null and tai_xe_id = bao_mat.nhan_vien_id()));
drop policy if exists chuyen_giao_hang_xoa on chuyen_giao_hang;
create policy chuyen_giao_hang_xoa on chuyen_giao_hang for delete to authenticated
  using (diem_di_id in (select unnest(bao_mat.cn_duoc_phep('logistics', 'xoa'))));

alter table chi_tiet_chuyen_giao_hang enable row level security;
drop policy if exists chi_tiet_chuyen_giao_hang_xem on chi_tiet_chuyen_giao_hang;
create policy chi_tiet_chuyen_giao_hang_xem on chi_tiet_chuyen_giao_hang for select to authenticated
  using (bao_mat.duoc_thao_tac_chuyen(chuyen_giao_id, 'xem'));
drop policy if exists chi_tiet_chuyen_giao_hang_them on chi_tiet_chuyen_giao_hang;
create policy chi_tiet_chuyen_giao_hang_them on chi_tiet_chuyen_giao_hang for insert to authenticated
  with check (bao_mat.duoc_thao_tac_chuyen(chuyen_giao_id, 'tao'));
drop policy if exists chi_tiet_chuyen_giao_hang_sua on chi_tiet_chuyen_giao_hang;
create policy chi_tiet_chuyen_giao_hang_sua on chi_tiet_chuyen_giao_hang for update to authenticated
  using (bao_mat.duoc_thao_tac_chuyen(chuyen_giao_id, 'sua'))
  with check (bao_mat.duoc_thao_tac_chuyen(chuyen_giao_id, 'sua'));
drop policy if exists chi_tiet_chuyen_giao_hang_xoa on chi_tiet_chuyen_giao_hang;
create policy chi_tiet_chuyen_giao_hang_xoa on chi_tiet_chuyen_giao_hang for delete to authenticated
  using (bao_mat.duoc_thao_tac_chuyen(chuyen_giao_id, 'xoa'));

-- ===== B2B: cô lập theo nhân viên phụ trách =====
alter table khach_hang_b2b enable row level security;
drop policy if exists khach_hang_b2b_xem on khach_hang_b2b;
create policy khach_hang_b2b_xem on khach_hang_b2b for select to authenticated
  using (bao_mat.co_quyen_toan_cuc('b2b', 'xem')
      or (bao_mat.co_quyen_moi_noi('b2b', 'xem')
          and nhan_vien_phu_trach_id is not null
          and nhan_vien_phu_trach_id = bao_mat.nhan_vien_id()));
drop policy if exists khach_hang_b2b_them on khach_hang_b2b;
create policy khach_hang_b2b_them on khach_hang_b2b for insert to authenticated
  with check (bao_mat.co_quyen_moi_noi('b2b', 'tao'));
drop policy if exists khach_hang_b2b_sua on khach_hang_b2b;
create policy khach_hang_b2b_sua on khach_hang_b2b for update to authenticated
  using (bao_mat.co_quyen_toan_cuc('b2b', 'sua')
      or (bao_mat.co_quyen_moi_noi('b2b', 'sua')
          and nhan_vien_phu_trach_id = bao_mat.nhan_vien_id()))
  with check (bao_mat.co_quyen_toan_cuc('b2b', 'sua')
      or (bao_mat.co_quyen_moi_noi('b2b', 'sua')
          and nhan_vien_phu_trach_id = bao_mat.nhan_vien_id()));
drop policy if exists khach_hang_b2b_xoa on khach_hang_b2b;
create policy khach_hang_b2b_xoa on khach_hang_b2b for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('b2b', 'xoa'));

alter table don_hang_b2b enable row level security;
drop policy if exists don_hang_b2b_xem on don_hang_b2b;
create policy don_hang_b2b_xem on don_hang_b2b for select to authenticated
  using (chi_nhanh_giao_id in (select unnest(bao_mat.cn_duoc_phep('b2b', 'xem')))
      or bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));
drop policy if exists don_hang_b2b_them on don_hang_b2b;
create policy don_hang_b2b_them on don_hang_b2b for insert to authenticated
  with check (chi_nhanh_giao_id in (select unnest(bao_mat.cn_duoc_phep('b2b', 'tao')))
      or (bao_mat.co_quyen_moi_noi('b2b', 'tao') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id)));
drop policy if exists don_hang_b2b_sua on don_hang_b2b;
create policy don_hang_b2b_sua on don_hang_b2b for update to authenticated
  using (chi_nhanh_giao_id in (select unnest(bao_mat.cn_duoc_phep('b2b', 'sua')))
      or (bao_mat.co_quyen_moi_noi('b2b', 'sua') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id)))
  with check (chi_nhanh_giao_id in (select unnest(bao_mat.cn_duoc_phep('b2b', 'sua')))
      or (bao_mat.co_quyen_moi_noi('b2b', 'sua') and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id)));
drop policy if exists don_hang_b2b_xoa on don_hang_b2b;
create policy don_hang_b2b_xoa on don_hang_b2b for delete to authenticated
  using (chi_nhanh_giao_id in (select unnest(bao_mat.cn_duoc_phep('b2b', 'xoa'))));

alter table hoa_don_b2b enable row level security;
drop policy if exists hoa_don_b2b_xem on hoa_don_b2b;
create policy hoa_don_b2b_xem on hoa_don_b2b for select to authenticated
  using (bao_mat.co_quyen_moi_noi('cong_no', 'xem')
         and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));
drop policy if exists hoa_don_b2b_them on hoa_don_b2b;
create policy hoa_don_b2b_them on hoa_don_b2b for insert to authenticated
  with check (bao_mat.co_quyen_moi_noi('cong_no', 'tao')
         and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));
drop policy if exists hoa_don_b2b_sua on hoa_don_b2b;
create policy hoa_don_b2b_sua on hoa_don_b2b for update to authenticated
  using (bao_mat.co_quyen_moi_noi('cong_no', 'sua')
         and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id))
  with check (bao_mat.co_quyen_moi_noi('cong_no', 'sua')
         and bao_mat.duoc_xem_kh_b2b(khach_hang_b2b_id));
drop policy if exists hoa_don_b2b_xoa on hoa_don_b2b;
create policy hoa_don_b2b_xoa on hoa_don_b2b for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('cong_no', 'xoa'));

alter table phieu_thu_cong_no enable row level security;
drop policy if exists phieu_thu_cong_no_xem on phieu_thu_cong_no;
create policy phieu_thu_cong_no_xem on phieu_thu_cong_no for select to authenticated
  using (bao_mat.co_quyen_moi_noi('cong_no', 'xem')
         and bao_mat.duoc_xem_kh_b2b(bao_mat.kh_cua_hoa_don_b2b(hoa_don_b2b_id)));
drop policy if exists phieu_thu_cong_no_them on phieu_thu_cong_no;
create policy phieu_thu_cong_no_them on phieu_thu_cong_no for insert to authenticated
  with check (bao_mat.co_quyen_moi_noi('cong_no', 'tao')
         and bao_mat.duoc_xem_kh_b2b(bao_mat.kh_cua_hoa_don_b2b(hoa_don_b2b_id)));
-- Phiếu thu đã ghi thì không sửa/xóa (chỉ vai trò toàn cục, để đối soát).
drop policy if exists phieu_thu_cong_no_sua on phieu_thu_cong_no;
create policy phieu_thu_cong_no_sua on phieu_thu_cong_no for update to authenticated
  using (bao_mat.co_quyen_toan_cuc('cong_no', 'sua'))
  with check (bao_mat.co_quyen_toan_cuc('cong_no', 'sua'));
drop policy if exists phieu_thu_cong_no_xoa on phieu_thu_cong_no;
create policy phieu_thu_cong_no_xoa on phieu_thu_cong_no for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('cong_no', 'xoa'));

-- ===== CHI NHÁNH: chỉ thấy chi nhánh mình thuộc về =====
alter table chi_nhanh enable row level security;
drop policy if exists chi_nhanh_xem on chi_nhanh;
create policy chi_nhanh_xem on chi_nhanh for select to authenticated
  using (id in (select unnest(bao_mat.cac_chi_nhanh()))
      or bao_mat.co_quyen_toan_cuc('danh_muc', 'xem'));
drop policy if exists chi_nhanh_them on chi_nhanh;
create policy chi_nhanh_them on chi_nhanh for insert to authenticated
  with check (bao_mat.co_quyen_toan_cuc('he_thong', 'tao'));
drop policy if exists chi_nhanh_sua on chi_nhanh;
create policy chi_nhanh_sua on chi_nhanh for update to authenticated
  using (bao_mat.co_quyen_toan_cuc('he_thong', 'sua'))
  with check (bao_mat.co_quyen_toan_cuc('he_thong', 'sua'));
drop policy if exists chi_nhanh_xoa on chi_nhanh;
create policy chi_nhanh_xoa on chi_nhanh for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('he_thong', 'xoa'));

-- ===== NHÂN VIÊN =====
alter table nhan_vien enable row level security;
drop policy if exists nhan_vien_xem on nhan_vien;
create policy nhan_vien_xem on nhan_vien for select to authenticated
  using (id = bao_mat.nhan_vien_id()
      or chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'xem')))
      or (chi_nhanh_id is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'xem')));
drop policy if exists nhan_vien_them on nhan_vien;
create policy nhan_vien_them on nhan_vien for insert to authenticated
  with check (chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'tao')))
      or (chi_nhanh_id is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'tao')));
drop policy if exists nhan_vien_sua on nhan_vien;
create policy nhan_vien_sua on nhan_vien for update to authenticated
  using (chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'sua')))
      or (chi_nhanh_id is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'sua')))
  with check (chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('nhan_su', 'sua')))
      or (chi_nhanh_id is null and bao_mat.co_quyen_toan_cuc('nhan_su', 'sua')));
drop policy if exists nhan_vien_xoa on nhan_vien;
create policy nhan_vien_xoa on nhan_vien for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('nhan_su', 'xoa'));

-- ===== PHÂN QUYỀN: chỉ vai trò toàn hệ thống được ghi =====
-- (Nếu để chi nhánh tự gán vai trò => leo thang đặc quyền, tự cấp quyền
--  cho chi nhánh khác. Vì vậy mọi thao tác ghi đều đòi phạm vi toàn cục.)
alter table nguoi_dung_he_thong enable row level security;
drop policy if exists nguoi_dung_he_thong_xem on nguoi_dung_he_thong;
create policy nguoi_dung_he_thong_xem on nguoi_dung_he_thong for select to authenticated
  using (id = bao_mat.nguoi_dung_id() or bao_mat.co_quyen_toan_cuc('he_thong', 'xem'));
drop policy if exists nguoi_dung_he_thong_them on nguoi_dung_he_thong;
create policy nguoi_dung_he_thong_them on nguoi_dung_he_thong for insert to authenticated
  with check (bao_mat.co_quyen_toan_cuc('he_thong', 'tao'));
drop policy if exists nguoi_dung_he_thong_sua on nguoi_dung_he_thong;
create policy nguoi_dung_he_thong_sua on nguoi_dung_he_thong for update to authenticated
  using (bao_mat.co_quyen_toan_cuc('he_thong', 'sua'))
  with check (bao_mat.co_quyen_toan_cuc('he_thong', 'sua'));
drop policy if exists nguoi_dung_he_thong_xoa on nguoi_dung_he_thong;
create policy nguoi_dung_he_thong_xoa on nguoi_dung_he_thong for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('he_thong', 'xoa'));

alter table nguoi_dung_vai_tro enable row level security;
drop policy if exists nguoi_dung_vai_tro_xem on nguoi_dung_vai_tro;
create policy nguoi_dung_vai_tro_xem on nguoi_dung_vai_tro for select to authenticated
  using (nguoi_dung_id = bao_mat.nguoi_dung_id() or bao_mat.co_quyen_toan_cuc('he_thong', 'xem'));
drop policy if exists nguoi_dung_vai_tro_them on nguoi_dung_vai_tro;
create policy nguoi_dung_vai_tro_them on nguoi_dung_vai_tro for insert to authenticated
  with check (bao_mat.co_quyen_toan_cuc('he_thong', 'tao'));
drop policy if exists nguoi_dung_vai_tro_sua on nguoi_dung_vai_tro;
create policy nguoi_dung_vai_tro_sua on nguoi_dung_vai_tro for update to authenticated
  using (bao_mat.co_quyen_toan_cuc('he_thong', 'sua'))
  with check (bao_mat.co_quyen_toan_cuc('he_thong', 'sua'));
drop policy if exists nguoi_dung_vai_tro_xoa on nguoi_dung_vai_tro;
create policy nguoi_dung_vai_tro_xoa on nguoi_dung_vai_tro for delete to authenticated
  using (bao_mat.co_quyen_toan_cuc('he_thong', 'xoa'));

-- Danh mục vai trò / quyền: đọc được để dựng UI, ghi thì phải toàn cục.
select bao_mat.gen_policy_danh_muc('vai_tro_he_thong', 'he_thong');
select bao_mat.gen_policy_danh_muc('quyen_he_thong',   'he_thong');
select bao_mat.gen_policy_danh_muc('vai_tro_quyen',    'he_thong');

drop policy if exists vai_tro_he_thong_xem on vai_tro_he_thong;
create policy vai_tro_he_thong_xem on vai_tro_he_thong for select to authenticated using (true);
drop policy if exists quyen_he_thong_xem on quyen_he_thong;
create policy quyen_he_thong_xem on quyen_he_thong for select to authenticated using (true);
drop policy if exists vai_tro_quyen_xem on vai_tro_quyen;
create policy vai_tro_quyen_xem on vai_tro_quyen for select to authenticated using (true);

-- ===== NHẬT KÝ HỆ THỐNG: chỉ đọc, chỉ vai trò toàn cục; không ai sửa/xóa =====
alter table nhat_ky_he_thong enable row level security;
drop policy if exists nhat_ky_he_thong_xem on nhat_ky_he_thong;
create policy nhat_ky_he_thong_xem on nhat_ky_he_thong for select to authenticated
  using (bao_mat.co_quyen_toan_cuc('he_thong', 'xem'));
drop policy if exists nhat_ky_he_thong_them on nhat_ky_he_thong;
create policy nhat_ky_he_thong_them on nhat_ky_he_thong for insert to authenticated
  with check (nguoi_dung_id = bao_mat.nguoi_dung_id());
-- Cố ý KHÔNG có policy update/delete: nhật ký là append-only.

-- ------------------------------------------------------------
-- 4.6 KHÓA CÁC HÀM KHO
-- Chuyển sang SECURITY DEFINER: trigger vẫn ghi được ton_kho/the_kho
-- dù user không có policy ghi. Đồng thời thu hồi quyền gọi trực tiếp
-- để không ai sửa kho qua RPC mà bỏ qua chứng từ.
-- ------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'fn\_%' or p.proname like 'trg\_fn\_%')
  loop
    execute format('alter function %s security definer', r.sig);
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon, authenticated', r.sig);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4.7 QUYỀN CẤP BẢNG (lớp phòng thủ thứ hai)
-- RLS chỉ có tác dụng khi role còn quyền GRANT. Với anon ta cắt hẳn.
-- ------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- ------------------------------------------------------------
-- 4.8 KIỂM TRA: mọi bảng trong public phải bật RLS
-- ------------------------------------------------------------

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
