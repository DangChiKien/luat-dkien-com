# Thư viện Văn bản Pháp luật — luat.dkien.com

Trang web tĩnh (GitHub Pages) phục vụ tại **https://luat.dkien.com**, hoạt động đồng thời như một công cụ tra cứu cho người dùng lẫn nguồn dữ liệu pháp luật thân thiện với AI.

---

## Nội dung hiện có

| Văn bản | Số hiệu | Chương | Điều |
|---|---|---|---|
| Luật Nhà ở 2023 | 27/2023/QH15 | 13 | 198 |

---

## Cấu trúc thư mục

```
/
├── index.html          # Trang chủ (giao diện tra cứu)
├── style.css           # Stylesheet toàn trang
├── script.js           # Logic trang chủ
├── index.md            # Chỉ mục máy đọc được (machine-readable) — danh sách tất cả văn bản
├── ai-guide.md         # Hướng dẫn dùng với AI
│
└── luat-nha-o-2023/    # Mỗi luật nằm trong một thư mục riêng
    ├── index.html      # Giao diện tra cứu riêng cho luật này
    ├── app.js          # Logic đọc và hiển thị nội dung
    ├── manifest.json   # Siêu dữ liệu (tên, số hiệu, danh sách chương)
    ├── chi-muc.md      # Mục lục văn bản (machine-readable)
    ├── chuong-01.md    # Nội dung từng chương
    ├── chuong-02.md
    └── ...chuong-13.md
```

---

## Xem trên máy cục bộ

Vì trang đọc file qua `fetch()`, bạn phải chạy một máy chủ tĩnh — mở trực tiếp file HTML sẽ không hoạt động.

```bash
# Cách 1 — npx serve (Node.js)
npx serve .

# Cách 2 — Python
python -m http.server 8000
```

Sau đó truy cập `http://localhost:8000` trên trình duyệt.

---

## Triển khai

Trang được deploy bằng **GitHub Pages**. Tên miền tùy chỉnh `luat.dkien.com` được cấu hình qua file `CNAME` trong thư mục gốc của repo.

---

## Thêm một luật mới

1. Tạo thư mục mới theo mẫu `luat-ten-luat-nam/` (ví dụ: `luat-dat-dai-2024/`).
2. Sao chép toàn bộ cấu trúc từ `luat-nha-o-2023/` vào thư mục mới.
3. Chỉnh sửa `manifest.json` (tên, số hiệu, danh sách chương) và thay thế nội dung các file `chuong-XX.md`.
4. Thêm một dòng tương ứng vào `index.md` ở thư mục gốc để cập nhật chỉ mục toàn bộ thư viện.
5. Thêm liên kết vào `index.html` trang chủ nếu cần hiển thị trên giao diện.

---

## Dùng với AI

Xem file **`ai-guide.md`** để biết cách trỏ AI đến từng endpoint (manifest, chi muc, chuong) nhằm tra cứu hoặc phân tích văn bản pháp luật một cách tự động.

---

## Tuyên bố miễn trừ trách nhiệm

Nội dung được số hóa để thuận tiện tra cứu. Giá trị pháp lý chính thức thuộc về văn bản gốc do cơ quan nhà nước có thẩm quyền ban hành.
