# 02 — Kiến trúc mục tiêu

Trạng thái: Draft

## Kiến trúc đề xuất

```text
Zalo Listener (VPS, duy nhất)
  → Google Sheet / sync job
  → Supabase PostgreSQL + Storage
       ├─ Public API → Public web + SEO
       └─ Admin API → CMS /admin
                       ├─ Auth + RBAC
                       ├─ Property workflow
                       ├─ Audit log
                       └─ Reporting
```

## Quyết định nền tảng

- Giữ public web hiện tại để giảm rủi ro SEO và regression.
- CMS chạy tại `/admin`; có bundle và router riêng, không nhúng tiếp vào `assets/app.js`.
- Supabase là nguồn dữ liệu dùng chung, nhưng public và admin dùng API/quyền khác nhau.
- `api/*.js` chỉ là adapter Vercel mỏng; nghiệp vụ đi vào `server/repositories`, `server/services`, `server/validators`.
- Search, sort, filter và pagination thực hiện tại PostgreSQL/RPC.
- Tác vụ lâu như kiểm ảnh, báo cáo định kỳ và cảnh báo chuyển sang scheduled job/queue.

## Cấu trúc mã mục tiêu

```text
warehouse-web/
  admin/
    index.html
    src/
      api/
      auth/
      components/
      features/
      pages/
      state/
  api/
    public-*.js
    admin-*.js
  server/
    repositories/
    services/
    validators/
    authorization/
  supabase/
    migrations/
  test/
    unit/
    integration/
    contract/
```

Tên route hiện hữu chưa cần đổi ngay. Việc chuẩn hóa route phải có lớp tương thích để public web không gián đoạn.

## Ranh giới trách nhiệm

| Lớp | Được làm | Không được làm |
|---|---|---|
| CMS UI | Hiển thị, nhập liệu, gọi admin API | Giữ service key, tự quyết authorization |
| API adapter | Parse request, gọi service, trả response | Chứa query/logic nghiệp vụ dài |
| Service | Workflow, permission nghiệp vụ, transaction | Render UI |
| Repository | Query Supabase/PostgreSQL | Quyết định quyền người dùng |
| Sync | Upsert dữ liệu nguồn và ghi metadata nguồn | Ghi đè field CMS được bảo vệ |

## Tương thích dữ liệu đồng bộ

Phải định nghĩa quyền sở hữu từng field:

- `source_owned`: Zalo/Sheet có thể cập nhật.
- `cms_owned`: chỉ CMS cập nhật.
- `derived`: database/job tính toán.
- `protected_override`: nguồn cập nhật trừ khi CMS đã khóa override.

Sync phải lưu `source_updated_at`, `last_synced_at` và kết quả lần sync. Không dùng `updated_at` duy nhất để suy đoán nguồn thay đổi.

## Yêu cầu phi chức năng

- Mobile dùng được ở 393 × 852; desktop tối ưu cho bảng dữ liệu.
- API list p95 mục tiêu dưới 800 ms ở tập 10.000 hồ sơ trên staging.
- Mọi mutation idempotent khi phù hợp và có correlation/request ID.
- Không phụ thuộc HTTP request dài cho tác vụ nền.
- Có health check riêng cho database, storage và sync freshness.
