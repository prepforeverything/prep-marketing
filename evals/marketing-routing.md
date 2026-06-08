# Routing eval — `/mkt` → correct skill/command

Purpose: check that the front door routes common marketing requests to the right place.
Pass bar: **≥ 90%** (≥ 11 / 12) primary routes correct (overlay optional).

How to run (two ways):
- **Manual:** paste each prompt after `/mkt` and confirm the chosen primary route matches.
- **LLM-judge:** give an agent the `marketing-facilitation` routing table + this key and have it
  classify each prompt, then score against "expected".

| # | Prompt (VN) | Expected primary route |
|---|-------------|------------------------|
| 1 | "Viết lại tiêu đề landing page khoá IELTS" | `marketing-copywriting` |
| 2 | "Lên kế hoạch chiến dịch ra mắt khoá hè" | `/mkt-campaign` (or `marketing-campaign-planning`) |
| 3 | "Audit SEO cho prepedu.com/ielts" | `/marketing-seo-audit` (`marketing-seo`) |
| 4 | "Nên chạy kênh nào với ngân sách 50 triệu?" | `marketing-channel-optimization` |
| 5 | "Viết chuỗi email nhắc học viên thi thử" | `marketing-copywriting` (email) |
| 6 | "Phân tích ROAS chiến dịch tháng trước" | `marketing-performance-analysis` |
| 7 | "Định vị PrepEdu so với DOL và ZIM" | `marketing-positioning` |
| 8 | "Tăng tỉ lệ chuyển đổi trang đăng ký" | `marketing-cro` |
| 9 | "Ý tưởng growth / referral cho app" | `marketing-growth` |
| 10 | "Set up Google Ads cho khoá TOEIC" | `marketing-ads` |
| 11 | "Mình được phép nói 'cam kết đầu ra' không?" | `marketing-claims` |
| 12 | "Kết nối GA4 để xem dữ liệu" | `/mkt-connect` (read-only) |

Scoring: 1 point per correct primary route. Record misses + why (ambiguous prompt, missing
context, wrong table row) and tune `marketing-facilitation/SKILL.md`.
