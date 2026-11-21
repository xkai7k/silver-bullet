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

## التشغيل
1. نزّل الملفات (Code ← Download ZIP) وفكها.
2. افتح **Start.bat**. أول مرة يطلب Node.js لو ما كان عندك، وينزّل الباقي.
3. البرنامج يثبّت نفسه، ويحط اختصار **Silver Bullet** على سطح المكتب وقائمة ابدأ.

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
