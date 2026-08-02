-- ============================================================
-- 11. KẾ TOÁN — SỔ CÁI KÉP
--
-- Thiết kế tối giản có chủ đích: một tài khoản "Hàng tồn kho" (156)
-- duy nhất cho cả NVL/BTP/thành phẩm (khớp với ton_kho hiện có, vốn
-- cũng không tách theo loại). KHÔNG hạch toán chuyển đổi nội bộ khi
-- sản xuất (NVL -> BTP -> thành phẩm) vì tất cả đều nằm trong 156 —
-- tổng giá trị không đổi, không phải bút toán kế toán thật.
--
-- Tất cả bút toán tự động đều là ƯỚC LƯỢNG ĐƠN GIẢN, không thay thế
-- vai trò của kế toán viên thật: không tách nhiều loại thuế, không xử
-- lý chiết khấu thương mại phức tạp, không phân biệt tiền mặt/công nợ
-- tại thời điểm bán lẻ (giả định thu ngay).
--
--   11.1 Hệ thống tài khoản (chart of accounts) + seed
--   11.2 Bút toán + chi tiết bút toán — CHỈ GHI QUA HÀM
--   11.3 Hàm ghi bút toán dùng chung (idempotent theo nguồn gốc)
--   11.4 Tự động hạch toán từ giao dịch đã có
--   11.5 View báo cáo: sổ cái, cân đối thử, lãi lỗ, cân đối kế toán
--   11.6 RLS
-- ============================================================

-- ------------------------------------------------------------
-- 11.1 HỆ THỐNG TÀI KHOẢN
-- ------------------------------------------------------------

create table if not exists he_thong_tai_khoan (
  id uuid primary key default gen_random_uuid(),
  so_hieu text unique not null,
  ten_tai_khoan text not null,
  loai text not null
      check (loai in ('tai_san','no_phai_tra','von_chu_so_huu','doanh_thu','chi_phi')),
  -- true: số dư tăng bên Nợ (tài sản, chi phí) — false: tăng bên Có (nợ phải trả, vốn, doanh thu)
  ben_no_la_tang boolean not null,
  dang_su_dung boolean not null default true,
  created_at timestamptz not null default now()
);

insert into he_thong_tai_khoan (so_hieu, ten_tai_khoan, loai, ben_no_la_tang) values
  ('111',  'Tiền mặt',                    'tai_san',        true),
  ('112',  'Tiền gửi ngân hàng',          'tai_san',        true),
  ('131',  'Phải thu khách hàng',         'tai_san',        true),
  ('156',  'Hàng tồn kho',                'tai_san',        true),
  ('331',  'Phải trả người bán',          'no_phai_tra',    false),
  ('3331', 'Thuế GTGT phải nộp',          'no_phai_tra',    false),
  ('411',  'Vốn góp chủ sở hữu',          'von_chu_so_huu', false),
  ('421',  'Lợi nhuận chưa phân phối',    'von_chu_so_huu', false),
  ('511',  'Doanh thu bán hàng',          'doanh_thu',      false),
  ('632',  'Giá vốn hàng bán',            'chi_phi',        true),
  ('642',  'Chi phí quản lý vận hành',    'chi_phi',        true)
on conflict (so_hieu) do nothing;

-- ------------------------------------------------------------
-- 11.2 BÚT TOÁN — CHỈ GHI QUA HÀM
-- Giống nguyên tắc của ton_kho: không có policy insert/update/delete
-- cho authenticated. Ghi tự động qua fn_ghi_but_toan (trigger gọi),
-- ghi thủ công qua rpc_tao_but_toan_thu_cong — cả hai đều tự kiểm tra
-- Nợ = Có trước khi lưu, không dựa vào constraint DB (rút kinh nghiệm
-- từ lỗi UPSERT/CHECK constraint đã gặp ở ton_kho_lo).
-- ------------------------------------------------------------

create table if not exists but_toan (
  id uuid primary key default gen_random_uuid(),
  so_but_toan text unique,
  ngay_hach_toan date not null default current_date,
  dien_giai text,
  nguon_goc_loai text not null
      check (nguon_goc_loai in ('thu_cong','phieu_nhap_kho','hoa_don_ban','hoa_don_b2b',
                                'phieu_thu_cong_no','phieu_chi_ncc','chi_phi')),
  nguon_goc_id uuid not null,
  chi_nhanh_id uuid references chi_nhanh(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nguon_goc_loai, nguon_goc_id)
);

create index if not exists idx_but_toan_ngay on but_toan (ngay_hach_toan);
create index if not exists idx_but_toan_chi_nhanh on but_toan (chi_nhanh_id);

drop trigger if exists trg_updated_at_but_toan on but_toan;
create trigger trg_updated_at_but_toan
before update on but_toan
for each row execute function trg_fn_cap_nhat_updated_at();

-- Tự sinh số bút toán, dùng chung bộ đếm (Tier 3).
drop trigger if exists trg_so_ct_but_toan on but_toan;
create trigger trg_so_ct_but_toan
before insert on but_toan
for each row execute function trg_fn_sinh_so_chung_tu('so_but_toan', 'BT');

create table if not exists chi_tiet_but_toan (
  id uuid primary key default gen_random_uuid(),
  but_toan_id uuid not null references but_toan(id) on delete cascade,
  tai_khoan_id uuid not null references he_thong_tai_khoan(id),
  no numeric(14,2) not null default 0 check (no >= 0),
  co numeric(14,2) not null default 0 check (co >= 0),
  dien_giai text,
  -- Một dòng chỉ ghi MỘT bên: hoặc Nợ hoặc Có, không cả hai, không cả hai đều rỗng.
  check (not (no > 0 and co > 0)),
  check (no > 0 or co > 0)
);

create index if not exists idx_chi_tiet_but_toan_but_toan on chi_tiet_but_toan (but_toan_id);
create index if not exists idx_chi_tiet_but_toan_tk on chi_tiet_but_toan (tai_khoan_id);

-- ------------------------------------------------------------
-- 11.3 HÀM GHI BÚT TOÁN DÙNG CHUNG
--
-- p_dong: mảng jsonb dạng [{"so_hieu":"111","no":100000,"co":0}, ...].
-- Idempotent theo (nguon_goc_loai, nguon_goc_id): gọi lại sẽ XOÁ bút
-- toán cũ của đúng nguồn đó rồi ghi lại — cho phép "tái hạch toán" khi
-- hoá đơn/phiếu bị sửa hoặc huỷ (truyền p_dong = null để chỉ xoá).
-- ------------------------------------------------------------

create or replace function fn_ghi_but_toan(
  p_nguon_goc_loai text,
  p_nguon_goc_id uuid,
  p_ngay date,
  p_dien_giai text,
  p_chi_nhanh_id uuid,
  p_dong jsonb
) returns void as $$
declare
  v_but_toan_id uuid;
  v_dong jsonb;
  v_no numeric;
  v_co numeric;
  v_tong_no numeric := 0;
  v_tong_co numeric := 0;
  v_tk_id uuid;
  v_so_hieu text;
  v_co_dong boolean := false;
begin
  delete from but_toan where nguon_goc_loai = p_nguon_goc_loai and nguon_goc_id = p_nguon_goc_id;

  if p_dong is null or jsonb_array_length(p_dong) = 0 then
    return;
  end if;

  insert into but_toan (nguon_goc_loai, nguon_goc_id, ngay_hach_toan, dien_giai, chi_nhanh_id)
  values (p_nguon_goc_loai, p_nguon_goc_id, coalesce(p_ngay, current_date), p_dien_giai, p_chi_nhanh_id)
  returning id into v_but_toan_id;

  for v_dong in select * from jsonb_array_elements(p_dong)
  loop
    v_no := coalesce((v_dong->>'no')::numeric, 0);
    v_co := coalesce((v_dong->>'co')::numeric, 0);

    -- Bỏ qua dòng rỗng (vd giá vốn = 0 khi chưa có dữ liệu giá) thay vì
    -- để nó vi phạm check "no > 0 or co > 0".
    if v_no = 0 and v_co = 0 then
      continue;
    end if;

    v_so_hieu := v_dong->>'so_hieu';
    select id into v_tk_id from he_thong_tai_khoan where so_hieu = v_so_hieu;
    if v_tk_id is null then
      raise exception 'Không tìm thấy tài khoản kế toán số hiệu "%"', v_so_hieu;
    end if;

    insert into chi_tiet_but_toan (but_toan_id, tai_khoan_id, no, co)
    values (v_but_toan_id, v_tk_id, v_no, v_co);

    v_tong_no := v_tong_no + v_no;
    v_tong_co := v_tong_co + v_co;
    v_co_dong := true;
  end loop;

  if not v_co_dong then
    -- Mọi dòng đều rỗng (vd hoá đơn tổng tiền = 0) — không có gì để hạch toán.
    delete from but_toan where id = v_but_toan_id;
    return;
  end if;

  if round(v_tong_no, 2) <> round(v_tong_co, 2) then
    raise exception 'Bút toán mất cân đối: Nợ % <> Có % (nguồn: % / %)',
      v_tong_no, v_tong_co, p_nguon_goc_loai, p_nguon_goc_id
      using errcode = 'check_violation';
  end if;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- 11.4 TỰ ĐỘNG HẠCH TOÁN TỪ GIAO DỊCH ĐÃ CÓ
-- ------------------------------------------------------------

-- ===== Nhập hàng: Nợ 156 / Có 331, lúc phiếu được duyệt =====
create or replace function trg_fn_ke_toan_phieu_nhap() returns trigger as $$
begin
  if new.trang_thai = 'da_duyet' and old.trang_thai is distinct from 'da_duyet' and new.tong_tien > 0 then
    perform fn_ghi_but_toan(
      'phieu_nhap_kho', new.id, new.ngay_nhap::date,
      'Nhập hàng ' || new.so_phieu, new.chi_nhanh_id,
      jsonb_build_array(
        jsonb_build_object('so_hieu', '156', 'no', new.tong_tien, 'co', 0),
        jsonb_build_object('so_hieu', '331', 'no', 0, 'co', new.tong_tien)
      )
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ke_toan_phieu_nhap on phieu_nhap_kho;
create trigger trg_ke_toan_phieu_nhap
after update on phieu_nhap_kho
for each row execute function trg_fn_ke_toan_phieu_nhap();

-- ===== Bán lẻ: Nợ 111 / Có 511 (doanh thu) + Nợ 632 / Có 156 (giá vốn) =====
-- Hạch toán lại TOÀN BỘ mỗi khi chi_tiet_hoa_don_ban thay đổi (giống cách
-- tong_tien_hang được tính lại toàn bộ, không cộng dồn) — vì hoá đơn được
-- tạo trước, các dòng chi tiết thêm sau, số tiền thật chỉ biết được khi đã
-- có đủ dòng.
create or replace function fn_ke_toan_hoa_don_ban(p_hoa_don_id uuid) returns void as $$
declare
  v_id uuid; v_chi_nhanh uuid; v_ngay timestamptz; v_so_hoa_don text; v_trang_thai text;
  v_tong_thu numeric; v_gia_von numeric;
  v_dong jsonb;
begin
  select id, chi_nhanh_id, ngay_ban, so_hoa_don, trang_thai, coalesce(tong_thanh_toan, thanh_tien)
    into v_id, v_chi_nhanh, v_ngay, v_so_hoa_don, v_trang_thai, v_tong_thu
  from hoa_don_ban where id = p_hoa_don_id;

  if v_id is null or v_trang_thai <> 'hoan_thanh' or coalesce(v_tong_thu, 0) <= 0 then
    perform fn_ghi_but_toan('hoa_don_ban', p_hoa_don_id, null, null, null, null);
    return;
  end if;

  select coalesce(sum(so_luong * coalesce(gia_von_tai_ban, 0)), 0) into v_gia_von
  from chi_tiet_hoa_don_ban where hoa_don_id = p_hoa_don_id;

  v_dong := jsonb_build_array(
    jsonb_build_object('so_hieu', '111', 'no', v_tong_thu, 'co', 0),
    jsonb_build_object('so_hieu', '511', 'no', 0, 'co', v_tong_thu)
  );
  if v_gia_von > 0 then
    v_dong := v_dong || jsonb_build_array(
      jsonb_build_object('so_hieu', '632', 'no', v_gia_von, 'co', 0),
      jsonb_build_object('so_hieu', '156', 'no', 0, 'co', v_gia_von)
    );
  end if;

  perform fn_ghi_but_toan('hoa_don_ban', p_hoa_don_id, v_ngay::date,
    'Bán lẻ ' || v_so_hoa_don, v_chi_nhanh, v_dong);
end;
$$ language plpgsql;

create or replace function trg_fn_ke_toan_hoa_don_ban_chi_tiet() returns trigger as $$
begin
  perform fn_ke_toan_hoa_don_ban(coalesce(new.hoa_don_id, old.hoa_don_id));
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_ke_toan_hoa_don_ban_chi_tiet on chi_tiet_hoa_don_ban;
create trigger trg_ke_toan_hoa_don_ban_chi_tiet
after insert or update or delete on chi_tiet_hoa_don_ban
for each row execute function trg_fn_ke_toan_hoa_don_ban_chi_tiet();

create or replace function trg_fn_ke_toan_hoa_don_ban_trang_thai() returns trigger as $$
begin
  if new.trang_thai is distinct from old.trang_thai then
    perform fn_ke_toan_hoa_don_ban(new.id);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ke_toan_hoa_don_ban_trang_thai on hoa_don_ban;
create trigger trg_ke_toan_hoa_don_ban_trang_thai
after update on hoa_don_ban
for each row execute function trg_fn_ke_toan_hoa_don_ban_trang_thai();

-- ===== Hóa đơn B2B: Nợ 131 / Có 511 + Có 3331 (thuế) + Nợ 632 / Có 156 =====
create or replace function fn_ke_toan_hoa_don_b2b(p_hoa_don_id uuid) returns void as $$
declare
  v_id uuid; v_don_hang_id uuid; v_tien_hang numeric; v_tong_tien numeric;
  v_ngay date; v_so_hoa_don text; v_trang_thai text; v_chi_nhanh uuid;
  v_gia_von numeric := 0; v_thue numeric;
  v_dong jsonb;
begin
  select id, don_hang_id, tien_hang, tong_tien, ngay_xuat_hoa_don, so_hoa_don, trang_thai
    into v_id, v_don_hang_id, v_tien_hang, v_tong_tien, v_ngay, v_so_hoa_don, v_trang_thai
  from hoa_don_b2b where id = p_hoa_don_id;

  if v_id is null or v_trang_thai <> 'hieu_luc' or coalesce(v_tong_tien, 0) <= 0 then
    perform fn_ghi_but_toan('hoa_don_b2b', p_hoa_don_id, null, null, null, null);
    return;
  end if;

  if v_don_hang_id is not null then
    -- Tách riêng khỏi truy vấn giá vốn bên dưới: chi_nhanh_giao_id phải
    -- lấy được ngay cả khi đơn chưa có (hoặc không còn) dòng chi tiết nào,
    -- nếu không "select ... into" sẽ trả NULL khi 0 dòng khớp, làm mất
    -- luôn chi_nhanh_id của bút toán.
    select chi_nhanh_giao_id into v_chi_nhanh from don_hang_b2b where id = v_don_hang_id;

    select coalesce(sum(so_luong * coalesce(gia_von_tai_ban, 0)), 0) into v_gia_von
    from chi_tiet_don_hang_b2b where don_hang_id = v_don_hang_id;
  end if;

  v_thue := greatest(coalesce(v_tong_tien, 0) - coalesce(v_tien_hang, 0), 0);

  v_dong := jsonb_build_array(
    jsonb_build_object('so_hieu', '131', 'no', v_tong_tien, 'co', 0),
    jsonb_build_object('so_hieu', '511', 'no', 0, 'co', v_tien_hang)
  );
  if v_thue > 0 then
    v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', '3331', 'no', 0, 'co', v_thue));
  end if;
  if v_gia_von > 0 then
    v_dong := v_dong || jsonb_build_array(
      jsonb_build_object('so_hieu', '632', 'no', v_gia_von, 'co', 0),
      jsonb_build_object('so_hieu', '156', 'no', 0, 'co', v_gia_von)
    );
  end if;

  perform fn_ghi_but_toan('hoa_don_b2b', p_hoa_don_id, v_ngay,
    'Hóa đơn B2B ' || v_so_hoa_don, v_chi_nhanh, v_dong);
end;
$$ language plpgsql;

create or replace function trg_fn_ke_toan_hoa_don_b2b() returns trigger as $$
begin
  perform fn_ke_toan_hoa_don_b2b(new.id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ke_toan_hoa_don_b2b on hoa_don_b2b;
create trigger trg_ke_toan_hoa_don_b2b
after insert or update of trang_thai, tong_tien, tien_hang on hoa_don_b2b
for each row execute function trg_fn_ke_toan_hoa_don_b2b();

-- ===== Thu công nợ: Nợ 111/112 / Có 131 =====
create or replace function trg_fn_ke_toan_phieu_thu() returns trigger as $$
declare
  v_tk_tien text := case when new.hinh_thuc = 'chuyen_khoan' then '112' else '111' end;
begin
  if new.so_tien > 0 then
    perform fn_ghi_but_toan(
      'phieu_thu_cong_no', new.id, new.ngay_thu::date, 'Thu công nợ ' || new.so_phieu_thu, null,
      jsonb_build_array(
        jsonb_build_object('so_hieu', v_tk_tien, 'no', new.so_tien, 'co', 0),
        jsonb_build_object('so_hieu', '131', 'no', 0, 'co', new.so_tien)
      )
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ke_toan_phieu_thu on phieu_thu_cong_no;
create trigger trg_ke_toan_phieu_thu
after insert on phieu_thu_cong_no
for each row execute function trg_fn_ke_toan_phieu_thu();

-- ===== Chi trả NCC: Nợ 331 / Có 111/112 =====
create or replace function trg_fn_ke_toan_phieu_chi() returns trigger as $$
declare
  v_tk_tien text := case when new.hinh_thuc = 'chuyen_khoan' then '112' else '111' end;
begin
  if new.so_tien > 0 then
    perform fn_ghi_but_toan(
      'phieu_chi_ncc', new.id, new.ngay_chi::date, 'Chi trả NCC ' || new.so_phieu_chi, null,
      jsonb_build_array(
        jsonb_build_object('so_hieu', '331', 'no', new.so_tien, 'co', 0),
        jsonb_build_object('so_hieu', v_tk_tien, 'no', 0, 'co', new.so_tien)
      )
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ke_toan_phieu_chi on phieu_chi_ncc;
create trigger trg_ke_toan_phieu_chi
after insert on phieu_chi_ncc
for each row execute function trg_fn_ke_toan_phieu_chi();

-- ===== Chi phí vận hành đơn giản: Nợ 642 / Có 111 =====
create or replace function trg_fn_ke_toan_chi_phi() returns trigger as $$
begin
  if new.so_tien > 0 then
    perform fn_ghi_but_toan(
      'chi_phi', new.id, new.ngay_phat_sinh, 'Chi phí: ' || coalesce(new.mo_ta, ''), new.chi_nhanh_id,
      jsonb_build_array(
        jsonb_build_object('so_hieu', '642', 'no', new.so_tien, 'co', 0),
        jsonb_build_object('so_hieu', '111', 'no', 0, 'co', new.so_tien)
      )
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ke_toan_chi_phi on chi_phi;
create trigger trg_ke_toan_chi_phi
after insert on chi_phi
for each row execute function trg_fn_ke_toan_chi_phi();

-- ------------------------------------------------------------
-- RPC — hạch toán thủ công cho kế toán viên (giao diện chưa dùng ngay,
-- chuẩn bị sẵn API cho màn hình "Bút toán thủ công" sau này).
-- ------------------------------------------------------------

create or replace function rpc_tao_but_toan_thu_cong(
  p_ngay date, p_dien_giai text, p_chi_nhanh_id uuid, p_dong jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if not bao_mat.co_quyen_moi_noi('tai_chinh', 'tao') then
    raise exception 'Không có quyền tạo bút toán kế toán.' using errcode = 'insufficient_privilege';
  end if;
  if p_chi_nhanh_id is not null and not bao_mat.co_quyen_cn('tai_chinh', 'tao', p_chi_nhanh_id) then
    raise exception 'Không có quyền tạo bút toán cho chi nhánh này.' using errcode = 'insufficient_privilege';
  end if;

  v_id := gen_random_uuid();
  perform fn_ghi_but_toan('thu_cong', v_id, p_ngay, p_dien_giai, p_chi_nhanh_id, p_dong);
  return v_id;
end;
$$;

grant execute on function rpc_tao_but_toan_thu_cong(date, text, uuid, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 11.5 VIEW BÁO CÁO
-- ------------------------------------------------------------

create or replace view so_cai
with (security_invoker = on) as
select bt.id as but_toan_id, bt.so_but_toan, bt.ngay_hach_toan, bt.dien_giai, bt.nguon_goc_loai,
       bt.chi_nhanh_id, cn.ten_chi_nhanh,
       ct.tai_khoan_id, tk.so_hieu, tk.ten_tai_khoan, tk.loai as loai_tai_khoan,
       ct.no, ct.co
from chi_tiet_but_toan ct
join but_toan bt on bt.id = ct.but_toan_id
join he_thong_tai_khoan tk on tk.id = ct.tai_khoan_id
left join chi_nhanh cn on cn.id = bt.chi_nhanh_id;

create or replace view bang_can_doi_thu_nghiem
with (security_invoker = on) as
select tk.id as tai_khoan_id, tk.so_hieu, tk.ten_tai_khoan, tk.loai, tk.ben_no_la_tang,
       coalesce(sum(ct.no), 0) as tong_no,
       coalesce(sum(ct.co), 0) as tong_co,
       case when tk.ben_no_la_tang
         then coalesce(sum(ct.no), 0) - coalesce(sum(ct.co), 0)
         else coalesce(sum(ct.co), 0) - coalesce(sum(ct.no), 0)
       end as so_du
from he_thong_tai_khoan tk
left join chi_tiet_but_toan ct on ct.tai_khoan_id = tk.id
group by tk.id, tk.so_hieu, tk.ten_tai_khoan, tk.loai, tk.ben_no_la_tang;

create or replace view bao_cao_lai_lo
with (security_invoker = on) as
select date_trunc('month', bt.ngay_hach_toan)::date as thang,
       tk.loai, tk.so_hieu, tk.ten_tai_khoan,
       sum(case when tk.loai = 'doanh_thu' then ct.co - ct.no else ct.no - ct.co end) as so_tien
from chi_tiet_but_toan ct
join but_toan bt on bt.id = ct.but_toan_id
join he_thong_tai_khoan tk on tk.id = ct.tai_khoan_id
where tk.loai in ('doanh_thu', 'chi_phi')
group by date_trunc('month', bt.ngay_hach_toan), tk.loai, tk.so_hieu, tk.ten_tai_khoan;

create or replace view bang_can_doi_ke_toan
with (security_invoker = on) as
select loai, sum(so_du) as tong_so_du
from bang_can_doi_thu_nghiem
where loai in ('tai_san', 'no_phai_tra', 'von_chu_so_huu')
group by loai;

-- ------------------------------------------------------------
-- 11.6 RLS
-- ------------------------------------------------------------

create or replace function bao_mat.cn_but_toan(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from but_toan where id = p_id $$;

grant execute on function bao_mat.cn_but_toan(uuid) to authenticated;

select bao_mat.gen_policy_danh_muc('he_thong_tai_khoan', 'tai_chinh');

-- but_toan / chi_tiet_but_toan: CHỈ ĐỌC. Mọi ghi đi qua fn_ghi_but_toan
-- hoặc rpc_tao_but_toan_thu_cong (đều SECURITY DEFINER, tự kiểm tra
-- quyền + cân đối Nợ/Có bên trong).
alter table but_toan enable row level security;

drop policy if exists but_toan_xem on but_toan;
create policy but_toan_xem on but_toan for select to authenticated
  using (chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep('tai_chinh', 'xem')))
      or (chi_nhanh_id is null and bao_mat.co_quyen_toan_cuc('tai_chinh', 'xem')));

alter table chi_tiet_but_toan enable row level security;

drop policy if exists chi_tiet_but_toan_xem on chi_tiet_but_toan;
create policy chi_tiet_but_toan_xem on chi_tiet_but_toan for select to authenticated
  using (bao_mat.cn_but_toan(but_toan_id) in (select unnest(bao_mat.cn_duoc_phep('tai_chinh', 'xem')))
      or (bao_mat.cn_but_toan(but_toan_id) is null and bao_mat.co_quyen_toan_cuc('tai_chinh', 'xem')));

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

grant select on he_thong_tai_khoan, but_toan, chi_tiet_but_toan,
             so_cai, bang_can_doi_thu_nghiem, bao_cao_lai_lo, bang_can_doi_ke_toan
  to authenticated;

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
