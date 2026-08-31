# 09 — Nhật ký quyết định CMS

Tài liệu này ghi các quyết định đã được chủ hệ thống phê duyệt. Không xóa quyết định cũ; nếu thay đổi, thêm quyết định mới và đánh dấu quyết định trước là `Superseded`.

## Mẫu quyết định

### CMS-ADR-XXX — Tên quyết định

- Ngày: YYYY-MM-DD
- Trạng thái: Proposed | Approved | Superseded
- Người duyệt:
- Bối cảnh:
- Các phương án:
- Quyết định:
- Lý do:
- Hệ quả/rủi ro:
- Tài liệu hoặc migration liên quan:

## Quyết định đang đề xuất

### CMS-ADR-001 — Tách CMS khỏi bundle public

- Ngày: 2026-08-29
- Trạng thái: Proposed
- Bối cảnh: Admin hiện được nhúng trong `assets/app.js`, khó mở rộng role và workflow.
- Quyết định đề xuất: Xây CMS riêng tại `/admin`, giữ public web hiện tại trong MVP.
- Hệ quả: Có thêm bundle/build riêng nhưng giảm regression SEO và tách rõ bảo mật.

### CMS-ADR-002 — Tách các chiều trạng thái bất động sản

- Ngày: 2026-08-29
- Trạng thái: Proposed
- Bối cảnh: `status` hiện mang nhiều nghĩa như chất lượng, archive, nổi bật và đã thuê.
- Quyết định đề xuất: Tách `content_status`, `availability_status`, `quality_status` và `is_featured`.
- Hệ quả: Cần backfill, compatibility period và cập nhật sync/public API.

### CMS-ADR-003 — Dùng Supabase Auth và RBAC

- Ngày: 2026-08-29
- Trạng thái: Proposed
- Bối cảnh: Mã quản trị dùng chung không xác định được người thao tác.
- Quyết định đề xuất: Mỗi nhân viên có tài khoản, role và audit riêng.
- Hệ quả: Cần quản trị vòng đời user, RLS, revoke session và migration admin cũ.

### CMS-ADR-004 — Không hard-delete hồ sơ trong CMS

- Ngày: 2026-08-29
- Trạng thái: Proposed
- Bối cảnh: Hard delete làm mất khả năng khôi phục và phá liên kết/audit.
- Quyết định đề xuất: Nghiệp vụ chỉ archive; purge nếu có là job quản trị ngoại lệ với retention và backup.
- Hệ quả: Cần chính sách lưu trữ và dung lượng rõ ràng.

### CMS-ADR-005 — Search và pagination ở PostgreSQL

- Ngày: 2026-08-29
- Trạng thái: Proposed
- Bối cảnh: API hiện tải tối đa 5.000 hồ sơ rồi lọc trong serverless function.
- Quyết định đề xuất: Dùng index + FTS/trigram/RPC và phân trang tại database.
- Hệ quả: Cần migration index, benchmark staging và contract search.

### CMS-ADR-006 — Không đồng bộ ghi khi số liệu Sheet và production chưa khớp

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: Quy tắc vận hành hiện hành
- Bối cảnh: Production có 55 hồ sơ/164 ảnh; dry-run Sheet cho 74 hồ sơ/540 ảnh và 29 ID trùng duy nhất.
- Quyết định: Chỉ cho phép `sync:check`; không chạy `sync:sheet` trước khi có báo cáo diff và backup.
- Lý do: Sync hiện có bước xóa record trùng và upsert hàng loạt, tác động production khó đảo ngược nếu mapping sai.
- Hệ quả: Giai đoạn tiếp theo phải xây kiểm tra diff không chứa PII và chính sách merge duplicate.

### CMS-ADR-007 — Diff vận hành không xuất dữ liệu hồ sơ

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: Quy tắc bảo mật hiện hành
- Bối cảnh: Điều tra sync cần so sánh ID và field nhạy cảm trong bộ nhớ.
- Quyết định: `sync:diff` chỉ xuất số lượng aggregate; không xuất ID, địa chỉ, điện thoại hoặc nội dung.
- Lý do: Giảm rủi ro PII trong terminal, CI và lịch sử tác vụ.
- Hệ quả: Điều tra record cụ thể nếu cần phải dùng quy trình bảo mật riêng, có mục tiêu và không commit kết quả.

### CMS-ADR-008 — Dùng JSON override trong giai đoạn tương thích

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: Kế hoạch rollout additive
- Bối cảnh: Cần bảo vệ field CMS trước khi có migration column/audit chính thức.
- Quyết định: Tạm lưu whitelist tại `data_json.cms_override_fields`; admin tự đánh dấu khi sửa và sync merge theo whitelist.
- Lý do: Không đòi hỏi DDL production, có thể unit test và tương thích API hiện tại.
- Hệ quả: Cần migration về cấu trúc chính thức và công cụ bỏ override trong CMS sau này.

### CMS-ADR-009 — Sync không hard-delete duplicate

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: Quy tắc soft-delete hiện hành
- Bối cảnh: Sync cũ chủ động xóa record production bị coi là duplicate theo địa chỉ.
- Quyết định: Chỉ bỏ qua duplicate loser trong lô nguồn; không xóa record hoặc ảnh production.
- Lý do: Hard delete phá audit, liên kết CRM và khả năng khôi phục.
- Hệ quả: Duplicate production cần workflow merge/archive riêng có audit trong CMS.

### CMS-ADR-010 — Migration CMS đầu tiên chỉ additive

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: Kế hoạch rollout an toàn
- Bối cảnh: Public API và UI hiện phụ thuộc `properties.status` legacy.
- Quyết định: Migration đầu thêm column/bảng/index mới, giữ nguyên status và mọi column cũ; cutover read path ở release riêng.
- Lý do: Cho phép rollback ứng dụng và đối chiếu dữ liệu trước khi bỏ compatibility.
- Hệ quả: Có giai đoạn hai hệ trạng thái cùng tồn tại và cần contract test mapping.

### CMS-ADR-011 — Authorization theo action, không theo UI

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: Security contract
- Bối cảnh: Nhiều endpoint và role sẽ làm kiểm tra role trực tiếp trong từng handler khó nhất quán.
- Quyết định: Handler gọi permission guard bằng action chuẩn; role-to-action mapping nằm ở service dùng chung.
- Lý do: Dễ test deny-by-default và tránh coi ẩn nút UI là authorization.
- Hệ quả: Mỗi API mới phải khai báo action và có negative contract test.

### CMS-ADR-012 — Audit builder không nhận secret

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: Security contract
- Bối cảnh: Mutation request có thể chứa cookie/token hoặc cấu hình nhạy cảm.
- Quyết định: Audit payload được sanitize đệ quy; timestamp do database tạo.
- Lý do: Tránh biến audit log thành kho secret lâu dài.
- Hệ quả: Field redaction phải được cập nhật khi có loại credential mới.

### CMS-ADR-013 — Xác minh access token với Supabase Auth server

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: Security contract
- Bối cảnh: CMS API cần principal đáng tin cậy từ access token.
- Quyết định: Gọi `GET /auth/v1/user` với publishable key và Bearer token, sau đó tải active profile server-side.
- Lý do: Auth server trả user đã được xác minh; không tin JWT payload chưa verify.
- Hệ quả: Mỗi request CMS có thêm network hop; có thể chuyển sang JWKS verification/cache sau khi đo latency và giữ quy trình revoke phù hợp.

### CMS-ADR-014 — Endpoint CMS đầu tiên chỉ trả principal tối thiểu

- Ngày: 2026-08-29
- Trạng thái: Approved
- Người duyệt: API security contract
- Bối cảnh: UI cần biết người dùng và role sau khi xác thực.
- Quyết định: `/api/admin/v1/me` chỉ trả `id`, `displayName`, `role`; không trả email, token hoặc trạng thái nội bộ.
- Lý do: Giảm dữ liệu nhạy cảm và tạo contract nhỏ, ổn định cho route guard.
- Hệ quả: Thông tin hồ sơ mở rộng phải dùng endpoint/quyền riêng nếu phát sinh nhu cầu.
