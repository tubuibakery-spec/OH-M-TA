# OH! MÊ TA

Hệ thống quản lý chuỗi sản xuất & bán hàng — **Bếp Trung Tâm → cửa hàng**.

- **Database:** Supabase (PostgreSQL) — schema, RLS, trigger, hàm nghiệp vụ
- **Giao diện:** React + Vite + Bootstrap 5, chạy hoàn toàn tĩnh
- **Không có server backend.** Trình duyệt nói chuyện thẳng với Supabase.

> Dự án này **độc lập hoàn toàn** với hệ thống Order auto. Không dùng chung code,
> không dùng chung repo, không đồng bộ dữ liệu.

---

## Cài đặt — làm theo đúng thứ tự

### 1. Tạo project Supabase

Vào [supabase.com](https://supabase.com) → **New project**. Ghi lại:
- **Project URL** (dạng `https://xxxx.supabase.co`)
- **anon public key** — Project Settings → API
- **Database password** — đặt lúc tạo project, dùng cho bước 2

### 2. Chạy migration

Cách A — bằng Supabase CLI (khuyến nghị):

```bash
npx supabase link --project-ref <project-ref>
```

```bash
npx supabase db push
```

Cách B — thủ công: mở **SQL Editor** trên Dashboard, dán lần lượt 9 file trong
`supabase/migrations/` theo đúng thứ tự tên file, chạy từng file một.

### 3. Kiểm chứng

Dán 2 file này vào SQL Editor rồi Run. Cả hai đều `rollback` ở cuối nên không để lại dữ liệu:

- `supabase/tests/kiem_tra_rls.sql` — chứng minh dữ liệu không rò giữa các chi nhánh
- `supabase/tests/kiem_tra_nghiep_vu.sql` — FEFO, tổng tiền, công nợ, kiểm kê, đơn đặt NCC

Nếu có dòng nào `raise exception` thì **dừng lại**, đừng đưa vào dùng thật.

### 4. Tạo tài khoản đầu tiên

Dashboard → **Authentication → Users → Add user** (email + mật khẩu, tick *Auto Confirm*).

Rồi chạy trong SQL Editor, thay email của bạn:

```sql
insert into nguoi_dung_he_thong (email, auth_user_id)
select u.email, u.id from auth.users u where u.email = 'admin@ohmeta.vn'
on conflict (email) do update set auth_user_id = excluded.auth_user_id;

insert into nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id, chi_nhanh_id)
select nd.id, vt.id, null          -- null = phạm vi TOÀN HỆ THỐNG
from nguoi_dung_he_thong nd, vai_tro_he_thong vt
where nd.email = 'admin@ohmeta.vn' and vt.ma_vai_tro = 'admin'
on conflict do nothing;
```

### 5. Nhập dữ liệu nền

Tối thiểu cần có trước khi dùng được: **chi nhánh**, **đơn vị tính**, **vật tư**,
**nhà cung cấp**. Tạo chi nhánh và đơn vị tính bằng SQL, phần còn lại làm trên giao diện:

```sql
insert into chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, loai_chi_nhanh) values
  ('BTC',  'Bếp Trung Tâm', 'bep_trung_tam'),
  ('CH01', 'Cửa hàng 1',    'cua_hang');

insert into don_vi_tinh (ma_dvt, ten_dvt) values
  ('KG', 'Kilogram'), ('L', 'Lít'), ('CAI', 'Cái'), ('HOP', 'Hộp');
```

### 6. Chạy giao diện

```bash
npm install
```

Sao chép `.env.example` thành `.env`, điền URL + anon key từ bước 1, rồi:

```bash
npm run dev
```

Mở http://localhost:5173 và đăng nhập bằng tài khoản ở bước 4.

---

## Đưa lên GitHub + deploy

### Tạo repo và đẩy code

```bash
git remote add origin https://github.com/<tài-khoản>/oh-me-ta.git
```

```bash
git push -u origin main
```

### Deploy qua Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → chọn repo vừa tạo
2. Vercel tự nhận Vite qua `vercel.json`, không cần chỉnh gì
3. **Environment Variables** → thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`
4. Deploy. Mỗi lần `git push` sau đó là tự deploy lại.

Sau khi có domain, quay lại Supabase → **Authentication → URL Configuration** →
thêm domain đó vào *Site URL* và *Redirect URLs*.

### Migration tự động (tùy chọn)

`.github/workflows/migrations.yml` sẽ chạy `supabase db push` khi có thay đổi trong
`supabase/migrations/` trên nhánh `main`. Cần khai 3 secret trong
**Settings → Secrets and variables → Actions**:

| Secret | Lấy ở đâu |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account Settings → Access Tokens |
| `SUPABASE_PROJECT_REF` | phần `xxxx` trong `xxxx.supabase.co` |
| `SUPABASE_DB_PASSWORD` | mật khẩu database đặt ở bước 1 |

---

## ⚠️ Bảo mật — đọc trước khi đưa vào dùng thật

**Anon key nằm công khai trong bundle trình duyệt.** Đó là thiết kế đúng của Supabase,
nhưng nó có nghĩa là:

1. **RLS là lớp bảo vệ duy nhất.** Không có backend đứng giữa để lọc `branch_id` nữa.
   Mọi câu query đi thẳng từ trình duyệt vào Postgres và chỉ có policy chặn.
2. **Tuyệt đối không đặt `service_role` key vào `.env` hay bất kỳ đâu trong `src/`.**
   Key đó bỏ qua toàn bộ RLS.
3. **Chạy lại `kiem_tra_rls.sql` trước mỗi lần deploy**, không phải chỉ lần đầu.

Phân quyền phía giao diện (ẩn/hiện menu, nút) chỉ để cho gọn mắt — nó **không phải**
bảo mật. Ai cũng có thể mở DevTools và gọi thẳng API; thứ chặn họ lại là RLS.

Chi tiết mô hình phân quyền, 4 khuôn policy, và các giới hạn đã biết: [supabase/README.md](supabase/README.md).

---

## Cấu trúc

```
├── src/
│   ├── components/     Layout, các thành phần dùng chung (Bảng, Modal, …)
│   ├── context/        AppContext — phiên đăng nhập, vai trò, quyền, chi nhánh
│   ├── lib/            supabase client, hàm định dạng
│   └── pages/          9 màn hình
├── supabase/
│   ├── migrations/     9 migration, chạy theo thứ tự tên file
│   ├── tests/          2 script kiểm chứng
│   └── README.md       tài liệu database + RLS
└── .github/workflows/  CI đẩy migration
```

## Màn hình hiện có

| Màn hình | Việc làm được |
|---|---|
| Tổng quan | Giá trị tồn, cảnh báo HSD, dưới tồn tối thiểu, hàng đang về |
| Tồn kho | Tồn theo vật tư, mở rộng xem chi tiết từng lô + HSD |
| Nhập hàng | Tạo phiếu, duyệt (duyệt mới cộng kho), tự tạo lô khi có HSD |
| Xuất / Điều chuyển | Điều chuyển, hủy hàng có lý do, trả NCC. Xuất theo FEFO |
| Kiểm kê | Chốt số hệ thống, nhập số đếm, duyệt để áp chênh lệch |
| Đề xuất đặt hàng | Tính thiếu từ dự báo, quy đổi đơn vị mua, tạo đơn NCC |
| Đơn đặt NCC | Theo dõi đã nhận / còn thiếu |
| Vật tư · Nhà cung cấp | Danh mục |

**Chưa có:** POS bán lẻ, sản xuất (lệnh sản xuất), B2B, công nợ, QA/QC, logistics,
tài sản, báo cáo BI. Database đã hỗ trợ đầy đủ những phần này — chỉ thiếu giao diện.
