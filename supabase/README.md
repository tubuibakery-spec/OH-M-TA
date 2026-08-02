# Migration Supabase — hệ thống quản lý sản xuất & bán hàng chuỗi

Sinh từ `schema_full_1.sql`, tách thành 5 migration chạy theo thứ tự tên file.

| File | Nội dung |
|------|----------|
| `20260802090000_schema_co_so.sql` | Bảng + index (mục A–N của file gốc) |
| `20260802090100_ham_va_trigger.sql` | Hàm kho + trigger (mục O–P) |
| `20260802090200_view_bao_cao.sql` | View báo cáo (mục Q) — **đã bật `security_invoker`** |
| `20260802090300_rls_phan_quyen.sql` | RLS: cô lập dữ liệu giữa các chi nhánh |
| `20260802090400_seed_vai_tro_quyen.sql` | Seed `quyen_he_thong`, `vai_tro_he_thong`, `vai_tro_quyen` |
| `20260802090500_tier1_toan_ven.sql` | **Tier 1** — lô hàng/FEFO, tổng tiền, công nợ hai chiều, audit |
| `20260802090600_tier2_nghiep_vu.sql` | **Tier 2** — đơn đặt NCC, dự báo, kiểm kê, ca bán hàng, VAT |
| `20260802090700_tier3_hoan_thien.sql` | **Tier 3** — `updated_at`, sinh số chứng từ, hao hụt, chống vòng lặp BOM, storage |
| `20260802090800_rls_bang_moi.sql` | RLS + quyền cho toàn bộ bảng mới |

Tests (chạy trong transaction rồi `rollback`, không để lại dữ liệu):
- `tests/kiem_tra_rls.sql` — cô lập chi nhánh, chống leo thang đặc quyền
- `tests/kiem_tra_nghiep_vu.sql` — FEFO, tổng tiền, công nợ, kiểm kê, đơn đặt NCC, vòng lặp BOM

## Chạy

```bash
supabase init
supabase link --project-ref <project-ref>
supabase db push
```

Hoặc dán lần lượt 5 file vào **SQL Editor** theo đúng thứ tự.

Sau đó tạo tài khoản admin (xem phần 5.4 trong file seed), rồi chạy `tests/kiem_tra_rls.sql`
để xác nhận không rò dữ liệu.

## Mô hình phân quyền

Ba yếu tố quyết định một dòng dữ liệu có hiện ra hay không:

```
auth.uid()  →  nguoi_dung_he_thong.auth_user_id  →  nguoi_dung_vai_tro
                                                          │
                                    ┌─────────────────────┴──────────────────┐
                                    │ chi_nhanh_id = NULL → toàn hệ thống    │
                                    │ chi_nhanh_id = X    → CHỈ chi nhánh X  │
                                    └────────────────────────────────────────┘
                                                          │
                                    vai_tro_quyen → quyen_he_thong (module, hanh_dong)
```

Mọi policy đều là **quyền AND chi nhánh**. Quản lý Mỹ Thái có `kho.xem` vẫn không đọc
được tồn kho PTB, vì vai trò của họ gắn `chi_nhanh_id = Mỹ Thái`.

Hàm lõi: `bao_mat.cn_duoc_phep(module, hanh_dong)` trả về mảng chi nhánh được phép.
Policy dùng dạng `chi_nhanh_id in (select unnest(bao_mat.cn_duoc_phep(...)))` — subquery
không tương quan nên PostgreSQL đánh giá **một lần cho cả câu truy vấn**, không phải mỗi dòng.

Hàm bảo mật đặt trong schema `bao_mat` (không phải `public`) để PostgREST không phơi ra thành RPC.

### 15 module

`danh_muc` · `cong_thuc` · `mua_hang` · `san_xuat` · `kho` · `ban_le` · `b2b` · `cong_no` ·
`qa_qc` · `logistics` · `tai_san` · `phap_ly` · `tai_chinh` · `nhan_su` · `he_thong`

### 4 khuôn policy

| Khuôn | Áp dụng cho | Đọc | Ghi |
|-------|-------------|-----|-----|
| `gen_policy_danh_muc` | Danh mục dùng chung (vật tư, NCC, công thức, bảng giá…) | Có quyền `xem` ở bất kỳ phạm vi nào | **Chỉ vai trò toàn hệ thống** |
| `gen_policy_chung` | Bảng nghiệp vụ không gắn chi nhánh (lô hàng, khách lẻ, phiếu chi NCC) | Quyền ở bất kỳ phạm vi | Quyền ở bất kỳ phạm vi |
| `gen_policy_chi_nhanh` | Phiếu nhập, lệnh SX, hóa đơn bán, chi phí, tài sản… | Đúng chi nhánh | Đúng chi nhánh (`USING` **và** `WITH CHECK` — không "đẩy" dòng sang chi nhánh khác được) |
| `gen_policy_con` | Bảng chi tiết | Theo chi nhánh của chứng từ cha | Theo chi nhánh của chứng từ cha |

Các bảng có luật riêng, viết tay: `ton_kho`, `the_kho`, `lich_su_giu_cho`, `phieu_xuat_kho`,
`chuyen_giao_hang`, `khach_hang_b2b`, `don_hang_b2b`, `hoa_don_b2b`, `phieu_thu_cong_no`,
`chi_nhanh`, `nhan_vien`, và toàn bộ nhóm phân quyền.

## Bốn quyết định bảo mật quan trọng

**1. View bắt buộc `security_invoker = on`.**
Mặc định view chạy bằng quyền chủ sở hữu (`postgres`) nên **bỏ qua RLS hoàn toàn**. Nếu để
mặc định, một nhân viên chi nhánh select vào `bao_cao_xuat_nhap_ton` sẽ thấy số liệu toàn
chuỗi. Cả 15 view đều đã bật cờ này (cần PostgreSQL 15+, Supabase hiện dùng PG15/17).

**2. `ton_kho` / `the_kho` / `lich_su_giu_cho` chỉ đọc.**
Không có policy INSERT/UPDATE/DELETE. Mọi thay đổi đi qua `fn_capnhat_ton_kho`,
`fn_nhap_kho_cap_nhat_gia_von`, `fn_giu_cho_kho` — đã chuyển sang `SECURITY DEFINER` và
**thu hồi quyền gọi trực tiếp** của `anon`/`authenticated`. Hệ quả: không ai sửa được tồn
kho mà không có chứng từ, và trigger vẫn chạy được dù người bấm nút không có quyền ghi kho.

**3. Ghi bảng phân quyền đòi phạm vi toàn hệ thống.**
Nếu cho quản lý chi nhánh ghi `nguoi_dung_vai_tro`, họ tự gán cho mình vai trò ở chi nhánh
khác trong một câu INSERT. Test `kiem_tra_rls.sql` có case kiểm tra đúng lỗ này.

**4. Không dùng `force row level security`.**
Các hàm `SECURITY DEFINER` thuộc sở hữu `postgres` cần bỏ qua RLS, nếu không policy trên
`nguoi_dung_vai_tro` sẽ gọi hàm đọc chính `nguoi_dung_vai_tro` → đệ quy vô hạn.

## Sai lệch so với `schema_full_1.sql`

Ba thay đổi có chủ đích, đều nằm trong migration 04 và có comment tại chỗ:

1. **`nguoi_dung_vai_tro` đổi khóa chính.** PK cũ `(nguoi_dung_id, vai_tro_id)` khiến một
   người **không thể** giữ cùng một vai trò ở hai chi nhánh — quản lý kiêm nhiệm Mỹ Thái +
   PTB là bất khả thi. Đã chuyển sang `id` riêng + unique index có tính `chi_nhanh_id`.
2. **Thêm `nguoi_dung_he_thong.auth_user_id`** trỏ tới `auth.users(id)`. Không có cột này
   thì không cách nào nối phiên đăng nhập Supabase với người dùng nghiệp vụ.
3. **Hai `coalesce` phòng thủ trong migration 02:** `fn_nhap_kho_cap_nhat_gia_von` nhận
   `p_don_gia` null (từ `trg_fn_phieu_xuat_nhan` khi kho xuất chưa có dòng `ton_kho`) sẽ
   tính ra giá vốn null và làm hỏng giá bình quân của kho nhận. Đã `coalesce(..., 0)` ở cả
   hai đầu.

## Mô hình vận hành đã chốt: BTC → cửa hàng

Thành phẩm phải **tồn tại trong kho trước khi bán** — do Bếp Trung Tâm sản xuất rồi điều
chuyển, hoặc cửa hàng nhập mua. Không có backflush (bán món tự trừ nguyên liệu).

Hệ quả được cài đặt trong migration 06:
- `vat_tu.duoc_ban` — chỉ vật tư bật cờ này mới lên được hóa đơn. Nguyên vật liệu bị chặn cứng.
- Bán khi hết tồn → giao dịch bị từ chối với thông báo nêu rõ tên hàng, chi nhánh, số còn lại.
- `chi_nhanh.cho_phep_ton_am` — van an toàn, bật tạm khi kho lệch số để không kẹt bán hàng.

## Tier 1 — những gì đã vá

| Lỗi | Cách xử lý |
|---|---|
| `lo_hang` là bảng chết | Thêm `ton_kho_lo` + `the_kho.lo_hang_id`. Lô **tự tạo** khi duyệt phiếu nhập (có HSD) và khi sản xuất. Xuất kho mặc định **FEFO** qua `fn_xuat_fefo` |
| `tong_tien` do app tự set | Trigger cộng dồn từ dòng chi tiết cho phiếu nhập, hóa đơn bán, đơn B2B, đơn đặt NCC. Hạn mức công nợ giờ kiểm trên số thật |
| Công nợ trôi một chiều | `fn_tinh_lai_du_no` **tính lại từ đầu**, gọi bởi trigger I/U/D trên `hoa_don_b2b` và `phieu_thu_cong_no`. Thêm `hoa_don_b2b.trang_thai` để hủy hóa đơn |
| Hủy hóa đơn bán không hoàn kho | Bản gốc chỉ xử lý `tra_hang`; nay `da_huy` cũng hoàn |
| `nhat_ky_he_thong` rỗng | Trigger generic gắn lên 17 bảng nhạy cảm, ghi `du_lieu_truoc`/`du_lieu_sau` dạng jsonb |

Kèm 2 view mới: `canh_bao_han_su_dung` (phân mức đã hết hạn / khẩn cấp / sắp hết) và `truy_vet_lo`.

## Tier 2 — nghiệp vụ mới

- **`don_dat_hang_ncc`** + chi tiết, nối với phiếu nhập. Nhận hàng tự cộng `so_luong_da_nhan`
  và chuyển trạng thái đơn. View `hang_dang_ve`.
- **`gia_nha_cung_cap`** — đơn vị mua, `he_so_quy_doi`, MOQ dòng, `buoc_dat`, NCC chính.
  `nha_cung_cap` thêm lead time và MOQ theo giá trị đơn.
- **`du_bao_ban`** + **`doanh_so_thuc_te`** + view `so_sanh_du_bao_thuc_te`.
- **`phieu_kiem_ke`** — `fn_nap_kiem_ke` chốt số hệ thống theo từng lô, duyệt phiếu mới áp
  chênh lệch vào kho. View `chenh_lech_kiem_ke`.
- **`ly_do_huy`** (6 nhóm, đã seed) + view `phan_tich_hao_hut` theo tháng/nguyên nhân.
- **`ca_ban_hang`** — đóng ca tự tính tiền mặt hệ thống, `chenh_lech` so với đếm thực tế.
- **VAT** trên hóa đơn bán lẻ và B2B.
- **`rpc_de_xuat_dat_hang(chi_nhánh, từ_ngày, đến_ngày)`** — engine đề xuất đơn:
  `thiếu = nhu cầu − (tồn − giữ chỗ − tồn tối thiểu) − hàng đang về`, rồi quy đổi sang đơn vị
  mua, làm tròn lên theo `buoc_dat`, kẹp sàn MOQ. Bếp Trung Tâm thì nổ BOM ra nguyên vật liệu;
  cửa hàng thì đề xuất thẳng thành phẩm. SECURITY INVOKER nên RLS tự lọc theo chi nhánh.
- **`rpc_no_bom(vật_tư, số_lượng)`** — nổ công thức đệ quy 5 cấp, có áp tỉ lệ hao hụt.

## Tier 3 — hoàn thiện

- `updated_at` + trigger cho **mọi bảng** (trước đây không bảng nào có).
- `fn_sinh_so_phieu` + `bo_dem_chung_tu`: số chứng từ dạng `PN-2608-0001` sinh trong DB,
  hết race condition. Gắn cho 11 loại chứng từ.
- Unique còn thiếu: nguyên liệu trùng dòng trong công thức, bậc giá B2B trùng, tiêu chí QC
  trùng, và **chỉ một công thức `dang_ap_dung` mỗi vật tư**.
- `ty_le_hao_hut_phan_tram` và `so_me` giờ được dùng thật: tạo phiếu sản xuất là tự nạp định
  mức nguyên liệu = công thức × số mẻ × (1 + hao hụt).
- Trigger chống vòng lặp công thức (A→B→A).
- Tự tạo index cho mọi khóa ngoại chưa có index.
- Trả hàng NCC: `loai_xuat = 'tra_ncc'`, `chi_tiet_phieu_xuat.don_gia`, và
  `cong_no_phai_tra_theo_ncc` trừ giá trị hàng đã trả.
- Storage bucket `chung-tu` với policy theo đường dẫn `<chi_nhanh_id>/<loại>/<file>`.
- Realtime cho `ton_kho`, `don_hang_b2b`, `phieu_xuat_kho`, `ca_ban_hang` (vẫn tôn trọng RLS).
- pg_cron: đánh dấu công nợ quá hạn + tổng hợp doanh số hằng ngày (bỏ qua êm nếu chưa bật
  extension).

## Giới hạn — cần xử lý ở tầng ứng dụng

- **`service_role` bỏ qua toàn bộ RLS.** Nếu backend Flask kết nối bằng service key thì mọi
  policy ở đây vô hiệu; việc lọc theo chi nhánh vẫn phải làm trong code như hiện tại. RLS
  chỉ thực sự bảo vệ khi client dùng anon key + JWT của người dùng.
- **RLS là hàng, không phải cột.** `vat_tu.gia_von_gan_nhat` hiện ai đọc được bảng cũng thấy.
  Giá NCC đã tách sang module `mua_hang` nên thu ngân không thấy, nhưng giá vốn trên `vat_tu`
  thì vẫn chung. Muốn giấu hẳn thì tách view riêng hoặc dùng `revoke ... (cot)`.
- **`hanh_dong = 'duyet'` chưa được policy dùng.** RLS không phân biệt "sửa ghi chú" với
  "đổi trạng thái sang `da_duyet`". Muốn chặt hơn thì thêm trigger `BEFORE UPDATE` kiểm tra
  `bao_mat.co_quyen_cn('mua_hang','duyet', new.chi_nhanh_id)` khi `trang_thai` đổi.
- **Tồn tổng và tồn theo lô có thể lệch nhau.** Chỉ giao dịch có gắn lô mới chạm `ton_kho_lo`;
  hoàn kho khi hủy hóa đơn và các điều chỉnh không lô chỉ chạm `ton_kho`. `fn_nap_kiem_ke`
  chốt luôn phần chênh này thành một dòng "không lô" để kiểm kê xử lý.
- **`rpc_de_xuat_dat_hang` chỉ đề xuất, không tự tạo đơn.** Tạo `don_dat_hang_ncc` vẫn là
  thao tác có người bấm nút — cố ý, để không tự đặt hàng ngoài ý muốn.
- **`khach_hang` (khách lẻ) dùng chung toàn chuỗi** — cố ý, vì khách tích điểm mua ở nhiều
  chi nhánh. Nếu muốn tách thì phải thêm `chi_nhanh_id` vào bảng.
- **Bảng chi tiết bị xóa cùng cha qua `on delete cascade`** — cascade không kiểm tra RLS của
  bảng con. Đây là hành vi chuẩn của PostgreSQL và không tạo lỗ hổng vì muốn xóa cha đã phải
  qua policy `_xoa` của cha.
