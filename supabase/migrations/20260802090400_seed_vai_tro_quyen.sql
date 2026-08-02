-- ============================================================
-- 05. SEED VAI TRÒ & QUYỀN
-- Các policy ở migration 04 tra cứu theo (module, hanh_dong) nên
-- bộ dữ liệu này là BẮT BUỘC — thiếu nó thì không ai đọc được gì.
-- Idempotent: chạy lại nhiều lần không nhân bản.
-- ============================================================

-- ------------------------------------------------------------
-- 5.1 QUYỀN = tích Descartes (module × hành động)
-- ------------------------------------------------------------

insert into quyen_he_thong (module, hanh_dong)
select m.module, h.hanh_dong
from (values
  ('danh_muc'),   -- đơn vị tính, vật tư, NCC
  ('cong_thuc'),  -- BOM
  ('mua_hang'),   -- phiếu nhập
  ('san_xuat'),   -- lệnh sản xuất
  ('kho'),        -- tồn kho, thẻ kho, phiếu xuất/điều chuyển
  ('ban_le'),     -- hóa đơn bán lẻ, khách lẻ
  ('b2b'),        -- khách doanh nghiệp, bảng giá, đơn hàng B2B
  ('cong_no'),    -- hóa đơn B2B, phiếu thu, phiếu chi NCC
  ('qa_qc'),      -- lô hàng, kiểm tra chất lượng, nhật ký nhiệt độ
  ('logistics'),  -- phương tiện, chuyến giao hàng
  ('tai_san'),    -- tài sản, bảo trì
  ('phap_ly'),    -- giấy phép, hợp đồng
  ('tai_chinh'),  -- chi phí, loại chi phí
  ('nhan_su'),    -- nhân viên
  ('he_thong')    -- người dùng, vai trò, nhật ký
) m(module)
cross join (values ('xem'),('tao'),('sua'),('xoa'),('duyet')) h(hanh_dong)
on conflict (module, hanh_dong) do nothing;

-- ------------------------------------------------------------
-- 5.2 VAI TRÒ
-- ------------------------------------------------------------

insert into vai_tro_he_thong (ma_vai_tro, ten_vai_tro, mo_ta) values
  ('admin',             'Quản trị hệ thống',   'Toàn quyền. Gán ở phạm vi toàn hệ thống (chi_nhanh_id = NULL).'),
  ('giam_doc',          'Ban giám đốc',        'Xem toàn bộ chuỗi, duyệt. Gán phạm vi toàn hệ thống.'),
  ('quan_ly_chi_nhanh', 'Quản lý chi nhánh',   'Toàn quyền vận hành TRONG chi nhánh được gán.'),
  ('ke_toan',           'Kế toán',             'Công nợ, chi phí, giá vốn toàn hệ thống.'),
  ('thu_kho',           'Thủ kho',             'Nhập/xuất/điều chuyển tại chi nhánh được gán.'),
  ('bep',               'Bếp / sản xuất',      'Lệnh sản xuất, công thức (chỉ xem), tại chi nhánh được gán.'),
  ('thu_ngan',          'Thu ngân',            'Bán lẻ tại chi nhánh được gán.'),
  ('sale_b2b',          'Nhân viên sale B2B',  'Chỉ khách hàng mình phụ trách.'),
  ('qa_qc',             'QA/QC',               'Kiểm tra chất lượng, nhiệt độ, lô hàng.'),
  ('tai_xe',            'Tài xế',              'Chỉ chuyến giao hàng được phân công.')
on conflict (ma_vai_tro) do nothing;

-- ------------------------------------------------------------
-- 5.3 GÁN QUYỀN CHO VAI TRÒ
-- ------------------------------------------------------------

-- Hàm phụ trợ ngắn gọn: gán 1 module với danh sách hành động.
create or replace function bao_mat.gan_quyen(p_vai_tro text, p_module text, p_hanh_dong text[])
returns void language sql as $$
  insert into vai_tro_quyen (vai_tro_id, quyen_id)
  select vt.id, q.id
  from vai_tro_he_thong vt, quyen_he_thong q
  where vt.ma_vai_tro = p_vai_tro
    and q.module = p_module
    and q.hanh_dong = any (p_hanh_dong)
  on conflict do nothing;
$$;

-- admin & giám đốc: mọi module
do $$
declare m text;
begin
  foreach m in array array['danh_muc','cong_thuc','mua_hang','san_xuat','kho','ban_le',
                           'b2b','cong_no','qa_qc','logistics','tai_san','phap_ly',
                           'tai_chinh','nhan_su','he_thong']
  loop
    perform bao_mat.gan_quyen('admin', m, array['xem','tao','sua','xoa','duyet']);
    perform bao_mat.gan_quyen('giam_doc', m, array['xem','duyet']);
  end loop;
end $$;

-- Quản lý chi nhánh — toàn quyền vận hành, nhưng KHÔNG có 'he_thong'
-- (không tự gán vai trò cho mình / cho chi nhánh khác).
do $$
declare m text;
begin
  foreach m in array array['cong_thuc','mua_hang','san_xuat','kho','ban_le',
                           'qa_qc','logistics','tai_san','tai_chinh','nhan_su']
  loop
    perform bao_mat.gan_quyen('quan_ly_chi_nhanh', m, array['xem','tao','sua','xoa','duyet']);
  end loop;
  perform bao_mat.gan_quyen('quan_ly_chi_nhanh', 'danh_muc', array['xem']);
  perform bao_mat.gan_quyen('quan_ly_chi_nhanh', 'b2b',      array['xem','tao','sua']);
  perform bao_mat.gan_quyen('quan_ly_chi_nhanh', 'cong_no',  array['xem']);
  perform bao_mat.gan_quyen('quan_ly_chi_nhanh', 'phap_ly',  array['xem']);
end $$;

-- Kế toán
select bao_mat.gan_quyen('ke_toan', 'cong_no',   array['xem','tao','sua','duyet']);
select bao_mat.gan_quyen('ke_toan', 'tai_chinh', array['xem','tao','sua','duyet']);
select bao_mat.gan_quyen('ke_toan', 'mua_hang',  array['xem']);
select bao_mat.gan_quyen('ke_toan', 'ban_le',    array['xem']);
select bao_mat.gan_quyen('ke_toan', 'b2b',       array['xem']);
select bao_mat.gan_quyen('ke_toan', 'kho',       array['xem']);
select bao_mat.gan_quyen('ke_toan', 'danh_muc',  array['xem']);
select bao_mat.gan_quyen('ke_toan', 'tai_san',   array['xem']);
select bao_mat.gan_quyen('ke_toan', 'phap_ly',   array['xem']);

-- Thủ kho
select bao_mat.gan_quyen('thu_kho', 'kho',       array['xem','tao','sua','duyet']);
select bao_mat.gan_quyen('thu_kho', 'mua_hang',  array['xem','tao','sua']);
select bao_mat.gan_quyen('thu_kho', 'danh_muc',  array['xem']);
select bao_mat.gan_quyen('thu_kho', 'qa_qc',     array['xem','tao']);
select bao_mat.gan_quyen('thu_kho', 'logistics', array['xem']);

-- Bếp / sản xuất
select bao_mat.gan_quyen('bep', 'san_xuat',  array['xem','tao','sua']);
select bao_mat.gan_quyen('bep', 'cong_thuc', array['xem']);
select bao_mat.gan_quyen('bep', 'kho',       array['xem']);
select bao_mat.gan_quyen('bep', 'danh_muc',  array['xem']);
select bao_mat.gan_quyen('bep', 'qa_qc',     array['xem','tao']);

-- Thu ngân
select bao_mat.gan_quyen('thu_ngan', 'ban_le',   array['xem','tao','sua']);
select bao_mat.gan_quyen('thu_ngan', 'danh_muc', array['xem']);
select bao_mat.gan_quyen('thu_ngan', 'kho',      array['xem']);

-- Sale B2B (không có quyền toàn cục => chỉ thấy khách mình phụ trách)
select bao_mat.gan_quyen('sale_b2b', 'b2b',      array['xem','tao','sua']);
select bao_mat.gan_quyen('sale_b2b', 'cong_no',  array['xem','tao']);
select bao_mat.gan_quyen('sale_b2b', 'danh_muc', array['xem']);
select bao_mat.gan_quyen('sale_b2b', 'kho',      array['xem']);

-- QA/QC
select bao_mat.gan_quyen('qa_qc', 'qa_qc',    array['xem','tao','sua','duyet']);
select bao_mat.gan_quyen('qa_qc', 'danh_muc', array['xem']);
select bao_mat.gan_quyen('qa_qc', 'kho',      array['xem']);
select bao_mat.gan_quyen('qa_qc', 'san_xuat', array['xem']);

-- Tài xế
select bao_mat.gan_quyen('tai_xe', 'logistics', array['xem','sua']);
select bao_mat.gan_quyen('tai_xe', 'danh_muc',  array['xem']);

-- ------------------------------------------------------------
-- 5.4 TẠO NGƯỜI DÙNG ĐẦU TIÊN
-- Chạy TAY sau khi đã tạo tài khoản trong Supabase Auth (Dashboard →
-- Authentication → Add user). Thay email bên dưới rồi chạy trong SQL Editor.
-- ------------------------------------------------------------
--
-- insert into nguoi_dung_he_thong (email, auth_user_id)
-- select u.email, u.id from auth.users u where u.email = 'admin@nhahangmui.vn'
-- on conflict (email) do update set auth_user_id = excluded.auth_user_id;
--
-- insert into nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id, chi_nhanh_id)
-- select nd.id, vt.id, null            -- null = phạm vi TOÀN HỆ THỐNG
-- from nguoi_dung_he_thong nd, vai_tro_he_thong vt
-- where nd.email = 'admin@nhahangmui.vn' and vt.ma_vai_tro = 'admin'
-- on conflict do nothing;
--
-- Gán quản lý cho MỘT chi nhánh:
-- insert into nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id, chi_nhanh_id)
-- select nd.id, vt.id, cn.id
-- from nguoi_dung_he_thong nd, vai_tro_he_thong vt, chi_nhanh cn
-- where nd.email = 'quanly.mythai@nhahangmui.vn'
--   and vt.ma_vai_tro = 'quan_ly_chi_nhanh'
--   and cn.ma_chi_nhanh = 'MYTHAI'
-- on conflict do nothing;
