# Phát triển, kiểm tra và triển khai

## Cấu hình môi trường

Tạo `.env.local` từ `.env.example`. Không commit `.env.local`.

| Biến | Nơi dùng | Ghi chú |
|---|---|---|
| `SUPABASE_URL` | API, preview, sync | URL project |
| `SUPABASE_SECRET_KEY` | Chỉ server | Tuyệt đối không đưa frontend |
| `SUPABASE_PUBLISHABLE_KEY` | Auth adapter/CMS client | Khóa publishable, không thay thế secret server |
| `ADMIN_ACCESS_CODE` | API/preview | Tối thiểu 6 ký tự |
| `ADMIN_SESSION_SECRET` | Vercel API | Chuỗi ngẫu nhiên ≥32 ký tự |
| `GOOGLE_SHEET_ID` | Sync | ID Sheet, không phải URL đầy đủ |
| `GOOGLE_SHEET_GID` | Sync | ID tab dữ liệu |

## Lệnh chuẩn

```powershell
npm run dev          # local preview tại 127.0.0.1:4175
npm run check        # kiểm tra cú pháp và file bắt buộc
npm test             # kiểm tra URL, HTML SEO và sitemap
npm run sync:check   # đọc Sheet, không ghi Supabase
npm run sync:sheet   # ghi thật, chỉ chạy có chủ đích
```

## Checklist trước commit

1. `git diff --check` không lỗi.
2. `npm run check` thành công.
3. `npm run sync:check` thành công nếu đụng data mapping.
4. Kiểm tra tìm kiếm, mở popup và card ở desktop.
5. Kiểm tra 393 × 852: lưới 2 cột, không overflow, popup cuộn được.
6. Mở một card trong tab mới: URL `/bat-dong-san/...`, nội dung hiện ngay khi không chạy JavaScript, canonical đúng và không lộ số nhà/SĐT nguồn.
7. Mở `/sitemap.xml`: trả XML động, có URL hồ sơ public và không chứa hồ sơ archived hoặc URL nhạy cảm.
8. Nếu đụng admin: login, sửa, thêm/xóa ảnh, archive/restore.
9. Không có secret hay dữ liệu cá nhân mới trong diff.

## Triển khai

- Nhánh production: `main`.
- Push GitHub sẽ kích hoạt Vercel nếu project đã kết nối repo.
- Static assets đang dùng cache dài; mỗi lần thay CSS/JS phải đổi query version trong `index.html`.
- Sau deploy kiểm tra route `/api/properties?page=1&pageSize=1`, trang chính, một URL hồ sơ và `sitemap.xml`.

## Quy ước commit

- `feat:` tính năng mới.
- `fix:` sửa lỗi.
- `refactor:` thay cấu trúc không đổi hành vi.
- `docs:` chỉ tài liệu.
- `chore:` cấu hình/công cụ.

Commit phải mô tả một thay đổi logic; tránh gom chỉnh giao diện, schema và sync không liên quan vào cùng commit.
