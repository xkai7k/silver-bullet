# Silver Bullet

لانشر ألعاب ووسائط لويندوز، بالعربي. تفتحه أول مرة وهو يجهّز نفسه على جهازك.

A Windows launcher for games and media, in Arabic. On first start it sets itself up for *your* PC.

## وش يسوي أول ما تشغّله
- **الألعاب:** يجيب ألعابك المثبتة من كل المتاجر (Steam، Epic، Rockstar، Ubisoft، EA، Battle.net، GOG، Riot، Xbox)، واللي عندك بس مو مثبتة تنحط في "مكتبتي".
- **المحاكيات:** ينزّل المحاكيات المعروفة من مواقعها الرسمية (RetroArch، DuckStation، PCSX2، RPCS3، PPSSPP، Dolphin، Cemu، Ryujinx، Azahar، xemu، Xenia…)، ويضبطها لحاله لليد، ولأحسن جودة يتحملها كرت شاشتك.
- **التورنت:** تحط ملف تورنت لعبة، وهو يحمّلها ويفكها ويحوّل صيغتها ويضيفها للألعاب جاهزة.
- **المشاهدة:** YouTube، Netflix، Disney+، شاهد، Prime Video، OSN+، Crunchyroll، Twitch.
- **التطبيقات:** برامجك (ديسكورد، OBS، أوفرولف…) والمتاجر.
- **سبوتيفاي:** تسجّل دخولك في سبوتيفاي حقك.
- **أكاي:** مساعد صوتي، تناديه باسمه وتعطيه أمر.

## التحميل
ملف واحد فيه كل شيء، ما يحتاج Node.js ولا تحميل ثاني (يناسب النت البطيء):
**[⬇️ Silver-Bullet-Ready.zip](https://github.com/xkai7k/silver-bullet/releases/latest/download/Silver-Bullet-Ready.zip)**
1. فك الضغط (كليك يمين ← Extract All).
2. افتح **Silver Bullet.exe**. يثبّت نفسه ويحط اختصار على سطح المكتب، وبعدها تقدر تحذف المجلد.
3. لو طلع "Windows protected your PC": اضغط **More info** ← **Run anyway**.

بعدها يحدّث نفسه لحاله من هنا، ما تحتاج تنزّله مرة ثانية.

## الجوال
من الإعدادات ← الجوال: صوّر الباركود، وتتحكم من جوالك (تشغّل ألعاب، مسلسلاتك، الأغاني، التحميلات، لقطاتك، وشكل أكاي). ما يحتاج تطبيق: صفحة في المتصفح، وتقدر تضيفها للشاشة الرئيسية. وفيه خيار "من أي مكان" لو كنت برا البيت.

## اللي ما ينزل مع البرنامج (لازم يكون منك)
ملفات البايوس (BIOS) ومفاتيح السويتش (prod.keys) والفيرموير ملك الشركات، فما تنحط هنا. تطلعها من أجهزتك وتحطها في مجلد `bios` جنب البرنامج، وهو يوزعها في أماكنها.

## Build / run (dev)
```
npm install
npm start          # normal
npm run test-copy  # side-by-side copy with its own data, never installs itself
```
Emulators are downloaded from their official releases at first start; none are bundled here.
Licensed MIT (see the `qr/` folder for the QR code library's own license).
