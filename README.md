# Stick Duel sunucusu

Bağımlılık yok, sadece Node 18+ gerekir.

    node server.js          # PORT ortam değişkeni, varsayılan 8080

## Yayına alma (Render / Railway / Fly.io gibi bir Node barındırıcı)
1. Bu klasörü bir Git deposuna koy, barındırıcıda "Web Service" olarak bağla.
2. Start komutu: `npm start`. Barındırıcı `PORT` değişkenini kendisi verir.
3. Barındırıcı sana `https://uygulama-adin.onrender.com` gibi bir adres verir.
   Oyundaki adres `wss://uygulama-adin.onrender.com` olur (https -> wss).
4. `index.html` içinde `WS_URL=''` kısmını bul ve şöyle yap: `WS_URL='wss://uygulama-adin.onrender.com'`
5. Oyunu yeniden zipleyip CrazyGames'e yükle.

Notlar
- Kupa verisi `data.json` dosyasında tutulur. Ücretsiz barındırıcılarda disk kalıcı değilse
  sunucu yeniden başlayınca kupalar sıfırlanır; kalıcı disk (volume) bağla ya da `DB_FILE` ile yolu değiştir.
- Ücretsiz planlarda sunucu uykuya dalabilir, ilk bağlantı yavaş olabilir.
- Kupa: herkese açık maçta kazanana +25, kaybedene -15. Özel odada kupa yok.
