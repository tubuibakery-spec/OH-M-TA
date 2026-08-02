-- ============================================================
-- 07. TIER 2 — NGHIỆP VỤ LÕI CÒN THIẾU
--
--   7.1 Bảng giá NCC (đơn vị mua, quy đổi, MOQ, lead time)
--   7.2 Đơn đặt hàng NCC + "hàng đang về"
--   7.3 Dự báo bán & doanh số thực tế
--   7.4 Phiếu kiểm kê
--   7.5 Lý do hủy / hao hụt
--   7.6 Ca bán hàng & đối soát két
--   7.7 Thuế VAT
--   7.8 Engine đề xuất đặt hàng (nổ BOM đệ quy)
-- ============================================================

-- ------------------------------------------------------------
-- 7.1 BẢNG GIÁ NHÀ CUNG CẤP
-- ------------------------------------------------------------

alter table nha_cung_cap
  add column if not exists thoi_gian_giao_ngay int not null default 1,
  add column if not exists gia_tri_don_toi_thieu numeric(14,2) not null default 0,
  add column if not exists ngay_dat_trong_tuan text;

comment on column nha_cung_cap.thoi_gian_giao_ngay is 'Lead time — số ngày từ lúc đặt tới lúc nhận.';
comment on column nha_cung_cap.gia_tri_don_toi_thieu is 'MOQ theo giá trị đơn hàng (0 = không yêu cầu).';
comment on column nha_cung_cap.ngay_dat_trong_tuan is 'Các thứ nhận đặt hàng, vd "2,4,6". NULL = mọi ngày.';

create table if not exists gia_nha_cung_cap (
  id uuid primary key default gen_random_uuid(),
  nha_cung_cap_id uuid not null references nha_cung_cap(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  don_gia numeric(14,2) not null check (don_gia >= 0),
  -- Quy đổi đơn vị mua → đơn vị tồn. VD mua theo "thùng 12 chai",
  -- tồn theo "chai" => don_vi_mua='thung', he_so_quy_doi=12.
  don_vi_mua text,
  he_so_quy_doi numeric(14,3) not null default 1 check (he_so_quy_doi > 0),
  so_luong_toi_thieu numeric(14,3) not null default 0,   -- MOQ theo dòng (đơn vị mua)
  buoc_dat numeric(14,3) not null default 1 check (buoc_dat > 0),
  la_ncc_chinh boolean not null default false,
  ap_dung_tu date not null default current_date,
  dang_ap_dung boolean not null default true,
  created_at timestamptz not null default now(),
  unique (nha_cung_cap_id, vat_tu_id, ap_dung_tu)
);

create index if not exists idx_gia_ncc_vat_tu on gia_nha_cung_cap (vat_tu_id, dang_ap_dung);

-- Mỗi vật tư chỉ một NCC chính
create unique index if not exists uq_gia_ncc_chinh
  on gia_nha_cung_cap (vat_tu_id)
  where la_ncc_chinh and dang_ap_dung;

-- ------------------------------------------------------------
-- 7.2 ĐƠN ĐẶT HÀNG NCC
-- ------------------------------------------------------------

create table if not exists don_dat_hang_ncc (
  id uuid primary key default gen_random_uuid(),
  so_don text unique,
  ngay_dat timestamptz not null default now(),
  nha_cung_cap_id uuid not null references nha_cung_cap(id),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  ngay_giao_du_kien date,
  tong_tien numeric(14,2) not null default 0,
  trang_thai text not null default 'nhap'
      check (trang_thai in ('nhap','da_gui','da_xac_nhan','nhan_mot_phan','hoan_thanh','da_huy')),
  nguoi_tao_id uuid references nhan_vien(id),
  nguoi_duyet_id uuid references nhan_vien(id),
  ngay_duyet timestamptz,
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_don_dat_hang_ncc (
  id uuid primary key default gen_random_uuid(),
  don_dat_hang_id uuid not null references don_dat_hang_ncc(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong_mua numeric(14,3) not null check (so_luong_mua > 0),   -- theo đơn vị MUA
  he_so_quy_doi numeric(14,3) not null default 1,
  so_luong_dat numeric(14,3) generated always as (so_luong_mua * he_so_quy_doi) stored,
  don_gia numeric(14,2) not null check (don_gia >= 0),
  thanh_tien numeric(14,2) generated always as (so_luong_mua * don_gia) stored,
  so_luong_da_nhan numeric(14,3) not null default 0,
  unique (don_dat_hang_id, vat_tu_id)
);

create index if not exists idx_ddh_ncc_cn on don_dat_hang_ncc (chi_nhanh_id, trang_thai);

-- Nối phiếu nhập với đơn đặt
alter table phieu_nhap_kho
  add column if not exists don_dat_hang_id uuid references don_dat_hang_ncc(id);
alter table chi_tiet_phieu_nhap
  add column if not exists chi_tiet_don_dat_id uuid references chi_tiet_don_dat_hang_ncc(id);

create index if not exists idx_phieu_nhap_ddh on phieu_nhap_kho (don_dat_hang_id);

-- Tổng tiền đơn đặt tự cộng dồn
create or replace function trg_fn_cong_don_don_dat_ncc() returns trigger as $$
declare v_id uuid;
begin
  v_id := coalesce(new.don_dat_hang_id, old.don_dat_hang_id);
  update don_dat_hang_ncc d
     set tong_tien = coalesce((select sum(thanh_tien) from chi_tiet_don_dat_hang_ncc
                                where don_dat_hang_id = v_id), 0)
   where d.id = v_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_cong_don_don_dat_ncc on chi_tiet_don_dat_hang_ncc;
create trigger trg_cong_don_don_dat_ncc
after insert or update or delete on chi_tiet_don_dat_hang_ncc
for each row execute function trg_fn_cong_don_don_dat_ncc();

-- Khi phiếu nhập được duyệt: cộng số đã nhận về đơn đặt, cập nhật trạng thái.
create or replace function trg_fn_phieu_nhap_cap_nhat_don_dat() returns trigger as $$
declare
  r record;
  v_con_thieu int;
begin
  if new.trang_thai = 'da_duyet' and old.trang_thai is distinct from 'da_duyet'
     and new.don_dat_hang_id is not null then

    for r in
      select ct.vat_tu_id, ct.so_luong, ct.chi_tiet_don_dat_id
      from chi_tiet_phieu_nhap ct where ct.phieu_nhap_id = new.id
    loop
      update chi_tiet_don_dat_hang_ncc dd
         set so_luong_da_nhan = dd.so_luong_da_nhan + r.so_luong
       where dd.id = r.chi_tiet_don_dat_id
          or (r.chi_tiet_don_dat_id is null
              and dd.don_dat_hang_id = new.don_dat_hang_id
              and dd.vat_tu_id = r.vat_tu_id);
    end loop;

    select count(*) into v_con_thieu
    from chi_tiet_don_dat_hang_ncc
    where don_dat_hang_id = new.don_dat_hang_id
      and so_luong_da_nhan < so_luong_dat;

    update don_dat_hang_ncc
       set trang_thai = case when v_con_thieu = 0 then 'hoan_thanh' else 'nhan_mot_phan' end
     where id = new.don_dat_hang_id
       and trang_thai not in ('da_huy');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_nhap_cap_nhat_don_dat on phieu_nhap_kho;
create trigger trg_phieu_nhap_cap_nhat_don_dat
after update on phieu_nhap_kho
for each row execute function trg_fn_phieu_nhap_cap_nhat_don_dat();

-- Hàng đang trên đường về (dùng khi tính đề xuất đơn tiếp theo)
create or replace view hang_dang_ve
with (security_invoker = on) as
select d.chi_nhanh_id, ct.vat_tu_id, vt.ten_vat_tu,
       sum(ct.so_luong_dat - ct.so_luong_da_nhan) as so_luong_dang_ve,
       min(d.ngay_giao_du_kien) as ngay_ve_gan_nhat
from don_dat_hang_ncc d
join chi_tiet_don_dat_hang_ncc ct on ct.don_dat_hang_id = d.id
join vat_tu vt on vt.id = ct.vat_tu_id
where d.trang_thai in ('da_gui', 'da_xac_nhan', 'nhan_mot_phan')
  and ct.so_luong_da_nhan < ct.so_luong_dat
group by d.chi_nhanh_id, ct.vat_tu_id, vt.ten_vat_tu;

-- ------------------------------------------------------------
-- 7.3 DỰ BÁO BÁN & DOANH SỐ THỰC TẾ
-- ------------------------------------------------------------

create table if not exists du_bao_ban (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  ngay date not null,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong_du_bao numeric(14,3) not null check (so_luong_du_bao >= 0),
  nguon text not null default 'thu_cong'
      check (nguon in ('thu_cong','tu_dong','lich_su','ai')),
  ghi_chu text,
  nguoi_tao_id uuid references nhan_vien(id),
  created_at timestamptz not null default now(),
  unique (chi_nhanh_id, ngay, vat_tu_id)
);

create index if not exists idx_du_bao_ngay on du_bao_ban (chi_nhanh_id, ngay);

create table if not exists doanh_so_thuc_te (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  ngay date not null,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong_ban numeric(14,3) not null default 0,
  doanh_thu numeric(14,2) not null default 0,
  nguon text not null default 'pos'
      check (nguon in ('pos','nhap_tay','hoa_don')),
  created_at timestamptz not null default now(),
  unique (chi_nhanh_id, ngay, vat_tu_id, nguon)
);

create index if not exists idx_doanh_so_ngay on doanh_so_thuc_te (chi_nhanh_id, ngay);

comment on table doanh_so_thuc_te is
  'Số bán theo ngày. Nguồn "pos" nhập từ CukCuk; "hoa_don" tổng hợp từ hoa_don_ban.';

-- Tổng hợp doanh số từ hóa đơn nội bộ (chạy hằng ngày hoặc gọi tay).
create or replace function fn_tong_hop_doanh_so(p_ngay date default current_date - 1)
returns int as $$
declare v_so int;
begin
  insert into doanh_so_thuc_te (chi_nhanh_id, ngay, vat_tu_id, so_luong_ban, doanh_thu, nguon)
  select hb.chi_nhanh_id, p_ngay, ct.vat_tu_id,
         sum(ct.so_luong), sum(ct.thanh_tien), 'hoa_don'
  from chi_tiet_hoa_don_ban ct
  join hoa_don_ban hb on hb.id = ct.hoa_don_id
  where hb.trang_thai = 'hoan_thanh' and hb.ngay_ban::date = p_ngay
  group by hb.chi_nhanh_id, ct.vat_tu_id
  on conflict (chi_nhanh_id, ngay, vat_tu_id, nguon)
  do update set so_luong_ban = excluded.so_luong_ban, doanh_thu = excluded.doanh_thu;

  get diagnostics v_so = row_count;
  return v_so;
end;
$$ language plpgsql;

create or replace view so_sanh_du_bao_thuc_te
with (security_invoker = on) as
select coalesce(db.chi_nhanh_id, ds.chi_nhanh_id) as chi_nhanh_id,
       coalesce(db.ngay, ds.ngay) as ngay,
       coalesce(db.vat_tu_id, ds.vat_tu_id) as vat_tu_id,
       vt.ten_vat_tu,
       coalesce(db.so_luong_du_bao, 0) as du_bao,
       coalesce(ds.so_luong_ban, 0) as thuc_te,
       coalesce(ds.so_luong_ban, 0) - coalesce(db.so_luong_du_bao, 0) as lech,
       round(100.0 * (coalesce(ds.so_luong_ban,0) - coalesce(db.so_luong_du_bao,0))
             / nullif(db.so_luong_du_bao, 0), 1) as lech_pct
from du_bao_ban db
full outer join doanh_so_thuc_te ds
  on ds.chi_nhanh_id = db.chi_nhanh_id and ds.ngay = db.ngay and ds.vat_tu_id = db.vat_tu_id
join vat_tu vt on vt.id = coalesce(db.vat_tu_id, ds.vat_tu_id);

-- ------------------------------------------------------------
-- 7.4 PHIẾU KIỂM KÊ
-- Trước đây điều chỉnh tồn ('dieu_chinh') không có chứng từ đứng sau
-- => không ai duyệt, không audit được.
-- ------------------------------------------------------------

create table if not exists phieu_kiem_ke (
  id uuid primary key default gen_random_uuid(),
  so_phieu text unique,
  chi_nhanh_id uuid not null references chi_nhanh(id),
  ngay_kiem_ke timestamptz not null default now(),
  loai text not null default 'dinh_ky'
      check (loai in ('dinh_ky','dot_xuat','ban_phan')),
  trang_thai text not null default 'nhap'
      check (trang_thai in ('nhap','cho_duyet','da_duyet','da_huy')),
  nguoi_tao_id uuid references nhan_vien(id),
  nguoi_duyet_id uuid references nhan_vien(id),
  ngay_duyet timestamptz,
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_phieu_kiem_ke (
  id uuid primary key default gen_random_uuid(),
  phieu_kiem_ke_id uuid not null references phieu_kiem_ke(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  lo_hang_id uuid references lo_hang(id),
  so_luong_he_thong numeric(14,3) not null default 0,   -- chốt lúc tạo phiếu
  so_luong_thuc_te numeric(14,3),
  chenh_lech numeric(14,3) generated always as
      (coalesce(so_luong_thuc_te, 0) - so_luong_he_thong) stored,
  gia_von_luc_kiem numeric(14,2),
  ly_do text,
  unique (phieu_kiem_ke_id, vat_tu_id, lo_hang_id)
);

create index if not exists idx_kiem_ke_cn on phieu_kiem_ke (chi_nhanh_id, ngay_kiem_ke);

-- Nạp toàn bộ tồn hiện tại vào phiếu (chốt số hệ thống).
create or replace function fn_nap_kiem_ke(p_phieu_id uuid) returns int as $$
declare
  v_cn uuid;
  v_so int;
  v_so_lo int;
begin
  select chi_nhanh_id into v_cn from phieu_kiem_ke
   where id = p_phieu_id and trang_thai = 'nhap';

  if v_cn is null then
    raise exception 'Phiếu kiểm kê không tồn tại hoặc đã chốt.';
  end if;

  -- Có lô: chốt theo từng lô
  insert into chi_tiet_phieu_kiem_ke
    (phieu_kiem_ke_id, vat_tu_id, lo_hang_id, so_luong_he_thong, gia_von_luc_kiem)
  select p_phieu_id, tkl.vat_tu_id, tkl.lo_hang_id, tkl.so_luong_ton, tk.gia_von_binh_quan
  from ton_kho_lo tkl
  left join ton_kho tk on tk.chi_nhanh_id = tkl.chi_nhanh_id and tk.vat_tu_id = tkl.vat_tu_id
  where tkl.chi_nhanh_id = v_cn and tkl.so_luong_ton > 0
  on conflict do nothing;

  get diagnostics v_so_lo = row_count;

  -- Phần tồn không gắn lô
  insert into chi_tiet_phieu_kiem_ke
    (phieu_kiem_ke_id, vat_tu_id, lo_hang_id, so_luong_he_thong, gia_von_luc_kiem)
  select p_phieu_id, tk.vat_tu_id, null,
         tk.so_luong_ton - coalesce((select sum(so_luong_ton) from ton_kho_lo tkl
                                      where tkl.chi_nhanh_id = tk.chi_nhanh_id
                                        and tkl.vat_tu_id = tk.vat_tu_id), 0),
         tk.gia_von_binh_quan
  from ton_kho tk
  where tk.chi_nhanh_id = v_cn
    and tk.so_luong_ton - coalesce((select sum(so_luong_ton) from ton_kho_lo tkl
                                     where tkl.chi_nhanh_id = tk.chi_nhanh_id
                                       and tkl.vat_tu_id = tk.vat_tu_id), 0) <> 0
  on conflict do nothing;

  get diagnostics v_so = row_count;
  return v_so + coalesce(v_so_lo, 0);
end;
$$ language plpgsql;

-- Duyệt phiếu => áp chênh lệch vào kho
create or replace function trg_fn_kiem_ke_duyet() returns trigger as $$
declare r record;
begin
  if new.trang_thai = 'da_duyet' and old.trang_thai is distinct from 'da_duyet' then
    for r in
      select vat_tu_id, lo_hang_id, chenh_lech
      from chi_tiet_phieu_kiem_ke
      where phieu_kiem_ke_id = new.id
        and so_luong_thuc_te is not null
        and chenh_lech <> 0
    loop
      perform fn_capnhat_ton_kho(
        new.chi_nhanh_id, r.vat_tu_id, r.chenh_lech,
        'dieu_chinh', new.id, 'phieu_kiem_ke', r.lo_hang_id
      );
    end loop;

    update phieu_kiem_ke set ngay_duyet = now()
     where id = new.id and ngay_duyet is null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_kiem_ke_duyet on phieu_kiem_ke;
create trigger trg_kiem_ke_duyet
after update on phieu_kiem_ke
for each row execute function trg_fn_kiem_ke_duyet();

create or replace view chenh_lech_kiem_ke
with (security_invoker = on) as
select pk.id as phieu_id, pk.so_phieu, pk.ngay_kiem_ke, cn.ten_chi_nhanh,
       vt.ten_vat_tu, ct.so_luong_he_thong, ct.so_luong_thuc_te, ct.chenh_lech,
       (ct.chenh_lech * coalesce(ct.gia_von_luc_kiem, 0)) as gia_tri_chenh_lech, ct.ly_do
from chi_tiet_phieu_kiem_ke ct
join phieu_kiem_ke pk on pk.id = ct.phieu_kiem_ke_id
join chi_nhanh cn on cn.id = pk.chi_nhanh_id
join vat_tu vt on vt.id = ct.vat_tu_id
where ct.chenh_lech <> 0;

-- ------------------------------------------------------------
-- 7.5 LÝ DO HỦY / HAO HỤT
-- ------------------------------------------------------------

create table if not exists ly_do_huy (
  id uuid primary key default gen_random_uuid(),
  ma text unique not null,
  ten text not null,
  nhom text not null check (nhom in ('het_han','hong_hoc','roi_vo','khach_tra','san_xuat_loi','khac')),
  tinh_vao_hao_hut boolean not null default true
);

insert into ly_do_huy (ma, ten, nhom) values
  ('HET_HAN',    'Hết hạn sử dụng',        'het_han'),
  ('HONG',       'Hư hỏng trong bảo quản', 'hong_hoc'),
  ('ROI_VO',     'Rơi vỡ khi vận chuyển',  'roi_vo'),
  ('KHACH_TRA',  'Khách trả lại',          'khach_tra'),
  ('SX_LOI',     'Lỗi sản xuất',           'san_xuat_loi'),
  ('KHAC',       'Lý do khác',             'khac')
on conflict (ma) do nothing;

alter table phieu_xuat_kho
  add column if not exists ly_do_huy_id uuid references ly_do_huy(id);

create or replace view phan_tich_hao_hut
with (security_invoker = on) as
select px.kho_xuat_id as chi_nhanh_id, cn.ten_chi_nhanh,
       date_trunc('month', px.ngay_xuat)::date as thang,
       ld.nhom, ld.ten as ly_do,
       vt.ten_vat_tu,
       sum(ctx.so_luong) as so_luong_huy,
       sum(ctx.so_luong * coalesce(tk.gia_von_binh_quan, 0)) as gia_tri_huy
from phieu_xuat_kho px
join chi_tiet_phieu_xuat ctx on ctx.phieu_xuat_id = px.id
join vat_tu vt on vt.id = ctx.vat_tu_id
join chi_nhanh cn on cn.id = px.kho_xuat_id
left join ly_do_huy ld on ld.id = px.ly_do_huy_id
left join ton_kho tk on tk.chi_nhanh_id = px.kho_xuat_id and tk.vat_tu_id = ctx.vat_tu_id
where px.loai_xuat = 'huy_hang' and px.trang_thai = 'da_gui'
group by px.kho_xuat_id, cn.ten_chi_nhanh, date_trunc('month', px.ngay_xuat),
         ld.nhom, ld.ten, vt.ten_vat_tu;

-- ------------------------------------------------------------
-- 7.6 CA BÁN HÀNG & ĐỐI SOÁT KÉT
-- ------------------------------------------------------------

create table if not exists ca_ban_hang (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  ngay date not null default current_date,
  ca text not null default 'ca_ngay' check (ca in ('sang','chieu','toi','ca_ngay')),
  gio_mo timestamptz not null default now(),
  gio_dong timestamptz,
  tien_dau_ca numeric(14,2) not null default 0,
  tien_mat_he_thong numeric(14,2) not null default 0,
  tien_mat_thuc_te numeric(14,2),
  chenh_lech numeric(14,2) generated always as
      (coalesce(tien_mat_thuc_te, 0) - tien_dau_ca - tien_mat_he_thong) stored,
  nguoi_mo_id uuid references nhan_vien(id),
  nguoi_dong_id uuid references nhan_vien(id),
  trang_thai text not null default 'dang_mo'
      check (trang_thai in ('dang_mo','da_dong','da_doi_soat')),
  ghi_chu text,
  unique (chi_nhanh_id, ngay, ca)
);

alter table hoa_don_ban
  add column if not exists ca_ban_hang_id uuid references ca_ban_hang(id);

create index if not exists idx_hoa_don_ca on hoa_don_ban (ca_ban_hang_id);

create or replace function trg_fn_dong_ca() returns trigger as $$
begin
  if new.trang_thai = 'da_dong' and old.trang_thai = 'dang_mo' then
    new.gio_dong := coalesce(new.gio_dong, now());
    new.tien_mat_he_thong := coalesce((
      select sum(thanh_tien) from hoa_don_ban
      where ca_ban_hang_id = new.id
        and trang_thai = 'hoan_thanh'
        and hinh_thuc_thanh_toan = 'tien_mat'
    ), 0);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_dong_ca on ca_ban_hang;
create trigger trg_dong_ca
before update on ca_ban_hang
for each row execute function trg_fn_dong_ca();

-- ------------------------------------------------------------
-- 7.7 THUẾ VAT
-- ------------------------------------------------------------

alter table hoa_don_ban
  add column if not exists thue_suat numeric(5,2) not null default 0;

alter table hoa_don_ban
  add column if not exists tien_thue numeric(14,2)
    generated always as (round((tong_tien_hang - giam_gia) * thue_suat / 100, 0)) stored;

alter table hoa_don_ban
  add column if not exists tong_thanh_toan numeric(14,2)
    generated always as ((tong_tien_hang - giam_gia)
                         + round((tong_tien_hang - giam_gia) * thue_suat / 100, 0)) stored;

-- B2B: tong_tien là TỔNG PHẢI THU (đã gồm thuế) vì công nợ tính trên nó.
alter table hoa_don_b2b
  add column if not exists tien_hang numeric(14,2) not null default 0,
  add column if not exists thue_suat numeric(5,2) not null default 0;

create or replace function trg_fn_hoa_don_b2b_tinh_thue() returns trigger as $$
begin
  if new.tien_hang = 0 and new.don_hang_id is not null then
    select tong_tien into new.tien_hang from don_hang_b2b where id = new.don_hang_id;
  end if;
  if new.tien_hang = 0 and new.tong_tien > 0 then
    new.tien_hang := new.tong_tien;   -- tương thích ngược
  end if;
  new.tong_tien := new.tien_hang + round(new.tien_hang * new.thue_suat / 100, 0);
  return new;
end;
$$ language plpgsql;

-- ⚠️ Trigger BEFORE chạy theo THỨ TỰ TÊN. Thuế phải tính xong rồi mới
-- kiểm tra hạn mức công nợ, nếu không sẽ kiểm trên số tiền chưa gồm thuế.
-- Vì vậy đánh số tiền tố 01/02 và tạo lại trigger hạn mức của migration 06.
drop trigger if exists trg_hoa_don_b2b_tinh_thue on hoa_don_b2b;
drop trigger if exists trg_hoa_don_b2b_kiem_han_muc on hoa_don_b2b;

create trigger trg_hoa_don_b2b_01_tinh_thue
before insert or update of tien_hang, thue_suat, don_hang_id on hoa_don_b2b
for each row execute function trg_fn_hoa_don_b2b_tinh_thue();

create trigger trg_hoa_don_b2b_02_kiem_han_muc
before insert on hoa_don_b2b
for each row execute function trg_fn_hoa_don_b2b_kiem_han_muc();

-- ------------------------------------------------------------
-- 7.8 ENGINE ĐỀ XUẤT ĐẶT HÀNG
-- ------------------------------------------------------------

-- Nổ công thức đệ quy (BTP lồng BTP, giới hạn 5 cấp như app hiện tại).
create or replace function rpc_no_bom(p_vat_tu_id uuid, p_so_luong numeric default 1)
returns table (
  ra_vat_tu_id uuid,
  ra_ten_vat_tu text,
  ra_so_luong numeric,
  ra_cap int,
  ra_la_nvl_goc boolean       -- true = không còn công thức con => phải mua
) language plpgsql stable as $$
begin
  return query
  with recursive no_bom as (
    select ct.vat_tu_id as vt,
           (p_so_luong / nullif(cts.so_luong_dau_ra, 0)) * ct.so_luong_dinh_muc
             * (1 + coalesce(cts.ty_le_hao_hut_phan_tram, 0) / 100) as sl,
           1 as cap
    from cong_thuc_san_xuat cts
    join chi_tiet_cong_thuc ct on ct.cong_thuc_id = cts.id
    where cts.vat_tu_dau_ra_id = p_vat_tu_id and cts.dang_ap_dung

    union all

    select ct.vat_tu_id,
           (nb.sl / nullif(cts.so_luong_dau_ra, 0)) * ct.so_luong_dinh_muc
             * (1 + coalesce(cts.ty_le_hao_hut_phan_tram, 0) / 100),
           nb.cap + 1
    from no_bom nb
    join cong_thuc_san_xuat cts
      on cts.vat_tu_dau_ra_id = nb.vt and cts.dang_ap_dung
    join chi_tiet_cong_thuc ct on ct.cong_thuc_id = cts.id
    where nb.cap < 5
  )
  select nb.vt, v.ten_vat_tu, sum(nb.sl)::numeric(14,3), min(nb.cap)::int,
         not exists (select 1 from cong_thuc_san_xuat c
                      where c.vat_tu_dau_ra_id = nb.vt and c.dang_ap_dung)
  from no_bom nb
  join vat_tu v on v.id = nb.vt
  group by nb.vt, v.ten_vat_tu;
end;
$$;

-- Đề xuất đơn đặt hàng cho một chi nhánh trong khoảng ngày.
--   Bếp trung tâm  => nổ BOM, đề xuất NGUYÊN VẬT LIỆU.
--   Cửa hàng/kho   => đề xuất chính THÀNH PHẨM đang dự báo bán.
-- Công thức: thiếu = nhu cầu − (tồn − giữ chỗ − tồn tối thiểu) − hàng đang về
create or replace function rpc_de_xuat_dat_hang(
  p_chi_nhanh_id uuid,
  p_tu_ngay date default current_date,
  p_den_ngay date default current_date + 6
)
returns table (
  ra_vat_tu_id uuid,
  ra_ten_vat_tu text,
  ra_nhu_cau numeric,
  ra_ton_kha_dung numeric,
  ra_dang_ve numeric,
  ra_thieu numeric,
  ra_nha_cung_cap_id uuid,
  ra_ten_ncc text,
  ra_don_vi_mua text,
  ra_he_so_quy_doi numeric,
  ra_so_luong_mua numeric,
  ra_don_gia numeric,
  ra_thanh_tien numeric
) language plpgsql stable as $$
declare
  v_la_btc boolean;
begin
  select loai_chi_nhanh = 'bep_trung_tam' into v_la_btc
  from chi_nhanh where id = p_chi_nhanh_id;

  return query
  with nhu_cau_goc as (
    select db.vat_tu_id, sum(db.so_luong_du_bao) as sl
    from du_bao_ban db
    where db.chi_nhanh_id = p_chi_nhanh_id
      and db.ngay between p_tu_ngay and p_den_ngay
    group by db.vat_tu_id
  ),
  nhu_cau as (
    select * from nhu_cau_goc where not coalesce(v_la_btc, false)
    union all
    select b.ra_vat_tu_id, sum(b.ra_so_luong)
    from nhu_cau_goc n
    cross join lateral rpc_no_bom(n.vat_tu_id, n.sl) b
    where coalesce(v_la_btc, false) and b.ra_la_nvl_goc
    group by b.ra_vat_tu_id
  ),
  tinh as (
    select nc.vat_tu_id,
           vt.ten_vat_tu,
           nc.sl as nhu_cau,
           greatest(coalesce(tk.so_luong_ton, 0)
                    - coalesce(tk.so_luong_giu_cho, 0)
                    - coalesce(vt.ton_toi_thieu, 0), 0) as kha_dung,
           coalesce(hdv.so_luong_dang_ve, 0) as dang_ve
    from nhu_cau nc
    join vat_tu vt on vt.id = nc.vat_tu_id
    left join ton_kho tk on tk.chi_nhanh_id = p_chi_nhanh_id and tk.vat_tu_id = nc.vat_tu_id
    left join hang_dang_ve hdv on hdv.chi_nhanh_id = p_chi_nhanh_id and hdv.vat_tu_id = nc.vat_tu_id
  )
  select t.vat_tu_id,
         t.ten_vat_tu,
         round(t.nhu_cau, 3),
         round(t.kha_dung, 3),
         round(t.dang_ve, 3),
         round(t.nhu_cau - t.kha_dung - t.dang_ve, 3) as thieu,
         g.nha_cung_cap_id,
         ncc.ten_ncc,
         g.don_vi_mua,
         coalesce(g.he_so_quy_doi, 1),
         -- Làm tròn LÊN theo bước đặt, rồi kẹp sàn theo MOQ dòng
         greatest(
           ceil((t.nhu_cau - t.kha_dung - t.dang_ve)
                / coalesce(g.he_so_quy_doi, 1)
                / coalesce(g.buoc_dat, 1)) * coalesce(g.buoc_dat, 1),
           coalesce(g.so_luong_toi_thieu, 0)
         ) as so_luong_mua,
         g.don_gia,
         round(greatest(
           ceil((t.nhu_cau - t.kha_dung - t.dang_ve)
                / coalesce(g.he_so_quy_doi, 1)
                / coalesce(g.buoc_dat, 1)) * coalesce(g.buoc_dat, 1),
           coalesce(g.so_luong_toi_thieu, 0)
         ) * coalesce(g.don_gia, 0), 0)
  from tinh t
  left join gia_nha_cung_cap g
    on g.vat_tu_id = t.vat_tu_id and g.dang_ap_dung and g.la_ncc_chinh
  left join nha_cung_cap ncc on ncc.id = g.nha_cung_cap_id
  where t.nhu_cau - t.kha_dung - t.dang_ve > 0
  order by t.ten_vat_tu;
end;
$$;

comment on function rpc_de_xuat_dat_hang is
  'Đề xuất đặt hàng. SECURITY INVOKER — RLS tự lọc theo chi nhánh của người gọi.';

-- ------------------------------------------------------------
-- 7.9 KHÓA LẠI CÁC HÀM fn_/trg_fn_ MỚI (rpc_* giữ nguyên để app gọi)
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

grant execute on function rpc_no_bom(uuid, numeric) to authenticated;
grant execute on function rpc_de_xuat_dat_hang(uuid, date, date) to authenticated;
