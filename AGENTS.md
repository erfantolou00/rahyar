<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# رهیار

دستیار مالی شخصی، تک‌کاربر، فارسی و راست‌به‌چپ. Next.js ۱۶٫۳، React ۱۹، Supabase با RLS، Vitest. کاربر سعید است و مستقیم در کد کار می‌کند. پاسخ به او فارسی باشد.

تا وقتی خودش نخواسته commit یا push نکن. در PowerShell از `&&` استفاده نکن. راز را در کد و در فایل نمونه نگذار.

## مرزهایی که عوض نمی‌شوند

- فقط ایمیل `ALLOWED_USER_EMAIL` وارد می‌شود. ثبت‌نام عمومی خاموش است. مرورگر کلید عمومی Supabase را می‌بیند، نه `SUPABASE_SECRET_KEY`.
- موجودی و میانگین خرید سهام، صندوق، طلا، سکه، دلار، رمزارز و وجه نقد فقط با `post_transaction` عوض می‌شود. مسیرش دفتر است، نه به‌روزرسانی مستقیم `quantity`.
- گزارش بنیادی سفارش نمی‌سازد. پیشنهاد FIS را در دفتر ننویس، مگر کاربر همان معامله را صریحاً تأیید کرده باشد.
- شناسهٔ کالیبراسیون `rahyar-fis-proposal-2026-10-21` است. باندهای امتیاز، آستانهٔ ۶۰ برای ورود، ۴۵ برای نگهداری، و نسبت ۱٫۵ و ۳ روی نرخ اخزا را بی‌درخواست عوض نکن. شرح در `docs/fis-stock-system.txt`.
- خانهٔ خالی فرم دستی یعنی «از منبع بخوان». مقدار پر شده فقط همان قلم را عوض می‌کند. مبلغ صورت میلیون ریال است. قیمت و سود هر سهم ریال است.
- اگر منبع گزارش `rahavard` باشد از رهاورد بخوان. اگر `codal` باشد از کدال. بی‌صدا به منبع دیگر برنگرد.
- طلا، سکه، دلار، صندوق، رمزارز، مسکن و وام داخل FIS نیستند.
- گفتگو فقط عددهایی را بگوید که از سبد و گزارش ذخیره‌شده آمده‌اند.

## نقشه

| جا | محتوا |
| --- | --- |
| `app/(dashboard)` | نمای کلی، سبد، گزارش، گفتگو، قیمت، تخصیص، هشدار، امنیت |
| `app/api/cron` | قیمت، کدال، گزارش هفتگی، کلان. همه با `CRON_SECRET` |
| `app/api/chat` و `app/api/reports/interpret` | GapGPT |
| `lib/finance/ledger.ts` | فراخوانی دفتر |
| `lib/finance/fis.ts` و `fis-observe.ts` و `publish-fis.ts` | امتیاز و ساخت گزارش |
| `lib/finance/fis-manual.ts` | خواندن فرم و پوشاندن عددها |
| `lib/finance/codal` | جستجو، دریافت و خواندن نامه |
| `lib/finance/rahavard/statements.ts` | صورت سود و زیان و ترازنامهٔ رهاورد |
| `lib/finance/prices` | خوراک قیمت، از جمله `rahavard.ts` |
| `lib/supabase` | نشست، سرور، نوع‌های پایگاه |
| `supabase/migrations` | طرح، به ترتیب نام فایل |
| `components` | رابط. فرم گزارش در `fis-manual-form.tsx` و نمایش در `fis-report-view.tsx` |

نشست در `lib/supabase/auth.ts` با `getClaims` ساخته می‌شود و اگر رمز یک‌بارمصرف لازم باشد تا تمام شدنش جلوتر نمی‌رود. دروازهٔ مسیر `proxy.ts` است.

## پایگاه

migration تازه فایل جدید در `supabase/migrations` است. فایل قدیمی را بازنویسی نکن. بعد از تغییر طرح، نوع را در `lib/supabase/database.types.ts` هم بیاور. `stock_fundamentals.manual_sheet` از `20261021223000_stock_manual_sheet.sql` می‌آید. upsert هم‌گام‌سازی کدال این ستون را نفرستد تا فرم ذخیره‌شده پاک نشود.

گزارش هفتگی نوع `weekly` است، تصویر دفتر نوع `event`، و گزارش بنیادی نوع `period`.

## صورت مالی

کدال: جستجو به تفکیک ن-۱۰، ن-۳۰ و نامهٔ سود تقسیمی، نه فقط صفحهٔ اول. نامهٔ شرکت فرعی و توضیحات کنار می‌روند. اصلاحیه با شمارهٔ پیگیری بالاتر می‌ماند. جدول سود و زیان باید هم فروش داشته باشد هم سود خالص. یک نامهٔ ناخوانا گزارش را ۵۰۰ نمی‌کند و صورت آخر با صورت قدیمی‌تر عوض نمی‌شود.

رهاورد: `profitloss` و `balancesheets`. اصلاحیه با تاریخ اعلام جدیدتر، و ردیف جاافتاده از نسخهٔ قبلی همان دوره، با هم ادغام می‌شوند. ریال به میلیون ریال تبدیل می‌شود. سود هر سهم از سود خالص و سرمایه با ارزش اسمی ۱۰۰۰ ریال است. رشد فروش از همان طول دوره در سال مالی قبل است.

## قیمت و زمان‌بند

ساعت‌های `vercel.json` به UTC هستند. بازار شنبه تا چهارشنبه است. شکل پاسخ بیرونی اگر عوض شد `MarketShapeError` یا `CodalShapeError` بده و خوراک بعدی را امتحان کن. آزمون واحد به شبکه نزند.

## رابط

متن رابط فارسی است. عددها کلاس `numeric` و جهت چپ‌به‌راست دارند. بعد از تغییر رفتار قابل‌دیدن، همان جریان را در مرورگر طی کن: کلیک، پر کردن، ثبت، و صفحه‌ای که همان داده را جای دیگر نشان می‌دهد. ظاهر تنها کافی نیست.

## آزمون

`npx vitest run` روی فایل همان تغییر. الگوی آزمون کنار ماژول است، مثل `lib/finance/fis.test.ts`.
