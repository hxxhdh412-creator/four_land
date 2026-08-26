# API Agent Notes

- Mỗi file `api/*.js` là một Vercel serverless handler.
- Dùng `_supabase.js` cho configuration, query và error response.
- Route quản trị phải gọi `requireAdmin(req,res)` trước đọc/ghi dữ liệu nhạy cảm.
- Validate method trước, validate input sau, rồi mới truy vấn.
- Không nối trực tiếp input chưa làm sạch vào PostgREST `or` expression; dùng `safeSearch`, `text`, `URLSearchParams`.
- Public list/detail không được trả hồ sơ `archived`.
- Không trả stack trace, key, config hoặc raw lỗi dài về client.
- Giữ response thống nhất: `{ ok: true, ... }` hoặc `{ ok: false, error }`.
- Nếu thêm route, cập nhật `preview-server.js` và tài liệu API/data liên quan.
- Khi nghiệp vụ bắt đầu bị lặp giữa nhiều handler, chuyển logic sang `server/services` hoặc `server/repositories`.

