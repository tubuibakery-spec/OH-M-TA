-- ============================================================
-- Nhóm D — Đợt 22: Hao hụt theo dòng NVL trong công thức (BOM)
--
-- Khác với cong_thuc_san_xuat.ty_le_hao_hut_phan_tram (hao hụt CẢ
-- MẺ) — đây là hao hụt riêng cho TỪNG DÒNG nguyên liệu trong công
-- thức, đặt tên khác để tránh nhầm lẫn 2 khái niệm.
-- ============================================================

alter table chi_tiet_cong_thuc add column if not exists ty_le_hao_hut_dong_pct numeric(5,2) not null default 0
  check (ty_le_hao_hut_dong_pct >= 0);
