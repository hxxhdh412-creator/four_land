# Kết quả rà soát cấu trúc

Ngày rà soát: 2026-08-26.

## Đánh giá hiện tại

### Điểm tốt

- Frontend không giữ Supabase secret; dữ liệu đi qua serverless API.
- Admin dùng cookie HttpOnly có chữ ký và thời hạn.
- Danh sách có phân trang, lazy image, lọc server-side và giao diện mobile 2 cột.
- Luồng archive/tombstone tránh dữ liệu bị Sheet tạo lại sau khi người dùng ẩn.
- Vercel, local preview và sync script có ranh giới tương đối rõ.

### Nợ kỹ thuật đã nhận diện

1. `assets/app.js` còn là file đơn khối, render HTML bằng template string dài.
2. `assets/app.css` có nhiều lớp override lịch sử; cascade khó dự đoán nếu tiếp tục nối rule ở cuối.
3. `preview-server.js` sao chép một phần logic Vercel API, có nguy cơ lệch hành vi.
4. Chưa có test tự động cho repository/service và contract API; hiện mới có syntax/smoke check.
5. Search dùng nhiều `ilike`; phù hợp vài nghìn hồ sơ nhưng cần FTS/trigram khi tăng lên hàng chục nghìn.
6. Schema production chưa có baseline migration được lưu trong repo.

## Lộ trình đề xuất

### P0 — đã thực hiện trong đợt này

- Thêm `AGENTS.md` ở root và từng khu vực.
- Thêm tài liệu kiến trúc, data contract, brand và vận hành.
- Thêm `.editorconfig`, `npm run dev`, `npm run check`.
- Chuẩn hóa token font/spacing nền tảng mà không đổi giao diện.

### P1 — nên làm trước tính năng lớn tiếp theo

- Tách `app.js` thành ES modules theo mô hình trong `ARCHITECTURE.md`.
- Tách CSS thành tokens/base/components/responsive và xóa override trùng sau visual regression test.
- Tách Supabase repository/service dùng chung cho API và preview.
- Tạo test cho search params, archive/restore, tombstone và admin authorization.

### P2 — khi dữ liệu vượt khoảng 10.000 hồ sơ

- Thêm PostgreSQL full-text search không dấu và `pg_trgm` cho địa chỉ/số điện thoại.
- Dùng RPC search có ranking thay cho biểu thức `or ilike` dài.
- Cache facets và kết quả phổ biến; theo dõi thời gian API p50/p95.
- Tạo job kiểm tra ảnh hỏng, record trùng và dữ liệu thiếu trường.

### P3 — khi có nhiều nhân viên/quản trị viên

- Thay mã quản trị dùng chung bằng Supabase Auth hoặc SSO.
- Thêm role, audit log và lịch sử chỉnh sửa từng hồ sơ.
- Tách public portal và admin console nếu quyền nghiệp vụ phát triển.

## Nguyên tắc refactor

Không thực hiện P1/P2 bằng một lần viết lại lớn. Mỗi lần tách phải giữ nguyên API/UI, có test trước và sau, rồi mới xóa code cũ. Đây là cách giảm rủi ro cho hệ thống đang vận hành thật.

