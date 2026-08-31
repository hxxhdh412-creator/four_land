# 00 — Baseline hiện trạng trước CMS

Trạng thái: Review — đã đối chiếu OpenAPI Supabase production ở chế độ chỉ-đọc ngày 2026-08-29

## Mục đích

Tài liệu ghi lại hành vi code đang có để làm mốc regression. Đây không phải migration và không khẳng định production có đầy đủ constraint/index tương ứng. Trước khi tạo baseline SQL phải xuất schema read-only từ Supabase và đối chiếu từng mục.

## Thành phần hiện tại

| Thành phần | Hiện trạng |
|---|---|
| Public UI | `index.html`, `assets/app.js`, `assets/app.css` |
| Admin UI | Nhúng trong public UI; đăng nhập mã dùng chung |
| API | Vercel handlers trong `api/*.js` |
| Database | Supabase REST; repo chưa có baseline migration |
| Ảnh | `property_images`, Drive/external/Supabase Storage, tombstone `hidden:*` |
| Nguồn dữ liệu | Zalo → Sheet → `scripts/sync-sheet-to-supabase.js` |
| Local | `preview-server.js` mô phỏng route production |

## Bảng được code tham chiếu

### `properties`

Các column quan sát từ sync và API:

```text
property_id, send_id, status,
account_id, group_id, group_name,
sender_id, sender_name, phone,
property_type, address, district, ward, street,
area_text, area_number, dimensions,
bedrooms, bathrooms, structure,
price_text, price_number, legal, commission,
notes, raw_text, normalized_text,
image_count, received_at, updated_at, data_json
```

OpenAPI production xác nhận bảng có đúng 31 column trên. Kiểu dữ liệu chi tiết nằm trong `supabase/baseline/20260829_public_schema.sql`.

### `property_images`

```text
property_id, position, storage_path, public_url, source_url
```

Khóa logic hiện được kỳ vọng là `(property_id, position)`.

OpenAPI production xác nhận đây là composite primary key và `property_id` là foreign key tới `properties.property_id`. Hành vi `ON DELETE` chưa xác định được qua OpenAPI.

### `property_inquiries`

API dự kiến các trường `id, property_id, phone, source_url, status, created_at`, nhưng OpenAPI production xác nhận bảng này **chưa tồn tại**. Route `POST /api/inquiries` vì vậy sẽ lỗi dependency nếu được UI gọi.

## Trạng thái legacy quan sát trong code

- Tài liệu dữ liệu: `raw`, `partial`, `complete`, `archived`.
- Admin/API/UI còn dùng: `ready`, `featured`, `rented`, `archived`.
- Sync nhận `Status` từ Sheet và mặc định `raw`.

Thống kê production ngày 2026-08-29:

| Status | Số hồ sơ |
|---|---:|
| `partial` | 50 |
| `ready` | 3 |
| `featured` | 2 |

Không có `raw`, `complete`, `rented` hoặc `archived` tại thời điểm kiểm tra.

Kết luận: `status` đang gộp nhiều chiều và có vocabulary không đồng nhất. Không thêm giá trị mới vào cột này. Migration CMS phải backfill bằng truy vấn thống kê production và danh sách record ngoại lệ.

## Ma trận quyền sở hữu field hiện tại

| Nhóm | Sync đang ghi | Admin đang ghi | Rủi ro |
|---|---:|---:|---|
| ID/nguồn/người gửi | Có | Không | Thấp |
| Địa chỉ/đặc điểm/giá/liên hệ | Có | Có | Sync có thể ghi đè chỉnh sửa CMS |
| Nội dung/ghi chú | Có | Có | Chưa có field-level override |
| `status` | Có, trừ archive được bảo toàn | Có | Gộp workflow/availability/featured |
| `image_count` | Có | Có | Derived nhưng cập nhật từ hai luồng |
| `data_json` | Có | Gián tiếp khi tăng view | Có thể xảy ra lost update |
| Ảnh theo position | Có | Có | Tombstone được bảo toàn theo position |

## Bảo vệ hiện có

- Public list loại `status=archived`.
- Archived ID được đọc trước sync và giữ `archived`.
- Tombstone ảnh được đọc trước sync và không upsert lại cùng position.
- Admin cookie HttpOnly/Secure/SameSite Strict, ký HMAC, thời hạn 8 giờ.
- Secret Supabase chỉ được dùng phía server.

## Khoảng trống/rủi ro phải xử lý trước CMS

1. Chưa có baseline migration production trong repo.
2. Chưa có tài khoản từng người, RBAC hoặc audit log.
3. Admin route còn hỗ trợ hard delete hồ sơ/ảnh liên quan.
4. Sync chủ động hard-delete record trùng theo địa chỉ; cần đánh giá quan hệ và chính sách merge trước CRM/audit.
5. Search list tải tối đa 5.000 record rồi lọc trong function.
6. View count read-modify-write trong `data_json`, không atomic.
7. Logic Vercel API và preview server có thể lệch nhau.
8. Trước đợt này, dry-run sync có lỗi tham chiếu `record`, `property`, `source` chưa khai báo; đã bổ sung regression test nhưng vẫn cần chạy dry-run với Sheet thật.
9. `property_inquiries` chưa tồn tại trên production trong khi API đã tham chiếu.
10. Production có 55 hồ sơ/164 ảnh, còn Sheet dry-run cho 74 hồ sơ/540 ảnh; chưa được phép kết luận hoặc chạy sync ghi trước khi điều tra chênh lệch.
11. Diff xác nhận chỉ 31 hồ sơ chung; 43 source-only, 24 production-only và nhiều field khác hai chiều. Xem `00.3-SHEET-SUPABASE-DIFF.md`.

## Bằng chứng kiểm tra Giai đoạn 0.1

- Regression test smart search khoảng diện tích.
- Unit test parse `Data JSON` và CSV sync.
- `npm run check`.
- `npm test`.
- `npm run sync:check` chỉ là read-only nhưng cần kết nối Google Sheet; kết quả phải ghi lại khi chạy.
- `npm run schema:check` chỉ đọc OpenAPI/count/status và không xuất secret hoặc dữ liệu hồ sơ.

## Điều kiện để tạo baseline migration

- Có schema OpenAPI read-only từ đúng Supabase production: hoàn thành 2026-08-29.
- Ghi row count và distinct legacy statuses: hoàn thành 2026-08-29.
- Xác nhận PK, FK, unique constraint, index, trigger, RLS và storage policy.
- Xác nhận backup/restore path.
- Baseline SQL không thực hiện DDL lên production; chỉ dùng làm nguồn review trước.

OpenAPI chưa đủ để xác nhận index ngoài PK, trigger, RLS, policy và hành vi foreign key. Baseline SQL hiện được đặt ngoài `supabase/migrations/` để không thể bị áp dụng nhầm.
