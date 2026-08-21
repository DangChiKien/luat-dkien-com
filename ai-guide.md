# Hướng Dẫn Sử Dụng luat.dkien.com Cho AI Models

> **Dành cho:** Claude, GPT, Gemini và các AI model khác khi cần tra cứu văn bản pháp luật Việt Nam.

---

## 1. Giới Thiệu Repository

**luat.dkien.com** là kho tra cứu văn bản pháp luật Việt Nam được số hóa theo định dạng Markdown, tối ưu cho LLM fetch theo từng phần nhỏ thay vì tải toàn bộ văn bản.

- Site root: `https://luat.dkien.com`
- Định dạng: Markdown thuần, không cần JavaScript, dễ fetch và parse
- Nội dung hiện có: **11 văn bản** thuộc 3 lĩnh vực — **Đấu thầu** (Luật Đấu thầu 2023 và bản hợp nhất 22+57+90, Luật sửa đổi 57/2024 & 90/2025, Nghị định 214/2025, Thông tư 79/2025 & 80/2025), **Nhà ở** (Luật Nhà ở 2023, Thông tư 05/2024 và Quy chế quản lý nhà chung cư) và **Dân sự** (Bộ luật Dân sự 2015). Danh sách đầy đủ + đường dẫn luôn cập nhật ở `https://luat.dkien.com/index.md`.

> **Lưu ý pháp lý:** Đây là bản số hóa phục vụ tra cứu tiện lợi. Giá trị pháp lý chính thức thuộc về bản gốc đăng trên Công báo nước Cộng hòa xã hội chủ nghĩa Việt Nam.

---

## 2. Kiến Trúc 3 Tầng (3-Tier Design)

### Tại Sao Thiết Kế 3 Tầng?

LLM bị giới hạn context window và chi phí token. Tải toàn bộ một bộ luật (hàng trăm điều) vào một lần fetch là lãng phí và thường vượt giới hạn. Kiến trúc 3 tầng cho phép AI **xác định chính xác file cần đọc trước khi fetch**, giảm tối đa số lượt gọi mạng xuống còn **tối đa 3 fetch** cho bất kỳ câu hỏi nào.

### Tầng 1 — Root Index (Danh Mục Tổng)

```
https://luat.dkien.com/index.md
```

Liệt kê toàn bộ văn bản pháp luật có trong kho, kèm slug URL và tóm tắt ngắn. AI đọc file này để biết luật nào đang có và đường dẫn tương ứng.

**Dùng khi:** Chưa biết luật cần tra thuộc văn bản nào, hoặc cần xác nhận văn bản có trong kho không.

### Tầng 2 — Chi Mục Luật (Article Index + Keywords)

```
https://luat.dkien.com/{slug}/chi-muc.md
```

Ví dụ: `https://luat.dkien.com/luat-nha-o-2023/chi-muc.md`

Mỗi luật có một file `chi-muc.md` riêng, chứa:
- Danh sách tất cả chương và điều
- Tiêu đề mỗi điều luật
- Từ khóa chủ đề (keywords) giúp tìm kiếm ngữ nghĩa
- Thông tin điều nằm ở file chương nào (`chuong-NN.md`)

**Dùng khi:** Đã biết luật cần tra, cần tìm điều khoản liên quan đến chủ đề cụ thể hoặc số điều cụ thể.

### Tầng 3 — Nội Dung Chương (Full Article Text)

```
https://luat.dkien.com/{slug}/chuong-NN.md
```

Ví dụ: `https://luat.dkien.com/luat-nha-o-2023/chuong-05.md`

Mỗi file chứa nội dung đầy đủ của một chương, với:
- Tiêu đề chương và điều theo định dạng `## Điều N`
- Anchor link dạng `#dieu-N` để trỏ thẳng đến điều cụ thể
- Văn bản pháp luật nguyên gốc, đầy đủ các khoản và điểm

**Dùng khi:** Đã xác định được chương chứa điều cần đọc, cần lấy nội dung đầy đủ.

---

## 3. Quy Trình Tra Cứu (Lookup Workflow)

```
Câu hỏi pháp luật
      |
      v
[Fetch 1] Tầng 1: https://luat.dkien.com/index.md
      |
      | -> Xác định slug của luật liên quan
      v
[Fetch 2] Tầng 2: https://luat.dkien.com/{slug}/chi-muc.md
      |
      | -> Tìm điều/chương liên quan theo từ khóa hoặc số điều
      | -> Xác định file chuong-NN.md cần đọc
      v
[Fetch 3] Tầng 3: https://luat.dkien.com/{slug}/chuong-NN.md
      |
      | -> Đọc nội dung điều luật đầy đủ tại #dieu-N
      v
   Trả lời
```

### Các Bước Chi Tiết

**Bước 1 — Xác định văn bản:**
Fetch `https://luat.dkien.com/index.md`. Đọc danh mục, xác định luật phù hợp với câu hỏi. Ghi nhớ `{slug}` (ví dụ: `luat-nha-o-2023`).

**Bước 2 — Tìm điều khoản:**
Fetch `https://luat.dkien.com/{slug}/chi-muc.md`. Dùng từ khóa trong câu hỏi để lọc ra điều/chương liên quan. Ghi nhớ số chương (ví dụ: `chuong-05`) và số điều (ví dụ: `Điều 34`).

**Bước 3 — Đọc nội dung:**
Fetch `https://luat.dkien.com/{slug}/chuong-NN.md`. Điều hướng đến `## Điều N` hoặc anchor `#dieu-N` để đọc nội dung đầy đủ. Nếu câu hỏi liên quan nhiều chương, fetch thêm file chương tương ứng (mỗi chương 1 fetch bổ sung).

**Tối ưu:** Với hầu hết câu hỏi, chỉ cần đúng 3 fetch là đủ để trả lời chính xác.

---

## 4. Prompt Templates Sẵn Dùng

### (a) Câu Hỏi Pháp Luật Tổng Quát

```
Hãy tra cứu kho pháp luật tại https://luat.dkien.com theo quy trình sau:
1. Fetch https://luat.dkien.com/index.md để xác định văn bản liên quan.
2. Fetch file chi-muc.md của văn bản đó để tìm điều khoản theo từ khóa.
3. Fetch file chương chứa điều khoản để đọc nội dung đầy đủ.
Sau đó trả lời câu hỏi: [CÂU HỎI CỦA BẠN]
Trích dẫn số điều, tên luật và hiệu lực khi trả lời.
```

### (b) Tra Cứu Điều Khoản Cụ Thể

```
Tra cứu nội dung [Điều N] của [Tên Luật] tại luat.dkien.com:
1. Fetch https://luat.dkien.com/index.md xác nhận slug của luật.
2. Fetch https://luat.dkien.com/{slug}/chi-muc.md tìm Điều N thuộc chương nào.
3. Fetch https://luat.dkien.com/{slug}/chuong-NN.md đọc nội dung tại #dieu-N.
Trình bày đầy đủ nội dung điều luật, gồm tất cả các khoản và điểm.
```

Ví dụ điền sẵn cho Luật Nhà ở 2023:
```
Tra cứu nội dung Điều 34 của Luật Nhà ở 2023 tại luat.dkien.com:
1. Fetch https://luat.dkien.com/index.md xác nhận slug "luat-nha-o-2023".
2. Fetch https://luat.dkien.com/luat-nha-o-2023/chi-muc.md tìm Điều 34 thuộc chương nào.
3. Fetch file chương tương ứng, đọc nội dung tại #dieu-34.
Trình bày đầy đủ nội dung điều luật.
```

### (c) Soạn Thảo Văn Bản Cần Căn Cứ Pháp Lý

```
Tôi cần soạn [loại văn bản: hợp đồng/đơn/tờ trình/...] về [chủ đề].
Trước khi soạn, hãy tra cứu căn cứ pháp lý tại https://luat.dkien.com:
1. Fetch https://luat.dkien.com/index.md xác định luật liên quan.
2. Fetch chi-muc.md của luật đó, tìm các điều khoản áp dụng cho [chủ đề].
3. Fetch nội dung các điều khoản cần thiết.
Sau đó soạn văn bản, đặt phần "Căn cứ pháp lý" lên đầu với trích dẫn chính xác
tên luật, số luật, số điều và hiệu lực. Nội dung văn bản phải phù hợp với
quy định đã tra cứu.
```

### (d) Block Dán Vào CLAUDE.md / Project Instructions / Custom GPT Instructions

Sao chép toàn bộ block dưới đây và dán vào `CLAUDE.md`, phần Project Instructions của Claude Projects, hoặc phần System Instructions của Custom GPT:

```markdown
## Nguồn Pháp Luật Việt Nam

Khi người dùng hỏi về pháp luật Việt Nam, hãy tra cứu tại https://luat.dkien.com
theo quy trình 3 bước sau (tối đa 3 lần fetch):

**Bước 1 — Xác định văn bản:**
Fetch https://luat.dkien.com/index.md
Đọc danh mục, chọn luật phù hợp, lấy slug (ví dụ: luat-nha-o-2023).

**Bước 2 — Tìm điều khoản:**
Fetch https://luat.dkien.com/{slug}/chi-muc.md
Tìm điều/chương liên quan bằng từ khóa hoặc số điều.

**Bước 3 — Đọc nội dung:**
Fetch https://luat.dkien.com/{slug}/chuong-NN.md
Đọc nội dung đầy đủ tại section ## Điều N (anchor #dieu-N).

**Quy tắc trả lời:**
- Luôn trích dẫn: tên luật, số luật, số điều, số khoản/điểm cụ thể.
- Ghi rõ hiệu lực (ngày có hiệu lực).
- Nếu không tìm thấy trong kho, thông báo rõ và gợi ý tra cứu trực tiếp Công báo.
- Không bịa đặt nội dung điều luật; chỉ trích dẫn những gì đã fetch được.
- Đây là bản số hóa tiện lợi; giá trị pháp lý chính thức thuộc bản gốc Công báo.

**Nội dung hiện có trong kho:** 11 văn bản (lĩnh vực Đấu thầu, Nhà ở và Dân sự).
Danh sách đầy đủ + đường dẫn chi mục: https://luat.dkien.com/index.md
```

---

## 5. URL Tham Khảo Nhanh

| Tài nguyên | URL |
|---|---|
| Danh mục tổng | `https://luat.dkien.com/index.md` |
| Chi mục Luật Nhà ở 2023 | `https://luat.dkien.com/luat-nha-o-2023/chi-muc.md` |
| Ví dụ file chương (Chương 5) | `https://luat.dkien.com/luat-nha-o-2023/chuong-05.md` |

**Cấu trúc URL chương:** `https://luat.dkien.com/{slug}/chuong-{NN}.md`
Trong đó `{NN}` là số chương 2 chữ số, ví dụ `01`, `02`, ..., `13`.

**Anchor điều luật:** `#dieu-{N}` — ví dụ `#dieu-34` cho Điều 34.

---

## 6. Thông Tin Văn Bản Hiện Có

### Luật Nhà ở 2023

| Thuộc tính | Giá trị |
|---|---|
| Tên đầy đủ | Luật Nhà ở năm 2023 |
| Số văn bản | 27/2023/QH15 |
| Ngày thông qua | 27/11/2023 |
| Hiệu lực | 01/01/2025 |
| Số chương | 13 |
| Số điều | 198 |
| Slug | `luat-nha-o-2023` |

### Bộ luật Dân sự 2015

| Thuộc tính | Giá trị |
|---|---|
| Tên đầy đủ | Bộ luật Dân sự năm 2015 |
| Số văn bản | 91/2015/QH13 |
| Ngày thông qua | 24/11/2015 |
| Hiệu lực | 01/01/2017 (thay thế Bộ luật Dân sự 2005 — 33/2005/QH11) |
| Cấu trúc | 6 phần, 27 chương, 689 điều |
| Số file chương | 28 (`chuong-01.md` … `chuong-28.md`; `chuong-28.md` là Phần thứ sáu — Điều khoản thi hành, không thuộc chương nào) |
| Slug | `bo-luat-dan-su-2015` |
| Chỉ mục | `chi-muc.md` (điều hướng, ~79 KB) và `chi-muc-tu-khoa.md` (cùng 689 điều + cột từ khóa, ~165 KB) |

Bộ luật này có **hai file chỉ mục** ở tầng 2 — chọn một, vẫn đủ 3 lượt fetch:
- `chi-muc.md` — mặc định: 6 phần, bảng tra 28 file chương, và đủ 689 dòng (số điều + tên điều + link).
- `chi-muc-tu-khoa.md` — khi câu hỏi dùng ngôn ngữ đời thường ("vay nặng lãi", "chia thừa kế", "chó cắn người"): cùng 689 dòng nhưng có thêm cột từ khóa.

Hai chương lớn nhất: Chương XV (Điều 274–429, quy định chung về nghĩa vụ và hợp đồng) và Chương XVI (Điều 430–569, các hợp đồng thông dụng) — file tương ứng khoảng 90–100 KB, nên fetch đúng chương thay vì tải toàn bộ.

---

## 7. Lưu Ý Quan Trọng

1. **Không bịa nội dung:** AI chỉ được trích dẫn nội dung đã thực sự fetch được từ kho. Tuyệt đối không suy đoán hay bịa nội dung điều luật.

2. **Giá trị pháp lý:** Đây là bản số hóa phục vụ tra cứu tiện lợi. Giá trị pháp lý chính thức thuộc về bản gốc đăng trên **Công báo nước Cộng hòa xã hội chủ nghĩa Việt Nam**. Khi cần sử dụng trong tố tụng hoặc văn bản chính thức, phải đối chiếu với bản Công báo.

3. **Cập nhật:** Kho có thể chưa có tất cả văn bản pháp luật. Nếu không tìm thấy văn bản cần tra trong `index.md`, thông báo rõ cho người dùng.

4. **Hiệu lực sửa đổi:** Các văn bản sửa đổi, bổ sung có thể chưa được tích hợp. Luôn kiểm tra ngày hiệu lực trong `chi-muc.md`.
