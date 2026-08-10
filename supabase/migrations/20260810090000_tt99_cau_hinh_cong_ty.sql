-- ============================================================
-- TT99/2025/TT-BTC — Thông tin pháp lý công ty
--
-- Các mẫu báo cáo tài chính chính thức (B01-DN, B02-DN, B03-DN,
-- B09-DN) đều cần quốc hiệu/tên đơn vị/địa chỉ/MST ở đầu trang.
-- Hệ thống trước giờ hoàn toàn không lưu thông tin này — bảng
-- singleton (luôn đúng 1 dòng, id=1) để cấu hình qua UI thay vì
-- hard-code.
-- ============================================================

create table if not exists cau_hinh_cong_ty (
  id int primary key default 1 check (id = 1),
  ten_cong_ty text,
  ma_so_thue text,
  dia_chi text,
  dai_dien_phap_luat text,
  chuc_vu_dai_dien text,
  so_dien_thoai text,
  don_vi_tien_te text not null default 'VND',
  updated_at timestamptz not null default now()
);

insert into cau_hinh_cong_ty (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_updated_at_cau_hinh_cong_ty on cau_hinh_cong_ty;
create trigger trg_updated_at_cau_hinh_cong_ty
before update on cau_hinh_cong_ty
for each row execute function trg_fn_cap_nhat_updated_at();

select bao_mat.gen_policy_danh_muc('cau_hinh_cong_ty', 'he_thong');

-- Bảng chỉ có đúng 1 dòng (id=1) — không cho insert/xoá qua policy
-- danh_muc mặc định (vốn cho phép insert/delete theo quyền 'tao'/'xoa').
-- Chỉ giữ lại quyền select + update.
drop policy if exists cau_hinh_cong_ty_them on cau_hinh_cong_ty;
drop policy if exists cau_hinh_cong_ty_xoa on cau_hinh_cong_ty;
