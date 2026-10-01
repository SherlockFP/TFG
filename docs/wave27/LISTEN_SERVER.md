# Oyuncunun bilgisayarında listen host

Kullanıcının son açıklaması CS2 tarzı bir akış: **Oyun kur** diyen oyuncunun
bilgisayarı oyunu yönetsin, arkadaşları ona katılsın; ayrıca VPS kurması gerekmesin.
Bu, merkezi bir oyun sunucusu isteği değildir.

Mevcut `Session` zaten bu modele sahiptir. Host tarayıcısı dünya, yaratıklar,
ekonomi, kota ve harita kararlarını çalıştırır; arkadaşlarının tarayıcıları kendi
oyuncu girdilerini iletir ve host durumunu alır. Sunucu görevi tarayıcıdaki host
oyuncuya aittir. Bu turda yeni merkezi WebSocket backend uygulanmadı.

Tarayıcı bir masaüstü oyunu gibi bilgisayarda gelen TCP/UDP bağlantıları için port
açamaz. Mevcut WebRTC bağlantısı ICE/STUN ile iki bilgisayar arasında yol bulur;
sinyalleme yalnızca oyuncuların birbirini bulmasını sağlar. Bazı NAT veya güvenlik
duvarlarında doğrudan yol kurulamadığında TURN veri rölesi gerekir. Röle kullanmak
oyun simülasyonunu röleye taşımaz: gameplay host yine **Oyun kur** diyen oyuncudur.
Yalnızca P2P adını değiştirmek veya aynı bilgisayarda socket açmak bu ağ engelini
çözmez.

Bu nedenle mevcut yön, host/join akışını koruyup bağlantı tanılamasını, doğru
strateji/oda ayarlarını ve kontrollü yeniden bağlantıyı iyileştirmektir. Wave27
network ayarları isteğe bağlı TURN yapılandırması ve bağlantı durumu sunar. Bu,
her Internet ağ çiftinin doğrulandığı veya harici bir rölenin otomatik kurulduğu
anlamına gelmez. Yakınlık sesinin canlı medya akışı da mevcut WebRTC üzerinden
devam eder; yalnızca JSON/binary mesaj taşıyan bir WebSocket rölesi bu ses akışının
yerine geçmez.

Eğer ileride gerçek gelen-port listen server istenirse yerel bir çalıştırılabilir
sunucu veya masaüstü istemcisi gerekir; tarayıcı sürümünün mevcut göreviyle aynı
özellik olarak sunulmamalıdır. Bu belge tasarım ayrımını kaydeder; yeni sunucu,
deployment veya Internet erişilebilirliği kanıtı değildir.
