# Design system

## محصول
- نام: رهیار
- کار محصول: دستیار مالی شخصی برای سبد، قیمت، تخصیص، هشدار، گزارش و گفتگو
- زبان و جهت: فارسی، `dir="rtl"` روی `html`
- نوع رابط غالب: ابزار

## رنگ
روشن (`:root`):

- background: `#f3efe6`
- foreground: `#2a332e`
- card: `#fffdf8`
- primary: `#3e6b5c`
- primary-foreground: `#f6fbf8`
- secondary: `#e6eee8`
- muted: `#efe8dc`
- muted-foreground: `#6a736d`
- accent: `#e4efe8`
- border: `#e3dacb`
- line: `#e6ddd0`
- destructive: `#b55245`
- danger: `#b55245`
- ok: `#2f7d62`
- warn: `#b5812e`
- ring: `#6d9a88`
- brand-2: `#7d9a84`

تیره (پوستهٔ فعال، کلاس `dark` روی `html`):

- background: `#141816`
- foreground: `#e7eee9`
- card: `#1c221f`
- primary: `#9ec9b8`
- primary-foreground: `#14241e`
- muted-foreground: `#a8b4ad`
- destructive: `#e7a196`
- ok: `#7dcaa8`
- warn: `#e2c07a`
- danger: `#e7a196`

پس‌زمینهٔ `body` دو گرادیان شعاعی روی `--background` است. این استثنای موجود است و گسترده نمی‌شود.

## نوع
- خانواده: Vazirmatn، سپس Inter، سپس `ui-sans-serif`
- عنوان صفحه: `text-2xl` / وزن ۶۰۰
- عنوان بخش: `text-base` / وزن ۶۰۰
- بدنه: `text-sm`، خط ۱۶ تا ۲۴
- برچسب کوچک: `text-xs`
- عدد: کلاس `numeric` (`tabular-nums` و `unicode-bidi: isolate`)

## فاصله و شکل
- واحد پایه: ۴ پیکسل
- شعاع کنترل و کارت: `--radius` برابر `0.625rem`؛ کارت و پنل `radius-xl`
- قرص ناوبری: `rounded-full` فقط برای مقصدهای ناوبری
- سایهٔ مجاز: همان سایهٔ کارت در `globals.css`، کلاس `.surface`
- عرض ظرف: تمام عرض پوسته؛ ورود حداکثر `max-w-md`

## پوسته
- حالت فعال: تیره. متغیرهای روشن در `:root` می‌مانند و رندر نمی‌شوند.
- ناوبری: هدر دو ردیفه داخل ستون `h-dvh`؛ ردیف برند و خروج، بعد مقصدها. محتوا در `main` اسکرول می‌شود و هدر روی آن نمی‌افتد.
- صفحهٔ فعال: `bg-primary` و `aria-current="page"`. مسیرهای تو در تو، مثل جزئیات گزارش، همان مقصد والد را فعال می‌کنند. خانه فقط روی `/` فعال است.
- از `lg` مقصدها می‌شکنند و دیده می‌شوند. عرض کمتر، همان ردیف با اسکرول افقی است.
- فاصلهٔ محتوای اصلی: `px-4 py-6` و در `sm`/`lg` به‌ترتیب `px-6` و `px-8`. گفتگو این فاصلهٔ صفحه را ندارد و خودش ستون تمام‌قد است.
- نشانهٔ برند: مربع با حرف «ر». جایگزین تصویری ندارد.

## اجزا
- Button: گونه‌های `default`، `outline`، `secondary`، `ghost`، `destructive`، `link` در `components/ui/button.tsx`. اقدام اصلی صفحه حداقل ارتفاع ۴۴ پیکسل (`h-11`).
- Input: کلاس `.field-input`، حداقل ارتفاع ۴۴ پیکسل، برچسب دیده می‌شود.
- Card: `components/ui/card.tsx` با سایهٔ `[data-slot="card"]`
- Panel: کلاس `.surface` به‌علاوه عنوان با خط جداکننده
- Table: هدر چسبان، پس‌زمینهٔ مات، عدد با `numeric`
- Dialog: `components/ui/dialog.tsx`

## حرکت
- مدت مجاز: ۱۵۰ میلی‌ثانیه برای رنگ
- کاهش حرکت: `motion-reduce:transition-none` روی کنترل‌های تازه؛ هاور ردیف جدول در `prefers-reduced-motion` خاموش است

## ممنوع
- فونت خارج از Vazirmatn و Inter
- رنگ خارج از نقش‌های بالا
- تبدیل صفحهٔ ابزار به هیروی بازاریابی
- وابستگی بصری تازه
- سایه یا بلور تازه روی تمام صفحه
- `shadow-[...]` و شعاع دلخواه داخل `className`
