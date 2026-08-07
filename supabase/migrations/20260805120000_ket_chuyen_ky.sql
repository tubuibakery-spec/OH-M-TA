-- ============================================================
-- Kết chuyển lãi/lỗ cuối kỳ — thiếu bước này thì tài khoản 421
-- (Lợi nhuận chưa phân phối) không bao giờ được ghi, khiến Bảng
-- cân đối kế toán không bao giờ cân đúng khi có phát sinh doanh
-- thu/chi phí (Tài sản đã tăng/giảm thật theo bút toán bán hàng/
-- chi phí, nhưng Vốn chủ sở hữu không được cộng lãi/lỗ tương ứng).
--
-- Quyết định thiết kế: kết chuyển THẲNG từ tài khoản doanh thu/chi
-- phí sang 421, KHÔNG dựng thêm 911 trung gian (đúng chuẩn kế toán
-- đầy đủ phải qua 911, nhưng hệ thống chưa có 911 và thêm 2 bước sẽ
-- vượt phạm vi hợp lý) — hiệu ứng ròng trên 421 giống hệt kết quả
-- qua 911.
-- ============================================================

alter table but_toan drop constraint if exists but_toan_nguon_goc_loai_check;
alter table but_toan add constraint but_toan_nguon_goc_loai_check
  check (nguon_goc_loai in ('thu_cong','phieu_nhap_kho','hoa_don_ban','hoa_don_b2b',
                            'phieu_thu_cong_no','phieu_chi_ncc','chi_phi','khau_hao_ccdc','ket_chuyen'));

-- Neo 1 uuid ổn định cho mỗi tháng — dùng làm nguon_goc_id để
-- fn_ghi_but_toan tự xóa+ghi lại đúng bút toán kết chuyển cũ khi
-- chạy lại cùng tháng (idempotent).
create table if not exists ky_ket_chuyen (
  thang date primary key,
  but_toan_nguon_id uuid not null default gen_random_uuid()
);

select bao_mat.gen_policy_danh_muc('ky_ket_chuyen', 'tai_chinh');

create or replace function rpc_ket_chuyen_thang(p_thang date)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_thang date := date_trunc('month', p_thang)::date;
  v_cuoi_thang date := (v_thang + interval '1 month' - interval '1 day')::date;
  v_id uuid;
  v_dong jsonb := '[]'::jsonb;
  v_tong_no numeric := 0;
  v_tong_co numeric := 0;
  r record;
begin
  if not bao_mat.co_quyen_moi_noi('tai_chinh', 'duyet') then
    raise exception 'Không có quyền kết chuyển kỳ kế toán.' using errcode = 'insufficient_privilege';
  end if;

  insert into ky_ket_chuyen (thang) values (v_thang)
  on conflict (thang) do update set thang = excluded.thang
  returning but_toan_nguon_id into v_id;

  for r in
    select tk.so_hieu, tk.loai,
      case when tk.loai = 'doanh_thu' then sum(ct.co) - sum(ct.no) else sum(ct.no) - sum(ct.co) end as so_tien
    from chi_tiet_but_toan ct
    join but_toan bt on bt.id = ct.but_toan_id
    join he_thong_tai_khoan tk on tk.id = ct.tai_khoan_id
    where tk.loai in ('doanh_thu', 'chi_phi')
      and bt.ngay_hach_toan between v_thang and v_cuoi_thang
      and bt.nguon_goc_loai <> 'ket_chuyen'
    group by tk.so_hieu, tk.loai
    having (case when tk.loai = 'doanh_thu' then sum(ct.co) - sum(ct.no) else sum(ct.no) - sum(ct.co) end) <> 0
  loop
    if r.loai = 'doanh_thu' then
      v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', r.so_hieu, 'no', r.so_tien, 'co', 0));
      v_tong_no := v_tong_no + r.so_tien;
    else
      v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', r.so_hieu, 'no', 0, 'co', r.so_tien));
      v_tong_co := v_tong_co + r.so_tien;
    end if;
  end loop;

  if v_tong_no = 0 and v_tong_co = 0 then
    perform fn_ghi_but_toan('ket_chuyen', v_id, v_cuoi_thang, null, null, null);  -- xóa kết chuyển cũ nếu tháng không còn phát sinh
    return;
  end if;

  -- Cân bằng lại bằng 421: nếu lãi (tổng DT > tổng CP) thì Có 421, ngược lại Nợ 421.
  if v_tong_no > v_tong_co then
    v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', '421', 'no', 0, 'co', v_tong_no - v_tong_co));
  elsif v_tong_co > v_tong_no then
    v_dong := v_dong || jsonb_build_array(jsonb_build_object('so_hieu', '421', 'no', v_tong_co - v_tong_no, 'co', 0));
  end if;

  perform fn_ghi_but_toan('ket_chuyen', v_id, v_cuoi_thang,
    'Kết chuyển lãi/lỗ tháng ' || to_char(v_thang, 'MM/YYYY'), null, v_dong);
end;
$$;

grant execute on function rpc_ket_chuyen_thang(date) to authenticated;
