import { useMemo, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import {
  Copyright,
  Facebook,
  Heart,
  Link as LinkIcon,
  Send,
  Twitter,
} from "lucide-react";
import { getApiSource, subscribeApiStatus } from "../lib/api";
import Container from "./Container";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 32 32"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M16.57 0C7.43 0 0 7.12 0 15.92c0 2.81.75 5.56 2.17 7.97L0 32l8.35-2.14c2.3 1.22 4.92 1.86 7.63 1.86h.01c9.14 0 16.57-7.12 16.57-15.92C32.56 7.12 25.7 0 16.57 0zm8.67 23.31c-.37 1.01-2.2 1.96-3.03 2.09-.79.13-1.78.19-2.88-.18-.66-.21-1.5-.49-2.58-.96-4.54-1.95-7.5-6.5-7.73-6.81-.23-.31-1.85-2.45-1.85-4.66s1.17-3.3 1.58-3.75c.41-.45.9-.56 1.2-.56.3 0 .6 0 .86.01.28.01.65-.1 1.02.78.37.88 1.26 3.06 1.37 3.28.11.22.18.48.04.78-.14.3-.21.48-.41.74-.2.26-.43.58-.62.78-.2.2-.4.42-.17.83.23.41 1.04 1.71 2.24 2.77 1.54 1.37 2.84 1.79 3.25 2 .41.21.65.18.89-.11.24-.29 1.02-1.19 1.29-1.6.27-.41.55-.34.92-.2.37.14 2.36 1.11 2.76 1.31.4.2.66.3.76.46.1.16.1.93-.27 1.94z"
    />
  </svg>
);

const Footer = () => {
  const apiSource = useSyncExternalStore(
    subscribeApiStatus,
    getApiSource,
    getApiSource,
  );
  const sourceLabel =
    apiSource === "proxy"
      ? "Proxy (/api)"
      : apiSource === "myquran"
        ? "MyQuran"
        : apiSource === "equran"
          ? "EQuran"
          : "Belum diketahui";

  const shareUrl =
    typeof window === "undefined" ? "" : window.location.origin || "";
  const shareText = "MuslimKit - Toolkit Muslim harian";
  const shareMessage = shareUrl ? `${shareText} ${shareUrl}` : shareText;
  const encodedUrl = useMemo(() => encodeURIComponent(shareUrl), [shareUrl]);
  const encodedMessage = useMemo(
    () => encodeURIComponent(shareMessage),
    [shareMessage],
  );
  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      window.prompt("Salin tautan berikut:", shareUrl);
    }
  };

  const shareItems = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodedMessage}`,
      className: "bg-[#25D366] text-white",
      title: "Bagikan ke WhatsApp",
      icon: WhatsAppIcon,
      iconClassName: "text-white",
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      className: "bg-blue-600 text-white",
      title: "Bagikan ke Facebook",
      icon: Facebook,
      iconClassName: "text-white",
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(
        shareText,
      )}`,
      className: "bg-orange-500 text-white",
      title: "Bagikan ke X",
      icon: Twitter,
      iconClassName: "text-white",
    },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(
        shareText,
      )}`,
      className: "bg-sky-500 text-white",
      title: "Bagikan ke Telegram",
      icon: Send,
      iconClassName: "text-white",
    },
  ];

  return (
    <footer className="safe-bottom -mt-10 [--safe-bottom-offset:4.75rem] border-t border-emerald-100 bg-white/90 pb-10 pt-3 lg:-mt-9 lg:[--safe-bottom-offset:2.5rem] lg:pb-6 lg:pt-5">
      <Container>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-textPrimary transition-colors hover:text-emerald-700">
              Tentang
            </h3>
            <p className="mt-2 text-sm text-textSecondary transition-colors hover:text-emerald-700">
              <span className="font-semibold text-textPrimary">MuslimKit</span>{" "}
              adalah Toolkit Muslim harian untuk kebutuhan ibadah umat.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-textPrimary transition-colors hover:text-emerald-700">
              Kontak
            </h4>
            <p className="mt-2 text-sm text-textSecondary transition-colors hover:text-emerald-700">
              Silakan hubungi admin dengan mengirim email ke{" "}
              <a
                href="mailto:aantriono82@gmail.com"
                className="font-semibold text-emerald-700 hover:text-emerald-600"
              >
                aantriono82@gmail.com
              </a>
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-textPrimary transition-colors hover:text-emerald-700">
              Informasi
            </h4>
            <p className="mt-2 text-sm text-textSecondary transition-colors hover:text-emerald-700">
              Gunakan informasi sebagai referensi. Baca{" "}
              <Link to="/disclaimer" className="font-semibold text-emerald-700">
                Disclaimer
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="mt-2 border-t border-emerald-100 pt-2">
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="inline-flex items-center gap-1 text-xs font-semibold text-textPrimary transition-colors hover:text-emerald-700">
                <Copyright className="h-3.5 w-3.5" />
                2026 | All Right Reserved
              </p>
              <p className="inline-flex items-center gap-1 text-xs text-textSecondary transition-colors hover:text-emerald-700">
                Dibuat dengan
                <Heart className="h-3.5 w-3.5 text-red-500 fill-red-500" />
                oleh Aan Triono
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {shareItems.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    title={item.title}
                    aria-label={item.title}
                    className={`grid h-8 w-8 place-items-center rounded-full shadow-sm ${item.className}`}
                  >
                    <Icon className={`h-4 w-4 ${item.iconClassName ?? ""}`} />
                  </a>
                );
              })}
              <button
                type="button"
                onClick={handleCopy}
                className="grid h-8 w-8 place-items-center rounded-full border border-purple-500 bg-purple-600 text-white"
                title="Salin tautan"
                aria-label="Salin tautan"
              >
                <LinkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
