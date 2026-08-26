# Phát triển, kiểm tra và triển khai

## Cấu hình môi trường

Tạo `.env.local` từ `.env.example`. Không commit `.env.local`.

| Biến | Nơi dùng | Ghi chú |
|---|---|---|
| `SUPABASE_URL` | API, preview, sync | URL project |
| `SUPABASE_SECRET_KEY` | Chỉ server | Tuyệt đối không đưa frontend |
| `ADMIN_ACCESS_CODE` | API/preview | Tối thiểu 6 ký tự |
| `ADMIN_SESSION_SECRET` | Vercel API | Chuỗi ngẫu nhiên ≥32 ký tự |
| `GOOGLE_SHEET_ID` | Sync | ID Sheet, không phải URL đầy đủ |
| `GOOGLE_SHEET_GID` | Sync | ID tab dữ liệu |

## Lệnh chuẩn

```powershell
npm run dev          # local preview tại 127.0.0.1:4175
npm run check        # kiểm tra cú pháp và file bắt buộc
npm run sync:check   # đọc Sheet, không ghi Supabase
npm run sync:sheet   # ghi thật, chỉ chạy có chủ đích
```

## Checklist trước commit

1. `git diff --check` không lỗi.
2. `npm run check` thành công.
3. `npm run sync:check` thành công nếu đụng data mapping.
4. Kiểm tra tìm kiếm, mở popup và card ở desktop.
5. Kiểm tra 393 × 852: lưới 2 cột, không overflow, popup cuộn được.
6. Nếu đụng admin: login, sửa, thêm/xóa ảnh, archive/restore.
7. Không có secret hay dữ liệu cá nhân mới trong diff.

## Triển khai

- Nhánh production: `main`.
- Push GitHub sẽ kích hoạt Vercel nếu project đã kết nối repo.
- Static assets đang dùng cache dài; mỗi lần thay CSS/JS phải đổi query version trong `index.html`.
- Sau deploy kiểm tra route `/api/properties?page=1&pageSize=1` và trang chính.

## Quy ước commit

- `feat:` tính năng mới.
- `fix:` sửa lỗi.
- `refactor:` thay cấu trúc không đổi hành vi.
- `docs:` chỉ tài liệu.
- `chore:` cấu hình/công cụ.

Commit phải mô tả một thay đổi logic; tránh gom chỉnh giao diện, schema và sync không liên quan vào cùng commit.

