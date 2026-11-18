# رهیار

دستیار مالی شخصی. Next.js (App Router) با ورود تک‌کاربره و Postgres روی Supabase.

## راه‌اندازی

1. `.env.example` را به `.env.local` کپی کنید و این سه مقدار را پر کنید:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `ALLOWED_USER_EMAIL` (همان ایمیلی که در مرحلهٔ بعد می‌سازید)
2. migration را اجرا کنید (پایین).
3. در داشبورد Supabase ثبت‌نام عمومی را خاموش کنید: Authentication → Sign In / Providers → Email → غیرفعال کردن Allow new users to sign up.
4. همان‌جا فقط یک کاربر بسازید: Authentication → Users → Add user. گزینهٔ Auto Confirm را روشن بگذارید.
5. اگر بعداً رمز یک‌بارمصرف می‌خواهید، Authentication → Multi-Factor → TOTP را فعال کنید. صفحهٔ «امنیت» داخل برنامه همان عامل را ثبت می‌کند.
6. `npm run dev`

کلید `service_role` را در محیط مرورگر نگذارید. این برنامه با کلید عمومی و نشست کاربر کار می‌کند و دسترسی را Row Level Security محدود می‌کند.

## اجرای migration

فایل:

`supabase/migrations/20260927134917_init_finance_schema.sql`

و برای ارزش دستی سبد:

`supabase/migrations/20260927163410_add_asset_manual_value.sql`

این دو فایل را یک‌بار اجرا کنید. فایل اول جدول‌ها، RLS، تریگر تک‌کاربره و تابع `replace_allocation` را می‌سازد. فایل دوم ستون ارزش دستی را به دارایی‌ها اضافه می‌کند. `db push` هر دو را به ترتیب اعمال می‌کند.

### روش ترجیحی: CLI، با تاریخچهٔ migration

از ریشهٔ پروژه:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

`project-ref` همان شناسهٔ کوتاه در URL پروژه است (`https://supabase.com/dashboard/project/<project-ref>`).

`db push` همین فایل را روی پایگاه راه دور اجرا می‌کند و در جدول تاریخچه ثبت می‌کند. دوباره اجرا کردنش لازم نیست.

### روش جایگزین: SQL Editor

1. Supabase Dashboard → SQL Editor → New query
2. محتوای فایل migration را بچسبانید و Run کنید.

اگر بعداً `db push` هم بزنید، همان فایل دوباره اجرا می‌شود و به‌خاطر وجود جدول‌ها خطا می‌دهد. در آن حالت تاریخچه را با نسخهٔ همین فایل هم‌تراز کنید:

```bash
npx supabase migration repair 20260927134917 --status applied --linked
```

`config.toml` فقط برای Supabase محلی است (`npx supabase start`). خاموش بودن ثبت‌نام در آن فایل، پروژهٔ میزبانی‌شده را عوض نمی‌کند؛ آن را در داشبورد هم خاموش کنید. تریگر دیتابیس در هر دو حالت جلوی ساخت کاربر دوم را می‌گیرد.
