# Fourland Warehouse — Agent Instructions

Đọc file này trước khi sửa bất kỳ phần nào của dự án.

## Mục tiêu sản phẩm

Fourland Warehouse là web tra cứu bất động sản TP.HCM. Google Sheet là nguồn tiếp nhận/trung chuyển; Supabase là database phục vụ web; Vercel chạy frontend tĩnh và serverless API.

## Tài liệu bắt buộc

1. `docs/ARCHITECTURE.md` — ranh giới hệ thống và luồng dữ liệu.
2. `docs/DATA_MODEL.md` — hợp đồng dữ liệu Supabase, trạng thái ẩn và ảnh.
3. `docs/BRAND_SYSTEM.md` — màu, font, khoảng cách và responsive.
4. `docs/DEVELOPMENT.md` — cách chạy, kiểm tra và triển khai.
5. `docs/REVIEW_FINDINGS.md` — nợ kỹ thuật và lộ trình refactor an toàn.

Khi làm trong thư mục con, đọc thêm `AGENTS.md` gần file đó nhất.

## Nguyên tắc không được phá vỡ

- Không đưa `SUPABASE_SECRET_KEY`, mã quản trị hoặc session secret vào frontend, log, Git hay URL.
- Frontend chỉ gọi `/api/*`; không gọi Supabase bằng secret key từ trình duyệt.
- Mọi API quản trị phải dùng `requireAdmin`.
- Xóa hồ sơ là soft delete bằng `status = archived`; không hard-delete hồ sơ từ UI.
- Xóa ảnh dùng tombstone `storage_path = hidden:*` để Google Sheet không đồng bộ ảnh trở lại.
- API danh sách công khai luôn loại `status = archived`.
- Ảnh Google Drive chỉ gỡ tham chiếu; không xóa file nguồn.
- Giữ giao diện mobile-first, không tạo cuộn ngang ở 360–430 px.
- Dùng duy nhất `Be Vietnam Pro` cho chữ tiếng Việt.

## Quy trình cho mọi thay đổi

1. Đọc tài liệu và file liên quan trước khi sửa.
2. Giữ thay đổi nhỏ, đúng phạm vi; không viết lại phần ổn định nếu không cần.
3. Nếu đổi schema/API/data mapping, cập nhật `docs/DATA_MODEL.md` trong cùng commit.
4. Nếu đổi màu/font/component/responsive, cập nhật `docs/BRAND_SYSTEM.md` trong cùng commit.
5. Chạy `npm run check` và `npm run sync:check` trước khi commit.
6. Kiểm tra tối thiểu ở desktop và viewport mobile 393 × 852.
7. Không chạy `npm run sync:sheet` trên dữ liệu thật chỉ để thử nghiệm.

## Hướng mở rộng ưu tiên

- Khi `assets/app.js` vượt quá mức dễ đọc, tách theo `assets/js/{api,state,search,detail,admin}.js` và dùng ES modules.
- Khi CSS tiếp tục tăng, tách theo `assets/css/{tokens,base,layout,components,responsive}.css`; thứ tự import phải cố định.
- Logic dùng chung giữa Vercel API và preview server nên chuyển vào `server/` thay vì sao chép.
- Mọi tính năng mới phải có trạng thái loading, empty, error và quyền truy cập rõ ràng.
