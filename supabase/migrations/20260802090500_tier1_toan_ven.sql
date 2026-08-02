-- ============================================================
-- 06. TIER 1 — VÁ LỖI CHẶN PRODUCTION
--
-- Mô hình đã chốt: BTC → CỬA HÀNG.
--   Thành phẩm phải tồn tại trong kho trước khi bán (do BTC sản xuất
--   rồi điều chuyển, hoặc cửa hàng nhập mua). KHÔNG backflush.
--
-- Nội dung:
--   6.1 Chặn bán sai loại vật tư + thông báo tồn âm dễ hiểu + cờ cho phép âm
--   6.2 Lô hàng xuyên suốt nhập → tồn → xuất (FEFO, truy vết, HSD)
--   6.3 Tổng tiền tự tính từ dòng chi tiết
--   6.4 Công nợ B2B tính lại hai chiều (không còn trôi một chiều)
--   6.5 Nhật ký hệ thống ghi tự động
-- ============================================================

-- ------------------------------------------------------------
-- 6.1 KIỂM SOÁT BÁN HÀNG (mô hình BTC → cửa hàng)
-- ------------------------------------------------------------

alter table vat_tu
  add column if not exists duoc_ban boolean not null default false;

comment on column vat_tu.duoc_ban is
  'Chỉ vật tư có cờ này mới xuất hiện trên hóa đơn bán. Mặc định false — bật tay cho thành phẩm.';

-- Mặc định: mọi thành phẩm đều bán được (bạn tắt lại từng cái nếu cần).
update vat_tu set duoc_ban = true where loai_vat_tu = 'thanh_pham' and duoc_ban = false;

-- Van an toàn vận hành: khi số liệu lệch mà vẫn phải bán hàng.
alter table chi_nhanh
  add column if not exists cho_phep_ton_am boolean not null default false;

comment on column chi_nhanh.cho_phep_ton_am is
  'false (mặc định) = chặn giao dịch làm tồn âm. Bật tạm khi kho lệch số để không kẹt bán hàng.';

create or replace function trg_fn_kiem_tra_hang_ban() returns trigger as $$
declare
  v_loai text;
  v_duoc_ban boolean;
  v_ten text;
begin
  select loai_vat_tu, duoc_ban, ten_vat_tu
    into v_loai, v_duoc_ban, v_ten
  from vat_tu where id = new.vat_tu_id;

  if not coalesce(v_duoc_ban, false) then
    raise exception 'Vật tư "%" không được phép bán (vat_tu.duoc_ban = false). '
                    'Mô hình BTC → cửa hàng chỉ bán thành phẩm đã nhập kho.',
                    coalesce(v_ten, new.vat_tu_id::text)
      using errcode = 'check_violation';
  end if;

  if v_loai = 'nguyen_vat_lieu' then
    raise exception 'Không bán trực tiếp nguyên vật liệu "%" — phải qua phiếu sản xuất.', v_ten
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_kiem_tra_hang_ban on chi_tiet_hoa_don_ban;
create trigger trg_kiem_tra_hang_ban
before insert or update on chi_tiet_hoa_don_ban
for each row execute function trg_fn_kiem_tra_hang_ban();

-- ------------------------------------------------------------
-- 6.2 LÔ HÀNG XUYÊN SUỐT
-- ------------------------------------------------------------

-- Tồn theo lô. ton_kho vẫn là bảng tổng (giá vốn bình quân, giữ chỗ);
-- ton_kho_lo là chi tiết phục vụ FEFO + truy vết + cảnh báo HSD.
create table if not exists ton_kho_lo (
  id uuid primary key default gen_random_uuid(),
  chi_nhanh_id uuid not null references chi_nhanh(id),
  vat_tu_id uuid not null references vat_tu(id),
  lo_hang_id uuid not null references lo_hang(id),
  so_luong_ton numeric(14,3) not null default 0 check (so_luong_ton >= 0),
  cap_nhat_luc timestamptz not null default now(),
  unique (chi_nhanh_id, vat_tu_id, lo_hang_id)
);

create index if not exists idx_ton_kho_lo_tra_cuu on ton_kho_lo (chi_nhanh_id, vat_tu_id)
  where so_luong_ton > 0;

alter table the_kho              add column if not exists lo_hang_id uuid references lo_hang(id);
alter table chi_tiet_phieu_nhap  add column if not exists lo_hang_id uuid references lo_hang(id);
alter table chi_tiet_phieu_xuat  add column if not exists lo_hang_id uuid references lo_hang(id);

create index if not exists idx_the_kho_lo on the_kho (lo_hang_id) where lo_hang_id is not null;
create index if not exists idx_the_kho_chung_tu on the_kho (chung_tu_loai, chung_tu_id);
create index if not exists idx_lo_hang_hsd on lo_hang (han_su_dung) where trang_thai <> 'thu_hoi';

-- ===== fn_capnhat_ton_kho: thêm tham số lô + thông báo lỗi rõ ràng =====
drop function if exists fn_capnhat_ton_kho(uuid, uuid, numeric, text, uuid, text);

create or replace function fn_capnhat_ton_kho(
  p_chi_nhanh_id uuid,
  p_vat_tu_id uuid,
  p_so_luong_thay_doi numeric,
  p_loai_giao_dich text,
  p_chung_tu_id uuid,
  p_chung_tu_loai text,
  p_lo_hang_id uuid default null
) returns void as $$
declare
  v_ton_moi numeric(14,3);
  v_cho_am boolean;
  v_ten_vt text;
  v_ten_cn text;
begin
  insert into ton_kho (chi_nhanh_id, vat_tu_id, so_luong_ton, cap_nhat_luc)
  values (p_chi_nhanh_id, p_vat_tu_id, p_so_luong_thay_doi, now())
  on conflict (chi_nhanh_id, vat_tu_id)
  do update set
    so_luong_ton = ton_kho.so_luong_ton + p_so_luong_thay_doi,
    cap_nhat_luc = now()
  returning so_luong_ton into v_ton_moi;

  if v_ton_moi < 0 then
    select cho_phep_ton_am, ten_chi_nhanh into v_cho_am, v_ten_cn
      from chi_nhanh where id = p_chi_nhanh_id;

    if not coalesce(v_cho_am, false) then
      select ten_vat_tu into v_ten_vt from vat_tu where id = p_vat_tu_id;
      raise exception 'Không đủ tồn kho: "%" tại % — cần % nhưng chỉ còn %.',
        coalesce(v_ten_vt, p_vat_tu_id::text),
        coalesce(v_ten_cn, p_chi_nhanh_id::text),
        abs(p_so_luong_thay_doi),
        v_ton_moi - p_so_luong_thay_doi
        using errcode = 'check_violation',
              hint = 'Nhận điều chuyển từ BTC hoặc kiểm kê lại. '
                     'Trường hợp khẩn cấp: bật chi_nhanh.cho_phep_ton_am.';
    end if;
  end if;

  if p_lo_hang_id is not null then
    insert into ton_kho_lo (chi_nhanh_id, vat_tu_id, lo_hang_id, so_luong_ton, cap_nhat_luc)
    values (p_chi_nhanh_id, p_vat_tu_id, p_lo_hang_id, p_so_luong_thay_doi, now())
    on conflict (chi_nhanh_id, vat_tu_id, lo_hang_id)
    do update set
      so_luong_ton = ton_kho_lo.so_luong_ton + p_so_luong_thay_doi,
      cap_nhat_luc = now();
  end if;

  insert into the_kho (
    chi_nhanh_id, vat_tu_id, loai_giao_dich, so_luong,
    ton_sau_giao_dich, chung_tu_id, chung_tu_loai, lo_hang_id
  ) values (
    p_chi_nhanh_id, p_vat_tu_id, p_loai_giao_dich, p_so_luong_thay_doi,
    v_ton_moi, p_chung_tu_id, p_chung_tu_loai, p_lo_hang_id
  );
end;
$$ language plpgsql;

drop function if exists fn_nhap_kho_cap_nhat_gia_von(uuid, uuid, numeric, numeric, text, uuid, text);

create or replace function fn_nhap_kho_cap_nhat_gia_von(
  p_chi_nhanh_id uuid,
  p_vat_tu_id uuid,
  p_so_luong_nhap numeric,
  p_don_gia numeric,
  p_loai_giao_dich text,
  p_chung_tu_id uuid,
  p_chung_tu_loai text,
  p_lo_hang_id uuid default null
) returns void as $$
declare
  v_ton_truoc numeric(14,3);
  v_gia_truoc numeric(14,2);
  v_gia_moi numeric(14,2);
begin
  select so_luong_ton, gia_von_binh_quan into v_ton_truoc, v_gia_truoc
  from ton_kho where chi_nhanh_id = p_chi_nhanh_id and vat_tu_id = p_vat_tu_id
  for update;

  v_ton_truoc := coalesce(v_ton_truoc, 0);
  v_gia_truoc := coalesce(v_gia_truoc, 0);

  if (v_ton_truoc + p_so_luong_nhap) > 0 then
    v_gia_moi := ((v_ton_truoc * v_gia_truoc) + (p_so_luong_nhap * coalesce(p_don_gia, 0)))
                 / (v_ton_truoc + p_so_luong_nhap);
  else
    v_gia_moi := coalesce(p_don_gia, 0);
  end if;

  perform fn_capnhat_ton_kho(
    p_chi_nhanh_id, p_vat_tu_id, p_so_luong_nhap,
    p_loai_giao_dich, p_chung_tu_id, p_chung_tu_loai, p_lo_hang_id
  );

  update ton_kho set gia_von_binh_quan = v_gia_moi
  where chi_nhanh_id = p_chi_nhanh_id and vat_tu_id = p_vat_tu_id;
end;
$$ language plpgsql;

-- ===== Xuất theo FEFO (hết hạn trước — xuất trước) =====
create or replace function fn_xuat_fefo(
  p_chi_nhanh_id uuid,
  p_vat_tu_id uuid,
  p_so_luong numeric,          -- số DƯƠNG cần xuất
  p_loai_giao_dich text,
  p_chung_tu_id uuid,
  p_chung_tu_loai text
) returns void as $$
declare
  r record;
  v_con numeric := p_so_luong;
  v_lay numeric;
begin
  for r in
    select tkl.lo_hang_id, tkl.so_luong_ton
    from ton_kho_lo tkl
    join lo_hang lh on lh.id = tkl.lo_hang_id
    where tkl.chi_nhanh_id = p_chi_nhanh_id
      and tkl.vat_tu_id = p_vat_tu_id
      and tkl.so_luong_ton > 0
      and lh.trang_thai <> 'thu_hoi'
    order by lh.han_su_dung nulls last, lh.created_at
  loop
    exit when v_con <= 0;
    v_lay := least(v_con, r.so_luong_ton);
    perform fn_capnhat_ton_kho(
      p_chi_nhanh_id, p_vat_tu_id, -v_lay,
      p_loai_giao_dich, p_chung_tu_id, p_chung_tu_loai, r.lo_hang_id
    );
    v_con := v_con - v_lay;
  end loop;

  -- Phần tồn chưa gắn lô (hàng cũ, hàng không quản lý HSD)
  if v_con > 0 then
    perform fn_capnhat_ton_kho(
      p_chi_nhanh_id, p_vat_tu_id, -v_con,
      p_loai_giao_dich, p_chung_tu_id, p_chung_tu_loai, null
    );
  end if;
end;
$$ language plpgsql;

-- ===== Tự sinh lô khi nhập / khi sản xuất =====
create or replace function fn_tao_lo(
  p_vat_tu_id uuid,
  p_nguon_goc text,            -- 'nhap_mua' | 'san_xuat'
  p_chung_tu_id uuid,
  p_ngay_san_xuat date,
  p_han_su_dung date,
  p_nha_cung_cap_id uuid default null,
  p_tien_to text default 'LO'
) returns uuid as $$
declare
  v_id uuid;
  v_hsd date := p_han_su_dung;
  v_so_ngay int;
begin
  if v_hsd is null then
    select han_su_dung_ngay into v_so_ngay from vat_tu where id = p_vat_tu_id;
    if v_so_ngay is not null and v_so_ngay > 0 then
      v_hsd := coalesce(p_ngay_san_xuat, current_date) + v_so_ngay;
    end if;
  end if;

  insert into lo_hang (
    ma_lo, vat_tu_id, nguon_goc_loai, chung_tu_nguon_id,
    ngay_san_xuat, han_su_dung, nha_cung_cap_id
  ) values (
    p_tien_to || '-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6),
    p_vat_tu_id, p_nguon_goc, p_chung_tu_id,
    coalesce(p_ngay_san_xuat, current_date), v_hsd, p_nha_cung_cap_id
  )
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql;

-- ===== Trigger nhập kho: gắn lô =====
create or replace function trg_fn_phieu_nhap_duyet() returns trigger as $$
declare
  r record;
  v_lo uuid;
begin
  if new.trang_thai = 'da_duyet' and old.trang_thai is distinct from 'da_duyet' then
    for r in
      select id, vat_tu_id, so_luong, don_gia, han_su_dung, lo_hang_id
      from chi_tiet_phieu_nhap where phieu_nhap_id = new.id
    loop
      v_lo := r.lo_hang_id;

      -- Chưa chỉ định lô: tự tạo nếu vật tư có quản lý hạn dùng
      if v_lo is null and (r.han_su_dung is not null
          or exists (select 1 from vat_tu v
                      where v.id = r.vat_tu_id and coalesce(v.han_su_dung_ngay, 0) > 0)) then
        v_lo := fn_tao_lo(r.vat_tu_id, 'nhap_mua', new.id,
                          new.ngay_nhap::date, r.han_su_dung, new.nha_cung_cap_id, 'LN');
        update chi_tiet_phieu_nhap set lo_hang_id = v_lo where id = r.id;
      end if;

      perform fn_nhap_kho_cap_nhat_gia_von(
        new.chi_nhanh_id, r.vat_tu_id, r.so_luong, r.don_gia,
        'nhap_mua', new.id, 'phieu_nhap_kho', v_lo
      );
      update vat_tu set gia_von_gan_nhat = r.don_gia where id = r.vat_tu_id;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

-- ===== Trigger sản xuất: đầu vào FEFO, đầu ra tạo lô mới =====
create or replace function trg_fn_phieu_san_xuat_hoan_thanh() returns trigger as $$
declare
  r record;
  v_vat_tu_dau_ra uuid;
  v_tong_chi_phi numeric(14,2) := 0;
  v_gia_von_dau_vao numeric(14,2);
  v_don_gia_dau_ra numeric(14,2);
  v_lo_ra uuid;
  v_sl_ra numeric(14,3);
begin
  if new.trang_thai = 'hoan_thanh' and old.trang_thai is distinct from 'hoan_thanh' then

    for r in
      select vat_tu_id, so_luong_thuc_te
      from chi_tiet_san_xuat_dau_vao
      where phieu_san_xuat_id = new.id
    loop
      select gia_von_binh_quan into v_gia_von_dau_vao
        from ton_kho where chi_nhanh_id = new.chi_nhanh_id and vat_tu_id = r.vat_tu_id;

      v_tong_chi_phi := v_tong_chi_phi + (r.so_luong_thuc_te * coalesce(v_gia_von_dau_vao, 0));

      perform fn_xuat_fefo(
        new.chi_nhanh_id, r.vat_tu_id, r.so_luong_thuc_te,
        'san_xuat_xuat', new.id, 'phieu_san_xuat'
      );
    end loop;

    update phieu_san_xuat set tong_chi_phi_thuc_te = v_tong_chi_phi where id = new.id;

    select vat_tu_dau_ra_id into v_vat_tu_dau_ra
    from cong_thuc_san_xuat where id = new.cong_thuc_id;

    v_sl_ra := coalesce(new.so_luong_thuc_te, 0);

    if v_sl_ra > 0 then
      v_don_gia_dau_ra := v_tong_chi_phi / v_sl_ra;

      v_lo_ra := fn_tao_lo(v_vat_tu_dau_ra, 'san_xuat', new.id,
                           new.ngay_san_xuat::date, null, null, 'LS');

      perform fn_nhap_kho_cap_nhat_gia_von(
        new.chi_nhanh_id, v_vat_tu_dau_ra, v_sl_ra,
        v_don_gia_dau_ra, 'san_xuat_nhap', new.id, 'phieu_san_xuat', v_lo_ra
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- ===== Trigger điều chuyển: xuất FEFO, nhập GIỮ NGUYÊN LÔ =====
create or replace function trg_fn_phieu_xuat_gui() returns trigger as $$
declare
  r record;
  v_loai text;
begin
  if new.trang_thai = 'da_gui' and old.trang_thai is distinct from 'da_gui' then
    v_loai := case when new.loai_xuat = 'huy_hang' then 'huy_hang' else 'dieu_chuyen_di' end;
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

create or replace function trg_fn_phieu_xuat_nhan() returns trigger as $$
declare
  r record;
begin
  if new.trang_thai = 'da_nhan' and old.trang_thai is distinct from 'da_nhan'
     and new.loai_xuat = 'dieu_chuyen' and new.kho_nhan_id is not null then

    -- Đọc lại chính các dòng thẻ kho đã ghi lúc gửi => nhận đúng từng lô.
    for r in
      select vat_tu_id, lo_hang_id, sum(abs(so_luong)) as so_luong
      from the_kho
      where chung_tu_loai = 'phieu_xuat_kho'
        and chung_tu_id = new.id
        and loai_giao_dich = 'dieu_chuyen_di'
      group by vat_tu_id, lo_hang_id
    loop
      perform fn_nhap_kho_cap_nhat_gia_von(
        new.kho_nhan_id, r.vat_tu_id, r.so_luong,
        coalesce((select gia_von_binh_quan from ton_kho
                   where chi_nhanh_id = new.kho_xuat_id and vat_tu_id = r.vat_tu_id), 0),
        'dieu_chuyen_den', new.id, 'phieu_xuat_kho', r.lo_hang_id
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

-- ===== Bán lẻ: xuất FEFO + hoàn kho khi hủy =====
create or replace function trg_fn_chi_tiet_hoa_don_insert() returns trigger as $$
declare
  v_chi_nhanh_id uuid;
  v_trang_thai text;
begin
  select chi_nhanh_id, trang_thai into v_chi_nhanh_id, v_trang_thai
  from hoa_don_ban where id = new.hoa_don_id;

  if v_trang_thai = 'hoan_thanh' then
    perform fn_xuat_fefo(
      v_chi_nhanh_id, new.vat_tu_id, new.so_luong,
      'ban_hang', new.hoa_don_id, 'hoa_don_ban'
    );
  end if;
  return new;
end;
$$ language plpgsql;

-- Hoàn kho cho CẢ 'tra_hang' LẪN 'da_huy' (bản cũ bỏ sót 'da_huy'
-- => hóa đơn hủy vẫn bị trừ kho vĩnh viễn).
create or replace function trg_fn_hoa_don_tra_hang() returns trigger as $$
declare
  r record;
begin
  if new.trang_thai in ('tra_hang', 'da_huy')
     and old.trang_thai = 'hoan_thanh' then
    for r in
      select vat_tu_id, so_luong from chi_tiet_hoa_don_ban where hoa_don_id = new.id
    loop
      perform fn_capnhat_ton_kho(
        new.chi_nhanh_id, r.vat_tu_id, r.so_luong,
        'dieu_chinh', new.id, 'hoa_don_ban', null
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

-- ===== B2B xuất thật: FEFO =====
create or replace function trg_fn_don_hang_b2b_xuat_that() returns trigger as $$
declare
  r record;
  v_gia numeric(14,2);
begin
  if new.trang_thai = 'dang_giao' and old.trang_thai = 'da_xac_nhan' then
    for r in
      select id, vat_tu_id, so_luong from chi_tiet_don_hang_b2b where don_hang_id = new.id
    loop
      select gia_von_binh_quan into v_gia from ton_kho
        where chi_nhanh_id = new.chi_nhanh_giao_id and vat_tu_id = r.vat_tu_id;

      update chi_tiet_don_hang_b2b set gia_von_tai_ban = coalesce(v_gia, 0)
        where id = r.id;

      perform fn_xuat_fefo(
        new.chi_nhanh_giao_id, r.vat_tu_id, r.so_luong,
        'ban_b2b', new.id, 'don_hang_b2b'
      );
      perform fn_giu_cho_kho(
        new.chi_nhanh_giao_id, r.vat_tu_id, -r.so_luong,
        'giai_phong_xac_nhan_xuat', new.id
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

-- ===== Cảnh báo & truy vết lô =====
create or replace view canh_bao_han_su_dung
with (security_invoker = on) as
select cn.id as chi_nhanh_id, cn.ten_chi_nhanh,
       vt.ten_vat_tu, lh.ma_lo, lh.han_su_dung,
       (lh.han_su_dung - current_date) as con_lai_ngay,
       tkl.so_luong_ton,
       case
         when lh.han_su_dung < current_date then 'da_het_han'
         when lh.han_su_dung <= current_date + 3 then 'khan_cap'
         when lh.han_su_dung <= current_date + 7 then 'sap_het'
         else 'binh_thuong'
       end as muc_do
from ton_kho_lo tkl
join lo_hang lh on lh.id = tkl.lo_hang_id
join vat_tu vt on vt.id = tkl.vat_tu_id
join chi_nhanh cn on cn.id = tkl.chi_nhanh_id
where tkl.so_luong_ton > 0
  and lh.han_su_dung is not null
  and lh.han_su_dung <= current_date + 30;

create or replace view truy_vet_lo
with (security_invoker = on) as
select lh.ma_lo, lh.vat_tu_id, vt.ten_vat_tu, lh.han_su_dung, lh.trang_thai,
       tk.chi_nhanh_id, cn.ten_chi_nhanh, tk.loai_giao_dich, tk.so_luong,
       tk.chung_tu_loai, tk.chung_tu_id, tk.created_at
from lo_hang lh
join the_kho tk on tk.lo_hang_id = lh.id
join vat_tu vt on vt.id = lh.vat_tu_id
join chi_nhanh cn on cn.id = tk.chi_nhanh_id
order by lh.ma_lo, tk.created_at;

-- ------------------------------------------------------------
-- 6.3 TỔNG TIỀN TỰ TÍNH
-- Bản cũ để app tự set => check hạn mức công nợ có thể bị qua mặt
-- bằng cách gửi tong_tien = 0.
-- ------------------------------------------------------------

create or replace function trg_fn_cong_don_phieu_nhap() returns trigger as $$
declare v_id uuid;
begin
  v_id := coalesce(new.phieu_nhap_id, old.phieu_nhap_id);
  update phieu_nhap_kho p
     set tong_tien = coalesce((select sum(thanh_tien) from chi_tiet_phieu_nhap
                                where phieu_nhap_id = v_id), 0)
   where p.id = v_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_cong_don_phieu_nhap on chi_tiet_phieu_nhap;
create trigger trg_cong_don_phieu_nhap
after insert or update or delete on chi_tiet_phieu_nhap
for each row execute function trg_fn_cong_don_phieu_nhap();

create or replace function trg_fn_cong_don_hoa_don_ban() returns trigger as $$
declare v_id uuid;
begin
  v_id := coalesce(new.hoa_don_id, old.hoa_don_id);
  update hoa_don_ban h
     set tong_tien_hang = coalesce((select sum(thanh_tien) from chi_tiet_hoa_don_ban
                                     where hoa_don_id = v_id), 0)
   where h.id = v_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_cong_don_hoa_don_ban on chi_tiet_hoa_don_ban;
create trigger trg_cong_don_hoa_don_ban
after insert or update or delete on chi_tiet_hoa_don_ban
for each row execute function trg_fn_cong_don_hoa_don_ban();

create or replace function trg_fn_cong_don_don_hang_b2b() returns trigger as $$
declare v_id uuid;
begin
  v_id := coalesce(new.don_hang_id, old.don_hang_id);
  update don_hang_b2b d
     set tong_tien = coalesce((select sum(thanh_tien) from chi_tiet_don_hang_b2b
                                where don_hang_id = v_id), 0)
   where d.id = v_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_cong_don_don_hang_b2b on chi_tiet_don_hang_b2b;
create trigger trg_cong_don_don_hang_b2b
after insert or update or delete on chi_tiet_don_hang_b2b
for each row execute function trg_fn_cong_don_don_hang_b2b();

-- ------------------------------------------------------------
-- 6.4 CÔNG NỢ B2B — TÍNH LẠI THAY VÌ CỘNG DỒN
-- Bản cũ chỉ tăng khi tạo hóa đơn và giảm khi thu tiền: hủy hóa đơn,
-- xóa hóa đơn, sửa số tiền đều làm dư nợ trôi vĩnh viễn.
-- ------------------------------------------------------------

alter table hoa_don_b2b
  add column if not exists trang_thai text not null default 'hieu_luc';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'hoa_don_b2b'::regclass and conname = 'hoa_don_b2b_trang_thai_check') then
    alter table hoa_don_b2b add constraint hoa_don_b2b_trang_thai_check
      check (trang_thai in ('hieu_luc', 'da_huy'));
  end if;
end $$;

create or replace function fn_tinh_lai_du_no(p_khach_hang_id uuid) returns void as $$
begin
  update khach_hang_b2b k
     set du_no_hien_tai = coalesce((
           select sum(h.tong_tien - h.da_thanh_toan)
           from hoa_don_b2b h
           where h.khach_hang_b2b_id = p_khach_hang_id
             and h.trang_thai = 'hieu_luc'
         ), 0)
   where k.id = p_khach_hang_id;
end;
$$ language plpgsql;

-- Kiểm tra hạn mức TRƯỚC khi ghi (bản cũ kiểm tra sau insert).
create or replace function trg_fn_hoa_don_b2b_kiem_han_muc() returns trigger as $$
declare
  v_han_muc numeric(14,2);
  v_du_no numeric(14,2);
  v_ten text;
begin
  select han_muc_cong_no, du_no_hien_tai, ten_doanh_nghiep
    into v_han_muc, v_du_no, v_ten
  from khach_hang_b2b where id = new.khach_hang_b2b_id;

  if coalesce(v_han_muc, 0) > 0 and new.trang_thai = 'hieu_luc'
     and (coalesce(v_du_no, 0) + new.tong_tien) > v_han_muc then
    raise exception 'Khách "%" vượt hạn mức công nợ: dư nợ % + hóa đơn % > hạn mức %.',
      v_ten, v_du_no, new.tong_tien, v_han_muc
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_hoa_don_b2b_insert on hoa_don_b2b;
drop trigger if exists trg_hoa_don_b2b_kiem_han_muc on hoa_don_b2b;
create trigger trg_hoa_don_b2b_kiem_han_muc
before insert on hoa_don_b2b
for each row execute function trg_fn_hoa_don_b2b_kiem_han_muc();

create or replace function trg_fn_hoa_don_b2b_dong_bo_du_no() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform fn_tinh_lai_du_no(old.khach_hang_b2b_id);
  else
    perform fn_tinh_lai_du_no(new.khach_hang_b2b_id);
    if tg_op = 'UPDATE' and old.khach_hang_b2b_id is distinct from new.khach_hang_b2b_id then
      perform fn_tinh_lai_du_no(old.khach_hang_b2b_id);
    end if;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_hoa_don_b2b_dong_bo_du_no on hoa_don_b2b;
create trigger trg_hoa_don_b2b_dong_bo_du_no
after insert or update or delete on hoa_don_b2b
for each row execute function trg_fn_hoa_don_b2b_dong_bo_du_no();

-- Phiếu thu: tính lại "đã thanh toán" từ tổng phiếu thu (idempotent),
-- thay vì cộng dồn từng lần.
create or replace function trg_fn_phieu_thu_cong_no() returns trigger as $$
declare
  v_hoa_don_id uuid;
  v_khach_id uuid;
begin
  v_hoa_don_id := coalesce(new.hoa_don_b2b_id, old.hoa_don_b2b_id);

  update hoa_don_b2b h
     set da_thanh_toan = coalesce((select sum(so_tien) from phieu_thu_cong_no
                                    where hoa_don_b2b_id = v_hoa_don_id), 0)
   where h.id = v_hoa_don_id
   returning h.khach_hang_b2b_id into v_khach_id;

  update hoa_don_b2b
     set trang_thai_thanh_toan = case
           when da_thanh_toan >= tong_tien then 'da_thanh_toan'
           when da_thanh_toan > 0 then 'thanh_toan_mot_phan'
           when han_thanh_toan < current_date then 'qua_han'
           else 'chua_thanh_toan'
         end
   where id = v_hoa_don_id;

  if v_khach_id is not null then
    perform fn_tinh_lai_du_no(v_khach_id);
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_thu_cong_no on phieu_thu_cong_no;
create trigger trg_phieu_thu_cong_no
after insert or update or delete on phieu_thu_cong_no
for each row execute function trg_fn_phieu_thu_cong_no();

-- Đánh dấu quá hạn — gọi định kỳ (pg_cron, xem migration 08).
create or replace function fn_cap_nhat_cong_no_qua_han() returns int as $$
declare v_so int;
begin
  update hoa_don_b2b
     set trang_thai_thanh_toan = 'qua_han'
   where trang_thai = 'hieu_luc'
     and trang_thai_thanh_toan in ('chua_thanh_toan', 'thanh_toan_mot_phan')
     and han_thanh_toan < current_date;
  get diagnostics v_so = row_count;
  return v_so;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- 6.5 NHẬT KÝ HỆ THỐNG GHI TỰ ĐỘNG
-- Bảng nhat_ky_he_thong trước đây không có gì ghi vào => rỗng vĩnh viễn.
-- ------------------------------------------------------------

create or replace function trg_fn_ghi_nhat_ky() returns trigger as $$
declare
  v_truoc jsonb;
  v_sau jsonb;
  v_ban_ghi uuid;
  v_ip text;
begin
  if tg_op = 'DELETE' then
    v_truoc := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_truoc := to_jsonb(old);
    v_sau := to_jsonb(new);
    if v_truoc = v_sau then
      return null;   -- không đổi gì thì không ghi
    end if;
  else
    v_sau := to_jsonb(new);
  end if;

  v_ban_ghi := nullif(coalesce(v_sau, v_truoc) ->> 'id', '')::uuid;

  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  insert into nhat_ky_he_thong (
    nguoi_dung_id, hanh_dong, bang_du_lieu, ban_ghi_id,
    du_lieu_truoc, du_lieu_sau, dia_chi_ip
  ) values (
    bao_mat.nguoi_dung_id(), tg_op, tg_table_name, v_ban_ghi,
    v_truoc, v_sau, v_ip
  );
  return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Gắn vào các bảng nhạy cảm (tiền, kho, phân quyền).
do $$
declare
  b text;
begin
  foreach b in array array[
    'phieu_nhap_kho', 'phieu_xuat_kho', 'phieu_san_xuat',
    'hoa_don_ban', 'don_hang_b2b', 'hoa_don_b2b',
    'phieu_thu_cong_no', 'phieu_chi_ncc', 'chi_phi',
    'vat_tu', 'nha_cung_cap', 'khach_hang_b2b', 'chi_nhanh', 'nhan_vien',
    'nguoi_dung_he_thong', 'nguoi_dung_vai_tro', 'vai_tro_quyen'
  ]
  loop
    execute format('drop trigger if exists trg_nhat_ky_%s on public.%I', b, b);
    execute format(
      'create trigger trg_nhat_ky_%s after insert or update or delete on public.%I
       for each row execute function trg_fn_ghi_nhat_ky()', b, b);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 6.6 KHÓA LẠI CÁC HÀM MỚI (như migration 04)
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
