-- ============================================================
-- 02. HÀM DÙNG CHUNG + TRIGGER
-- Nguồn: schema_full_1.sql (mục O, P) — giữ nguyên logic.
-- Chỉ thêm "drop trigger if exists" để chạy lại được nhiều lần.
-- LƯU Ý: migration 04 sẽ chuyển các hàm này sang SECURITY DEFINER
-- (kho/thẻ kho chỉ được sửa qua hàm, không sửa trực tiếp).
-- ============================================================

-- ------------------------------------------------------------
-- O. HÀM DÙNG CHUNG
-- ------------------------------------------------------------

create or replace function fn_capnhat_ton_kho(
  p_chi_nhanh_id uuid,
  p_vat_tu_id uuid,
  p_so_luong_thay_doi numeric,
  p_loai_giao_dich text,
  p_chung_tu_id uuid,
  p_chung_tu_loai text
) returns void as $$
declare
  v_ton_moi numeric(14,3);
begin
  insert into ton_kho (chi_nhanh_id, vat_tu_id, so_luong_ton, cap_nhat_luc)
  values (p_chi_nhanh_id, p_vat_tu_id, p_so_luong_thay_doi, now())
  on conflict (chi_nhanh_id, vat_tu_id)
  do update set
    so_luong_ton = ton_kho.so_luong_ton + p_so_luong_thay_doi,
    cap_nhat_luc = now()
  returning so_luong_ton into v_ton_moi;

  if v_ton_moi < 0 then
    raise exception 'Tồn kho âm: vật tư % tại chi nhánh % sẽ còn %',
      p_vat_tu_id, p_chi_nhanh_id, v_ton_moi;
  end if;

  insert into the_kho (
    chi_nhanh_id, vat_tu_id, loai_giao_dich, so_luong,
    ton_sau_giao_dich, chung_tu_id, chung_tu_loai
  ) values (
    p_chi_nhanh_id, p_vat_tu_id, p_loai_giao_dich, p_so_luong_thay_doi,
    v_ton_moi, p_chung_tu_id, p_chung_tu_loai
  );
end;
$$ language plpgsql;

create or replace function fn_nhap_kho_cap_nhat_gia_von(
  p_chi_nhanh_id uuid,
  p_vat_tu_id uuid,
  p_so_luong_nhap numeric,
  p_don_gia numeric,
  p_loai_giao_dich text,
  p_chung_tu_id uuid,
  p_chung_tu_loai text
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
    p_loai_giao_dich, p_chung_tu_id, p_chung_tu_loai
  );

  update ton_kho set gia_von_binh_quan = v_gia_moi
  where chi_nhanh_id = p_chi_nhanh_id and vat_tu_id = p_vat_tu_id;
end;
$$ language plpgsql;

create or replace function fn_giu_cho_kho(
  p_chi_nhanh_id uuid,
  p_vat_tu_id uuid,
  p_so_luong_thay_doi numeric,
  p_ly_do text,
  p_chung_tu_id uuid
) returns void as $$
declare
  v_ton numeric(14,3);
  v_giu_cho_moi numeric(14,3);
begin
  select so_luong_ton, so_luong_giu_cho into v_ton, v_giu_cho_moi
  from ton_kho where chi_nhanh_id = p_chi_nhanh_id and vat_tu_id = p_vat_tu_id
  for update;

  if v_ton is null then
    raise exception 'Chưa có tồn kho cho vật tư % tại chi nhánh %', p_vat_tu_id, p_chi_nhanh_id;
  end if;

  v_giu_cho_moi := v_giu_cho_moi + p_so_luong_thay_doi;

  if v_giu_cho_moi > v_ton then
    raise exception 'Không đủ hàng khả dụng để giữ chỗ: tồn %, đã giữ %, yêu cầu thêm %',
      v_ton, v_giu_cho_moi - p_so_luong_thay_doi, p_so_luong_thay_doi;
  end if;

  update ton_kho set so_luong_giu_cho = v_giu_cho_moi, cap_nhat_luc = now()
  where chi_nhanh_id = p_chi_nhanh_id and vat_tu_id = p_vat_tu_id;

  insert into lich_su_giu_cho (chi_nhanh_id, vat_tu_id, so_luong, ly_do, chung_tu_id)
  values (p_chi_nhanh_id, p_vat_tu_id, p_so_luong_thay_doi, p_ly_do, p_chung_tu_id);
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- P. TRIGGER
-- ------------------------------------------------------------

create or replace function trg_fn_phieu_nhap_duyet() returns trigger as $$
declare
  r record;
begin
  if new.trang_thai = 'da_duyet' and old.trang_thai is distinct from 'da_duyet' then
    for r in
      select vat_tu_id, so_luong, don_gia from chi_tiet_phieu_nhap where phieu_nhap_id = new.id
    loop
      perform fn_nhap_kho_cap_nhat_gia_von(
        new.chi_nhanh_id, r.vat_tu_id, r.so_luong, r.don_gia,
        'nhap_mua', new.id, 'phieu_nhap_kho'
      );
      update vat_tu set gia_von_gan_nhat = r.don_gia where id = r.vat_tu_id;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_nhap_duyet on phieu_nhap_kho;
create trigger trg_phieu_nhap_duyet
after update on phieu_nhap_kho
for each row execute function trg_fn_phieu_nhap_duyet();

create or replace function trg_fn_phieu_san_xuat_hoan_thanh() returns trigger as $$
declare
  r record;
  v_vat_tu_dau_ra uuid;
  v_tong_chi_phi numeric(14,2) := 0;
  v_gia_von_dau_vao numeric(14,2);
  v_don_gia_dau_ra numeric(14,2);
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

      perform fn_capnhat_ton_kho(
        new.chi_nhanh_id, r.vat_tu_id, -r.so_luong_thuc_te,
        'san_xuat_xuat', new.id, 'phieu_san_xuat'
      );
    end loop;

    update phieu_san_xuat set tong_chi_phi_thuc_te = v_tong_chi_phi where id = new.id;

    select vat_tu_dau_ra_id into v_vat_tu_dau_ra
    from cong_thuc_san_xuat where id = new.cong_thuc_id;

    if coalesce(new.so_luong_thuc_te, 0) > 0 then
      v_don_gia_dau_ra := v_tong_chi_phi / new.so_luong_thuc_te;
    else
      v_don_gia_dau_ra := 0;
    end if;

    perform fn_nhap_kho_cap_nhat_gia_von(
      new.chi_nhanh_id, v_vat_tu_dau_ra, coalesce(new.so_luong_thuc_te, 0),
      v_don_gia_dau_ra, 'san_xuat_nhap', new.id, 'phieu_san_xuat'
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_san_xuat_hoan_thanh on phieu_san_xuat;
create trigger trg_phieu_san_xuat_hoan_thanh
after update on phieu_san_xuat
for each row execute function trg_fn_phieu_san_xuat_hoan_thanh();

create or replace function trg_fn_phieu_xuat_gui() returns trigger as $$
declare
  r record;
  v_loai text;
begin
  if new.trang_thai = 'da_gui' and old.trang_thai is distinct from 'da_gui' then
    v_loai := case when new.loai_xuat = 'huy_hang' then 'huy_hang' else 'dieu_chuyen_di' end;
    for r in
      select vat_tu_id, so_luong from chi_tiet_phieu_xuat where phieu_xuat_id = new.id
    loop
      perform fn_capnhat_ton_kho(
        new.kho_xuat_id, r.vat_tu_id, -r.so_luong,
        v_loai, new.id, 'phieu_xuat_kho'
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_xuat_gui on phieu_xuat_kho;
create trigger trg_phieu_xuat_gui
after update on phieu_xuat_kho
for each row execute function trg_fn_phieu_xuat_gui();

create or replace function trg_fn_phieu_xuat_nhan() returns trigger as $$
declare
  r record;
begin
  if new.trang_thai = 'da_nhan' and old.trang_thai is distinct from 'da_nhan'
     and new.loai_xuat = 'dieu_chuyen' and new.kho_nhan_id is not null then
    for r in
      select vat_tu_id, so_luong from chi_tiet_phieu_xuat where phieu_xuat_id = new.id
    loop
      perform fn_nhap_kho_cap_nhat_gia_von(
        new.kho_nhan_id, r.vat_tu_id, r.so_luong,
        coalesce((select gia_von_binh_quan from ton_kho
                   where chi_nhanh_id = new.kho_xuat_id and vat_tu_id = r.vat_tu_id), 0),
        'dieu_chuyen_den', new.id, 'phieu_xuat_kho'
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_xuat_nhan on phieu_xuat_kho;
create trigger trg_phieu_xuat_nhan
after update on phieu_xuat_kho
for each row execute function trg_fn_phieu_xuat_nhan();

create or replace function trg_fn_chi_tiet_hoa_don_chot_gia_von() returns trigger as $$
declare
  v_chi_nhanh_id uuid;
  v_gia numeric(14,2);
begin
  select chi_nhanh_id into v_chi_nhanh_id from hoa_don_ban where id = new.hoa_don_id;
  select gia_von_binh_quan into v_gia from ton_kho
    where chi_nhanh_id = v_chi_nhanh_id and vat_tu_id = new.vat_tu_id;
  new.gia_von_tai_ban := coalesce(v_gia, 0);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_chi_tiet_hoa_don_chot_gia_von on chi_tiet_hoa_don_ban;
create trigger trg_chi_tiet_hoa_don_chot_gia_von
before insert on chi_tiet_hoa_don_ban
for each row execute function trg_fn_chi_tiet_hoa_don_chot_gia_von();

create or replace function trg_fn_chi_tiet_hoa_don_insert() returns trigger as $$
declare
  v_chi_nhanh_id uuid;
  v_trang_thai text;
begin
  select chi_nhanh_id, trang_thai into v_chi_nhanh_id, v_trang_thai
  from hoa_don_ban where id = new.hoa_don_id;

  if v_trang_thai = 'hoan_thanh' then
    perform fn_capnhat_ton_kho(
      v_chi_nhanh_id, new.vat_tu_id, -new.so_luong,
      'ban_hang', new.hoa_don_id, 'hoa_don_ban'
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_chi_tiet_hoa_don_insert on chi_tiet_hoa_don_ban;
create trigger trg_chi_tiet_hoa_don_insert
after insert on chi_tiet_hoa_don_ban
for each row execute function trg_fn_chi_tiet_hoa_don_insert();

create or replace function trg_fn_hoa_don_tra_hang() returns trigger as $$
declare
  r record;
begin
  if new.trang_thai = 'tra_hang' and old.trang_thai is distinct from 'tra_hang' then
    for r in
      select vat_tu_id, so_luong from chi_tiet_hoa_don_ban where hoa_don_id = new.id
    loop
      perform fn_capnhat_ton_kho(
        new.chi_nhanh_id, r.vat_tu_id, r.so_luong,
        'dieu_chinh', new.id, 'hoa_don_ban'
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_hoa_don_tra_hang on hoa_don_ban;
create trigger trg_hoa_don_tra_hang
after update on hoa_don_ban
for each row execute function trg_fn_hoa_don_tra_hang();

create or replace function trg_fn_don_hang_b2b_giu_cho() returns trigger as $$
declare
  r record;
begin
  if new.trang_thai = 'da_xac_nhan' and old.trang_thai is distinct from 'da_xac_nhan' then
    for r in
      select vat_tu_id, so_luong from chi_tiet_don_hang_b2b where don_hang_id = new.id
    loop
      perform fn_giu_cho_kho(
        new.chi_nhanh_giao_id, r.vat_tu_id, r.so_luong,
        'giu_cho_don_hang', new.id
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_don_hang_b2b_giu_cho on don_hang_b2b;
create trigger trg_don_hang_b2b_giu_cho
after update on don_hang_b2b
for each row execute function trg_fn_don_hang_b2b_giu_cho();

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

      perform fn_capnhat_ton_kho(
        new.chi_nhanh_giao_id, r.vat_tu_id, -r.so_luong,
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

drop trigger if exists trg_don_hang_b2b_xuat_that on don_hang_b2b;
create trigger trg_don_hang_b2b_xuat_that
after update on don_hang_b2b
for each row execute function trg_fn_don_hang_b2b_xuat_that();

create or replace function trg_fn_don_hang_b2b_huy() returns trigger as $$
declare
  r record;
begin
  if new.trang_thai = 'da_huy' and old.trang_thai = 'da_xac_nhan' then
    for r in
      select vat_tu_id, so_luong from chi_tiet_don_hang_b2b where don_hang_id = new.id
    loop
      perform fn_giu_cho_kho(
        new.chi_nhanh_giao_id, r.vat_tu_id, -r.so_luong,
        'giai_phong_huy_don', new.id
      );
    end loop;
  elsif new.trang_thai = 'da_huy' and old.trang_thai = 'dang_giao' then
    for r in
      select vat_tu_id, so_luong from chi_tiet_don_hang_b2b where don_hang_id = new.id
    loop
      perform fn_capnhat_ton_kho(
        new.chi_nhanh_giao_id, r.vat_tu_id, r.so_luong,
        'dieu_chinh', new.id, 'don_hang_b2b'
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_don_hang_b2b_huy on don_hang_b2b;
create trigger trg_don_hang_b2b_huy
after update on don_hang_b2b
for each row execute function trg_fn_don_hang_b2b_huy();

create or replace function trg_fn_hoa_don_b2b_insert() returns trigger as $$
declare
  v_han_muc numeric(14,2);
  v_du_no numeric(14,2);
begin
  select han_muc_cong_no, du_no_hien_tai into v_han_muc, v_du_no
  from khach_hang_b2b where id = new.khach_hang_b2b_id;

  if v_han_muc > 0 and (v_du_no + new.tong_tien) > v_han_muc then
    raise exception 'Khách hàng vượt hạn mức công nợ: hiện % + hóa đơn mới % > hạn mức %',
      v_du_no, new.tong_tien, v_han_muc;
  end if;

  update khach_hang_b2b set du_no_hien_tai = du_no_hien_tai + new.tong_tien
  where id = new.khach_hang_b2b_id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_hoa_don_b2b_insert on hoa_don_b2b;
create trigger trg_hoa_don_b2b_insert
after insert on hoa_don_b2b
for each row execute function trg_fn_hoa_don_b2b_insert();

create or replace function trg_fn_phieu_thu_cong_no() returns trigger as $$
declare
  v_khach_hang_id uuid;
begin
  update hoa_don_b2b
    set da_thanh_toan = da_thanh_toan + new.so_tien
    where id = new.hoa_don_b2b_id
    returning khach_hang_b2b_id into v_khach_hang_id;

  update hoa_don_b2b
    set trang_thai_thanh_toan = case
      when da_thanh_toan >= tong_tien then 'da_thanh_toan'
      when da_thanh_toan > 0 then 'thanh_toan_mot_phan'
      else 'chua_thanh_toan'
    end
    where id = new.hoa_don_b2b_id;

  update khach_hang_b2b
    set du_no_hien_tai = du_no_hien_tai - new.so_tien
    where id = v_khach_hang_id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_phieu_thu_cong_no on phieu_thu_cong_no;
create trigger trg_phieu_thu_cong_no
after insert on phieu_thu_cong_no
for each row execute function trg_fn_phieu_thu_cong_no();
