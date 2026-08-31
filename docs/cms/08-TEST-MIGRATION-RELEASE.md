# 08 — Kiểm thử, migration và phát hành

Trạng thái: Draft

## Chiến lược môi trường

- Local: fixture giả, không chạy listener Zalo khi VPS đang giữ phiên.
- Staging: project/database riêng hoặc dữ liệu đã ẩn danh; dùng để migration rehearsal và UAT.
- Production: chỉ deploy sau backup và approval theo checklist.

Không dùng `sync:sheet` trên dữ liệu thật để thử tính năng CMS.

## Test pyramid

### Unit

- Validator, permission matrix, state transition.
- Field ownership/override và mapping trạng thái cũ-mới.
- Search parser và format dữ liệu.

### Integration

- Repository với database test.
- Transaction mutation + audit.
- Upload/tombstone ảnh.
- Sync không ghi đè archive/override.

### Contract

- Request/response, status code và error code.
- Public data masking.
- Mỗi role và route mutation.
- Pagination/filter/sort tại database.

### End-to-end

- Login → sửa draft → submit → manager publish → public nhìn thấy.
- Archive/restore và ảnh tombstone.
- Version conflict giữa hai người sửa.
- Bulk action có lỗi một phần.
- Người bị vô hiệu hóa mất quyền.

## Migration checklist

### Trước khi chạy

- Migration file mới, không sửa migration đã áp dụng.
- Backup có timestamp và xác nhận khả năng restore.
- Ghi row count/checksum hoặc truy vấn đối chiếu quan trọng.
- Ước lượng lock/downtime; index lớn dùng cách an toàn phù hợp.
- Script backfill chạy lại không tạo sai lệch.
- Rollback hoặc forward-fix được viết và diễn tập staging.

### Sau khi chạy

- So sánh row count và trạng thái.
- Kiểm tra public API không lộ draft/archive/PII.
- Kiểm tra admin API, RLS và audit.
- Kiểm tra sync dry-run và tombstone.
- Theo dõi error rate, latency và database trong cửa sổ quan sát.

## Release strategy

- Feature flag cho CMS và workflow mới.
- Release theo thứ tự: additive schema → backend compatible → CMS UI → chuyển read path → dọn compatibility.
- Không deploy migration phá vỡ và code phụ thuộc nó trong một bước không rollback được.
- Static asset thay đổi phải đổi version cache theo quy trình hiện tại.

## Rollback triggers

- Public xuất hiện hồ sơ không được publish hoặc archived.
- Rò rỉ số điện thoại/dữ liệu nội bộ cho anonymous.
- Mutation không tạo audit hoặc ghi sai người thực hiện.
- Sync phục hồi ảnh tombstone/ghi đè override CMS.
- Error rate hoặc latency vượt ngưỡng đã chốt.

## Báo cáo phát hành bắt buộc

- Commit/release và migration đã áp dụng.
- Backup và đường dẫn/ID có thể truy xuất.
- Kết quả check/test/UAT.
- Row counts trước/sau.
- Trạng thái public web, CMS, Supabase, Storage, Zalo Sync và Google Sheet riêng biệt.
- Người quyết định go/no-go và thời gian kết thúc theo dõi.
