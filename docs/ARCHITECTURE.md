# Kiến trúc Fourland Warehouse

## 1. Phạm vi

Ứng dụng phục vụ tra cứu kho bất động sản TP.HCM, xem chi tiết, gọi liên hệ và quản trị nội dung/ảnh. Hệ thống ưu tiên tốc độ đọc, an toàn dữ liệu và trải nghiệm mobile.

## 2. Thành phần

| Thành phần | Trách nhiệm | Không nên làm |
|---|---|---|
| Zalo Sync/VPS | Nhận tin, gom ảnh, chuẩn hóa sơ bộ, gửi Sheet | Không phục vụ truy vấn web công khai |
| Google Sheet | Hàng đợi và nguồn kiểm tra vận hành | Không làm database trực tiếp cho giao diện |
| `scripts/sync-sheet-to-supabase.js` | Ánh xạ Sheet → Supabase, bảo toàn archive/tombstone | Không chứa logic giao diện |
| Supabase | Database web và Storage ảnh tải thủ công | Không lộ secret key cho client |
| `api/*.js` | Xác thực, validate và truy vấn Supabase | Không trả secret/cấu hình nội bộ |
| `assets/*` + `index.html` | UI, state trình duyệt và gọi `/api` | Không truy cập database trực tiếp |
| `preview-server.js` | Mô phỏng local các route Vercel | Không phải production server |

## 3. Luồng đọc

1. Trình duyệt gọi `/api/properties` với tìm kiếm, bộ lọc và phân trang.
2. API xây PostgREST query và luôn loại hồ sơ `archived` với người dùng thường.
3. Card tải ảnh lazy; chi tiết chỉ được gọi khi người dùng mở hồ sơ.
4. `/api/property` trả một hồ sơ và danh sách ảnh.

### Luồng SEO hồ sơ

- Mỗi hồ sơ công khai có URL chuẩn `/bat-dong-san/<dia-chi>--<property_id>`.
- Vercel rewrite URL này sang `api/seo-property.js`; hàm đọc Supabase và trả HTML hoàn chỉnh, không bắt crawler chờ JavaScript.
- HTML ban đầu có title, description, canonical, Open Graph, Twitter Card, JSON-LD và nội dung bất động sản nhìn thấy được.
- Card là liên kết `<a href>` thật. Click thường vẫn mở popup để giữ trải nghiệm hiện tại; mở tab mới và crawler nhận trang SEO độc lập.
- `server/seo.js` là nguồn dùng chung cho URL, HTML phía server và sitemap.

## 4. Luồng ghi quản trị

1. Người quản trị bấm avatar và đăng nhập bằng mã.
2. Server phát cookie HttpOnly, Secure, SameSite=Strict, hết hạn sau 8 giờ.
3. Các route `admin-*` gọi `requireAdmin` trước mọi thay đổi.
4. Sửa thông tin dùng PATCH; thêm ảnh ghi Storage rồi ghi `property_images`.
5. Ẩn hồ sơ dùng `status=archived`; xóa ảnh tạo tombstone `hidden:*`.

## 5. Ranh giới module mục tiêu

Frontend khi tách module:

```text
assets/js/
  api.js       # fetch, lỗi chuẩn
  state.js     # state và query params
  search.js    # tìm kiếm, bộ lọc, phân trang
  cards.js     # render danh sách
  detail.js    # popup và gallery
  admin.js     # login, sửa, ảnh, archive
  main.js      # bootstrap duy nhất
```

Server khi có thêm nghiệp vụ:

```text
server/
  repositories/  # truy vấn Supabase
  services/      # archive, image, search
  validators/    # input validation
api/             # adapter Vercel mỏng
```

Không tách module chỉ để tăng số file; tách khi một trách nhiệm có thể được kiểm thử độc lập.

## 6. Quy tắc mở rộng

- Bộ lọc mới: thêm column/index → API query → state/params → UI → tài liệu data.
- Trường dữ liệu mới: thêm migration → sync mapping → select API → UI → tài liệu.
- Quyền mới: mở rộng role/session ở server; không ẩn nút UI để thay cho authorization.
- Tác vụ nền nặng: chuyển sang queue/cron; không giữ request Vercel quá giới hạn.
- Tìm kiếm vài chục nghìn hồ sơ: dùng generated search document + PostgreSQL FTS/trigram thay cho nhiều `ilike`.
