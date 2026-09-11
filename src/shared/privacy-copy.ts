import type { Locale } from "./locale";

export interface PrivacySection {
  heading: string;
  body: string[];
}

export interface PrivacyCopy {
  title: string;
  updated: string;
  intro: string[];
  sections: PrivacySection[];
}

const CONTACT_EMAIL = "emrekucuksahin@gmail.com";

export const PRIVACY_COPY: Record<Locale, PrivacyCopy> = {
  tr: {
    title: "Gizlilik Politikası",
    updated: "Son güncelleme: 11 Eylül 2026",
    intro: [
      "News Daily, Almanya'daki en önemli haberleri günlük olarak toplayıp Türkçe ve İngilizce özetleyen bir hizmettir. Bu sayfa, hizmeti kullanırken hangi kişisel verilerin toplandığını, neden toplandığını ve haklarının neler olduğunu açıklar.",
      `Veri sorumlusu: Emre Küçükşahin (şu an ayrı bir şirket üzerinden değil, şahsen işletiliyor). Sorularınız için: ${CONTACT_EMAIL}`,
    ],
    sections: [
      {
        heading: "Hangi verileri topluyoruz",
        body: [
          "Hesap oluştururken: adın ve e-posta adresin (kimlik doğrulama sağlayıcımız Clerk üzerinden).",
          "Tercihlerin: favori haber kategorilerin, günlük özetin gönderileceği saat ve zaman dilimi.",
          "Abonelik durumun: Pro plana geçip geçmediğin ve abonelik durumu (kart bilgilerini biz değil, doğrudan Stripe işler ve saklar — bize hiç ulaşmaz).",
        ],
      },
      {
        heading: "Bu verileri neden topluyoruz",
        body: [
          "Sana kişiselleştirilmiş günlük haber özetini e-posta ile göndermek.",
          "Hesabına giriş yapmanı ve tercihlerini kaydetmeni sağlamak.",
          "Pro abonelik ödemesini işlemek (Stripe üzerinden).",
          "Yasal dayanak: hizmeti sana sunmak için gerekli olan sözleşme ilişkisi (GDPR Madde 6/1-b).",
        ],
      },
      {
        heading: "Verilerini kimlerle paylaşıyoruz",
        body: [
          "Clerk — kimlik doğrulama (giriş/kayıt).",
          "Neon — veritabanı, AB içinde (Frankfurt, Almanya) barındırılıyor.",
          "Vercel — uygulama sunucusu, AB içinde (Frankfurt, Almanya) barındırılıyor.",
          "Resend — e-posta gönderimi. Bu servis verileri ABD'de saklıyor; AB-ABD Veri Gizliliği Çerçevesi (Data Privacy Framework) ve Standart Sözleşme Hükümleri (SCC) ile yasal olarak korunuyor.",
          "Stripe — ödeme işleme. Kendi kapsamlı GDPR uyumluluk çerçevesi var.",
          "OpenAI — yalnızca haber içeriğini işler (özetleme/çeviri için); adın, e-postan ya da tercihlerin OpenAI'a hiç gönderilmez.",
          "Verilerin hiçbir zaman reklam amacıyla üçüncü taraflara satılmaz.",
        ],
      },
      {
        heading: "Ne kadar süre saklıyoruz",
        body: [
          "Hesabın aktif olduğu sürece verilerini saklarız. Hesabını silmemizi istersen, aşağıdaki iletişim adresinden bize ulaşman yeterli — verilerini makul bir süre içinde sileriz.",
        ],
      },
      {
        heading: "Haklarınız (GDPR)",
        body: [
          "Verilerine erişim isteme, düzeltme, silinmesini isteme, işlemeye itiraz etme ve verilerini taşınabilir formatta alma hakkına sahipsin.",
          `Bu hakları kullanmak için: ${CONTACT_EMAIL}`,
          "Ayrıca, bulunduğun ülkedeki veri koruma otoritesine şikayette bulunma hakkın da var.",
        ],
      },
      {
        heading: "Çerezler",
        body: [
          "Sadece oturum açık tutmak için gerekli, zorunlu kimlik doğrulama çerezleri kullanıyoruz (Clerk tarafından). Reklam veya takip amaçlı çerez/analitik kullanmıyoruz.",
        ],
      },
      {
        heading: "Değişiklikler",
        body: [
          "Bu politika zaman zaman güncellenebilir. Önemli değişikliklerde bu sayfadaki tarihi güncelleyeceğiz.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated: September 11, 2026",
    intro: [
      "News Daily collects the most important German news each day and summarizes it in Turkish and English. This page explains what personal data we collect while you use the service, why we collect it, and what rights you have.",
      `Data controller: Emre Küçükşahin (currently operated personally, not through a registered company). Questions: ${CONTACT_EMAIL}`,
    ],
    sections: [
      {
        heading: "What we collect",
        body: [
          "When you create an account: your name and email address (via our authentication provider, Clerk).",
          "Your preferences: favorite news categories, your preferred daily delivery time and time zone.",
          "Your subscription status: whether you're on the Pro plan (your card details are handled and stored directly by Stripe — they never reach us).",
        ],
      },
      {
        heading: "Why we collect it",
        body: [
          "To send you your personalized daily digest by email.",
          "To let you sign in and save your preferences.",
          "To process Pro subscription payments (via Stripe).",
          "Legal basis: performance of the contract needed to provide the service (GDPR Art. 6(1)(b)).",
        ],
      },
      {
        heading: "Who we share your data with",
        body: [
          "Clerk — authentication (sign-in/sign-up).",
          "Neon — our database, hosted in the EU (Frankfurt, Germany).",
          "Vercel — our application servers, hosted in the EU (Frankfurt, Germany).",
          "Resend — email delivery. This provider stores data in the US; transfers are covered by the EU-US Data Privacy Framework and Standard Contractual Clauses (SCCs).",
          "Stripe — payment processing, with its own comprehensive GDPR compliance framework.",
          "OpenAI — processes only news article content (for summarization/translation); your name, email, or preferences are never sent to OpenAI.",
          "We never sell your data to third parties for advertising purposes.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "We keep your data for as long as your account is active. If you'd like your account deleted, contact us at the address below and we'll delete your data within a reasonable timeframe.",
        ],
      },
      {
        heading: "Your rights (GDPR)",
        body: [
          "You have the right to access, correct, or request deletion of your data, to object to processing, and to receive your data in a portable format.",
          `To exercise these rights, contact: ${CONTACT_EMAIL}`,
          "You also have the right to lodge a complaint with your local data protection authority.",
        ],
      },
      {
        heading: "Cookies",
        body: [
          "We only use strictly necessary authentication cookies (set by Clerk) to keep you signed in. We do not use advertising or tracking/analytics cookies.",
        ],
      },
      {
        heading: "Changes",
        body: [
          "This policy may be updated from time to time. We'll update the date on this page when we make meaningful changes.",
        ],
      },
    ],
  },
};
