import type { Locale } from "./locale";
export const SITE_COPY = {
  tr: {
    signIn: "Giriş yap", signUp: "Kayıt ol", account: "Hesabım", theme: "Tema değiştir",
    footer: "Almanya’dan her sabah, Türkçe ve İngilizce özet.",
    choose: "Hangi kategorilerin özetini görmek istediğini seç.", favorites: "Favori kategoriler",
    history: "Geçmiş özetler", empty: "Henüz gösterilecek bir özet yok.",
    preferences: "Seçtiğin kategoriler, sana gönderilen günlük e-postayı ve aşağıdaki geçmiş özet listesini filtreler — ana sayfadaki günlük dijest herkese aynı şekilde gösterilir. Hiçbirini seçmezsen tüm kategorileri alırsın.",
    freeLimit: "Ücretsiz planda en fazla 1 kategori seçebilirsin.",
    save: "Kaydet", saving: "Kaydediliyor...", saved: "Kaydedildi — bir sonraki e-postandan itibaren geçerli olacak.", error: "Bir şeyler ters gitti.",
    pro: "Pro üye", free: "Ücretsiz plan", proDescription: "Tüm kategoriler ve istediğin saatte teslimat açık.",
    manage: "Üyeliğimi yönet", upgrade: "Pro’ya yükselt",
    description: "Almanya’daki en önemli haberlerin günlük Türkçe özeti.",
    privacyLink: "Gizlilik Politikası",
  },
  en: {
    signIn: "Sign in", signUp: "Sign up", account: "My Account", theme: "Toggle theme",
    footer: "German news every morning, summarized in Turkish and English.",
    choose: "Choose the categories you want to follow.", favorites: "Favorite categories",
    history: "Past digests", empty: "No digests to show yet.",
    preferences: "Your categories filter your daily email and the digest history below. Everyone sees the same daily digest on the homepage. Leave all categories unselected to receive every category.",
    freeLimit: "The Free plan allows up to 1 favorite category.",
    save: "Save", saving: "Saving...", saved: "Saved — applies from your next email.", error: "Something went wrong.",
    pro: "Pro member", free: "Free plan", proDescription: "All categories and your choice of delivery time.",
    manage: "Manage subscription", upgrade: "Upgrade to Pro",
    description: "A daily summary of the most important German news in English.",
    privacyLink: "Privacy Policy",
  },
} satisfies Record<Locale, Record<string, string>>;
