-- ============================================================
-- 01. SCHEMA CƠ SỞ — bảng + index
-- Nguồn: schema_full_1.sql (mục A → N), giữ nguyên định nghĩa.
-- Đã đổi sang "if not exists" để chạy lại được nhiều lần.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- A. DANH MỤC GỐC (MASTER DATA)
-- ============================================================

create table if not exists don_vi_tinh (
  id uuid primary key default gen_random_uuid(),
  ma_dvt text unique not null,
  ten_dvt text not null
);

create table if not exists chi_nhanh (
  id uuid primary key default gen_random_uuid(),
  ma_chi_nhanh text unique not null,
  ten_chi_nhanh text not null,
  dia_chi text,
  so_dien_thoai text,
  loai_chi_nhanh text not null default 'cua_hang'
      check (loai_chi_nhanh in ('bep_trung_tam','cua_hang','kho_tong')),
  trang_thai text not null default 'hoat_dong'
      check (trang_thai in ('hoat_dong','ngung_hoat_dong')),
  created_at timestamptz not null default now()
);

create table if not exists nha_cung_cap (
  id uuid primary key default gen_random_uuid(),
  ma_ncc text unique not null,
  ten_ncc text not null,
  nguoi_lien_he text,
  so_dien_thoai text,
  dia_chi text,
  mst text,
  ghi_chu text,
  trang_thai text not null default 'hoat_dong'
      check (trang_thai in ('hoat_dong','ngung_hop_tac')),
  created_at timestamptz not null default now()
);

create table if not exists vat_tu (
  id uuid primary key default gen_random_uuid(),
  ma_vat_tu text unique not null,
  ten_vat_tu text not null,
  loai_vat_tu text not null
      check (loai_vat_tu in ('nguyen_vat_lieu','ban_thanh_pham','thanh_pham')),
  don_vi_tinh_id uuid not null references don_vi_tinh(id),
  ton_toi_thieu numeric(14,3) default 0,
  han_su_dung_ngay int,
  gia_von_gan_nhat numeric(14,2),
  trang_thai text not null default 'hoat_dong'
      check (trang_thai in ('hoat_dong','ngung_su_dung')),
  created_at timestamptz not null default now()
);

create table if not exists khach_hang (
  id uuid primary key default gen_random_uuid(),
  ma_khach_hang text unique not null,
  ten_khach_hang text not null,
  so_dien_thoai text,
  email text,
  ngay_sinh date,
  diem_tich_luy numeric(14,2) default 0,
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists nhan_vien (
  id uuid primary key default gen_random_uuid(),
  ma_nv text unique not null,
  ho_ten text not null,
  chi_nhanh_id uuid references chi_nhanh(id),
  vai_tro text not null
      check (vai_tro in ('quan_ly','bep','thu_ngan','kho','admin')),
  trang_thai text not null default 'dang_lam_viec'
      check (trang_thai in ('dang_lam_viec','nghi_viec'))
);

-- ============================================================
-- B. CÔNG THỨC SẢN XUẤT (BOM)
-- ============================================================

create table if not exists cong_thuc_san_xuat (
  id uuid primary key default gen_random_uuid(),
  vat_tu_dau_ra_id uuid not null references vat_tu(id),
  ten_cong_thuc text not null,
  so_luong_dau_ra numeric(14,3) not null default 1,
  ty_le_hao_hut_phan_tram numeric(5,2) default 0,
  phien_ban int not null default 1,
  dang_ap_dung boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_cong_thuc (
  id uuid primary key default gen_random_uuid(),
  cong_thuc_id uuid not null references cong_thuc_san_xuat(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong_dinh_muc numeric(14,3) not null
);

-- ============================================================
-- C. NHẬP HÀNG / HÓA ĐƠN ĐẦU VÀO
-- ============================================================

create table if not exists phieu_nhap_kho (
  id uuid primary key default gen_random_uuid(),
  so_phieu text unique not null,
  ngay_nhap timestamptz not null default now(),
  nha_cung_cap_id uuid references nha_cung_cap(id),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  so_hoa_don_ncc text,
  tong_tien numeric(14,2) not null default 0,
  trang_thai text not null default 'nhap'
      check (trang_thai in ('nhap','da_duyet','da_huy')),
  nguoi_tao_id uuid references nhan_vien(id),
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_phieu_nhap (
  id uuid primary key default gen_random_uuid(),
  phieu_nhap_id uuid not null references phieu_nhap_kho(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong numeric(14,3) not null check (so_luong > 0),
  don_gia numeric(14,2) not null check (don_gia >= 0),
  thanh_tien numeric(14,2) generated always as (so_luong * don_gia) stored,
  han_su_dung date
);

-- ============================================================
-- D. SẢN XUẤT
-- ============================================================

create table if not exists phieu_san_xuat (
  id uuid primary key default gen_random_uuid(),
  so_phieu text unique not null,
  ngay_san_xuat timestamptz not null default now(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  cong_thuc_id uuid not null references cong_thuc_san_xuat(id),
  so_me numeric(14,3) not null default 1,
  so_luong_thuc_te numeric(14,3),
  tong_chi_phi_thuc_te numeric(14,2),
  trang_thai text not null default 'dang_san_xuat'
      check (trang_thai in ('dang_san_xuat','hoan_thanh','da_huy')),
  nguoi_thuc_hien_id uuid references nhan_vien(id),
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_san_xuat_dau_vao (
  id uuid primary key default gen_random_uuid(),
  phieu_san_xuat_id uuid not null references phieu_san_xuat(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong_dinh_muc numeric(14,3) not null,
  so_luong_thuc_te numeric(14,3) not null
);

-- ============================================================
-- E. ĐIỀU CHUYỂN / XUẤT HÀNG CHO CHI NHÁNH
-- ============================================================

create table if not exists phieu_xuat_kho (
  id uuid primary key default gen_random_uuid(),
  so_phieu text unique not null,
  loai_xuat text not null
      check (loai_xuat in ('dieu_chuyen','ban_hang','huy_hang','khac')),
  ngay_xuat timestamptz not null default now(),
  kho_xuat_id uuid not null references chi_nhanh(id),
  kho_nhan_id uuid references chi_nhanh(id),
  trang_thai text not null default 'nhap'
      check (trang_thai in ('nhap','da_gui','da_nhan','da_huy')),
  nguoi_tao_id uuid references nhan_vien(id),
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_phieu_xuat (
  id uuid primary key default gen_random_uuid(),
  phieu_xuat_id uuid not null references phieu_xuat_kho(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong numeric(14,3) not null check (so_luong > 0)
);

-- ============================================================
-- F. BÁN HÀNG BÁN LẺ / HÓA ĐƠN ĐẦU RA
-- ============================================================

create table if not exists hoa_don_ban (
  id uuid primary key default gen_random_uuid(),
  so_hoa_don text unique not null,
  ngay_ban timestamptz not null default now(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  khach_hang_id uuid references khach_hang(id),
  kenh_ban text not null default 'tai_cho'
      check (kenh_ban in ('tai_cho','online')),
  tong_tien_hang numeric(14,2) not null default 0,
  giam_gia numeric(14,2) not null default 0,
  thanh_tien numeric(14,2) generated always as (tong_tien_hang - giam_gia) stored,
  hinh_thuc_thanh_toan text
      check (hinh_thuc_thanh_toan in ('tien_mat','chuyen_khoan','the','vi_dien_tu')),
  trang_thai text not null default 'hoan_thanh'
      check (trang_thai in ('hoan_thanh','da_huy','tra_hang')),
  nhan_vien_id uuid references nhan_vien(id),
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_hoa_don_ban (
  id uuid primary key default gen_random_uuid(),
  hoa_don_id uuid not null references hoa_don_ban(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong numeric(14,3) not null check (so_luong > 0),
  don_gia numeric(14,2) not null check (don_gia >= 0),
  thanh_tien numeric(14,2) generated always as (so_luong * don_gia) stored,
  gia_von_tai_ban numeric(14,2)
);

-- ============================================================
-- G. TỒN KHO & THẺ KHO
-- ============================================================

create table if not exists ton_kho (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  vat_tu_id uuid not null references vat_tu(id),
  so_luong_ton numeric(14,3) not null default 0,
  so_luong_giu_cho numeric(14,3) not null default 0,
  gia_von_binh_quan numeric(14,2) not null default 0,
  cap_nhat_luc timestamptz not null default now(),
  unique (chi_nhanh_id, vat_tu_id)
);

create table if not exists the_kho (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  vat_tu_id uuid not null references vat_tu(id),
  loai_giao_dich text not null
      check (loai_giao_dich in ('nhap_mua','san_xuat_nhap','san_xuat_xuat',
                                 'dieu_chuyen_di','dieu_chuyen_den','ban_hang',
                                 'huy_hang','dieu_chinh','ban_b2b')),
  so_luong numeric(14,3) not null,
  ton_sau_giao_dich numeric(14,3),
  chung_tu_id uuid,
  chung_tu_loai text,
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists lich_su_giu_cho (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  vat_tu_id uuid not null references vat_tu(id),
  so_luong numeric(14,3) not null,
  ly_do text not null
      check (ly_do in ('giu_cho_don_hang','giai_phong_xac_nhan_xuat','giai_phong_huy_don')),
  chung_tu_id uuid,
  chung_tu_loai text default 'don_hang_b2b',
  created_at timestamptz not null default now()
);

-- ============================================================
-- H. SALE B2B
-- ============================================================

create table if not exists khach_hang_b2b (
  id uuid primary key default gen_random_uuid(),
  ma_khach_hang text unique not null,
  ten_doanh_nghiep text not null,
  mst text,
  nguoi_dai_dien text,
  so_dien_thoai text,
  email text,
  dia_chi_giao_hang text,
  han_muc_cong_no numeric(14,2) default 0,
  du_no_hien_tai numeric(14,2) not null default 0,
  dieu_khoan_thanh_toan_ngay int not null default 30,
  nhan_vien_phu_trach_id uuid references nhan_vien(id),
  trang_thai text not null default 'hoat_dong'
      check (trang_thai in ('hoat_dong','tam_ngung','ngung_hop_tac')),
  created_at timestamptz not null default now()
);

create table if not exists bang_gia_b2b (
  id uuid primary key default gen_random_uuid(),
  ten_bang_gia text not null,
  ap_dung_tu date not null default current_date,
  ap_dung_den date,
  dang_ap_dung boolean not null default true
);

create table if not exists chi_tiet_bang_gia_b2b (
  id uuid primary key default gen_random_uuid(),
  bang_gia_id uuid not null references bang_gia_b2b(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong_tu numeric(14,3) not null default 0,
  don_gia numeric(14,2) not null check (don_gia >= 0)
);

create table if not exists don_hang_b2b (
  id uuid primary key default gen_random_uuid(),
  so_don_hang text unique not null,
  ngay_dat timestamptz not null default now(),
  khach_hang_b2b_id uuid not null references khach_hang_b2b(id),
  chi_nhanh_giao_id uuid not null references chi_nhanh(id),
  ngay_giao_du_kien date,
  tong_tien numeric(14,2) not null default 0,
  trang_thai text not null default 'moi'
      check (trang_thai in ('moi','da_xac_nhan','dang_giao','da_giao','da_huy')),
  nguoi_tao_id uuid references nhan_vien(id),
  ghi_chu text,
  created_at timestamptz not null default now()
);

create table if not exists chi_tiet_don_hang_b2b (
  id uuid primary key default gen_random_uuid(),
  don_hang_id uuid not null references don_hang_b2b(id) on delete cascade,
  vat_tu_id uuid not null references vat_tu(id),
  so_luong numeric(14,3) not null check (so_luong > 0),
  don_gia numeric(14,2) not null check (don_gia >= 0),
  thanh_tien numeric(14,2) generated always as (so_luong * don_gia) stored,
  gia_von_tai_ban numeric(14,2)
);

create table if not exists hoa_don_b2b (
  id uuid primary key default gen_random_uuid(),
  so_hoa_don text unique not null,
  don_hang_id uuid references don_hang_b2b(id),
  khach_hang_b2b_id uuid not null references khach_hang_b2b(id),
  ngay_xuat_hoa_don date not null default current_date,
  han_thanh_toan date not null,
  tong_tien numeric(14,2) not null default 0,
  da_thanh_toan numeric(14,2) not null default 0,
  con_lai numeric(14,2) generated always as (tong_tien - da_thanh_toan) stored,
  trang_thai_thanh_toan text not null default 'chua_thanh_toan'
      check (trang_thai_thanh_toan in ('chua_thanh_toan','thanh_toan_mot_phan','da_thanh_toan','qua_han')),
  created_at timestamptz not null default now()
);

create table if not exists phieu_thu_cong_no (
  id uuid primary key default gen_random_uuid(),
  so_phieu_thu text unique not null,
  hoa_don_b2b_id uuid not null references hoa_don_b2b(id),
  ngay_thu timestamptz not null default now(),
  so_tien numeric(14,2) not null check (so_tien > 0),
  hinh_thuc text check (hinh_thuc in ('tien_mat','chuyen_khoan')),
  nguoi_thu_id uuid references nhan_vien(id),
  ghi_chu text
);

-- ============================================================
-- I. QA/QC
-- ============================================================

create table if not exists lo_hang (
  id uuid primary key default gen_random_uuid(),
  ma_lo text unique not null,
  vat_tu_id uuid not null references vat_tu(id),
  nguon_goc_loai text not null check (nguon_goc_loai in ('nhap_mua','san_xuat')),
  chung_tu_nguon_id uuid,
  ngay_san_xuat date,
  han_su_dung date,
  nha_cung_cap_id uuid references nha_cung_cap(id),
  trang_thai text not null default 'binh_thuong'
      check (trang_thai in ('binh_thuong','canh_bao','thu_hoi')),
  created_at timestamptz not null default now()
);

create table if not exists tieu_chuan_chat_luong (
  id uuid primary key default gen_random_uuid(),
  vat_tu_id uuid not null references vat_tu(id),
  ten_tieu_chi text not null,
  gia_tri_yeu_cau text,
  bat_buoc boolean not null default true
);

create table if not exists kiem_tra_chat_luong (
  id uuid primary key default gen_random_uuid(),
  chung_tu_loai text not null
      check (chung_tu_loai in ('phieu_nhap_kho','phieu_san_xuat','lo_hang')),
  chung_tu_id uuid not null,
  lo_hang_id uuid references lo_hang(id),
  ngay_kiem_tra timestamptz not null default now(),
  ket_qua text not null check (ket_qua in ('dat','khong_dat','dat_co_dieu_kien')),
  chi_tiet_khong_dat text,
  nguoi_kiem_tra_id uuid references nhan_vien(id),
  created_at timestamptz not null default now()
);

create table if not exists nhat_ky_nhiet_do (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  vi_tri text,
  nhiet_do numeric(5,2) not null,
  thoi_gian_ghi timestamptz not null default now(),
  nguoi_ghi_id uuid references nhan_vien(id),
  canh_bao boolean not null default false
);

-- ============================================================
-- J. LOGISTICS
-- ============================================================

create table if not exists phuong_tien (
  id uuid primary key default gen_random_uuid(),
  bien_so text unique not null,
  loai_xe text,
  trong_tai_kg numeric(10,2),
  co_lanh boolean not null default false,
  trang_thai text not null default 'san_sang'
      check (trang_thai in ('san_sang','dang_su_dung','bao_tri','ngung_su_dung'))
);

create table if not exists chuyen_giao_hang (
  id uuid primary key default gen_random_uuid(),
  ma_chuyen text unique not null,
  phuong_tien_id uuid references phuong_tien(id),
  tai_xe_id uuid references nhan_vien(id),
  diem_di_id uuid not null references chi_nhanh(id),
  diem_den_id uuid references chi_nhanh(id),
  khach_hang_b2b_id uuid references khach_hang_b2b(id),
  thoi_gian_du_kien timestamptz,
  thoi_gian_khoi_hanh timestamptz,
  thoi_gian_hoan_thanh timestamptz,
  trang_thai text not null default 'len_ke_hoach'
      check (trang_thai in ('len_ke_hoach','dang_giao','da_giao','tre_gio','da_huy')),
  ghi_chu text,
  check (diem_den_id is not null or khach_hang_b2b_id is not null)
);

create table if not exists chi_tiet_chuyen_giao_hang (
  id uuid primary key default gen_random_uuid(),
  chuyen_giao_id uuid not null references chuyen_giao_hang(id) on delete cascade,
  phieu_xuat_kho_id uuid references phieu_xuat_kho(id),
  don_hang_b2b_id uuid references don_hang_b2b(id),
  check (phieu_xuat_kho_id is not null or don_hang_b2b_id is not null)
);

-- ============================================================
-- K. TÀI SẢN & BẢO TRÌ
-- ============================================================

create table if not exists tai_san (
  id uuid primary key default gen_random_uuid(),
  ma_tai_san text unique not null,
  ten_tai_san text not null,
  loai_tai_san text
      check (loai_tai_san in ('may_moc_bep','tu_lanh','xe_van_chuyen','thiet_bi_van_phong','khac')),
  chi_nhanh_id uuid references chi_nhanh(id),
  ngay_mua date,
  gia_tri_mua numeric(14,2),
  chu_ky_bao_tri_ngay int,
  bao_tri_gan_nhat date,
  bao_tri_ke_tiep date,
  trang_thai text not null default 'dang_su_dung'
      check (trang_thai in ('dang_su_dung','dang_bao_tri','hong','da_thanh_ly')),
  created_at timestamptz not null default now()
);

create table if not exists phieu_bao_tri (
  id uuid primary key default gen_random_uuid(),
  tai_san_id uuid not null references tai_san(id),
  loai text not null check (loai in ('dinh_ky','sua_chua_dot_xuat')),
  ngay_bao_tri date not null default current_date,
  noi_dung text,
  chi_phi numeric(14,2) default 0,
  nguoi_thuc_hien_id uuid references nhan_vien(id),
  nha_cung_cap_dich_vu text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- L. PHÁP LÝ, TUÂN THỦ & PHÂN QUYỀN
-- ============================================================

create table if not exists giay_phep (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid references chi_nhanh(id),
  loai_giay_phep text not null,
  so_giay_phep text,
  co_quan_cap text,
  ngay_cap date,
  ngay_het_han date,
  trang_thai text not null default 'con_hieu_luc'
      check (trang_thai in ('con_hieu_luc','sap_het_han','het_han')),
  file_dinh_kem_url text
);

create table if not exists hop_dong (
  id uuid primary key default gen_random_uuid(),
  loai_hop_dong text not null
      check (loai_hop_dong in ('thue_mat_bang','nha_cung_cap','lao_dong','doi_tac_khac')),
  doi_tac text not null,
  chi_nhanh_id uuid references chi_nhanh(id),
  ngay_ky date,
  ngay_het_han date,
  gia_tri numeric(14,2),
  trang_thai text not null default 'hieu_luc'
      check (trang_thai in ('hieu_luc','sap_het_han','het_han','da_huy')),
  file_dinh_kem_url text
);

create table if not exists nguoi_dung_he_thong (
  id uuid primary key default gen_random_uuid(),
  nhan_vien_id uuid references nhan_vien(id),
  email text unique not null,
  trang_thai text not null default 'hoat_dong'
      check (trang_thai in ('hoat_dong','khoa')),
  dang_nhap_gan_nhat timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vai_tro_he_thong (
  id uuid primary key default gen_random_uuid(),
  ma_vai_tro text unique not null,
  ten_vai_tro text not null,
  mo_ta text
);

create table if not exists quyen_he_thong (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  hanh_dong text not null check (hanh_dong in ('xem','tao','sua','xoa','duyet')),
  unique (module, hanh_dong)
);

create table if not exists vai_tro_quyen (
  vai_tro_id uuid not null references vai_tro_he_thong(id) on delete cascade,
  quyen_id uuid not null references quyen_he_thong(id) on delete cascade,
  primary key (vai_tro_id, quyen_id)
);

create table if not exists nguoi_dung_vai_tro (
  nguoi_dung_id uuid not null references nguoi_dung_he_thong(id) on delete cascade,
  vai_tro_id uuid not null references vai_tro_he_thong(id) on delete cascade,
  chi_nhanh_id uuid references chi_nhanh(id),
  primary key (nguoi_dung_id, vai_tro_id)
);

create table if not exists nhat_ky_he_thong (
  id uuid primary key default gen_random_uuid(),
  nguoi_dung_id uuid references nguoi_dung_he_thong(id),
  hanh_dong text not null,
  bang_du_lieu text not null,
  ban_ghi_id uuid,
  du_lieu_truoc jsonb,
  du_lieu_sau jsonb,
  dia_chi_ip text,
  thoi_gian timestamptz not null default now()
);

-- ============================================================
-- M. TÀI CHÍNH BỔ SUNG — CHI PHÍ & CÔNG NỢ PHẢI TRẢ NCC
-- ============================================================

create table if not exists loai_chi_phi (
  id uuid primary key default gen_random_uuid(),
  ten_loai text not null,
  nhom text not null check (nhom in ('van_hanh','nhan_su','marketing','mat_bang','khac'))
);

create table if not exists chi_phi (
  id uuid primary key default gen_random_uuid(),
  loai_chi_phi_id uuid not null references loai_chi_phi(id),
  chi_nhanh_id uuid references chi_nhanh(id),
  so_tien numeric(14,2) not null check (so_tien > 0),
  ngay_phat_sinh date not null default current_date,
  mo_ta text,
  nguoi_tao_id uuid references nhan_vien(id),
  created_at timestamptz not null default now()
);

create table if not exists phieu_chi_ncc (
  id uuid primary key default gen_random_uuid(),
  so_phieu_chi text unique not null,
  phieu_nhap_id uuid references phieu_nhap_kho(id),
  nha_cung_cap_id uuid not null references nha_cung_cap(id),
  ngay_chi timestamptz not null default now(),
  so_tien numeric(14,2) not null check (so_tien > 0),
  hinh_thuc text check (hinh_thuc in ('tien_mat','chuyen_khoan')),
  nguoi_chi_id uuid references nhan_vien(id)
);

-- ============================================================
-- N. INDEX PHỤ TRỢ
-- ============================================================

create index if not exists idx_the_kho_chinhanh_vattu on the_kho (chi_nhanh_id, vat_tu_id, created_at);
create index if not exists idx_hoa_don_ban_ngay on hoa_don_ban (chi_nhanh_id, ngay_ban);
create index if not exists idx_phieu_nhap_ngay on phieu_nhap_kho (chi_nhanh_id, ngay_nhap);
create index if not exists idx_ton_kho_vattu on ton_kho (vat_tu_id);
create index if not exists idx_hoa_don_b2b_khach on hoa_don_b2b (khach_hang_b2b_id, trang_thai_thanh_toan);
create index if not exists idx_kiem_tra_chat_luong_chungtu on kiem_tra_chat_luong (chung_tu_loai, chung_tu_id);
create index if not exists idx_nhat_ky_he_thong_thoigian on nhat_ky_he_thong (thoi_gian);
create index if not exists idx_chi_phi_ngay on chi_phi (ngay_phat_sinh);
create index if not exists idx_phieu_chi_ncc_ncc on phieu_chi_ncc (nha_cung_cap_id, ngay_chi);

-- Index bổ sung phục vụ RLS (mọi policy đều lọc theo chi_nhanh_id)
create index if not exists idx_phieu_san_xuat_cn on phieu_san_xuat (chi_nhanh_id);
create index if not exists idx_phieu_xuat_kho_xuat on phieu_xuat_kho (kho_xuat_id);
create index if not exists idx_phieu_xuat_kho_nhan on phieu_xuat_kho (kho_nhan_id);
create index if not exists idx_don_hang_b2b_cn on don_hang_b2b (chi_nhanh_giao_id);
create index if not exists idx_chi_phi_cn on chi_phi (chi_nhanh_id);
create index if not exists idx_tai_san_cn on tai_san (chi_nhanh_id);
create index if not exists idx_nhan_vien_cn on nhan_vien (chi_nhanh_id);
create index if not exists idx_nhat_ky_nhiet_do_cn on nhat_ky_nhiet_do (chi_nhanh_id, thoi_gian_ghi);
create index if not exists idx_ndvt_nguoi_dung on nguoi_dung_vai_tro (nguoi_dung_id);
