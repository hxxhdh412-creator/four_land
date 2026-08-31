# 05 — Hợp đồng API CMS

Trạng thái: Draft

Tiến độ triển khai: RBAC action contract, audit event builder và Supabase Auth adapter đã có unit test. Hai endpoint read-only `/api/admin/v1/me` và `/api/admin/v1/dashboard/summary` đã được triển khai; mutation vẫn chưa mở.

## Quy ước chung

- Namespace đề xuất: `/api/admin/v1/*` và `/api/public/v1/*` cho route mới.
- JSON response thành công: `{ "ok": true, "data": ..., "meta": ... }`.
- JSON response lỗi: `{ "ok": false, "error": { "code": "...", "message": "...", "fieldErrors": {} }, "requestId": "..." }`.
- Pagination dùng cursor cho audit/activity lớn; danh sách kho có thể dùng page/pageSize khi query đã ở database.
- Thời gian ISO 8601 UTC; UI hiển thị Asia/Ho_Chi_Minh.
- Mutation trả entity/version mới và tạo audit log trong cùng transaction khi có thể.
- Mỗi route khai báo đúng một action permission chính và gọi permission guard phía server.
- Property response phải mask dữ liệu nhạy cảm theo principal trước khi serialize.

## Endpoint MVP dự kiến

### Session và người dùng

- `POST /api/admin/v1/session`
- `DELETE /api/admin/v1/session`
- `GET /api/admin/v1/me` — đã triển khai handler/rewrite và contract test; production cần migration `profiles` trước khi sử dụng.
- `GET/POST/PATCH /api/admin/v1/users`

Adapter server dùng `requireCms(req, res, action)`. Nếu thành công, handler nhận principal `{ id, email, displayName, role, isActive }`; email không được serialize mặc định trong response nghiệp vụ.

### Dashboard

- `GET /api/admin/v1/dashboard/summary` — đã triển khai read-only, trả thống kê tổng hợp và không serialize hồ sơ/PII.
- `GET /api/admin/v1/dashboard/quality`
- `GET /api/admin/v1/review-queue` — đã triển khai read-only; trả tối đa 30 hồ sơ có lỗi chất lượng, xếp theo trọng số địa chỉ → giá → ảnh.
- `GET /api/admin/v1/sync-runs`
- `GET /api/admin/v1/system/health` — đã triển khai aggregate read-only; trả số hồ sơ/ảnh, phân bố status, schema mode, write flags và rollout blockers.

`dashboard/summary` hiện trả các trường `total`, `published`, `pendingReview`, `missingData`, `available`, `archived`, `receivedToday`, `withoutImages` và `schemaMode`. Trong giai đoạn tương thích, `schemaMode = legacy`; sau migration CMS, bộ tổng hợp tự chuyển sang workflow trạng thái mới.

### Hồ sơ

- `GET /api/admin/v1/properties` — đã triển khai danh sách read-only, lọc/phân trang tại database và chỉ trả DTO an toàn không có PII/raw source.
- `GET /api/admin/v1/properties/:id` — đã triển khai chi tiết read-only; trường nhạy cảm chỉ được thêm vào DTO khi principal có `property.sensitive.read`.
- `PATCH /api/admin/v1/properties/:id/update` — đã triển khai handler/RPC atomic phía server, mặc định trả `MUTATIONS_DISABLED` cho đến khi migration và feature flag được bật.
- `POST /api/admin/v1/properties/:id/validate` — đã triển khai preview-only; kiểm tra field allowlist, định dạng, quality warning và `expectedUpdatedAt`, không ghi database.
- `POST /api/admin/v1/properties/:id/submit-review`
- `POST /api/admin/v1/properties/:id/publish`
- `POST /api/admin/v1/properties/:id/reject`
- `POST /api/admin/v1/properties/:id/archive`
- `POST /api/admin/v1/properties/:id/restore`
- `POST /api/admin/v1/properties/:id/workflow` — command `submit_review|publish|reject|archive|restore`; RBAC được chọn trước authentication guard, RPC kiểm tra transition/version lần hai.
- `POST /api/admin/v1/properties/bulk-action`

### Ảnh và lịch sử

- `POST /api/admin/v1/properties/:id/images`
- `PATCH /api/admin/v1/properties/:id/images/:position`
- `DELETE /api/admin/v1/properties/:id/images/:position` tạo tombstone
- `GET /api/admin/v1/properties/:id/audit`

## Query danh sách hồ sơ

Các tham số tối thiểu:

- `q`, `contentStatus`, `availabilityStatus`, `qualityStatus`.
- `district`, `ward`, `street`, `propertyType`.
- `minPrice`, `maxPrice`, `minArea`, `maxArea`.
- `assignedTo`, `hasImages`, `isFeatured`, `staleBefore`.
- `sort`, `page`, `pageSize`.

Lát cắt hiện tại hỗ trợ `q`, `status=active|archived|all`, `quality=all|missing_data|without_images`, `district`, `page` và `pageSize` (tối đa 50). Response trả `data.items` cùng `meta.page`, `meta.pageSize`, `meta.total`, `meta.hasNext`. Các filter nâng cao trong danh sách trên thuộc bước tiếp theo.

API phải trả `total`, facet cần thiết và tuyệt đối không tải 5.000 record về function để lọc.

## Concurrency và idempotency

- PATCH nhận `expectedVersion`; xung đột trả HTTP 409 cùng bản mới nhất.
- Trong giai đoạn tương thích legacy, endpoint validation dùng `expectedUpdatedAt` làm version token. Sai token trả `VERSION_CONFLICT`; khi migration CMS được áp dụng sẽ chuyển sang cột `version` số nguyên.
- Upload và bulk action nhận `Idempotency-Key` khi retry có thể tạo dữ liệu trùng.
- Publish/archive là command có validator và permission riêng, không phải PATCH status tùy ý.

## Mã lỗi nền tảng

- `AUTH_REQUIRED`, `SESSION_EXPIRED`, `FORBIDDEN`.
- `VALIDATION_FAILED`, `INVALID_TRANSITION`.
- `NOT_FOUND`, `VERSION_CONFLICT`.
- `RATE_LIMITED`, `UPLOAD_REJECTED`.
- `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`.

## Contract test bắt buộc

- Mỗi role cho mỗi mutation quan trọng.
- Public không đọc draft/archive/PII.
- Transition hợp lệ và không hợp lệ.
- Version conflict.
- Tombstone không bị sync phục hồi.
- Bulk partial failure trả kết quả từng item, không báo thành công toàn bộ.
- Viewer không nhận `phone`, sender/source identifiers, raw source text hoặc `data_json`.
- Editor không gọi được publish/archive; manager không gọi được user management.
- Audit payload không chứa token, cookie, session, password, secret hoặc API key.
