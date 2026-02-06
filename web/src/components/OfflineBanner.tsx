import { useEffect, useState } from "react";

const OfflineBanner = () => {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bg-amber-50 py-2 text-center text-xs text-amber-800">
      Mode offline: menampilkan data terakhir yang tersimpan.
    </div>
  );
};

export default OfflineBanner;
