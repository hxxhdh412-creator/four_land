# Kế hoạch CMS Fourland

## Mục đích

Thư mục này là nguồn kế hoạch triển khai CMS cho Fourland Warehouse. Tài liệu giúp đội phát triển chốt phạm vi, dữ liệu, quyền, API, giao diện và tiêu chí phát hành trước khi sửa hệ thống production.

CMS được xây bổ sung trên nền Supabase và Vercel hiện tại. Public web, SEO URL, Zalo Sync và luồng Sheet không được viết lại trong giai đoạn đầu.

## Thứ tự đọc và phê duyệt

| Thứ tự | Tài liệu | Quyết định cần chốt |
|---|---|---|
| 0 | [00-CURRENT-BASELINE.md](00-CURRENT-BASELINE.md) | Hiện trạng code/schema cần đối chiếu production |
| 0.3 | [00.3-SHEET-SUPABASE-DIFF.md](00.3-SHEET-SUPABASE-DIFF.md) | Chênh lệch dữ liệu cần xử lý trước sync/migration |
| 0.4 | [00.4-FIELD-OWNERSHIP.md](00.4-FIELD-OWNERSHIP.md) | Field nào thuộc nguồn, CMS hoặc dữ liệu dẫn xuất |
| 1 | [01-PRODUCT-SCOPE.md](01-PRODUCT-SCOPE.md) | Ai dùng CMS và phiên bản đầu làm gì |
| 2 | [02-TARGET-ARCHITECTURE.md](02-TARGET-ARCHITECTURE.md) | Ranh giới public web, CMS và backend |
| 3 | [03-DATA-MODEL.md](03-DATA-MODEL.md) | Trạng thái, bảng mới và tương thích sync |
| 4 | [04-AUTHORIZATION-SECURITY.md](04-AUTHORIZATION-SECURITY.md) | Đăng nhập, vai trò và bảo vệ dữ liệu |
| 5 | [05-API-CONTRACT.md](05-API-CONTRACT.md) | Hợp đồng API và quy ước lỗi |
| 6 | [06-UX-INFORMATION-ARCHITECTURE.md](06-UX-INFORMATION-ARCHITECTURE.md) | Màn hình và hành trình nghiệp vụ |
| 7 | [07-DELIVERY-ROADMAP.md](07-DELIVERY-ROADMAP.md) | Giai đoạn, dependency và Definition of Done |
| 8 | [08-TEST-MIGRATION-RELEASE.md](08-TEST-MIGRATION-RELEASE.md) | Test, backup, rollout và rollback |
| 9 | [09-DECISION-LOG.md](09-DECISION-LOG.md) | Ghi lại quyết định đã duyệt |

Không bắt đầu migration production khi các tài liệu 01–04 chưa được duyệt. Không xây UI dựa trên API chưa có contract trong tài liệu 05.

## Nguyên tắc bất biến

- Một tài khoản Zalo chỉ có một listener.
- Supabase tiếp tục là database phục vụ web; frontend không giữ secret key.
- Google Sheet/Zalo là nguồn đầu vào; đồng bộ không được ghi đè archive, chỉnh sửa thủ công được bảo vệ hoặc tombstone ảnh.
- Hồ sơ bị loại khỏi web bằng soft delete; không hard-delete trong nghiệp vụ thường.
- Mọi thao tác quản trị được xác thực phía server và có audit log.
- Public API không trả số điện thoại, dữ liệu nội bộ hoặc hồ sơ chưa xuất bản ngoài chủ đích sản phẩm.
- Migration phải có backup, kiểm tra trước/sau và kế hoạch rollback.

## Trạng thái tài liệu

- `Draft`: đang soạn, chưa dùng để triển khai.
- `Review`: đã đủ nội dung, đang chờ phê duyệt.
- `Approved`: được phép dùng làm đầu vào triển khai.
- `Superseded`: đã được thay bằng quyết định/tài liệu mới.

Mỗi thay đổi quan trọng phải cập nhật `09-DECISION-LOG.md` cùng ngày.
