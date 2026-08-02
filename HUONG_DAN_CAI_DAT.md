# OH! MÊ TA — Hướng dẫn cài đặt từng bước

Làm đúng thứ tự 1 → 2 → 3 → 4. Mỗi bước có phần **"Biết là xong khi…"** để tự kiểm.

Tổng thời gian: khoảng 30–45 phút.

---

# BƯỚC 1 — Tạo project Supabase

## 1.1 Đăng ký / đăng nhập

Vào **https://supabase.com** → **Start your project** → đăng nhập bằng GitHub hoặc email.

## 1.2 Tạo project

Bấm **New project**, điền:

| Ô | Điền gì |
|---|---|
| **Name** | `oh-me-ta` |
| **Database Password** | Bấm **Generate a password** rồi **copy ra chỗ an toàn** |
| **Region** | `Southeast Asia (Singapore)` — gần Việt Nam nhất |
| **Plan** | Free |

> ⚠️ **Database Password chỉ hiện một lần.** Lưu ngay vào trình quản lý mật khẩu.
> Bước 2 cần nó. Mất thì phải reset trong Settings → Database.

Bấm **Create new project** rồi đợi **2–3 phút** cho tới khi hết chữ *Setting up your project*.

## 1.3 Lấy URL và anon key

Menu trái → **Project Settings** (bánh răng dưới cùng) → **API**.

Copy 2 giá trị:

| Tên trên màn hình | Trông như thế nào | Dùng để làm gì |
|---|---|---|
| **Project URL** | `https://abcdefgh.supabase.co` | biến `VITE_SUPABASE_URL` |
| **anon** **public** | `eyJhbGciOiJIUzI1NiIs...` (rất dài) | biến `VITE_SUPABASE_ANON_KEY` |

Cũng ở trang này có **service_role secret**.

> 🔴 **TUYỆT ĐỐI KHÔNG dùng service_role key.** Nó bỏ qua toàn bộ phân quyền RLS.
> Đặt nó vào app là bất kỳ ai mở trình duyệt cũng đọc/sửa được dữ liệu mọi chi nhánh.
> Chỉ dùng **anon public**.

## 1.4 Ghi lại "project ref"

Phần `abcdefgh` trong `https://abcdefgh.supabase.co` gọi là **project ref**. Bước 2 cần.

**Biết là xong khi:** bạn có trong tay 3 thứ — project ref, anon key, database password.

---

# BƯỚC 2 — Chạy 9 migration

Chọn **một trong hai cách**. Cách A nhanh hơn nếu bạn quen dòng lệnh; cách B không cần cài gì.

## Cách A — Supabase CLI (khuyến nghị)

Mở terminal tại thư mục `H:\Hệ thống\Quản lý chuỗi`.

### A1. Đăng nhập

```bash
npx supabase login
```

Trình duyệt sẽ mở ra, bấm **Authorize**. Quay lại terminal thấy `Finished supabase login.`

### A2. Liên kết project

Thay `<project-ref>` bằng mã ở bước 1.4:

```bash
npx supabase link --project-ref <project-ref>
```

Nó sẽ hỏi **database password** — dán mật khẩu ở bước 1.2 (gõ vào không hiện ký tự, cứ dán rồi Enter).

> Nếu hiện cảnh báo kiểu *"Local config major_version 15 differs from remote 17"*:
> mở `supabase/config.toml`, sửa dòng `major_version = 15` thành số mà nó báo, rồi chạy lại.

### A3. Đẩy migration

```bash
npx supabase db push
```

Nó liệt kê 9 file rồi hỏi `Do you want to push these migrations...? [Y/n]` → gõ `Y`.

**Biết là xong khi:** thấy `Finished supabase db push.` và không có dòng `ERROR` nào.

## Cách B — Dán tay vào SQL Editor

Menu trái → **SQL Editor** → **New query**.

Mở từng file bên dưới bằng Notepad, **copy toàn bộ nội dung**, dán vào ô SQL, bấm **Run**
(hoặc Ctrl+Enter). **Chạy hết file này mới sang file kế tiếp, đúng thứ tự:**

```
1.  supabase/migrations/20260802090000_schema_co_so.sql
2.  supabase/migrations/20260802090100_ham_va_trigger.sql
3.  supabase/migrations/20260802090200_view_bao_cao.sql
4.  supabase/migrations/20260802090300_rls_phan_quyen.sql
5.  supabase/migrations/20260802090400_seed_vai_tro_quyen.sql
6.  supabase/migrations/20260802090500_tier1_toan_ven.sql
7.  supabase/migrations/20260802090600_tier2_nghiep_vu.sql
8.  supabase/migrations/20260802090700_tier3_hoan_thien.sql
9.  supabase/migrations/20260802090800_rls_bang_moi.sql
```

Mỗi file chạy xong phải hiện **Success**. Nếu file nào báo lỗi đỏ → **dừng lại**, gửi
nguyên văn lỗi cho mình, đừng chạy tiếp file sau.

> File 4 và 9 kết thúc bằng một bước tự kiểm: nếu có bảng nào chưa bật RLS nó sẽ
> báo lỗi và hủy toàn bộ. Đó là chủ ý — thà dừng còn hơn để hở dữ liệu.
>
> File 8 có thể in ra vài dòng **NOTICE** màu vàng như *"Bỏ qua Storage…"* hay
> *"chưa bật extension pg_cron"*. Đấy **không phải lỗi**, chỉ là báo đã bỏ qua phần tùy chọn.

## Kiểm tra nhanh

Dán vào SQL Editor:

```sql
select count(*) as so_bang from pg_tables where schemaname = 'public';
select count(*) as so_quyen from quyen_he_thong;
select count(*) as so_vai_tro from vai_tro_he_thong;
```

**Biết là xong khi:** `so_bang` = **57**, `so_quyen` = **80**, `so_vai_tro` = **10**.

Thiếu bảng nghĩa là có file chưa chạy. Thiếu quyền/vai trò nghĩa là file 5 hoặc 9 chưa chạy —
mà thiếu chúng thì **không ai đăng nhập vào thấy được gì cả**, vì mọi policy đều tra theo bảng quyền.

---

# BƯỚC 3 — Chạy 2 file kiểm chứng

Việc này chứng minh dữ liệu **không rò giữa các chi nhánh** trước khi bạn đưa vào dùng thật.
Cả hai file đều kết thúc bằng `rollback` nên **không để lại bất kỳ dữ liệu nào**.

## 3.1 Kiểm tra phân quyền

SQL Editor → New query → dán toàn bộ `supabase/tests/kiem_tra_rls.sql` → **Run**.

## 3.2 Kiểm tra nghiệp vụ

Tương tự với `supabase/tests/kiem_tra_nghiep_vu.sql`.

## Đọc kết quả

| Kết quả | Nghĩa là | Làm gì |
|---|---|---|
| `Success. No rows returned` + NOTICE có dấu ✅ | Đạt hết | Sang bước 4 |
| Dòng đỏ bắt đầu bằng `FAIL:` | Có lỗ hổng hoặc logic sai | **DỪNG.** Gửi nguyên văn dòng đó cho mình |

Ví dụ một dòng FAIL trông như thế này — nếu thấy thì đừng đưa hệ thống vào dùng:

```
ERROR: FAIL: RÒ TỒN KHO chi nhánh PTB sang Mỹ Thái
```

> Chạy lại 2 file này **trước mỗi lần deploy**, không phải chỉ lần đầu. Chúng rẻ và nhanh.

---

# BƯỚC 4 — Tạo tài khoản và chạy app

## 4.1 Tạo user trong Supabase Auth

Menu trái → **Authentication** → **Users** → **Add user** → **Create new user**.

| Ô | Điền |
|---|---|
| Email | email thật của bạn, vd `admin@ohmeta.vn` |
| Password | mật khẩu bạn tự đặt (đây là mật khẩu để đăng nhập app) |
| **Auto Confirm User** | ✅ **phải bật** |

> Quên bật *Auto Confirm* thì tài khoản ở trạng thái chờ xác nhận email và không đăng nhập được.

## 4.2 Khai người dùng vào hệ thống

Supabase Auth chỉ lo việc đăng nhập. Phân quyền nằm ở bảng riêng, phải nối hai bên lại.

SQL Editor → **thay `admin@ohmeta.vn` bằng email vừa tạo ở 4.1** → Run:

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

Kiểm tra — phải ra đúng 1 dòng, cột `ma_vai_tro` = `admin`:

```sql
select nd.email, vt.ma_vai_tro, ndvt.chi_nhanh_id
from nguoi_dung_he_thong nd
join nguoi_dung_vai_tro ndvt on ndvt.nguoi_dung_id = nd.id
join vai_tro_he_thong vt on vt.id = ndvt.vai_tro_id;
```

## 4.3 Tạo chi nhánh và đơn vị tính

Không có chi nhánh thì đăng nhập vào sẽ trống trơn. Chạy (sửa tên cho đúng thực tế):

```sql
insert into chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, loai_chi_nhanh) values
  ('BTC',  'Bếp Trung Tâm', 'bep_trung_tam'),
  ('CH01', 'Cửa hàng 1',    'cua_hang');

insert into don_vi_tinh (ma_dvt, ten_dvt) values
  ('KG',  'Kilogram'),
  ('L',   'Lít'),
  ('CAI', 'Cái'),
  ('HOP', 'Hộp'),
  ('THUNG','Thùng');
```

## 4.4 Cấu hình app

Trong `H:\Hệ thống\Quản lý chuỗi`, sao chép `.env.example` thành `.env` rồi mở bằng Notepad,
điền 2 giá trị lấy ở bước 1.3:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

Không có dấu nháy, không có khoảng trắng thừa. Lưu lại.

## 4.5 Chạy

```bash
npm install
```

```bash
npm run dev
```

Mở **http://localhost:5173** → đăng nhập bằng email + mật khẩu ở bước 4.1.

**Biết là xong khi:** vào được màn hình *Tổng quan*, góc trên bên phải có ô chọn chi nhánh
với 2 chi nhánh vừa tạo, menu trái hiện đủ 9 mục.

---

# Gặp lỗi thì tra ở đây

| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| Màn hình đăng nhập có ô vàng *"Chưa cấu hình kết nối"* | Thiếu hoặc sai `.env` | Kiểm tra `.env` đúng thư mục gốc, tên biến có tiền tố `VITE_`, và **khởi động lại `npm run dev`** — Vite chỉ đọc `.env` lúc khởi động |
| *"Sai email hoặc mật khẩu"* dù gõ đúng | Quên bật Auto Confirm ở 4.1 | Authentication → Users → mở user → **Confirm email** |
| Đăng nhập được nhưng báo *"chưa được khai trong bảng nguoi_dung_he_thong"* | Chưa chạy 4.2, hoặc email trong SQL khác email đăng nhập | Chạy lại 4.2 với đúng email |
| Vào được nhưng báo *"Tài khoản chưa được gán chi nhánh nào"* | Chưa chạy 4.3 | Chạy 4.3 rồi tải lại trang |
| Menu chỉ có mục *Tổng quan* | Vai trò gán thiếu hoặc gán kèm chi nhánh thay vì `null` | Chạy lại 4.2 — cột `chi_nhanh_id` phải là `null` cho vai trò admin |
| Trang trắng, F12 thấy lỗi đỏ | Lỗi JS | Gửi nguyên văn dòng lỗi trong tab Console |
| Bảng nào cũng trống dù đã nhập liệu | Đang xem nhầm chi nhánh | Đổi ô chọn chi nhánh ở thanh trên |

---

# Sau khi chạy được

Thứ tự nhập liệu để hệ thống hoạt động đủ:

1. **Vật tư** — nhớ bật cờ *Được bán* cho thành phẩm, điền *Hạn dùng (số ngày)* nếu có quản lý HSD
2. **Nhà cung cấp** — điền lead time và đơn tối thiểu
3. **Bảng giá NCC** (bảng `gia_nha_cung_cap`) — chưa có giao diện, tạm nhập bằng SQL.
   Thiếu bảng này thì màn *Đề xuất đặt hàng* vẫn tính ra số thiếu nhưng không gợi ý được
   nhà cung cấp và số lượng mua.
4. **Nhập hàng** đợt đầu để có tồn kho
5. **Dự báo bán** (bảng `du_bao_ban`) — chưa có giao diện, nhập bằng SQL. Có nó thì
   *Đề xuất đặt hàng* mới chạy.

Hai bảng ở mục 3 và 5 là phần giao diện còn thiếu — nói mình biết nếu bạn muốn làm tiếp.
