# 07 — Lộ trình triển khai

Trạng thái: Draft

Mốc thời gian chỉ được ước lượng sau khi chốt phạm vi, số người thực hiện và môi trường staging. Thứ tự dưới đây là dependency kỹ thuật, không phải cam kết ngày giao.

## Giai đoạn 0 — Baseline và đo hiện trạng

- Chụp schema production thành baseline migration có thể review.
- Ghi số lượng record theo status, ảnh và inquiry.
- Bổ sung test bảo vệ public list/detail, admin auth, archive và tombstone.
- Sửa lỗi search hiện hữu và thiết lập staging.
- Chốt owner của từng field giữa sync và CMS.

Gate: baseline không làm đổi production; test hiện trạng xanh.

## Giai đoạn 1 — Nền tảng backend CMS

- Thêm schema trạng thái mới, profiles, assignments, audit, sync runs, quality issues.
- Backfill có báo cáo sai lệch.
- Supabase Auth, RBAC và RLS.
- Tách repository/service/validator.
- Admin API v1, optimistic locking và audit transaction.

Gate: contract/security test xanh; public web vẫn giữ hành vi đã duyệt.

Tiến độ: migration additive đầu tiên cho trạng thái, profiles, audit và version đã được tạo ở trạng thái review-only. Chưa áp dụng staging/production; assignments history, sync runs và quality issues còn ở migration sau.

RBAC action matrix, permission guard, sensitive property masking, audit event builder và adapter xác minh Supabase access token/active profile đã được triển khai/test độc lập. Bước còn lại của lớp auth là áp dụng migration trên staging, tạo user/profile thử nghiệm và gắn `requireCms` vào endpoint nghiệp vụ đầu tiên.

Endpoint đầu tiên `GET /api/admin/v1/me` đã dùng `requireCms`, chỉ trả `id`, `displayName`, `role`, đặt cache `private, no-store` và đã được kiểm tra qua preview server. Chưa có token/profile production nên chưa kích hoạt cho người dùng thật.

Admin shell `/admin` đã được tách khỏi public bundle, nối route guard `/api/admin/v1/me`, có auth/loading/error/empty states và responsive navigation. Dashboard đã nối endpoint tổng hợp read-only, hiển thị KPI từ schema hiện tại và có chế độ tương thích legacy. Preview local dùng token chỉ được chấp nhận trên `localhost`/`127.0.0.1`; production vẫn yêu cầu Supabase Auth. Chưa cho phép mutation.

Danh sách kho CMS read-only đã có tìm kiếm, lọc trạng thái/chất lượng, phân trang server-side, ảnh đại diện và cảnh báo thiếu dữ liệu. DTO danh sách loại bỏ SĐT, raw text, source identifiers và `data_json`; UI đã kiểm tra với dữ liệu Supabase thật. Chi tiết/editor và mutation vẫn bị khóa.

Drawer chi tiết hồ sơ read-only đã được nối từ danh sách, gồm gallery, thông tin bất động sản và thông tin vận hành. Điện thoại, hoa hồng và nội dung nguồn chỉ xuất hiện với role có `property.sensitive.read`; viewer nhận DTO đã mask. Editor và toàn bộ mutation vẫn bị khóa.

Form biên tập thử đã được thêm vào drawer cho manager/editor. Endpoint `validate` chỉ chuẩn hóa field allowlist, trả field errors, quality warnings, changed fields và kiểm tra `expectedUpdatedAt`; không gọi PATCH/UPDATE. Luồng hợp lệ, lỗi số điện thoại và cảnh báo thiếu ảnh đã được kiểm tra trên local với hồ sơ thật.

Trang “Chờ biên tập” đã nối hàng đợi read-only, tổng hợp lỗi địa chỉ/giá/ảnh và xếp hồ sơ lỗi nặng lên trước. Người vận hành có thể mở hồ sơ trực tiếp từ hàng đợi vào drawer và form biên tập thử. Dữ liệu hiện tại có 23 hồ sơ cần xử lý, đều liên quan số lượng ảnh.

Trang “Đồng bộ & dữ liệu” đã thay số liệu tĩnh bằng health API read-only. UI hiện số hồ sơ/ảnh Supabase, phân bố status, schema legacy/CMS, trạng thái quyền ghi và các rollout blocker. Hiện có 55 hồ sơ, 164 ảnh; migration CMS, CMS mutations và Sheet sync write vẫn đang khóa.

Backend mutation đã sẵn sàng ở trạng thái khóa mặc định: save draft và workflow dùng RPC transaction, `SELECT ... FOR UPDATE`, optimistic version, field allowlist, RBAC và audit log trong cùng transaction. Chỉ `service_role` được execute RPC. Rollback riêng chỉ gỡ function, không xóa hồ sơ/audit. UI hiển thị “Lưu bản nháp · đang khóa” cho đến khi rollout gate đạt.

## Giai đoạn 2 — CMS MVP

- Shell `/admin`, session và route guards.
- Dashboard.
- Danh sách kho server-side.
- Editor, workflow duyệt/xuất bản, phân công.
- Quản lý ảnh/tombstone và audit timeline.
- Theo dõi sync/quality.

Gate: UAT theo vai trò, desktop/mobile, accessibility cơ bản và performance target.

## Giai đoạn 3 — Rollout an toàn

- Chạy nội bộ với nhóm nhỏ và feature flag.
- Ghi song song/đối chiếu trạng thái cũ-mới nếu cần.
- Theo dõi lỗi, audit, latency và dữ liệu public.
- Ngừng admin mode cũ sau thời gian ổn định.

Gate: không có sai lệch public/archive/PII; rollback đã diễn tập.

## Giai đoạn 4 — CRM và tự động hóa

- Contacts, leads, tasks, pipeline.
- Ghép lead với bất động sản.
- Saved views/export/báo cáo.
- Cảnh báo dữ liệu cũ, ảnh lỗi và thông báo vận hành.

## Definition of Ready cho một hạng mục

- User story và role rõ.
- Acceptance criteria đo được.
- API/schema/permission đã xác định.
- Có trạng thái loading, empty, error và conflict.
- Đã đánh giá ảnh hưởng sync, public API, SEO và mobile.

## Definition of Done

- Code, migration và tài liệu cùng nhất quán.
- Unit, integration, contract và regression liên quan đều đạt.
- Không có secret/PII trong log hoặc bundle.
- UAT theo role đạt.
- Có monitoring, rollout và rollback tương xứng rủi ro.
- `npm run check`, `npm test` và `npm run sync:check` đạt khi phạm vi yêu cầu.

## Đơn vị triển khai khuyến nghị

Mỗi pull request chỉ nên gồm một lát dọc có thể kiểm thử, ví dụ “list properties API + permission + contract test”, không gom schema, toàn bộ CMS UI và refactor public web trong một lần.
