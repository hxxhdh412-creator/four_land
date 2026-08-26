# Fourland Property Warehouse

Kho tra cứu bất động sản Fourland, tối ưu cho điện thoại và triển khai trên Vercel với Supabase.

## Kiến trúc ngắn gọn

```text
Zalo listener → Google Sheet → sync script → Supabase → Vercel API → Web Fourland
```

- Google Sheet: tiếp nhận và kiểm tra dữ liệu đầu vào.
- Supabase: nguồn dữ liệu phục vụ tìm kiếm và hình ảnh web.
- Vercel: hosting frontend và API serverless.
- `preview-server.js`: môi trường kiểm tra local có cùng các route chính.

## Chạy local

```powershell
Copy-Item .env.example .env.local
npm run dev
```

Mở `http://127.0.0.1:4175/`.

## Kiểm tra

```powershell
npm run check
npm run sync:check
```

`sync:check` chỉ đọc và phân tích Google Sheet. `sync:sheet` ghi dữ liệu thật sang Supabase, chỉ chạy khi đã xác nhận cấu hình và dữ liệu.

## Tài liệu

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Mô hình dữ liệu](docs/DATA_MODEL.md)
- [Hệ thống thương hiệu](docs/BRAND_SYSTEM.md)
- [Phát triển và triển khai](docs/DEVELOPMENT.md)
- [Kết quả rà soát và lộ trình](docs/REVIEW_FINDINGS.md)
