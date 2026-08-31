# 04 — Xác thực, phân quyền và bảo mật

Trạng thái: Draft

Tiến độ triển khai: ma trận action/role, permission guard và masking dữ liệu nhạy cảm đã có trong `server/cms-authorization.js`. Adapter Bearer token → Supabase Auth user → active profile → principal đã có trong `server/cms-authentication.js` và `api/_cms-auth.js`. Chưa thay admin session legacy hoặc tạo màn hình đăng nhập CMS.

## Hướng xác thực

Thay mã admin dùng chung bằng Supabase Auth cho từng người dùng. Mã admin cũ chỉ được giữ tạm thời trong giai đoạn chuyển đổi, có ngày ngừng sử dụng và không dùng cho chức năng CMS mới.

Cookie/session phải HttpOnly, Secure, SameSite phù hợp và có thời hạn. Admin API xác thực server-side; ẩn nút trên UI không phải authorization.

CMS API giai đoạn đầu nhận access token qua `Authorization: Bearer <JWT>`. Server xác minh token bằng `GET /auth/v1/user` với publishable key theo hướng dẫn Supabase, sau đó tải profile bằng kết nối server. Không giải mã JWT rồi tin payload nếu chưa xác minh chữ ký/issuer hoặc Auth server.

Mã lỗi adapter: `AUTH_REQUIRED`, `AUTH_INVALID`, `PROFILE_REQUIRED`, `ACCOUNT_DISABLED`, `ROLE_INVALID`. Response auth không trả token, email hay chi tiết lỗi Supabase.

## Ma trận quyền MVP

| Hành động | Super admin | Manager | Editor | Sales | Viewer |
|---|---:|---:|---:|---:|---:|
| Xem dashboard | Có | Có | Có | Có | Có giới hạn |
| Xem dữ liệu nhạy cảm | Có | Có | Có | Có | Không mặc định |
| Sửa hồ sơ | Có | Có | Có | Giới hạn | Không |
| Gửi duyệt | Có | Có | Có | Không | Không |
| Publish/archive | Có | Có | Không | Không | Không |
| Phân công | Có | Có | Không | Không | Không |
| Quản lý người dùng | Có | Không | Không | Không | Không |
| Xem audit log | Có | Có | Giới hạn | Không | Không |

Quyền cụ thể phải được kiểm tra bằng policy/service, không chỉ so sánh role rải rác trong handler.

### Action contract đã triển khai

```text
dashboard.read
property.read
property.sensitive.read
property.edit
property.submit_review
property.publish
property.archive
property.assign
property.export
media.edit
audit.read
user.manage
```

API mới phải gọi `requirePermission(principal, action)`. Response cho role thiếu `property.sensitive.read` phải đi qua `maskSensitiveProperty`; không dựa vào frontend để ẩn điện thoại hoặc dữ liệu nguồn.

## RLS và service key

- Không đưa `SUPABASE_SECRET_KEY` hoặc service-role key vào CMS bundle.
- Nếu API server dùng service key, mọi route mutation phải đi qua authorization service.
- Bật RLS cho bảng quản trị; public role không được đọc `profiles`, `audit_logs`, contacts hoặc lead.
- Storage upload phải validate bucket, MIME, kích thước và property scope.

## Bảo vệ dữ liệu cá nhân

- Số điện thoại chỉ hiển thị đầy đủ cho role được phép.
- Không log raw request có số điện thoại, session, token hoặc nội dung nhạy cảm.
- Audit có thể lưu thay đổi nghiệp vụ nhưng phải tránh secret và dữ liệu file nhị phân.
- Export dữ liệu là hành động có quyền riêng và được audit.

## Kiểm soát mutation

- CSRF protection cho cookie-authenticated mutation.
- Kiểm tra `Origin`/`Referer` theo chính sách triển khai.
- Rate limit login, export, upload và mutation hàng loạt.
- Optimistic locking bằng `version` để tránh ghi đè chỉnh sửa đồng thời.
- Bulk action có giới hạn số lượng, dry summary và kết quả từng record.
- Không có hard delete hồ sơ trong UI nghiệp vụ.

## Sự kiện audit bắt buộc

- Login thành công/thất bại, logout, khóa/mở người dùng.
- Tạo/sửa/publish/reject/archive/restore hồ sơ.
- Thay đổi người phụ trách, trạng thái khả dụng và nổi bật.
- Thêm, đổi thứ tự, ẩn ảnh.
- Export dữ liệu.
- Thay đổi role hoặc cấu hình.
- Hành động bulk và kết quả một phần.

`server/cms-audit.js` đã chuẩn hóa event theo shape bảng `audit_logs`, tính `changed_fields` ổn định và redact khóa chứa authorization, cookie, password, secret, session, token hoặc API key. Timestamp do database tạo, không tin timestamp do client gửi.

## Checklist threat review

- IDOR: người dùng đổi ID trên URL có đọc/sửa được record ngoài quyền không?
- XSS: `raw_text`, tên người gửi và filename có được escape/sanitize không?
- Injection: filter có nối trực tiếp vào PostgREST expression không?
- Upload: file giả MIME, SVG/script, ảnh quá lớn và decompression bomb.
- Session: fixation, expiry, revoke, user disabled.
- Cache: response admin/PII không được public-cache.
- Enumeration: lỗi login và lookup không tiết lộ thông tin không cần thiết.
