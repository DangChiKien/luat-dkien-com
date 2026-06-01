# Trợ lý AI hỏi-đáp pháp luật — (TẠM DỪNG, chưa deploy)

Phần backend cho tính năng "hỏi Claude ngay trên luat.dkien.com". **Đã viết code nhưng
tạm dừng** (chưa deploy, chưa gắn vào site) — để dành dùng lại sau.

## Có gì trong này
- `luat-worker.js` — Cloudflare Worker: giữ Anthropic API key (qua secret), nhận câu hỏi,
  RAG 2 bước (chọn điều liên quan → lấy nguyên văn → trả lời có trích dẫn), stream về trình duyệt.
  Dùng model `claude-haiku-4-5`, có prompt caching cho chỉ mục điều luật.
- `gen-search-index.js` — sinh `/search-index.json` (663 điều: slug, số điều, tên, từ khóa, file)
  từ `laws.json` + các `manifest.json`. Worker fetch file này để định tuyến.

## Quyết định đã chốt (để khỏi bàn lại)
- **Billing tách biệt:** phí API **không** gộp vào gói Claude.ai (Pro/Max). Cần tài khoản
  console.anthropic.com riêng + nạp credit + đặt trần chi tiêu. Haiku + caching ⇒ vài cents/câu.
- **Bảo mật chống lạm dụng:** đặt sau **mật khẩu** (Worker secret `ACCESS_PASSWORD`, mỗi request
  phải kèm đúng mật khẩu) — hoặc nâng cấp **Cloudflare Access** (đăng nhập email/Google, ≤50 người free).
- Worker chưa có đoạn kiểm tra `ACCESS_PASSWORD` — thêm khi nối lại.

## Cách nối lại sau này
1. `node worker/gen-search-index.js` → tạo `search-index.json` ở gốc (Worker đọc qua `SITE/search-index.json`).
2. Tạo Cloudflare Worker (dashboard), dán `luat-worker.js`, thêm secret `ANTHROPIC_API_KEY`
   (và `ACCESS_PASSWORD` nếu dùng cổng mật khẩu). Lấy URL Worker.
3. Dựng trang riêng (vd `tro-ly/`) có ô mật khẩu + khung chat; gọi tới URL Worker; hiển thị
   text stream + khối nguồn (` SOURCES `).
4. (Tùy chọn) đặt trang + Worker sau Cloudflare Access để đăng nhập thật.

> Lưu ý: thư mục này được commit để lưu trữ; GitHub Pages có phục vụ file tĩnh ở đây nhưng
> chúng vô hại (không chứa secret — key chỉ nằm trong Worker secret trên Cloudflare).
