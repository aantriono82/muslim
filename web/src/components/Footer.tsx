import { useMemo, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import {
  Facebook,
  Link as LinkIcon,
  MessageCircle,
  Send,
  Twitter,
} from "lucide-react";
import { getApiSource, subscribeApiStatus } from "../lib/api";
import Container from "./Container";

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
      className: "bg-emerald-500 text-white",
      title: "Bagikan ke WhatsApp",
      icon: MessageCircle,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      className: "bg-blue-600 text-white",
      title: "Bagikan ke Facebook",
      icon: Facebook,
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(
        shareText,
      )}`,
      className: "bg-slate-800 text-white",
      title: "Bagikan ke X",
      icon: Twitter,
    },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(
        shareText,
      )}`,
      className: "bg-sky-500 text-white",
      title: "Bagikan ke Telegram",
      icon: Send,
    },
  ];

  return (
    <footer className="safe-bottom -mt-10 [--safe-bottom-offset:4.75rem] border-t border-emerald-100 bg-white/90 pb-3 pt-3 lg:-mt-9 lg:[--safe-bottom-offset:2.5rem] lg:pb-0 lg:pt-5">
      <Container>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-textPrimary">
              Tentang
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              <span className="font-semibold text-textPrimary">MuslimKit</span>{" "}
              adalah Toolkit Muslim harian untuk kebutuhan ibadah umat.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-textPrimary">
              Kontak
            </h4>
            <p className="mt-3 text-sm text-textSecondary">
              Silakan hubungi kontak admin : aantriono82@gmail.com
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-textPrimary">
              Informasi
            </h4>
            <p className="mt-3 text-sm text-textSecondary">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-textPrimary">
              Share
            </p>
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
                    className={`grid h-10 w-10 place-items-center rounded-full shadow-sm ${item.className}`}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
              <button
                type="button"
                onClick={handleCopy}
                className="grid h-10 w-10 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700"
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
