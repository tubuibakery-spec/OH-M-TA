-- ============================================================
-- Tài sản cố định (TSCĐ) + Công cụ dụng cụ (CCDC) — mở rộng bảng
-- tai_san (vốn chỉ thiết kế cho quản lý vật lý/bảo trì) với các
-- trường kế toán, cộng RPC phân bổ đường thẳng hàng tháng.
--
-- Gộp TSCĐ + CCDC dùng chung 1 cơ chế vì công thức tính giống hệt
-- nhau (nguyên_giá / số_tháng), chỉ khác tài khoản đối ứng:
--   TSCĐ -> 214 (Hao mòn TSCĐ)      CCDC -> 242 (Chi phí trả trước)
-- Tài khoản 211/214/153/242 đã được thêm sẵn ở migration
-- 20260804090000_mo_rong_coa_but_toan_thu_cong.sql.
-- ============================================================

alter table tai_san
  add column if not exists phan_loai_ke_toan text not null default 'khong_von_hoa'
    check (phan_loai_ke_toan in ('tscd', 'ccdc', 'khong_von_hoa')),
  add column if not exists nguyen_gia numeric(14,2),
  add column if not exists ngay_dua_vao_su_dung date,
  add column if not exists so_thang_khau_hao int check (so_thang_khau_hao > 0);

-- Lịch sử từng kỳ đã phân bổ — id của mỗi dòng dùng làm nguon_goc_id
-- ổn định cho fn_ghi_but_toan (chạy lại cùng kỳ = ghi đè, không nhân đôi).
create table if not exists khau_hao_thang (
  id uuid primary key default gen_random_uuid(),
  tai_san_id uuid not null references tai_san(id),
  ky date not null,                                   -- luôn là ngày cuối tháng
  so_tien numeric(14,2) not null,
  loai text not null check (loai in ('khau_hao_tscd', 'phan_bo_ccdc')),
  created_at timestamptz not null default now(),
  unique (tai_san_id, ky)
);

alter table but_toan drop constraint if exists but_toan_nguon_goc_loai_check;
alter table but_toan add constraint but_toan_nguon_goc_loai_check
  check (nguon_goc_loai in ('thu_cong','phieu_nhap_kho','hoa_don_ban','hoa_don_b2b',
                            'phieu_thu_cong_no','phieu_chi_ncc','chi_phi','khau_hao_ccdc'));

-- Mở rộng quyền kế toán viên: hiện chỉ có 'xem' trên module tai_san.
select bao_mat.gan_quyen('ke_toan', 'tai_san', array['xem','tao','sua']);

-- RLS bảng lịch sử phân bổ — theo chi nhánh của tài sản cha, giống phieu_bao_tri.
select bao_mat.gen_policy_con('khau_hao_thang', 'tai_san', 'tai_san_id', 'bao_mat.cn_tai_san', true);

-- RPC tính phân bổ cho TẤT CẢ tài sản đủ điều kiện trong 1 kỳ —
-- idempotent (chạy lại cùng kỳ ghi đè, không nhân đôi bút toán).
create or replace function rpc_tinh_phan_bo_thang(p_ky date)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_ky date := (date_trunc('month', p_ky) + interval '1 month' - interval '1 day')::date;
  v_so_tien numeric;
  v_tk_doi_ung text;
  v_kh_id uuid;
  v_dem int := 0;
begin
  if not bao_mat.co_quyen_moi_noi('tai_chinh', 'tao') then
    raise exception 'Không có quyền chạy phân bổ khấu hao/CCDC.' using errcode = 'insufficient_privilege';
  end if;

  for r in
    select id, chi_nhanh_id, ten_tai_san, phan_loai_ke_toan, nguyen_gia, so_thang_khau_hao
    from tai_san
    where phan_loai_ke_toan in ('tscd', 'ccdc')
      and trang_thai = 'dang_su_dung'
      and coalesce(nguyen_gia, 0) > 0
      and coalesce(so_thang_khau_hao, 0) > 0
      and ngay_dua_vao_su_dung is not null
      and date_trunc('month', p_ky) >= date_trunc('month', ngay_dua_vao_su_dung)
      and date_trunc('month', p_ky) < date_trunc('month', ngay_dua_vao_su_dung)
                                       + (so_thang_khau_hao || ' months')::interval
  loop
    v_so_tien := round(r.nguyen_gia / r.so_thang_khau_hao);
    v_tk_doi_ung := case r.phan_loai_ke_toan when 'tscd' then '214' else '242' end;

    insert into khau_hao_thang (tai_san_id, ky, so_tien, loai)
    values (r.id, v_ky, v_so_tien, case r.phan_loai_ke_toan when 'tscd' then 'khau_hao_tscd' else 'phan_bo_ccdc' end)
    on conflict (tai_san_id, ky) do update set so_tien = excluded.so_tien
    returning id into v_kh_id;

    perform fn_ghi_but_toan(
      'khau_hao_ccdc', v_kh_id, v_ky,
      (case r.phan_loai_ke_toan when 'tscd' then 'Khấu hao TSCĐ ' else 'Phân bổ CCDC ' end) || r.ten_tai_san,
      r.chi_nhanh_id,
      jsonb_build_array(
        jsonb_build_object('so_hieu', '642', 'no', v_so_tien, 'co', 0),
        jsonb_build_object('so_hieu', v_tk_doi_ung, 'no', 0, 'co', v_so_tien)
      )
    );
    v_dem := v_dem + 1;
  end loop;

  return v_dem;
end;
$$;

grant execute on function rpc_tinh_phan_bo_thang(date) to authenticated;
