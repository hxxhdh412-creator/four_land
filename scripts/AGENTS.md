# Data Sync Agent Notes

- `sync-sheet-to-supabase.js` là relay một chiều Sheet → Supabase bằng upsert.
- Không đổi header mapping nếu chưa đối chiếu `docs/DATA_MODEL.md` và Sheet thật.
- Luôn giữ `property_id` làm identity ổn định; xử lý duplicate `send_id` như hiện tại.
- Bảo toàn `status=archived` và tombstone ảnh `storage_path=hidden:*`.
- Không hard-delete Supabase để “làm sạch” trong sync.
- Chạy `npm run sync:check` trước; chỉ chạy `npm run sync:sheet` khi người dùng yêu cầu ghi thật.
- Log chỉ số lượng và trạng thái; không log secret hoặc toàn bộ hồ sơ cá nhân.

