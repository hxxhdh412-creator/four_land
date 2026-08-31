# 03 — Mô hình dữ liệu CMS

Trạng thái: Draft — chưa phải migration có thể chạy

Tài liệu này mở rộng `docs/DATA_MODEL.md`. Khi triển khai, migration và tài liệu dữ liệu chính phải được cập nhật cùng nhau.

## Điều chỉnh bảng `properties`

Các trường đề xuất:

| Trường | Kiểu gợi ý | Ý nghĩa |
|---|---|---|
| `content_status` | enum/text | `draft`, `pending_review`, `published`, `rejected`, `archived` |
| `availability_status` | enum/text | `available`, `reserved`, `rented`, `sold`, `unavailable` |
| `quality_status` | enum/text | `raw`, `partial`, `complete`, `needs_review` |
| `is_featured` | boolean | Ghim nổi bật, không dùng chung với status |
| `assigned_to` | uuid nullable | Người phụ trách |
| `published_at` | timestamptz | Lần xuất bản hiện tại |
| `verified_at` | timestamptz | Lần xác minh với nguồn/chủ nhà |
| `last_synced_at` | timestamptz | Lần sync nguồn gần nhất |
| `source_updated_at` | timestamptz | Thời điểm cập nhật từ nguồn |
| `cms_override_fields` | text[]/jsonb | Field không cho sync ghi đè |
| `version` | bigint | Optimistic locking |

Không xóa cột `status` trong migration đầu. Cần backfill và giai đoạn đọc song song trước khi chuyển public API.

## Bảng mới MVP

### `profiles`

- `id` tham chiếu Supabase Auth user.
- `display_name`, `role`, `is_active`, `created_at`, `updated_at`.
- Role ban đầu: `super_admin`, `manager`, `editor`, `sales`, `viewer`.

### `property_assignments`

- `id`, `property_id`, `assignee_id`, `assigned_by`, `assigned_at`, `ended_at`.
- Giữ lịch sử phân công; `properties.assigned_to` có thể là snapshot truy vấn nhanh.

### `audit_logs`

- `id`, `actor_id`, `action`, `entity_type`, `entity_id`.
- `before_data`, `after_data`, `changed_fields`.
- `request_id`, `source`, `ip_hash`, `created_at`.
- Append-only; người dùng thường không được sửa/xóa.

### `sync_runs`

- `id`, `source`, `started_at`, `finished_at`, `status`.
- `read_count`, `inserted_count`, `updated_count`, `skipped_count`, `failed_count`.
- `error_summary` đã loại secret/PII.

### `property_quality_issues`

- `id`, `property_id`, `issue_code`, `severity`, `details`.
- `detected_at`, `resolved_at`, `resolved_by`.
- Unique active issue theo `(property_id, issue_code)`.

## Bảng giai đoạn CRM

- `contacts`: khách/chủ nhà, điện thoại chuẩn hóa và nguồn.
- `leads`: nhu cầu, ngân sách, khu vực, pipeline, assignee.
- `lead_property_matches`: căn đã gợi ý/xem và phản hồi.
- `tasks`: lịch gọi lại, deadline, trạng thái.
- Mở rộng `property_inquiries` bằng liên kết `lead_id` sau migration an toàn.

## Quy tắc trạng thái

- Chỉ `content_status=published` mới xuất hiện công khai.
- Archive không xóa record, ảnh hoặc audit log.
- `availability_status` không tự quyết `content_status`; chính sách hiển thị căn đã thuê phải cấu hình rõ.
- `is_featured=true` chỉ hợp lệ với hồ sơ published.
- Publish phải qua validator các field bắt buộc.

## Migration tương thích

1. Tạo baseline schema phản ánh production, không làm thay đổi dữ liệu.
2. Thêm bảng/cột nullable và index không phá vỡ API cũ.
3. Backfill trạng thái cũ theo mapping đã duyệt.
4. Chạy báo cáo sai lệch, không tự sửa record mơ hồ.
5. Admin API ghi cấu trúc mới; tạm thời duy trì compatibility field nếu cần.
6. Public API đọc cấu trúc mới sau khi kiểm tra staging.
7. Chỉ loại compatibility code ở một release riêng.

## Index tối thiểu

- `(content_status, received_at desc)`.
- `(availability_status, received_at desc)`.
- `(assigned_to, content_status)`.
- `(quality_status, updated_at desc)`.
- GIN/trigram hoặc generated search document cho tìm kiếm.
- `audit_logs(entity_type, entity_id, created_at desc)`.
- `sync_runs(started_at desc)`.
