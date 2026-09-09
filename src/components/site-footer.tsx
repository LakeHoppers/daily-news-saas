export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} News Daily</span>
        <span>Almanya&apos;dan her sabah, Türkçe ve İngilizce özet.</span>
      </div>
    </footer>
  );
}
