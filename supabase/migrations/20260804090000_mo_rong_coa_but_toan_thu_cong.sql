-- ============================================================
-- Mở rộng hệ thống tài khoản (he_thong_tai_khoan) từ 11 lên 36
-- tài khoản — tập con SME phổ biến theo TT200, đủ dùng cho các
-- module kế toán sắp tới (Kho/Giá thành, TSCĐ, CCDC, Lương, Thuế,
-- Báo cáo tài chính chi tiết).
--
-- Không cần sửa RLS/view/trigger nào — đã xác nhận 4 view báo cáo
-- (so_cai, bang_can_doi_thu_nghiem, bao_cao_lai_lo, bang_can_doi_ke_toan)
-- và KeToan.jsx chỉ dùng cột `loai` (không hard-code so_hieu), nên
-- tài khoản mới tự động được các view/trang phản ánh.
--
-- LƯU Ý 2 tài khoản "ngược chiều" (contra-account) — ben_no_la_tang
-- KHÔNG theo pattern chung của nhóm cha:
--   214 (Hao mòn TSCĐ)            loai=tai_san   nhưng tăng bên CÓ
--   521 (Giảm trừ doanh thu)      loai=doanh_thu nhưng tăng bên NỢ
-- ============================================================

insert into he_thong_tai_khoan (so_hieu, ten_tai_khoan, loai, ben_no_la_tang) values
  ('133',  'Thuế GTGT được khấu trừ',               'tai_san',     true),
  ('138',  'Phải thu khác',                          'tai_san',     true),
  ('141',  'Tạm ứng',                                'tai_san',     true),
  ('152',  'Nguyên liệu, vật liệu',                  'tai_san',     true),
  ('153',  'Công cụ, dụng cụ',                       'tai_san',     true),
  ('154',  'Chi phí sản xuất, kinh doanh dở dang',   'tai_san',     true),
  ('155',  'Thành phẩm',                             'tai_san',     true),
  ('211',  'Tài sản cố định hữu hình',                'tai_san',     true),
  ('214',  'Hao mòn tài sản cố định',                 'tai_san',     false),
  ('242',  'Chi phí trả trước',                       'tai_san',     true),
  ('334',  'Phải trả người lao động',                 'no_phai_tra', false),
  ('335',  'Chi phí phải trả',                        'no_phai_tra', false),
  ('338',  'Phải trả, phải nộp khác',                 'no_phai_tra', false),
  ('3334', 'Thuế thu nhập doanh nghiệp',              'no_phai_tra', false),
  ('3335', 'Thuế thu nhập cá nhân',                   'no_phai_tra', false),
  ('515',  'Doanh thu hoạt động tài chính',           'doanh_thu',   false),
  ('521',  'Các khoản giảm trừ doanh thu',            'doanh_thu',   true),
  ('711',  'Thu nhập khác',                           'doanh_thu',   false),
  ('621',  'Chi phí nguyên liệu, vật liệu trực tiếp', 'chi_phi',     true),
  ('622',  'Chi phí nhân công trực tiếp',             'chi_phi',     true),
  ('627',  'Chi phí sản xuất chung',                  'chi_phi',     true),
  ('635',  'Chi phí tài chính',                       'chi_phi',     true),
  ('641',  'Chi phí bán hàng',                        'chi_phi',     true),
  ('811',  'Chi phí khác',                            'chi_phi',     true),
  ('821',  'Chi phí thuế thu nhập doanh nghiệp',       'chi_phi',     true)
on conflict (so_hieu) do nothing;
