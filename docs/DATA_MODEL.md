# Hợp đồng dữ liệu Fourland

## 1. Nguồn sự thật

- Dữ liệu tin nhắn gốc: Zalo/Google Sheet.
- Dữ liệu phục vụ web và chỉnh sửa bổ sung: Supabase.
- Đồng bộ là upsert theo `property_id`; không được xóa sạch bảng rồi nhập lại.

## 2. Bảng `properties`

Khóa chính: `property_id`.

Nhóm trường chính:

- Nhận diện: `property_id`, `send_id`, `account_id`, `group_id`, `group_name`.
- Người gửi: `sender_id`, `sender_name`, `phone`.
- Vị trí: `address`, `street`, `ward`, `district`.
- BĐS: `property_type`, `area_text`, `area_number`, `dimensions`, `bedrooms`, `bathrooms`, `structure`, `legal`.
- Giá: `price_text`, `price_number`, `commission`.
- Nội dung: `raw_text`, `normalized_text`, `notes`, `data_json`.
- Hệ thống: `status`, `image_count`, `received_at`, `updated_at`.

### Trạng thái

- `raw`: chưa chuẩn hóa.
- `partial`: đã có một phần dữ liệu, vẫn được hiển thị.
- `complete`: đủ trường quan trọng.
- `archived`: bị ẩn khỏi web công khai nhưng còn trong database.

Không dùng hard delete từ giao diện. Khi khôi phục hiện đặt lại `partial`; lần đồng bộ sau có thể cập nhật trạng thái nghiệp vụ phù hợp.

## 3. Bảng `property_images`

Khóa logic: `(property_id, position)`.

- `storage_path=drive:*`: ảnh nguồn Google Drive.
- `storage_path=external:*`: ảnh ngoài Storage.
- `storage_path=<property>/<file>`: ảnh nằm trong Supabase Storage.
- `storage_path=hidden:*`: tombstone ảnh đã bị gỡ khỏi web.

Tombstone phải giữ nguyên qua đồng bộ. Script sync đọc tombstone trước và không upsert lại cùng `(property_id, position)`.

`image_count` là số ảnh nhìn thấy, không phải vị trí lớn nhất. UI vẫn phải đếm danh sách URL hợp lệ để tránh số liệu cũ.

## 4. Bảng `property_inquiries`

Lưu yêu cầu quan tâm nếu tính năng này được bật: `property_id`, `phone`, `source_url`, `status`, `created_at`. Hiện UI chính ưu tiên nút gọi trực tiếp.

## 5. Chuẩn dữ liệu

- Số điện thoại lưu dạng số Việt Nam bắt đầu bằng `0`, không khoảng trắng.
- `price_number` dùng giá trị số có cùng đơn vị quy ước của hệ thống; `price_text` giữ cách diễn đạt người dùng.
- `area_number` là m² dạng số; `area_text` giữ mô tả gốc.
- `district`, `ward`, `street` là tên hiển thị đã chuẩn hóa cho TP.HCM.
- Thời gian truyền API dùng ISO 8601; hiển thị theo múi giờ sản phẩm.
- Không nhét dữ liệu có thể lọc/sort vào riêng `data_json`; trường quan trọng phải có column riêng.

### Tương thích CMS trước migration

Trong giai đoạn chuyển đổi, `data_json.cms_override_fields` lưu danh sách field đã được admin sửa thủ công. Sync phải giữ giá trị production của các field này và bảo toàn `view_count`, `is_featured`, `is_rented` cùng metadata `cms`. Đây là lớp tương thích tạm thời; schema CMS mục tiêu sẽ có field ownership/audit rõ ràng hơn.

### Migration CMS core đang chờ áp dụng

Migration `20260829080000_cms_core_additive.sql` thêm nhưng không thay thế `status` legacy:

- `content_status`: `draft`, `pending_review`, `published`, `rejected`, `archived`.
- `availability_status`: `available`, `reserved`, `rented`, `sold`, `unavailable`.
- `quality_status`: `raw`, `partial`, `complete`, `needs_review`.
- `is_featured`, `assigned_to`, `published_at`, `verified_at`.
- `last_synced_at`, `source_updated_at`, `cms_override_fields`, `version`.

Backfill bảo toàn public hiện tại: mọi hồ sơ legacy không archived thành `published`; `archived` giữ archived; `rented` chuyển availability sang rented; `ready`, `featured`, `rented` được xem là quality complete. Public API vẫn dùng `status` cho đến một release cutover riêng.

## 6. Bảng CMS core đang chờ áp dụng

### `profiles`

Liên kết `auth.users`; lưu `display_name`, role và trạng thái hoạt động. Role giới hạn trong `super_admin`, `manager`, `editor`, `sales`, `viewer`.

### `audit_logs`

Lưu actor, action, entity, dữ liệu trước/sau, field thay đổi, request ID, source và thời điểm. RLS được bật; anonymous/authenticated không có quyền update/delete trực tiếp.

## 7. Index khuyến nghị

- `properties(received_at desc)`
- `properties(status, received_at desc)`
- `properties(district, ward, street)`
- `properties(price_number)` và `properties(area_number)`
- `property_images(property_id, position)` unique
- Trigram/FTS cho `address`, `phone`, `raw_text`, `normalized_text` khi dữ liệu tăng lớn.

Mọi thay đổi schema phải có migration trong `supabase/migrations/` và cập nhật file này.
