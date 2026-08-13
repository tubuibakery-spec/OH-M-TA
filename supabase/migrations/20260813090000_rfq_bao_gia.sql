-- ============================================================
-- Nhóm C — Đợt 17: Yêu cầu báo giá (RFQ) + so sánh báo giá NCC
--
-- Mắt xích còn thiếu trong quy trình mua hàng: hiện tại
-- DeXuatDonHang.jsx tự chọn NCC theo bảng giá đã khai sẵn
-- (gia_nha_cung_cap), không có bước mời nhiều NCC báo giá cạnh
-- tranh cho 1 đợt mua. Module này nội bộ hoá bước đó — nhân viên
-- thu mua tự nhập báo giá nhận được (điện thoại/email/Zalo), KHÔNG
-- có cổng cho NCC tự đăng nhập báo giá (NCC không có tài khoản).
-- ============================================================

create table if not exists yeu_cau_bao_gia (
  id uuid primary key default gen_random_uuid(),
  so_yc text unique,
  tieu_de text not null,
  chi_nhanh_id uuid not null references chi_nhanh(id),
  han_bao_gia date,
  ngay_nhan_du_kien date,
  trang_thai text not null default 'nhap'
      check (trang_thai in ('nhap','da_gui','da_chon_ncc','da_huy')),
  nguoi_tao_id uuid references nhan_vien(id),
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_yeu_cau_bao_gia (
  id uuid primary key default gen_random_uuid(),
  yeu_cau_bao_gia_id uuid not null references yeu_cau_bao_gia(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong_can_mua numeric(14,3) not null check (so_luong_can_mua > 0),
  ghi_chu text,
  unique (yeu_cau_bao_gia_id, vat_tu_id)
);

create table if not exists yeu_cau_bao_gia_ncc (
  id uuid primary key default gen_random_uuid(),
  yeu_cau_bao_gia_id uuid not null references yeu_cau_bao_gia(id) on delete cascade,
  nha_cung_cap_id uuid not null references nha_cung_cap(id),
  trang_thai text not null default 'moi_gui' check (trang_thai in ('moi_gui','da_bao_gia','tu_choi')),
  unique (yeu_cau_bao_gia_id, nha_cung_cap_id)
);

create table if not exists bao_gia_ncc (
  id uuid primary key default gen_random_uuid(),
  yeu_cau_bao_gia_ncc_id uuid not null references yeu_cau_bao_gia_ncc(id) on delete cascade,
  chi_tiet_yeu_cau_id uuid not null references chi_tiet_yeu_cau_bao_gia(id) on delete cascade,
  don_gia numeric(14,2) not null check (don_gia >= 0),
  thoi_gian_giao_ngay int,
  unique (yeu_cau_bao_gia_ncc_id, chi_tiet_yeu_cau_id)
);

create index if not exists idx_ycbg_cn on yeu_cau_bao_gia (chi_nhanh_id, trang_thai);

-- Tự sinh số YC, dùng chung trigger đã có cho các chứng từ khác.
alter table yeu_cau_bao_gia alter column so_yc drop not null;
drop trigger if exists trg_so_ct_yeu_cau_bao_gia on yeu_cau_bao_gia;
create trigger trg_so_ct_yeu_cau_bao_gia
before insert on yeu_cau_bao_gia
for each row execute function trg_fn_sinh_so_chung_tu('so_yc', 'YCBG');

-- 2 hàm cn theo đúng khuôn bao_mat.cn_phieu_nhap sẵn có — bao_gia_ncc
-- cần join 2 cấp vì FK của nó trỏ tới yeu_cau_bao_gia_ncc chứ không
-- trỏ thẳng yeu_cau_bao_gia.
create or replace function bao_mat.cn_yeu_cau_bao_gia(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select chi_nhanh_id from yeu_cau_bao_gia where id = p_id
$$;

create or replace function bao_mat.cn_yeu_cau_bao_gia_ncc(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select yb.chi_nhanh_id from yeu_cau_bao_gia_ncc yn
  join yeu_cau_bao_gia yb on yb.id = yn.yeu_cau_bao_gia_id
  where yn.id = p_id
$$;

select bao_mat.gen_policy_chi_nhanh('yeu_cau_bao_gia', 'mua_hang');
select bao_mat.gen_policy_con('chi_tiet_yeu_cau_bao_gia', 'mua_hang', 'yeu_cau_bao_gia_id', 'bao_mat.cn_yeu_cau_bao_gia');
select bao_mat.gen_policy_con('yeu_cau_bao_gia_ncc', 'mua_hang', 'yeu_cau_bao_gia_id', 'bao_mat.cn_yeu_cau_bao_gia');
select bao_mat.gen_policy_con('bao_gia_ncc', 'mua_hang', 'yeu_cau_bao_gia_ncc_id', 'bao_mat.cn_yeu_cau_bao_gia_ncc');
